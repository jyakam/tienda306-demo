// src/funciones/helpers/cacheContactos.mjs
import { getTable } from 'appsheet-connect'
import { APPSHEETCONFIG } from '../../config/bot.mjs'

const CACHE = { LISTA_CONTACTOS: [] }

/**
 * Carga TODOS los contactos desde AppSheet (solo úsalo si lo necesitas masivamente).
 * No recomendado salvo para migración/administrador.
 */
export async function cargarContactosDesdeAppSheet() {
  try {
    const datos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS)
    if (Array.isArray(datos)) {
      CACHE.LISTA_CONTACTOS = datos
      console.log(`🗃️ [CACHE_CONTACTOS] Cache de contactos actualizado (${CACHE.LISTA_CONTACTOS.length} registros)`)
    } else {
      console.warn('⚠️ [CACHE_CONTACTOS] No se pudo cargar contactos: datos inválidos')
    }
  } catch (e) {
    console.error('❌ [CACHE_CONTACTOS] Error cargando contactos:', e)
  }
}

/**
 * Busca un contacto por teléfono desde cache.
 * Si no está, lo trae de AppSheet, lo agrega al cache y lo retorna.
 * ¡Siempre usar esta función para obtener el contacto actualizado!
 */
export async function getContactoByTelefono(telefono) {
  let contacto = CACHE.LISTA_CONTACTOS.find(c => c.TELEFONO === telefono)
  if (!contacto) {
    // Busca solo ese contacto desde AppSheet y actualiza el cache puntual
    const nuevos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS, { filter: { TELEFONO: telefono } })
    if (Array.isArray(nuevos) && nuevos.length > 0) {
      contacto = nuevos[0]
      actualizarContactoEnCache(contacto)
    }
  }
  return contacto || null
}

/**
 * Actualiza un contacto puntual en el cache.
 */
export function actualizarContactoEnCache(contacto) {
  if (!contacto || !contacto.TELEFONO) return
  const idx = CACHE.LISTA_CONTACTOS.findIndex(c => c.TELEFONO === contacto.TELEFONO)
  if (idx >= 0) {
    CACHE.LISTA_CONTACTOS[idx] = { ...CACHE.LISTA_CONTACTOS[idx], ...contacto }
  } else {
    CACHE.LISTA_CONTACTOS.push(contacto)
  }
}

/**
 * Trae (y cachea) un contacto puntual de AppSheet por si necesitas forzar la recarga
 */
export async function fetchContactoDesdeAppSheet(telefono) {
  try {
    const datos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS, { filter: { TELEFONO: telefono } })
    if (Array.isArray(datos) && datos[0]) {
      actualizarContactoEnCache(datos[0])
      return datos[0]
    }
    return null
  } catch (e) {
    console.error('❌ [CACHE_CONTACTOS] Error buscando contacto puntual:', e)
    return null
  }
}

/**
 * Devuelve la lista actual de contactos en cache.
 */
export function getCacheContactos() {
  return CACHE.LISTA_CONTACTOS
}
