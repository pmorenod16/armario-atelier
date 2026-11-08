import { defineConfig } from "vite";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// versión de esta compilación: la app la compara con dist/version.json para actualizarse sola
const BUILD = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim() + "-" + Date.now().toString(36); } catch { return "dev-" + Date.now().toString(36); } })();

// base relativa: funciona dentro del APK (Capacitor) y en GitHub Pages (/repo/)
export default defineConfig({
  base: "./",
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ["@imgly/background-removal"] },
  // una sola copia de Firebase aunque el plugin de Google la pida también
  resolve: { dedupe: ["firebase", "@firebase/app", "@firebase/auth", "@firebase/component", "@firebase/firestore"] },
  plugins: [{ name: "version-json", writeBundle(o) { writeFileSync(`${o.dir || "dist"}/version.json`, JSON.stringify({ build: BUILD, at: new Date().toISOString() })); } }],
});
