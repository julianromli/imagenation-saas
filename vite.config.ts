import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

const isCloudflareBuild = process.env.CLOUDFLARE === "1";
const cloudflareEnvShim = resolve(
  import.meta.dirname,
  "src/lib/cloudflare-env-shim.ts"
);
const cloudflareClientShim: Plugin = {
  name: "cloudflare-workers-client-shim",
  resolveId(source, _importer, options) {
    if (source === "cloudflare:workers" && !options?.ssr) {
      return cloudflareEnvShim;
    }

    return null;
  },
};
const config = defineConfig({
  plugins: [
    cloudflareClientShim,
    ...(isCloudflareBuild
      ? [cloudflare({ viteEnvironment: { name: "ssr" } })]
      : []),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(isCloudflareBuild ? [] : [nitro()]),
  ],
  resolve: {
    alias: isCloudflareBuild
      ? undefined
      : {
          "cloudflare:workers": cloudflareEnvShim,
        },
    tsconfigPaths: true,
  },
});

export default config;
