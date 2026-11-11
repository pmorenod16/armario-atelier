import { auth } from "./firebase.js";
import { API_URL } from "./config.js";

const apiConfigured = !API_URL.includes("TU-SUBDOMINIO");

/** Datos que van en todas las peticiones (sección de ropa de la cuenta, idioma). */
export const apiDefaults = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Llama al Worker con el token de Firebase. Lanza {message, status} con texto listo para mostrar.
 * timeout = tiempo total (por defecto 90 s, para que nada se quede colgado). Si falla por algo pasajero
 * (sin red un momento, servidor o IA saturados: 500/502/503) y queda tiempo, lo vuelve a intentar una vez.
 */
export async function api(path, body, { timeout = 90000, retries = 1 } = {}) {
  body = { ...apiDefaults, ...body };
  if (!apiConfigured) throw { message: "Falta poner la URL del servidor en src/config.js." };
  const deadline = Date.now() + timeout;
  for (let attempt = 0; ; attempt++) {
    try { return await once(path, body, deadline - Date.now()); }
    catch (e) {
      const passing = (e.status == null && !e.aborted && navigator.onLine !== false) || [500, 502, 503].includes(e.status);
      if (!passing || attempt >= retries || deadline - Date.now() < 10000) throw e;
      await sleep(1200 + attempt * 1500);
    }
  }
}
async function once(path, body, ms) {
  const token = await auth.currentUser.getIdToken();
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), Math.max(3000, ms));
  let res;
  try {
    res = await fetch(API_URL + path, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw { status: 504, aborted: true, message: "La IA está tardando demasiado." };
    throw { message: "No hay conexión con el servidor. Comprueba tu internet." };
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, message: data.error || "El servidor no ha podido responder. Inténtalo de nuevo." };
  return data;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64, type) {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
