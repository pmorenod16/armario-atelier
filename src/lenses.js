// Gafas de ver: cristales transparentes en la foto que ya está guardada (desde la ficha) y deshacerlo.
import { readImage, backupImage, restoreImage, saveItem, updateItem } from "./data.js";
import { base64ToBlob } from "./api.js";
import { clearLenses } from "./cutout.js";

/** Devuelve el número de cristales quitados (0 = no los ha distinguido; la foto no cambia). */
export async function clearItemLenses(item) {
  const img = await readImage(item.id); if (!img?.data) return 0;
  const cut = await clearLenses({ blob: base64ToBlob(img.data, img.mime || "image/webp"), width: img.width, height: img.height, aspect: item.aspect || img.width / img.height, method: item.cutMethod || "ia" });
  if (!cut.lensesCleared) return 0;
  await backupImage(item.id, img, item);
  const { id, ...data } = item;
  await saveItem({ ...data, lensesCleared: true }, { id, cut });
  return cut.lensesCleared;
}
export async function undoItemLenses(item) {
  const ok = await restoreImage(item.id);
  if (ok) await updateItem(item.id, { lensesCleared: false });
  return ok;
}
