// Rehacer el recorte de las prendas que ya están en el armario con el recorte nuevo (solo la prenda).
// Guarda una copia de cada foto antes de cambiarla, para poder deshacer.
import { store, readImage, backupImage, restoreImage, saveItem } from "./data.js";
import { base64ToBlob, api, blobToBase64 } from "./api.js";
import { makeCutout, shrinkPhoto } from "./cutout.js";

async function locate(blob) {
  const small = await shrinkPhoto(blob, 768);
  return (await api("/api/locate", { image: await blobToBase64(small) }, { timeout: 12000 })).box;
}
/** La foto guardada (con transparencia) sobre fondo blanco, como si fuera una foto normal. */
async function onWhite(img) {
  const url = URL.createObjectURL(base64ToBlob(img.data, img.mime || "image/webp"));
  try {
    const im = new Image(); im.src = url; await im.decode();
    const pad = Math.round(Math.max(im.naturalWidth, im.naturalHeight) * 0.06);
    const c = document.createElement("canvas"); c.width = im.naturalWidth + pad * 2; c.height = im.naturalHeight + pad * 2;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, pad, pad);
    return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  } finally { URL.revokeObjectURL(url); }
}

/** onProgress({done, total, ok, kept, name}). Devuelve {ok, kept, failed}. */
export async function recutAll(onProgress = () => {}, { ids } = {}) {
  const list = store.items.filter((i) => i.hasImage && (!ids || ids.includes(i.id)));
  const res = { ok: 0, kept: 0, failed: 0 };
  for (let k = 0; k < list.length; k++) {
    const it = list[k];
    onProgress({ done: k, total: list.length, ...res, name: it.name });
    try {
      const img = await readImage(it.id); if (!img?.data) { res.failed++; continue; }
      const cut = await makeCutout(await onWhite(img), () => {}, { locate });
      if (cut.method !== "ia" || !cut.blob) { res.kept++; continue; } // si no sale mejor, se queda como estaba
      await backupImage(it.id, img, it);
      const { id, ...data } = it;
      await saveItem(data, { id, cut });
      res.ok++;
    } catch (e) { console.warn("recorte", it.name, e); res.failed++; }
  }
  onProgress({ done: list.length, total: list.length, ...res, name: "" });
  return res;
}
export async function undoRecuts(onProgress = () => {}) {
  let n = 0;
  for (const it of store.items) { if (await restoreImage(it.id).catch(() => false)) n++; onProgress(n); }
  return n;
}
