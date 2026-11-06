import { defineConfig } from "vite";

// base relativa: funciona dentro del APK (Capacitor) y en GitHub Pages (/repo/)
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ["@imgly/background-removal"] },
  // una sola copia de Firebase aunque el plugin de Google la pida también
  resolve: { dedupe: ["firebase", "@firebase/app", "@firebase/auth", "@firebase/component", "@firebase/firestore"] },
});
