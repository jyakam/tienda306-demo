// src/flujos/IA/flowIAImagen.mjs
import 'dotenv/config'
import { addKeyword, EVENTS } from '@builderbot/bot'
import { CONTACTOS, BOT } from '../../config/bot.mjs'
import { ENUM_IA_RESPUESTAS } from '../../APIs/OpenAi/IAEnumRespuestas.mjs'
import { Escribiendo } from '../../funciones/proveedor.mjs'
import { Esperar } from '../../funciones/tiempo.mjs'
import { ENUNGUIONES } from '../../APIs/OpenAi/guiones.mjs'
import { ActualizarContacto } from '../../config/contactos.mjs'
import { DetectarArchivos } from '../bloques/detectarArchivos.mjs'
import { EnviarIA } from '../bloques/enviarIA.mjs'
import { cargarProductosAlState } from '../../funciones/helpers/cacheProductos.mjs'
import { filtrarPorTextoLibre } from '../../funciones/helpers/filtrarPorTextoLibre.mjs'
import { generarContextoProductosIA } from '../../funciones/helpers/generarContextoProductosIA.mjs'
import { flowProductos } from '../flowProductos.mjs'
import { flowDetallesProducto } from '../flowDetallesProducto.mjs'
import { ActualizarFechasContacto, ActualizarResumenUltimaConversacion } from '../../funciones/helpers/contactosSheetHelper.mjs'
import { extraerDatosContactoIA } from '../../funciones/helpers/extractDatosIA.mjs'
import { generarResumenConversacionIA } from '../../funciones/helpers/generarResumenConversacionIA.mjs'
import { obtenerIntencionConsulta } from '../../funciones/helpers/obtenerIntencionConsulta.mjs'
import { flowIAinfo } from './flowIAinfo.mjs'

// Función para esperar productoReconocidoPorIA
async function esperarProductoReconocido(state, intentos = 20, delay = 100) {
  for (let i = 0; i < intentos; i++) {
    const reconocido = state.get('productoReconocidoPorIA') || ''
    if (reconocido.trim().length > 3) {
      console.log('✅ [esperarProductoReconocido] productoReconocidoPorIA listo:', reconocido)
      return reconocido
    }
    await Esperar(delay)
  }
  console.log('⚠️ [esperarProductoReconocido] Tiempo agotado.')
  return ''
}

// Función para limpiar productoReconocidoPorIA
async function limpiarProductoReconocido(state) {
  await state.update({ productoReconocidoPorIA: '' })
  console.log('🧹 [IAIMAGEN] productoReconocidoPorIA limpiado.')
}

// Función para extraer nombre de producto
function extraerNombreProducto(respuesta = '') {
  try {
    const patrones = [
      /el\s+producto\s+(?:llamado\s+)?(.+?)(?:\s+no\s+|[\.\,\!])/i,
      /el\s+té\s+(?:de\s+)?([a-záéíóúñ\s]+)(?:\s+no\s+|[\.\,\!])/i,
      /(?:tienes|manejan|tienen)\s+(?:el\s+)?([a-záéíóúñ\s]+)(?:\?|\.)/i,
      /(?:no\s+tengo|no\s+disponible)\s+(.+?)(?:\s+pero|\s+si|[\.\,\!])/i,
      /el\s+([a-záéíóúñ\s]+?)\s+(?:no\s+está|no\s+tengo|sí)/i
    ]

    for (const patron of patrones) {
      const match = respuesta.match(patron)
      if (match) {
        const resultado = match[1]
        if (resultado && resultado.trim().length >= 3) return resultado.trim()
      }
    }

    const entreComillas = respuesta.match(/"(.*?)"/)
    if (entreComillas) return entreComillas[1].trim()

    const entreAsteriscos = respuesta.match(/\*(.*?)\*/)
    if (entreAsteriscos) return entreAsteriscos[1].trim()

    const palabrasClave = ['té', 'crema', 'yerba', 'ajo', 'vaselina', 'pepinillos']
    const palabras = respuesta.trim().split(/\s+/)
    const posibleProducto = palabras.filter(p => palabrasClave.some(k => p.toLowerCase().includes(k))).join(' ')
    if (posibleProducto && posibleProducto.length > 3) return posibleProducto

    return ''
  } catch (error) {
    console.error('❌ [extraerNombreProducto] Error al procesar respuesta:', error)
    return ''
  }
}

export const flowIAImagen = addKeyword(EVENTS.MEDIA)
  .addAction(async (ctx, tools) => {
    const { flowDynamic, endFlow, gotoFlow, provider, state } = tools
    const phone = ctx.from.split('@')[0]
    const contacto = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone)

    console.log('📩 [IAIMAGEN] Mensaje de imagen recibido de:', phone)
    if (!BOT.RESPONDER_NUEVOS && !contacto) return endFlow()
    if (!contacto) {
      await ActualizarContacto(phone, { nombre: 'Sin Nombre', resp_bot: 'Sí', etiqueta: 'Nuevo' })
      console.log('👤 [IAIMAGEN] Contacto nuevo registrado:', phone)
    }

    if (contacto) await ActualizarFechasContacto(contacto, phone)

    if (!state.get('_productosFull')?.length) {
      await cargarProductosAlState(state)
      await state.update({ __productosCargados: true })
      console.log('📦 [IAIMAGEN] Productos cargados en cache para:', phone)
    }

    // Detectar archivos
    const detectar = await DetectarArchivos(ctx, state)
    await Esperar(100)
    const tipoMensaje = state.get('tipoMensaje')
    console.log('🔍 [IAIMAGEN] Valor de tipoMensaje obtenido:', tipoMensaje)
    console.log('🔍 [IAIMAGEN] Estado después de DetectarArchivos:', {
      tipoMensaje,
      productoReconocidoPorIA: state.get('productoReconocidoPorIA'),
      archivos: state.get('archivos')
    })

    if (tipoMensaje !== 1) {
      console.log('⚠️ [IAIMAGEN] Tipo de mensaje no es imagen, redirigiendo a flowIAinfo.')
      return gotoFlow(flowIAinfo)
    }

    console.log('📸 [IAIMAGEN] Procesando imagen de producto...')
    const estado = {
      esClienteNuevo: !contacto || contacto.NOMBRE === 'Sin Nombre',
      contacto: contacto || {}
    }

    // Procesar imagen con IA
    console.log('🔍 [DEBUG] Llamando a EnviarIA para procesar imagen...')
    const resIA = await EnviarIA(ctx.body, ENUNGUIONES.INFO, {
      ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra: ''
    }, estado)
    console.log('🔍 [DEBUG] EnviarIA completado, respuesta:', resIA?.respuesta)

    // Recargar _productosFull si state fue limpiado
    if (!state.get('_productosFull')?.length) {
      await cargarProductosAlState(state)
      console.log('📦 [IAIMAGEN] _productosFull recargado después de EnviarIA.')
    }

    // Esperar productoReconocidoPorIA
    const productoReconocido = await esperarProductoReconocido(state)
    console.log('🔍 [DEBUG] productoReconocidoPorIA obtenido después de espera:', productoReconocido)

    // Usar productoReconocidoPorIA, resIA.respuesta o ctx.body como fallback
    const textoFinal = productoReconocido || extraerNombreProducto(resIA?.respuesta) || ctx.body
    console.log('🧾 [IAIMAGEN] Texto agrupado final para intención:', textoFinal)

    if (!textoFinal) {
      console.log('🚫 [IAIMAGEN] No se reconoció producto en la imagen, procesando respuesta normal.')
      await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, ctx.body)
      await limpiarProductoReconocido(state)
      // Redirigir a flowIAinfo para mensajes posteriores
      console.log('🔄 [IAIMAGEN] Imagen procesada, redirigiendo a flowIAinfo.')
      return gotoFlow(flowIAinfo)
    }

    // Procesar consulta de producto
    console.log('🔍 [DEBUG] textoFinal antes de obtenerProductosCorrectos:', textoFinal)
    const productos = await obtenerProductosCorrectos(textoFinal, state)
    if (productos.length) {
      await state.update({ productosUltimaSugerencia: productos })
      const promptExtra = generarContextoProductosIA(productos, state)
      console.log(`📦 [IAIMAGEN] ${productos.length} productos encontrados para textoFinal:`, textoFinal)
      // Reprocesar respuesta de IA con contexto de productos
      const resIAConProductos = await EnviarIA(textoFinal, ENUNGUIONES.INFO, {
        ctx, flowDynamic, endFlow, gotoFlow, provider, state, promptExtra
      }, estado)
      if (resIAConProductos) {
        await manejarRespuestaIA(resIAConProductos, ctx, flowDynamic, gotoFlow, state, textoFinal)
      } else {
        console.log('⚠️ [IAIMAGEN] resIAConProductos no válido, usando resIA como fallback.')
        await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, textoFinal)
      }
    } else {
      await manejarRespuestaIA(resIA, ctx, flowDynamic, gotoFlow, state, textoFinal)
    }

    // Actualizar datos de contacto y resumen
    const datosExtraidos = await extraerDatosContactoIA(ctx.body, phone)
    const resumen = await generarResumenConversacionIA(ctx.body, phone)
    if (Object.keys(datosExtraidos).length > 0) {
      await ActualizarContacto(phone, datosExtraidos)
      console.log('📇 [IAIMAGEN] Datos de contacto actualizados:', datosExtraidos)
    }
    if (resumen) {
      await ActualizarResumenUltimaConversacion(contacto, phone, resumen)
      console.log('📝 [IAIMAGEN] Resumen de conversación guardado.')
    }

    // Limpiar productoReconocidoPorIA
    await limpiarProductoReconocido(state)

    // Validar estado antes de redirigir
    console.log('🔍 [IAIMAGEN] Estado antes de redirigir a flowIAinfo:', {
      tipoMensaje: state.get('tipoMensaje'),
      productoReconocidoPorIA: state.get('productoReconocidoPorIA'),
      productosUltimaSugerencia: state.get('productosUltimaSugerencia')?.length
    })

    // Redirigir a flowIAinfo para mensajes posteriores
    console.log('🔄 [IAIMAGEN] Imagen procesada, redirigiendo a flowIAinfo.')
    return gotoFlow(flowIAinfo)
  })

async function manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state) {
  const respuestaIA = res.respuesta?.toLowerCase?.() || ''
  console.log('🧠 Token recibido de IA:', respuestaIA)

  if (respuestaIA.includes('🧩 mostrarproductos')) {
    await state.update({ ultimaConsulta: ctx.body })
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

  const textoBusqueda = productoReconocido || texto
  console.log('🔍 [DEBUG] textoBusqueda para filtrarPorTextoLibre:', textoBusqueda)

  if (productoReconocido) {
    console.log('🔍 [IAIMAGEN] Nueva búsqueda con productoReconocidoPorIA, ignorando aclaración.')
    const productosFull = state.get('_productosFull') || []
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (nueva búsqueda):', textoBusqueda)
    return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
  }

  if (await esAclaracionSobreUltimaSugerencia(texto, state) && sugeridos.length) {
    console.log('🔍 [IAIMAGEN] Aclaración sobre producto sugerido anteriormente.')
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (aclaración):', textoBusqueda)
    return filtrarPorTextoLibre(sugeridos, textoBusqueda, state)
  }

  const { esConsultaProductos } = await obtenerIntencionConsulta(texto, state.get('ultimaConsulta') || '')
  if (esConsultaProductos) {
    console.log('🔍 [IAIMAGEN] Intención de producto detectada vía OpenAI.')
    const productosFull = state.get('_productosFull') || []
    console.log('🔍 [DEBUG] Texto enviado a filtrarPorTextoLibre (OpenAI):', textoBusqueda)
    return filtrarPorTextoLibre(productosFull, textoBusqueda, state)
  }

  console.log('🚫 [IAIMAGEN] No se detectó relación con productos.')
  return []
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
