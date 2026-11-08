// Utilidades de interfaz: selección, avisos, hojas (paneles), fotos, efecto 3D y halo de color.
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { t } from "./i18n.js";

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isNative = Capacitor.isNativePlatform();
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function say(el, text, kind = "") {
  const n = typeof el === "string" ? $(el) : el; if (!n) return;
  n.textContent = text || ""; n.dataset.kind = kind;
}

/* ---------- avisos breves ---------- */
let toastTimer;
export function toast(text, kind = "") {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = text; el.dataset.kind = kind; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------- hojas: panel a pantalla completa en el móvil, ventana centrada en el ordenador ---------- */
const sheets = [];
export function openSheet(content, { label = "", wide = false, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet-backdrop"></div><section class="sheet${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"></section>`;
  const sheet = $(".sheet", wrap);
  if (typeof content === "string") sheet.innerHTML = content; else sheet.append(content);
  document.body.append(wrap);
  document.body.classList.add("has-sheet");
  requestAnimationFrame(() => wrap.classList.add("open"));
  const api = {
    el: sheet,
    close() {
      const i = sheets.indexOf(api); if (i < 0) return;
      sheets.splice(i, 1); wrap.classList.remove("open");
      setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 320);
      if (!sheets.length) document.body.classList.remove("has-sheet");
      onClose?.();
    },
  };
  $(".sheet-backdrop", wrap).onclick = () => api.close();
  sheets.push(api);
  setTimeout(() => sheet.focus({ preventScroll: true }), 50);
  return api;
}
export const topSheet = () => sheets.at(-1);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") topSheet()?.close(); });

/* ---------- fotos: cámara nativa en el APK, selector de archivos en la web ---------- */
export async function pickPhoto({ prompt = true } = {}) {
  if (isNative) {
    const p = await Camera.getPhoto({
      source: prompt ? CameraSource.Prompt : CameraSource.Camera, resultType: CameraResultType.Uri, quality: 88, width: 1800,
      correctOrientation: true, promptLabelHeader: t("add.title"), promptLabelPhoto: "Elegir de la galería",
      promptLabelPicture: "Hacer foto", promptLabelCancel: t("common.cancel"),
    });
    return await (await fetch(p.webPath)).blob();
  }
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
/** Varias fotos a la vez (capturas de Pinterest…). Devuelve una lista de Blob. */
export async function pickPhotos(limit = 12) {
  if (isNative) {
    const r = await Camera.pickImages({ quality: 85, width: 1400, limit });
    return Promise.all(r.photos.map(async (p) => (await fetch(p.webPath)).blob()));
  }
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = () => resolve([...inp.files].slice(0, limit));
    inp.click();
  });
}
export const isCancel = (e) => /cancel/i.test(String(e?.message || e || ""));

/** Zona que acepta arrastrar y soltar una imagen (ordenador). */
export function dropZone(el, onFile) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault(); el.classList.remove("over");
    const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (f) onFile(f);
  });
}

/* ---------- efecto 3D: la tarjeta se inclina siguiendo el puntero ---------- */
export function tilt(root, selector, max = 7) {
  if (reduceMotion() || !matchMedia("(hover: hover)").matches) return;
  root.addEventListener("pointermove", (e) => {
    const el = e.target.closest(selector); if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  });
  root.addEventListener("pointerout", (e) => {
    const el = e.target.closest(selector); if (!el || el.contains(e.relatedTarget)) return;
    el.style.removeProperty("--rx"); el.style.removeProperty("--ry");
  });
}

/* ---------- halo: el fondo toma los colores de lo que se ve ---------- */
export function setHalo(a, b) {
  const s = document.documentElement.style;
  if (!a) { s.removeProperty("--halo-a"); s.removeProperty("--halo-b"); return; }
  s.setProperty("--halo-a", a); s.setProperty("--halo-b", b || a);
}

/** Mezcla un color con blanco/negro (para fondos suaves de tarjeta). */
export function soften(hex, amount = 0.82, toward = 255) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (toward - v) * amount));
  return `rgb(${c.join(",")})`;
}

/* ---------- iconos (trazo 1.7, 24×24) ---------- */
const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  closet: '<path d="M12 7.2a2 2 0 1 1 2-2"/><path d="M12 7.2v1.3L3.6 14.3a1.6 1.6 0 0 0 .9 2.9h15a1.6 1.6 0 0 0 .9-2.9L12 8.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shop: '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8h-9a1 1 0 0 1-1-.8z"/><path d="M9 10.5V6.8a3 3 0 0 1 6 0v3.7"/>',
  profile: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.5 20.5c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  tag: '<path d="M3.5 12.3V4.8a1.3 1.3 0 0 1 1.3-1.3h7.5l8.2 8.2a1.3 1.3 0 0 1 0 1.8l-7.5 7.5a1.3 1.3 0 0 1-1.8 0z"/><circle cx="8" cy="8" r="1.4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8L17.5 7"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  gps: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  spark: '<path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9z"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  sort: '<path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  logout: '<path d="M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5"/><path d="M10 8l-4 4 4 4M6 12h9.5"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18.5z"/>',
  cloudsun: '<path d="M9.5 4.5v1.3M4.6 6.6l.9.9M3 11.5h1.3M13.9 7.5l.9-.9"/><path d="M6.6 11a3.5 3.5 0 0 1 6.1-2.8"/><path d="M9 19.5h8.8a3.4 3.4 0 0 0 .3-6.8 4.6 4.6 0 0 0-8.9 1A2.9 2.9 0 0 0 9 19.5z"/>',
  rain: '<path d="M7 15.5h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 15.5z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
  snow: '<path d="M7 15h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 15z"/><path d="M9 18.5h.01M12 20h.01M15 18.5h.01"/>',
  storm: '<path d="M7 15h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 15z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
  fog: '<path d="M4 9.5h16M6 13h12M4 16.5h16M8 20h8"/>',
  up: '<path d="M7.5 21H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 11h2.5m0 10V11m0 10h9.6a2 2 0 0 0 2-1.6l1.3-6.5a2 2 0 0 0-2-2.4H14V5.6A2.6 2.6 0 0 0 11.4 3L7.5 11"/>',
  down: '<path d="M16.5 3H19a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 13h-2.5m0-10v10m0-10H6.9a2 2 0 0 0-2 1.6l-1.3 6.5a2 2 0 0 0 2 2.4H10v4.9A2.6 2.6 0 0 0 12.6 21l3.9-8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  bookmark: '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5l1.5-2ZM10 20.5a2 2 0 0 0 4 0"/>',
  wash: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><circle cx="12" cy="13" r="4.2"/><path d="M7.5 6.5h2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  bag: '<rect x="4" y="7.5" width="16" height="12.5" rx="2"/><path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M9 11v5M15 11v5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  wind: '<path d="M3 8.5h11a2.5 2.5 0 1 0-2.5-2.5M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5M3 16.5h7"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
