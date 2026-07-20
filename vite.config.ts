import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

export default defineConfig({
  // GitHub Pages serves from /<repo>/ — CI sets VITE_BASE accordingly
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    // Event-day resilience: the app shell loads from cache even on dead
    // Wi-Fi. Data lives in localStorage (later Supabase), unaffected.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand/*.png"],
      manifest: {
        name: "The Ledge Games Scoring",
        short_name: "Ledge Games",
        description: "Live competition scoring for The Ledge Games",
        theme_color: "#08080c",
        background_color: "#08080c",
        display: "standalone",
        icons: [
          {
            // Relative so it resolves under the deploy base path
            src: "brand/The-Ledge-Games-Icon-1.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
          "season-2025": ["./src/data/season-2025.json"],
        },
      },
    },
  },
});
