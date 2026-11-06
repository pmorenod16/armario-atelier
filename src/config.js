// 1) Pega aquí la configuración web de tu proyecto de Firebase
//    (Consola de Firebase → Configuración del proyecto → Tus apps → App web → Configuración del SDK).
//    Estos valores no son secretos: identifican el proyecto, la seguridad la ponen las reglas de Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyAU56KIUa6Ih4ejphgj8EpQX3ra0ecAUHs",
  authDomain: "armario-atelier.firebaseapp.com",
  projectId: "armario-atelier",
  appId: "1:712860814730:web:ff3937785f5ce40ed60c73",
};

// 2) URL de tu Worker de Cloudflare (la que te da `npx wrangler deploy`), sin barra final.
export const API_URL = "https://armario-api.TU-SUBDOMINIO.workers.dev";
