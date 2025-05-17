// src/funciones/helpers/contactosSheetHelper.mjs
import { postTable } from 'appsheet-connect'
import { ObtenerFechaActual } from '../../funciones/tiempo.mjs'
import { APPSHEETCONFIG } from '../../config/bot.mjs'
// IMPORTANTE: importa la función para actualizar la cache
import { actualizarContactoEnCache } from './cacheContactos.mjs'

const PROPIEDADES = { UserSettings: { DETECTAR: false } }
const HOJA_CONTACTOS = process.env.PAG_CONTACTOS

export async function ActualizarFechasContacto(contacto, phone) {
  const hoy = ObtenerFechaActual()
  const fechaPrimer = contacto?.FECHA_PRIMER_CONTACTO?.split(' ')[0] || null
  const fechaUltimo = contacto?.FECHA_ULTIMO_CONTACTO?.split(' ')[0] || null

  const datos = {
    TELEFONO: phone,
    FECHA_PRIMER_CONTACTO: fechaPrimer || hoy,
    FECHA_ULTIMO_CONTACTO: fechaUltimo !== hoy ? hoy : contacto.FECHA_ULTIMO_CONTACTO
  }

  console.log(`🕓 [FECHAS] Contacto ${phone} →`, datos)

  try {
    await postTable(APPSHEETCONFIG, HOJA_CONTACTOS, [datos], PROPIEDADES)
    console.log(`📆 Contacto ${phone} actualizado con fechas.`)
    // Actualiza la cache local con los datos nuevos
    actualizarContactoEnCache({ ...contacto, ...datos })
  } catch (err) {
    console.log(`❌ Error actualizando fechas para ${phone}:`, err.message)
    // Opcional: también actualiza la cache local aunque falle el postTable,
    // para mantener coherencia y resiliencia temporal
    actualizarContactoEnCache({ ...contacto, ...datos })
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

  const datos = {
    TELEFONO: phone,
    RESUMEN_ULTIMA_CONVERSACION: resumen.trim()
  }

  try {
    await postTable(APPSHEETCONFIG, HOJA_CONTACTOS, [datos], PROPIEDADES)
    console.log(`📝 Resumen actualizado para ${phone}`)
    // Actualiza la cache local con el resumen nuevo
    actualizarContactoEnCache({ ...contacto, ...datos })
  } catch (err) {
    console.log(`❌ Error guardando resumen para ${phone}:`, err.message)
    // Opcional: también actualiza la cache local aunque falle el postTable
    actualizarContactoEnCache({ ...contacto, ...datos })
    console.log(`⚠️ Cache actualizada localmente para ${phone} pese a error en AppSheet`)
  }
}
