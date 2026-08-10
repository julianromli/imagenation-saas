# then. ecommerce boilerplate

[English](README.md) · **Bahasa Indonesia**

Starter ecommerce untuk satu penjual yang berjalan sepenuhnya di Cloudflare,
dibangun dengan TanStack Start, Better Auth, Drizzle ORM, D1, R2, dan
pembayaran Mayar V2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/julianromli/then-ecommerce-cf)

Semua yang dibutuhkan toko disiapkan otomatis. Siapkan tiga secret sebelum Anda
klik: lihat [Variabel lingkungan](#variabel-lingkungan).

## Stack

- TanStack Start (React 19) di Cloudflare Workers
- D1 sebagai database, lewat Drizzle ORM
- R2 untuk gambar produk, diunggah dan disajikan oleh Worker
- Better Auth, self-hosted, dengan login email dan password
- Mayar V2 untuk pembayaran
- Binding rate limiting Cloudflare dan satu cron trigger

## Mulai cepat

### Deploy lewat tombol

1. Klik **Deploy to Cloudflare**. Cloudflare akan fork repositori ini lalu
   membuat database D1, bucket R2, dan rate limiter dari `wrangler.jsonc`.
2. Isi tiga secret yang diminta.
3. Setelah deploy selesai, buka `https://<worker-anda>.workers.dev/setup` lalu
   masukkan setup token Anda. Halaman itu membuat akun administrator pertama,
   menambahkan produk contoh, dan menampilkan URL webhook Mayar yang perlu
   didaftarkan.

### Pengembangan lokal

Membutuhkan Bun 1.3 atau yang lebih baru.

```sh
git clone https://github.com/julianromli/then-ecommerce-cf
cd then-ecommerce-cf
bun install
bun run setup   # menulis .dev.vars, membuat secret, migrasi D1 lokal
bun dev
```

Lalu buka `http://localhost:3000/setup` dan pakai token yang dicetak oleh
`bun run setup`.

## Variabel lingkungan

D1, R2, dan rate limiter tidak perlu dikonfigurasi. Semuanya dideklarasikan
tanpa ID di `wrangler.jsonc`, jadi Wrangler membuatnya secara lokal saat
`wrangler dev` dan menyediakannya di akun Anda saat deploy.

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Ya | Menandatangani cookie sesi. Buat dengan `openssl rand -base64 32`. Mengubahnya membuat semua sesi keluar. |
| `SETUP_TOKEN` | Ya | Membuka halaman `/setup` yang hanya berjalan sekali. Isi dengan string acak yang panjang. |
| `MAYAR_API_KEY` | Ya | API key Mayar. Key sandbox dan production berbeda. |
| `BETTER_AUTH_URL` | Tidak | URL publik Anda. Tanpa ini, Better Auth membaca origin dari setiap request. |
| `MAYAR_ENVIRONMENT` | Tidak | `sandbox` (bawaan) atau `production`. Diatur di `wrangler.jsonc`. |
| `SHIPPING_FLAT_RATE` | Tidak | Ongkos kirim flat dalam IDR, dikenakan sekali per pesanan. Diatur di `wrangler.jsonc`. |

Biarkan `MAYAR_ENVIRONMENT=sandbox` sampai Anda berhasil menyelesaikan satu
checkout percobaan.

## Setelah deploy pertama

Sebuah tombol **?** mengambang muncul di pojok kiri bawah setiap halaman selama
setup belum selesai, dan membuka checklist yang sama ini dalam bentuk sheet.
Tombol itu hilang selamanya begitu `/setup` selesai, jadi pembeli tidak pernah
melihatnya. Daftar langkahnya ada di
[`src/lib/setup-guide.ts`](src/lib/setup-guide.ts) — ubah file itu dan bagian
ini bersamaan, kalau tidak keduanya akan berbeda isi.

1. Selesaikan `/setup`.
2. Daftarkan URL webhook Mayar yang ditampilkan halaman setup. Ini opsional;
   lihat [Alur pembayaran](#alur-pembayaran).
3. Set `BETTER_AUTH_URL` ke URL publik Anda. Disarankan: tanpa ini, pemeriksaan
   origin akan percaya pada host mana pun yang melayani request tersebut.
4. Pertimbangkan lokasi database D1 Anda. Deploy sekali klik tidak bisa memilih
   lokasi primary. Untuk memindahkannya, buat database dengan
   `wrangler d1 create <nama> --location <hint>` lalu arahkan binding ke sana.

## Alur pembayaran

1. Checkout menahan stok tersedia selama 30 menit dan menulis pesanan, itemnya,
   data penahanan stok, serta catatan idempotency dalam satu batch D1. Kelebihan
   jual ditolak oleh check constraint, yang membatalkan seluruh batch.
2. Server membuat invoice Mayar dari snapshot pesanan.
3. Pembeli membayar lalu kembali ke halaman status pesanan.
4. Pembayaran dibuktikan dengan mengambil detail transaksi Mayar dan mencocokkan
   nominal, status `paid`, dan pesanan di `extraData`. Kembalinya browser tidak
   pernah menandai pesanan lunas, begitu juga payload webhook dengan sendirinya.
5. Halaman status pesanan memeriksa pembayaran saat dimuat, pada jadwal ulang
   yang singkat, dan ketika tab kembali aktif.
6. Setiap lima menit sebuah cron trigger merekonsiliasi pesanan yang masa
   penahanan stoknya sudah lewat. Mayar ditanya lebih dulu: pesanan yang sudah
   dibayar diselesaikan, yang belum dibatalkan dan stoknya dikembalikan, dan
   yang tidak bisa diverifikasi ditinggalkan untuk putaran berikutnya.
7. Resync pembayaran di admin memakai gerbang bukti yang sama dengan refresh
   dari sisi pembeli.

**Webhook bersifat opsional.** Webhook hanya mempercepat konfirmasi. Karena
pembayaran selalu dibuktikan lewat pencarian transaksi, dan karena cron
merekonsiliasi pesanan yang kedaluwarsa, toko yang tidak pernah mendaftarkan
webhook tetap berjalan benar.

Refund diselesaikan di dashboard Mayar, lalu ditandai sebagai refunded di panel
admin. Tidak ada endpoint refund tidak terdokumentasi yang dipanggil.

## Rute

Publik:

- `/` — halaman depan toko
- `/products` — koleksi, filter kategori, dan pencarian
- `/products/:slug` — detail produk
- `/cart` — keranjang lokal
- `/checkout` — checkout tamu dan alamat pengiriman
- `/orders/:token` — status pesanan tamu yang ditandatangani
- `/orders/find` — cari pesanan tamu dengan email + nomor pesanan
- `/sign-in`, `/sign-up`, `/account`, `/account/orders`
- `/legal/privacy`, `/legal/terms`, `/legal/shipping`, `/legal/refund`
- `/setup` — bootstrap sekali jalan, dijaga oleh `SETUP_TOKEN`

Admin:

- `/admin` — ringkasan
- `/admin/products` — kategori, pembuatan dan pengarsipan produk, unggah gambar
- `/admin/orders` — daftar pesanan dan aksi pembayaran/pemenuhan
- `/admin/orders/:id` — detail pesanan, resync, riwayat status, refund manual

Server:

- `/api/auth/*` — Better Auth
- `/api/checkout` — endpoint checkout server, wajib mengirim `Idempotency-Key`
- `/api/uploads` — unggah gambar oleh admin ke R2
- `/images/*` — gambar produk yang disajikan dari R2
- `/api/webhooks/mayar/:secret` — penerima webhook Mayar

## Perintah yang berguna

```sh
bun dev                  # server dev lokal di runtime Workers
bun run build            # build bundle Worker
bun run deploy           # jalankan migrasi remote, lalu deploy
bun run db:generate      # buat migrasi dari skema Drizzle
bun run db:migrate       # terapkan migrasi ke D1 lokal
bun run db:migrate:remote# terapkan migrasi ke D1 yang sudah dideploy
bun run test             # unit test dan test D1
bun run typecheck        # TypeScript
bun run lint             # Biome lewat Ultracite
bun run cf-typegen       # buat ulang tipe binding setelah mengubah wrangler.jsonc
```

## Keputusan desain

Alasan di balik arsitekturnya ada di [`docs/adr/`](docs/adr/), dan kosakata
domainnya di [`CONTEXT.md`](CONTEXT.md). Mulailah dari ADR-0011 untuk pilihan
database dan ADR-0012 untuk cara checkout tetap atomik tanpa transaksi.

Catatan: berkas ADR dan `CONTEXT.md` hanya tersedia dalam bahasa Inggris.

## Catatan untuk maintainer

Wrangler menulis kembali ID resource yang sudah disediakan ke dalam
`wrangler.jsonc` setelah deploy pertama Anda sendiri. Jangan commit ID
tersebut: ID itu khusus untuk akun Anda, dan binding harus tetap tanpa ID agar
tombol deploy bisa menyediakan resource baru untuk orang lain.

### Ganti namespace ID rate limiter untuk toko kedua

`wrangler.jsonc` mendeklarasikan enam rate limiter dengan namespace ID `1001`
sampai `1006`. Namespace ID berlaku untuk seluruh akun Cloudflare Anda, bukan
untuk satu Worker, dan
[binding yang memakai ID sama akan berbagi penghitung yang sama](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Jadi berikan nomor tersendiri untuk tiap toko jika salah satu hal ini benar:

- Anda mendeploy template ini lebih dari sekali di akun yang sama. Toko staging
  dan toko production yang sama-sama memakai `1001` tidak mendapat satu limit
  masing-masing. Keduanya berbagi satu limit, dan trafik ke salah satunya
  menghabiskan jatah itu.
- Worker lain di akun Anda sudah memakai nomor dalam rentang tersebut.

Satu toko di akun baru tidak perlu diubah.
