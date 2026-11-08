// Outfit como composición de las fotos de las prendas (flat lay): cada prenda en su sitio,
// con sombra y un ligero giro, como si estuvieran colocadas sobre una mesa.
import { layerOf } from "../catalog.js";
import { esc } from "../ui.js";
import { store, fullImage } from "../data.js";
import { tintFor } from "./add.js";

// Posición de cada capa en el panel (en % del panel): izquierda, arriba, ancho, alto, giro, orden
const WITH_OUTER = {
  outer: [3, 3, 48, 42, -4, 3], top: [50, 6, 46, 38, 3, 2], dress: [50, 5, 46, 60, 2, 2],
  bottom: [22, 46, 44, 50, -1, 1], shoes: [64, 75, 30, 18, -3, 4],
};
const NO_OUTER = {
  top: [18, 3, 64, 40, 0, 2], dress: [22, 3, 56, 64, 0, 2],
  bottom: [12, 45, 50, 52, -1, 1], shoes: [60, 73, 34, 19, -3, 4],
};
const ACC = [[2, 74, 26, 20, 6, 5], [2, 52, 22, 18, -6, 5], [74, 56, 24, 18, 5, 5], [76, 36, 22, 16, -4, 5]];

/** HTML del panel con las miniaturas (se cambian por la foto grande con hydrateBoard). */
export function boardHTML(itemIds, { small = false } = {}) {
  const items = itemIds.map((id) => store.items.find((i) => i.id === id)).filter(Boolean);
  const layers = items.map((it) => ({ it, L: it.layer || layerOf(it.type) }));
  const hasOuter = layers.some((x) => x.L === "outer");
  const pos = hasOuter ? WITH_OUTER : NO_OUTER;
  const used = {}; let acc = 0;
  const tone = items.find((i) => (i.layer || layerOf(i.type)) === "top")?.tone || items[0]?.tone;
  const cells = layers.map(({ it, L }, n) => {
    let p = pos[L];
    if (!p || used[L]) p = ACC[acc++ % ACC.length]; // complementos y prendas repetidas de una misma capa
    used[L] = true;
    const [l, t, w, h, r, z] = p;
    return `<button type="button" class="bd-item" data-item="${it.id}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%;--r:${r}deg;z-index:${z};--d:${n * 60}ms" title="${esc(it.name)}">
      ${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}" data-full="${it.hasImage ? it.id : ""}">` : `<i style="background:${it.tone || "#999"}"></i>`}</button>`;
  }).join("");
  return `<div class="board${small ? " small" : ""}" style="--tint:${tintFor(tone) || "var(--surface-solid)"}">${cells}</div>`;
}

/** Cambia las miniaturas por las fotos grandes (más nítidas) cuando se han descargado. */
export function hydrateBoard(root) {
  root.querySelectorAll("img[data-full]").forEach(async (img) => {
    const it = store.items.find((i) => i.id === img.dataset.full); if (!it) return;
    const url = await fullImage(it); if (url && img.isConnected) img.src = url;
  });
}
