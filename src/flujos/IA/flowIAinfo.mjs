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
import { ActualizarFechasContacto } from '../../funciones/helpers/contactosSheetHelper.mjs'
import { extraerDatosContactoIA } from '../../funciones/helpers/extractDatosIA.mjs'
import { obtenerIntencionConsulta } from '../../funciones/helpers/obtenerIntencionConsulta.mjs'
import { flowIAImagen } from './flowIAImagen.mjs'

console.log('🚀 [IAINFO] Cargando flowIAinfo.mjs...')

// Función para limpiar productoReconocidoPorIA
async function limpiarProductoReconocido(state) {
  await state.update({ productoReconocidoPorIA: '' })
  console.log('🧹 [IAINFO] productoReconocidoPorIA limpiado.')
}

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

    // Detectar archivos
    const detectar = await DetectarArchivos(ctx, state)
    await Esperar(100)
    const tipoMensaje = state.get('tipoMensaje')
    console.log('🔍 [IAINFO] Valor de tipoMensaje obtenido:', tipoMensaje)
    console.log('🔍 [IAINFO] Estado después de DetectarArchivos:', {
      tipoMensaje,
      productoReconocidoPorIA: state.get('productoReconocidoPorIA'),
      archivos: state.get('archivos')
    })

    // Manejar imágenes
    if (tipoMensaje === 1) {
      console.log('📸 [IAINFO] Imagen detectada, verificando intención...')
      const { esConsultaProductos } = await obtenerIntencionConsulta(ctx.body, state.get('ultimaConsulta') || '')
      console.log('📡 [IAINFO] Resultado de obtenerIntencionConsulta:', { esConsultaProductos })

      if (esConsultaProductos) {
        console.log('🔍 [IAINFO] Imagen relacionada con productos, redirigiendo a flowIAImagen.')
        return gotoFlow(flowIAImagen)
      }

      console.log('📸 [IAINFO] Imagen no relacionada con productos, procesando en flowIAinfo...')
      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: contacto || {}
      }

      const resIA = await EnviarIA(ctx.body, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra: ''
      }, estado)
      console.log('🔍 [DEBUG] EnviarIA completado, respuesta:', resIA?.respuesta)

      await limpiarProductoReconocido(state) // Limpiar inmediatamente
      await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, ctx.body)

      const datosExtraidos = await extraerDatosContactoIA(ctx.body, phone)
      if (Object.keys(datosExtraidos).length > 0) {
        await ActualizarContacto(phone, datosExtraidos)
        console.log('📇 [IAINFO] Datos de contacto actualizados:', datosExtraidos)
      }

      return
    }

    // Flujo para mensajes de texto
    console.log('📝 [IAINFO] Procesando mensaje de texto...')
    AgruparMensaje(detectar, async (txt) => {
      Escribiendo(ctx)
      console.log('🧾 [IAINFO] Texto agrupado final del usuario:', txt)

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: contacto || {}
      }

      // Verificar si es consulta de productos
      const { esConsultaProductos } = await obtenerIntencionConsulta(txt, state.get('ultimaConsulta') || '')
      console.log('📡 [IAINFO] Resultado de obtenerIntencionConsulta para texto:', { esConsultaProductos })

      let promptExtra = ''
      if (esConsultaProductos) {
        console.log('🔍 [IAINFO] Consulta de productos detectada, cargando productos...')
        if (!state.get('_productosFull')?.length) {
          await cargarProductosAlState(state)
          await state.update({ __productosCargados: true })
        }
        const productos = await obtenerProductosCorrectos(txt, state)
        if (productos.length) {
          await state.update({ productosUltimaSugerencia: productos })
          promptExtra = generarContextoProductosIA(productos, state)
          console.log(`📦 [IAINFO] ${productos.length} productos encontrados y asociados al mensaje.`)
        }
      } else {
        console.log('📝 [IAINFO] Consulta no relacionada con productos, procesando normalmente...')
      }

      console.log('📤 [IAINFO] Enviando texto a IA con promptExtra:', !!promptExtra)
      const res = await EnviarIA(txt, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
      }, estado)
      console.log('📥 [IAINFO] Respuesta completa recibida de IA:', res?.respuesta)

      const datosExtraidos = await extraerDatosContactoIA(txt, phone)
      if (Object.keys(datosExtraidos).length > 0) {
        await ActualizarContacto(phone, datosExtraidos)
        console.log('📇 [IAINFO] Datos de contacto actualizados:', datosExtraidos)
      }

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt)
      await limpiarProductoReconocido(state)
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

    const detectar = await DetectarArchivos(ctx, state)
    console.log('🔍 [IAINFO] Después de DetectarArchivos (segundo addAction):', {
      tipoMensaje: state.get('tipoMensaje'),
      productoReconocidoPorIA: state.get('productoReconocidoPorIA')
    })

    if (state.get('tipoMensaje') === 1) {
      console.log('📸 [IAINFO] Imagen detectada en segundo addAction, verificando intención...')
      const { esConsultaProductos } = await obtenerIntencionConsulta(ctx.body, state.get('ultimaConsulta') || '')
      console.log('📡 [IAINFO] Resultado de obtenerIntencionConsulta:', { esConsultaProductos })

      if (esConsultaProductos) {
        console.log('🔍 [IAINFO] Imagen relacionada con productos, redirigiendo a flowIAImagen.')
        return gotoFlow(flowIAImagen)
      }

      console.log('📸 [IAINFO] Imagen no relacionada con productos, procesando en flowIAinfo...')
      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: contacto || {}
      }

      const resIA = await EnviarIA(ctx.body, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra: ''
      }, estado)
      console.log('🔍 [DEBUG] EnviarIA completado, respuesta:', resIA?.respuesta)

      await limpiarProductoReconocido(state) // Limpiar inmediatamente
      await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, ctx.body)

      const datosExtraidos = await extraerDatosContactoIA(ctx.body, phone)
      if (Object.keys(datosExtraidos).length > 0) {
        await ActualizarContacto(phone, datosExtraidos)
        console.log('📇 [IAINFO] Datos de contacto actualizados:', datosExtraidos)
      }

      return
    }

    AgruparMensaje(detectar, async (txt) => {
      if (ComprobrarListaNegra(ctx) || !BOT.ESTADO) return gotoFlow(idleFlow)
      reset(ctx, gotoFlow, BOT.IDLE_TIME * 60)
      Escribiendo(ctx)

      console.log('✏️ [IAINFO] Mensaje capturado en continuación de conversación:', txt)

      const estado = {
        esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
        contacto: { ...contacto, ...datos }
      }

      // Verificar si es consulta de productos
      const { esConsultaProductos } = await obtenerIntencionConsulta(txt, state.get('ultimaConsulta') || '')
      console.log('📡 [IAINFO] Resultado de obtenerIntencionConsulta para texto (segundo addAction):', { esConsultaProductos })

      let promptExtra = ''
      if (esConsultaProductos) {
        console.log('🔍 [IAINFO] Consulta de productos detectada, cargando productos...')
        if (!state.get('_productosFull')?.length) {
          await cargarProductosAlState(state)
          await state.update({ __productosCargados: true })
        }
        const productos = await obtenerProductosCorrectos(txt, state)
        if (productos.length) {
          await state.update({ productosUltimaSugerencia: productos })
          promptExtra = generarContextoProductosIA(productos, state)
        }
      } else {
        console.log('📝 [IAINFO] Consulta no relacionada con productos, procesando normalmente...')
      }

      console.log('📤 [IAINFO] Enviando texto a IA con promptExtra:', !!promptExtra)
      const res = await EnviarIA(txt, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
      }, estado)
      console.log('📥 [IAINFO] Respuesta completa recibida de IA:', res?.respuesta)

      const datosExtraidos = await extraerDatosContactoIA(txt, phone)
      const datosCombinados = { ...datos, ...datosExtraidos }
      if (Object.keys(datosCombinados).length > 0) {
        await ActualizarContacto(phone, datosCombinados)
      }

      await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt)
      await limpiarProductoReconocido(state)
    })

    return tools.fallBack()
  })

async function manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state) {
  console.log('🔍 [IAINFO] Iniciando manejarRespuestaIA, respuesta recibida:', res?.respuesta)
  const respuestaIA = res.respuesta?.toLowerCase?.() || ''
  console.log('🧠 [IAINFO] Token recibido de IA:', respuestaIA)

  if (respuestaIA.includes('🧩 mostrarproductos')) {
    await state.update({ ultimaConsulta: ctx.body })
    console.log('🔄 [IAINFO] Redirigiendo a flowProductos')
    return gotoFlow(flowProductos)
  }

  if (respuestaIA.includes('🧩 mostrardetalles')) {
    console.log('🔄 [IAINFO] Redirigiendo a flowDetallesProducto')
    return gotoFlow(flowDetallesProducto)
  }

  if (respuestaIA.includes('🧩 solicitarayuda')) {
    console.log('🔄 [IAINFO] Redirigiendo a flowProductos')
    return gotoFlow(flowProductos)
  }

  console.log('📤 [IAINFO] Enviando respuesta al usuario')
  await Responder(res, ctx, flowDynamic, state)
}

async function Responder(res, ctx, flowDynamic, state) {
  console.log('🔍 [IAINFO] Iniciando Responder, tipo de respuesta:', res.tipo)
  if (res.tipo === ENUM_IA_RESPUESTAS.TEXTO && res.respuesta) {
    await Esperar(BOT.DELAY)

    const yaRespondido = state.get('ultimaRespuestaSimple') || ''
    const nuevaRespuesta = res.respuesta.toLowerCase().trim()

    if (nuevaRespuesta && nuevaRespuesta === yaRespondido) {
      console.log('⚡ [IAINFO] Respuesta ya fue enviada antes, evitando repetición.')
      return
    }

    await state.update({ ultimaRespuestaSimple: nuevaRespuesta })

    const msj = await EnviarImagenes(res.respuesta, flowDynamic, ctx)
    console.log('📬 [IAINFO] Enviando mensaje al usuario:', msj)
    return await flowDynamic(msj)
  }
  console.log('⚠️ [IAINFO] No se envió respuesta, tipo no válido o respuesta vacía.')
}

async function obtenerProductosCorrectos(texto, state) {
  const { esConsultaProductos } = await obtenerIntencionConsulta(texto, state.get('ultimaConsulta') || '')
  console.log('📡 [IAINFO] Verificando esConsultaProductos en obtenerProductosCorrectos:', esConsultaProductos)

  if (!esConsultaProductos) {
    console.log('🚫 [IAINFO] No es consulta de productos, retornando vacío.')
    return []
  }

  const sugeridos = state.get('productosUltimaSugerencia') || []
  const productoReconocido = state.get('productoReconocidoPorIA') || ''
  console.log('🔍 [DEBUG] productoReconocidoPorIA en obtenerProductosCorrectos:', productoReconocido)
  console.log('🔍 [DEBUG] Texto recibido en obtenerProductosCorrectos:', texto)

  const textoBusqueda = productoReconocido || texto
  console.log('🔍 [DEBUG] textoBusqueda para filtrarPorTextoLibre:', textoBusqueda)

  if (productoReconocido) {
    console.log('🔍 [IAINFO] Nueva búsqueda con productoReconocidoPorIA.')
    const productosFull = state.get('_productosFull') || []
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (nueva búsqueda):', textoBusqueda)
    return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
  }

  if (await esAclaracionSobreUltimaSugerencia(texto, state) && sugeridos.length) {
    console.log('🔍 [IAINFO] Aclaración sobre producto sugerido anteriormente.')
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (aclaración):', textoBusqueda)
    return filtrarPorTextoLibre(sugeridos, textoBusqueda, state)
  }

  console.log('🔍 [IAINFO] Intención de producto detectada vía OpenAI.')
  const productosFull = state.get('_productosFull') || []
  console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (OpenAI):', textoBusqueda)
  return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
}

async function esAclaracionSobreUltimaSugerencia(texto = '', state) {
  const productoReconocido = state.get('productoReconocidoPorIA') || ''
  if (productoReconocido) return false

  const patronesFijos = /(talla|color|precio|disponible|modelo|envío|cuánto|sirve|cómo|ingredientes|combinación|me conviene|me ayuda|es bueno|es mejor|cuál|por qué|se aplica|modo|efecto|lo uso|día|noche|se mezcla|sirve si)/i
  if (patronesFijos.test(texto)) return true

  const ultimaConsulta = (state.get('ultimaConsulta') || '').toLowerCase()
  const textoLower = texto.toLowerCase()
  return ultimaConsulta && textoLower.length <= 12 && !textoLower.includes('hola') && textoLower.length >= 3
}
