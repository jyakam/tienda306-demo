import { getTable } from 'appsheet-connect'
import { APPSHEETCONFIG } from '../../config/bot.mjs'

const CACHE = { LISTA_CONTACTOS: [] }
console.log('🗃️ [CACHE_CONTACTOS] Inicializando caché de contactos')

export async function cargarContactosDesdeAppSheet() {
  try {
    console.log('🔄 [CACHE_CONTACTOS] Intentando cargar contactos desde AppSheet')
    const datos = await getTable(APPSHEETCONFIG, process.env.PAG_CONTACTOS)
    console.log(`📥 [CACHE_CONTACTOS] Datos recibidos de AppSheet:`, datos?.length, 'contactos')
    if (Array.isArray(datos)) {
      CACHE.LISTA_CONTACTOS = datos
      console.log(`🗃️ [CACHE_CONTACTOS] Cache de contactos actualizado (${CACHE.LISTA_CONTACTOS.length} registros)`)
    } else {
      console.warn('⚠️ [CACHE_CONTACTOS] Datos inválidos recibidos:', datos)
      CACHE.LISTA_CONTACTOS = []
    }
  } catch (e) {
    console.error('❌ [CACHE_CONTACTOS] Error cargando contactos:', e.message, e.stack)
    CACHE.LISTA_CONTACTOS = []
  }
  console.log(`🗃️ [CACHE_CONTACTOS] Estado actual de la caché:`, CACHE.LISTA_CONTACTOS.length, 'contactos')
}

export function getContactoByTelefono(telefono) {
  const contacto = CACHE.LISTA_CONTACTOS.find(c => c.TELEFONO === telefono) || null
  console.log('[DEBUG][USO] Tipo de contacto recibido:', typeof contacto, contacto)
  console.log(`🔍 [CACHE_CONTACTOS] Buscando ${telefono} en caché con ${CACHE.LISTA_CONTACTOS.length} contactos`)
  return contacto
}

export function actualizarContactoEnCache(contacto) {
  console.log(`🗃️ [CACHE_CONTACTOS] Actualizando contacto en caché:`, contacto)
  const idx = CACHE.LISTA_CONTACTOS.findIndex(c => c.TELEFONO === contacto.TELEFONO)
  if (idx >= 0) {
    CACHE.LISTA_CONTACTOS[idx] = { ...CACHE.LISTA_CONTACTOS[idx], ...contacto }
  } else {
    CACHE.LISTA_CONTACTOS.push(contacto)
  }
  console.log(`✅ [CACHE_CONTACTOS] Contacto ${contacto.TELEFONO} actualizado en caché`)
  console.log(`🗃️ [CACHE_CONTACTOS] Estado actual de la caché:`, CACHE.LISTA_CONTACTOS.length, 'contactos')
}

export function getCacheContactos() {
  return CACHE.LISTA_CONTACTOS
}
