import 'dotenv/config'
import fs from 'fs'
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
import { traducirTexto } from '../../funciones/helpers/traducirTexto.mjs'
import { enviarImagenProductoOpenAI } from '../../APIs/OpenAi/enviarImagenProductoOpenAI.mjs'

// 👇 NUEVO helper para limpiar respuesta de Vision
export function extraerNombreProductoDeVision(texto) {
  const match = texto.match(/["“](.*?)["”]/)
  if (match && match[1]) return match[1]
  return texto
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

    if (!state.get('_productosFull')?.length) {
      await cargarProductosAlState(state)
      await state.update({ __productosCargados: true })
      console.log('📦 [IAINFO] Productos cargados en cache para:', phone)
    }

    await state.update({ productoDetectadoEnImagen: false, productoReconocidoPorIA: '' })

    const detectar = await DetectarArchivos(ctx, state)

    if (state.get('tipoMensaje') === 1) {
    const imagenes = state.get('archivos')?.filter(item => item.tipo === 1)
    let resultado = ''
    if (imagenes?.length > 0) {
        const fileBuffer = fs.readFileSync(imagenes[0].ruta)           // 👈 esta línea no se puede eliminar
        resultado = await enviarImagenProductoOpenAI(fileBuffer)
        resultado = extraerNombreProductoDeVision(resultado)           // 👈 tu nueva línea
    }
    if (resultado && resultado !== '' && resultado !== 'No es un producto') {
        await state.update({
            productoDetectadoEnImagen: true,
            productoReconocidoPorIA: resultado
        })
        console.log(`🖼️ [IAINFO] Producto detectado en imagen: ${resultado}`)
    }
}

    AgruparMensaje(detectar, async (txt) => {
      Escribiendo(ctx)

      console.log('🧾 [IAINFO] Texto agrupado final del usuario:', txt)

      const productos = await obtenerProductosCorrectos(txt, state)
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

      await state.update({ productoDetectadoEnImagen: false, productoReconocidoPorIA: '' })
    })
  })

  .addAction({ capture: true }, async (ctx, tools) => {
    const { flowDynamic, endFlow, gotoFlow, provider, state } = tools
    const phone = ctx.from.split('@')[0]
    const message = ctx.body.trim()
    const contacto = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone) || {}
    const datos = {}

    await state.update({ productoDetectadoEnImagen: false, productoReconocidoPorIA: '' })

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

    if (state.get('tipoMensaje') === 1) {
    const imagenes = state.get('archivos')?.filter(item => item.tipo === 1)
    let resultado = ''
    if (imagenes?.length > 0) {
        const fileBuffer = fs.readFileSync(imagenes[0].ruta)           // 👈 esta línea no se puede eliminar
        resultado = await enviarImagenProductoOpenAI(fileBuffer)
        resultado = extraerNombreProductoDeVision(resultado)           // 👈 tu nueva línea
    }
    if (resultado && resultado !== '' && resultado !== 'No es un producto') {
        await state.update({
            productoDetectadoEnImagen: true,
            productoReconocidoPorIA: resultado
        })
        console.log(`🖼️ [IAINFO] Producto detectado en imagen: ${resultado}`)
    }
}

    AgruparMensaje(detectar, async (txt) => {
    if (ComprobrarListaNegra(ctx) || !BOT.ESTADO) return gotoFlow(idleFlow)
    reset(ctx, gotoFlow, BOT.IDLE_TIME * 60)
    Escribiendo(ctx)

    console.log('✏️ [IAINFO] Mensaje capturado en continuación de conversación:', txt)

    const productos = await obtenerProductosCorrectos(txt, state)
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

    const esDatosContacto = await detectarIntencionContactoIA(txt)

if (esDatosContacto) {
    const datosExtraidos = await extraerDatosContactoIA(txt, phone)
    const datosCombinados = { ...datos, ...datosExtraidos }
    if (Object.keys(datosCombinados).length > 0) {
        await ActualizarContacto(phone, datosCombinados)
    }
}

    const resumen = await generarResumenConversacionIA(txt, phone)
    if (resumen) {
        await ActualizarResumenUltimaConversacion(contacto, phone, resumen)
    }

    await manejarRespuestaIA(res, ctx, flowDynamic, gotoFlow, state, txt)

    await state.update({ productoDetectadoEnImagen: false, productoReconocidoPorIA: '' })
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
  console.log('🧪 [flowIAinfo] Texto recibido para búsqueda:', texto)

  if (state.get('productoDetectadoEnImagen') && state.get('productoReconocidoPorIA')) {
    const productosFull = state.get('_productosFull') || []
  let productos = filtrarPorTextoLibre(productosFull, state.get('productoReconocidoPorIA'))

const mejorScore = productos.length ? Math.max(...productos.map(p => p.score || 0)) : 0

// 👇 NUEVO: lógica optimizada IA solo si ningún producto pasa de 25
if (mejorScore < 25 && productos.length) {
    console.log(`🔎 [IAINFO] Mejor score encontrado: ${mejorScore}. Se probarán equivalencias IA en los top 15 productos.`)
    // ordenar productos por score descendente
    const topProductos = productos
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 15)

    for (const producto of topProductos) {
        const esSimilar = await esProductoSimilarPorIA(producto.NOMBRE, state.get('productoReconocidoPorIA'))
        if (esSimilar) {
            productos = [producto]
            console.log(`✅ [IAINFO] Equivalencia IA encontrada: ${producto.NOMBRE}`)
            break
        }
    }
}
    
    console.log(`🔍 [IAINFO] Buscando producto por imagen detectada: ${state.get('productoReconocidoPorIA')}`)

    if (!productos.length || !encontroProductoExacto(productos, state.get('productoReconocidoPorIA'))) {
      console.log('🔎 [IAINFO] No se encontró producto exacto, intentando traducción...')
      const traduccion = await traducirTexto(state.get('productoReconocidoPorIA'))
      productos = filtrarPorTextoLibre(productosFull, traduccion)
      console.log(`🔎 [IAINFO] Resultado después de traducción: ${productos.length} productos encontrados.`)
    }

    return productos
  }

  if (await esAclaracionSobreUltimaSugerencia(texto, state) && sugeridos.length) {
    console.log('🔍 [IAINFO] Aclaración sobre producto sugerido anteriormente.')
    return filtrarPorTextoLibre(sugeridos, texto)
  }

  if (await esMensajeRelacionadoAProducto(texto, state)) {
    console.log('🔍 [IAINFO] Producto detectado con contexto dinámico.')
    const productosFull = state.get('_productosFull') || []
    return filtrarPorTextoLibre(productosFull, texto)
  }

  const { esConsultaProductos } = await obtenerIntencionConsulta(texto, state.get('ultimaConsulta') || '', state)
  if (esConsultaProductos) {
    console.log('🔍 [IAINFO] Intención de producto detectada vía OpenAI.')
    const productosFull = state.get('_productosFull') || []
    return filtrarPorTextoLibre(productosFull, texto)
  }

  console.log('🚫 [IAINFO] No se detectó relación con productos.')
  return []
}

import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'

async function esAclaracionSobreUltimaSugerencia(texto = '', state) {
  const ultimaSugerencia = state.get('productosUltimaSugerencia') || []

  if (!ultimaSugerencia.length) return false

  const nombresProductos = ultimaSugerencia.map(p => p.NOMBRE).slice(0, 3).join('\n')

  const prompt = `
Eres un asistente conversacional de ventas para una tienda online. 
Tu tarea es únicamente responder si la siguiente consulta del cliente es una continuación o aclaración relacionada a los siguientes productos que se le ofrecieron anteriormente.

Productos sugeridos anteriormente:
${nombresProductos}

Mensaje actual del cliente:
"${texto}"

Responde solamente este JSON:
{
  "esAclaracion": true o false
}
  `.trim()

  try {
    const respuesta = await EnviarTextoOpenAI(prompt, 'aclaracion', 'INFO', {})
    const parsed = JSON.parse(respuesta.respuesta || '{}')
    return parsed.esAclaracion || false
  } catch (e) {
    console.log('❌ [IAINFO] Error detectando aclaración:', e)
    return false
  }
}

async function esProductoSimilarPorIA(nombreProducto, textoConsulta) {
  const prompt = `
Eres un asistente experto en e-commerce. 
Tu tarea es determinar si las dos frases siguientes hacen referencia al mismo producto, teniendo en cuenta posibles errores de ortografía, sinónimos, traducciones o abreviaciones.

Frase 1 (producto del catálogo):
"${nombreProducto}"

Frase 2 (consulta del cliente):
"${textoConsulta}"

Responde solamente este JSON:
{
  "esSimilar": true o false
}
  `.trim()

  try {
    const respuesta = await EnviarTextoOpenAI(prompt, 'similaridad', 'INFO', {})
    const parsed = JSON.parse(respuesta.respuesta || '{}')
    return parsed.esSimilar || false
  } catch (e) {
    console.log('❌ [IAINFO] Error verificando equivalencia de producto:', e)
    return false
  }
}

function encontroProductoExacto(productos, nombreBuscado) {
  const nombreLimpio = nombreBuscado.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
  return productos.some(p => {
    const productoLimpio = p.NOMBRE.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
    const coincidencias = nombreLimpio.filter(palabra => productoLimpio.includes(palabra)).length
    const porcentaje = coincidencias / nombreLimpio.length
    return porcentaje >= 0.7
  })
}
import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'   // 👈 ya la tienes seguro, si no agrégala arriba

async function detectarIntencionContactoIA(txt) {
    const prompt = `
Eres un asistente experto. Tu tarea es decir si el siguiente mensaje del usuario tiene la intención de entregarte datos personales como nombre, teléfono, email, dirección o cualquier dato de contacto. 

Mensaje del usuario:
"${txt}"

Responde solamente este JSON:
{
  "esDatosContacto": true o false
}
`.trim()

    try {
        const respuesta = await EnviarTextoOpenAI(prompt, 'intencionContacto', 'INFO', {})
        const parsed = JSON.parse(respuesta.respuesta || '{}')
        return parsed.esDatosContacto || false
    } catch (e) {
        console.log('❌ [IAINFO] Error detectando intención de contacto por IA:', e)
        return false
    }
}

