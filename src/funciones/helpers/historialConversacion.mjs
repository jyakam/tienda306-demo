// src/funciones/helpers/historialConversacion.mjs

export function actualizarHistorialConversacion(texto, state) {
  if (!texto || !state) return

  const historial = state.get('historialMensajes') || []
  const nuevoHistorial = [...historial, texto.trim()].slice(-5) // Mantener solo los últimos 5

  state.update({ historialMensajes: nuevoHistorial })
}

export function obtenerHistorialReciente(state) {
  const historial = state.get('historialMensajes') || []
  return historial.slice(-5).join(' ').toLowerCase()
}
