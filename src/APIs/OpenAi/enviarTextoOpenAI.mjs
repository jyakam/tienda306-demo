import 'dotenv/config'
import { OpenAI } from 'openai'

//TT MODULOS
import { ENUM_IA_RESPUESTAS } from './IAEnumRespuestas.mjs'
import { DetectarFuncion, FuncionesIA } from './funcionesIA.mjs'
import { ObtenerHistorial } from './historial.mjs'
import { Notificar, ENUM_NOTI } from '../../config/notificaciones.mjs'
import { BOT, MENSAJES } from '../../config/bot.mjs'

//TT AGREGAR CLAVE
function OpenIA() {
  return new OpenAI({
    apiKey: BOT.KEY_IA || process.env.OPENAI_API_KEY
  })
}

//TT LLAMAR IA
/**
 * Envía un mensaje de texto a la API de OpenAI y obtiene una respuesta.
 * @param {string} msj - El mensaje a enviar a la IA.
 * @param {string} userId - El ID del usuario que envía el mensaje.
 * @param {string} guion - Enum del guion a usar o agente.
 * @param {Object} estado - El estado actual del usuario.
 * @param {Object|null} llamada - Opcional, contenido adicional para llamadas a funciones.
 * @returns {Promise<Object>} La respuesta de la IA.
 */
export async function EnviarTextoOpenAI(msj, userId, guion, estado, llamada = null) {
  try {
    const _historial = ObtenerHistorial(userId, guion, estado)

    if (!llamada) {
      _historial.push({ role: 'user', content: msj })
    } else {
      if (Array.isArray(llamada)) {
        _historial.push(...llamada)
      } else if (typeof llamada === 'object') {
        _historial.push(llamada)
      }
    }

    const openai = OpenIA()
    const completion = await openai.chat.completions.create({
      model: BOT.MODELO_IA,
      messages: _historial,
      functions: FuncionesIA(guion),
      function_call: 'auto',
      max_tokens: BOT.TOKENS,
      temperature: BOT.TEMPERATURA
    })

    const message = completion.choices?.[0]?.message
    if (!message) throw new Error('❌ La IA no devolvió ninguna respuesta válida.')

    const respuesta = await DetectarFuncion(message, userId, guion, estado)
    _historial.push({ role: 'assistant', content: respuesta })

    return { respuesta, tipo: ENUM_IA_RESPUESTAS.TEXTO }
  } catch (error) {
    console.error('💥 TXT - Error al llamar a la API de OpenAI:', error)
    const msj = '⚠️ No es posible conectar con *OpenAI (TXT)*. Revisa la clave de API, tokens o el saldo de la cuenta.'
    Notificar(ENUM_NOTI.ERROR, { msj })
    return { respuesta: MENSAJES.ERROR || '❌ No pude procesar tu solicitud, por favor intentá más tarde.', tipo: ENUM_IA_RESPUESTAS.TEXTO }
  }
}
