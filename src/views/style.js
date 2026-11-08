// Mi estilo: lee tu tablero de Pinterest (o capturas) y saca el estilo que buscas. Se usa en outfits, maleta y compras.
import { t } from "../i18n.js";
import { TYPE, COLOR, PATTERN, label } from "../catalog.js";
import { $, esc, icon, toast, say, setHalo, pickPhotos, isCancel } from "../ui.js";
import { api, blobToBase64 } from "../api.js";
import { shrinkPhoto } from "../cutout.js";
import { store, subscribe, saveStyle, styleText } from "../data.js";
import { tintFor } from "./add.js";

const byId = (id) => store.items.find((i) => i.id === id);
const fmt = (ts) => ts ? new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";

export function renderStyle(view) {
  let busy = false;
  function draw() {
    const s = store.style?.summary ? store.style : null;
    const pal = s?.palette || [];
    if (pal.length) setHalo(pal[0].hex, pal[1]?.hex || pal[0].hex);
    view.innerHTML = `
      <header class="head"><div><h1 class="display">${t("style.title")}</h1><div class="sub">${s ? t("style.from", { src: s.source === "capturas" ? t("style.fromShots") : "Pinterest", date: fmt(s.analyzedAt) }) : t("style.sub")}</div></div></header>
      <section class="card style-src">
        <label class="field"><span>${t("style.board")}</span>
          <div class="off-link"><input class="input" id="url" type="url" inputmode="url" placeholder="https://pin.it/… o pinterest.com/usuario/tablero" value="${esc(s?.boardUrl || "")}"><button class="btn sm primary" type="button" id="go">${icon("spark")}${t(s ? "style.reread" : "style.go")}</button></div></label>
        <p class="hint">${t("style.howLink")}</p>
        <div class="row wrap"><button class="btn sm ghost" type="button" id="shots">${icon("image")}${t("style.shots")}</button></div>
        <p class="status" id="st" aria-live="polite"></p>
      </section>
      ${s ? styleCards(s) : `<div class="empty"><div class="empty-art">${icon("spark")}</div><h2 class="display">${t("style.emptyTitle")}</h2><p>${t("style.emptyBody")}</p></div>`}`;
    $("#go", view).onclick = fromBoard;
    $("#url", view).addEventListener("keydown", (e) => { if (e.key === "Enter") fromBoard(); });
    $("#shots", view).onclick = fromShots;
    if (s) wireCards(s);
  }

  const setBusy = (on, msg = "") => { busy = on; $("#go", view).disabled = $("#shots", view).disabled = on; say($("#st", view), msg); };

  async function fromBoard() {
    if (busy) return;
    const url = $("#url", view).value.trim();
    if (!url) { say($("#st", view), t("style.needUrl"), "error"); return; }
    setBusy(true, t("style.reading"));
    try {
      const r = await api("/api/style/pinterest", { url });
      await saveStyle({ ...r.style, notes: store.style?.notes || "", source: "pinterest", boardUrl: r.board || url, pins: r.pins, pinCount: r.pinCount, analyzed: r.analyzed, analyzedAt: Date.now(), match: null });
      toast(t("style.done", { n: r.pinCount }));
      setTimeout(runMatch, 300);
    } catch (e) { setBusy(false, ""); say($("#st", view), e?.message || t("style.fail"), "error"); return; }
    busy = false;
  }

  async function fromShots() {
    if (busy) return;
    let files;
    try { files = await pickPhotos(12); } catch (e) { if (!isCancel(e)) toast(t("add.cameraFail"), "error"); return; }
    if (!files?.length) return;
    setBusy(true, t("style.readingShots", { n: files.length }));
    try {
      const images = await Promise.all(files.map(async (f) => blobToBase64(await shrinkPhoto(f, 1000))));
      const r = await api("/api/style/images", { images });
      const thumbs = await Promise.all(files.slice(0, 12).map(async (f) => "data:image/jpeg;base64," + await blobToBase64(await shrinkPhoto(f, 300))));
      await saveStyle({ ...r.style, notes: store.style?.notes || "", source: "capturas", boardUrl: "", pins: thumbs.map((img) => ({ img, link: null })), pinCount: files.length, analyzed: files.length, analyzedAt: Date.now(), match: null });
      toast(t("style.done", { n: files.length }));
      setTimeout(runMatch, 300);
    } catch (e) { setBusy(false, ""); say($("#st", view), e?.message || t("style.fail"), "error"); return; }
    busy = false;
  }

  async function runMatch() {
    const s = store.style; if (!s?.summary) return;
    const avail = store.items;
    if (!avail.length) return;
    const box = $("#match", view); if (box) box.innerHTML = `<p class="muted">${t("style.matching")}</p>`;
    try {
      const r = await api("/api/style/match", {
        style: styleText(s),
        wardrobe: avail.map((i) => ({ id: i.id, name: i.name, type: label(TYPE[i.type]) || i.type, colors: (i.colors || []).map((c) => label(COLOR[c.k]) || c.k), pattern: label(PATTERN[i.pattern]), material: i.material, formality: i.formality, styleTags: i.styleTags })),
      });
      await saveStyle({ match: { ...r, at: Date.now(), items: avail.length } });
    } catch (e) { if (box) box.innerHTML = `<p class="status" data-kind="error">${esc(e?.message || t("style.fail"))}</p>`; }
  }

  function styleCards(s) {
    const m = s.match;
    const strip = (ids) => ids.map(byId).filter(Boolean).map((it) => `<button type="button" class="mini" data-item="${it.id}" title="${esc(it.name)}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}">` : ""}</button>`).join("");
    return `
      <section class="style-hero card">
        ${s.pins?.length ? `<div class="mood">${s.pins.slice(0, 18).map((p) => `<a ${p.link ? `href="${esc(p.link)}" target="_blank" rel="noopener"` : ""}><img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>` : ""}
        <div class="style-head">
          <span class="kicker">${t("style.yours")}</span>
          <h2 class="display">${esc(s.name || t("style.title"))}</h2>
          <p class="lead">${esc(s.summary)}</p>
          <div class="chips">${(s.keywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
        </div>
      </section>
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
        <section class="card span2" id="matchCard"><div class="row between"><h2 class="display">${t("style.match")}</h2><button class="btn sm ghost" type="button" id="rematch">${icon("refresh")}${t("style.recalc")}</button></div>
          <div id="match">${m ? `
            <div class="match-row"><div class="ring" style="--p:${m.score}"><b>${m.score}</b><small>/100</small></div><p>${esc(m.note)}</p></div>
            ${m.fits?.length ? `<h3 class="how-title">${t("style.fits")}</h3><div class="look-items">${strip(m.fits)}</div>` : ""}
            ${m.off?.length ? `<h3 class="how-title">${t("style.off")}</h3><div class="look-items">${strip(m.off)}</div>` : ""}
            ${m.items !== store.items.length ? `<p class="muted small">${t("style.stale")}</p>` : ""}`
            : store.items.length ? `<p class="muted">${t("style.matching")}</p>` : `<p class="muted">${t("style.noItems")}</p>`}</div></section>
        <section class="card span2"><h2 class="display">${t("style.notes")}</h2>
          <p class="muted small" style="margin:0">${t("style.notesHint")}</p>
          <textarea class="input" id="notes" rows="3" maxlength="500" placeholder="${t("style.notesPh")}">${esc(s.notes || "")}</textarea></section>
      </div>`;
  }

  function wireCards(s) {
    $("#rematch", view).onclick = runMatch;
    let timer;
    $("#notes", view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => saveStyle({ notes: e.target.value.trim() }).catch(() => {}), 700); };
    view.onclick = async (e) => { const m = e.target.closest("[data-item]"); if (m) (await import("./item.js")).openItem(m.dataset.item); };
    if (!s.match && store.items.length) runMatch();
  }

  draw();
  // redibujar solo cuando cambia el estilo (no al escribir notas)
  let sig = JSON.stringify({ ...store.style, notes: 0, updatedAt: 0 });
  return subscribe(() => {
    const now = JSON.stringify({ ...store.style, notes: 0, updatedAt: 0 });
    if (now !== sig && !busy) { sig = now; const y = scrollY; draw(); scrollTo(0, y); }
  });
}
