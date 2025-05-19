import 'dotenv/config'
import { AppSheetUser, getTable } from 'appsheet-connect'
import { getIdDocFromUrl, getTxtDoc } from 'googledocs-downloader'
import { cargarContactosDesdeAppSheet, getCacheContactos } from '../funciones/helpers/cacheContactos.mjs'

//TT APSHEET CREDENCIALES
const appsheetId = process.env.APPSHEET_ID
const appsheetKey = process.env.APPSHEET_KEY
console.log('🔧 APPSHEET_ID:', appsheetId ? 'Definido' : 'No definido')
console.log('🔧 APPSHEET_KEY:', appsheetKey ? 'Definido' : 'No definido')
export const APPSHEETCONFIG = new AppSheetUser(appsheetId, appsheetKey)
console.log('🔧 APPSHEETCONFIG:', APPSHEETCONFIG ? 'Creado' : 'No creado')

//FF CONFIGURACION DE BOT
export const BOT = {
  //BOT
  BOT: process.env.BOT_NAME,
  CONEXION: 'Conectado',
  ESTADO: true,

  //TIEMPOS
  DELAY: 0,
  ESPERA_MJS: 5,
  IDLE_TIME: 3,

  //IA GENERAL
  TEMPERATURA: 0.3,
  KEY_IA: '',

  //IA TEXTO
  MODELO_IA: 'gpt-4o-mini',
  TOKENS: 250,

  //IA IMAGENES
  PROCESAR_IMG: false,
  MODELO_IA_IMAGENES: 'gpt-4o-mini',
  TOKENS_IMAGENES: 1000,
  CALIDA_IMAGENES: 'auto',
  GENERAR_IMAGENES: false,

  //IA AUDIOS
  PROCESAR_AUDIOS: false,
  VELOCIDAD: 1.5,

  //BASE DE CONOCIMIENTOS
  URLPROMPT: '',

  //OTROS
  NUM_TEL: ''
}

//FF MENSAJES DEL BOT
export const MENSAJES = {
  ERROR: ''
}

//FF NOTIFICACIONES
export const NOTIFICACIONES = {
  AYUDA: true,
  DEST_AYUDA: [],
  ERROR: true,
  DEST_ERROR: []
}

//FF COMPORTAMIENTOS
export const CONTACTOS = {
  LISTA_CONTACTOS: []
}

//FF REFERENCIAS
export const ARCHIVO = {
  PROMPT_INFO: ''
}

//TT INICIAR BOT
export async function Inicializar() {
  console.log('🔄 INICIANDO DATOS DE BOT 🔜')
  try {
    console.log('🔍 Probando conexión con la tabla PRODUCTOS')
    const productosData = await getTable(APPSHEETCONFIG, 'PRODUCTOS')
    console.log('🔍 Datos de PRODUCTOS:', productosData)
  } catch (err) {
    console.error('❌ Error al intentar leer la tabla PRODUCTOS:', err.message)
  }
  await Promise.all([
    ActualizarBot(),
    ActualizarMensajes(),
    ActualizarContactos(),
    ActualizarNotificaciones()
  ])
}

//SS ACTUALIZAR BOT
export async function ActualizarBot() {
  try {
    console.log('🔍 Iniciando ActualizarBot')
    const data = await getTable(APPSHEETCONFIG, process.env.PAG_BOT)
    console.log('🔍 Datos de PAG_BOT:', data)
    const bot = data.find((obj) => obj.BOT === BOT.BOT)
    if (bot) {
      BOT.CONEXION = bot.CONEXION
      BOT.ESTADO = bot.ESTADO

      // TIEMPOS
      BOT.DELAY = parseInt(bot.DELAY, 10) || 0
      BOT.ESPERA_MJS = parseInt(bot.ESPERA_MJS, 10) || 5
      BOT.IDLE_TIME = parseInt(bot.IDLE_TIME, 10) || 3

      //IA GENERAL
      BOT.TEMPERATURA = parseFloat(bot.TEMPERATURA, 10) || 0.3
      BOT.KEY_IA = bot.KEY_IA || ''

      //IA TEXTO
      BOT.MODELO_IA = bot.MODELO_IA
      BOT.TOKENS = parseInt(bot.TOKENS, 10) || 250

      //IA IMAGENES
      BOT.PROCESAR_IMG = bot.PROCESAR_IMG
      BOT.MODELO_IA_IMAGENES = bot.MODELO_IA_IMAGENES
      BOT.TOKENS_IMAGENES = parseInt(bot.TOKENS_IMAGENES, 10) || 1000
      BOT.CALIDA_IMAGENES = bot.CALIDA_IMAGENES
      BOT.GENERAR_IMAGENES = bot.GENERAR_IMAGENES

      //IA AUDIOS
      BOT.PROCESAR_AUDIOS = bot.PROCESAR_AUDIOS
      BOT.VELOCIDAD = parseFloat(bot.VELOCIDAD, 10) || 1.5

      //BASE DE CONOCIMIENTOS
      if (bot.URLPROMPT !== '') {
        BOT.URLPROMPT = bot.URLPROMPT
        ARCHIVO.PROMPT_INFO = await getTxtDoc(getIdDocFromUrl(bot.URLPROMPT))
        console.log('✅ INFORMACION DE REFERENCIA CARGADA 📄')
      }

      //OTROS
      BOT.NUM_TEL = bot.NUM_TEL

      // 🧩 Configuración dinámica del nombre de hoja de productos
      BOT.PAG_PRODUCTOS = bot.PAG_PRODUCTOS || 'PRODUCTOS'

      console.table(BOT)
      return console.log('✅ INFORMACION DE BOT CARGADA 🤖')
    }

    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE REFERENCIA')
  } catch (err) {
    console.error('❌ Error en ActualizarBot:', err.message)
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE REFERENCIA')
  }
}

//SS ACTUALIZAR MENSAJE
export async function ActualizarMensajes() {
  try {
    const data = await getTable(APPSHEETCONFIG, process.env.PAG_MENSAJES)
    const bot = data.find((obj) => obj.BOT === BOT.BOT)
    if (bot) {
      MENSAJES.ERROR = bot.ERROR
      return console.log('✅ INFORMACION DE MENSAJES CARGADA')
    }
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE MENSAJES')
  } catch (err) {
    console.error('❌ Error en ActualizarMensajes:', err.message)
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE MENSAJES')
  }
}

//SS ACTUALIZAR CONTACTOS
export async function ActualizarContactos() {
  try {
    console.log('🔄 [CONTACTOS] Intentando cargar contactos desde AppSheet')
    console.log('🔍 [DEBUG] Contactos iniciales en LISTA_CONTACTOS:', CONTACTOS.LISTA_CONTACTOS); // Añadido
    await cargarContactosDesdeAppSheet()
    CONTACTOS.LISTA_CONTACTOS = getCacheContactos()
    console.log(`🗃️ [CONTACTOS] Cache sincronizada con ${CONTACTOS.LISTA_CONTACTOS.length} contactos`)
    return console.log('✅ INFORMACION DE CONTACTOS CARGADA')
  } catch (err) {
    console.error('❌ Error en ActualizarContactos:', err.message)
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE CONTACTOS')
  }
}

//SS ACTUALIZAR NOTIFICACIONES
export async function ActualizarNotificaciones() {
  try {
    const data = await getTable(APPSHEETCONFIG, process.env.PAG_NOTI)
    const bot = data.find((obj) => obj.BOT === BOT.BOT)
    if (bot) {
      NOTIFICACIONES.AYUDA = bot.AYUDA
      NOTIFICACIONES.DEST_AYUDA = String(bot.DEST_AYUDA).includes(' , ')
        ? bot.DEST_AYUDA.split(' , ')
        : [String(bot.DEST_AYUDA)]

      NOTIFICACIONES.ERROR = bot.ERROR
      NOTIFICACIONES.DEST_ERROR = String(bot.DEST_ERROR).includes(' , ')
        ? bot.DEST_ERROR.split(' , ')
        : [String(bot.DEST_ERROR)]

      return console.log('✅ INFORMACION DE NOTIFICACIONES CARGADA')
    }
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE NOTIFICACIONES')
  } catch (err) {
    console.error('❌ Error en ActualizarNotificaciones:', err.message)
    return console.error('❌ NO SE LOGRO CARGAR INFORMACION DE NOTIFICACIONES')
  }
}

//SS ACTUALIZAR FECHAS DE CONTACTO
export async function ActualizarFechas(phone) {
  const hoy = new Date().toLocaleDateString('es-CO')
  const contacto = CONTACTOS.LISTA_CONTACTOS.find(c => c.TELEFONO === phone)
  if (!contacto) return

  contacto.FECHA_ULTIMO_CONTACTO = hoy

  if (!contacto.FECHA_PRIMER_CONTACTO || contacto.FECHA_PRIMER_CONTACTO.trim() === '') {
    contacto.FECHA_PRIMER_CONTACTO = hoy
  }

  console.log(`🕓 [FECHAS] Contacto ${phone} → {`)
  console.log(`  FECHA_PRIMER_CONTACTO: '${contacto.FECHA_PRIMER_CONTACTO}',`)
  console.log(`  FECHA_ULTIMO_CONTACTO: '${contacto.FECHA_ULTIMO_CONTACTO}'`)
  console.log('}')
}
