// src/config/contactos.mjs
import 'dotenv/config'
import { postTable } from 'appsheet-connect'
// import { ObtenerContactos } from '../funciones/proveedor.mjs'  // (¡Ya no es necesario si usas cache!)
import { APPSHEETCONFIG, ActualizarContactos, ActualizarFechas } from './bot.mjs'

// Importa helpers del cache de contactos
import {
  getContactoByTelefono,
  actualizarContactoEnCache
} from '../funciones/helpers/cacheContactos.mjs'

const propiedades = {
  UserSettings: { DETECTAR: false }
}

const COLUMNAS_VALIDAS = [
  'FECHA_PRIMER_CONTACTO',
  'FECHA_ULTIMO_CONTACTO',
  'TELEFONO',
  'NOMBRE',
  'RESP_BOT',
  'IDENTIFICACION',
  'EMAIL',
  'DIRECCION',
  'DIRECCION_2',
  'CIUDAD',
  'PAIS',
  'ESTADO_DEPARTAMENTO',
  'ETIQUETA',
  'TIPO DE CLIENTE',
  'RESUMEN_ULTIMA_CONVERSACION',
  'NUMERO_DE_TELEFONO_SECUNDARIO'
]

async function postTableWithRetry(config, table, data, props, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await postTable(config, table, data, props)
      if (!resp) {
        console.warn(`⚠️ Respuesta vacía de postTable para tabla ${table}`)
        return []
      }
      if (typeof resp === 'string') {
        try { return JSON.parse(resp) }
        catch (err) {
          console.warn(`⚠️ Respuesta no-JSON de postTable: ${resp}`)
          return []
        }
      }
      return resp
    } catch (err) {
      console.warn(`⚠️ Intento ${i + 1} fallido para postTable: ${err.message}, reintentando en ${delay}ms...`)
      if (i === retries - 1) {
        console.error(`❌ Error en postTable tras ${retries} intentos: ${err.message}`)
        return []
      }
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

export function SincronizarContactos() {
  // ... igual a tu versión, sin cambios ...
}

// ----> FUNCION PRINCIPAL BLINDADA + USANDO CACHE <----
export async function ActualizarContacto(phone, datos = {}) {
  if (typeof datos !== 'object') {
    console.log(`⛔ Datos inválidos para contacto ${phone}`)
    return
  }
  if (Object.keys(datos).length === 0) {
    console.log(`⛔ No hay datos nuevos para actualizar contacto ${phone}`)
    await ActualizarFechas(phone)
    return
  }

  // SIEMPRE busca el contacto más actualizado (puede venir de AppSheet si no está en RAM)
  let contactoExistente = await getContactoByTelefono(phone)
  if (!contactoExistente) {
    // Si no existe, crea el contacto básico (solo número y fechas)
    contactoExistente = {
      TELEFONO: phone,
      FECHA_PRIMER_CONTACTO: new Date().toLocaleDateString('es-CO'),
      FECHA_ULTIMO_CONTACTO: new Date().toLocaleDateString('es-CO'),
      RESP_BOT: 'Sí',
      ETIQUETA: 'Cliente'
    }
  }

  // DEBUG LOGS previos
  console.log(`👁️‍🗨️ [CONTACTO ANTERIOR]:`, JSON.stringify(contactoExistente, null, 2))
  console.log(`🆕 [DATOS RECIBIDOS]:`, JSON.stringify(datos, null, 2))

  // Merge: todos los campos previos + los nuevos, NO borra lo anterior
  const contactoFinal = { ...contactoExistente }

  // Proteger la clave TELEFONO
  contactoFinal.TELEFONO = phone
  contactoFinal.RESP_BOT = contactoExistente.RESP_BOT || 'Sí'
  contactoFinal.ETIQUETA = contactoExistente.ETIQUETA || 'Cliente'

  for (const campo in datos) {
    let valor = datos[campo]
    if (typeof valor === 'string') valor = valor.trim()
    // Nunca actualices TELEFONO a un número diferente: guárdalo como secundario si aplica
    if (campo.toUpperCase() === 'TELEFONO' && valor !== phone) {
      if (valor && valor !== contactoFinal.NUMERO_DE_TELEFONO_SECUNDARIO) {
        contactoFinal.NUMERO_DE_TELEFONO_SECUNDARIO = valor
      }
      continue
    }
    // Solo actualiza si el valor NO es vacío
    if (
      (typeof valor === 'string' && valor !== '') ||
      typeof valor === 'number' ||
      typeof valor === 'boolean'
    ) {
      const campoNormalizado = campo.toUpperCase() === 'TIPO_CLIENTE' ? 'TIPO DE CLIENTE' : campo.toUpperCase()
      if (COLUMNAS_VALIDAS.includes(campoNormalizado)) {
        contactoFinal[campoNormalizado] = valor
      } else {
        console.warn(`⚠️ Campo ${campoNormalizado} no está en la tabla PAG_CONTACTOS, ignorado`)
      }
    }
  }

  // Preserva los campos previos que no fueron enviados ni borrados
  for (const campo of COLUMNAS_VALIDAS) {
    if (!(campo in contactoFinal) && contactoExistente[campo] !== undefined && contactoExistente[campo] !== null) {
      contactoFinal[campo] = contactoExistente[campo]
    }
  }

  // Solo envía campos válidos y con valor
  const contactoLimpio = Object.fromEntries(
    Object.entries(contactoFinal).filter(([key, v]) =>
      COLUMNAS_VALIDAS.includes(key) &&
      (
        (typeof v === 'string' && v.trim() !== '') ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      )
    )
  )

  // LOG después del merge
  console.log(`🧩 [CONTACTO A GUARDAR]:`, JSON.stringify(contactoLimpio, null, 2))

  // Validar campos obligatorios
  const camposObligatorios = ['TELEFONO']
  for (const campo of camposObligatorios) {
    if (!(campo in contactoLimpio) || contactoLimpio[campo] === undefined || contactoLimpio[campo] === '') {
      console.error(`⛔ Falta el campo obligatorio ${campo} para contacto ${phone}`)
      return
    }
  }

  await ActualizarFechas(phone)
  // Si quieres: después de fechas, podrías recargar el contacto otra vez por seguridad
  // contactoExistente = await getContactoByTelefono(phone)

  try {
    console.log(`📤 [postTable] Enviando a AppSheet:`, { table: process.env.PAG_CONTACTOS, data: [contactoLimpio], propiedades })
    const resp = await postTableWithRetry(APPSHEETCONFIG, process.env.PAG_CONTACTOS, [contactoLimpio], propiedades)
    if (!resp) {
      console.error(`❌ postTable devolvió null/undefined para contacto ${phone}`)
      throw new Error('Respuesta vacía de AppSheet')
    }
    if (typeof resp === 'string') {
      try {
        const parsed = JSON.parse(resp)
        console.log(`📦 postTable JSON parseado:`, parsed)
      } catch (err) {
        console.error(`❌ postTable devolvió un string no-JSON:`, resp)
        throw new Error(`Respuesta no-JSON de AppSheet: ${resp}`)
      }
    } else if (resp?.status && resp.status >= 400) {
      console.error(`❌ AppSheet devolvió HTTP ${resp.status}:`, resp.statusText || resp)
      throw new Error(`Error HTTP ${resp.status} de AppSheet`)
    } else {
      console.log(`📦 Respuesta de postTable:`, resp)
    }

    // *** ACTUALIZA el cache local SIEMPRE que hay update exitoso ***
    actualizarContactoEnCache(contactoFinal)
    console.log(`✅ Contacto ${phone} actualizado correctamente (cache actualizado).`)

  } catch (error) {
    console.error(`❌ Error actualizando contacto ${phone}:`, error.message)
  }
}
