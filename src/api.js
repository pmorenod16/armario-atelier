import { auth } from "./firebase.js";
import { API_URL } from "./config.js";

export const apiConfigured = !API_URL.includes("TU-SUBDOMINIO");

/** Llama al Worker con el token de Firebase. Lanza {message, status} con texto listo para mostrar. */
export async function api(path, body) {
  if (!apiConfigured) throw { message: "Falta poner la URL del servidor en src/config.js." };
  const token = await auth.currentUser.getIdToken();
  let res;
  try {
    res = await fetch(API_URL + path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch {
    throw { message: "No hay conexión con el servidor. Comprueba tu internet." };
  }
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
