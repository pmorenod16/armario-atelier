// Mi estilo: lee tus tableros de Pinterest (o capturas) y saca el estilo que buscas. Se usa en outfits, maleta y compras.
// Un tablero principal (los campos de arriba de meta/style) y otros para usos concretos (salir, eventos…) en `extra`.
import { t } from "../i18n.js";
import { TYPE, COLOR, PATTERN, MATERIAL, FIT, label } from "../catalog.js";
import { $, esc, icon, toast, say, viewHalo, pickPhotos, isCancel, openSheet } from "../ui.js";
import { api, blobToBase64 } from "../api.js";
import { shrinkPhoto } from "../cutout.js";
import { store, subscribe, saveStyle, saveBoard, addBoard, removeBoard, boardsOf, styleText, logWear, saveLook, itemById } from "../data.js";
import { tintFor } from "./add.js";
import { pinToBase64 } from "../pinterest.js";
import { readBoardPins, analyzePins } from "../stylesync.js";
import { boardHTML, hydrateBoard } from "./board.js";
import { matchStyle } from "../engine.js";

const byId = itemById;
const fmt = (ts) => ts ? new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";
const USES = ["Salir de noche", "Cita", "Eventos y bodas", "Trabajo", "Clase", "Deporte", "Verano", "Invierno"];
const wardrobeFor = (list) => list.map((i) => ({
  id: i.id, name: i.name, type: label(TYPE[i.type]) || i.type, colors: (i.colors || []).map((c) => label(COLOR[c.k]) || c.k),
  pattern: label(PATTERN[i.pattern]), material: i.material || label(MATERIAL[i.materialKey]), fit: label(FIT[i.fit]), formality: i.formality, styleTags: i.styleTags,
}));

let cur = "main"; // tablero que se está viendo (se recuerda al volver a la página)

export function renderStyle(view) {
  let busy = false, allPins = false, pendingUse = "";
  const boards = () => boardsOf(store.style || {});
  // si el tablero aún no ha llegado de la base de datos (recién creado), se muestra vacío con su id
  const curBoard = () => boards().find((b) => b.id === cur) || (cur === "main" ? boards()[0] || { id: "main" } : { id: cur, use: pendingUse || "" });

  function draw() {
    const all = boards(), b = curBoard(), s = b.summary ? b : null;
    const pal = s?.palette || [];
    if (pal.length) viewHalo(view, pal[0].hex, pal[1]?.hex || pal[0].hex); else viewHalo(view, null);
    const isMain = b.id === "main";
    view.innerHTML = `
      <header class="head"><div><h1 class="display">${t("style.title")}</h1><div class="sub">${s ? t("style.from", { src: s.source === "capturas" ? t("style.fromShots") : "Pinterest", date: fmt(s.analyzedAt) }) : t("style.sub")}</div></div></header>
      <div class="scroller board-tabs" role="tablist">
        ${(all.length ? all : [{ id: "main" }]).map((x) => `<button type="button" class="chip" role="tab" data-b="${x.id}" aria-pressed="${x.id === b.id}">${x.id === "main" ? icon("spark") + t("style.mainBoard") : esc(x.use)}</button>`).join("")}
        <button type="button" class="chip ghost" id="addB">${icon("plus")}${t("style.addBoard")}</button>
      </div>
      <section class="card style-src">
        ${isMain ? "" : `<div class="row between"><span class="kicker">${t("style.boardFor", { use: esc(b.use) })}</span><button class="btn sm ghost danger" type="button" id="rmB">${icon("close")}${t("style.removeBoard")}</button></div>`}
        <label class="field"><span>${t(isMain ? "style.board" : "style.boardExtra")}</span>
          <div class="off-link"><input class="input" id="url" type="url" inputmode="url" placeholder="https://pin.it/… o pinterest.com/usuario/tablero" value="${esc(b.boardUrl || "")}"><button class="btn sm primary" type="button" id="go">${icon("spark")}${t(s ? "style.reread" : "style.go")}</button></div></label>
        <p class="hint">${t("style.howLink")}</p>
        <div class="row wrap"><button class="btn sm ghost" type="button" id="shots">${icon("image")}${t("style.shots")}</button></div>
        ${s?.source === "pinterest" ? `<label class="auto-row"><input type="checkbox" id="auto" ${b.autoOff ? "" : "checked"}><span>${t("style.auto")}<small class="muted">${t("style.autoLast", { date: fmt(b.checkedAt || b.analyzedAt) })}</small></span></label>` : ""}
        <p class="status" id="st" aria-live="polite"></p>
      </section>
      ${s ? styleCards(s, isMain) : `<div class="empty"><div class="empty-art">${icon("spark")}</div><h2 class="display">${t(isMain ? "style.emptyTitle" : "style.emptyExtra")}</h2><p>${t(isMain ? "style.emptyBody" : "style.emptyExtraBody", { use: esc(b.use || "") })}</p></div>`}`;
    $("#go", view).onclick = fromBoard;
    $("#url", view).addEventListener("keydown", (e) => { if (e.key === "Enter") fromBoard(); });
    $("#shots", view).onclick = fromShots;
    $("#addB", view).onclick = newBoard;
    const auto = $("#auto", view); if (auto) auto.onchange = () => saveBoard(b.id, { autoOff: !auto.checked }).catch(() => {});
    const rm = $("#rmB", view); if (rm) rm.onclick = () => {
      if (rm.dataset.sure) { removeBoard(b.id).then(() => { cur = "main"; draw(); toast(t("style.removed")); }); return; }
      rm.dataset.sure = 1; rm.lastChild.textContent = t("style.removeSure");
    };
    view.querySelector(".board-tabs").onclick = (e) => { const x = e.target.closest("[data-b]"); if (x && x.dataset.b !== cur) { cur = x.dataset.b; allPins = false; draw(); } };
    if (s) wireCards(s, isMain);
  }

  const setBusy = (on, msg = "") => { busy = on; $("#go", view).disabled = $("#shots", view).disabled = on; say($("#st", view), msg); };

  // nuevo tablero: primero para qué es; después se pega el enlace en su pestaña
  function newBoard() {
    const sh = openSheet(`
      <div class="sheet-head"><h2 class="display">${t("style.newBoard")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
      <p class="muted">${t("style.newBoardBody")}</p>
      <div class="chips">${USES.map((u) => `<button type="button" class="chip" data-u="${esc(u)}">${esc(u)}</button>`).join("")}</div>
      <label class="field"><span>${t("style.useOther")}</span><input class="input" id="use" maxlength="30" placeholder="${t("style.usePh")}"></label>
      <button class="btn primary" type="button" id="ok" disabled>${t("style.createBoard")}</button>`, { label: t("style.newBoard") });
    const inp = $("#use", sh.el), ok = $("#ok", sh.el);
    sh.el.onclick = (e) => {
      if (e.target.closest("[data-close]")) return sh.close();
      const c = e.target.closest("[data-u]"); if (c) { inp.value = c.dataset.u; ok.disabled = false; }
    };
    inp.oninput = () => (ok.disabled = !inp.value.trim());
    ok.onclick = async () => {
      const use = inp.value.trim(); if (!use) return;
      const id = "b" + Date.now().toString(36);
      ok.disabled = true;
      try { pendingUse = use; cur = id; await addBoard({ id, use }); sh.close(); draw(); $("#url", view)?.focus(); }
      catch { ok.disabled = false; toast(t("item.saveFail"), "error"); }
    };
  }

  async function fromBoard() {
    if (busy) return;
    const raw = $("#url", view).value.trim();
    if (!raw) { say($("#st", view), t("style.needUrl"), "error"); return; }
    const id = cur;
    setBusy(true, t("style.reading"));
    try {
      const fresh = await analyzePins(await readBoardPins(raw), { status: (m) => say($("#st", view), m) });
      await saveBoard(id, { ...fresh, ...(id === "main" ? { match: null } : {}) });
      toast(t("style.done", { n: fresh.pinCount }));
      if (id === "main") setTimeout(runMatch, 300);
    } catch (e) { setBusy(false, ""); say($("#st", view), e?.message || t("style.fail"), "error"); return; }
    busy = false;
  }

  async function fromShots() {
    if (busy) return;
    let files;
    try { files = await pickPhotos(12); } catch (e) { if (!isCancel(e)) toast(t("add.cameraFail"), "error"); return; }
    if (!files?.length) return;
    const id = cur;
    setBusy(true, t("style.readingShots", { n: files.length }));
    try {
      const images = await Promise.all(files.map(async (f) => blobToBase64(await shrinkPhoto(f, 1000))));
      const r = await api("/api/style/images", { images, hint: store.style?.notes || "" });
      const thumbs = await Promise.all(files.slice(0, 12).map(async (f) => "data:image/jpeg;base64," + await blobToBase64(await shrinkPhoto(f, 260))));
      await saveBoard(id, { ...r.style, source: "capturas", boardUrl: "", pins: thumbs.map((img) => ({ img, link: null })), pinCount: files.length, pinSig: null, analyzed: files.length, analyzedAt: Date.now(), ...(id === "main" ? { match: null } : {}) });
      toast(t("style.done", { n: files.length }));
      if (id === "main") setTimeout(runMatch, 300);
    } catch (e) { setBusy(false, ""); say($("#st", view), e?.message || t("style.fail"), "error"); return; }
    busy = false;
  }

  async function runMatch() {
    const s = store.style; if (!s?.summary) return;
    const avail = store.items;
    if (!avail.length) return;
    const box = $("#match", view); if (box) box.innerHTML = `<p class="muted">${t("style.matching")}</p>`;
    try {
      let r;
      try { r = await api("/api/style/match", { style: styleText(s, { onlyMain: true }), wardrobe: wardrobeFor(avail) }, { timeout: 30000 }); }
      catch (e) { console.warn("IA no disponible, encaje calculado por la app", e); r = matchStyle({ items: avail, style: s }); }
      await saveStyle({ match: { ...r, at: Date.now(), items: avail.length } });
    } catch (e) { if (box) box.innerHTML = `<p class="status" data-kind="error">${esc(e?.message || t("style.fail"))}</p>`; }
  }

  function styleCards(s, isMain) {
    const m = isMain ? s.match : null;
    const strip = (ids) => ids.map(byId).filter(Boolean).map((it) => `<button type="button" class="mini" data-item="${it.id}" title="${esc(it.name)}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}">` : ""}</button>`).join("");
    const pins = s.pins || [];
    return `
      <section class="style-hero card">
        ${pins.length ? `<div class="mood${allPins ? " all" : ""}">${(allPins ? pins : pins.slice(0, 18)).map((p, i) => `<button type="button" class="pin" data-pin="${i}" aria-label="${t("style.recreate")}"><img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${icon("spark")}</span></button>`).join("")}</div>
          <div class="mood-foot"><span class="muted small">${icon("spark")} ${t("style.tapPin")}</span>${pins.length > 18 ? `<button class="btn sm ghost" type="button" id="morePins">${t(allPins ? "style.lessPins" : "style.allPins", { n: pins.length })}</button>` : ""}</div>` : ""}
        <div class="style-head">
          <span class="kicker">${isMain ? t("style.yours") : t("style.boardFor", { use: esc(s.use) })}</span>
          <h2 class="display">${esc(s.name || t("style.title"))}</h2>
          <p class="lead">${esc(s.summary)}</p>
          <div class="chips">${(s.keywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
        </div>
      </section>
      ${s.mix?.length > 1 ? `<section class="card style-mix"><h2 class="display">${t("style.mix")}</h2>
        ${s.mix.map((x) => `<div class="mix-row"><div class="row between"><b>${esc(x.name)}</b><span class="muted small">${x.share}%</span></div><div class="mix-bar"><i style="width:${x.share}%"></i></div>${x.look ? `<p class="muted small">${esc(x.look)}</p>` : ""}</div>`).join("")}
        <p class="muted small" style="margin:0">${t("style.analyzedOf", { a: Math.min(s.analyzed || s.pinCount, s.pinCount) || "?", n: s.pinCount || "?" })}</p></section>` : ""}
      <div class="cards">
        <section class="card"><h2 class="display">${t("style.palette")}</h2>
          <div class="palette">${(s.palette || []).map((p) => `<div><i style="background:${p.hex}"></i><span>${esc(p.name)}</span></div>`).join("")}</div></section>
        <section class="card"><h2 class="display">${t("style.formulas")}</h2>
          <ul class="how">${(s.formulas || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
        <section class="card"><h2 class="display">${t("style.pieces")}</h2>
          <div class="chips">${(s.keyPieces || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div></section>
        <section class="card"><h2 class="display">${t("style.details")}</h2>
          <dl class="facts">
            ${s.silhouettes ? `<dt>${t("style.silhouettes")}</dt><dd>${esc(s.silhouettes)}</dd>` : ""}
            ${s.fabrics ? `<dt>${t("style.fabrics")}</dt><dd>${esc(s.fabrics)}</dd>` : ""}
            ${s.footwear ? `<dt>${t("style.footwear")}</dt><dd>${esc(s.footwear)}</dd>` : ""}
            ${s.avoid ? `<dt>${t("style.avoid")}</dt><dd>${esc(s.avoid)}</dd>` : ""}
          </dl></section>
        ${isMain ? `<section class="card span2" id="matchCard"><div class="row between"><h2 class="display">${t("style.match")}</h2><button class="btn sm ghost" type="button" id="rematch">${icon("refresh")}${t("style.recalc")}</button></div>
          <div id="match">${m ? `
            <div class="match-row"><div class="ring" style="--p:${m.score}"><b>${m.score}</b><small>/100</small></div><p>${esc(m.note)}</p></div>
            ${m.fits?.length ? `<h3 class="how-title">${t("style.fits")}</h3><div class="look-items">${strip(m.fits)}</div>` : ""}
            ${m.off?.length ? `<h3 class="how-title">${t("style.off")}</h3><div class="look-items">${strip(m.off)}</div>` : ""}
            ${m.items !== store.items.length ? `<p class="muted small">${t("style.stale")}</p>` : ""}`
            : store.items.length ? `<p class="muted">${t("style.matching")}</p>` : `<p class="muted">${t("style.noItems")}</p>`}</div></section>
        <section class="card span2"><h2 class="display">${t("style.notes")}</h2>
          <p class="muted small" style="margin:0">${t("style.notesHint")} ${t("style.notesReread")}</p>
          <textarea class="input" id="notes" rows="3" maxlength="500" placeholder="${t("style.notesPh")}">${esc(store.style?.notes || "")}</textarea></section>` : ""}
      </div>`;
  }

  function wireCards(s, isMain) {
    const more = $("#morePins", view); if (more) more.onclick = () => { allPins = !allPins; draw(); };
    view.querySelector(".mood")?.addEventListener("click", (e) => { const p = e.target.closest("[data-pin]"); if (p) recreatePin(s, +p.dataset.pin); });
    if (isMain) {
      $("#rematch", view).onclick = runMatch;
      let timer;
      $("#notes", view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => saveStyle({ notes: e.target.value.trim() }).catch(() => {}), 700); };
      if (!s.match && store.items.length) runMatch();
    }
    view.onclick = async (e) => { const m = e.target.closest(".look-items [data-item]"); if (m) (await import("./item.js")).openItem(m.dataset.item); };
  }

  draw();
  // redibujar solo cuando cambia el estilo (no al escribir notas)
  const sigOf = () => JSON.stringify({ ...store.style, notes: 0, updatedAt: 0 });
  let sig = sigOf();
  return subscribe(() => {
    const now = sigOf();
    if (now !== sig && !busy) { sig = now; const y = view.scrollTop || scrollY; draw(); view.scrollTop = y; scrollTo(0, y); /* en el móvil se desplaza #view, no la ventana */ }
    else if (now !== sig) sig = now;
  });
}

/* ---------- «Recréame este pin»: el look del pin con tu ropa ---------- */
const recreated = new Map(); // resultados de esta sesión, por foto del pin

async function pinImage(src) {
  if (src.startsWith("data:")) return { image: src.split(",")[1] };
  try { return { image: await pinToBase64(src, 900) }; } // el móvil la descarga (si el navegador lo permite)
  catch { return { url: src }; } // si no, la descarga el servidor
}

function recreatePin(s, i) {
  const pin = s.pins?.[i]; if (!pin) return;
  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("style.recreateTitle")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="recreate">
      <figure class="rc-pin"><img src="${esc(pin.img)}" alt="" referrerpolicy="no-referrer">${pin.link ? `<a class="btn sm ghost" href="${esc(pin.link)}" target="_blank" rel="noopener">${t("style.openPin")}</a>` : ""}</figure>
      <div class="rc-out" id="out"><div class="card thinking"><div class="bar indet"><i></i></div><p>${t("style.recreating")}</p></div></div>
    </div>`, { label: t("style.recreateTitle"), wide: true });
  sh.el.onclick = (e) => { if (e.target.closest("[data-close]")) sh.close(); };
  const out = $("#out", sh.el);

  const show = (r) => {
    const items = r.itemIds.map(byId).filter(Boolean);
    out.innerHTML = `
      ${items.length >= 1 ? `<div class="rc-board">${boardHTML(r.itemIds)}</div>` : ""}
      <div class="rc-info">
        <div class="row between"><h3 class="display">${esc(r.title)}</h3><span class="pill">${t("style.likeness", { n: r.likeness })}</span></div>
        ${r.look?.length ? `<p class="muted small">${t("style.inPin")} ${esc(r.look.join(" · "))}</p>` : ""}
        <p>${esc(r.why)}</p>
        ${r.how?.length ? `<h3 class="how-title">${t("today.how")}</h3><ol class="how">${r.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
        ${r.missing?.length ? `<h3 class="how-title">${t("style.toNail")}</h3><ul class="rc-missing">${r.missing.map((m) => `<li><b>${esc(m.piece)}</b><span class="muted small">${esc(m.why)}</span></li>`).join("")}</ul>` : `<p class="notice">${icon("check")} ${t("style.nothingMissing")}</p>`}
        <div class="row wrap">
          ${items.length >= 2 ? `<button class="btn sm primary" type="button" id="wear">${icon("check")}${t("today.wear")}</button>` : ""}
          ${items.length >= 2 ? `<button class="btn sm" type="button" id="keep">${icon("bookmark")}${t("looks.save")}</button>` : ""}
          <button class="btn sm ghost" type="button" id="again">${icon("refresh")}${t("style.recreateAgain")}</button>
        </div>
      </div>`;
    hydrateBoard(out);
    const w = $("#wear", out);
    if (w) w.onclick = async () => {
      w.disabled = true;
      try { await logWear({ itemIds: r.itemIds, title: r.title, plan: t("style.fromPin"), how: r.how || [], weather: null }); toast(t("today.wornSaved")); }
      catch { w.disabled = false; toast(t("item.saveFail"), "error"); }
    };
    $("#again", out).onclick = () => { recreated.delete(pin.img); run(); };
    const k = $("#keep", out);
    if (k) k.onclick = async () => { k.disabled = true; try { await saveLook({ title: r.title, itemIds: r.itemIds, how: r.how || [], note: t("style.fromPin"), source: "pin", pin: pin.img }); toast(t("looks.savedToast")); } catch { k.disabled = false; toast(t("item.saveFail"), "error"); } };
  };

  async function run() {
    const avail = store.items.filter((x) => x.status === "disponible");
    if (avail.length < 2) { out.innerHTML = `<p class="muted">${t("today.needItems")}</p>`; return; }
    out.innerHTML = `<div class="card thinking"><div class="bar indet"><i></i></div><p>${t("style.recreating")}</p></div>`;
    try {
      const r = await api("/api/style/recreate", { ...(await pinImage(pin.img)), wardrobe: wardrobeFor(avail), style: styleText(s, { onlyMain: true }) });
      recreated.set(pin.img, r); show(r);
    } catch (e) { out.innerHTML = `<p class="status" data-kind="error">${esc(e?.message || t("style.fail"))}</p><button class="btn sm" type="button" id="retry">${t("common.retry")}</button>`; $("#retry", out).onclick = run; }
  }
  recreated.has(pin.img) ? show(recreated.get(pin.img)) : run();
}
