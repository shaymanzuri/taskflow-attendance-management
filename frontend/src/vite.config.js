import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // הקריאות ל-/api מועברות לשרת Flask, כך שאין צורך ב-CORS
    proxy: { "/api": "http://127.0.0.1:5000" },
  },
});
