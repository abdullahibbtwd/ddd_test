import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      // Colocated tests under routes/ are not routes.
      routeFileIgnorePattern: "__tests__",
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Inject a small register script into index.html for production builds.
      injectRegister: "script",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "DD CRM",
        short_name: "DD CRM",
        description: "Управление на клиенти, посещения и фактури",
        lang: "bg",
        dir: "ltr",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: "#1F6F54",
        background_color: "#F6F7F8",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell ONLY: precache built js/css/html/icons (+ latin/cyrillic fonts).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/*-ext-*.woff2"],
        // No runtime caching — /api/* and /admin/* must never be cached.
        runtimeCaching: [],
        navigateFallback: "index.html",
        // Never serve the SPA shell for API (incl. Bull Board at /api/admin/queues).
        // Keep /admin/ denylisted so any leftover deep link is not cached as SPA.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Workspace package is CommonJS (dist); consume its ESM sources so the bundle tree-shakes
      // and dev/test do not require `pnpm --filter @ddcrm/shared build` first.
      "@ddcrm/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Covers API + Bull Board (/api/admin/queues)
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
