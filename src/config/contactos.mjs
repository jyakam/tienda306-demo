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

export async function ActualizarContacto(phone, datos = {}) {
  console.log(`📥 [CONTACTOS] Iniciando ActualizarContacto para ${phone} con datos:`, datos);

  try {
    if (typeof datos !== 'object') {
      console.log(`⛔ [CONTACTOS] Datos inválidos para contacto ${phone}`);
      return;
    }
    if (Object.keys(datos).length === 0) {
      console.log(`⛔ [CONTACTOS] No hay datos nuevos para actualizar contacto ${phone}`);
      await ActualizarFechas(phone);
      return;
    }

    // 1. Trae SIEMPRE el contacto más actualizado de la cache
    let contactoExistente = getContactoByTelefono(phone);
    if (!contactoExistente) {
      contactoExistente = {
        TELEFONO: phone,
        FECHA_PRIMER_CONTACTO: new Date().toLocaleDateString('es-CO'),
        FECHA_ULTIMO_CONTACTO: new Date().toLocaleDateString('es-CO'),
        RESP_BOT: 'Sí',
        ETIQUETA: 'Cliente'
      };
      console.log(`🆕 [CONTACTOS] Creando contacto base para ${phone}:`, contactoExistente);
    }

    // 2. BLINDAJE: Mezcla campos nuevos SOLO SI NO ESTÁN VACÍOS,
    //      y mantiene los previos si no hay actualización
    const contactoFinal = { ...contactoExistente };
    for (const campo of COLUMNAS_VALIDAS) {
      // Si el campo nuevo viene vacío o undefined, conserva el anterior
      if (campo in datos && datos[campo] !== undefined && datos[campo] !== null && (typeof datos[campo] === 'string' ? datos[campo].trim() !== '' : true)) {
        contactoFinal[campo] = datos[campo];
      }
      // Si no viene en datos, lo mantiene como está
      // (ya está cubierto por el spread ...contactoExistente arriba)
    }

    // 3. SIEMPRE pone el teléfono y los obligatorios (no dejar que se borren)
    contactoFinal.TELEFONO = phone;
    contactoFinal.RESP_BOT = contactoFinal.RESP_BOT || 'Sí';
    contactoFinal.ETIQUETA = contactoFinal.ETIQUETA || 'Cliente';

    // 4. LIMPIA el objeto para no mandar basura
    const contactoLimpio = Object.fromEntries(
      Object.entries(contactoFinal).filter(([key, v]) =>
        COLUMNAS_VALIDAS.includes(key) &&
        (
          (typeof v === 'string' && v.trim() !== '') ||
          typeof v === 'number' ||
          typeof v === 'boolean'
        )
      )
    );

    // 5. Verifica que tenga teléfono (obligatorio)
    if (!contactoLimpio.TELEFONO || contactoLimpio.TELEFONO === '') {
      console.error(`❌ [CONTACTOS] Falta campo TELEFONO para ${phone}`);
      return;
    }

    await ActualizarFechas(phone);

    const startTime = Date.now();
    console.log('⏱️ [DEBUG] Inicio de postTable para', phone);
    console.log(`[postTable] Enviando a AppSheet:`, { table: process.env.PAG_CONTACTOS, data: [contactoLimpio], propiedades });
    const resp = await postTableWithRetry(APPSHEETCONFIG, process.env.PAG_CONTACTOS, [contactoLimpio], propiedades);
    console.log('⏱️ [DEBUG] Fin de postTable para', phone, 'Tiempo:', Date.now() - startTime, 'ms');
    console.log(`[CONTACTOS] Respuesta de postTable para ${phone}:`, resp);
    if (!resp) {
      console.error(`❌ [CONTACTOS] postTable devolvió null/undefined para ${phone}`);
      actualizarContactoEnCache(contactoExistente);
      return contactoExistente;
    }

    // Actualiza la caché local
    actualizarContactoEnCache(contactoFinal);
    console.log(`✅ [CONTACTOS] Contacto ${phone} actualizado en caché.`);
  } catch (error) {
    console.error(`❌ [CONTACTOS] Error en ActualizarContacto para ${phone}:`, error.message, error.stack);
    actualizarContactoEnCache({ TELEFONO: phone, ...datos });
  }
}

