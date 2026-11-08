// Hoy: plan del día + tiempo → outfits con tu ropa, cómo llevarlos y el maniquí vestido.
// También el calendario de estilo (lo que te pones cada día, prendas sin estrenar) y la maleta.
import { t } from "../i18n.js";
import { TYPE, COLOR, PATTERN, MATERIAL, FIT, label } from "../catalog.js";
import { $, $$, esc, icon, openSheet, toast, say, setHalo } from "../ui.js";
import { api } from "../api.js";
import {
  store, subscribe, saveProfile, logWear, styleText, deleteWear, saveFeedback, saveToday, saveTrip, deleteTrip, todayKey,
  saveLook, deleteLook, lookSaved, reviewWear, itemWashLimit, isDryClean,
} from "../data.js";
import { todayWeather, weatherText, describe, tripWeather } from "../weather.js";
import { searchCity } from "../places.js";
import { openItem } from "./item.js";
import { tintFor } from "./add.js";
import { pickItems } from "./picker.js";
import { boardHTML, hydrateBoard, boardTools, wireBoardEdit } from "./board.js";
import { suggestOutfits, packTrip } from "../engine.js";
import { canCalendar, canVoice, planFromCalendar, planByVoice } from "../native.js";

/** «ia» (Gemini; si falla, la app) o «app» (solo el motor propio, al instante). */
export const engineMode = () => store.profile?.engine === "app" ? "app" : "ia";

const state = { tab: "hoy", sel: 0, month: null, trip: null };
const HALO = { sun: ["#f3c26b", "#f2a476"], cloudsun: ["#e9cf98", "#b9c6d6"], cloud: ["#b9c2cd", "#d3d6db"], rain: ["#7fa2c8", "#9cb2c9"], snow: ["#dde6f2", "#c5d3e6"], storm: ["#6f7b9a", "#8d88a8"], fog: ["#c7ccd2", "#d9dadc"] };
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const since = (ts) => { const n = Math.max(0, Math.round((Date.now() - (ts || Date.now())) / 864e5)); return n === 0 ? t("cal.today") : n === 1 ? t("cal.yesterday") : t("cal.since", { n }); };
const fmtDate = (d, o) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", o);
const byId = (id) => store.items.find((i) => i.id === id);

export function renderToday(view) {
  view.innerHTML = `
    <header class="head"><div><h1 class="display">${t("today.title")}</h1><div class="sub">${fmtDate(todayKey(), { weekday: "long", day: "numeric", month: "long" })}</div></div></header>
    <div class="seg tabs" role="tablist">${["hoy", "outfits", "calendario", "maleta"].map((k) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${state.tab === k}">${icon({ hoy: "sun", outfits: "bookmark", calendario: "calendar", maleta: "bag" }[k])}<span>${t("today.tab." + k)}</span></button>`).join("")}</div>
    <div id="tab"></div>`;
  let cleanupTab = null;
  const show = () => {
    cleanupTab?.(); setHalo(null);
    $$(".tabs button", view).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === state.tab)));
    const box = $("#tab", view);
    cleanupTab = { hoy: tabToday, outfits: tabLooks, calendario: tabCalendar, maleta: tabTrip }[state.tab](box) || null;
  };
  $(".tabs", view).onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) { state.tab = b.dataset.tab; show(); } };
  view.addEventListener("click", (e) => { const m = e.target.closest("[data-item]"); if (m) openItem(m.dataset.item); });
  show();
  return () => cleanupTab?.();
}

/* =================== REVISIÓN DE LA ROPA (al día siguiente) =================== */
// Lo que te pusiste ayer (o hace poco): ¿va a lavar, a la tintorería o sigue limpio?
function drawWashCheck(host, today) {
  if (!host || store.profile?.washCheck === false) return;
  const wear = store.wear.find((w) => w.date < today && !w.reviewed && (Date.parse(today) - Date.parse(w.date)) / 864e5 <= 3);
  const sig = wear ? wear.date + (wear.itemIds || []).join() : "";
  if (host.dataset.sig === sig) return; // no rehacer mientras eliges
  host.dataset.sig = sig;
  if (!wear) { host.innerHTML = ""; return; }
  const items = (wear.itemIds || []).map(byId).filter((it) => it && it.status === "disponible" && !["complementos", "calzado"].includes(TYPE[it.type]?.g));
  if (!items.length) { reviewWear(wear.date, {}).catch(() => {}); return; }
  const dec = {};
  for (const it of items) {
    const lim = itemWashLimit(it), n = it.wearsSinceWash || 0;
    dec[it.id] = lim && n >= lim ? (isDryClean(it) ? "tintoreria" : "sucia") : "limpia";
  }
  const when = (Date.parse(today) - Date.parse(wear.date)) / 864e5 === 1 ? t("washc.yesterday") : fmtDate(wear.date, { weekday: "long" });
  const draw = () => {
    host.innerHTML = `<section class="card wash-check">
      <div class="row between"><h2 class="display">${icon("wash")}${t("washc.title", { when })}</h2><button class="btn sm ghost" type="button" id="wcSkip">${t("washc.skip")}</button></div>
      <p class="muted small" style="margin:0">${t("washc.sub")}</p>
      <div class="wc-list">${items.map((it) => {
        const lim = itemWashLimit(it), dry = isDryClean(it);
        return `<div class="wc-row">
          <span class="mini" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="">` : ""}</span>
          <div class="grow"><b>${esc(it.name)}</b><small class="muted">${lim ? t("washc.uses", { n: it.wearsSinceWash || 0, max: lim }) : t("washc.usesFree", { n: it.wearsSinceWash || 0 })}</small></div>
          <div class="seg wc-seg" data-id="${it.id}">
            <button type="button" data-d="limpia" aria-pressed="${dec[it.id] === "limpia"}">${t("washc.clean")}</button>
            <button type="button" data-d="${dry ? "tintoreria" : "sucia"}" aria-pressed="${dec[it.id] !== "limpia"}">${t(dry ? "washc.dry" : "washc.wash")}</button>
          </div></div>`;
      }).join("")}</div>
      <button class="btn primary" type="button" id="wcOk">${icon("check")}${t("washc.ok")}</button>
    </section>`;
    host.querySelector(".wc-list").onclick = (e) => {
      const b = e.target.closest("[data-d]"); if (!b) return;
      const seg = b.closest("[data-id]"); dec[seg.dataset.id] = b.dataset.d;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
    $("#wcOk", host).onclick = async () => {
      try { await reviewWear(wear.date, dec); const n = Object.values(dec).filter((d) => d !== "limpia").length; toast(n ? t("washc.done", { n }) : t("washc.allClean")); host.innerHTML = ""; }
      catch { toast(t("item.saveFail"), "error"); }
    };
    $("#wcSkip", host).onclick = async () => { try { await reviewWear(wear.date, {}); host.innerHTML = ""; } catch {} };
  };
  draw();
}

/* =================== MIS OUTFITS (guardados y hechos a mano) =================== */
function tabLooks(box) {
  function draw() {
    const looks = store.looks.map((l) => ({ ...l, itemIds: l.itemIds.filter(byId) })).filter((l) => l.itemIds.length);
    box.innerHTML = `
      <section class="card looks-head">
        <div class="grow"><h2 class="display">${t("looks.title")}</h2><p class="muted small" style="margin:0">${t("looks.sub")}</p></div>
        <button class="btn primary" type="button" id="newLook">${icon("plus")}${t("looks.create")}</button>
      </section>
      ${looks.length ? `<div class="looks-grid">${looks.map((l) => `
        <article class="card look-card" data-l="${l.id}">
          ${boardHTML(l.itemIds, { small: true })}
          <div class="row between"><b>${esc(l.title || t("looks.untitled"))}</b>${l.source === "mano" ? `<span class="pill soft">${t("looks.byYou")}</span>` : ""}</div>
        </article>`).join("")}</div>`
      : `<div class="empty"><div class="empty-art">${icon("bookmark")}</div><h2 class="display">${t("looks.emptyTitle")}</h2><p>${t("looks.emptyBody")}</p></div>`}`;
    $("#newLook", box).onclick = () => editLook();
    box.querySelectorAll("[data-l]").forEach((c) => (c.onclick = (e) => { if (!e.target.closest("[data-item]")) openLook(c.dataset.l); }));
    box.querySelectorAll(".look-card .bd-item").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openLook(b.closest("[data-l]").dataset.l); }));
  }
  draw();
  return subscribe(() => { if (!box.querySelector(".board.editing")) draw(); });
}
/** Crear o cambiar las prendas de un outfit propio. */
async function editLook(look = null) {
  const ids = await pickItems(look?.itemIds || [], { title: t(look ? "looks.editItems" : "looks.pick") });
  if (!ids?.length) return;
  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${t(look ? "looks.editTitle" : "looks.nameIt")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="look-preview">${boardHTML(ids)}</div>
    <label class="field"><span>${t("looks.name")}</span><input class="input" id="lt" maxlength="60" placeholder="${t("looks.namePh")}" value="${esc(look?.title || "")}"></label>
    <label class="field"><span>${t("looks.note")}</span><input class="input" id="ln" maxlength="200" placeholder="${t("looks.notePh")}" value="${esc(look?.note || "")}"></label>
    <div class="sheet-foot"><button class="btn" type="button" data-close>${t("common.cancel")}</button><button class="btn primary" type="button" id="ok">${icon("bookmark")}${t("looks.saveIt")}</button></div>`, { label: t("looks.create") });
  hydrateBoard(sh.el);
  sh.el.onclick = async (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    if (!e.target.closest("#ok")) return;
    try { await saveLook({ title: $("#lt", sh.el).value.trim() || t("looks.untitled"), note: $("#ln", sh.el).value.trim(), itemIds: ids, source: look?.source || "mano" }, look?.id); sh.close(); toast(t("looks.savedToast")); }
    catch { toast(t("item.saveFail"), "error"); }
  };
}
function openLook(id) {
  const l = store.looks.find((x) => x.id === id); if (!l) return;
  const ids = l.itemIds.filter(byId);
  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${esc(l.title || t("looks.untitled"))}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="look-stage" id="ls">${boardHTML(ids)}${boardTools()}</div>
    ${l.note ? `<p class="muted">${esc(l.note)}</p>` : ""}
    ${l.how?.length ? `<ol class="how">${l.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
    <div class="row wrap">
      <button class="btn sm primary" type="button" id="w">${icon("check")}${t("today.wear")}</button>
      <button class="btn sm" type="button" id="e">${icon("edit")}${t("looks.editItems")}</button>
      <button class="btn sm ghost danger" type="button" id="d">${icon("trash")}${t("looks.delete")}</button>
    </div>`, { label: l.title, wide: true });
  hydrateBoard(sh.el);
  wireBoardEdit($("#ls", sh.el), () => toast(t("board.saved")));
  sh.el.onclick = async (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    if (e.target.closest("#w")) { try { await logWear({ itemIds: ids, title: l.title, plan: "", how: l.how || [] }); toast(t("today.wornSaved")); } catch { toast(t("item.saveFail"), "error"); } }
    if (e.target.closest("#e")) { sh.close(); editLook(l); }
    const d = e.target.closest("#d");
    if (d) { if (!d.dataset.sure) { d.dataset.sure = 1; d.lastChild.textContent = t("looks.deleteSure"); return; } await deleteLook(l.id); sh.close(); toast(t("looks.removed")); }
  };
}

/* =================== HOY =================== */
function tabToday(box) {
  const today = todayKey();
  box.innerHTML = `
    <div id="washCheck"></div>
    <div class="today-grid">
      <section class="wx card" id="wx"><p class="muted">${t("today.wx.loading")}</p></section>
      <section class="card plan">
        <label class="field"><span class="row between">${t("today.plan")}<span class="plan-tools">${canCalendar() ? `<button class="btn sm ghost" type="button" id="cal">${icon("calendar")}${t("today.fromCal")}</button>` : ""}${canVoice() ? `<button class="btn sm icon ghost" type="button" id="mic" aria-label="${t("today.voice")}">${icon("mic")}</button>` : ""}</span></span><textarea id="plan" rows="2" maxlength="300" placeholder="${t("today.planPh")}"></textarea></label>
        <div class="chips" id="quick">${t("today.quick").split("|").map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <div class="engine-row"><span class="muted small">${t("engine.label")}</span><div class="seg engine-seg" id="engine">${["ia", "app"].map((k) => `<button type="button" data-e="${k}" aria-pressed="${engineMode() === k}">${t("engine." + k)}</button>`).join("")}</div></div>
        <button class="btn primary block" type="button" id="go">${icon("spark")}${t("today.go")}</button>
        <p class="status" id="st" aria-live="polite"></p>
        ${store.style?.summary ? `<a class="style-chip" href="#/estilo">${icon("spark")}${t("today.styleOn", { name: esc(store.style.name || t("style.title")) })}</a>` : `<a class="style-chip off" href="#/estilo">${icon("pin")}${t("today.styleOff")}</a>`}
      </section>
    </div>
    <div id="result"></div>`;
  drawWashCheck($("#washCheck", box), today);
  const planEl = $("#plan", box);
  const addPlan = (txt) => { if (txt) planEl.value = planEl.value.trim() ? `${planEl.value.trim()}. ${txt}` : txt; };
  const calB = $("#cal", box), micB = $("#mic", box);
  if (calB) calB.onclick = async () => {
    calB.disabled = true;
    try { const p = await planFromCalendar(); if (p) { addPlan(p); toast(t("today.calDone")); } else toast(t("today.calEmpty")); }
    catch (e) { toast(e?.message || t("today.calFail"), "error"); }
    calB.disabled = false;
  };
  if (micB) micB.onclick = async () => {
    micB.disabled = true; micB.classList.add("on");
    try { addPlan(await planByVoice()); } catch (e) { toast(e?.message || t("today.voiceFail"), "error"); }
    micB.disabled = false; micB.classList.remove("on");
  };
  $("#engine", box).onclick = (e) => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    store.profile.engine = b.dataset.e; saveProfile({ engine: b.dataset.e }).catch(() => {});
    $$("#engine button", box).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    say($("#st", box), t(b.dataset.e === "app" ? "engine.appHint" : "engine.iaHint"));
  };
  const saved = store.today?.date === today ? store.today : null;
  planEl.value = saved?.plan || "";
  $("#quick", box).onclick = (e) => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    planEl.value = planEl.value.trim() ? `${planEl.value.trim()}, ${b.dataset.q.toLowerCase()}` : b.dataset.q; planEl.focus();
  };

  // --- tiempo ---
  let wx = null, place = null;
  async function loadWeather() {
    const p = store.profile;
    place = p.places.find((x) => x.id === p.activePlace) || p.places[0];
    const el = $("#wx", box); if (!el) return;
    try {
      wx = await todayWeather(place);
      const d = describe(wx.code), [a, b] = HALO[d.icon] || HALO.cloud; setHalo(a, b);
      el.innerHTML = `
        <button type="button" class="wx-place" id="place">${icon("pin")}<span>${esc(place.name)}</span>${icon("chevron")}</button>
        <div class="wx-main">${icon(d.icon, "wx-ic")}<span class="wx-t">${wx.now.t}°</span>
          <div><b>${d.text}</b><small>${t("today.wx.line", { max: wx.max, min: wx.min, feels: wx.now.feels })}</small>
          <small>${icon("drop")} ${wx.rain}% · ${icon("wind")} ${wx.wind} km/h</small></div></div>
        <div class="wx-hours">${wx.hours.map((h) => `<div><small>${h.h}h</small>${icon(describe(h.code).icon)}<b>${h.t}°</b>${h.rain >= 30 ? `<small class="rain">${h.rain}%</small>` : ""}</div>`).join("")}</div>`;
    } catch (e) {
      console.warn(e);
      el.innerHTML = `<button type="button" class="wx-place" id="place">${icon("pin")}<span>${esc(place?.name || "")}</span>${icon("chevron")}</button><p class="status" data-kind="error">${t("today.wx.fail")}</p>`;
    }
    $("#place", el).onclick = choosePlace;
  }
  function choosePlace() {
    const p = store.profile;
    const sh = openSheet(`<div class="sheet-head"><h2 class="display">${t("profile.places")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
      <div class="places">${p.places.map((pl) => `<button type="button" class="place ${pl.id === p.activePlace ? "active" : ""}" data-p="${pl.id}">${icon(pl.id === "gps" ? "gps" : "pin")}<div class="grow"><b>${esc(pl.name)}</b><small>${esc(pl.region || "")}</small></div></button>`).join("")}</div>
      <p class="muted small">${t("today.placesHint")}</p>`, { label: t("profile.places") });
    sh.el.onclick = async (e) => {
      if (e.target.closest("[data-close]")) return sh.close();
      const b = e.target.closest("[data-p]"); if (!b) return;
      sh.close(); await saveProfile({ activePlace: b.dataset.p }).catch(() => {}); store.profile.activePlace = b.dataset.p; loadWeather();
    };
  }
  loadWeather();

  // --- propuestas ---
  const result = $("#result", box);
  const outfitsNow = () => {
    const td = store.today?.date === today ? store.today : null;
    return (td?.outfits || []).map((o) => ({ ...o, itemIds: o.itemIds.filter(byId) })).filter((o) => o.itemIds.length >= 2);
  };

  async function generate(more = false) {
    const st = $("#st", box);
    const avail = store.items.filter((i) => i.status === "disponible");
    if (avail.length < 2) { say(st, t("today.needItems"), "error"); return; }
    const plan = planEl.value.trim() || t("today.defaultPlan");
    $("#go", box).disabled = true; say(st, t("today.thinking"));
    if (!more) result.innerHTML = `<div class="card thinking"><div class="bar indet"><i></i></div><p>${t("today.thinking")}</p></div>`;
    const wardrobe = avail.map((i) => ({
      id: i.id, name: i.name, type: label(TYPE[i.type]) || i.type, colors: (i.colors || []).map((c) => label(COLOR[c.k]) || c.k),
      pattern: label(PATTERN[i.pattern]), material: i.material || label(MATERIAL[i.materialKey]), fit: label(FIT[i.fit]),
      formality: i.formality, seasons: i.seasons, styleTags: i.styleTags, wears: i.wearCount || 0,
    }));
    const names = (ids) => ids.map(byId).filter(Boolean).map((i) => i.name);
    const since = new Date(); since.setDate(since.getDate() - 7);
    const payload = {
      wardrobe, plan, weather: wx ? weatherText(wx, place.name) : null,
      style: styleText(store.style),
      likes: store.feedback.filter((f) => f.liked).slice(0, 10).map((f) => names(f.itemIds)),
      dislikes: store.feedback.filter((f) => !f.liked).slice(0, 10).map((f) => names(f.itemIds)),
      recent: store.wear.filter((w) => w.date >= todayKey(since) && w.date < today).map((w) => ({ date: w.date, itemIds: w.itemIds })),
      exclude: more ? outfitsNow().map((o) => o.itemIds) : [],
      count: 4,
    };
    const local = () => suggestOutfits({
      items: avail, weather: wx, plan, style: store.style, wear: store.wear, feedback: store.feedback,
      exclude: payload.exclude, count: 4,
    });
    try {
      let r, note = "";
      if (engineMode() === "app") r = local();
      else {
        try { r = await api("/api/outfits", payload, { timeout: 30000 }); }
        catch (e) { console.warn("IA no disponible, uso el motor de la app", e); r = local(); note = t("engine.fallback"); }
      }
      if (!r.outfits?.length) throw { message: r.missing || t("today.fail") };
      const outfits = more ? [...outfitsNow(), ...r.outfits] : r.outfits;
      state.sel = more ? outfitsNow().length : 0;
      await saveToday({ date: today, plan: planEl.value.trim(), placeId: place?.id || null, weather: wx ? { t: wx.now.t, min: wx.min, max: wx.max, code: wx.code } : null, outfits, missing: r.missing || null });
      say(st, note);
    } catch (e) { say(st, e?.message || t("today.fail"), "error"); if (!more) result.innerHTML = ""; }
    $("#go", box).disabled = false;
  }
  $("#go", box).onclick = () => generate(false);

  function drawResult() {
    const outfits = outfitsNow();
    if (!outfits.length) {
      if (!result.querySelector(".thinking")) result.innerHTML = store.items.length < 2 ? `<div class="card"><p class="muted">${t("today.needItems")}</p></div>` : "";
      shown = ""; return;
    }
    state.sel = Math.min(state.sel, outfits.length - 1);
    const o = outfits[state.sel], worn = store.wear.find((w) => w.date === today);
    const key = o.itemIds.slice().sort().join("_"), fb = store.feedback.find((f) => f.id === key);
    const isWorn = worn && worn.itemIds.slice().sort().join("_") === key;
    if (!result.querySelector(".look")) {
      result.innerHTML = `
        <div class="opts-head"><h2 class="display">${t("today.pick")}</h2><span class="muted small" id="optsN"></span></div>
        <div class="scroller opts" id="opts"></div>
        <section class="look card">
          <div class="look-stage"><div id="stage"></div>${boardTools()}</div>
          <div class="look-info" id="info"></div>
        </section>`;
    }
    const td = store.today;
    // las opciones, en miniatura, para elegir de un vistazo
    const optsSig = outfits.map((x) => x.itemIds.join()).join("|") + "#" + state.sel + JSON.stringify(store.layouts || {}).length;
    const opts = $("#opts", result);
    if (opts.dataset.sig !== optsSig) {
      opts.dataset.sig = optsSig;
      opts.innerHTML = outfits.map((x, i) => `<div class="opt" role="button" tabindex="0" data-o="${i}" aria-pressed="${i === state.sel}" aria-label="${i + 1}. ${esc(x.title)}">
          ${boardHTML(x.itemIds, { small: true })}<span><b>${i + 1}</b> ${esc(x.title)}</span></div>`).join("")
        + `<button type="button" class="opt opt-more" id="more">${icon("refresh")}<span>${t("today.more")}</span></button>`;
      $("#optsN", result).textContent = t("today.options", { n: outfits.length });
      opts.onclick = async (e) => {
        const c = e.target.closest("[data-o]");
        if (c) { state.sel = +c.dataset.o; drawResult(); $("#stage", result)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
        const m = e.target.closest("#more"); if (m) { m.disabled = true; await generate(true); }
      };
      opts.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset?.o) { e.preventDefault(); e.target.click(); } };
    }
    $("#info", result).innerHTML = `
      ${worn ? `<p class="worn-note">${icon("check")} ${t("today.wornToday", { title: esc(worn.title || t("today.yourOutfit")) })}</p>` : ""}
      <span class="kicker">${t("today.optionN", { n: state.sel + 1, total: outfits.length })}${o.engine ? ` · ${t("engine.byApp")}` : ""}</span>
      <h2 class="display">${esc(o.title)}</h2>
      <p class="why">${esc(o.why)}</p>
      ${o.how?.length ? `<h3 class="how-title">${t("today.how")}</h3><ol class="how">${o.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
      ${o.extras?.length ? `<h3 class="how-title">${t("today.extras")}</h3><div class="chips">${o.extras.map((x) => `<span class="chip">${icon("bag")}${esc(x)}</span>`).join("")}</div>` : ""}
      ${o.repeats?.length ? `<p class="muted small">${t("today.repeats", { names: esc(o.repeats.map(byId).filter(Boolean).map((i) => i.name).join(", ")) })}</p>` : ""}
      <div class="row wrap look-actions">
        <button class="btn sm ${fb?.liked === true ? "on" : ""}" type="button" id="like" aria-pressed="${fb?.liked === true}">${icon("up")}${t("today.like")}</button>
        <button class="btn sm ${fb?.liked === false ? "on" : ""}" type="button" id="dislike" aria-pressed="${fb?.liked === false}">${icon("down")}${t("today.dislike")}</button>
        <button class="btn sm ${lookSaved(o.itemIds) ? "on" : ""}" type="button" id="saveLook" aria-pressed="${!!lookSaved(o.itemIds)}">${icon("bookmark")}${t(lookSaved(o.itemIds) ? "looks.saved" : "looks.save")}</button>
        <button class="btn sm primary" type="button" id="wear" ${isWorn ? "disabled" : ""}>${icon("check")}${t(isWorn ? "today.worn" : "today.wear")}</button>
      </div>
      ${td?.missing ? `<p class="notice">${icon("spark")} ${esc(td.missing)}</p>` : ""}`;
    const info = $("#info", result);
    info.onclick = async (e) => {
      if (e.target.closest("#like") || e.target.closest("#dislike")) {
        const liked = !!e.target.closest("#like");
        try { await saveFeedback({ itemIds: o.itemIds, liked, title: o.title, plan: td?.plan || "" }); toast(t(liked ? "today.liked" : "today.disliked")); } catch { toast(t("item.saveFail"), "error"); }
      }
      if (e.target.closest("#wear")) {
        try { await logWear({ itemIds: o.itemIds, title: o.title, plan: td?.plan || "", how: o.how || [], weather: td?.weather || null }); toast(t("today.wornSaved")); }
        catch { toast(t("item.saveFail"), "error"); }
      }
      if (e.target.closest("#saveLook")) {
        const ex = lookSaved(o.itemIds);
        try { if (ex) { await deleteLook(ex.id); toast(t("looks.removed")); } else { await saveLook({ title: o.title, itemIds: o.itemIds, how: o.how || [], source: o.engine ? "app" : "hoy" }); toast(t("looks.savedToast")); } }
        catch { toast(t("item.saveFail"), "error"); }
      }
    };
    showBoard(o);
  }

  // el outfit, montado con las fotos de las prendas (solo se rehace si cambian las prendas)
  let shown = "";
  function showBoard(o) {
    const stage = $("#stage", result); if (!stage) return;
    if (stage.querySelector(".board.editing")) return; // no rehacer mientras se coloca a mano
    const sig = o.itemIds.join() + JSON.stringify(store.layouts?.[o.itemIds.slice().sort().join("_")]?.boxes || null);
    if (sig === shown) return; shown = sig;
    stage.innerHTML = boardHTML(o.itemIds);
    hydrateBoard(stage);
    const tones = o.itemIds.map(byId).filter(Boolean).map((i) => i.tone).filter(Boolean);
    if (tones.length) setHalo(tones[0], tones[1] || tones[0]);
  }

  drawResult();
  const unsub = subscribe(() => { drawResult(); drawWashCheck($("#washCheck", box), today); });
  wireBoardEdit(result, () => toast(t("board.saved")));
  return () => unsub();
}


/* =================== CALENDARIO =================== */
function tabCalendar(box) {
  const now = new Date();
  state.month ||= { y: now.getFullYear(), m: now.getMonth() };
  function draw() {
    const { y, m } = state.month;
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const key = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wear = Object.fromEntries(store.wear.map((w) => [w.date, w]));
    const today = todayKey();
    const cells = [...Array(lead).fill(`<span></span>`), ...Array.from({ length: days }, (_, i) => {
      const k = key(i + 1), w = wear[k];
      const ims = (w?.itemIds || []).map(byId).filter((x) => x?.thumb).slice(0, 3);
      return `<button type="button" class="day ${k === today ? "today" : ""} ${w ? "has" : ""} ${k > today ? "future" : ""}" data-d="${k}" ${k > today ? "disabled" : ""}>
        <span class="n">${i + 1}</span><span class="ims">${ims.map((it) => `<img src="${it.thumb}" alt="">`).join("")}</span></button>`;
    })];
    const monthWear = store.wear.filter((w) => w.date.startsWith(key(1).slice(0, 7)));
    const never = store.items.filter((i) => !(i.wearCount > 0)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    box.innerHTML = `
      <section class="card cal">
        <div class="cal-head"><button class="btn icon ghost" type="button" id="prev" aria-label="${t("cal.prev")}">${icon("back")}</button>
          <b class="display">${cap(first.toLocaleDateString("es-ES", { month: "long" }))} ${y}</b>
          <button class="btn icon ghost" type="button" id="next" aria-label="${t("cal.next")}" style="transform:scaleX(-1)">${icon("back")}</button></div>
        <div class="cal-grid">${["L", "M", "X", "J", "V", "S", "D"].map((d) => `<span class="wd">${d}</span>`).join("")}${cells.join("")}</div>
        <p class="muted small">${t("cal.monthCount", { n: monthWear.length })}</p>
      </section>
      <section class="card">
        <h2 class="display">${t("cal.never")} <span class="muted">${never.length}</span></h2>
        <p class="muted small" style="margin:0">${t("cal.neverHint")}</p>
        ${never.length ? `<div class="never">${never.map((it) => `<button type="button" class="never-item" data-item="${it.id}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="">` : ""}<span>${esc(it.name)}</span><small>${since(it.createdAt)}</small></button>`).join("")}</div>` : `<p class="muted">${t("cal.allUsed")}</p>`}
      </section>`;
    $("#prev", box).onclick = () => { state.month = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; draw(); };
    $("#next", box).onclick = () => { state.month = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; draw(); };
    $(".cal-grid", box).onclick = (e) => { const d = e.target.closest("[data-d]"); if (d) openDay(d.dataset.d); };
  }
  draw();
  return subscribe(draw);
}

function openDay(date) {
  const w = store.wear.find((x) => x.date === date);
  const title = fmtDate(date, { weekday: "long", day: "numeric", month: "long" });
  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${esc(title)}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    ${w ? `
      ${w.title ? `<p><b>${esc(w.title)}</b>${w.plan ? ` · <span class="muted">${esc(w.plan)}</span>` : ""}</p>` : ""}
      ${w.weather ? `<p class="muted small">${icon(describe(w.weather.code).icon)} ${describe(w.weather.code).text} · ${w.weather.min}–${w.weather.max} °C</p>` : ""}
      ${boardHTML(w.itemIds, { small: true })}
      ${w.how?.length ? `<ol class="how">${w.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
      <div class="sheet-foot"><button class="btn danger" type="button" id="del">${icon("trash")}${t("cal.delete")}</button><button class="btn" type="button" id="edit">${icon("edit")}${t("cal.change")}</button></div>`
    : `<p class="muted">${t("cal.empty")}</p><div class="sheet-foot"><button class="btn primary" type="button" id="edit">${icon("plus")}${t("cal.log")}</button></div>`}`,
  { label: title });
  sh.el.onclick = async (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    const it = e.target.closest("[data-item]"); if (it) return openItem(it.dataset.item);
    if (e.target.closest("#del")) { try { await deleteWear(date); sh.close(); } catch { toast(t("item.saveFail"), "error"); } }
    if (e.target.closest("#edit")) {
      const ids = await pickItems(w?.itemIds || [], { title: t("cal.pickTitle") });
      if (!ids) return;
      try { await logWear({ ...(w || {}), date, itemIds: ids }); sh.close(); toast(t("today.wornSaved")); } catch { toast(t("item.saveFail"), "error"); }
    }
  };
}

/* =================== MALETA =================== */
function tabTrip(box) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const form = { dest: null, start: todayKey(tomorrow), days: 3, plan: "" };
  function drawForm() {
    if (state.trip) return drawTrip();
    box.innerHTML = `
      <section class="card trip-form">
        <h2 class="display">${t("trip.title")}</h2>
        <div class="field"><span>${t("trip.dest")}</span>
          ${form.dest ? `<div class="place active">${icon("pin")}<div class="grow"><b>${esc(form.dest.name)}</b><small>${esc(form.dest.region || "")}</small></div><button class="btn sm ghost" type="button" id="chg">${t("trip.change")}</button></div>`
          : `<label class="searchbox">${icon("search")}<input class="input" id="dq" type="search" placeholder="${t("places.searchPh")}" aria-label="${t("trip.dest")}"></label><div class="results" id="dres"></div>`}
        </div>
        <div class="two">
          <label class="field"><span>${t("trip.start")}</span><input type="date" id="start" value="${form.start}" min="${todayKey()}"></label>
          <div class="field"><span>${t("trip.days")}</span><div class="stepper"><button class="btn icon" type="button" id="minus" aria-label="−">−</button><b id="days">${form.days}</b><button class="btn icon" type="button" id="plus" aria-label="+">+</button></div></div>
        </div>
        <label class="field"><span>${t("trip.plan")}</span><textarea id="tplan" rows="2" maxlength="300" placeholder="${t("trip.planPh")}">${esc(form.plan)}</textarea></label>
        <button class="btn primary block" type="button" id="pack">${icon("bag")}${t("trip.go")}</button>
        <p class="status" id="tst" aria-live="polite"></p>
      </section>
      ${store.trips.length ? `<section class="card"><h2 class="display">${t("trip.saved")}</h2><div class="places">${store.trips.map((tr) => `
        <div class="place"><button type="button" class="grow trip-open" data-t="${tr.id}">${icon("bag")}<span><b>${esc(tr.dest?.name || "")}</b><small>${fmtDate(tr.start, { day: "numeric", month: "short" })} · ${t("trip.nDays", { n: tr.days })}</small></span></button>
        <button class="btn sm icon ghost" type="button" data-del="${tr.id}" aria-label="${t("trip.delete")}">${icon("trash")}</button></div>`).join("")}</div></section>` : ""}`;
    const dq = $("#dq", box);
    let timer;
    if (dq) dq.oninput = () => {
      clearTimeout(timer); const q = dq.value.trim();
      if (q.length < 2) { $("#dres", box).innerHTML = ""; return; }
      timer = setTimeout(async () => {
        try { const r = await searchCity(q); $("#dres", box).innerHTML = r.map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.name)}</b> <span class="muted small">${esc(x.region)}</span></button>`).join("") || `<p class="muted small">${t("places.noResults")}</p>`; $("#dres", box).onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { form.dest = r[+b.dataset.i]; keep(); drawForm(); } }; }
        catch { $("#dres", box).innerHTML = `<p class="muted small">${t("places.gpsFail")}</p>`; }
      }, 300);
    };
    const keep = () => { form.start = $("#start", box)?.value || form.start; form.plan = $("#tplan", box)?.value || form.plan; };
    $("#chg", box) && ($("#chg", box).onclick = () => { keep(); form.dest = null; drawForm(); });
    $("#minus", box).onclick = () => { form.days = Math.max(1, form.days - 1); $("#days", box).textContent = form.days; };
    $("#plus", box).onclick = () => { form.days = Math.min(21, form.days + 1); $("#days", box).textContent = form.days; };
    box.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { state.trip = store.trips.find((x) => x.id === b.dataset.t); drawTrip(); }));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => deleteTrip(b.dataset.del).catch(() => toast(t("item.saveFail"), "error"))));
    $("#pack", box).onclick = async () => {
      keep();
      const st = $("#tst", box);
      if (!form.dest) { say(st, t("trip.needDest"), "error"); return; }
      const avail = store.items.filter((i) => i.status !== "prestada");
      $("#pack", box).disabled = true; say(st, t("trip.weather"));
      try {
        const w = await tripWeather(form.dest, form.start, form.days);
        say(st, t("trip.thinking"));
        const wText = (w.source === "año-pasado" ? "(referencia: mismos días del año pasado) " : "") + w.days.map((d, i) => `Día ${i + 1} (${d.date}): ${describe(d.code).text.toLowerCase()}, ${d.min}–${d.max} °C${d.rain != null ? `, lluvia ${d.rain}%` : ""}`).join("; ");
        const items = avail;
        const localPack = () => packTrip({ items, weather: w, plan: form.plan, style: store.style, days: form.days });
        let r;
        if (engineMode() === "app") r = localPack();
        else try { r = await api("/api/packing", {
          wardrobe: avail.map((i) => ({ id: i.id, name: i.name, type: label(TYPE[i.type]) || i.type, colors: (i.colors || []).map((c) => label(COLOR[c.k]) || c.k), pattern: label(PATTERN[i.pattern]), material: i.material || label(MATERIAL[i.materialKey]), formality: i.formality, seasons: i.seasons, styleTags: i.styleTags })),
          destination: `${form.dest.name} (${form.dest.region || ""})`, days: form.days, plan: form.plan, weather: wText, style: styleText(store.style),
        }, { timeout: 40000 }); } catch (e) { console.warn("IA no disponible, maleta de la app", e); r = localPack(); toast(t("engine.fallback")); }
        const trip = { dest: form.dest, start: form.start, days: form.days, plan: form.plan, weather: w, pack: r.pack, outfits: r.days, tips: r.tips, missing: r.missing, packed: [] };
        trip.id = await saveTrip(trip);
        state.trip = trip; drawTrip();
      } catch (e) { say(st, e?.message || t("trip.fail"), "error"); $("#pack", box).disabled = false; }
    };
  }
  function drawTrip() {
    const tr = store.trips.find((x) => x.id === state.trip.id) || state.trip; state.trip = tr;
    const packed = new Set(tr.packed || []);
    box.innerHTML = `
      <section class="card">
        <div class="row between"><button class="btn sm ghost" type="button" id="back">${icon("back")}${t("trip.back")}</button><span class="muted small">${tr.weather?.source === "año-pasado" ? t("trip.lastYear") : ""}</span></div>
        <h2 class="display">${esc(tr.dest?.name || "")}</h2>
        <p class="muted" style="margin:0">${fmtDate(tr.start, { weekday: "short", day: "numeric", month: "long" })} · ${t("trip.nDays", { n: tr.days })}${tr.plan ? ` · ${esc(tr.plan)}` : ""}</p>
        <div class="wx-days">${(tr.weather?.days || []).map((d) => `<div>${icon(describe(d.code).icon)}<small>${fmtDate(d.date, { weekday: "short" })}</small><b>${d.max}°</b><small>${d.min}°</small></div>`).join("")}</div>
      </section>
      <section class="card">
        <h2 class="display">${t("trip.pack", { n: (tr.pack || []).length })}</h2>
        <div class="pack">${(tr.pack || []).map(byId).filter(Boolean).map((it) => `<button type="button" class="pack-item" data-p="${it.id}" aria-pressed="${packed.has(it.id)}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="">` : ""}<span>${esc(it.name)}</span><i>${icon("check")}</i></button>`).join("")}</div>
        <p class="muted small" style="margin:0">${t("trip.packHint")}</p>
      </section>
      <section class="card">
        <h2 class="display">${t("trip.daysTitle")}</h2>
        ${(tr.outfits || []).map((d) => `<div class="trip-day"><b>${t("trip.day", { n: d.day })} · ${esc(d.title)}</b>${boardHTML(d.itemIds, { small: true })}${d.how?.length ? `<ul class="how">${d.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}</div>`).join("")}
      </section>
      ${(tr.tips || []).length || tr.missing ? `<section class="card">${(tr.tips || []).length ? `<h2 class="display">${t("trip.tips")}</h2><ul class="how">${tr.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${tr.missing ? `<p class="notice">${icon("spark")} ${esc(tr.missing)}</p>` : ""}</section>` : ""}`;
    $("#back", box).onclick = () => { state.trip = null; drawForm(); };
    $(".pack", box).onclick = async (e) => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      const id = b.dataset.p; packed.has(id) ? packed.delete(id) : packed.add(id); b.setAttribute("aria-pressed", String(packed.has(id)));
      saveTrip({ ...tr, packed: [...packed] }, tr.id).catch(() => toast(t("item.saveFail"), "error"));
    };
  }
  drawForm();
  return null;
}
