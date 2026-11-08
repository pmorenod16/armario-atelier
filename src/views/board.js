// Outfit como lienzo limpio con las fotos de las prendas: rectas, de la cabeza a los pies y con poco solapamiento.
// Se puede editar: arrastrar, cambiar el tamaño (esquina o pellizco/rueda) y traer al frente. La colocación se guarda
// por combinación de prendas (users/{uid}/layouts/{ids ordenados}).
import { layerOf } from "../catalog.js";
import { esc, icon } from "../ui.js";
import { store, fullImage, saveLayout, deleteLayout, layoutKey } from "../data.js";
import { t } from "../i18n.js";

// Caja de cada capa (% del lienzo 4:5): izquierda, arriba, ancho, alto
const WITH_OUTER = { top: [4, 3, 46, 40], outer: [50, 2, 47, 44], dress: [6, 3, 44, 66], bottom: [10, 44, 40, 53], shoes: [54, 74, 40, 22] };
const NO_OUTER = { top: [5, 3, 54, 44], dress: [10, 3, 50, 70], bottom: [12, 46, 42, 52], shoes: [58, 72, 38, 24] };
const ACC = { outer: [[54, 50, 20, 20], [76, 50, 21, 20]], none: [[62, 8, 34, 26], [62, 38, 32, 28]] };
const EXTRA = [[2, 74, 24, 22], [76, 28, 22, 20], [30, 74, 24, 22]];

function autoLayout(items) {
  const hasOuter = items.some((it) => (it.layer || layerOf(it.type)) === "outer");
  const pos = hasOuter ? WITH_OUTER : NO_OUTER, acc = ACC[hasOuter ? "outer" : "none"].slice(), extra = EXTRA.slice();
  const used = new Set(), out = {};
  items.forEach((it, n) => {
    const L = it.layer || layerOf(it.type);
    let box = !used.has(L) && pos[L];
    if (!box) box = L === "accessory" ? acc.shift() || extra.shift() : extra.shift() || acc.shift();
    used.add(L);
    out[it.id] = [...(box || [30, 30, 30, 30]), n + 1];
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
