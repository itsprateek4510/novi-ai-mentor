import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built app is served by the FastAPI backend under /dist.
// In dev, Vite runs on :5173 and proxies the API + static assets to :8000.
export default defineConfig({
  plugins: [react()],
  base: "/dist/",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/static": "http://localhost:8000",
      "/docs": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});