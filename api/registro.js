const { google } = require('googleapis');

const SHEET_ID = '1knAjCrUGBCdLXGl15b7bCzmix_uTto3MixM9YuQhqT4';

function getAuth() {
  return new google.auth.JWT(
    'asilo-sheets@asilo-app-499301.iam.gserviceaccount.com',
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accion, codigo, nombre, detalle } = req.body;

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (accion === 'verificar') {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Clientes!A:G'
      });

      const filas = result.data.values || [];
      const hoy = new Date();

      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const codigoSheet = (fila[0] || '').trim().toUpperCase();
        if (codigoSheet === codigo.trim().toUpperCase()) {
          const activo = (fila[6] || '').toLowerCase();
          if (activo === 'no') {
            return res.status(200).json({ valido: false, motivo: 'Código desactivado. Contacta a VersaPro Solution TX.' });
          }
          const fechaVence = fila[5] ? new Date(fila[5]) : null;
          if (fechaVence && hoy > fechaVence) {
            return res.status(200).json({ valido: false, motivo: 'Tu acceso venció el ' + fila[5] + '. Contacta a VersaPro Solution TX para renovar.' });
          }
          const fechaHora = new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' });
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Actividad!A:E',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[fechaHora, codigo.toUpperCase(), fila[1] || '', 'ACCESO', 'Ingresó a la app']] }
          });
          return res.status(200).json({ valido: true, nombre: fila[1], tipo: fila[3] });
        }
      }
      return res.status(200).json({ valido: false, motivo: 'Código no encontrado. Verifica que sea correcto.' });
    }

    if (accion === 'registrar') {
      const fechaHora = new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Actividad!A:E',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[fechaHora, (codigo || '').toUpperCase(), nombre || '', detalle || '', '']] }
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
