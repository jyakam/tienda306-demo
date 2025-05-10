// src/flujos/bloques/enviarIA.mjs
import fs from 'fs'
import { BOT } from '../../config/bot.mjs'
import { ENUM_TIPO_ARCHIVO } from './detectarArchivos.mjs'
import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'
import { EnviarImagenOpenAI } from '../../APIs/OpenAi/enviarImagenOpenAI.mjs'
import { convertOggToMp3 } from '../../funciones/convertirMp3.mjs'
import { EnviarAudioOpenAI } from '../../APIs/OpenAi/enviarAudioOpenAI.mjs'

// Función segura para acceder a state
const safeGet = (state, key) => {
  try {
    if (!state || typeof state.get !== 'function') {
      console.error(`❌ [safeGet] Estado inválido para key ${key}:`, state)
      return null
    }
    return state.get(key) ?? null
  } catch (error) {
    console.error(`❌ [safeGet] Error al acceder a ${key}:`, error)
    return null
  }
}

export async function EnviarIA(msj, guion, funciones, estado = {}) {
  console.log('🔍 [EnviarIA] Funciones recibidas:', Object.keys(funciones))
  console.log('🔍 [EnviarIA] Estado de funciones.state:', funciones.state ? 'definido' : 'no definido')
  const tipoMensaje = safeGet(funciones.state, 'tipoMensaje')
  const promptExtra = funciones.promptExtra || ''

  const mensajeFinal = promptExtra ? `${promptExtra}\n\n${msj}` : msj

  console.log('📊 [AUDITORIA] → Inicia EnviarIA()')
  console.log('📊 [AUDITORIA] Tipo de mensaje:', tipoMensaje)
  console.log('📊 [AUDITORIA] Prompt extra incluido:', !!promptExtra)
  console.log('📊 [AUDITORIA] Estado cliente:', estado)

  // --- 📸 IMAGEN ---
  if (tipoMensaje === ENUM_TIPO_ARCHIVO.IMAGEN) {
    console.log('📤 🌄 Enviando imagen a OpenAI...')
    const objeto = { role: 'user', content: [{ type: 'text', text: msj }] }

    const datos = safeGet(funciones.state, 'archivos') || []
    const imagenes = datos.filter(item => item.tipo === ENUM_TIPO_ARCHIVO.IMAGEN)
    console.log('DEBUG: Imágenes encontradas en state:', imagenes)

    for (const img of imagenes) {
      const imagenBase64 = fs.readFileSync(img.ruta, { encoding: 'base64' })
      objeto.content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imagenBase64}`,
          detail: BOT.CALIDA_IMAGENES
        }
      })
    }

    console.log('📤 [EnviarIA] Input para EnviarImagenOpenAI:', { prompt: msj, archivos: imagenes })

    const res = await EnviarImagenOpenAI(objeto, funciones.ctx.from, guion, estado)
    console.log('📤 [EnviarIA] Respuesta completa de EnviarImagenOpenAI:', res)

    if (res?.respuesta) {
      const posibleProducto = extraerNombreProducto(res.respuesta)
      console.log('⚠️ [DEBUG] Valor de posibleProducto antes de guardar en state:', posibleProducto)
      console.log('🔍 [DEBUG] Estado antes de actualizar productoReconocidoPorIA:', {
        tipoMensaje: safeGet(funciones.state, 'tipoMensaje'),
        productoReconocidoPorIA: safeGet(funciones.state, 'productoReconocidoPorIA')
      })
      if (funciones.state && typeof funciones.state.update === 'function') {
        await funciones.state.update({ productoReconocidoPorIA: posibleProducto })
        console.log('✅ [EnviarIA] Estado actualizado con productoReconocidoPorIA:', posibleProducto)
        console.log('🔍 [DEBUG] Estado después de actualizar productoReconocidoPorIA:', {
          tipoMensaje: safeGet(funciones.state, 'tipoMensaje'),
          productoReconocidoPorIA: safeGet(funciones.state, 'productoReconocidoPorIA')
        })
      } else {
        console.error('❌ [EnviarIA] No se pudo actualizar estado: state o update no definido')
      }
    } else {
      console.log('DEBUG: No se recibió respuesta válida de OpenAI:', res)
    }

    // Comentado para evitar limpiar tipoMensaje
    // if (funciones.state && typeof funciones.state.clear === 'function') {
    //   funciones.state.clear()
    //   console.log('🔍 [EnviarIA] Estado después de clear:', funciones.state ? 'definido' : 'no definido')
    // }

    return res
  }

  // --- 🎙️ AUDIO ---
  if (tipoMensaje === ENUM_TIPO_ARCHIVO.NOTA_VOZ) {
    console.log('📤 🎵 Enviando nota de voz a OpenAI...')
    const mensaje = []
    const datos = safeGet(funciones.state, 'archivos') || []
    const audios = datos.filter(item => item.tipo === ENUM_TIPO_ARCHIVO.NOTA_VOZ)

    for (const aud of audios) {
      const id = generateUniqueFileName('mp3')
      const mp3 = await convertOggToMp3(aud.ruta, id, BOT.VELOCIDAD)
      const txt = await EnviarAudioOpenAI(mp3)
      mensaje.push(txt)
    }

    // Comentado para evitar limpiar tipoMensaje
    // if (funciones.state && typeof funciones.state.clear === 'function') {
    //   funciones.state.clear()
    // }
    const final = `${promptExtra}\n${mensaje.join('\n')}`

    console.log('🧠 MENSAJE FINAL COMPLETO A LA IA (AUDIO):\n', final)
    const res = await EnviarTextoOpenAI(final, funciones.ctx.from, guion, estado)
    console.log('📥 RESPUESTA IA AUDIO:', res)

    if (res?.respuesta) {
      const posibleProducto = extraerNombreProducto(res.respuesta)
      if (funciones.state && typeof funciones.state.update === 'function') {
        await funciones.state.update({ productoReconocidoPorIA: posibleProducto })
        console.log('🧠 [IA] Producto reconocido en audio guardado en state:', posibleProducto)
      }
    }

    return res
  }

  // --- 📦 DOCUMENTO ---
  if (tipoMensaje === ENUM_TIPO_ARCHIVO.DOCUMENTO) {
    console.log('📤 📦 Documento detectado, enviando...')
    console.log('🧠 MENSAJE FINAL COMPLETO A LA IA (DOCUMENTO):\n', mensajeFinal)

    const res = await EnviarTextoOpenAI(mensajeFinal, funciones.ctx.from, guion, estado)
    console.log('📥 RESPUESTA IA DOCUMENTO:', res)
    return res
  }

  // --- 📝 TEXTO NORMAL ---
  console.log('📤 📄 Enviando texto plano:', msj)
  console.log('🧠 MENSAJE FINAL COMPLETO A LA IA (TEXTO):\n', mensajeFinal)

  const res = await EnviarTextoOpenAI(mensajeFinal, funciones.ctx.from, guion, estado)
  console.log('📥 RESPUESTA IA TEXTO:', res)
  return res
}

function generateUniqueFileName(extension) {
  const timestamp = Date.now()
  const randomNumber = Math.floor(Math.random() * 1000)
  return `file_${timestamp}_${randomNumber}.${extension}`
}

// 🧠 EXTRAER POSIBLE NOMBRE DE PRODUCTO DE LA RESPUESTA IA
function extraerNombreProducto(respuesta = '') {
  try {
    // Patrones comunes de productos, priorizando nombres específicos
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

    // Extraer nombres entre comillas o asteriscos
    const entreComillas = respuesta.match(/"(.*?)"/)
    if (entreComillas) return entreComillas[1].trim()

    const entreAsteriscos = respuesta.match(/\*(.*?)\*/)
    if (entreAsteriscos) return entreAsteriscos[1].trim()

    // Fallback para respuestas cortas y relevantes
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
