// src/flujos/IA/flowIAinfo.mjs
import 'dotenv/config'
import { addKeyword, EVENTS } from '@builderbot/bot'
import { ActualizarContacto } from '../../config/contactos.mjs'
import { CONTACTOS, BOT } from '../../config/bot.mjs'
import { ENUM_IA_RESPUESTAS } from '../../APIs/OpenAi/IAEnumRespuestas.mjs'
import { AgruparMensaje } from '../../funciones/agruparMensajes.mjs'
import { Escribiendo } from '../../funciones/proveedor.mjs'
import { Esperar } from '../../funciones/tiempo.mjs'
import { ENUNGUIONES } from '../../APIs/OpenAi/guiones.mjs'
import { ComprobrarListaNegra } from '../../config/listaNegra.mjs'
import { reset, idleFlow } from '../idle.mjs'
import { DetectarArchivos } from '../bloques/detectarArchivos.mjs'
import { EnviarImagenes } from '../bloques/enviarMedia.mjs'
import { EnviarIA } from '../bloques/enviarIA.mjs'
import { cargarProductosAlState } from '../../funciones/helpers/cacheProductos.mjs'
import { filtrarPorTextoLibre } from '../../funciones/helpers/filtrarPorTextoLibre.mjs'
import { generarContextoProductosIA } from '../../funciones/helpers/generarContextoProductosIA.mjs'
import { flowProductos } from '../flowProductos.mjs'
import { flowDetallesProducto } from '../flowDetallesProducto.mjs'

import { ActualizarFechasContacto, ActualizarResumenUltimaConversacion } from '../../funciones/helpers/contactosSheetHelper.mjs'
import { extraerDatosContactoIA } from '../../funciones/helpers/extractDatosIA.mjs'
import { generarResumenConversacionIA } from '../../funciones/helpers/generarResumenConversacion.mjs'
import { esMensajeRelacionadoAProducto } from '../../funciones/helpers/detectorProductos.mjs'
import { obtenerIntencionConsulta } from '../../funciones/helpers/obtenerIntencionConsulta.mjs'

export const flowIAinfo = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, tools) => {
    const { flowDynamic, endFlow, gotoFlow, provider, state } = tools
    const phone = ctx.from.split('@')[0]
    const contacto = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone)

    console.log('📩 [IAINFO] Mensaje recibido de:', phone)
    if (!BOT.RESPONDER_NUEVOS && !contacto) return endFlow()
    if (!contacto) {
      await ActualizarContacto(phone, { nombre: 'Sin Nombre', resp_bot: 'Sí', etiqueta: 'Nuevo' })
      console.log('👤 [IAINFO] Contacto nuevo registrado:', phone)
    }

    if (contacto) await ActualizarFechasContacto(contacto, phone)

    if (!state.get('_productosFull')?.length) {
      await cargarProductosAlState(state)
      await state.update({ __productosCargados: true })
      console.log('📦 [IAINFO] Productos cargados en cache para:', phone)
    }

    const detectar = await DetectarArchivos(ctx, state)
    AgruparMensaje(detectar, async (txt) => {
      Escribiendo(ctx)

      const productoReconocido = state.get('productoReconocidoPorIA') || ''
      const textoFinal = productoReconocido ? `${txt} ${productoReconocido}` : txt

      console.log('🧾 [IAINFO] Texto agrupado final del usuario:', textoFinal)

      const productos = await obtenerProductosCorrectos(textoFinal, state)
      await state.update({ productoReconocidoPorIA: '' }) // limpieza

      const promptExtra = productos.length ? generarContextoProductosIA(productos, state) : ''

      if (productos.length) {
        await state.update({ productosUltimaSugerencia: productos })
        console.log(`📦 [IAINFO] ${productos.length} productos encontrados y asociados al mensaje.`)
      }

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: contacto || {}
      }

      const res = await EnviarIA(txt, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
      }, estado)

      console.log('📥 [IAINFO] Respuesta completa recibida de IA:', res?.respuesta)

      const datosExtraidos = await extraerDatosContactoIA(txt, phone)
      const resumen = await generarResumenConversacionIA(txt, phone)
      if (Object.keys(datosExtraidos).length > 0) {
        await ActualizarContacto(phone, datosExtraidos)
        console.log('📇 [IAINFO] Datos de contacto actualizados:', datosExtraidos)
      }
      if (resumen) {
        await ActualizarResumenUltimaConversacion(contacto, phone, resumen)
        console.log('📝 [IAINFO] Resumen de conversación guardado.')
      }

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt)
    })
  })

  .addAction({ capture: true }, async (ctx, tools) => {
    const { flowDynamic, endFlow, gotoFlow, provider, state } = tools
    const phone = ctx.from.split('@')[0]
    const message = ctx.body.trim()
    const contacto = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone) || {}
    const datos = {}

    if (/me llamo|mi nombre es/i.test(message)) {
      const nombre = message.split(/me llamo|mi nombre es/i)[1]?.trim()
      if (nombre && !/\d/.test(nombre)) datos.nombre = nombre
    }

    const email = message.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
    if (email) datos.email = email[0]

    if (contacto) await ActualizarFechasContacto(contacto, phone)

    if (!state.get('_productosFull')?.length) {
      await cargarProductosAlState(state)
      await state.update({ __productosCargados: true })
    }

    const detectar = await DetectarArchivos(ctx, state)
    AgruparMensaje(detectar, async (txt) => {
      if (ComprobrarListaNegra(ctx) || !BOT.ESTADO) return gotoFlow(idleFlow)
      reset(ctx, gotoFlow, BOT.IDLE_TIME * 60)
      Escribiendo(ctx)

      const productoReconocido = state.get('productoReconocidoPorIA') || ''
      const textoFinal = productoReconocido ? `${txt} ${productoReconocido}` : txt

      console.log('✏️ [IAINFO] Mensaje capturado en continuación de conversación:', textoFinal)

      const productos = await obtenerProductosCorrectos(textoFinal, state)
      await state.update({ productoReconocidoPorIA: '' }) // limpieza

      const promptExtra = productos.length ? generarContextoProductosIA(productos, state) : ''

      if (productos.length) {
        await state.update({ productosUltimaSugerencia: productos })
      }

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: { ...contacto, ...datos }
      }

      const res = await EnviarIA(txt, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
      }, estado)

      const datosExtraidos = await extraerDatosContactoIA(txt, phone)
      const datosCombinados = { ...datos, ...datosExtraidos }
      if (Object.keys(datosCombinados).length > 0) {
        await ActualizarContacto(phone, datosCombinados)
      }

      const resumen = await generarResumenConversacionIA(txt, phone)
      if (resumen) {
        await ActualizarResumenUltimaConversacion(contacto, phone, resumen)
      }

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt)
    })

    return tools.fallBack()
  })

// (las funciones manejarRespuestaIA, Responder, obtenerProductosCorrectos y esAclaracionSobreUltimaSugerencia se mantienen idénticas, sin cambios)
