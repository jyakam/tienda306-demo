import { getTable, postTable } from 'appsheet-connect'
import { APPSHEETCONFIG } from '../../config/bot.mjs'

const CACHE = { LISTA_CONTACTOS: [] }

// Carga TODOS los contactos de AppSheet al arrancar el bot o al primer uso
export async function cargarContactosDesdeAppSheet() {
  try {
    const datos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS)
    if (Array.isArray(datos)) {
      CACHE.LISTA_CONTACTOS = datos
      console.log(`🗃️ [CACHE_CONTACTOS] Cache de contactos actualizado (${CACHE.LISTA_CONTACTOS.length} registros)`)
    } else {
      console.warn('⚠️ [CACHE_CONTACTOS] No se pudo cargar contactos: datos inválidos')
      CACHE.LISTA_CONTACTOS = []
    }
  } catch (e) {
    console.error('❌ [CACHE_CONTACTOS] Error cargando contactos:', e)
    CACHE.LISTA_CONTACTOS = []
  }
}

// Trae contacto por teléfono desde cache (sincrónico y NUNCA retorna Promise)
export function getContactoByTelefono(telefono) {
  const contacto = CACHE.LISTA_CONTACTOS.find(c => c.TELEFONO === telefono) || null
  // Debug para asegurarte de lo que devuelve
  console.log('[DEBUG][USO] Tipo de contacto recibido:', typeof contacto, contacto)
  return contacto
}

// Actualiza un contacto puntual en el cache (en memoria)
export function actualizarContactoEnCache(contacto) {
  const idx = CACHE.LISTA_CONTACTOS.findIndex(c => c.TELEFONO === contacto.TELEFONO)
  if (idx >= 0) {
    CACHE.LISTA_CONTACTOS[idx] = { ...CACHE.LISTA_CONTACTOS[idx], ...contacto }
  } else {
    CACHE.LISTA_CONTACTOS.push(contacto)
  }
}

// Si no está en cache, puedes traer TODA la tabla y buscarlo, pero eso solo si lo necesitas.
// Por ahora, solo trabaja con cache en RAM, como tu sistema lo usa actualmente.

export function getCacheContactos() {
  return CACHE.LISTA_CONTACTOS
}
