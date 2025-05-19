// src/funciones/helpers/generarResumenConversacion.mjs

import { OpenIA } from '../../config/bot.mjs'; // Ajusta la ruta según tu estructura
import { BOT } from '../../config/bot.mjs'; // Importamos BOT para acceder a MODELO_IA, TEMPERATURA y TOKENS

export async function generarResumenConversacionIA(mensaje, telefono) {
  try {
    // Obtener la instancia de OpenAI configurada
    const openai = OpenIA();

    // Validar que la instancia esté correctamente inicializada
    if (!openai) {
      console.error('❌ [OPENAI] No se pudo inicializar la instancia de OpenAI.');
      throw new Error('Instancia de OpenAI no disponible');
    }

    // Validar que BOT.MODELO_IA esté definido
    if (!BOT.MODELO_IA) {
      console.error('❌ [OPENAI] BOT.MODELO_IA no está definido.');
      throw new Error('BOT.MODELO_IA no está definido');
    }

    // Log para depurar el modelo seleccionado
    console.log('🤖 [DEBUG] Modelo OpenAI seleccionado:', BOT.MODELO_IA);

    // Log para depurar temperatura y tokens
    console.log('🔧 [DEBUG] Temperatura:', BOT.TEMPERATURA, 'Max tokens:', BOT.TOKENS);

    const prompt = `
Eres un asistente que analiza conversaciones para resumir la intención del cliente.

A partir del siguiente mensaje, responde con UNA SOLA FRASE que resuma qué buscaba el cliente, sin inventar datos y sin dar contexto innecesario.

Ejemplo de salida: "El cliente preguntó por tipos de tenis deportivos y quedó a la espera de modelos."

MENSAJE:
"${mensaje}"
`;

    const response = await openai.chat.completions.create({
      model: BOT.MODELO_IA,
      messages: [
        { role: 'system', content: 'Eres un generador de resumen de intención del cliente.' },
        { role: 'user', content: prompt }
      ],
      temperature: BOT.TEMPERATURA || 0.3, // Usamos BOT.TEMPERATURA, con 0.3 como respaldo
      max_tokens: BOT.TOKENS || 100 // Usamos BOT.TOKENS, con 100 como respaldo
    });

    // Validar que la respuesta tenga la estructura esperada
    if (!response.choices || !response.choices[0]?.message?.content) {
      console.error('❌ [OPENAI] Respuesta de API no tiene la estructura esperada:', response);
      throw new Error('Respuesta de OpenAI no contiene choices o content');
    }

    const resumen = response.choices[0].message.content.trim();
    return resumen || '';
  } catch (err) {
    console.error('❌ Error generando resumen contextual IA:', {
      message: err.message,
      stack: err.stack
    });
    return '';
  }
}
