// Leer un tablero público de Pinterest desde el propio móvil/navegador (Pinterest suele bloquear a los servidores).
// Usa el widget público de incrustar tableros (JSONP, sin clave), el mismo que usan las webs para mostrar un tablero.
import { api } from "./api.js";

/** "https://www.pinterest.es/usuario/tablero/…" → {user, slug}. Los enlaces pin.it se resuelven antes en el servidor. */
export async function boardFromUrl(raw) {
  let url = String(raw || "").trim().match(/https?:\/\/\S+/)?.[0] || String(raw || "").trim();
  if (/^(www\.)?pin\.it\//i.test(url)) url = "https://" + url;
  if (/pin\.it\//i.test(url)) url = (await api("/api/style/resolve", { url })).url;
  let u; try { u = new URL(url); } catch { throw new Error("Ese enlace no es de Pinterest. Abre el tablero, toca Compartir → Copiar enlace y pégalo aquí."); }
  if (!/(^|\.)pinterest\.[a-z.]+$/i.test(u.hostname)) throw new Error("Ese enlace no es de Pinterest. Abre el tablero, toca Compartir → Copiar enlace y pégalo aquí.");
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || ["pin", "search", "ideas", "url_shortener"].includes(parts[0])) throw new Error("Ese enlace no es de un tablero. Abre el tablero (no un pin suelto ni tu perfil), toca Compartir → Copiar enlace y pégalo aquí.");
  return { user: decodeURIComponent(parts[0]), slug: decodeURIComponent(parts[1]), url: `https://www.pinterest.com/${parts[0]}/${parts[1]}/` };
}

let n = 0;
function jsonp(src, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const cb = `__pin${Date.now()}${n++}`, s = document.createElement("script");
    const done = (fn, v) => { clearTimeout(timer); delete window[cb]; s.remove(); fn(v); };
    const timer = setTimeout(() => done(reject, new Error("tiempo")), timeout);
    window[cb] = (data) => done(resolve, data);
    s.onerror = () => done(reject, new Error("red"));
    s.src = `${src}${src.includes("?") ? "&" : "?"}callback=${cb}`;
    document.head.append(s);
  });
}

/** Pines del tablero: [{img, link, title}] (hasta 50). */
export async function boardPins({ user, slug }) {
  const d = await jsonp(`https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/pins/`);
  if (d?.status && d.status !== "success") throw new Error(d.message || "estado " + d.status);
  return (d?.data?.pins || []).map((p) => ({
    img: (p.images?.["564x"]?.url || p.images?.["237x"]?.url || "").replace(/\/(236x|237x|474x|736x)\//, "/564x/"),
    link: p.id ? `https://www.pinterest.com/pin/${p.id}/` : null,
    title: p.description || "",
  })).filter((p) => p.img);
}

/** Descarga una imagen de pin desde el dispositivo (para cuando el servidor no puede) y la devuelve en base64 JPEG. */
export async function pinToBase64(src, max = 900) {
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
