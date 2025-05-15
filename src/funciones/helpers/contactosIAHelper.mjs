// src/funciones/helpers/contactosIAHelper.mjs

import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs'
import { ActualizarContacto } from '../../config/contactos.mjs'

/**
 * Detecta si un mensaje contiene intención de proporcionar datos de contacto.
 * @param {string} txt - Texto del mensaje del usuario.
 * @returns {Promise<boolean>} - Retorna true si se detecta intención de compartir datos de contacto.
 */
export async function detectarIntencionContactoIA(txt) {
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
        // Limpieza extra: por si la IA devuelve con ```json
        let clean = respuesta.respuesta
        if (!clean) return false
        clean = clean.replace(/```json/g, '').replace(/```/g, '').trim()
        const match = clean.match(/{[\s\S]*}/)
        if (match) clean = match[0]
        const parsed = JSON.parse(clean)
        return parsed.esDatosContacto || false
    } catch (e) {
        console.log('❌ [IAINFO] Error detectando intención contacto IA:', e)
        return false
    }
}

/**
 * Extrae datos personales del mensaje del usuario.
 * @param {string} txt - Texto del mensaje del usuario.
 * @returns {Promise<Object>} - Objeto con los datos extraídos.
 */
export async function extraerDatosContactoIA(txt) {
    const prompt = `
Eres un asistente experto. Extrae los datos personales del siguiente mensaje del usuario. Devuelve EXCLUSIVAMENTE un JSON (sin texto adicional, sin \`\`\`) con los campos detectados: nombre, email, teléfono, dirección, ciudad, país, cédula, etc.
Mensaje del usuario:
"${txt}"
Responde solamente el JSON limpio con los campos detectados.
    `.trim()

    try {
        const respuesta = await EnviarTextoOpenAI(prompt, 'extraerDatosContacto', 'INFO', {})
        // LIMPIEZA: eliminar triples comillas o bloques ```json ... ```
        let clean = respuesta.respuesta
        if (!clean) return {}
        clean = clean.replace(/```json/g, '').replace(/```/g, '').trim()
        const match = clean.match(/{[\s\S]*}/)
        if (match) clean = match[0]
        const parsed = JSON.parse(clean)
        return parsed
    } catch (e) {
        console.log('❌ [IAINFO] Error extrayendo datos contacto IA:', e)
        return {}
    }
}

/**
 * Si un mensaje es de contacto, extrae y actualiza en AppSheet los datos.
 * @param {string} txt - Texto del mensaje.
 * @param {string} phone - Teléfono del usuario.
 * @param {object} contacto - Objeto contacto actual.
 * @param {object} datos - Objeto datos adicionales (opcional).
 */
export async function verificarYActualizarContactoSiEsNecesario(txt, phone, contacto = {}, datos = {}) {
    console.log(`📇 [IAINFO] Intentando extraer datos IA para ${phone}...`)

    const datosExtraidos = await extraerDatosContactoIA(txt)
    const datosCombinados = { ...datos, ...datosExtraidos }

    // Si no se encontró nada, no actualizamos
    if (!Object.keys(datosCombinados).length) return

    console.log(`📇 [IAINFO] Datos combinados IA detectados para ${phone}:`, datosCombinados)

    await ActualizarContacto(phone, datosCombinados)
    console.log(`✅ [IAINFO] Datos de contacto actualizados para ${phone}`)
}
