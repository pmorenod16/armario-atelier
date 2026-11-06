import { defineConfig } from "vite";

// base relativa: funciona dentro del APK (Capacitor) y en GitHub Pages (/repo/)
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ["@imgly/background-removal"] },
});
