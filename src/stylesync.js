// Leer un tablero y sacar su estilo (lo usan Mi estilo y la revisión automática).
import { t } from "./i18n.js";
import { api } from "./api.js";
import { store, saveBoard, boardsOf } from "./data.js";
import { boardFromUrl, boardPins, pinToBase64 } from "./pinterest.js";
import { toast } from "./ui.js";

/** Huella de los pines: si cambia, el tablero tiene pines nuevos (o quitados). */
export const pinSig = (pins) => `${pins.length}:${pins.slice(0, 6).map((p) => p.img.split("/").pop()).join(",")}`;

/** Enlace → {board, pins}. Si el móvil no puede leerlo, pins = null (lo intentará el servidor). */
export async function readBoardPins(raw) {
  const board = await boardFromUrl(raw);
  try { return { board, pins: await boardPins(board), why: "" }; }
  catch (e) { console.warn("tablero", e); return { board, pins: null, why: e?.message || "" }; }
}

/** Pines → campos de estilo listos para guardar en el tablero. */
export async function analyzePins({ board, pins, why }, { status = () => {} } = {}) {
  const hint = store.style?.notes || "";
  let r;
  if (pins?.length) {
    status(t("style.analyzing", { n: pins.length }));
    const titles = [...new Set(pins.map((p) => p.title?.trim()).filter(Boolean))].join(" · ").slice(0, 2500);
    try { r = await api("/api/style/pins", { board: board.url, pins: pins.slice(0, 300).map(({ img, link }) => ({ img, link })), titles, hint }); }
    catch (e) {
      if (e?.message !== "IMAGENES") throw e;
      // el servidor no pudo descargar las fotos: las descarga el móvil
      const N = 30, sample = pins.length <= N ? pins : Array.from({ length: N }, (_, i) => pins[Math.floor(i * pins.length / N)]);
      const images = (await Promise.all(sample.map((p) => pinToBase64(p.img.replace("/564x/", "/236x/"), 400).catch(() => null)))).filter(Boolean);
      if (images.length < 3) throw new Error(t("style.noImages"));
      r = await api("/api/style/images", { images, titles, hint, total: pins.length });
    }
    r = { ...r, pins: pins.slice(0, 60).map(({ img, link }) => ({ img, link })), pinCount: pins.length };
  } else {
    // último intento: que lo lea el servidor
    try { r = await api("/api/style/pinterest", { url: board.url }); }
    catch (e) { throw new Error(t("style.cantRead", { board: `${board.user}/${board.slug}`, why: `${why}${why ? " · " : ""}servidor: ${e?.status || ""} ${e?.message?.slice(0, 40) || ""}` })); }
  }
  const now = Date.now();
  return { ...r.style, source: "pinterest", boardUrl: board.url, pins: r.pins, pinCount: r.pinCount, pinSig: pinSig(pins?.length ? pins : r.pins), analyzed: r.analyzed || null, analyzedAt: now, checkedAt: now };
}

/** Revisión automática: cada 3 días mira si los tableros tienen pines nuevos y, si los hay, vuelve a sacar el estilo. */
const EVERY = 6 * 3600 * 1000; // conectado: mira el tablero cada vez que abres la app (como mucho cada 6 h); solo analiza si hay cambios
let running = false;
export async function autoRefresh({ force = false } = {}) {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    for (const b of boardsOf(store.style)) {
      if (b.source !== "pinterest" || !b.boardUrl || b.autoOff) continue;
      if (!force && Date.now() - (b.checkedAt || b.analyzedAt || 0) < EVERY) continue;
      const read = await readBoardPins(b.boardUrl).catch(() => null);
      if (!read?.pins?.length) { await saveBoard(b.id, { checkedAt: Date.now() }).catch(() => {}); continue; }
      const sig = pinSig(read.pins);
      const same = b.pinSig ? b.pinSig === sig : (b.pinCount === read.pins.length && b.pins?.[0]?.img === read.pins[0].img);
      if (same) { await saveBoard(b.id, { checkedAt: Date.now() }).catch(() => {}); continue; }
      try {
        const fresh = await analyzePins(read);
        const added = Math.max(0, read.pins.length - (b.pinCount || 0));
        await saveBoard(b.id, { ...fresh, match: b.id === "main" ? null : b.match ?? null });
        toast(added ? t("style.autoNew", { n: added, board: b.id === "main" ? t("style.mainBoard") : b.use }) : t("style.autoChanged", { board: b.id === "main" ? t("style.mainBoard") : b.use }));
      } catch (e) { console.warn("revisión del tablero", e); await saveBoard(b.id, { checkedAt: Date.now() }).catch(() => {}); }
    }
  } finally { running = false; }
}
