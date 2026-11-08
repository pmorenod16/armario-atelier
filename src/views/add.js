// Añadir una prenda: foto → recorte en el móvil + lectura con IA a la vez → foto de etiqueta (opcional) → revisar y guardar.
// Editar usa el mismo formulario.
import { t } from "../i18n.js";
import { $, esc, icon, openSheet, pickPhoto, isCancel, dropZone, toast, say, soften, setHalo, isNative } from "../ui.js";
import { shrinkPhoto, makeCutout, clearLenses } from "../cutout.js";
import { api, blobToBase64 } from "../api.js";
import { saveItem, fullImage } from "../data.js";
import { itemForm } from "./form.js";
import { base64ToBlob } from "../api.js";
import { searchWithLens } from "../lens.js";
import { TYPE, COLOR, label } from "../catalog.js";

const tintFor = (hex) => soften(hex, matchMedia("(prefers-color-scheme: dark)").matches ? 0.72 : 0.8, matchMedia("(prefers-color-scheme: dark)").matches ? 20 : 255);

async function choosePhoto() {
  try { return await pickPhoto(); }
  catch (e) { if (!isCancel(e)) toast(t("add.cameraFail"), "error"); return null; }
}

/** Hoja de nueva prenda. `file` opcional (si viene de arrastrar/pegar). */
/** La IA dice dónde está la prenda en la foto (para recortar solo eso). Si tarda o falla, se recorta sin caja. */
async function locateGarment(blob) {
  const small = await shrinkPhoto(blob, 768);
  return (await api("/api/locate", { image: await blobToBase64(small) }, { timeout: 12000 })).box;
}

export function openAdd(file) {
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("add.title")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="add-body">
      <div class="drop" id="drop">
        ${icon("camera")}
        <button class="btn primary" type="button" id="pick">${t("add.pick")}</button>
        <p>${t("add.pickHint")}</p>
        ${isNative ? "" : `<p class="small">${t("add.pickDesktop")}</p>`}
      </div>
      <div class="or"><span>${t("add.orLink")}</span></div>
      <form class="off-link" id="startLink"><input class="input" name="url" type="url" inputmode="url" placeholder="${t("official.linkPh")}" aria-label="${t("add.fromLink")}"><button class="btn sm primary" type="submit">${t("official.go")}</button></form>
      <div id="startOfficial"></div>
    </div>`, { label: t("add.title"), onClose: () => { document.removeEventListener("paste", onPaste); setHalo(null); } });
  const root = sheet.el;
  $("[data-close]", root).onclick = () => sheet.close();
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/")); if (f) start(f); };
  document.addEventListener("paste", onPaste);
  dropZone($("#drop", root), (f) => start(f));
  $("#pick", root).onclick = async () => { const f = await choosePhoto(); if (f) start(f); };
  if (file) start(file);

  // empezar desde el enlace de la tienda: se elige una foto oficial y se sigue como si fuera tu foto
  $("#startLink", root).onsubmit = async (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim(); if (!url) return;
    const box = $("#startOfficial", root);
    box.innerHTML = `<div class="official"><p class="status">${t("official.reading")}</p></div>`;
    let p;
    try { p = (await api("/api/product", { url })).products[0]; }
    catch (err) { box.innerHTML = `<div class="official"><p class="status" data-kind="error">${esc(err?.message || t("official.fail"))}</p></div>`; return; }
    box.innerHTML = `<div class="official"><div class="row between"><b>${esc(p.name || t("official.title"))}</b><span class="muted small">${t("official.pick")}</span></div>
      ${p.price || p.brand ? `<div class="off-meta">${p.brand ? `<span>${esc(p.brand)}</span>` : ""}${p.price ? `<span class="muted">${esc(p.price)}</span>` : ""}</div>` : ""}
      <div class="off-imgs">${p.images.slice(0, 8).map((src, k) => `<button type="button" data-k="${k}" aria-label="${t("official.use")}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div></div>`;
    box.onclick = async (ev) => {
      const b = ev.target.closest(".off-imgs button"); if (!b) return;
      const src = p.images[+b.dataset.k];
      box.querySelectorAll(".off-imgs button").forEach((x) => (x.disabled = true));
      try {
        const { image, mime } = await api("/api/image", { url: src });
        start(base64ToBlob(image, mime), { product: p, image: src });
      } catch (err) { toast(err?.message || t("official.fail"), "error"); box.querySelectorAll(".off-imgs button").forEach((x) => (x.disabled = false)); }
    };
  };
  if (!isNative) $("#startLink input", root).addEventListener("paste", () => setTimeout(() => $("#startLink", root).requestSubmit(), 0));

  let busy = false;
  async function start(photoFile, fromShop = null) {
    if (busy) return; busy = true;
    document.removeEventListener("paste", onPaste);
    let photo;
    try { photo = await shrinkPhoto(photoFile, 1400); } catch { busy = false; toast(t("add.badImage"), "error"); return; }
    const rawUrl = URL.createObjectURL(photo);
    const body = $(".add-body", root);
    body.innerHTML = `
      <div class="preview" id="pv"><img class="raw" src="${rawUrl}" alt="">
        <div class="progress" id="prog"><span id="progText">${t("add.cutting")}</span><div class="bar indet"><i></i></div></div></div>
      <p class="status" id="aiStatus" aria-live="polite">${t("add.reading")}</p>
      <button type="button" class="label-btn" id="labelBtn">${icon("tag")}<span><b>${t("item.addLabel")}</b><small>${t("item.labelHint")}</small></span></button>
      ${officialTools()}
      <div id="official"></div>
      <div id="formSlot"></div>`;
    const form = itemForm();
    $("#formSlot", root).append(form.el);
    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    foot.innerHTML = `<button class="btn" type="button" id="saveMore">${t("item.saveAndAnother")}</button><button class="btn primary" type="button" id="save" disabled>${t("item.save")}</button>`;
    root.append(foot);

    // recorte y lectura a la vez
    let cut = null;
    const cutting = makeCutout(photo, (text, frac) => {
      $("#progText", root).textContent = /Descargando/.test(text) ? t("add.downloading") : t("add.cutting");
      const bar = $(".bar", root); if (frac > 0 && frac < 0.95) { bar.classList.remove("indet"); bar.firstElementChild.style.width = `${Math.round(frac * 100)}%`; } else bar.classList.add("indet");
    }, { locate: locateGarment }).then((c) => {
      cut = c;
      const pv = $("#pv", root);
      pv.innerHTML = `<img src="${URL.createObjectURL(c.blob)}" alt="">`;
      pv.style.setProperty("--tint", tintFor(c.tone) || "var(--surface-solid)");
      setHalo(c.tone);
      URL.revokeObjectURL(rawUrl);
      if (c.method !== "ia") toast(t(c.method === "fondo-liso" ? "add.cutFlat" : "add.cutNone"));
      $("#save", root).disabled = false;
    }).catch((e) => { console.error(e); toast(t("add.badImage"), "error"); });

    (async () => {
      try {
        const small = await shrinkPhoto(photo, 1024);
        const d = await api("/api/classify", { image: await blobToBase64(small) });
        form.fill(d, { ai: true });
        if (fromShop) {
          const p = fromShop.product;
          form.fill({ name: p.name ? p.name.charAt(0) + p.name.slice(1).toLowerCase() : null, brand: p.brand || brandFromUrl(p.url) }, { ai: true });
        }
        say($("#aiStatus", root), t("add.readDone"), "ok");
      } catch (e) {
        say($("#aiStatus", root), e?.message ? `${t("add.readFail")} (${e.message})` : t("add.readFail"), "error");
        form.focusName();
      }
    })();

    let official = fromShop ? { officialImage: fromShop.image, officialUrl: fromShop.product.url || null, photoSource: "oficial" } : null;
    const useOfficial = (c, info) => { cut = c; official = info; showCut(root, c); $("#save", root).disabled = false; };
    $("#labelBtn", root).onclick = () => readLabel(form, root, useOfficial);
    wireOfficial(form, root, useOfficial, async () => photo);
    const doSave = async (again) => {
      const data = form.read();
      if (!data.name) { toast(t("item.needName"), "error"); form.focusName(); return; }
      await cutting; if (!cut) return;
      $("#save", root).disabled = $("#saveMore", root).disabled = true;
      try {
        // gafas de ver: cristales transparentes
        if (data.type === "gafas-ver" && !cut.lensesCleared) { try { cut = await clearLenses(cut); } catch (e) { console.warn("cristales", e); } }
        await saveItem({ ...data, status: "disponible", ...(official || {}), ...(cut.lensesCleared ? { lensesCleared: true } : {}) }, { cut });
        toast(t("item.saved"));
        sheet.close();
        if (again) setTimeout(() => openAdd(), 360);
      } catch (e) {
        console.error(e); toast(t(e?.code === "too-big" ? "item.tooBig" : "item.saveFail"), "error");
        $("#save", root).disabled = $("#saveMore", root).disabled = false;
      }
    };
    $("#save", root).onclick = () => doSave(false);
    $("#saveMore", root).onclick = () => doSave(true);
  }
}

async function readLabel(form, root, onOfficial) {
  const f = await choosePhoto(); if (!f) return;
  const btn = $("#labelBtn", root), st = $("#aiStatus", root);
  btn.disabled = true; say(st, t("item.labelReading"));
  try {
    const img = await shrinkPhoto(f, 1400);
    const d = await api("/api/label", { image: await blobToBase64(img) });
    form.fill(d, { ai: true });
    if (d.madeIn) form.fill({ notes: [form.read().notes, t("item.madeIn", { c: d.madeIn })].filter(Boolean).join(" · ") });
    say(st, t("item.labelDone"), "ok");
    btn.disabled = false;
    if (d.brand) findOfficial(form, root, onOfficial, d.ref);
    return;
  } catch (e) { say(st, e?.message || t("item.labelFail"), "error"); }
  btn.disabled = false;
}

function showCut(root, c) {
  const pv = $("#pv", root);
  pv.innerHTML = `<img src="${URL.createObjectURL(c.blob)}" alt="">`;
  pv.style.setProperty("--tint", tintFor(c.tone) || "var(--surface-solid)");
  setHalo(c.tone);
}

// "www.zara.com" → "Zara"
const brandFromUrl = (u) => {
  try { const h = new URL(u).hostname.replace(/^(www\d?|shop|es)\./, "").split(".")[0]; return h.charAt(0).toUpperCase() + h.slice(1); } catch { return null; }
};

const officialTools = () => `
  <div class="off-tools">
    <span class="off-label">${t("official.title")}</span>
    <div class="row wrap">
      <button class="btn sm" type="button" id="officialBtn">${icon("search")}${t("official.findShort")}</button>
      <button class="btn sm" type="button" id="lensBtn">${icon("camera")}Google Lens</button>
      <button class="btn sm" type="button" id="linkBtn">${icon("copy")}${t("official.paste")}</button>
    </div>
    <form class="off-link" id="linkForm" hidden><input class="input" name="url" type="url" inputmode="url" placeholder="${t("official.linkPh")}" aria-label="${t("official.paste")}"><button class="btn sm primary" type="submit">${t("official.go")}</button></form>
  </div>`;

function wireOfficial(form, root, onPick, getPhoto) {
  $("#officialBtn", root).onclick = () => findOfficial(form, root, onPick);
  $("#lensBtn", root).onclick = async () => {
    const b = await getPhoto(); if (!b) { toast(t("official.noPhoto"), "error"); return; }
    try { await searchWithLens(b); $("#linkForm", root).hidden = false; say($("#aiStatus", root), t("official.lensHint")); }
    catch (e) { if (!isCancel(e)) toast(t("official.lensFail"), "error"); }
  };
  $("#linkBtn", root).onclick = async () => {
    const f = $("#linkForm", root); f.hidden = false;
    try { const txt = await navigator.clipboard.readText(); if (/https?:\/\//.test(txt)) f.url.value = txt.trim(); } catch {}
    f.url.focus();
  };
  $("#linkForm", root).onsubmit = async (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim(); if (!url) return;
    const box = $("#official", root);
    box.innerHTML = `<div class="official"><p class="status">${t("official.reading")}</p></div>`;
    try { const res = await api("/api/product", { url }); renderProducts(box, res.products, form, root, onPick); }
    catch (err) { box.innerHTML = `<div class="official"><p class="status" data-kind="error">${esc(err?.message || t("official.fail"))}</p></div>`; }
  };
}

/** Busca la prenda en la web oficial de la marca y deja elegir una de sus fotos para usarla en vez de la tuya. */
async function findOfficial(form, root, onPick, ref) {
  const d = form.read(), box = $("#official", root);
  if (!d.brand) { toast(t("official.needBrand"), "error"); return; }
  const color = d.colors?.[0]?.k ? label(COLOR[d.colors[0].k]) : "";
  box.innerHTML = `<div class="official"><p class="status">${t("official.searching", { brand: esc(d.brand) })}</p></div>`;
  let res;
  try { res = await api("/api/official", { brand: d.brand, ref: ref || d.ref || null, name: d.name, type: label(TYPE[d.type]), color }); }
  catch (e) { box.innerHTML = `<div class="official"><p class="status" data-kind="error">${esc(e?.message || t("official.fail"))}</p></div>`; return; }
  if (!res.products?.length) {
    box.innerHTML = `<div class="official"><p class="status">${t(res.reason === "sin-busqueda" ? "official.noSearch" : "official.none")}</p></div>`;
    return;
  }
  renderProducts(box, res.products, form, root, onPick);
}

function renderProducts(box, products, form, root, onPick) {
  const res = { products };
  box.innerHTML = `<div class="official"><div class="row between"><b>${t("official.title")}</b><span class="muted small">${t("official.pick")}</span></div>
    ${res.products.map((p, i) => `<div class="off-prod">
      <div class="off-meta"><span>${esc(p.name || "")}${p.color ? ` · ${esc(p.color)}` : ""}</span>${p.price ? `<span class="muted">${esc(p.price)}</span>` : ""}${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${t("official.view")}</a>` : ""}</div>
      <div class="off-imgs">${p.images.slice(0, 6).map((src, k) => `<button type="button" data-p="${i}" data-k="${k}" aria-label="${t("official.use")}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
    </div>`).join("")}</div>`;
  box.onclick = async (e) => {
    const b = e.target.closest(".off-imgs button"); if (!b) return;
    const p = res.products[+b.dataset.p], src = p.images[+b.dataset.k];
    box.querySelectorAll(".off-imgs button").forEach((x) => x.classList.toggle("on", x === b));
    const st = $("#aiStatus", root); say(st, t("official.loading"));
    try {
      const { image, mime } = await api("/api/image", { url: src });
      const c = await makeCutout(base64ToBlob(image, mime));
      onPick(c, { officialImage: src, officialUrl: p.url || null, officialRef: p.ref || null, photoSource: "oficial" });
      if (p.ref && !form.read().notes?.includes(p.ref)) form.fill({ notes: [form.read().notes, `Ref. ${p.ref}`].filter(Boolean).join(" · ") });
      say(st, t("official.used"), "ok");
    } catch (err) { say(st, err?.message || t("official.fail"), "error"); }
  };
}

/** Editar una prenda existente (datos y, si quiere, la foto). */
export function openEdit(item) {
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("item.edit")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="preview" id="pv" style="--tint:${tintFor(item.tone) || "var(--surface-solid)"}">${item.thumb ? `<img src="${item.thumb}" alt="">` : ""}</div>
    <div class="row wrap" style="margin-top:10px">
      <button class="btn sm" type="button" id="photo">${icon("camera")}${t("item.changePhoto")}</button>
      <button class="btn sm" type="button" id="labelBtn">${icon("tag")}${t("item.addLabel")}</button>
    </div>
    ${officialTools()}
    <p class="status" id="aiStatus" aria-live="polite"></p>
    <div id="official"></div>
    <div id="formSlot"></div>
    <div class="sheet-foot"><button class="btn" type="button" data-close>${t("common.cancel")}</button><button class="btn primary" type="button" id="save">${t("item.save")}</button></div>`,
  { label: t("item.edit") });
  const root = sheet.el;
  root.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => sheet.close()));
  const form = itemForm(item);
  $("#formSlot", root).append(form.el);
  fullImage(item).then((u) => { if (u) $("#pv img", root)?.setAttribute("src", u); });

  let cut = null;
  $("#photo", root).onclick = async () => {
    const f = await choosePhoto(); if (!f) return;
    const st = $("#aiStatus", root); say(st, t("add.cutting")); $("#save", root).disabled = true;
    try {
      cut = await makeCutout(await shrinkPhoto(f, 1400), () => {}, { locate: locateGarment });
      $("#pv", root).innerHTML = `<img src="${URL.createObjectURL(cut.blob)}" alt="">`;
      $("#pv", root).style.setProperty("--tint", tintFor(cut.tone));
      say(st, t(cut.method === "ia" ? "add.cutIa" : cut.method === "fondo-liso" ? "add.cutFlat" : "add.cutNone"), "ok");
    } catch { say(st, t("add.badImage"), "error"); }
    $("#save", root).disabled = false;
  };
  let official = null;
  const useOfficial = (c, info) => { cut = c; official = info; showCut(root, c); };
  $("#labelBtn", root).onclick = () => readLabel(form, root, useOfficial);
  wireOfficial(form, root, useOfficial, async () => {
    const u = await fullImage(item); return u ? await (await fetch(u)).blob() : null;
  });
  $("#save", root).onclick = async () => {
    const data = form.read();
    if (!data.name) { toast(t("item.needName"), "error"); return; }
    $("#save", root).disabled = true;
    try {
      if (cut && data.type === "gafas-ver" && !cut.lensesCleared) { try { cut = await clearLenses(cut); } catch (e) { console.warn("cristales", e); } }
      await saveItem({ ...data, createdAt: item.createdAt, status: item.status, ...(official || {}), ...(cut?.lensesCleared ? { lensesCleared: true } : {}) }, { id: item.id, cut });
      toast(t("item.saved")); sheet.close();
    } catch (e) { toast(t(e?.code === "too-big" ? "item.tooBig" : "item.saveFail"), "error"); $("#save", root).disabled = false; }
  };
}
export { tintFor, esc };
