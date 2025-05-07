// src/funciones/helpers/cacheProductos.mjs
import { obtenerTodosLosProductosAppSheet } from './leerProductosAppSheet.mjs'

export async function cargarProductosAlState(state) {
  const yaCargado = state.get('__productosCargados')
  let productos = state.get('_productosFull')

  if (yaCargado && Array.isArray(productos) && productos.length) {
    console.log('✅ Productos ya estaban en cache (state)')
    return productos
  }

  console.log('📦 Cargando productos por primera vez...')
  productos = await obtenerTodosLosProductosAppSheet()

  await state.update({
    _productosFull: productos,
    __productosCargados: true,
  })

  return productos
}
