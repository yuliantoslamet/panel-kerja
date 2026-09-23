// Vercel Serverless Function: /api/sheet-sync
// Meneruskan rekap harian ke Google Apps Script Web App secara otomatis

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

    const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    if (!scriptUrl){
      throw new Error('GOOGLE_APPS_SCRIPT_URL belum di-set di environment variables Vercel.');
    }

    // Kirim data ke URL Web App Google Apps Script
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, summary, details })
    });

    if (!response.ok) {
      throw new Error('Gagal menghubungi Google Apps Script, HTTP ' + response.status);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error('Apps Script error: ' + (result.message || 'Unknown error'));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error /api/sheet-sync:', err);
    res.status(500).json({ error: 'Gagal sinkron ke spreadsheet.', detail: String(err && err.message || err) });
  }
}