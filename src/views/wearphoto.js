// Apuntar lo que llevas con una foto (13/11/2026): foto en el espejo → la IA reconoce qué prendas de tu armario son
// (/api/wear/photo) → las confirmas en el selector → se apunta el día y la foto queda como «Foto del look».
// Si la IA no responde, se abre el selector vacío para elegirlas a mano (la foto se guarda igual).
import { t } from "../i18n.js";
import { toast, icon } from "../ui.js";
import { api, blobToBase64 } from "../api.js";
import { store, logWear, saveWearPhoto, todayKey } from "../data.js";
import { TYPE, COLOR, PATTERN, MATERIAL, FIT } from "../catalog.js";
import { pickItems } from "./picker.js";

// sin ropa interior ni calcetines: en una foto no se ven
const visible = () => store.items.filter((i) => i.layer !== "under" && i.type !== "calcetines");
const wardrobe = () => visible().map((i) => ({
  id: i.id, name: i.nameOrig || i.name, type: TYPE[i.type]?.es || i.type, colors: (i.colors || []).map((c) => COLOR[c.k]?.es || c.k),
  pattern: PATTERN[i.pattern]?.es, material: i.material || MATERIAL[i.materialKey]?.es, fit: FIT[i.fit]?.es, formality: i.formality,
}));

/** Lee la foto elegida en un <input type=file> y apunta el día (por defecto hoy). Devuelve true si se apuntó. */
export async function logByPhoto(input, date = todayKey()) {
  const f = input.files?.[0]; input.value = ""; if (!f) return false;
  const { shrinkPhoto } = await import("../cutout.js");
  let photo;
  try { photo = await shrinkPhoto(f, 1080); if (photo.size > 700000) photo = await shrinkPhoto(photo, 800); }
  catch { toast(t("add.badImage"), "error"); return false; }
  toast(t("wphoto.reading"));
  let found = { itemIds: [], notFound: [] }, failed = false;
  try {
    const small = await shrinkPhoto(photo, 1024);
    found = await api("/api/wear/photo", { image: await blobToBase64(small), wardrobe: wardrobe() }, { timeout: 60000 });
  } catch (e) { console.warn("foto del look", e); failed = true; }
  const note = failed ? t("wphoto.fail")
    : found.itemIds.length ? t("wphoto.found", { n: found.itemIds.length }) + (found.notFound?.length ? " " + t("wphoto.notFound", { list: found.notFound.join(", ") }) : "")
    : t("wphoto.none");
  const ids = await pickItems(found.itemIds || [], { title: t("wphoto.confirm"), note, photo: URL.createObjectURL(photo) });
  if (!ids) return false;
  const prev = store.wear.find((w) => w.date === date);
  try {
    await logWear({ ...(prev || {}), date, itemIds: ids, title: prev?.title || t("looks.untitled") });
    await saveWearPhoto(date, photo).catch(() => toast(t("photo.fail"), "error"));
    toast(t("today.wornSaved"));
    return true;
  } catch { toast(t("item.saveFail"), "error"); return false; }
}

/** Botón «Apuntar con una foto» (abre la cámara frontal en el móvil). */
export const photoButton = (date = todayKey(), cls = "btn ghost") =>
  `<label class="${cls}">${icon("camera")}${t("wphoto.btn")}<input type="file" accept="image/*" capture="user" data-wphoto="${date}" hidden></label>`;
