# Panel Kerja Harian

Checklist tugas harian, rutin/berkala, sewaktu-waktu, dan project — dengan
kalender progres dan penyimpanan data di server (Vercel KV) supaya datanya
tidak hilang meski cache browser dibersihkan atau dibuka dari perangkat lain.

## Struktur project

```
├── index.html      # markup halaman
├── styles.css        # semua styling
├── app.js             # semua logika (checklist, kalender, dashboard, project, sync)
├── api/
│   ├── data.js           # backend utama: simpan/ambil seluruh data ke Vercel KV
│   └── sheet-sync.js      # backend opsional: mirror rekap harian ke Google Spreadsheet
├── package.json
└── README.md
```

Frontend tetap jalan walau backend belum di-setup — datanya otomatis
tersimpan di `localStorage` browser sebagai cache. Begitu backend aktif,
setiap perubahan otomatis disinkronkan ke server (ada toast kecil di bawah
layar: "Tersimpan ke server" / "Gagal sinkron, tersimpan lokal").

Ada tab **Dashboard** baru yang menampilkan rekap otomatis dari semua
checklist yang sudah kamu centang: progres hari ini, rata-rata 30 hari,
grafik tren 14 hari terakhir, rekap per kategori tugas, dan status semua
project. Semua dihitung langsung dari data yang tersimpan, tidak perlu
setup tambahan.

## Cara deploy ke Vercel

1. **Push folder ini ke repo GitHub/GitLab/Bitbucket**, lalu import project
   itu di [vercel.com/new](https://vercel.com/new). Vercel otomatis
   mendeteksi file statis di root (`index.html`, `styles.css`, `app.js`)
   dan `api/` sebagai serverless function — tidak perlu konfigurasi build
   khusus (framework preset: **Other**).

   Atau, kalau mau langsung dari command line:
   ```bash
   npm i -g vercel
   cd panel-kerja-harian
   vercel
   ```

2. **Aktifkan Vercel KV** (database key-value yang dipakai `api/data.js`):
   - Buka project kamu di dashboard Vercel → tab **Storage** → **Create Database** → pilih **KV**.
   - Ikuti langkah "Connect Project" supaya environment variable-nya
     (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, dst) otomatis ditambahkan ke
     project ini.
   - Redeploy project (Vercel biasanya redeploy otomatis setelah koneksi
     database ditambahkan; kalau tidak, klik **Redeploy** di tab Deployments).

3. Selesai — buka URL Vercel-nya, coba centang satu tugas, refresh halaman,
   harusnya tetap tercentang (datanya sudah tersimpan di server).

## Sinkron otomatis ke Google Spreadsheet (opsional)

Selain Vercel KV, setiap kamu centang tugas di web, rekap hari itu juga
otomatis ditulis ke spreadsheet yang sudah kamu pakai
(`docs.google.com/spreadsheets/d/1Qx-_jylD67oicJ4DX7Rl07oIOF06pdtovjKX9PJILHc`),
lewat `api/sheet-sync.js`. Dua tab otomatis dibuat di spreadsheet itu:

- **Rekap Harian** — 1 baris per tanggal (Total Tugas, Selesai, Persentase, Kategori warna)
- **Detail Tugas** — status tiap tugas per tanggal

Ini fitur opsional — kalau belum di-setup, web tetap jalan normal (cuma
bagian sinkron-ke-sheet-nya gagal diam-diam, data utama tetap aman di
Vercel KV). Cara mengaktifkannya:

1. **Buat Service Account di Google Cloud Console:**
   - Buka [console.cloud.google.com](https://console.cloud.google.com) → buat project baru (atau pakai yang sudah ada).
   - Aktifkan **Google Sheets API**: menu **APIs & Services → Library** → cari "Google Sheets API" → **Enable**.
   - Buat credential: **APIs & Services → Credentials → Create Credentials → Service Account**. Isi nama bebas, lanjut sampai selesai.
   - Buka service account yang baru dibuat → tab **Keys** → **Add Key → Create new key → JSON**. File JSON-nya ke-download otomatis — simpan baik-baik, isinya kredensial rahasia.

2. **Share spreadsheet ke service account:**
   - Di file JSON tadi, cari nilai `client_email` (formatnya seperti `nama@project-id.iam.gserviceaccount.com`).
   - Buka spreadsheet kamu → tombol **Share** → tempel email itu → beri akses **Editor**.

3. **Set environment variable di Vercel** (dashboard project → **Settings → Environment Variables**):
   | Key | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | nilai `client_email` dari file JSON |
   | `GOOGLE_PRIVATE_KEY` | nilai `private_key` dari file JSON (termasuk `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----`) |
   | `GOOGLE_SHEET_ID` | *(opsional)* — isi kalau mau ganti ke spreadsheet lain; default-nya sudah mengarah ke spreadsheet yang kamu pakai sekarang |

   Kalau ditempel lewat dashboard Vercel (bukan file `.env`), baris baru di
   `private_key` biasanya otomatis ter-handle — kalau error "invalid key",
   coba tempel sebagai satu baris dengan `\n` literal di tempat ganti baris
   (`api/sheet-sync.js` sudah otomatis convert `\n` → baris baru).

4. Redeploy project. Coba centang satu tugas di web, cek spreadsheet-nya —
   tab **Rekap Harian** dan **Detail Tugas** harusnya otomatis terisi/update.



```bash
npm i -g vercel
npm install
vercel dev
```

`vercel dev` menjalankan `public/` dan `api/` sekaligus di `localhost`,
termasuk koneksi ke Vercel KV kalau sudah di-link (`vercel link` lalu
`vercel env pull` untuk menarik environment variable-nya ke `.env.local`).

## Catatan

- Data disimpan sebagai satu JSON besar di key `panel-kerja-harian:data`
  di Vercel KV (lihat `api/data.js`). Cukup untuk pemakaian satu orang;
  kalau nanti mau multi-user, tinggal ganti key-nya jadi per user/akun.
- Kalau `api/data.js` gagal diakses (mis. KV belum di-setup), aplikasi tetap
  bisa dipakai normal — cuma datanya tersimpan lokal di browser itu saja.
- `api/sheet-sync.js` cuma mengirim rekap tugas dari daftar 24 tugas tetap
  (`TASKS` di `app.js`) — tugas dadakan yang kamu tambah lewat "Tambahan
  dadakan hari ini" tidak ikut ke spreadsheet, karena sifatnya sekali pakai.
