export function filtrarPorTextoLibre(productos = [], texto = '', state = null) {
  if (!productos.length || !texto.trim()) return []

  const normalizar = (str) =>
    str.toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9&]/gi, ' ') // Preservar "&" para nombres como "Lemon & Echinacea"
      .trim()

  const normalizarCategoria = (cat = '') =>
    cat.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/s\b/, '')
      .replace(/s$/, '')
      .trim()

  const query = normalizar(texto)
  const palabras = query.split(/\s+/).filter(Boolean)
  console.log('🔍 [filtrarPorTextoLibre] Texto recibido:', texto, '→ Palabras:', palabras)

  // Obtener productoReconocidoPorIA desde el estado, si está disponible
  const productoReconocido = state?.get('productoReconocidoPorIA') || ''
  const productoReconocidoNormalizado = productoReconocido ? normalizar(productoReconocido) : ''
  console.log('🔍 [filtrarPorTextoLibre] productoReconocidoPorIA:', productoReconocidoNormalizado)

  const coincidencias = productos.map((p) => {
    let score = 0

    const comparar = (valor, peso) => {
      const campo = normalizar(valor || '')
      for (const palabra of palabras) {
        if (campo.includes(palabra)) score += peso
      }
      // Peso adicional para productoReconocidoPorIA
      if (productoReconocidoNormalizado && campo.includes(productoReconocidoNormalizado)) {
        score += 10 // Peso alto para priorizar productoReconocidoPorIA
      }
    }

    comparar(p.CATEGORIA, 4)
    comparar(p.NOMBRE, 3)
    comparar(p.DESCRIPCION, 2)

    const otros = Object.entries(p)
      .filter(([k, v]) => {
        const key = k.toLowerCase()
        const isUrl = typeof v === 'string' && v.startsWith('http')
        const isImage = isUrl && /\.(jpg|jpeg|png|gif)$/i.test(v)
        return (
          typeof v === 'string' &&
          !key.includes('pdf') &&
          !key.includes('archivo') &&
          (!isUrl || isImage)
        )
      })
      .map(([_, v]) => v)

    for (const campo of otros) {
      comparar(campo, 1)
    }

    if (score > 0) {
      console.log(`✅ [filtrarPorTextoLibre] Coincidencia en producto "${p.NOMBRE}" con categoría "${p.CATEGORIA}" → Score: ${score}`)
    }

    return { ...p, _score: score }
  })

  const coincidenciasConScore = coincidencias
    .filter(p => p._score >= 5) // Aumentar umbral para reducir falsos positivos

  const prioridad = ['tratamiento 3 mes', 'tratamiento 2 mes', 'tratamiento 1 mes', 'kit', 'tratamiento', 'individual']

  const resultadoOrdenado = coincidenciasConScore.sort((a, b) => {
    const scoreDiff = b._score - a._score
    if (scoreDiff !== 0) return scoreDiff
    const ia = prioridad.indexOf(normalizarCategoria(a.CATEGORIA))
    const ib = prioridad.indexOf(normalizarCategoria(b.CATEGORIA))
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  console.log('🎯 [filtrarPorTextoLibre] Coincidencias con score ≥ 5 y ordenadas por prioridad:', resultadoOrdenado.length)

  if (!resultadoOrdenado.length) {
    console.log('⚠️ [filtrarPorTextoLibre] No hubo coincidencias relevantes, devolviendo primeros destacados...')
    return productos.slice(0, 3)
  }

  return resultadoOrdenado
}
