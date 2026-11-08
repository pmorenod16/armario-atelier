// Actualización automática: la app (web y APK, que carga la web publicada) mira si hay una versión nueva
// al abrirse, al volver a primer plano y cada 30 min; si la hay, se recarga sola (sin pasar por la caché).
import { App } from "@capacitor/app";
import { isNative, topSheet, toast } from "./ui.js";

export const BUILD = typeof __BUILD__ !== "undefined" ? __BUILD__ : "dev";
let checking = false;

/** Devuelve la versión publicada, o null si no se puede saber. */
async function latest() {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    return r.ok ? (await r.json()).build : null;
  } catch { return null; }
}

/** Si hay versión nueva, recarga. `manual` = el usuario lo ha pedido (avisa si no hay nada). */
export async function checkUpdate({ manual = false } = {}) {
  if (checking || BUILD.startsWith("dev")) { if (manual) toast("Estás en la versión de desarrollo."); return false; }
  checking = true;
  try {
    const v = await latest();
    if (!v || v === BUILD) { if (manual) toast(v ? "Ya tienes la última versión." : "No he podido comprobarlo: revisa tu conexión."); return false; }
    // no recargar dos veces por la misma versión (por si la caché de GitHub tarda en soltarla)
    let tried = ""; try { tried = sessionStorage.getItem("upd-tried") || ""; } catch {}
    if (tried === v && !manual) return false;
    try { sessionStorage.setItem("upd-tried", v); } catch {}
    if (topSheet() && !manual) return false; // no cortar lo que esté haciendo; se aplicará al volver
    const url = new URL(location.href);
    url.searchParams.set("v", v);
    location.replace(url.toString());
    return true;
  } finally { checking = false; }
}

export function startUpdater() {
  setTimeout(() => checkUpdate(), 2500);
  if (isNative) App.addListener("resume", () => checkUpdate());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  setInterval(() => checkUpdate(), 30 * 60 * 1000);
}
