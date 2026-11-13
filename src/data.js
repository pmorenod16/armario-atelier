// Datos del usuario en Firestore: prendas, imágenes y perfil. Todo bajo users/{uid}.
import {
  fs, itemsRef, metaDoc, imageDoc, newItemId, doc, setDoc, getDoc, getDocs, onSnapshot, writeBatch, updateDoc, increment, userCol, deleteDoc,
} from "./firebase.js";
import { base64ToBlob, blobToBase64, apiDefaults } from "./api.js";
import { layerOf, setCatalogSection } from "./catalog.js";
import { getLanguage, setLanguage, localizeNow, requestTexts, fromCache, hasTranslation, onTranslated } from "./i18n.js";

const DEFAULT_PROFILE = {
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
  shopping: null, wishlist: [], looks: [], // fase 4 y extras
  locVer: 0, // sube cuando llega una traducción de lo guardado: las pantallas lo miran para repintar
};
/** Prenda del armario por id (o undefined). */
export const itemById = (id) => store.items.find((i) => i.id === id);
const emit = () => listeners.forEach((fn) => fn(store));
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ---------- Lo guardado se enseña en el idioma de la app ----------
   Los outfits, la maleta, los huecos de Compras, el análisis de estilo, los looks, el calendario y los nombres de las prendas
   se guardan como salieron (del motor, de la IA o escritos al añadir la prenda). Si la app no está en castellano, TODO eso
   se enseña traducido, sin mirar en qué idioma dice estar (_lang no es fiable: si la traducción no llegaba a tiempo se
   guardaba en castellano marcado como catalán y ya no se traducía nunca). Lo que ya está en el idioma bueno, el traductor
   lo devuelve igual. Al momento sale lo que hay en la caché; lo demás se pide (i18n.requestTexts) y, cuando llega,
   onTranslated vuelve a pasar todo (relocalize) y las pantallas se repintan (store.locVer). Lo guardado no se toca. */
const L = () => getLanguage();
function loc(raw, skip) {
  if (!raw || L() === "es") return raw;
  const { obj, missing } = localizeNow(raw, skip);
  requestTexts(missing);
  return obj;
}
function locStyle(raw) {
  if (!raw || L() === "es") return raw;
  const missing = [];
  const part = (o, skip) => { const r = localizeNow(o, skip, true); missing.push(...r.missing); return r.obj; };
  const obj = { ...part(raw, new Set(["extra"])), extra: (raw.extra || []).map((b) => part(b)) };
  Object.defineProperty(obj, "raw", { value: raw }); // el motor (engine.js) trabaja con lo guardado
  requestTexts(missing);
  return obj;
}
// nombres de las prendas (los pone la IA al añadirlas, en el idioma de entonces)
function locItems(items) {
  if (L() === "es") return items;
  const names = items.map((i) => i.name || ""), tr = fromCache(names);
  requestTexts(names.filter((n) => !hasTranslation(n)));
  return items.map((i, k) => (tr[k] !== i.name ? { ...i, name: tr[k], nameOrig: i.name } : i));
}
const raws = {};
// cómo se pinta cada colección desde lo guardado; al cambiar el idioma se vuelve a pasar todo (si no, lo que llegaba antes
// que el perfil se quedaba en castellano para siempre: el idioma se conoce al leer el perfil)
const puts = {};
const relocalize = () => { store.locVer++; Object.values(puts).forEach((f) => f()); };
onTranslated(() => { if (Object.keys(puts).length) { relocalize(); emit(); } });
let unsubs = [];
export function startData() {
  stopData();
  unsubs.push(onSnapshot(itemsRef(), { includeMetadataChanges: true }, (snap) => {
    raws.items = snap.docs.map((d) => normalizeItem({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const put = (puts.items = () => { store.items = locItems(raws.items); });
    put();
    store.ready.items = true; store.offline = snap.metadata.fromCache; store.error = null;
    emit();
  }, (e) => { console.error(e); store.error = "load"; store.ready.items = true; emit(); }));
  unsubs.push(onSnapshot(metaDoc("profile"), (s) => {
    store.profile = { ...DEFAULT_PROFILE, ...(s.exists() ? s.data() : {}) };
    apiDefaults.section = store.profile.section === "mujer" ? "mujer" : "hombre";
    setCatalogSection(apiDefaults.section);
    apiDefaults.lang = ["ca", "en"].includes(store.profile.language) ? store.profile.language : "es";
    if (apiDefaults.lang !== getLanguage()) { setLanguage(apiDefaults.lang); relocalize(); }
    store.ready.profile = true; emit();
  }, (e) => { console.error(e); store.profile = { ...DEFAULT_PROFILE }; store.ready.profile = true; emit(); }));
  const list = (name, key, sort, translate) => unsubs.push(onSnapshot(userCol(name), (snap) => {
    raws[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sort);
    (puts[key] = () => { const r = raws[key];
      store[key] = translate ? r.map((d) => loc(d)) : r; })();
    emit();
  }, (e) => console.warn(name, e)));
  const meta = (name, key, fn = loc) => unsubs.push(onSnapshot(metaDoc(name), (s) => {
    raws[key] = s.exists() ? s.data() : null;
    (puts[key] = () => { store[key] = fn(raws[key]); })();
    emit();
  }, () => {}));
  list("wear", "wear", (a, b) => b.date.localeCompare(a.date), true);
  list("feedback", "feedback", (a, b) => (b.at || 0) - (a.at || 0));
  list("trips", "trips", (a, b) => (b.createdAt || 0) - (a.createdAt || 0), true);
  unsubs.push(onSnapshot(userCol("layouts"), (snap) => { store.layouts = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); emit(); }, () => {}));
  meta("today", "today"); meta("tomorrow", "tomorrow"); meta("shopping", "shopping");
  list("wishlist", "wishlist", (a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  list("looks", "looks", (a, b) => (b.createdAt || 0) - (a.createdAt || 0), true);
  meta("style", "style", locStyle);
}
export function stopData() {
  unsubs.splice(0).forEach((u) => u()); for (const k in puts) delete puts[k];
  store.items = []; store.profile = null; store.ready = { items: false, profile: false };
  store.wear = []; store.feedback = []; store.trips = []; store.today = null; store.tomorrow = null; store.style = null; store.layouts = {}; store.shopping = null; store.wishlist = []; store.looks = [];
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
  const { nameOrig, ...clean } = data; // nameOrig = nombre guardado antes de traducirlo para enseñarlo (locItems)
  const item = { ...clean, layer: layerOf(data.type), updatedAt: now };
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

export const setItemStatus = (id, status) => updateDoc(doc(itemsRef(), id), { status, updatedAt: Date.now(), ...(status === "disponible" ? { wearsSinceWash: 0 } : {}) });

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
/** Lo que cuenta como puesto ese día: las prendas del outfit + calcetines y sujetador elegidos (extraIds, fuera del lienzo). */
export const wornIds = (w) => [...(w?.itemIds || []), ...(w?.extraIds || [])];
export async function logWear({ date = todayKey(), itemIds, extraIds = [], title = "", plan = "", how = [], weather = null }) {
  const prev = store.wear.find((w) => w.date === date);
  const b = writeBatch(fs);
  extraIds = extraIds.filter((id) => id && !itemIds.includes(id));
  b.set(doc(userCol("wear"), date), { date, itemIds, extraIds, title, plan, how, weather, createdAt: Date.now(), ...(prev?.photo ? { photo: true } : {}) });
  const all = [...itemIds, ...extraIds], before = wornIds(prev);
  const added = all.filter((id) => !before.includes(id)), removed = before.filter((id) => !all.includes(id));
  // con «preguntarme al día siguiente» (por defecto) no se marca nada aquí: se decide en la revisión de Hoy
  const auto = store.profile?.autoDirty !== false && store.profile?.washCheck === false;
  const madeDirty = (prev?.madeDirty || []).filter((id) => all.includes(id));
  for (const id of added) {
    const it = itemById(id); if (!it) continue;
    const upd = { wearCount: increment(1), lastWorn: date, wearsSinceWash: increment(1) };
    // ropa sucia automática: después de X usos según el tipo (la camiseta 1, el vaquero 6…); abrigos, calzado y complementos nunca
    const lim = itemWashLimit(it);
    if (auto && lim && (it.wearsSinceWash || 0) + 1 >= lim && it.status === "disponible") { upd.status = isDryClean(it) ? "tintoreria" : "sucia"; madeDirty.push(id); }
    b.update(doc(itemsRef(), id), upd);
  }
  b.set(doc(userCol("wear"), date), { madeDirty }, { merge: true });
  for (const id of removed) undoWearOn(b, id, date, prev);
  await b.commit();
}
/** Usos antes de ir a lavar, por tipo de prenda. */
/** Usos antes de lavar para este tipo: lo que haya puesto en Perfil o el de serie (0 = nunca). */
// sujetadores: nunca se marcan solos para lavar, los marca quien los usa (como cualquier prenda, desde su ficha)
const MANUAL_WASH = new Set(["sujetador", "sujetador-sin-tirantes", "bralette", "sujetador-deportivo"]);
export const washLimit = (type) => { if (MANUAL_WASH.has(type)) return 0; const v = store.profile?.washAfter?.[type]; return v == null ? WASH_AFTER[type] || 0 : +v || 0; };
export const WASH_AFTER = { camiseta: 1, "camiseta-ml": 1, polo: 1, tirantes: 1, camisa: 2, "camisa-mc": 1, sobrecamisa: 4, jersey: 3, cardigan: 3, sudadera: 3, "sudadera-capucha": 3, "chaleco-punto": 4, pantalon: 4, chino: 4, vaquero: 6, "traje-pantalon": 4, jogger: 2, bermuda: 3, falda: 3, vestido: 2, mono: 2, calcetines: 1,
  // chaquetas y abrigos: a la tintorería de vez en cuando
  cazadora: 20, chaqueta: 20, americana: 15, abrigo: 30, gabardina: 25, plumifero: 30, parka: 30, chaleco: 25 };
const DRY_CLEAN = new Set(["americana", "abrigo", "gabardina", "chaqueta", "traje-pantalon"]);
/** Usos antes de lavar de una prenda concreta: lo suyo propio, si no lo del tipo (0 = nunca). */
export const itemWashLimit = (it) => (it?.washAfter != null ? +it.washAfter || 0 : washLimit(it?.type));
/** ¿Va a la tintorería en vez de a la lavadora? (lo dice la prenda; por defecto americanas, abrigos y trajes, o si la etiqueta lo pide) */
export const isDryClean = (it) => it?.dryClean ?? (DRY_CLEAN.has(it?.type) || ["cuero", "ante"].includes(it?.materialKey)
  || (["cazadora", "chaqueta", "chaleco"].includes(it?.type) && ["lana", "cachemira"].includes(it?.materialKey))
  || /tintorer|limpieza en seco|dry clean|\bP\b en círculo|no lavar/i.test(it?.care || ""));
/** Cambia datos sueltos de una prenda (lavado). */
export const updateItem = (id, patch) => updateDoc(doc(itemsRef(), id), { ...patch, updatedAt: Date.now() });
/** Revisión del día siguiente: decide qué va a lavar o a la tintorería de lo que te pusiste. decisions {id: "limpia"|"sucia"|"tintoreria"}. */
export async function reviewWear(date, decisions) {
  const b = writeBatch(fs);
  for (const [id, d] of Object.entries(decisions)) {
    if (!store.items.some((i) => i.id === id)) continue;
    if (d === "sucia" || d === "tintoreria") b.update(doc(itemsRef(), id), { status: d, updatedAt: Date.now() });
  }
  b.set(doc(userCol("wear"), date), { reviewed: true, reviewedAt: Date.now() }, { merge: true });
  await b.commit();
}
/** Todo lo sucio, lavado. */
export async function washAll() {
  const dirty = store.items.filter((i) => i.status === "sucia" || i.status === "tintoreria"); if (!dirty.length) return 0;
  const b = writeBatch(fs);
  dirty.forEach((i) => b.update(doc(itemsRef(), i.id), { status: "disponible", wearsSinceWash: 0, updatedAt: Date.now() }));
  await b.commit(); return dirty.length;
}

/* ---------- outfits guardados (looks) ---------- */
// users/{uid}/looks/{id}: {title, itemIds, note, source: hoy|mano|pin|combina, createdAt}
export async function saveLook(look, id) {
  const ref = id ? doc(userCol("looks"), id) : doc(userCol("looks"));
  await setDoc(ref, { ...look, createdAt: look.createdAt || Date.now(), updatedAt: Date.now() }, { merge: true });
  return ref.id;
}
export const deleteLook = (id) => deleteDoc(doc(userCol("looks"), id));
export const lookSaved = (ids) => { const k = ids.slice().sort().join(); return store.looks.find((l) => l.itemIds.slice().sort().join() === k); };
/** Deshace en una prenda el uso de ese día: usos, último día puesto y, si se marcó sucia sola por ese uso, la vuelve a disponible. */
function undoWearOn(b, id, date, w) {
  const it = itemById(id); if (!it) return;
  const upd = { wearCount: increment(-1), updatedAt: Date.now() };
  if ((it.wearsSinceWash || 0) > 0) upd.wearsSinceWash = increment(-1);
  if (it.lastWorn === date) upd.lastWorn = store.wear.filter((x) => x.date !== date && x.date < date && x.itemIds?.includes(id)).map((x) => x.date).sort().pop() || null;
  if (w?.madeDirty?.includes(id) && (it.status === "sucia" || it.status === "tintoreria")) upd.status = "disponible";
  b.update(doc(itemsRef(), id), upd);
}
/** Cancela el outfit apuntado ese día (el «me lo pongo»): lo borra del calendario y deja las prendas como estaban. */
export async function deleteWear(date) {
  const prev = store.wear.find((w) => w.date === date); if (!prev) return;
  const b = writeBatch(fs);
  b.delete(doc(userCol("wear"), date));
  if (prev.photo) b.delete(doc(userCol("wearPhotos"), date));
  for (const id of wornIds(prev)) undoWearOn(b, id, date, prev);
  await b.commit();
}

/** Me gusta / no me gusta de un outfit propuesto (se usa para afinar las siguientes propuestas). */
export const saveFeedback = ({ itemIds, liked, title, plan }) =>
  setDoc(doc(userCol("feedback"), `${itemIds.slice().sort().join("_")}`.slice(0, 600)), { itemIds, liked, title, plan, at: Date.now() });

export const saveToday = (data, which = "today") => setDoc(metaDoc(which), { ...data, updatedAt: Date.now() });
/** Propuestas guardadas para una fecha (las de hoy o las preparadas la noche antes). */
export const dayPlan = (date) => [store.today, store.tomorrow].find((d) => d?.date === date) || null;

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
  // sobre lo guardado tal cual (no sobre la copia traducida que se enseña)
  const extra = (raws.style?.extra || store.style?.extra || []).map((b) => (b.id === id ? { ...b, ...patch } : b));
  return saveStyle({ extra });
}
export const addBoard = (b) => saveStyle({ extra: [...(raws.style?.extra || store.style?.extra || []), b] });
export const removeBoard = (id) => saveStyle({ extra: (raws.style?.extra || store.style?.extra || []).filter((b) => b.id !== id) });

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

/* ---------- copia de seguridad: todo el armario en un archivo ---------- */
const BACKUP_COLS = ["items", "images", "wear", "wearPhotos", "looks", "layouts", "feedback", "trips", "wishlist", "meta"];
/** Descarga todo lo tuyo (prendas con sus fotos, outfits, calendario, estilo, compras, perfil) en un objeto. */
export async function exportBackup(onStep = () => {}) {
  const out = { app: "armario-atelier", version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const c of BACKUP_COLS) {
    onStep(c);
    try { const snap = await getDocs(userCol(c)); out.data[c] = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); }
    catch (e) { console.warn("copia", c, e); out.data[c] = {}; }
  }
  return out;
}
/** Restaura una copia (añade y sobrescribe lo que tenga el mismo id; no borra nada de lo que ya tienes). */
export async function importBackup(obj, onStep = () => {}) {
  if (obj?.app !== "armario-atelier" || !obj.data) throw new Error("ARCHIVO");
  let n = 0;
  for (const c of BACKUP_COLS) {
    const docs = Object.entries(obj.data[c] || {});
    // las fotos pesan: de una en una; el resto en lotes
    if (c === "images") { for (const [id, d] of docs) { await setDoc(doc(userCol("images"), id), d); onStep(c, ++n); } continue; }
    for (let i = 0; i < docs.length; i += 300) {
      const b = writeBatch(fs);
      docs.slice(i, i + 300).forEach(([id, d]) => b.set(doc(userCol(c), id), d));
      await b.commit(); n += Math.min(300, docs.length - i); onStep(c, n);
    }
  }
  return n;
}

/* ---------- foto tuya con el outfit puesto (diario de looks): users/{uid}/wearPhotos/{fecha} ---------- */
export async function saveWearPhoto(date, blob) {
  const data = (await blobToBase64(blob)).replace(/^data:[^,]+,/, "");
  if (data.length > 980000) throw new Error("GRANDE");
  await setDoc(doc(userCol("wearPhotos"), date), { data, mime: blob.type || "image/jpeg", at: Date.now() });
  await setDoc(doc(userCol("wear"), date), { photo: true }, { merge: true });
}
export async function readWearPhoto(date) {
  const s = await getDoc(doc(userCol("wearPhotos"), date)).catch(() => null);
  return s?.exists() ? URL.createObjectURL(base64ToBlob(s.data().data, s.data().mime || "image/jpeg")) : null;
}
export async function deleteWearPhoto(date) {
  await deleteDoc(doc(userCol("wearPhotos"), date));
  await setDoc(doc(userCol("wear"), date), { photo: false }, { merge: true });
}
