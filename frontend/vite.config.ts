import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_URL ?? "http://127.0.0.1:8001";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5180,
    proxy: {
      "/api": apiTarget,
      "/docs": apiTarget,
      "/openapi.json": apiTarget,
    },
  },
});
