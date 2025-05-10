// src/funciones/helpers/extractNombreProducto.mjs
export function extraerNombreProducto(respuesta = '') {
  try {
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

    const entreComillas = respuesta.match(/"(.*?)"/)
    if (entreComillas) return entreComillas[1].trim()

    const entreAsteriscos = respuesta.match(/\*(.*?)\*/)
    if (entreAsteriscos) return entreAsteriscos[1].trim()

    const palabrasClave = ['té', 'crema', 'yerba', 'ajo', 'vaselina', 'pepinillos']
    const palabras = respuesta.trim().split(/\s+/)
    const posibleProducto = palabras.filter(p => palabrasClave.some(k => p.toLowerCase().includes(k))).join(' ')
    if (posibleProducto && posibleProducto.length > 3) return posibleProducto

    return ''
  } catch (error) {
    console.error('❌ [extractNombreProducto] Error al procesar respuesta:', error)
    return ''
  }
}
