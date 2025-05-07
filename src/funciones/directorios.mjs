import fs from 'fs'
import cron from 'node-cron' // Asegúrate de tener instalado 'node-cron'
import path from 'path'
const tempDir = './temp'

//TT GENERAR CARPETA TEMP
/**
 * Revisa si el directorio temporal existe y lo crea si no existe.
 */
export function RevisarTemp() {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir)
  }
}

//TT BORRAR DATOS DE CARPETA TEMP
/**
 * Programa un evento cron para borrar archivos en la carpeta temporal.
 */
export async function BorrarTemp() {
  cron.schedule('0 5 * * *', async () => {
    try {
      const files = await fs.readdir(tempDir) // Lee los archivos en la carpeta
      for (const file of files) {
        const filePath = path.join(tempDir, file)
        try {
          await fs.unlink(filePath) // Elimina el archivo
          console.log(`🗑️ Archivo ${file} borrado exitosamente`)
        } catch (err) {
          console.error(`Error borrando el archivo ${file}:`, err)
        }
      }
    } catch (err) {
      console.error('Error leyendo la carpeta:', err)
    }
  })
}
