// Compartir un outfit como imagen (para WhatsApp, la galería…): se dibuja el lienzo en un PNG con las fotos
// grandes, colocadas igual que en la app (la colocación guardada o la automática).
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "./ui.js";
import { store, fullImage } from "./data.js";
import { blobToBase64 } from "./api.js";
import { boxesFor } from "./views/board.js";

const W = 1080, H = 1350; // 4:5, como el lienzo

const load = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

/** PNG del outfit. */
export async function outfitImage(itemIds, { title = "" } = {}) {
  const items = itemIds.map((id) => store.items.find((i) => i.id === id)).filter(Boolean);
  const boxes = boxesFor(itemIds);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  // fondo claro y limpio con un degradado muy suave
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#f6f5f2"); bg.addColorStop(1, "#ecebe7");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const footer = title ? 110 : 60, area = H - footer;
  const order = items.map((it) => ({ it, b: boxes[it.id] })).filter((x) => x.b).sort((a, b) => (a.b[4] || 0) - (b.b[4] || 0));
  for (const { it, b } of order) {
    const src = (await fullImage(it)) || it.thumb; if (!src) continue;
    const img = await load(src); if (!img) continue;
    const [l, t, w, h] = b, bx = (l / 100) * W, by = (t / 100) * area, bw = (w / 100) * W, bh = (h / 100) * area;
    const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    g.save(); g.shadowColor = "rgba(0,0,0,.12)"; g.shadowBlur = 18; g.shadowOffsetY = 8;
    g.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh); g.restore();
  }
  g.fillStyle = "#1b1c1f"; g.textBaseline = "alphabetic";
  if (title) { g.font = "600 44px system-ui, -apple-system, Segoe UI, sans-serif"; g.fillText(title.slice(0, 42), 56, H - 58); }
  g.font = "500 24px system-ui, -apple-system, Segoe UI, sans-serif"; g.fillStyle = "#7b7d82";
  const mark = "Armario Atelier"; g.fillText(mark, W - 56 - g.measureText(mark).width, H - 24);
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

/** Abre el menú de compartir del móvil (o descarga la imagen en el ordenador). */
export async function shareOutfit(itemIds, title = "") {
  const blob = await outfitImage(itemIds, { title });
  const name = `outfit-${Date.now()}.png`;
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: title || "Mi outfit", files: [uri], dialogTitle: "Compartir outfit" });
    return;
  }
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: title || "Mi outfit" }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
