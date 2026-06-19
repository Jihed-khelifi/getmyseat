import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite + Vitest config for the seating-map frontend.
// Test config lives here so Vitest and Vite share one resolver (incl. the `@` alias).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Plan 08: proxy API calls to the backend in dev so the frontend can use a
    // same-origin `/api` base (no CORS, no hard-coded backend URL in code).
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // Plan 09: proxy the WebSocket channel so the client can use same-origin
      // `/ws` in dev (the backend serves `WS /ws` directly).
      "/ws": {
        target: process.env.VITE_WS_PROXY_TARGET ?? "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
