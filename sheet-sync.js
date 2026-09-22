// Vercel Serverless Function: /api/sheet-sync
// Menulis rekap harian ke Google Spreadsheet yang sudah ada, setiap kali
// checklist di web berubah. Dua tab otomatis dibuat/diisi:
//   - "Rekap Harian": 1 baris per tanggal (Tanggal, Total Tugas, Selesai, Persentase, Kategori)
//   - "Detail Tugas": rincian status tiap tugas per tanggal
//
// Butuh 3 environment variable di Vercel (lihat README.md untuk cara setup):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY
//   GOOGLE_SHEET_ID   (opsional — default ke ID spreadsheet yang sudah dipakai)

import { google } from 'googleapis';

const DEFAULT_SHEET_ID = '1Qx-_jylD67oicJ4DX7Rl07oIOF06pdtovjKX9PJILHc';
const SUMMARY_TAB = 'Rekap Harian';
const DETAIL_TAB = 'Detail Tugas';
const SUMMARY_HEADERS = ['Tanggal', 'Total Tugas', 'Selesai', 'Persentase', 'Kategori'];
const DETAIL_HEADERS = ['Tanggal', 'Tugas', 'Kategori', 'Status'];

function getAuth(){
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key){
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY belum di-set di environment variables.');
  }
  return new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets']);
}

async function ensureTab(sheets, spreadsheetId, title, headers){
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === title);
  if (!exists){
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
  }
}

async function upsertSummaryRow(sheets, spreadsheetId, row){
  const range = `${SUMMARY_TAB}!A:A`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const col = existing.data.values || [];
  const rowIndex = col.findIndex(r => r[0] === row[0]); // match by Tanggal, skip header row 0
  if (rowIndex > 0){
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SUMMARY_TAB}!A${rowIndex + 1}:E${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SUMMARY_TAB}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
  }
}

async function upsertDetailRows(sheets, spreadsheetId, date, detailRows){
  const range = `${DETAIL_TAB}!A:D`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const all = existing.data.values || [];
  const header = all.length ? all[0] : DETAIL_HEADERS;
  const rest = all.slice(1).filter(r => r[0] !== date); // drop old rows for this date
  const newRows = detailRows.map(d => [date, d.task, d.category, d.status]);
  const combined = [header, ...rest, ...newRows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DETAIL_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: combined }
  });
  // Clear any leftover rows below the new data (in case the tab shrank)
  const clearFromRow = combined.length + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${DETAIL_TAB}!A${clearFromRow}:D${clearFromRow + 500}`
  }).catch(() => {});
}

export default async function handler(req, res){
  if (req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: `Method ${req.method} tidak didukung.` });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { date, summary, details } = body || {};
    if (!date || !summary){
      res.status(400).json({ error: 'Field "date" dan "summary" wajib diisi.' });
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets, spreadsheetId, SUMMARY_TAB, SUMMARY_HEADERS);
    await ensureTab(sheets, spreadsheetId, DETAIL_TAB, DETAIL_HEADERS);

    await upsertSummaryRow(sheets, spreadsheetId, [
      date, summary.total, summary.done, `${summary.pct}%`, summary.kategori
    ]);

    if (Array.isArray(details) && details.length){
      await upsertDetailRows(sheets, spreadsheetId, date, details);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error /api/sheet-sync:', err);
    res.status(500).json({ error: 'Gagal sinkron ke spreadsheet.', detail: String(err && err.message || err) });
  }
}
