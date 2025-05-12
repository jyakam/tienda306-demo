// src/flujos/bloques/enviarIA.mjs
import fs from 'fs'
import { BOT } from '../../config/bot.mjs'
import { ENUM_TIPO_ARCHIVO } from './detectarArchivos.mjs'
import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'
import { EnviarImagenOpenAI } from '../../APIs/OpenAi/enviarImagenOpenAI.mjs'
import { convertOggToMp3 } from '../../funciones/convertirMp3.mjs'
import { EnviarAudioOpenAI } from '../../APIs/OpenAi/enviarAudioOpenAI.mjs'
import { extraerNombreProducto } from '../../funciones/helpers/extractNombreProducto.mjs'

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
  console.log('🔍 [EnviarIA] Iniciando EnviarIA, mensaje:', msj)
  console.log('🔍 [EnviarIA] Funciones recibidas:', Object.keys(funciones))
  console.log('🔍 [EnviarIA] Estado de funciones.state:', funciones.state ? 'definido' : 'no definido')
  const tipoMensaje = safeGet(funciones.state, 'tipoMensaje')
  const promptExtra = funciones.promptExtra || ''

  const mensajeFinal = promptExtra ? `${promptExtra}\n\n${msj}` : msj

  console.log('📊 [AUDITORIA] → Inicia EnviarIA()')
  console.log('📊 [AUDITORIA] Tipo de mensaje:', tipoMensaje)
  console.log('📊 [AUDITORIA] Prompt extra incluido:', !!promptExtra)
  console.log('📊 [AUDITORIA] Estado cliente:', estado)

  try {
    // --- 📸 IMAGEN ---
    if (tipoMensaje === ENUM_TIPO_ARCHIVO.IMAGEN) {
      console.log('📤 🌄 Enviando imagen a OpenAI...')
      const objeto = { role: 'user', content: [{ type: 'text', text: msj }] }

      const datos = safeGet(funciones.state, 'archivos') || []
      const imagenes = datos.filter(item => item.tipo === ENUM_TIPO_ARCHIVO.IMAGEN)
      console.log('DEBUG: Imágenes encontradas en state:', imagenes)

      for (const img of imagenes) {
        try {
          const imagenBase64 = fs.readFileSync(img.ruta, { encoding: 'base64' })
          objeto.content.push({
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imagenBase64}`,
              detail: BOT.CALIDAD_IMAGENES
            }
          })
        } catch (error) {
          console.error(`❌ [EnviarIA] Error al leer imagen ${img.ruta}:`, error)
          continue
        }
      }

      console.log('📤 [EnviarIA] Input para EnviarImagenOpenAI:', { prompt: msj, archivos: imagenes })

      const res = await EnviarImagenOpenAI(objeto, funciones.ctx.from, guion, estado)
      console.log('📤 [EnviarIA] Respuesta completa de EnviarImagenOpenAI:', res)

      if (res?.respuesta) {
        const posibleProducto = await extraerNombreProducto(res.respuesta)
        console.log('⚠️ [DEBUG] Valor de posibleProducto antes de guardar en state:', posibleProducto)
        console.log('🔍 [DEBUG] Estado antes de actualizar productoReconocidoPorIA:', {
          tipoMensaje: safeGet(funciones.state, 'tipoMensaje'),
          productoReconocidoPorIA: safeGet(funciones.state, 'productoReconocidoPorIA')
        })
        if (typeof funciones.state?.update === 'function') {
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
        if (txt) mensaje.push(txt)
      }

      const final = `${promptExtra}\n${mensaje.filter(Boolean).join('\n')}`

      console.log('🧠 MENSAJE FINAL COMPLETO A LA IA (AUDIO):\n', final)
      const res = await EnviarTextoOpenAI(final, funciones.ctx.from, guion, estado)
      console.log('📥 RESPUESTA IA AUDIO:', res)

      if (res?.respuesta) {
        const posibleProducto = await extraerNombreProducto(res.respuesta)
        if (typeof funciones.state?.update === 'function') {
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
  } catch (error) {
    console.error('❌ [EnviarIA] Error general:', error)
    return { tipo: ENUM_IA_RESPUESTAS.TEXTO, respuesta: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.' }
  }
}

function generateUniqueFileName(extension) {
  const timestamp = Date.now()
  const randomNumber = Math.floor(Math.random() * 1000)
  return `file_${timestamp}_${randomNumber}.${extension}`
}
