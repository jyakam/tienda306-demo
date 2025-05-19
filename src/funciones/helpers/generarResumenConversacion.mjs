// src/funciones/helpers/generarResumenConversacion.mjs

export async function generarResumenConversacionIA(mensaje, telefono) {
  try {
    const prompt = `
Eres un asistente que analiza conversaciones para resumir la intención del cliente.

A partir del siguiente mensaje, responde con UNA SOLA FRASE que resuma qué buscaba el cliente, sin inventar datos y sin dar contexto innecesario.

Ejemplo de salida: "El cliente preguntó por tipos de tenis deportivos y quedó a la espera de modelos."

MENSAJE:
"${mensaje}"
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Eres un generador de resumen de intención del cliente.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    })

    // Validar el estado HTTP de la respuesta
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OPENAI] Error en la solicitud a la API:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.slice(0, 200) // Limitamos para no saturar el log
      });
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }

    // Intentar parsear la respuesta como JSON
    let json;
    try {
      json = await response.json();
    } catch (parseError) {
      const rawResponse = await response.text();
      console.error('❌ [OPENAI] Error al parsear respuesta como JSON:', parseError.message, {
        rawResponse: rawResponse.slice(0, 200) // Mostrar parte de la respuesta cruda
      });
      throw parseError;
    }

    // Validar que la respuesta tenga la estructura esperada
    if (!json.choices || !json.choices[0]?.message?.content) {
      console.error('❌ [OPENAI] Respuesta de API no tiene la estructura esperada:', json);
      throw new Error('Respuesta de OpenAI no contiene choices o content');
    }

    const resumen = json.choices[0].message.content.trim();
    return resumen || '';
  } catch (err) {
    console.error('❌ Error generando resumen contextual IA:', {
      message: err.message,
      stack: err.stack
    });
    return '';
  }
}
