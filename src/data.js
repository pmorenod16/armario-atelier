// Datos del usuario en Firestore: prendas, imágenes y perfil. Todo bajo users/{uid}.
import {
  fs, itemsRef, metaDoc, imageDoc, newItemId, doc, setDoc, getDoc, onSnapshot, writeBatch, updateDoc, increment, userCol, deleteDoc,
} from "./firebase.js";
import { base64ToBlob, blobToBase64 } from "./api.js";
import { layerOf } from "./catalog.js";

export const DEFAULT_PROFILE = {
  onboarded: false,
  mannequin: "hombre",
  heightCm: 178,
  build: "media",
  sizes: {},
  places: [{ id: "girona", name: "Girona", region: "Cataluña, España", lat: 41.9794, lon: 2.8214 }],
  activePlace: "girona",
  language: "es",
};

const listeners = new Set();
export const store = {
  items: [], profile: null, ready: { items: false, profile: false }, offline: false, error: null,
  wear: [], feedback: [], trips: [], today: null, style: null, layouts: {}, // fase 2
  shopping: null, wishlist: [], // fase 4
};
const emit = () => listeners.forEach((fn) => fn(store));
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let unsubs = [];
export function startData() {
  stopData();
  unsubs.push(onSnapshot(itemsRef(), { includeMetadataChanges: true }, (snap) => {
    store.items = snap.docs.map((d) => normalizeItem({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    store.ready.items = true; store.offline = snap.metadata.fromCache; store.error = null;
    emit();
  }, (e) => { console.error(e); store.error = "load"; store.ready.items = true; emit(); }));
  unsubs.push(onSnapshot(metaDoc("profile"), (s) => {
    store.profile = { ...DEFAULT_PROFILE, ...(s.exists() ? s.data() : {}) };
    store.ready.profile = true; emit();
  }, (e) => { console.error(e); store.profile = { ...DEFAULT_PROFILE }; store.ready.profile = true; emit(); }));
  const list = (name, key, sort) => unsubs.push(onSnapshot(userCol(name), (snap) => {
    store[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sort); emit();
  }, (e) => console.warn(name, e)));
  list("wear", "wear", (a, b) => b.date.localeCompare(a.date));
  list("feedback", "feedback", (a, b) => (b.at || 0) - (a.at || 0));
  list("trips", "trips", (a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  unsubs.push(onSnapshot(userCol("layouts"), (snap) => { store.layouts = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); emit(); }, () => {}));
  unsubs.push(onSnapshot(metaDoc("today"), (s) => { store.today = s.exists() ? s.data() : null; emit(); }, () => {}));
  unsubs.push(onSnapshot(metaDoc("shopping"), (s) => { store.shopping = s.exists() ? s.data() : null; emit(); }, () => {}));
  list("wishlist", "wishlist", (a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  unsubs.push(onSnapshot(metaDoc("style"), (s) => { store.style = s.exists() ? s.data() : null; emit(); }, () => {}));
}
export function stopData() {
  unsubs.splice(0).forEach((u) => u());
  store.items = []; store.profile = null; store.ready = { items: false, profile: false };
  store.wear = []; store.feedback = []; store.trips = []; store.today = null; store.style = null; store.layouts = {}; store.shopping = null; store.wishlist = [];
}

/** Acepta prendas guardadas con el formato anterior (colorName/colorHex/shape) y les da la forma nueva. */
function normalizeItem(it) {
  if (!it.type && it.shape) {
    const map = { pantalon: "pantalon", vaquero: "vaquero", falda: "falda", shorts: "bermuda", top: "tirantes" };
    it.type = map[it.shape] || it.shape;
  }
  if (!it.colors && it.colorHex) it.colors = [{ k: "", hex: it.colorHex, name: it.colorName || "" }];
  it.colors ||= [];
  if (!it.seasons) {
    it.seasons = { "primavera-verano": ["primavera", "verano"], "otoño-invierno": ["otono", "invierno"] }[it.season]
      || ["primavera", "verano", "otono", "invierno"];
  }
  it.status ||= "disponible";
  it.styleTags ||= it.tags || [];
  it.tone ||= it.colors[0]?.hex || "#8a8f98";
  return it;
}

export const saveProfile = (patch) => setDoc(metaDoc("profile"), { ...patch, updatedAt: Date.now() }, { merge: true });

/** Guarda una prenda. `cut` = resultado de makeCutout (opcional al editar). Devuelve el id. */
export async function saveItem(data, { id, cut } = {}) {
  id ||= newItemId();
  const now = Date.now();
  const item = { ...data, layer: layerOf(data.type), updatedAt: now };
  if (!item.createdAt) item.createdAt = now;
  const batch = writeBatch(fs);
  if (cut?.blob) {
    const b64 = await blobToBase64(cut.blob);
    if (b64.length > 980_000) throw { code: "too-big" };
    batch.set(imageDoc(id), { data: b64, mime: "image/webp", width: cut.width, height: cut.height });
    Object.assign(item, {
      hasImage: true, aspect: cut.aspect, imageVersion: now, cutMethod: cut.method,
      thumb: cut.thumb || null, tone: cut.tone || item.tone || null,
    });
    imageCache.delete(id);
  }
  batch.set(doc(itemsRef(), id), item, { merge: true });
  await batch.commit();
  return id;
}

export const setItemStatus = (id, status) => updateDoc(doc(itemsRef(), id), { status, updatedAt: Date.now() });

export async function deleteItem(id) {
  const b = writeBatch(fs);
  b.delete(doc(itemsRef(), id)); b.delete(imageDoc(id));
  await b.commit(); imageCache.delete(id);
}

// Imagen grande (para la ficha): una lectura por prenda y en memoria después
const imageCache = new Map();
export function fullImage(item) {
  if (!item?.hasImage) return Promise.resolve(null);
  const key = item.id + ":" + (item.imageVersion || 0);
  if (!imageCache.has(item.id) || imageCache.get(item.id).key !== key) {
    const p = getDoc(imageDoc(item.id))
      .then((s) => (s.exists() ? URL.createObjectURL(base64ToBlob(s.data().data, s.data().mime || "image/webp")) : null))
      .catch(() => null);
    imageCache.set(item.id, { key, p });
  }
  return imageCache.get(item.id).p;
}

/* ---------- fase 2: lo que te pones, gustos, propuestas del día y viajes ---------- */
export const todayKey = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Apunta un outfit en el calendario (un registro por día; si ya había, lo sustituye) y suma usos a las prendas. */
export async function logWear({ date = todayKey(), itemIds, title = "", plan = "", how = [], weather = null }) {
  const prev = store.wear.find((w) => w.date === date);
  const b = writeBatch(fs);
  b.set(doc(userCol("wear"), date), { date, itemIds, title, plan, how, weather, createdAt: Date.now() });
  const added = itemIds.filter((id) => !prev?.itemIds?.includes(id)), removed = (prev?.itemIds || []).filter((id) => !itemIds.includes(id));
  for (const id of added) if (store.items.some((i) => i.id === id)) b.update(doc(itemsRef(), id), { wearCount: increment(1), lastWorn: date });
  for (const id of removed) if (store.items.some((i) => i.id === id)) b.update(doc(itemsRef(), id), { wearCount: increment(-1) });
  await b.commit();
}
export async function deleteWear(date) {
  const prev = store.wear.find((w) => w.date === date); if (!prev) return;
  const b = writeBatch(fs);
  b.delete(doc(userCol("wear"), date));
  for (const id of prev.itemIds || []) if (store.items.some((i) => i.id === id)) b.update(doc(itemsRef(), id), { wearCount: increment(-1) });
  await b.commit();
}

/** Me gusta / no me gusta de un outfit propuesto (se usa para afinar las siguientes propuestas). */
export const saveFeedback = ({ itemIds, liked, title, plan }) =>
  setDoc(doc(userCol("feedback"), `${itemIds.slice().sort().join("_")}`.slice(0, 600)), { itemIds, liked, title, plan, at: Date.now() });

export const saveToday = (data) => setDoc(metaDoc("today"), { ...data, updatedAt: Date.now() });

export async function saveTrip(trip, id) {
  const ref = id ? doc(userCol("trips"), id) : doc(userCol("trips"));
  await setDoc(ref, { ...trip, createdAt: trip.createdAt || Date.now() });
  return ref.id;
}
export const deleteTrip = (id) => deleteDoc(doc(userCol("trips"), id));

/* ---------- colocación de las prendas en el lienzo de un outfit ---------- */
export const layoutKey = (ids) => ids.slice().sort().join("_").slice(0, 600);
export function saveLayout(ids, boxes) {
  // Firestore no admite listas dentro de mapas anidados en listas: se guardan como objeto de listas planas
  return setDoc(doc(userCol("layouts"), layoutKey(ids)), { boxes, at: Date.now() });
}
export const deleteLayout = (ids) => deleteDoc(doc(userCol("layouts"), layoutKey(ids)));

/* ---------- fase 3: estilo ---------- */
export const saveStyle = (data) => setDoc(metaDoc("style"), { ...data, updatedAt: Date.now() }, { merge: true });

/** Tableros: el principal son los campos de arriba de meta/style; los demás van en `extra` (cada uno con su `use`). */
export const boardsOf = (s) => s ? [{ ...s, id: "main", extra: undefined }, ...(s.extra || [])] : [];
export function saveBoard(id, patch) {
  if (id === "main") return saveStyle(patch);
  const extra = (store.style?.extra || []).map((b) => (b.id === id ? { ...b, ...patch } : b));
  return saveStyle({ extra });
}
export const addBoard = (b) => saveStyle({ extra: [...(store.style?.extra || []), b] });
export const removeBoard = (id) => saveStyle({ extra: (store.style?.extra || []).filter((b) => b.id !== id) });

function boardText(s, long) {
  return [
    s.name ? `«${s.name}»: ${s.summary}` : s.summary,
    s.mix?.length > 1 && `Mezcla: ${s.mix.map((m) => `${m.name} ${m.share}%${m.look ? ` (${m.look})` : ""}`).join(", ")}`,
    long && s.keywords?.length && `Palabras clave: ${s.keywords.join(", ")}`,
    s.palette?.length && `Paleta: ${s.palette.map((p) => p.name).join(", ")}`,
    s.formulas?.length && `Fórmulas de outfit: ${(long ? s.formulas : s.formulas.slice(0, 3)).join(" | ")}`,
    long && s.silhouettes && `Siluetas: ${s.silhouettes}`, long && s.fabrics && `Materiales: ${s.fabrics}`, long && s.footwear && `Calzado: ${s.footwear}`,
    s.keyPieces?.length && `Prendas clave: ${(long ? s.keyPieces : s.keyPieces.slice(0, 6)).join(", ")}`,
    s.avoid && `Evitar: ${s.avoid}`,
  ].filter(Boolean).join(". ");
}

/** Texto del estilo para la IA (outfits, maleta, compras). Con varios tableros, cada uno con su uso. `onlyMain` para la comparación con el armario. */
export function styleText(s, { onlyMain = false } = {}) {
  if (!s) return null;
  const extra = onlyMain ? [] : (s.extra || []).filter((b) => b.summary);
  if (!s.summary && !extra.length) return null;
  return [
    s.notes && `Lo que dice él (manda sobre todo lo demás): ${s.notes}`,
    s.summary && (extra.length ? `TABLERO PRINCIPAL (${s.use || "día a día"}): ` : "Estilo ") + boardText(s, true),
    ...extra.map((b) => `OTRO TABLERO, para «${b.use}»: ${boardText(b, false)}`),
    extra.length && "Usa el tablero cuyo uso encaje con el plan; si ninguno encaja, el principal",
  ].filter(Boolean).join(". ");
}

/* ---------- Compras (fase 4) ---------- */
// meta/shopping: {advice, combine[], style[], at, results{gapId:{products,links,searched}}}
export const saveShopping = (data) => setDoc(metaDoc("shopping"), { ...data, updatedAt: Date.now() }, { merge: true });
export const saveShopResult = (gapId, result) => setDoc(metaDoc("shopping"), { results: { [gapId]: result }, updatedAt: Date.now() }, { merge: true });
export async function saveWish(w, id) {
  id ||= "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await setDoc(doc(userCol("wishlist"), id), { addedAt: Date.now(), ...w, updatedAt: Date.now() }, { merge: true });
  return id;
}
export const deleteWish = (id) => deleteDoc(doc(userCol("wishlist"), id));

/* ---------- copias de las fotos (para poder deshacer al rehacer recortes) ---------- */
const backupDoc = (id) => doc(userCol("images"), id + "__antes");
/** Lee la foto guardada de una prenda: {data (base64), mime, width, height} o null. */
export async function readImage(id) { const s = await getDoc(imageDoc(id)); return s.exists() ? s.data() : null; }
/** Guarda una copia de la foto actual (solo la primera vez: la copia es siempre la original). */
export async function backupImage(id, img, item) {
  const s = await getDoc(backupDoc(id));
  if (!s.exists()) await setDoc(backupDoc(id), { ...img, item: { aspect: item.aspect || null, thumb: item.thumb || null, tone: item.tone || null, cutMethod: item.cutMethod || null, imageVersion: item.imageVersion || null } });
}
export const hasBackup = async (id) => (await getDoc(backupDoc(id))).exists();
/** Vuelve a la foto de antes del recorte nuevo. */
export async function restoreImage(id) {
  const s = await getDoc(backupDoc(id)); if (!s.exists()) return false;
  const { item, ...img } = s.data(), now = Date.now();
  const b = writeBatch(fs);
  b.set(imageDoc(id), img);
  b.set(doc(itemsRef(), id), { ...item, imageVersion: now, updatedAt: now }, { merge: true });
  b.delete(backupDoc(id));
  await b.commit(); imageCache.delete(id);
  return true;
}
