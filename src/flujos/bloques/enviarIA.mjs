// src/flujos/bloques/EnviarIA.mjs
import fs from 'fs'
import { BOT } from '../../config/bot.mjs'
import { ENUM_TIPO_ARCHIVO } from './detectarArchivos.mjs'
import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'
import { EnviarImagenOpenAI } from '../../APIs/OpenAi/enviarImagenOpenAI.mjs'
import { convertOggToMp3 } from '../../funciones/convertirMp3.mjs'
import { EnviarAudioOpenAI } from '../../APIs/OpenAi/enviarAudioOpenAI.mjs'

export async function EnviarIA(msj, guion, funciones, estado = {}) {
  const tipoMensaje = funciones.state.get('tipoMensaje')
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

    const datos = funciones.state.get('archivos') || []
    const imagenes = datos.filter(item => item.tipo === ENUM_TIPO_ARCHIVO.IMAGEN)

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

    funciones.state.clear()
    const res = await EnviarImagenOpenAI(objeto, funciones.ctx.from, guion, estado)
    console.log('📥 RESPUESTA IA IMAGEN:', res)
    return res
  }

  // --- 🎙️ AUDIO ---
  if (tipoMensaje === ENUM_TIPO_ARCHIVO.NOTA_VOZ) {
    console.log('📤 🎵 Enviando nota de voz a OpenAI...')
    const mensaje = []
    const datos = funciones.state.get('archivos') || []
    const audios = datos.filter(item => item.tipo === ENUM_TIPO_ARCHIVO.NOTA_VOZ)

    for (const aud of audios) {
      const id = generateUniqueFileName('mp3')
      const mp3 = await convertOggToMp3(aud.ruta, id, BOT.VELOCIDAD)
      const txt = await EnviarAudioOpenAI(mp3)
      mensaje.push(txt)
    }

    funciones.state.clear()
    const final = `${promptExtra}\n${mensaje.join('\n')}`

    console.log('🧠 MENSAJE FINAL COMPLETO A LA IA (AUDIO):\n', final)
    const res = await EnviarTextoOpenAI(final, funciones.ctx.from, guion, estado)
    console.log('📥 RESPUESTA IA AUDIO:', res)
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
