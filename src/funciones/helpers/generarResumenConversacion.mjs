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

    const json = await response.json()
    const resumen = json.choices?.[0]?.message?.content?.trim()
    return resumen || ''
  } catch (err) {
    console.log('❌ Error generando resumen contextual IA:', err.message)
    return ''
  }
}
