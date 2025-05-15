// src/config/contactos.mjs
import 'dotenv/config'
import { postTable } from 'appsheet-connect'
import { ObtenerContactos } from '../funciones/proveedor.mjs'
import { APPSHEETCONFIG, CONTACTOS, ActualizarContactos, ActualizarFechas } from './bot.mjs'

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
  'DIRECCION_2',         // <-- agregado
  'CIUDAD',
  'PAIS',
  'ESTADO_DEPARTAMENTO', // <-- agregado
  'ETIQUETA',
  'TIPO DE CLIENTE',
  'RESUMEN_ULTIMA_CONVERSACION'
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
  const contactos = ObtenerContactos()
  if (contactos && contactos !== 'DESCONECTADO') {
    const contactosNuevos = []
    const hoy = new Date().toLocaleDateString('es-CO')

    for (let i = 0; i < contactos.length; i++) {
      const telefono = contactos[i].id.split('@')[0]
      let nuevoContacto = {
        TELEFONO: telefono,
        NOMBRE: contactos[i].name || contactos[i].notify || 'Sin Nombre',
        RESP_BOT: 'Sí',
        ETIQUETA: 'Nuevo',
        FECHA_PRIMER_CONTACTO: hoy,
        FECHA_ULTIMO_CONTACTO: hoy
      }

      let encontrado = false
      for (let j = 0; j < CONTACTOS.LISTA_CONTACTOS.length; j++) {
        const id = CONTACTOS.LISTA_CONTACTOS[j].TELEFONO
        if (contactos[i].id.includes(id)) {
          nuevoContacto = CONTACTOS.LISTA_CONTACTOS[j]
          encontrado = true
          break
        }
      }

      if (!encontrado) {
        contactosNuevos.push(nuevoContacto)
      }
    }

    if (contactosNuevos.length > 0) {
      postTableWithRetry(APPSHEETCONFIG, process.env.PAG_CONTACTOS, contactosNuevos, propiedades).then(() =>
        ActualizarContactos()
      ).catch(err => {
        console.error(`❌ Error al sincronizar contactos nuevos:`, err.message)
      })
    }
  }
}

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

  const contactoExistente = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone) || {}
  const contactoFinal = {
    TELEFONO: phone,
    RESP_BOT: contactoExistente.RESP_BOT || 'Sí',
    ETIQUETA: contactoExistente.ETIQUETA || 'Cliente'
  }

  // Solo actualizar si el valor es nuevo o diferente al existente (incluye control para undefined/null)
  for (const campo in datos) {
    let valor = datos[campo]
    if (typeof valor === 'string') valor = valor.trim()

    if (
      (typeof valor === 'string' && valor !== '' && valor !== (contactoExistente[campo] ?? '')) ||
      (typeof valor === 'number' && valor !== (contactoExistente[campo] ?? undefined)) ||
      (typeof valor === 'boolean' && valor !== (contactoExistente[campo] ?? undefined))
    ) {
      if (campo === 'nombre') {
        const nombreValido = typeof valor === 'string' && valor !== 'Sin Nombre' && !/^[^\w\s]+$/.test(valor)
        if (nombreValido) contactoFinal.NOMBRE = valor
      } else {
        const campoNormalizado = campo.toUpperCase() === 'TIPO_CLIENTE' ? 'TIPO DE CLIENTE' : campo.toUpperCase()
        if (COLUMNAS_VALIDAS.includes(campoNormalizado)) {
          contactoFinal[campoNormalizado] = valor
        } else {
          console.warn(`⚠️ Campo ${campoNormalizado} no está en la tabla PAG_CONTACTOS, ignorado`)
        }
      }
    } else {
      console.log(`ℹ️ No se actualizó '${campo}' para ${phone}, valor sin cambios.`)
    }
  }

  const camposTotales = [
    'NOMBRE', 'EMAIL', 'CIUDAD', 'PAIS', 'DIRECCION', 'DIRECCION_2', 'ESTADO_DEPARTAMENTO',
    'IDENTIFICACION', 'TIPO DE CLIENTE', 'RESUMEN_ULTIMA_CONVERSACION'
  ]
  for (const campo of camposTotales) {
    if (!(campo in contactoFinal)) {
      const valAnterior = contactoExistente[campo]
      if (
        (typeof valAnterior === 'string' && valAnterior.trim() !== '') ||
        typeof valAnterior === 'number' ||
        typeof valAnterior === 'boolean'
      ) {
        contactoFinal[campo] = valAnterior
      }
    }
  }

  const sensibles = ['NOMBRE', 'EMAIL', 'CIUDAD', 'DIRECCION']
  for (const campo of sensibles) {
    const antes = contactoExistente[campo] ?? ''
    const nuevo = contactoFinal[campo] ?? ''
    const loCambioIA = campo.toLowerCase() in datos
    if (antes !== nuevo && !loCambioIA) {
      console.warn(`⚠️ CAMBIO MANUAL POSIBLE en '${campo}' para ${phone}:`)
      console.warn(`   ➤ Anterior: ${antes}`)
      console.warn(`   ➤ Nuevo:    ${nuevo}`)
    }
  }

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

  const camposObligatorios = ['TELEFONO']
  for (const campo of camposObligatorios) {
    if (!(campo in contactoLimpio) || contactoLimpio[campo] === undefined || contactoLimpio[campo] === '') {
      console.error(`⛔ Falta el campo obligatorio ${campo} para contacto ${phone}`)
      return
    }
  }

  await ActualizarFechas(phone)
  const contactoConFechas = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone)
  if (contactoConFechas) {
    if (contactoConFechas.FECHA_PRIMER_CONTACTO) {
      contactoLimpio.FECHA_PRIMER_CONTACTO = contactoConFechas.FECHA_PRIMER_CONTACTO
    }
    if (contactoConFechas.FECHA_ULTIMO_CONTACTO) {
      contactoLimpio.FECHA_ULTIMO_CONTACTO = contactoConFechas.FECHA_ULTIMO_CONTACTO
    }
  }

  console.log(`📲 [ACTUALIZAR CONTACTO] Para ${phone}:`, contactoLimpio)

  try {
    console.log(`📤 Enviando a postTable:`, { table: process.env.PAG_CONTACTOS, data: [contactoLimpio], propiedades })
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

    console.log(`✅ Contacto ${phone} actualizado correctamente.`)

  } catch (error) {
    console.error(`❌ Error actualizando contacto ${phone}:`, error.message)
  }
}
