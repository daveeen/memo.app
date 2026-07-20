import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Memo",
        short_name: "Memo",
        start_url: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["essentia.js"] }, // wasm-backed; don't pre-bundle
});
