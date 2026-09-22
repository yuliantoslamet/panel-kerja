// Vercel Serverless Function: /api/data
// Stores and returns the entire Panel Kerja Harian state as one JSON blob
// in Vercel KV, so the data survives even if the browser's localStorage
// is cleared or the app is opened from a different device.
//
// Requires the "Vercel KV" (Upstash Redis) integration to be added to this
// project in the Vercel dashboard — see README.md for setup steps.

import { kv } from '@vercel/kv';

const STORAGE_KEY = 'panel-kerja-harian:data';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await kv.get(STORAGE_KEY);
      res.status(200).json(data || null);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Body harus berupa JSON object.' });
        return;
      }
      await kv.set(STORAGE_KEY, body);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: `Method ${req.method} tidak didukung.` });
  } catch (err) {
    console.error('Error /api/data:', err);
    res.status(500).json({ error: 'Terjadi kesalahan di server.', detail: String(err && err.message || err) });
  }
}
