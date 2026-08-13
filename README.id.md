# Imagenation

[English](README.md) · **Bahasa Indonesia**

Generator gambar AI berbasis kredit yang berjalan sepenuhnya di Cloudflare,
dibangun dengan TanStack Start, Better Auth, Drizzle ORM, D1, R2, OpenRouter,
dan pembayaran Mayar V2.

Pengguna mendaftar, mendapat kredit gratis, menuliskan deskripsi gambar, lalu
menerima gambarnya. Kredit tambahan dibeli sebagai paket. Tidak ada halaman
landing: `/` adalah aplikasinya.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/julianromli/imagenation-saas)

Semua yang dibutuhkan aplikasi ini disiapkan otomatis. Siapkan empat secret
sebelum menekan tombol: lihat [Variabel lingkungan](#variabel-lingkungan).

## Teknologi

- TanStack Start (React 19) di Cloudflare Workers
- D1 sebagai basis data, melalui Drizzle ORM
- R2 untuk gambar hasil dan gambar referensi, disajikan oleh Worker
- Better Auth, self-hosted, dengan masuk memakai email dan kata sandi
- OpenRouter untuk pembuatan gambar, pada `google/gemini-3.1-flash-image`
- Mayar V2 untuk menjual paket kredit
- Binding rate limiting Cloudflare dan satu cron trigger

## Mulai cepat

### Deploy dari tombol

1. Klik **Deploy to Cloudflare**. Cloudflare menyalin repositori ini dan membuat
   basis data D1, bucket R2, serta rate limiter dari `wrangler.jsonc`.
2. Isi empat secret yang diminta.
3. Setelah deploy selesai, buka `https://<worker-anda>.workers.dev/setup` lalu
   masukkan setup token Anda. Halaman itu membuat akun administrator pertama,
   memeriksa bahwa kunci OpenRouter Anda dapat menjangkau model gambar, dan
   menampilkan URL webhook Mayar untuk didaftarkan.

### Pengembangan lokal

Membutuhkan Bun 1.3 atau lebih baru.

```sh
git clone https://github.com/julianromli/imagenation-saas
cd imagenation-saas
bun install
bun run setup   # menulis .dev.vars, membuat secret, migrasi D1 lokal
bun dev
```

Lalu buka `http://localhost:3000/setup` dan pakai token yang dicetak oleh
`bun run setup`.

## Variabel lingkungan

D1, R2, dan rate limiter tidak perlu dikonfigurasi. Semuanya dideklarasikan
tanpa ID di `wrangler.jsonc`, sehingga Wrangler membuatnya secara lokal saat
`wrangler dev` dan menyiapkannya di akun Anda saat deploy.

| Variabel | Wajib | Fungsinya |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Ya | Menandatangani cookie sesi. Buat dengan `openssl rand -base64 32`. Menggantinya mengeluarkan semua orang. |
| `SETUP_TOKEN` | Ya | Membuka halaman `/setup` yang hanya berjalan sekali. Teks acak yang panjang. |
| `OPENROUTER_API_KEY` | Ya | Membayar setiap gambar yang dibuat. **Pasang batas pengeluaran padanya.** |
| `MAYAR_API_KEY` | Ya | Menjual paket kredit. Kunci sandbox dan produksi berbeda. |
| `BETTER_AUTH_URL` | Tidak | URL publik Anda. Tanpa ini, Better Auth membaca origin dari tiap permintaan. |
| `MAYAR_ENVIRONMENT` | Tidak | `production` (bawaan) atau `sandbox`. Diatur di `wrangler.jsonc`. |

**Pembayaran sudah live.** `MAYAR_ENVIRONMENT` bernilai `production` di
`wrangler.jsonc`, jadi `MAYAR_API_KEY` harus kunci produksi dari
[web.mayar.id](https://web.mayar.id/api-keys), dan setiap checkout — termasuk
yang Anda mulai di `localhost` — membuat invoice sungguhan dengan uang
sungguhan.

Untuk menguji dengan uang percobaan, isi `MAYAR_ENVIRONMENT=sandbox` di
`.dev.vars` dan pakai kunci dari [web.mayar.io](https://web.mayar.io/api-keys).
`.dev.vars` menang atas `wrangler.jsonc`, jadi itu hanya mengubah pengembangan
lokal.

Checkout menawarkan QRIS, virtual account, dan e-wallet. Channel yang dimatikan
di akun Mayar Anda akan gagal saat invoice dibuat, jadi daftar di
[`src/lib/payment-methods.ts`](src/lib/payment-methods.ts) harus cocok dengan
yang benar-benar dijual akun itu.

## Setelah deploy pertama

Tombol **?** mengambang di sudut kiri bawah setiap halaman selama setup belum
selesai, dan membuka daftar yang sama dalam panel. Tombol itu hilang permanen
begitu `/setup` selesai, jadi pengguna tidak pernah melihatnya. Langkah-langkah
tersebut ada di [`src/lib/setup-guide.ts`](src/lib/setup-guide.ts) — sunting
berkas itu bersama bagian ini, atau keduanya akan menyimpang.

1. Selesaikan `/setup`.
2. Daftarkan URL webhook Mayar yang ditampilkan halaman setup. Ini opsional;
   lihat [Membeli kredit](#membeli-kredit).
3. Setel `BETTER_AUTH_URL` ke URL publik Anda. Disarankan: tanpa itu,
   pemeriksaan origin mempercayai host mana pun yang melayani permintaan.
4. Pasang batas pengeluaran pada kunci OpenRouter. Kunci itu membayar setiap
   gambar, jadi batas tersebut yang menahan bug atau penyalahguna dari
   menghabiskan saldo dalam semalam.
5. Periksa harga. Lihat [Kredit dan harga](#kredit-dan-harga) — angka yang
   dikirim di sini diukur terhadap harga model tertentu dan kurs tertentu, dan
   keduanya bergerak.
6. Pertimbangkan lokasi basis data D1 Anda. Deploy satu klik tidak dapat memilih
   lokasi utama. Untuk memindahkannya, buat basis data dengan
   `wrangler d1 create <nama> --location <hint>` lalu arahkan binding ke sana.

## Kredit dan harga

Semua di bawah ini adalah satu suntingan di
[`src/lib/pricing.ts`](src/lib/pricing.ts).

| Resolusi | Keluaran pada 16:9 | Kredit | Waktu tunggu umum |
| --- | --- | --- | --- |
| 1K | 1376×768 | 2 | ~11 detik |
| 2K | 2752×1536 | 3 | ~14 detik |
| 4K | 5504×3072 | 5 | ~30 detik |

Gambar referensi gratis — hasil pengukuran menambah sekitar $0,0005 per gambar.
Akun baru mendapat 4 kredit. Paket bawaan: 20 / Rp 35.000, 60 / Rp 95.000, dan
200 / Rp 280.000.

**Mengapa angka itu, dan apa yang harus diperiksa sebelum menggantinya:** tangga
harga ini sebanding dengan biaya hulu yang diukur, direncanakan pada
Rp 18.000 per USD, dengan batas bawah Rp 1.400 per kredit. Pendapatan Anda dalam
rupiah sedangkan tagihan OpenRouter dalam dolar, jadi rupiah yang melemah
memakan margin dan aplikasi tidak akan memberi tahu Anda. Pengukuran,
perhitungan, dan alasan tidak adanya tingkat 512 ada di
[ADR-0018](docs/adr/0018-price-credits-from-measured-cost.md).

## Membuat gambar

1. Peramban membuat kunci idempotensi, menyimpannya, lalu mengirim prompt.
2. Worker menulis baris `generation` dan mengambil kreditnya dalam **satu** batch
   D1. Saldo yang akan menjadi negatif ditolak oleh check constraint, yang
   membatalkan seluruh batch. Satu akun hanya boleh punya satu pembuatan gambar
   yang sedang berjalan.
3. Model dipanggil. Promise-nya diserahkan ke `waitUntil` **dan** ditunggu,
   sehingga tab yang ditutup di tengah proses tetap mendapatkan gambarnya di
   riwayat.
4. Jika berhasil, gambar ditulis ke R2 di bawah prefiks pemiliknya, dan
   `usage.cost` dicatat pada baris tersebut.
5. Jika gagal, kredit dikembalikan — kecuali untuk prompt yang diblokir penyedia
   karena isinya, yang sengaja tidak dikembalikan. Tiga blokir dalam satu jam
   menghentikan akun itu untuk sementara.
6. Setiap lima menit, cron mengembalikan kredit untuk pembuatan gambar yang
   tersangkut.

Gambar bersifat pribadi, disajikan dengan `Cache-Control: private` di balik
pemeriksaan sesi. Pemilik dapat membagikan satu gambar dari `/history`, yang
membuat tautan publik di `/s/:token` dan mengecualikan gambar itu dari
penghapusan berkala 90 hari.

## Membeli kredit

Checkout berlangsung dalam dialog di `/credits`. Tidak ada yang dikirim ke
halaman pembayaran.

1. Pembeli memilih paket dan metode bayar. Mayar mewajibkan nomor ponsel pada
   setiap invoice, jadi pembeli ditanya sekali dan nomornya diingat.
2. Server membuat invoice Mayar yang dikunci ke metode itu. Mayar menjawab
   dengan alat bayarnya — string QRIS, nomor virtual account, atau tautan
   e-wallet — dan dialog menampilkannya. Invoice tertunda untuk paket **dan
   metode** yang sama dipakai ulang, bukan diganti.
3. Dialog menanyakan status selama pembeli membayar. Jawabannya memuat kapan
   harus bertanya lagi, dan klaim pada baris pembelian membuat beberapa tab
   hanya menghasilkan satu permintaan ke Mayar.
4. Pembayaran dibuktikan dengan mengambil detail transaksi Mayar dan mencocokkan
   jumlah, status `paid`, dan pembelian di `extraData`. Kembalinya peramban
   tidak pernah memberi kredit, begitu pula payload webhook sendirian.
5. Kredit diberikan lewat entri buku besar dengan referensi unik, sehingga
   webhook yang terulang, polling, tombol periksa ulang, dan cron tidak dapat
   memberi kredit dua kali.
6. Setiap lima menit, cron menyelesaikan pembelian yang webhook-nya tidak pernah
   tiba, dan menutup invoice yang kedaluwarsa tanpa dibayar sejak satu jam lalu.

Dua hal yang dipersulit Mayar, keduanya ditangani dan bukan disembunyikan. Mayar
menolak invoice kedua untuk satu pelanggan dengan jumlah yang sama selama satu
menit, jadi mengganti metode seketika dilaporkan sebagai "tunggu satu menit",
bukan gagal diam-diam. Dan alat bayarnya tidak terdokumentasi, jadi dibaca
longgar: apa pun yang tidak dikenali jatuh ke tautan halaman Mayar. Lihat
[ADR-0021](docs/adr/0021-render-payment-instructions-in-our-own-ui.md).

**Webhook bersifat opsional.** Webhook hanya mempercepat datangnya kredit.
Karena pembayaran selalu dibuktikan lewat pencarian transaksi, dan karena cron
merekonsiliasi pembelian tertunda, deploy yang tidak pernah mendaftarkan webhook
tetap benar.

Pengembalian dana diselesaikan di dasbor Mayar. Setelah itu sesuaikan saldo dari
`/admin/accounts`, yang menulis entri buku besar beserta alasan Anda.

## Rute

Publik:

- `/` — generator, dapat dipakai tanpa masuk, dengan tombol yang meminta masuk
- `/auth` — masuk dan membuat akun, dalam satu halaman
- `/s/:token` — gambar yang dibagikan
- `/legal/privacy`, `/legal/terms`, `/legal/refund`
- `/setup` — bootstrap sekali jalan, dijaga oleh `SETUP_TOKEN`

Setelah masuk:

- `/history` — semua gambar, dengan sakelar berbaginya
- `/credits` — paket, pembelian, dan riwayat kredit
- `/account`

Admin:

- `/admin` — kredit beredar, gambar yang dibuat, biaya terhadap pendapatan
- `/admin/accounts` — saldo dan penyesuaian manual
- `/admin/purchases` — semua paket terjual, dengan periksa ulang ke Mayar
- `/admin/failures` — apa yang gagal, dan apakah kreditnya kembali

Server:

- `/api/auth/*` — Better Auth
- `/api/generate` — membuat gambar, memerlukan `Idempotency-Key`
- `/api/generations/:id` — menyambung kembali setelah halaman dimuat ulang
- `/api/uploads` — unggahan gambar referensi ke R2
- `/api/shared/:token` — byte gambar yang dibagikan, publik dan dapat di-cache
- `/images/*` — gambar pribadi, di balik pemeriksaan sesi
- `/api/webhooks/mayar/:secret` — penerima webhook Mayar

## Perintah yang berguna

```sh
bun dev                  # server pengembangan lokal di runtime Workers
bun run build            # membangun bundel Worker
bun run deploy           # menerapkan migrasi remote, lalu deploy
bun run db:generate      # membuat migrasi dari skema Drizzle
bun run db:migrate       # menerapkan migrasi ke D1 lokal
bun run db:migrate:remote# menerapkan migrasi ke D1 yang sudah dideploy
bun run test             # uji unit dan uji D1
bun run typecheck        # TypeScript
bun run lint             # Biome lewat Ultracite
bun run cf-typegen       # membuat ulang tipe binding setelah mengubah wrangler.jsonc
```

## Keputusan desain

Alasan di balik arsitektur ini ada di [`docs/adr/`](docs/adr/), dan kosakata
domainnya di [`CONTEXT.md`](CONTEXT.md). Mulailah dari
[ADR-0016](docs/adr/0016-keep-the-credit-ledger-in-d1.md) untuk alasan saldo
tidak bisa menjadi negatif,
[ADR-0017](docs/adr/0017-run-generation-under-waituntil.md) untuk apa yang
terjadi saat tab ditutup di tengah proses, dan
[ADR-0018](docs/adr/0018-price-credits-from-measured-cost.md) untuk harganya.

## Catatan untuk pemelihara

Berkas ini adalah terjemahan lengkap dari [`README.md`](README.md). Isinya
salinan kedua dari fakta yang sama, jadi keduanya menyimpang kecuali Anda
menyunting keduanya. ADR dan `CONTEXT.md` sengaja hanya berbahasa Inggris:
keduanya lebih sering berubah dan dibaca oleh siapa pun yang mengubah kodenya.

Wrangler menulis ID sumber daya kembali ke `wrangler.jsonc` setelah deploy
pertama Anda sendiri. Jangan commit ID tersebut: ID itu khusus untuk akun Anda,
dan binding harus tetap tanpa ID agar tombol deploy dapat menyiapkan sumber daya
baru untuk orang lain.

### Ganti namespace ID rate limiter untuk deploy kedua

`wrangler.jsonc` mendeklarasikan lima rate limiter dengan namespace ID `2001`
sampai `2005`. Namespace ID berlaku untuk seluruh akun Cloudflare Anda, bukan
untuk satu Worker, dan
[binding yang berbagi satu namespace juga berbagi penghitungnya](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Jadi berikan nomor tersendiri untuk tiap deploy jika salah satu ini benar:

- Anda men-deploy templat ini lebih dari sekali pada akun yang sama. Salinan
  staging dan salinan produksi pada `2001` tidak mendapat batas masing-masing.
  Keduanya berbagi satu batas, dan lalu lintas ke salah satunya menghabiskannya.
- Worker lain di akun Anda sudah memakai nomor dalam rentang itu. Rentang `1000`
  milik templat ecommerce yang menjadi asal proyek ini.

Satu deploy pada akun baru tidak perlu diubah.
