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

    let contactoExistente = await getContactoByTelefono(phone);
    console.log(`🔍 [CONTACTOS] Contacto existente para ${phone}:`, contactoExistente);
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

    const contactoFinal = { ...contactoExistente };
    contactoFinal.TELEFONO = phone;
    contactoFinal.RESP_BOT = contactoExistente.RESP_BOT || 'Sí';
    contactoFinal.ETIQUETA = contactoExistente.ETIQUETA || 'Cliente';

    for (const campo in datos) {
      let valor = datos[campo];
      if (typeof valor === 'string') valor = valor.trim();
      if (campo.toUpperCase() === 'TELEFONO' && valor !== phone) {
        if (valor && valor !== contactoFinal.NUMERO_DE_TELEFONO_SECUNDARIO) {
          contactoFinal.NUMERO_DE_TELEFONO_SECUNDARIO = valor;
        }
        continue;
      }
      if (
        (typeof valor === 'string' && valor !== '') ||
        typeof valor === 'number' ||
        typeof valor === 'boolean'
      ) {
        const campoNormalizado = campo.toUpperCase() === 'TIPO_CLIENTE' ? 'TIPO DE CLIENTE' : campo.toUpperCase();
        if (COLUMNAS_VALIDAS.includes(campoNormalizado)) {
          contactoFinal[campoNormalizado] = valor;
        } else {
          console.warn(`⚠️ [CONTACTOS] Campo ${campoNormalizado} no está en la tabla PAG_CONTACTOS, ignorado`);
        }
      }
    }

    for (const campo of COLUMNAS_VALIDAS) {
      if (!(campo in contactoFinal) && contactoExistente[campo] !== undefined && contactoExistente[campo] !== null) {
        contactoFinal[campo] = contactoExistente[campo];
      }
    }

    console.log(`🔄 [CONTACTOS] Contacto final para ${phone}:`, contactoFinal);

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
    console.log(`🧹 [CONTACTOS] Contacto limpio para ${phone}:`, contactoLimpio);

    const camposObligatorios = ['TELEFONO'];
    for (const campo of camposObligatorios) {
      if (!(campo in contactoLimpio) || contactoLimpio[campo] === undefined || contactoLimpio[campo] === '') {
        console.error(`❌ [CONTACTOS] Falta campo obligatorio ${campo} para ${phone}`);
        return;
      }
    }

    await ActualizarFechas(phone);

    console.log(`📤 [postTable] Enviando a AppSheet para ${phone}:`, { table: process.env.PAG_CONTACTOS, data: [contactoLimpio], propiedades });
    const resp = await postTableWithRetry(APPSHEETCONFIG, process.env.PAG_CONTACTOS, [contactoLimpio], propiedades);
    console.log(`📦 [CONTACTOS] Respuesta de postTable para ${phone}:`, resp);
    if (!resp) {
      console.error(`❌ [CONTACTOS] postTable devolvió null/undefined para ${phone}`);
      throw new Error('Respuesta vacía de AppSheet');
    }

    console.log(`🗃️ [CONTACTOS] Actualizando caché para ${phone} con:`, contactoFinal);
    actualizarContactoEnCache(contactoFinal);
    console.log(`✅ [CONTACTOS] Contacto ${phone} actualizado en caché.`);
  } catch (error) {
    console.error(`❌ [CONTACTOS] Error en ActualizarContacto para ${phone}:`, error.message, error.stack);
    console.log(`🗃️ [CONTACTOS] Forzando actualización de caché para ${phone} pese a error`);
    actualizarContactoEnCache({ TELEFONO: phone, ...datos });
  }
}
