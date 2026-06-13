// api/registro.js
// Verifica códigos de acceso y registra actividad en Google Sheets

const SHEET_ID = '1knAjCrUGBCdLXGl15b7bCzmix_uTto3MixM9YuQhqT4';
const CLIENT_EMAIL = 'asilo-sheets@asilo-app-499301.iam.gserviceaccount.com';
// La private key se guarda en variable de entorno en Vercel
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// ─── JWT para autenticación con Google ───────────────────────────────────────
async function getGoogleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Importar clave privada
  const keyData = PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryKey = Buffer.from(keyData, 'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput)
  );

  const jwt = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Leer hoja de Google Sheets ──────────────────────────────────────────────
async function leerSheet(token, rango) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rango)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.values || [];
}

// ─── Escribir en Google Sheets ───────────────────────────────────────────────
async function escribirSheet(token, rango, valores) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rango)}:append?valueInputOption=USER_ENTERED`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: valores })
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accion, codigo, detalle } = req.body;

  try {
    const token = await getGoogleToken();

    // ── VERIFICAR CÓDIGO ──────────────────────────────────────────────────────
    if (accion === 'verificar') {
      const filas = await leerSheet(token, 'Clientes!A:G');

      // Buscar código (columna A), ignorar encabezado
      const hoy = new Date();
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const codigoSheet = (fila[0] || '').trim().toUpperCase();
        const nombre = fila[1] || '';
        const tipo = fila[3] || 'individual';
        const fechaVence = fila[5] ? new Date(fila[5]) : null;
        const activo = (fila[6] || '').toLowerCase();

        if (codigoSheet === codigo.trim().toUpperCase()) {
          // Verificar si está activo
          if (activo === 'no') {
            return res.status(200).json({ valido: false, motivo: 'Código desactivado. Contacta a VersaPro Solution TX.' });
          }
          // Verificar fecha de vencimiento
          if (fechaVence && hoy > fechaVence) {
            return res.status(200).json({ valido: false, motivo: 'Tu acceso venció el ' + fila[5] + '. Contacta a VersaPro Solution TX para renovar.' });
          }
          // Código válido — registrar acceso
          const fechaHora = new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' });
          await escribirSheet(token, 'Actividad!A:E', [[fechaHora, codigo.toUpperCase(), nombre, 'ACCESO', 'Ingresó a la app']]);
          return res.status(200).json({ valido: true, nombre, tipo });
        }
      }
      return res.status(200).json({ valido: false, motivo: 'Código no encontrado. Verifica que sea correcto.' });
    }

    // ── REGISTRAR ACTIVIDAD ───────────────────────────────────────────────────
    if (accion === 'registrar') {
      const { nombre } = req.body;
      const fechaHora = new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' });
      await escribirSheet(token, 'Actividad!A:E', [[fechaHora, (codigo || '').toUpperCase(), nombre || '', detalle || '', '']]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });

  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({ error: error.message });
  }
};
