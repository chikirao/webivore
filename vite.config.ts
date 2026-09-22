import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": "http://127.0.0.1:3001" },
    // Downloads can be exclusively locked while Chromium writes them on Windows.
    watch: { ignored: ["**/artifacts/**"] },
  },
});