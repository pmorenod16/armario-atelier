// Leer un tablero público de Pinterest desde el propio móvil/navegador (Pinterest suele bloquear a los servidores).
// Usa el widget público de incrustar tableros (JSONP, sin clave), el mismo que usan las webs para mostrar un tablero.
import { api } from "./api.js";
import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./ui.js";

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

const big = (u) => u.replace(/\/(60x60|75x75_RS|170x|236x|237x|474x|736x|originals)\//, "/564x/");

/** Pines del tablero: [{img, link, title}]. Prueba varias vías y guarda por qué falla cada una (para el mensaje de error). */
export async function boardPins(board) {
  const why = [];
  // en el APK se lee el tablero entero (por páginas); el widget y el RSS solo dan los últimos pines
  const tries = isNative ? [["tablero", nativeFeed], ["widget", widgetPins], ["rss", nativeRss], ["página", nativePage]] : [["widget", widgetPins]];
  let best = [];
  for (const [name, fn] of tries) {
    try {
      const pins = await fn(board);
      if (pins.length > best.length) best = pins;
      if (pins.length >= 60 || (best.length && name !== "tablero")) return best;
      if (!pins.length) why.push(`${name}: sin pines`);
    } catch (e) { why.push(`${name}: ${e?.message || e}`); }
  }
  if (best.length) return best;
  const err = new Error(why.join(" · ")); err.why = why; throw err;
}

// En el APK: petición nativa desde el móvil (sin las restricciones del navegador)
const UA = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "Accept-Language": "es-ES,es;q=0.9" };
async function nativeGet(url) {
  const r = await CapacitorHttp.get({ url, headers: UA, responseType: "text", connectTimeout: 12000, readTimeout: 12000 });
  if (r.status >= 400) throw new Error("HTTP " + r.status);
  return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
}
/** Tablero entero con la API interna de la web de Pinterest (la misma que usa al hacer scroll), hasta 300 pines. */
async function nativeFeed({ user, slug }) {
  const path = `/${user}/${slug}/`;
  const res = async (name, options) => {
    const url = `https://www.pinterest.com/resource/${name}/get/?source_url=${encodeURIComponent(path)}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;
    const r = await CapacitorHttp.get({ url, headers: { ...UA, Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", "X-Pinterest-Source-Url": path }, connectTimeout: 12000, readTimeout: 15000 });
    if (r.status >= 400) throw new Error("HTTP " + r.status);
    const j = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    return j?.resource_response || {};
  };
  const id = (await res("BoardResource", { username: user, slug, field_set_key: "detailed" })).data?.id;
  if (!id) throw new Error("sin id");
  const out = [], seen = new Set();
  let bookmark = null;
  for (let page = 0; page < 12 && out.length < 300; page++) {
    const r = await res("BoardFeedResource", { board_id: id, board_url: path, page_size: 50, field_set_key: "react_grid_pin", ...(bookmark ? { bookmarks: [bookmark] } : {}) });
    for (const p of Array.isArray(r.data) ? r.data : []) {
      const src = p?.images?.["564x"]?.url || p?.images?.["474x"]?.url || p?.images?.["236x"]?.url || p?.images?.orig?.url;
      if (!src || p.type && p.type !== "pin") continue;
      const img = big(src); if (seen.has(img)) continue; seen.add(img);
      out.push({ img, link: p.id ? `https://www.pinterest.com/pin/${p.id}/` : null, title: p.grid_title || p.title || p.description || "" });
    }
    bookmark = r.bookmark;
    if (!bookmark || bookmark === "-end-") break;
  }
  return out;
}
async function nativeRss({ user, slug }) {
  const xml = await nativeGet(`https://www.pinterest.com/${encodeURIComponent(user)}/${encodeURIComponent(slug)}.rss`);
  const out = [], seen = new Set();
  for (const it of xml.split("<item>").slice(1)) {
    const img = it.match(/https:\/\/i\.pinimg\.com\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp)/i)?.[0]; if (!img || seen.has(big(img))) continue;
    seen.add(big(img));
    out.push({ img: big(img), link: it.match(/<link>([^<]+)<\/link>/)?.[1] || null, title: it.match(/<title>(?:<!\[CDATA\[)?([^<\]]*)/)?.[1] || "" });
  }
  return out;
}
async function nativePage({ user, slug }) {
  const html = await nativeGet(`https://www.pinterest.com/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/`);
  const seen = new Set(), out = [];
  for (const m of html.matchAll(/https:\\?\/\\?\/i\.pinimg\.com\\?\/(?:236x|474x|564x|736x)\\?\/[0-9a-f\\/]+\.jpg/gi)) {
    const img = big(m[0].replace(/\\\//g, "/"));
    if (!seen.has(img)) { seen.add(img); out.push({ img, link: null, title: "" }); }
  }
  return out.slice(0, 60);
}

/** Widget público de incrustar tableros (JSONP): funciona en el navegador sin restricciones de origen. */
async function widgetPins({ user, slug }) {
  const d = await jsonp(`https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/pins/?page_size=250`);
  if (d?.status && d.status !== "success") throw new Error(d.message || "estado " + d.status);
  return (d?.data?.pins || []).map((p) => ({
    img: big(p.images?.["564x"]?.url || p.images?.["237x"]?.url || ""),
    link: p.id ? `https://www.pinterest.com/pin/${p.id}/` : null,
    title: p.description || "",
  })).filter((p) => p.img);
}

/** Descarga una imagen de pin desde el dispositivo (para cuando el servidor no puede) y la devuelve en base64 JPEG. */
export async function pinToBase64(src, max = 900) {
  if (isNative) { // en el APK, descarga nativa (sin restricciones de origen)
    const r = await CapacitorHttp.get({ url: src, headers: UA, responseType: "blob" });
    if (r.status >= 400 || typeof r.data !== "string") throw new Error("HTTP " + r.status);
    src = "data:image/jpeg;base64," + r.data;
  }
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
