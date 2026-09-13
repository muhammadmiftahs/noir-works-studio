# Noïr Works Studio

Gabungan tiga tool internal Pixinvite/Invitessa jadi satu aplikasi Next.js:

1. **Prompt Generator** — riset tren + generate prompt gambar (untuk ditempel ke Google Flow) buat kebutuhan Adobe Stock.
2. **Video Prompt Generator** — riset tren + generate prompt video detail (teks-ke-video atau gambar-ke-video) untuk Google Flow (Veo), buat kebutuhan Adobe Stock Footage.
3. **Metadata Generator** — upload foto AI-generate, generate title/keyword/kategori Adobe Stock, ekspor CSV siap upload ke Contributor Portal.

Fitur:

- **Anthropic API dipanggil dari server** (`/api/anthropic`), bukan langsung dari browser — API key tidak pernah terlihat pengguna.
- **Dropdown model**: Claude Haiku 4.5 ("Hemat"), Claude Sonnet 5 ("Seimbang"), Claude Opus 5 ("Kualitas Tinggi"), lengkap badge & estimasi biaya per juta token.
- **Hasil generate bisa disimpan ke Neon Postgres** (gratis) lewat `/api/prompts`, supaya tidak hilang saat tab di-refresh.
- **Anti-duplikasi konsep**: sebelum generate prompt baru (gambar maupun video), aplikasi membaca riwayat yang sudah tersimpan di database untuk niche yang sama, lalu memberi tahu AI untuk tidak mengulang konsep yang sudah pernah dibuat. Riwayat gambar dan video disimpan terpisah supaya tidak saling campur. Bisa dimatikan lewat toggle "Hindari konsep yang mirip dengan riwayat" kalau tidak diperlukan.
- **Generator dari gambar**: baik di Prompt Generator (gambar) maupun Video Prompt Generator, tersedia mode "Dari gambar (upload)" — untuk gambar, AI membuat konsep baru yang terinspirasi tapi berbeda nyata (menghindari similarity Adobe Stock); untuk video, AI menghidupkan gambar itu jadi video pendek dengan gerakan natural (image-to-video, sesuai kemampuan asli Veo).
- **Status bar**: menampilkan status koneksi Database (dicek otomatis & gratis, termasuk ukuran storage terpakai) dan status Anthropic API (cek konfigurasi otomatis + tombol "Tes sekarang" manual supaya tidak boros credit).
- **Proteksi password** untuk seluruh aplikasi (halaman `/login`) — supaya orang lain tidak bisa memakai API key & kuota Anthropic-mu kalau URL Vercel-nya ketahuan/di-share.

---

# 🧭 TUTORIAL DEPLOY DARI NOL

Tutorial ini menganggap kamu **belum pernah deploy aplikasi web sama sekali**. Ikuti urut dari atas ke bawah, jangan ada yang dilompat. Total ada 6 bagian:

1. Siapkan 4 akun yang dibutuhkan
2. Upload project ke GitHub
3. Buat database gratis di Neon
4. Ambil API key Anthropic
5. Buat password aplikasi
6. Deploy ke Vercel (bagian paling penting)

Perkiraan waktu: 20-30 menit untuk yang pertama kali.

---

## Bagian 1 — Siapkan 4 akun

Kamu butuh akun gratis di 4 tempat ini. Buat semuanya dulu sebelum lanjut:

1. **GitHub** — tempat menyimpan kode project. Daftar di <https://github.com/signup> (pakai email, verifikasi email).
2. **Vercel** — tempat aplikasi ini "dihidupkan"/di-hosting. Daftar di <https://vercel.com/signup> — pilih **"Continue with GitHub"** supaya otomatis terhubung dengan akun GitHub kamu (lebih gampang, tidak perlu setting koneksi manual nanti).
3. **Neon** — database gratis untuk menyimpan hasil generate. Daftar di <https://neon.tech> — klik **Sign Up**, juga bisa pakai akun GitHub supaya cepat.
4. **Anthropic Console** — tempat ambil API key Claude. Daftar/login di <https://console.anthropic.com>. Akun ini **terpisah** dari akun claude.ai biasa (walau bisa pakai email yang sama) — dan butuh isi saldo/billing dulu supaya API key-nya bisa dipakai (lihat Bagian 4).

✅ **Checklist sebelum lanjut:** kamu sudah bisa login ke keempat situs di atas.

---

## Bagian 2 — Upload project ke GitHub

Vercel butuh project-nya ada di GitHub (atau GitLab/Bitbucket) supaya bisa di-deploy dan otomatis update kalau kamu edit lagi nanti.

### Cara termudah (tanpa command line): pakai GitHub Desktop

1. Download & install **GitHub Desktop** dari <https://desktop.github.com>.
2. Buka GitHub Desktop, login pakai akun GitHub kamu (dari Bagian 1).
3. **Ekstrak dulu** file `noir-works-studio.zip` yang saya berikan ke sebuah folder di komputermu (klik kanan → Extract All / Extract Here).
4. Di GitHub Desktop, klik menu **File → New Repository...**
   - **Name**: `noir-works-studio` (atau nama lain, bebas)
   - **Local Path**: arahkan ke folder TEMPAT folder hasil ekstrak tadi berada (pilih folder induknya, bukan folder `noir-works-studio` itu sendiri)
   - Klik **Create Repository**
5. Kalau GitHub Desktop bikin folder baru yang kosong, **copy semua isi folder hasil ekstrak** (`app`, `components`, `lib`, `package.json`, dll) ke dalam folder repository yang baru dibuat tadi, replace/timpa kalau diminta.
6. Kembali ke GitHub Desktop — kamu akan melihat daftar file yang berubah di tab **Changes**. Isi kolom **Summary** di kiri bawah (misal: "Initial commit"), lalu klik **Commit to main**.
7. Klik tombol **Publish repository** di bagian atas. Pastikan checkbox **"Keep this code private"** dicentang (supaya tidak publik), lalu klik **Publish Repository**.
8. Selesai — buka <https://github.com> dan cek, repo `noir-works-studio` sudah muncul di akunmu.

### Alternatif: pakai Terminal / Command Line (kalau sudah familiar)

```bash
cd noir-works-studio
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME-GITHUB-KAMU/noir-works-studio.git
git push -u origin main
```

> Ganti `USERNAME-GITHUB-KAMU` dengan username GitHub-mu. Kamu perlu buat repository kosong dulu di <https://github.com/new> (isi nama, pilih **Private**, JANGAN centang "Add a README file", lalu klik **Create repository**) sebelum menjalankan perintah `git push` di atas.

⚠️ **Penting:** folder `node_modules` dan `.env.local` sengaja tidak ikut di-zip / sudah masuk `.gitignore` — jangan upload manual, biar Vercel yang install sendiri saat proses deploy.

---

## Bagian 3 — Buat database gratis di Neon

1. Login ke <https://console.neon.tech>.
2. Kalau ini pertama kali, akan muncul wizard **"Create a project"**. Isi:
   - **Project name**: bebas, misal `noir-works-studio`
   - **Postgres version**: biarkan default
   - **Region**: pilih yang paling dekat dengan target pengguna (misal Singapore/`ap-southeast-1` kalau kamu di Indonesia)
   - Klik **Create Project**
3. Setelah project dibuat, kamu akan diarahkan ke **Project Dashboard**. Cari dan klik tombol **Connect** (biasanya di kanan atas dashboard).
4. Akan muncul modal **"Connect to your database"**. Pastikan:
   - **Branch**: `main` (default)
   - **Database**: `neondb` (default)
   - **Role**: default
   - Toggle **Connection pooling** dalam keadaan **ON** (biasanya sudah default ON) — ini penting, supaya hostname-nya mengandung `-pooler`.
5. Copy connection string yang muncul. Bentuknya seperti ini:
   ```
   postgresql://neondb_owner:AbCdEf123@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
6. **Simpan connection string ini** di catatan sementara (Notepad dsb) — ini yang akan kita masukkan sebagai `DATABASE_URL` di Vercel nanti (Bagian 6).

Kamu **tidak perlu** membuat tabel manual — aplikasi otomatis membuat tabelnya sendiri saat pertama kali ada data yang disimpan.

---

## Bagian 4 — Ambil API key Anthropic

1. Login ke <https://console.anthropic.com>.
2. Kalau akun ini masih baru, buka menu **Billing** (di sidebar kiri) dan isi metode pembayaran + top-up saldo (minimal sesuai yang diminta di sana). Tanpa saldo, API key tidak akan bisa dipakai memanggil model walau key-nya valid.
3. Buka menu **Settings → API Keys** (atau langsung ke <https://console.anthropic.com/settings/keys>).
4. Klik **Create Key**. Beri nama bebas (misal `noir-works-studio-vercel`), klik **Create Key** lagi untuk konfirmasi.
5. **Copy key-nya SEKARANG JUGA** (diawali `sk-ant-...`) — Anthropic hanya menampilkannya sekali, kalau kelewat harus buat key baru. Simpan sementara di Notepad yang sama dengan connection string Neon tadi.

---

## Bagian 5 — Buat password aplikasi

Aplikasi ini butuh 2 nilai rahasia untuk fitur proteksi password:

- **`AUTH_PASSWORD`** — password yang akan kamu ketik setiap buka aplikasinya. Bebas tentukan sendiri, misal `PixinviteRahasia2026!` (buat yang cukup panjang & tidak mudah ditebak).
- **`AUTH_SECRET`** — string acak panjang untuk mengamankan sesi login (bukan yang diketik user, cukup di-generate sekali). Cara paling gampang tanpa command line: buka <https://1password.com/password-generator> atau <https://generate-secret.vercel.app/32>, generate string minimal 32 karakter, lalu copy.
  - Kalau kamu familiar terminal, bisa juga jalankan: `openssl rand -hex 32`

Simpan kedua nilai ini di Notepad yang sama.

---

## Bagian 6 — Deploy ke Vercel

Ini bagian utamanya. Pastikan sudah punya 5 nilai berikut di Notepad-mu sebelum mulai:

| Nama variabel | Contoh nilai |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-xxxxxxxx...` |
| `GEMINI_API_KEY` | `AIzaSy-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `DATABASE_URL` | `postgresql://...-pooler...neon.tech/neondb?sslmode=require` |
| `AUTH_PASSWORD` | password pilihanmu |
| `AUTH_SECRET` | string acak 32+ karakter |

### Langkah-langkah:

1. Login ke <https://vercel.com/dashboard> (pakai akun yang sudah terhubung GitHub dari Bagian 1).
2. Klik tombol **Add New...** (pojok kanan atas) → pilih **Project**. Atau langsung buka <https://vercel.com/new>.
3. Di halaman **"Import Git Repository"**, cari repo `noir-works-studio` yang tadi kamu buat di Bagian 2.
   - Kalau repo-nya tidak muncul di daftar, klik **"Adjust GitHub App Permissions"**, lalu izinkan Vercel mengakses repo tersebut (atau pilih "All repositories").
   - Klik **Import** di sebelah nama repo-nya.
4. Di halaman konfigurasi project:
   - **Project Name**: biarkan default atau ganti bebas.
   - **Framework Preset**: harus otomatis terdeteksi sebagai **Next.js** — kalau belum, pilih manual dari dropdown.
   - **Root Directory**: biarkan `./` (default) — kecuali kamu memindahkan project ke dalam subfolder saat upload ke GitHub.
   - Jangan klik Deploy dulu — buka dulu bagian **Environment Variables** di bawahnya (klik untuk expand kalau tertutup).
5. Di bagian **Environment Variables**, tambahkan SATU PER SATU 5 variabel dari tabel di atas:
   - Ketik nama di kolom **Key** (misal `ANTHROPIC_API_KEY`), lalu value-nya di kolom **Value**, lalu klik **Add** sebelum mengisi variabel berikutnya.
   - Ulangi untuk kelima-empatnya: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `AUTH_PASSWORD`, `AUTH_SECRET`.
   - Biarkan target environment default (Production, Preview, Development semua tercentang).
6. Setelah kelima variabel masuk (cek lagi tidak ada yang typo/kepotong), klik tombol **Deploy**.
7. Tunggu proses build (biasanya 1-3 menit) — akan ada log real-time. Kalau berhasil akan muncul tampilan **"Congratulations!"** dengan gambar/preview aplikasimu.
8. Klik tombol domain yang diberikan (bentuknya `https://noir-works-studio-xxxx.vercel.app`) untuk membuka aplikasinya.
9. Kamu akan diarahkan ke halaman **login** — masukkan `AUTH_PASSWORD` yang kamu set tadi. Kalau berhasil masuk, aplikasi siap dipakai 🎉

### Kalau ada perubahan environment variable nanti

Env var **tidak otomatis** berlaku ke deployment yang sudah jalan. Setiap kali kamu tambah/ubah env var:

1. Masuk ke project di Vercel Dashboard → tab **Settings** → **Environment Variables**.
2. Edit/tambah nilainya, klik **Save**.
3. Buka tab **Deployments**, klik titik tiga (⋯) di deployment paling atas → **Redeploy** → konfirmasi **Redeploy** lagi.

---

## Sesudah deploy — cara testing cepat

1. Buka URL Vercel-mu, login pakai `AUTH_PASSWORD`.
2. Di tab **Metadata Generator**, klik tombol **Cek Koneksi** — kalau muncul "✓ Terhubung!" berarti `ANTHROPIC_API_KEY` sudah benar.
3. Coba generate 1 prompt di tab **Prompt Generator**, lalu klik **Simpan ke DB** di salah satu hasilnya. Buka bagian **"📦 Riwayat tersimpan di database"** di bawahnya — kalau hasilnya muncul di situ, berarti `DATABASE_URL` sudah benar.
4. Generate lagi dengan niche yang SAMA PERSIS seperti langkah 3 — perhatikan status generate yang menampilkan "menghindari N konsep lama untuk niche ini". Kalau muncul, berarti fitur anti-duplikasi sudah membaca riwayat dengan benar.

---

## Troubleshooting (masalah umum)

| Gejala | Penyebab | Solusi |
|---|---|---|
| Muncul pesan "ANTHROPIC_API_KEY belum diset di server" | Env var belum ditambahkan / salah nama | Cek ejaan nama variabel persis `ANTHROPIC_API_KEY`, lalu redeploy |
| Muncul pesan "DATABASE_URL belum diset" | Connection string belum ditambahkan | Tambahkan `DATABASE_URL` di Vercel, redeploy |
| Generate gagal dengan pesan soal billing/credit | Saldo Anthropic habis/belum diisi | Isi saldo di console.anthropic.com → Billing |
| Halaman terus redirect ke `/login` walau password benar | `AUTH_SECRET` berubah setelah kamu login (mis. kamu edit ulang env var-nya) | Login ulang — ini normal, artinya sesi lama otomatis tidak berlaku lagi setelah `AUTH_SECRET` diganti |
| Repo tidak muncul saat Import di Vercel | Vercel belum diizinkan akses repo tsb | Klik "Adjust GitHub App Permissions" di halaman Import, izinkan repo-nya |
| Build gagal di Vercel dengan error terkait module/dependency | File `package.json` ikut ter-edit/rusak saat upload | Upload ulang, pastikan `package.json` tidak berubah dari aslinya |

---

# 📁 Referensi teknis (untuk yang mau tahu lebih detail)

## Struktur proyek

```
noir-works-studio/
  app/
    api/
      anthropic/route.js   -> proxy ke Anthropic API (server-side, aman)
      prompts/route.js     -> CRUD ke Neon Postgres
      status/route.js      -> cek status API key & koneksi database (gratis)
      login/route.js       -> verifikasi password, set cookie sesi
      logout/route.js      -> hapus cookie sesi
    login/page.js           -> halaman login
    page.js                 -> tab switcher (Prompt Generator / Video Prompt Generator / Metadata Generator)
    layout.js, globals.css
  components/
    ModelSelect.js          -> dropdown model + badge biaya
    StatusBar.js             -> indikator status API & Database
    PromptGenerator.js       -> generator prompt gambar (teks / dari gambar)
    VideoPromptGenerator.js  -> generator prompt video (teks / image-to-video)
    MetadataGenerator.js
    HistoryPanel.js          -> panel "riwayat tersimpan"
  lib/
    models.js               -> daftar model + harga
    db.js                   -> koneksi Neon (auto-buat tabel)
    auth.js                  -> helper cookie sesi (HMAC, tanpa session store)
    claudeClient.js          -> helper fetch ke /api/anthropic
    savedItems.js            -> helper fetch ke /api/prompts
    imageUtils.js             -> helper resize/baca gambar sisi-klien (dipakai bersama)
  middleware.js               -> gerbang password untuk seluruh aplikasi
  schema.sql                 -> referensi skema tabel (opsional, dibuat otomatis)
  .env.example
```

## Cara kerja proteksi password

- Password (`AUTH_PASSWORD`) dicek di server (`/api/login`) dengan perbandingan *constant-time* (tahan terhadap timing attack), tidak pernah dikirim balik ke browser.
- Kalau cocok, server membuat cookie `noir_auth` berisi token `waktu_kadaluarsa.tanda_tangan`, di mana tanda tangannya dihitung pakai **HMAC-SHA256** dengan kunci `AUTH_SECRET` (yang hanya ada di server, tidak pernah dikirim ke browser).
- Cookie di-set sebagai **HttpOnly** (tidak bisa dibaca lewat JavaScript di browser, aman dari serangan XSS) dan **Secure** (hanya dikirim lewat HTTPS — otomatis terpenuhi karena Vercel selalu pakai HTTPS).
- Setiap request masuk dicek oleh `middleware.js` — kalau cookie tidak ada/rusak/kadaluarsa/tanda tangannya tidak cocok, request dialihkan ke `/login` (untuk halaman) atau ditolak dengan status 401 (untuk endpoint API seperti `/api/anthropic` dan `/api/prompts`), jadi API key & database tidak bisa dipakai orang lain walau mereka tahu URL-nya.
- Sesi berlaku 30 hari sejak login (bisa diubah di `lib/auth.js`, konstanta `SESSION_DURATION_MS`).
- Ini adalah proteksi level "gerbang bersama" (satu password untuk semua pengguna aplikasi ini), bukan sistem akun multi-user. Cocok untuk pemakaian internal tim kecil, bukan untuk aplikasi publik dengan banyak user berbeda.

## Menjalankan di lokal (opsional, untuk development)

```bash
npm install
cp .env.example .env.local
# isi ANTHROPIC_API_KEY, DATABASE_URL, AUTH_PASSWORD, AUTH_SECRET di .env.local
npm run dev
```

Buka `http://localhost:3000`.

## Catatan biaya & pemakaian model

Badge di dropdown model (harga per 1 juta token, dicek dari halaman resmi Anthropic per September 2026):

| Model | Badge | Input | Output |
|---|---|---|---|
| Claude Haiku 4.5 | Hemat | $1 | $5 |
| Claude Sonnet 5 | Seimbang | $2 | $10 |
| Claude Opus 5 | Kualitas Tinggi | $5 | $25 |

Cek ulang harga terbaru di <https://platform.claude.com/docs/en/about-claude/pricing> kalau sewaktu-waktu berubah — tinggal update angka di `lib/models.js`.

## Batasan yang perlu diketahui

- Proteksi password bersifat "satu password untuk semua" (bukan akun per-orang). Kalau kamu butuh login per-user dengan hak akses berbeda, itu di luar cakupan tutorial ini.
- Gambar yang diupload di Metadata Generator diproses di browser (resize + hash kemiripan), base64-nya dikirim ke server hanya untuk diteruskan ke Anthropic — tidak disimpan permanen di server maupun database.
- Neon free tier punya batas ukuran database & compute time (0.5 GB storage per project di free tier per catatan resmi Neon) — untuk pemakaian ringan (menyimpan teks prompt/metadata) ini jauh dari batasnya. Status bar di aplikasi menampilkan ukuran storage yang sudah terpakai secara real-time.
- **Total pemakaian credit & sisa saldo Anthropic sengaja TIDAK ditampilkan di aplikasi ini.** API key biasa tidak bisa mengambil data itu — perlu Admin API Key terpisah (credential yang lebih berkuasa, bisa kelola user/workspace lain), dan bahkan dengan itu pun Anthropic belum punya endpoint untuk "sisa saldo real-time" sama sekali. Cek pemakaian & saldo tetap manual lewat console.anthropic.com → menu Usage/Billing.
