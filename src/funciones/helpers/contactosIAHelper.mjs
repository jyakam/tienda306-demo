// helpers/contactosIAHelper.mjs

import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs';

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
`.trim();

  try {
    const respuesta = await EnviarTextoOpenAI(prompt, 'intencionContacto', 'INFO', {});
    const parsed = JSON.parse(respuesta.respuesta || '{}');
    return parsed.esDatosContacto || false;
  } catch (e) {
    console.log('❌ [IAINFO] Error detectando intención de contacto por IA:', e);
    return false;
  }
}

/**
 * Extrae datos personales del mensaje del usuario.
 * @param {string} txt - Texto del mensaje del usuario.
 * @returns {Promise<Object>} - Objeto con los datos extraídos.
 */
export async function extraerDatosContactoIA(txt) {
  const prompt = `
Eres un asistente experto. Extrae los datos personales del siguiente mensaje del usuario. Devuelve un JSON con los campos detectados: nombre, email, teléfono, dirección, ciudad, país, cédula, etc.

Mensaje del usuario:
"${txt}"

Responde solamente este JSON con los campos detectados.
`.trim();

  try {
    const respuesta = await EnviarTextoOpenAI(prompt, 'extraerDatosContacto', 'INFO', {});
    const parsed = JSON.parse(respuesta.respuesta || '{}');
    return parsed;
  } catch (e) {
    console.log('❌ [IAINFO] Error extrayendo datos de contacto por IA:', e);
    return {};
  }
}
