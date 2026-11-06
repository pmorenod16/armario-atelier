import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import {
  configured, auth, watchAuth, logIn, register, resetPassword, logOut,
  itemsRef, outfitsRef, metaDoc, imageDoc, newItemId, fs,
  doc, setDoc, deleteDoc, getDoc, onSnapshot, writeBatch,
} from "./firebase.js";
import { api, blobToBase64, base64ToBlob } from "./api.js";
import { makeCutout, shrinkPhoto } from "./cutout.js";
import { createViewer } from "./viewer.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNative = Capacitor.isNativePlatform();
const say = (el, text, err = false) => { const n = typeof el === "string" ? $(el) : el; n.textContent = text; n.className = "status" + (err ? " err" : ""); };

/* ---------- catálogo ---------- */
const CATS = {
  top: { label: "Partes de arriba", slot: "Arriba" }, outer: { label: "Abrigos y chaquetas", slot: "Encima" },
  bottom: { label: "Partes de abajo", slot: "Abajo" }, dress: { label: "Vestidos y monos", slot: "Vestido" },
  shoes: { label: "Calzado", slot: "Calzado" }, accessory: { label: "Complementos", slot: "Complemento" },
};
const SHAPES = {
  top: ["camiseta", "camisa", "jersey", "sudadera", "top"], outer: ["chaqueta", "abrigo", "blazer", "cazadora"],
  bottom: ["pantalon", "vaquero", "falda", "shorts"], dress: ["vestido", "mono"],
  shoes: ["zapatillas", "zapatos", "botas"], accessory: ["bolso", "gorro", "bufanda", "cinturon", "otro"],
};
const SLOT_ORDER = ["outer", "top", "dress", "bottom", "shoes", "accessory"];
// Enlaces de búsqueda directa (siempre disponibles, además de la búsqueda con IA)
const STORES = {
  zara: { name: "Zara", url: (q) => `https://www.zara.com/es/es/search?searchTerm=${q}` },
  massimo: { name: "Massimo Dutti", url: (q) => `https://www.massimodutti.com/es/search?term=${q}` },
  hm: { name: "H&M", url: (q) => `https://www2.hm.com/es_es/search-results.html?q=${q}` },
  mango: { name: "Mango", url: (q) => `https://www.google.com/search?q=site%3Ashop.mango.com+${q}` },
  pull: { name: "Pull&Bear", url: (q) => `https://www.pullandbear.com/es/search?term=${q}` },
  bershka: { name: "Bershka", url: (q) => `https://www.bershka.com/es/search?term=${q}` },
  uniqlo: { name: "Uniqlo", url: (q) => `https://www.uniqlo.com/es/es/search?q=${q}` },
  cos: { name: "COS", url: (q) => `https://www.google.com/search?q=site%3Acos.com+${q}` },
};

const state = { items: [], outfits: [], style: null, shop: null, filter: "all", editing: null, cut: null, aiPhoto: null, outfit: {}, pins: [], sugg: [] };
const unsubs = [];

/* ---------- acceso ---------- */
let mode = "login";
$("#authToggle").onclick = () => {
  mode = mode === "login" ? "signup" : "login";
  $("#authSubmit").textContent = mode === "login" ? "Entrar" : "Crear cuenta";
  $("#authToggle").textContent = mode === "login" ? "Crear cuenta nueva" : "Ya tengo cuenta";
  $("#authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
  say("#authStatus", "");
};
const AUTH_ERR = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.", "auth/wrong-password": "Contraseña incorrecta.",
  "auth/user-not-found": "No hay ninguna cuenta con ese correo.", "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Entra con ella.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.", "auth/invalid-email": "Ese correo no es válido.",
  "auth/network-request-failed": "Sin conexión. Comprueba tu internet.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
};
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!configured) return say("#authStatus", "Falta la configuración de Firebase en src/config.js.", true);
  const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
  $("#authSubmit").disabled = true; say("#authStatus", mode === "login" ? "Entrando…" : "Creando la cuenta…");
  try { mode === "login" ? await logIn(email, pass) : await register(email, pass); }
  catch (err) { say("#authStatus", AUTH_ERR[err.code] || "No se ha podido entrar. Inténtalo de nuevo.", true); }
  finally { $("#authSubmit").disabled = false; }
});
$("#authReset").onclick = async () => {
  const email = $("#authEmail").value.trim();
  if (!email) return say("#authStatus", "Escribe tu correo y vuelve a pulsar.", true);
  try { await resetPassword(email); say("#authStatus", "Te hemos enviado un correo para cambiar la contraseña."); }
  catch (err) { say("#authStatus", AUTH_ERR[err.code] || "No se ha podido enviar el correo.", true); }
};

watchAuth((user) => {
  unsubs.splice(0).forEach((u) => u());
  $("#authView").hidden = !!user; $("#appView").hidden = !user;
  if (!user) return;
  $("#meEmail").textContent = user.email; $("#meUid").value = user.uid;
  startData();
});

/* ---------- ajustes ---------- */
$("#settingsBtn").onclick = () => { $("#settingsPanel").hidden = !$("#settingsPanel").hidden; };
$("#closeSettings").onclick = () => { $("#settingsPanel").hidden = true; };
$("#signOut").onclick = () => logOut();
$("#copyUid").onclick = async () => {
  try { await navigator.clipboard.writeText($("#meUid").value); $("#copyUid").textContent = "Copiado"; }
  catch { $("#meUid").select(); }
  setTimeout(() => ($("#copyUid").textContent = "Copiar"), 1500);
};

/* ---------- instalar (versión web) ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
$("#installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("#installBtn").hidden = true; };
if (!isNative && import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

/* ---------- pestañas ---------- */
const tabs = [...document.querySelectorAll("[role=tab]")];
function showTab(t) {
  tabs.forEach((b) => { const on = b === t; b.setAttribute("aria-selected", on); document.getElementById(b.getAttribute("aria-controls")).hidden = !on; });
  if (t.id === "tab-outfits") { viewer?.resize(); renderOutfit(); }
  window.scrollTo({ top: 0 });
}
tabs.forEach((b) => b.addEventListener("click", () => showTab(b)));

/* ---------- datos ---------- */
function startData() {
  say("#globalStatus", "Cargando…");
  unsubs.push(onSnapshot(itemsRef(), (snap) => {
    say("#globalStatus", snap.metadata.fromCache ? "Sin conexión: mostrando tu armario guardado." : "");
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const k in state.outfit) if (!state.items.find((i) => i.id === state.outfit[k])) delete state.outfit[k];
    renderCloset(); renderOutfit(); renderSaved(); if (state.shop) renderShop();
  }, () => say("#globalStatus", "No se ha podido cargar el armario. Revisa las reglas de Firestore.", true)));
  unsubs.push(onSnapshot(outfitsRef(), (snap) => { state.outfits = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderSaved(); }, () => {}));
  unsubs.push(onSnapshot(metaDoc("style"), (s) => { state.style = s.exists() ? s.data() : null; renderStyle(); }, () => {}));
  unsubs.push(onSnapshot(metaDoc("shopping"), (s) => { state.shop = s.exists() ? s.data() : null; renderShop(); }, () => {}));
}

// Imágenes recortadas: guardadas en users/{uid}/images/{id}, cacheadas en memoria
const urlCache = new Map();
async function imageUrl(item) {
  if (!item?.hasImage) return null;
  const k = item.id + ":" + (item.imageVersion || 0);
  if (urlCache.has(k)) return urlCache.get(k);
  const p = getDoc(imageDoc(item.id)).then((s) => s.exists() ? URL.createObjectURL(base64ToBlob(s.data().data, s.data().mime || "image/webp")) : null).catch(() => null);
  urlCache.set(k, p); return p;
}
// Pinta la imagen en los <img data-img> cuando llega
function hydrateImages(root) {
  root.querySelectorAll("img[data-img]").forEach(async (img) => {
    const it = state.items.find((i) => i.id === img.dataset.img); const url = await imageUrl(it);
    if (url) { img.src = url; if (it.cutMethod === "sin-recorte") img.classList.add("photo"); }
  });
}

/* ---------- icono si no hay foto ---------- */
function icon(item) {
  const c = esc(item.colorHex || "#999"), s = "stroke='rgba(0,0,0,.35)' stroke-width='1.5'";
  const p = {
    top: `<path d='M30 10l-18 10 7 14 9-5v51h44V29l9 5 7-14-18-10c-3 7-11 11-20 11s-17-4-19-11z' fill='${c}' ${s}/>`,
    outer: `<path d='M28 8L8 20l6 52h12V40l2 40h44l2-40v32h12l6-52L72 8 60 14 50 40 40 14z' fill='${c}' ${s}/>`,
    bottom: item.shape === "falda" ? `<path d='M30 12h40l12 66H18z' fill='${c}' ${s}/>` : `<path d='M28 8h44l6 82H58L50 34 42 90H22z' fill='${c}' ${s}/>`,
    dress: `<path d='M38 6h24l-2 18 8 14 14 52H18l14-52 8-14z' fill='${c}' ${s}/>`,
    shoes: `<path d='M14 54h24l4 8 36 6c6 1 8 6 8 10v4H14z' fill='${c}' ${s}/>`,
    accessory: `<path d='M24 36h52l6 48H18z' fill='${c}' ${s}/><path d='M38 36c0-14 24-14 24 0' fill='none' ${s}/>`,
  }[item.category] || "";
  return `<svg viewBox='0 0 100 100' aria-hidden='true'>${p}</svg>`;
}
const visual = (it) => it.hasImage ? `<img data-img="${esc(it.id)}" alt="">` : icon(it);

/* ---------- armario ---------- */
function renderFilter() {
  const counts = {}; state.items.forEach((i) => (counts[i.category] = (counts[i.category] || 0) + 1));
  const opts = [["all", "Todo", state.items.length], ...Object.keys(CATS).map((k) => [k, CATS[k].label, counts[k] || 0])];
  $("#catFilter").innerHTML = opts.map(([k, l, n]) => `<button class="chip" data-k="${k}" aria-pressed="${state.filter === k}">${esc(l)} · ${n}</button>`).join("");
}
$("#catFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; state.filter = b.dataset.k; renderCloset(); });
function renderCloset() {
  renderFilter();
  const list = state.items.filter((i) => state.filter === "all" || i.category === state.filter);
  $("#closetCount").textContent = state.items.length ? `${state.items.length} prendas. Toca una para editarla.` : "Tu armario está vacío.";
  $("#closet").innerHTML = list.length ? list.map((it) => `
    <button class="tag" data-id="${esc(it.id)}">
      <div class="pic">${visual(it)}</div>
      <div class="body">
        <div class="name">${esc(it.name)}</div>
        <div class="care"><span class="sw" style="background:${esc(it.colorHex)}"></span>${esc(it.colorName || "")} · ${esc(it.season || "")}</div>
        <div class="care">FORM ${"●".repeat(it.formality || 3)}${"○".repeat(5 - (it.formality || 3))}</div>
      </div>
    </button>`).join("")
    : `<div class="empty" style="grid-column:1/-1"><b>${state.items.length ? "No hay prendas en esta categoría." : "Empieza fotografiando una prenda."}</b><span>Ponla extendida sobre un fondo liso. La app quita el fondo y Claude rellena los datos.</span></div>`;
  hydrateImages($("#closet"));
  renderPickStrip();
}
$("#closet").addEventListener("click", (e) => { const b = e.target.closest(".tag"); if (b) openEditor(state.items.find((i) => i.id === b.dataset.id)); });

/* ---------- editor de prenda ---------- */
$("#f-category").innerHTML = Object.keys(CATS).map((k) => `<option value="${k}">${CATS[k].label}</option>`).join("");
const fillShapes = (cat, sel) => { $("#f-shape").innerHTML = SHAPES[cat].map((s) => `<option ${s === sel ? "selected" : ""}>${s}</option>`).join(""); };
$("#f-category").addEventListener("change", () => fillShapes($("#f-category").value));

async function openEditor(it) {
  state.editing = it || null; state.cut = null; state.aiPhoto = null;
  $("#addPanel").hidden = false; $("#addTitle").textContent = it ? "Editar prenda" : "Nueva prenda";
  $("#deleteItem").hidden = !it; say("#addStatus", ""); say("#cutStatus", ""); $("#cutProgress").hidden = true;
  const d = it || { name: "", category: "top", shape: "camiseta", colorName: "", colorHex: "#9fb7d4", season: "todo el año", formality: 3, tags: [] };
  $("#f-name").value = d.name; $("#f-category").value = d.category; fillShapes(d.category, d.shape);
  $("#f-colorName").value = d.colorName || ""; $("#f-colorHex").value = /^#[0-9a-f]{6}$/i.test(d.colorHex) ? d.colorHex : "#999999";
  $("#f-season").value = d.season || "todo el año"; $("#f-formality").value = d.formality || 3; $("#f-tags").value = (d.tags || []).join(", ");
  const url = it ? await imageUrl(it) : null;
  $("#previewBox").hidden = !url; $("#dropText").hidden = !!url; if (url) $("#photoPreview").src = url;
  $("#addPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
$("#openAdd").onclick = () => openEditor(null);
$("#closeAdd").onclick = () => { $("#addPanel").hidden = true; };

// Foto: cámara nativa en el APK, selector de archivos en la web
async function pickOne() {
  if (isNative) {
    const p = await Camera.getPhoto({ source: CameraSource.Prompt, resultType: CameraResultType.Uri, quality: 88, width: 1800, correctOrientation: true, promptLabelHeader: "Foto de la prenda", promptLabelPhoto: "Elegir de la galería", promptLabelPicture: "Hacer foto", promptLabelCancel: "Cancelar" });
    return await (await fetch(p.webPath)).blob();
  }
  return new Promise((resolve) => { const inp = $("#photoInput"); inp.onchange = () => { resolve(inp.files[0] || null); inp.value = ""; }; inp.click(); });
}
async function pickMany(limit) {
  if (isNative) { const r = await Camera.pickImages({ quality: 85, width: 1400, limit }); return Promise.all(r.photos.map(async (p) => (await fetch(p.webPath)).blob())); }
  return new Promise((resolve) => { const inp = $("#pinInput"); inp.onchange = () => { resolve([...inp.files].slice(0, limit)); inp.value = ""; }; inp.click(); });
}

$("#drop").onclick = async () => {
  let file;
  try { file = await pickOne(); } catch (e) { if (!String(e?.message || "").toLowerCase().includes("cancel")) say("#cutStatus", "No se ha podido abrir la cámara. Revisa los permisos de la app.", true); return; }
  if (file) handlePhoto(file);
};

async function handlePhoto(file) {
  let photo;
  try { photo = await shrinkPhoto(file, 1400); } catch { return say("#cutStatus", "No se ha podido leer esa imagen. Prueba con un JPG o PNG.", true); }
  $("#photoPreview").src = URL.createObjectURL(photo); $("#previewBox").hidden = false; $("#dropText").hidden = true;
  state.aiPhoto = await shrinkPhoto(photo, 900);
  // recorte y clasificación a la vez
  const bar = $("#cutProgress"), fill = bar.querySelector("i"); bar.hidden = false; fill.style.width = "0";
  const cutJob = makeCutout(photo, (t, f) => { say("#cutStatus", t); fill.style.width = Math.round(f * 100) + "%"; })
    .then((cut) => {
      state.cut = cut; bar.hidden = true;
      $("#photoPreview").src = URL.createObjectURL(cut.blob);
      say("#cutStatus", { ia: "Fondo quitado.", "fondo-liso": "Fondo quitado por color. Si ves restos, repite la foto sobre un fondo más liso.", "sin-recorte": "No se ha podido quitar el fondo; se usará la foto tal cual." }[cut.method]);
    })
    .catch(() => { bar.hidden = true; say("#cutStatus", "No se ha podido procesar la foto.", true); });
  classify();
  await cutJob;
}

/* ---------- ordenador: arrastrar y soltar, pegar, Escape ---------- */
const imagesIn = (list) => [...(list || [])].filter((f) => f.type?.startsWith("image/"));
function dropZone(el, onFiles) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); const f = imagesIn(e.dataTransfer?.files); if (f.length) onFiles(f); });
}
dropZone($("#drop"), (f) => handlePhoto(f[0]));
dropZone($("#pinDrop"), (f) => addPins(f));
// Ctrl+V con una imagen copiada: va a la prenda si el editor está abierto, o a los pines si estás en "Mi estilo"
document.addEventListener("paste", (e) => {
  const f = imagesIn([...(e.clipboardData?.items || [])].map((i) => i.getAsFile()).filter(Boolean));
  if (!f.length) return;
  if (!$("#addPanel").hidden) { e.preventDefault(); handlePhoto(f[0]); }
  else if (!$("#p-style").hidden) { e.preventDefault(); addPins(f); }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#addPanel").hidden) $("#addPanel").hidden = true;
  else if (!$("#settingsPanel").hidden) $("#settingsPanel").hidden = true;
});

async function classify() {
  say("#addStatus", "Claude está mirando la prenda…");
  try {
    const r = await api("/api/classify", { image: await blobToBase64(state.aiPhoto) });
    if (!CATS[r.category]) return say("#addStatus", "No he reconocido la prenda. Rellena los datos a mano.");
    $("#f-name").value = r.name || ""; $("#f-category").value = r.category; fillShapes(r.category, r.shape);
    $("#f-colorName").value = r.colorName || ""; if (/^#[0-9a-f]{6}$/i.test(r.colorHex || "")) $("#f-colorHex").value = r.colorHex;
    if (r.season) $("#f-season").value = r.season;
    $("#f-formality").value = Math.min(5, Math.max(1, parseInt(r.formality) || 3)); $("#f-tags").value = (r.tags || []).join(", ");
    say("#addStatus", "Datos rellenados. Revísalos y guarda.");
  } catch (e) { say("#addStatus", (e.message || "") + " Puedes rellenar los datos a mano.", true); }
}

$("#saveItem").onclick = async () => {
  const name = $("#f-name").value.trim(); if (!name) return say("#addStatus", "Ponle un nombre a la prenda.", true);
  $("#saveItem").disabled = true; say("#addStatus", "Guardando…");
  try {
    const id = state.editing?.id || newItemId();
    const data = {
      name, category: $("#f-category").value, shape: $("#f-shape").value, colorName: $("#f-colorName").value.trim(),
      colorHex: $("#f-colorHex").value, season: $("#f-season").value, formality: Math.min(5, Math.max(1, parseInt($("#f-formality").value) || 3)),
      tags: $("#f-tags").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6),
      createdAt: state.editing?.createdAt || Date.now(),
      hasImage: state.editing?.hasImage || false, aspect: state.editing?.aspect || null,
      imageVersion: state.editing?.imageVersion || 0, cutMethod: state.editing?.cutMethod || null,
    };
    const batch = writeBatch(fs);
    if (state.cut?.blob) {
      const b64 = await blobToBase64(state.cut.blob);
      if (b64.length > 980_000) throw { message: "La foto es demasiado grande. Prueba con otra." };
      batch.set(imageDoc(id), { data: b64, mime: "image/webp", width: state.cut.width, height: state.cut.height });
      Object.assign(data, { hasImage: true, aspect: state.cut.aspect, imageVersion: Date.now(), cutMethod: state.cut.method });
    }
    batch.set(doc(itemsRef(), id), data);
    await batch.commit();
    say("#addStatus", "Guardada."); $("#addPanel").hidden = true;
  } catch (e) { say("#addStatus", e.message || "No se ha podido guardar. Inténtalo de nuevo.", true); }
  finally { $("#saveItem").disabled = false; }
};
let delArmed = false;
$("#deleteItem").onclick = async () => {
  if (!state.editing) return;
  if (!delArmed) { delArmed = true; $("#deleteItem").textContent = "Pulsa otra vez para eliminar"; setTimeout(() => { delArmed = false; $("#deleteItem").textContent = "Eliminar prenda"; }, 4000); return; }
  delArmed = false; $("#deleteItem").textContent = "Eliminar prenda";
  try { const b = writeBatch(fs); b.delete(doc(itemsRef(), state.editing.id)); b.delete(imageDoc(state.editing.id)); await b.commit(); $("#addPanel").hidden = true; }
  catch { say("#addStatus", "No se ha podido eliminar.", true); }
};

/* ---------- probador ---------- */
const viewer = createViewer($("#stage"), { onError: () => ($("#stageFallback").hidden = false) });
if (!viewer) $("#stageFallback").hidden = false;
$("#frontBtn").onclick = () => viewer?.front();
$("#backBtn").onclick = () => viewer?.back();

function renderPickStrip() {
  const sel = new Set(Object.values(state.outfit));
  $("#pickStrip").innerHTML = state.items.map((it) => `<button class="mini" data-id="${esc(it.id)}" aria-pressed="${sel.has(it.id)}"><div class="pic">${visual(it)}</div><span>${esc(it.name)}</span></button>`).join("") || `<p class="status">Añade prendas al armario para vestir el maniquí.</p>`;
  hydrateImages($("#pickStrip"));
}
$("#pickStrip").addEventListener("click", (e) => { const b = e.target.closest(".mini"); if (b) toggleItem(b.dataset.id); });
function toggleItem(id) {
  const it = state.items.find((i) => i.id === id); if (!it) return;
  if (state.outfit[it.category] === id) delete state.outfit[it.category];
  else {
    state.outfit[it.category] = id;
    if (it.category === "dress") { delete state.outfit.top; delete state.outfit.bottom; }
    if (it.category === "top" || it.category === "bottom") delete state.outfit.dress;
  }
  renderOutfit();
}
function setOutfit(ids) { state.outfit = {}; ids.forEach((id) => { const it = state.items.find((i) => i.id === id); if (it) state.outfit[it.category] = id; }); renderOutfit(); }
function renderOutfit() {
  $("#slots").innerHTML = SLOT_ORDER.map((k) => {
    const it = state.items.find((i) => i.id === state.outfit[k]);
    return `<div class="slot"><span class="k">${CATS[k].slot}</span><span class="v">${it ? `<span class="sw" style="background:${esc(it.colorHex)}"></span> ${esc(it.name)}` : '<span class="status">—</span>'}</span></div>`;
  }).join("");
  renderPickStrip();
  viewer?.show(Object.values(state.outfit).map((id) => state.items.find((i) => i.id === id)).filter(Boolean), imageUrl);
}
$("#clearOutfit").onclick = () => { state.outfit = {}; renderOutfit(); };
$("#saveOutfit").onclick = async () => {
  const ids = Object.values(state.outfit);
  if (ids.length < 2) return say("#outfitStatus", "Elige al menos dos prendas.");
  try { await setDoc(doc(outfitsRef()), { name: $("#outfitName").value.trim() || "Outfit sin nombre", itemIds: ids, createdAt: Date.now() }); say("#outfitStatus", "Outfit guardado."); $("#outfitName").value = ""; }
  catch { say("#outfitStatus", "No se ha podido guardar.", true); }
};
const itemPills = (ids) => ids.map((id) => state.items.find((i) => i.id === id)).filter(Boolean).map((it) => `<span class="pill"><span class="sw" style="background:${esc(it.colorHex)}"></span>${esc(it.name)}</span>`).join("");
function renderSaved() {
  const list = [...state.outfits].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $("#saved").innerHTML = list.length ? list.map((o) => `<div class="card"><div class="row between"><h3>${esc(o.name)}</h3><div class="row"><button class="btn small" data-wear="${esc(o.id)}">Probar</button><button class="btn small" data-del="${esc(o.id)}">Borrar</button></div></div><div class="pills">${itemPills(o.itemIds || [])}</div></div>`).join("") : `<p class="status">Todavía no has guardado ninguno.</p>`;
}
$("#saved").addEventListener("click", async (e) => {
  const w = e.target.closest("[data-wear]"), d = e.target.closest("[data-del]");
  if (w) { setOutfit(state.outfits.find((o) => o.id === w.dataset.wear)?.itemIds || []); $("#stage").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  if (d) { try { await deleteDoc(doc(outfitsRef(), d.dataset.del)); } catch {} }
});

const wardrobe = () => state.items.map((i) => ({ id: i.id, name: i.name, category: i.category, shape: i.shape, color: `${i.colorName} ${i.colorHex}`, season: i.season, formality: i.formality, tags: i.tags }));

$("#suggest").onclick = async () => {
  if (state.items.length < 3) return say("#suggestStatus", "Necesitas al menos 3 prendas en el armario.");
  $("#suggest").disabled = true; say("#suggestStatus", "Claude está combinando tu ropa…");
  try {
    const r = await api("/api/outfits", { wardrobe: wardrobe(), style: state.style, occasion: $("#occasion").value, weather: $("#weather").value });
    const valid = new Set(state.items.map((i) => i.id));
    const outs = (r.outfits || []).map((o) => ({ ...o, itemIds: (o.itemIds || []).filter((id) => valid.has(id)) })).filter((o) => o.itemIds.length);
    state.sugg = outs;
    $("#suggestions").innerHTML = outs.map((o, i) => `<div class="card"><div class="row between"><h3>${esc(o.title)}</h3><button class="btn small primary" data-sug="${i}">Probar en 3D</button></div><div class="pills">${itemPills(o.itemIds)}</div><p>${esc(o.why)}</p>${o.tip ? `<p class="note">${esc(o.tip)}</p>` : ""}</div>`).join("");
    say("#suggestStatus", outs.length ? "" : "No han salido combinaciones válidas. Prueba con otra ocasión.");
    if (outs[0]) setOutfit(outs[0].itemIds);
  } catch (e) { say("#suggestStatus", e.message, true); }
  finally { $("#suggest").disabled = false; }
};
$("#suggestions").addEventListener("click", (e) => { const b = e.target.closest("[data-sug]"); if (!b) return; const o = state.sugg[+b.dataset.sug]; setOutfit(o.itemIds); $("#outfitName").value = o.title; $("#stage").scrollIntoView({ behavior: "smooth", block: "nearest" }); });

/* ---------- estilo ---------- */
function renderStyle() {
  const s = state.style, out = $("#styleOut");
  if (!s) { out.innerHTML = `<p class="status">Aún no hay perfil de estilo. Analiza tu tablero o sube capturas para crearlo.</p>`; return; }
  if (s.boardUrl && !$("#pinUrl").value) $("#pinUrl").value = s.boardUrl;
  out.innerHTML = `<div class="sub">Perfil de estilo · ${esc(s.source || "")}${s.pinCount ? ` · ${s.pinCount} pines` : ""}</div>
    <h2>${esc((s.keywords || []).slice(0, 3).join(" · "))}</h2>
    <p>${esc(s.summary)}</p>
    <div class="palette">${(s.palette || []).map((p) => `<div class="pal"><i style="background:${esc(p.hex)}"></i>${esc(p.name)}</div>`).join("")}</div>
    <div class="stack-tight"><h3>Prendas clave</h3><div class="pills">${(s.keyPieces || []).map((k) => `<span class="pill">${esc(k)}</span>`).join("")}</div></div>
    ${s.silhouettes ? `<p class="note">${esc(s.silhouettes)}</p>` : ""}${s.avoid ? `<p class="note">Evita: ${esc(s.avoid)}</p>` : ""}`;
}
async function saveStyle(r, source, extra = {}) {
  const data = {
    summary: String(r.summary || ""), keywords: (r.keywords || []).map(String).slice(0, 8),
    palette: (r.palette || []).filter((p) => /^#[0-9a-f]{6}$/i.test(p?.hex || "")).slice(0, 8),
    keyPieces: (r.keyPieces || []).map(String).slice(0, 12), silhouettes: String(r.silhouettes || ""), avoid: String(r.avoid || ""),
    source, updatedAt: Date.now(), ...extra,
  };
  await setDoc(metaDoc("style"), data);
}
$("#readBoard").onclick = async () => {
  const url = $("#pinUrl").value.trim();
  if (!/^https?:\/\/(([a-z]+\.)?pinterest\.[a-z.]+\/|pin\.it\/)/i.test(url)) return say("#boardStatus", "Pega el enlace de un tablero de Pinterest.", true);
  $("#readBoard").disabled = true; say("#boardStatus", "Leyendo el tablero y analizando los pines… (puede tardar un minuto)");
  try { const r = await api("/api/style/pinterest", { url }); await saveStyle(r.style, "tablero de Pinterest", { boardUrl: url, pinCount: r.pinCount || 0 }); say("#boardStatus", "Perfil de estilo actualizado."); }
  catch (e) { say("#boardStatus", e.message, true); }
  finally { $("#readBoard").disabled = false; }
};
$("#pinDrop").onclick = async () => {
  let files; try { files = await pickMany(10); } catch { return; }
  addPins(files || []);
};
async function addPins(files) {
  for (const f of files) { if (state.pins.length >= 10) break; try { state.pins.push(await shrinkPhoto(f, 1000)); } catch {} }
  $("#pinThumbs").innerHTML = state.pins.map((b) => `<img src="${URL.createObjectURL(b)}" alt="Captura de pin">`).join("");
  $("#analyzePins").disabled = !state.pins.length;
}
$("#analyzePins").onclick = async () => {
  $("#analyzePins").disabled = true; say("#pinStatus", "Claude está estudiando tus pines…");
  try { const images = await Promise.all(state.pins.map(blobToBase64)); const r = await api("/api/style/images", { images }); await saveStyle(r.style, "capturas de Pinterest", { pinCount: images.length }); say("#pinStatus", "Perfil de estilo actualizado."); }
  catch (e) { say("#pinStatus", e.message, true); }
  finally { $("#analyzePins").disabled = false; }
};

/* ---------- compras ---------- */
function renderShop() {
  const s = state.shop;
  if (!s) { $("#adviceOut").hidden = true; return; }
  $("#adviceOut").hidden = !s.advice; $("#adviceOut").textContent = s.advice || "";
  $("#gaps").innerHTML = (s.gaps || []).map((g, i) => {
    const q = encodeURIComponent(g.searchTerm || g.piece);
    const stores = (g.stores || []).filter((k) => STORES[k]); const use = stores.length ? stores : ["zara", "massimo", "hm"];
    return `<div class="gap"><span class="sw" style="width:38px;height:38px;border-radius:8px;background:${esc(g.colorHex || "#888")}"></span>
      <div class="stack">
        <div class="row between"><h3>${esc(g.piece)}</h3><span class="prio ${esc(g.priority)}">${esc(g.priority || "")}</span></div>
        <p>${esc(g.why)}</p>
        ${g.combinesWith?.length ? `<div class="pills">${itemPills(g.combinesWith)}</div>` : ""}
        <div class="care">Precio orientativo: ${esc(g.priceRange || "—")}</div>
        <div class="row">${use.map((k) => `<a class="btn small" href="${STORES[k].url(q)}" target="_blank" rel="noopener">${STORES[k].name} ↗</a>`).join("")}</div>
        <div class="row"><button class="btn small deep" data-find="${i}">Buscar modelos ahora</button></div>
        <div class="products" id="res-${i}">${productsHtml(g.products)}</div>
      </div></div>`;
  }).join("") || `<div class="empty">No hay huecos claros en tu armario.</div>`;
}
function productsHtml(ps) {
  if (!ps?.length) return "";
  return ps.map((p) => `<a class="product" href="${esc(p.url)}" target="_blank" rel="noopener"><span>${esc(p.name)}<small>${esc(p.store)}${p.color ? " · " + esc(p.color) : ""}</small></span><b>${esc(p.price || "")}</b></a>`).join("") + `<p class="status">Encontrado en internet; precio y stock pueden cambiar.</p>`;
}
$("#findGaps").onclick = async () => {
  $("#findGaps").disabled = true; say("#gapStatus", "Claude está revisando tu armario…");
  try {
    const r = await api("/api/gaps", { wardrobe: wardrobe(), style: state.style, budget: $("#budget").value, section: $("#section").value });
    const valid = new Set(state.items.map((i) => i.id));
    r.gaps = (r.gaps || []).map((g) => ({ ...g, combinesWith: (g.combinesWith || []).filter((id) => valid.has(id)) }));
    await setDoc(metaDoc("shopping"), { ...r, updatedAt: Date.now() });
    say("#gapStatus", "");
  } catch (e) { say("#gapStatus", e.message, true); }
  finally { $("#findGaps").disabled = false; }
};
$("#gaps").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-find]"); if (!b) return;
  const i = +b.dataset.find, g = state.shop.gaps[i], out = $("#res-" + i);
  b.disabled = true; out.innerHTML = `<p class="status">Buscando en Zara, Massimo Dutti, H&amp;M y otras tiendas… (puede tardar un minuto)</p>`;
  try {
    const r = await api("/api/shop", { piece: g.piece, searchTerm: g.searchTerm, colorHint: g.colorHex, section: $("#section").value, budget: $("#budget").value, stores: g.stores });
    const gaps = state.shop.gaps.map((x, j) => (j === i ? { ...x, products: r.products || [] } : x));
    await setDoc(metaDoc("shopping"), { ...state.shop, gaps });
    if (!r.products?.length) out.innerHTML = `<p class="status">No he encontrado modelos ahora mismo. Usa los enlaces de las tiendas.</p>`;
  } catch (err) { out.innerHTML = `<p class="status err">${esc(err.message)}</p>`; }
  finally { b.disabled = false; }
});
