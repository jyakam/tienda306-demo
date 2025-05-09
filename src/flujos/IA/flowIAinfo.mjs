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
    const tipoMensaje = state.get('tipoMensaje')

    AgruparMensaje(detectar, async (txt) => {
      Escribiendo(ctx)

      let textoFinal = txt
      let productos = []
      let promptExtra = ''

      // Procesar imagen primero si es un mensaje de imagen
      if (tipoMensaje === 1) {
        console.log('📸 [IAINFO] Procesando imagen antes de la búsqueda...')
        const estado = {
          esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
          contacto: contacto || {}
        }

        // Procesar imagen con IA para extraer producto
        console.log('🔍 [DEBUG] Llamando a EnviarIA para procesar imagen...')
        const resIA = await EnviarIA(txt, ENUNGUIONES.INFO, {
          ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
        }, estado)
        console.log('🔍 [DEBUG] EnviarIA completado, respuesta:', resIA?.respuesta)

        const productoReconocido = state.get('productoReconocidoPorIA') || ''
        console.log('🔍 [DEBUG] productoReconocidoPorIA obtenido después de EnviarIA:', productoReconocido)

        // Combinar caption con producto reconocido
        if (productoReconocido) {
          textoFinal = `${txt} ${productoReconocido}`
        }
        console.log('🧾 [IAINFO] Texto agrupado final para intención:', textoFinal)

        // Verificar intención de consulta con el texto combinado
        console.log('🔍 [DEBUG] Texto enviado a obtenerIntencionConsulta:', textoFinal)
        const { esConsultaProductos } = await obtenerIntencionConsulta(textoFinal, state.get('ultimaConsulta') || '')
        console.log('📡 [IAINFO] Resultado de obtenerIntencionConsulta:', { esConsultaProductos })

        // Procesar según intención
        if (esConsultaProductos || productoReconocido) {
          console.log('🔍 [IAINFO] Intención de producto detectada para imagen.')
          console.log('🔍 [DEBUG] textoFinal antes de obtenerProductosCorrectos:', textoFinal)
          productos = await obtenerProductosCorrectos(textoFinal, state)
          if (productos.length) {
            await state.update({ productosUltimaSugerencia: productos })
            promptExtra = generarContextoProductosIA(productos, state)
            console.log(`📦 [IAINFO] ${productos.length} productos encontrados para textoFinal:`, textoFinal)
          }
          // Reprocesar respuesta de IA con contexto de productos
          const resIAConProductos = await EnviarIA(textoFinal, ENUNGUIONES.INFO, {
            ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
          }, estado)
          await manejarRespuestaIA(resIAConProductos, ctx, flowDynamic, gotoFlow, state, textoFinal)
        } else {
          console.log('🚫 [IAINFO] Imagen no relacionada con productos, procesando respuesta normal.')
          await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, textoFinal)
        }

        // Actualizar datos de contacto y resumen
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

        await state.update({ productoReconocidoPorIA: '' })
        console.log('🧹 [IAINFO] productoReconocidoPorIA limpiado al final del proceso.')
        return
      }

      // Flujo original para mensajes de texto
      const productoReconocido = state.get('productoReconocidoPorIA') || ''
      textoFinal = productoReconocido ? `${txt} ${productoReconocido}` : txt
      console.log('🔍 [DEBUG] productoReconocidoPorIA usado en búsqueda:', productoReconocido)

      console.log('🧾 [IAINFO] Texto agrupado final del usuario:', textoFinal)

      productos = await obtenerProductosCorrectos(textoFinal, state)
      
      promptExtra = productos.length ? generarContextoProductosIA(productos, state) : ''

      if (productos.length) {
        await state.update({ productosUltimaSugerencia: productos })
        console.log(`📦 [IAINFO] ${productos.length} productos encontrados y asociados al mensaje.`)
      }

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: contacto || {}
      }

      const res = await EnviarIA(textoFinal, ENUNGUIONES.INFO, {
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

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, textoFinal)
      await state.update({ productoReconocidoPorIA: '' })
      console.log('🧹 [IAINFO] productoReconocidoPorIA limpiado al final del proceso.')
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
      console.log('🔍 [DEBUG] productoReconocidoPorIA usado en búsqueda:', productoReconocido)

      console.log('✏️ [IAINFO] Mensaje capturado en continuación de conversación:', textoFinal)

      const productos = await obtenerProductosCorrectos(textoFinal, state)
      await state.update({ productoReconocidoPorIA: '' })

      const promptExtra = productos.length ? generarContextoProductosIA(productos, state) : ''

      if (productos.length) {
        await state.update({ productosUltimaSugerencia: productos })
      }

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: { ...contacto, ...datos }
      }

      const res = await EnviarIA(textoFinal, ENUNGUIONES.INFO, {
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

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, textoFinal)
      await state.update({ productoReconocidoPorIA: '' })
      console.log('🧹 [IAINFO] productoReconocidoPorIA limpiado al final del proceso.')
    })

    return tools.fallBack()
  })

async function manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt) {
  const respuestaIA = res.respuesta?.toLowerCase?.() || ''
  console.log('🧠 Token recibido de IA:', respuestaIA)

  if (respuestaIA.includes('🧩 mostrarproductos')) {
    await state.update({ ultimaConsulta: txt })
    return gotoFlow(flowProductos)
  }

  if (respuestaIA.includes('🧩 mostrardetalles')) {
    return gotoFlow(flowDetallesProducto)
  }

  if (respuestaIA.includes('🧩 solicitarayuda')) {
    return gotoFlow(flowProductos)
  }

  await Responder(res, ctx, flowDynamic, state)
}

async function Responder(res, ctx, flowDynamic, state) {
  if (res.tipo === ENUM_IA_RESPUESTAS.TEXTO && res.respuesta) {
    await Esperar(BOT.DELAY)

    const yaRespondido = state.get('ultimaRespuestaSimple') || ''
    const nuevaRespuesta = res.respuesta.toLowerCase().trim()

    if (nuevaRespuesta && nuevaRespuesta === yaRespondido) {
      console.log('⚡ Respuesta ya fue enviada antes, evitando repetición.')
      return
    }

    await state.update({ ultimaRespuestaSimple: nuevaRespuesta })

    const msj = await EnviarImagenes(res.respuesta, flowDynamic, ctx)
    return await flowDynamic(msj)
  }
}

async function obtenerProductosCorrectos(texto, state) {
  const sugeridos = state.get('productosUltimaSugerencia') || []
  const productoReconocido = state.get('productoReconocidoPorIA') || ''
  console.log('🔍 [DEBUG] productoReconocidoPorIA en obtenerProductosCorrectos:', productoReconocido)
  console.log('🔍 [DEBUG] Texto recibido en obtenerProductosCorrectos:', texto)

  // Usar texto directamente, ya incluye productoReconocidoPorIA
  const textoBusqueda = texto
  console.log('🔍 [DEBUG] textoBusqueda para filtrarPorTextoLibre:', textoBusqueda)

  if (await esAclaracionSobreUltimaSugerencia(texto, state) && sugeridos.length) {
    console.log('🔍 [IAINFO] Aclaración sobre producto sugerido anteriormente.')
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (aclaración):', textoBusqueda)
    return filtrarPorTextoLibre(sugeridos, textoBusqueda, state)
  }

  if (await esMensajeRelacionadoAProducto(texto, state) || productoReconocido) {
    console.log('🔍 [IAINFO] Producto detectado con contexto dinámico o producto reconocido.')
    const productosFull = state.get('_productosFull') || []
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (contexto dinámico):', textoBusqueda)
    return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
  }

  const { esConsultaProductos } = await obtenerIntencionConsulta(texto, state.get('ultimaConsulta') || '')
  if (esConsultaProductos) {
    console.log('🔍 [IAINFO] Intención de producto detectada vía OpenAI.')
    const productosFull = state.get('_productosFull') || []
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (OpenAI):', textoBusqueda)
    return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
  }

  console.log('🚫 [IAINFO] No se detectó relación con productos.')
  return []
}

async function esAclaracionSobreUltimaSugerencia(texto = '', state) {
  const patronesFijos = /(talla|color|precio|disponible|modelo|envío|cuánto|sirve|cómo|ingredientes|combinación|me conviene|me ayuda|es bueno|es mejor|cuál|por qué|se aplica|modo|efecto|lo uso|día|noche|se mezcla|sirve si)/i
  if (patronesFijos.test(texto)) return true

  const ultimaConsulta = (state.get('ultimaConsulta') || '').toLowerCase()
  const textoLower = texto.toLowerCase()
  return ultimaConsulta && textoLower.length <= 12 && !textoLower.includes('hola') && textoLower.length >= 3
}
