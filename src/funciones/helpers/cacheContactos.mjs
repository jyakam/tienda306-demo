// src/funciones/helpers/cacheContactos.mjs
import { getTable, postTable } from 'appsheet-connect'
import { APPSHEETCONFIG } from '../../config/bot.mjs'

const CACHE = { LISTA_CONTACTOS: [] }

// Carga TODOS los contactos de AppSheet al arrancar el bot
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

// Trae contacto por teléfono desde cache (agrega el +57 si lo necesitas)
export function getContactoByTelefono(telefono) {
  return CACHE.LISTA_CONTACTOS.find(c => c.TELEFONO === telefono) || null
}

// Actualiza un contacto puntual en el cache
export function actualizarContactoEnCache(contacto) {
  const idx = CACHE.LISTA_CONTACTOS.findIndex(c => c.TELEFONO === contacto.TELEFONO)
  if (idx >= 0) {
    CACHE.LISTA_CONTACTOS[idx] = { ...CACHE.LISTA_CONTACTOS[idx], ...contacto }
  } else {
    CACHE.LISTA_CONTACTOS.push(contacto)
  }
}

// Si no está en cache, lo trae directo de AppSheet, lo busca en la tabla y lo guarda en cache
export async function fetchContactoDesdeAppSheet(telefono) {
  try {
    // Trae toda la tabla, filtra el contacto en memoria
    const datos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS)
    if (Array.isArray(datos)) {
      const contacto = datos.find(c => c.TELEFONO === telefono)
      if (contacto) {
        actualizarContactoEnCache(contacto)
        return contacto
      }
    }
    return null
  } catch (e) {
    console.error('❌ [CACHE_CONTACTOS] Error buscando contacto puntual:', e)
    return null
  }
}

export function getCacheContactos() {
  return CACHE.LISTA_CONTACTOS
}
