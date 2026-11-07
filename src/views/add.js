// Añadir una prenda: foto → recorte en el móvil + lectura con IA a la vez → foto de etiqueta (opcional) → revisar y guardar.
// Editar usa el mismo formulario.
import { t } from "../i18n.js";
import { $, esc, icon, openSheet, pickPhoto, isCancel, dropZone, toast, say, soften, setHalo, isNative } from "../ui.js";
import { shrinkPhoto, makeCutout } from "../cutout.js";
import { api, blobToBase64 } from "../api.js";
import { saveItem, fullImage } from "../data.js";
import { itemForm } from "./form.js";

const tintFor = (hex) => soften(hex, matchMedia("(prefers-color-scheme: dark)").matches ? 0.72 : 0.8, matchMedia("(prefers-color-scheme: dark)").matches ? 20 : 255);

async function choosePhoto() {
  try { return await pickPhoto(); }
  catch (e) { if (!isCancel(e)) toast(t("add.cameraFail"), "error"); return null; }
}

/** Hoja de nueva prenda. `file` opcional (si viene de arrastrar/pegar). */
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
    </div>`, { label: t("add.title"), onClose: () => { document.removeEventListener("paste", onPaste); setHalo(null); } });
  const root = sheet.el;
  $("[data-close]", root).onclick = () => sheet.close();
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/")); if (f) start(f); };
  document.addEventListener("paste", onPaste);
  dropZone($("#drop", root), (f) => start(f));
  $("#pick", root).onclick = async () => { const f = await choosePhoto(); if (f) start(f); };
  if (file) start(file);

  let busy = false;
  async function start(photoFile) {
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
    }).then((c) => {
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
        say($("#aiStatus", root), t("add.readDone"), "ok");
      } catch (e) {
        say($("#aiStatus", root), e?.message ? `${t("add.readFail")} (${e.message})` : t("add.readFail"), "error");
        form.focusName();
      }
    })();

    $("#labelBtn", root).onclick = () => readLabel(form, root);
    const doSave = async (again) => {
      const data = form.read();
      if (!data.name) { toast(t("item.needName"), "error"); form.focusName(); return; }
      await cutting; if (!cut) return;
      $("#save", root).disabled = $("#saveMore", root).disabled = true;
      try {
        await saveItem({ ...data, status: "disponible" }, { cut });
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

async function readLabel(form, root) {
  const f = await choosePhoto(); if (!f) return;
  const btn = $("#labelBtn", root), st = $("#aiStatus", root);
  btn.disabled = true; say(st, t("item.labelReading"));
  try {
    const img = await shrinkPhoto(f, 1400);
    const d = await api("/api/label", { image: await blobToBase64(img) });
    form.fill(d, { ai: true });
    if (d.madeIn) form.fill({ notes: [form.read().notes, t("item.madeIn", { c: d.madeIn })].filter(Boolean).join(" · ") });
    say(st, t("item.labelDone"), "ok");
  } catch (e) { say(st, e?.message || t("item.labelFail"), "error"); }
  btn.disabled = false;
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
    <p class="status" id="aiStatus" aria-live="polite"></p>
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
      cut = await makeCutout(await shrinkPhoto(f, 1400));
      $("#pv", root).innerHTML = `<img src="${URL.createObjectURL(cut.blob)}" alt="">`;
      $("#pv", root).style.setProperty("--tint", tintFor(cut.tone));
      say(st, t(cut.method === "ia" ? "add.cutIa" : cut.method === "fondo-liso" ? "add.cutFlat" : "add.cutNone"), "ok");
    } catch { say(st, t("add.badImage"), "error"); }
    $("#save", root).disabled = false;
  };
  $("#labelBtn", root).onclick = () => readLabel(form, root);
  $("#save", root).onclick = async () => {
    const data = form.read();
    if (!data.name) { toast(t("item.needName"), "error"); return; }
    $("#save", root).disabled = true;
    try {
      await saveItem({ ...data, createdAt: item.createdAt, status: item.status }, { id: item.id, cut });
      toast(t("item.saved")); sheet.close();
    } catch (e) { toast(t(e?.code === "too-big" ? "item.tooBig" : "item.saveFail"), "error"); $("#save", root).disabled = false; }
  };
}
export { tintFor, esc };
