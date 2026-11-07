// Datos del usuario en Firestore: prendas, imágenes y perfil. Todo bajo users/{uid}.
import {
  fs, itemsRef, metaDoc, imageDoc, newItemId, doc, setDoc, getDoc, onSnapshot, writeBatch, updateDoc,
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
export const store = { items: [], profile: null, ready: { items: false, profile: false }, offline: false, error: null };
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
}
export function stopData() {
  unsubs.splice(0).forEach((u) => u());
  store.items = []; store.profile = null; store.ready = { items: false, profile: false };
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
