// Outfit como lienzo limpio con las fotos de las prendas: rectas, de la cabeza a los pies y con poco solapamiento.
// Se puede editar: arrastrar, cambiar el tamaño (esquina o pellizco/rueda) y traer al frente. La colocación se guarda
// por combinación de prendas (users/{uid}/layouts/{ids ordenados}).
import { layerOf } from "../catalog.js";
import { esc, icon } from "../ui.js";
import { store, fullImage, saveLayout, deleteLayout, layoutKey } from "../data.js";
import { t } from "../i18n.js";

// Distribución tipo flat lay (como Whering), en % del lienzo 4:5: [izquierda, arriba, ancho, alto].
// Las prendas grandes forman la columna de la cabeza a los pies; los complementos van pequeños alrededor, a escala real.
const WITH_OUTER = { outer: [46, 3, 50, 46], top: [8, 6, 42, 37], dress: [8, 4, 44, 70], bottom: [18, 41, 36, 54], shoes: [58, 73, 34, 21] };
const NO_OUTER = { top: [18, 3, 50, 41], dress: [20, 3, 48, 70], bottom: [22, 42, 38, 55], shoes: [62, 75, 32, 20] };
// tamaño de cada complemento (proporcional a lo que mide de verdad al lado de una chaqueta)
const ACC_SIZE = { reloj: [12, 10], gafas: [18, 8], cinturon: [22, 11], gorra: [19, 13], gorro: [17, 14], bufanda: [19, 25], mochila: [25, 25], bolso: [23, 21], corbata: [8, 25], joya: [9, 8], otro: [15, 13] };
// huecos libres para complementos (centro x, centro y), del más cómodo al menos
const ACC_SPOTS = {
  outer: [[80, 58], [10, 52], [10, 70], [68, 90], [10, 88], [88, 70]],
  none: [[84, 14], [84, 38], [11, 52], [11, 72], [86, 58], [11, 90]],
};
// cada complemento prefiere un sitio: lo de la cabeza arriba, el cinturón a la altura de la cintura, la mochila abajo
const ACC_PREF = { gorra: 0, gorro: 0, gafas: 0, reloj: 1, joya: 1, cinturon: 2, corbata: 2, bufanda: 2, mochila: 3, bolso: 3 };
const EXTRA = [[2, 74, 24, 22], [76, 28, 22, 20], [30, 74, 24, 22]];

function autoLayout(items) {
  const hasOuter = items.some((it) => (it.layer || layerOf(it.type)) === "outer");
  const pos = hasOuter ? WITH_OUTER : NO_OUTER, extra = EXTRA.slice();
  const spots = ACC_SPOTS[hasOuter ? "outer" : "none"].map((p) => ({ p, free: true }));
  const used = new Set(), out = {};
  const place = (it) => {
    const [w, h] = ACC_SIZE[it.type] || ACC_SIZE.otro;
    const want = ACC_PREF[it.type] ?? 1;
    const spot = spots.slice(want).concat(spots.slice(0, want)).find((s) => s.free);
    if (!spot) return null;
    spot.free = false;
    const [cx, cy] = spot.p;
    return [Math.max(1, Math.min(99 - w, cx - w / 2)), Math.max(1, Math.min(99 - h, cy - h / 2)), w, h];
  };
  items.forEach((it, n) => {
    const L = it.layer || layerOf(it.type);
    let box = L !== "accessory" && !used.has(L) && pos[L];
    if (!box) box = L === "accessory" ? place(it) || extra.shift() : extra.shift() || place(it);
    used.add(L);
    out[it.id] = [...(box || [30, 30, 30, 30]), L === "accessory" ? 50 + n : n + 1];
  });
  return out;
}

/** HTML del lienzo (miniaturas; hydrateBoard las cambia por la foto grande). */
export function boardHTML(itemIds, { small = false } = {}) {
  const items = itemIds.map((id) => store.items.find((i) => i.id === id)).filter(Boolean);
  const saved = store.layouts?.[layoutKey(itemIds)]?.boxes;
  const auto = autoLayout(items);
  const cells = items.map((it, n) => {
    const [l, tp, w, h, z] = saved?.[it.id] || auto[it.id];
    return `<button type="button" class="bd-item" data-item="${it.id}" style="left:${l}%;top:${tp}%;width:${w}%;height:${h}%;z-index:${z};--d:${n * 50}ms" title="${esc(it.name)}">
      ${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}" data-full="${it.hasImage ? it.id : ""}" draggable="false">` : `<i style="background:${it.tone || "#999"}"></i>`}
      <span class="bd-handle" aria-hidden="true"></span></button>`;
  }).join("");
  return `<div class="board${small ? " small" : ""}" data-ids="${itemIds.join(",")}">${cells}</div>`;
}

/** Cambia las miniaturas por las fotos grandes (más nítidas). */
export function hydrateBoard(root) {
  root.querySelectorAll("img[data-full]").forEach(async (img) => {
    const it = store.items.find((i) => i.id === img.dataset.full); if (!it) return;
    const url = await fullImage(it); if (url && img.isConnected) img.src = url;
  });
}

/** Barra de edición debajo del lienzo. Devuelve el HTML; wireBoardEdit la activa. */
export const boardTools = () => `<div class="bd-tools row wrap">
  <button class="btn sm" type="button" data-bd="edit">${icon("edit")}${t("board.edit")}</button>
  <button class="btn sm ghost" type="button" data-bd="reset" hidden>${icon("refresh")}${t("board.reset")}</button>
  <button class="btn sm primary" type="button" data-bd="done" hidden>${icon("check")}${t("board.done")}</button>
  <span class="muted small bd-hint" hidden>${t("board.hint")}</span></div>`;

export function wireBoardEdit(container, onSaved) {
  const board = () => container.querySelector(".board");
  const set = (editing) => {
    const tools = container.querySelector(".bd-tools"); if (!tools) return;
    board()?.classList.toggle("editing", editing);
    tools.querySelector('[data-bd="edit"]').hidden = editing;
    tools.querySelectorAll('[data-bd="reset"],[data-bd="done"],.bd-hint').forEach((x) => (x.hidden = !editing));
  };
  container.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-bd]"); if (!b) return;
    const bd = board(); if (!bd) return;
    const ids = bd.dataset.ids.split(",");
    if (b.dataset.bd === "edit") set(true);
    if (b.dataset.bd === "done") { set(false); await saveLayout(ids, readBoxes(bd)).catch(() => {}); onSaved?.(); }
    if (b.dataset.bd === "reset") {
      await deleteLayout(ids).catch(() => {});
      const auto = autoLayout(ids.map((id) => store.items.find((i) => i.id === id)).filter(Boolean));
      bd.querySelectorAll(".bd-item").forEach((el) => { const [l, tp, w, h, z] = auto[el.dataset.item]; Object.assign(el.style, { left: l + "%", top: tp + "%", width: w + "%", height: h + "%", zIndex: z }); });
    }
  });
  // arrastrar / redimensionar / traer al frente (solo en modo edición)
  let drag = null;
  const pts = new Map();
  container.addEventListener("pointerdown", (e) => {
    const bd = board(); if (!bd?.classList.contains("editing")) return;
    const el = e.target.closest(".bd-item"); if (!el) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); pts.set(e.pointerId, e);
    document.body.classList.add("no-select"); getSelection()?.removeAllRanges();
    const R = bd.getBoundingClientRect(), z = Math.max(...[...bd.children].map((c) => +c.style.zIndex || 0)) + 1;
    el.style.zIndex = z;
    drag = { el, R, mode: e.target.classList.contains("bd-handle") ? "size" : "move", x: e.clientX, y: e.clientY,
      l: parseFloat(el.style.left), t: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height), pinch: 0 };
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || !pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    const { el, R } = drag;
    if (pts.size === 2) { // pellizco: escala
      const [a, b] = [...pts.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!drag.pinch) { drag.pinch = d; drag.w0 = parseFloat(el.style.width); drag.h0 = parseFloat(el.style.height); return; }
      return scale(el, drag.w0 * d / drag.pinch, drag.h0 * d / drag.pinch);
    }
    const dx = ((e.clientX - drag.x) / R.width) * 100, dy = ((e.clientY - drag.y) / R.height) * 100;
    if (drag.mode === "move") { el.style.left = clamp(drag.l + dx, -drag.w * 0.4, 100 - drag.w * 0.6) + "%"; el.style.top = clamp(drag.t + dy, -drag.h * 0.4, 100 - drag.h * 0.6) + "%"; }
    else { const k = Math.max((drag.w + dx) / drag.w, (drag.h + dy) / drag.h); scale(el, drag.w * k, drag.h * k, true); }
  });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size) { drag = null; document.body.classList.remove("no-select"); } };
  container.addEventListener("pointerup", up); container.addEventListener("pointercancel", up);
  container.addEventListener("wheel", (e) => {
    const bd = board(); if (!bd?.classList.contains("editing")) return;
    const el = e.target.closest(".bd-item"); if (!el) return;
    e.preventDefault(); const k = e.deltaY < 0 ? 1.06 : 0.94;
    scale(el, parseFloat(el.style.width) * k, parseFloat(el.style.height) * k);
  }, { passive: false });
  // en modo edición, tocar una prenda no abre su ficha
  container.addEventListener("click", (e) => { if (board()?.classList.contains("editing") && e.target.closest(".bd-item")) e.stopPropagation(); }, true);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function scale(el, w, h, keepCorner = false) {
  const k = clamp(w, 10, 100) / w; w *= k; h *= k;
  if (!keepCorner) { // escala desde el centro
    const cx = parseFloat(el.style.left) + parseFloat(el.style.width) / 2, cy = parseFloat(el.style.top) + parseFloat(el.style.height) / 2;
    el.style.left = cx - w / 2 + "%"; el.style.top = cy - h / 2 + "%";
  }
  el.style.width = w + "%"; el.style.height = h + "%";
}
function readBoxes(bd) {
  const out = {};
  bd.querySelectorAll(".bd-item").forEach((el) => {
    out[el.dataset.item] = ["left", "top", "width", "height"].map((p) => Math.round(parseFloat(el.style[p]) * 10) / 10).concat(+el.style.zIndex || 1);
  });
  return out;
}
