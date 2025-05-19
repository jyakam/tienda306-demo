// src/funciones/helpers/generarResumenConversacion.mjs

import { EnviarTextoOpenAI } from '../../APIs/OpenAi/enviarTextoOpenAI.mjs';

export async function generarResumenConversacionIA(mensaje, telefono) {
  try {
    const prompt = `
Eres un asistente que analiza conversaciones para resumir la intención del cliente.
A partir del siguiente mensaje, responde con UNA SOLA FRASE que resuma qué buscaba el cliente, sin inventar datos y sin dar contexto innecesario.
Ejemplo de salida: "El cliente preguntó por tipos de tenis deportivos y quedó a la espera de modelos."
MENSAJE:
"${mensaje}"
`;

    const response = await EnviarTextoOpenAI(prompt, 'resumen', 'INFO', { telefono });
    if (!response || !response.respuesta) {
      throw new Error('No se obtuvo respuesta válida de EnviarTextoOpenAI');
    }
    return response.respuesta.trim();
  } catch (err) {
    console.error('❌ Error generando resumen contextual IA:', {
      message: err.message,
      stack: err.stack
    });
    return '';
  }
}
