// 1) Pega aquí la configuración web de tu proyecto de Firebase
//    (Consola de Firebase → Configuración del proyecto → Tus apps → App web → Configuración del SDK).
//    Estos valores no son secretos: identifican el proyecto, la seguridad la ponen las reglas de Firestore.
export const firebaseConfig = {
  apiKey: "PEGA_AQUI",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  appId: "PEGA_AQUI",
};

// 2) URL de tu Worker de Cloudflare (la que te da `npx wrangler deploy`), sin barra final.
export const API_URL = "https://armario-api.TU-SUBDOMINIO.workers.dev";
