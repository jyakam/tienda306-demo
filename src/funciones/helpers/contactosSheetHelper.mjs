import { postTable } from 'appsheet-connect'
import { ObtenerFechaActual } from '../../funciones/tiempo.mjs'
import { APPSHEETCONFIG } from '../../config/bot.mjs'
// IMPORTANTE: importa la función para actualizar la cache
import { getContactoByTelefono, actualizarContactoEnCache } from './cacheContactos.mjs'

const PROPIEDADES = { UserSettings: { DETECTAR: false } }
const HOJA_CONTACTOS = process.env.PAG_CONTACTOS

export async function ActualizarFechasContacto(contacto, phone) {
  const hoy = ObtenerFechaActual()
  // BLINDAJE: Trae siempre el contacto completo de la caché
  let contactoCompleto = getContactoByTelefono(phone) || contacto || {}
  const datos = {
    ...contactoCompleto,
    TELEFONO: phone,
    FECHA_PRIMER_CONTACTO: contactoCompleto?.FECHA_PRIMER_CONTACTO || hoy,
    FECHA_ULTIMO_CONTACTO: hoy
  }

  console.log(`🕓 [FECHAS] Contacto ${phone} →`, datos)

  try {
    await postTable(APPSHEETCONFIG, HOJA_CONTACTOS, [datos], PROPIEDADES)
    console.log(`📆 Contacto ${phone} actualizado con fechas.`)
    // Actualiza la cache local con los datos nuevos
    actualizarContactoEnCache({ ...contactoCompleto, ...datos })
  } catch (err) {
    console.log(`❌ Error actualizando fechas para ${phone}:`, err.message)
    // Opcional: también actualiza la cache local aunque falle el postTable,
    actualizarContactoEnCache({ ...contactoCompleto, ...datos })
    console.log(`⚠️ Cache actualizada localmente para ${phone} pese a error en AppSheet`)
  }
}

export async function ActualizarResumenUltimaConversacion(contacto, phone, resumen) {
  console.log(`🧠 Intentando guardar resumen para ${phone}:`, resumen)

  if (
    !resumen ||
    resumen.length < 5 ||
    resumen.trim().startsWith('{') ||
    resumen.trim().startsWith('```json') ||
    resumen.toLowerCase().includes('"nombre"') ||
    resumen.toLowerCase().includes('"email"')
  ) {
    console.log(`⛔ Resumen ignorado por formato inválido para ${phone}`)
    return
  }

  // BLINDAJE: Trae siempre el contacto completo de la caché
  let contactoCompleto = getContactoByTelefono(phone) || contacto || {}

  const datos = {
    ...contactoCompleto,
    TELEFONO: phone,
    RESUMEN_ULTIMA_CONVERSACION: resumen.trim()
  }

  try {
    await postTable(APPSHEETCONFIG, HOJA_CONTACTOS, [datos], PROPIEDADES)
    console.log(`📝 Resumen actualizado para ${phone}`)
    // Actualiza la cache local con el resumen nuevo y todos los datos previos
    actualizarContactoEnCache({ ...contactoCompleto, ...datos })
  } catch (err) {
    console.log(`❌ Error guardando resumen para ${phone}:`, err.message)
    // Opcional: también actualiza la cache local aunque falle el postTable
    actualizarContactoEnCache({ ...contactoCompleto, ...datos })
    console.log(`⚠️ Cache actualizada localmente para ${phone} pese a error en AppSheet`)
  }
}

