import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const cloudflareEnvShim = resolve(
  import.meta.dirname,
  "src/lib/cloudflare-env-shim.ts"
);

// The browser build has no `cloudflare:workers` module, so client imports
// resolve to an empty env object instead.
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
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      [resolve(import.meta.dirname, "src/lib/cloudflare-env.ts")]: resolve(
        import.meta.dirname,
        "src/lib/cloudflare-env.workers.ts"
      ),
    },
    tsconfigPaths: true,
  },
});

export default config;
