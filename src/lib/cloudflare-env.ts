// Default Node/script boundary. Cloudflare builds alias this file to
// `cloudflare-env.workers.ts`, which reads `cloudflare:workers`.
// biome-ignore lint/performance/noBarrelFile: This file isolates the portable env module boundary.
export { env } from "./cloudflare-env-shim";
