// Armario: buscar, filtrar por grupo y por cualquier clasificación, ordenar y abrir la ficha de cada prenda.
import { t } from "../i18n.js";
import {
  GROUPS, TYPE, COLORS, COLOR, PATTERNS, MATERIALS, FITS, SEASONS, STATUSES, label, groupOf, TYPES,
} from "../catalog.js";
import { $, $$, esc, icon, openSheet, tilt, setHalo, viewHalo } from "../ui.js";
import { store, subscribe, washAll } from "../data.js";
import { openItem } from "./item.js";
import { toast } from "../ui.js";
import { openAdd, tintFor } from "./add.js";

const state = { q: "", group: "", sort: "recent", f: { color: [], size: [], pattern: [], brand: [], materialKey: [], season: [], fit: [], status: [], formality: [] } };
const activeCount = () => Object.values(state.f).reduce((a, v) => a + v.length, 0);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function matches(it, { ignoreGroup = false } = {}) {
  const f = state.f;
  if (!ignoreGroup && state.group && groupOf(it.type).k !== state.group) return false;
  if (state.q) {
    const hay = norm([it.name, it.brand, it.material, label(TYPE[it.type]), ...(it.colors || []).map((c) => label(COLOR[c.k])), ...(it.styleTags || []), it.notes].join(" "));
    if (!norm(state.q).split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (f.color.length && !(it.colors || []).some((c) => f.color.includes(c.k))) return false;
  if (f.size.length && !f.size.includes(it.size)) return false;
  if (f.pattern.length && !f.pattern.includes(it.pattern)) return false;
  if (f.brand.length && !f.brand.includes(it.brand)) return false;
  if (f.materialKey.length && !f.materialKey.includes(it.materialKey)) return false;
  if (f.season.length && !(it.seasons || []).some((s) => f.season.includes(s))) return false;
  if (f.fit.length && !f.fit.includes(it.fit)) return false;
  if (f.status.length && !f.status.includes(it.status)) return false;
  if (f.formality.length && !f.formality.includes(String(it.formality))) return false;
  return true;
}

const COLOR_ORDER = Object.fromEntries(COLORS.map((c, i) => [c.k, i]));
const TYPE_ORDER = Object.fromEntries(TYPES.map((c, i) => [c.k, i]));
const SORTS = {
  recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  color: (a, b) => (COLOR_ORDER[a.colors?.[0]?.k] ?? 99) - (COLOR_ORDER[b.colors?.[0]?.k] ?? 99),
  type: (a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99),
  brand: (a, b) => String(a.brand || "~").localeCompare(String(b.brand || "~"), "es"),
};

export function renderCloset(view) {
  view.innerHTML = `
    <header class="head"><div><h1 class="display">${t("closet.title")}</h1><div class="sub" id="count"></div></div><div class="row wrap head-actions"><button class="btn sm" type="button" id="wash" hidden>${icon("wash")}<span></span></button><button class="btn sm ghost" type="button" id="stats">${icon("chart")}${t("stats.btn")}</button></div></header>
    <div id="notice"></div>
    <div class="toolbar">
      <label class="searchbox">${icon("search")}<input class="input" type="search" id="q" placeholder="${t("closet.search")}" value="${esc(state.q)}" aria-label="${t("closet.search")}"></label>
      <button class="btn icon tool-btn" type="button" id="sortBtn" aria-label="${t("closet.sort")}">${icon("sort")}</button>
      <button class="btn icon tool-btn" type="button" id="filterBtn" aria-label="${t("closet.filters")}">${icon("filter")}<span class="dot" id="fdot" hidden></span></button>
    </div>
    <div class="scroller" id="groups" role="group"></div>
    <div id="grid"></div>`;
  $("#q", view).oninput = (e) => { state.q = e.target.value; draw(); };
  $("#wash", view).onclick = async () => { try { const n = await washAll(); toast(t("wash.done", { n })); } catch { toast(t("item.saveFail"), "error"); } };
  $("#filterBtn", view).onclick = () => openFilters(draw);
  $("#sortBtn", view).onclick = () => openSort(draw);
  $("#groups", view).onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; state.group = b.dataset.g; draw(); };
  const grid = $("#grid", view);
  grid.onclick = (e) => {
    const tile = e.target.closest(".tile"); if (tile) return openItem(tile.dataset.id);
    if (e.target.closest("#emptyAdd")) openAdd();
    if (e.target.closest("#clearF")) { clearFilters(); draw(); }
  };
  // el halo sigue al ratón solo en el ordenador (en el móvil, al deslizar, repintaba la pantalla a cada toque)
  grid.addEventListener("pointerover", (e) => { if (e.pointerType !== "mouse") return; const tl = e.target.closest(".tile"); if (tl) setHalo(tl.dataset.tone); });
  let tops = null, lastKey = "";
  grid.addEventListener("pointerleave", () => viewHalo(view, ...(tops || [null])));
  tilt(grid, ".tile");

  function draw() {
    const all = store.items;
    $("#count", view).textContent = all.length === 1 ? t("closet.countOne") : t("closet.count", { n: all.length });
    $("#stats", view).onclick = () => import("./stats.js").then((m) => m.openStats());
    const dirty = store.items.filter((i) => i.status === "sucia" || i.status === "tintoreria").length, wb = $("#wash", view);
    wb.hidden = !dirty; wb.lastChild.textContent = t("wash.all", { n: dirty });
    $("#notice", view).innerHTML = store.error ? `<div class="notice">${t("common.loadFail")}</div>` : store.offline && all.length ? `<div class="notice">${t("common.offline")}</div>` : "";
    const n = activeCount(); $("#fdot", view).hidden = !n; $("#fdot", view).textContent = n;
    const base = all.filter((it) => matches(it, { ignoreGroup: true }));
    const counts = {}; base.forEach((it) => { const g = groupOf(it.type).k; counts[g] = (counts[g] || 0) + 1; });
    $("#groups", view).innerHTML = [{ k: "", es: t("closet.all") }, ...GROUPS].filter((g) => !g.k || counts[g.k] || state.group === g.k)
      .map((g) => `<button type="button" class="chip" data-g="${g.k}" aria-pressed="${state.group === g.k}">${esc(g.k ? label(g) : g.es)}<span class="count">${g.k ? counts[g.k] || 0 : base.length}</span></button>`).join("");
    $("#groups", view).hidden = !all.length;
    $(".toolbar", view).hidden = !all.length;

    if (!store.ready.items) { grid.innerHTML = `<p class="muted">${t("common.loading")}</p>`; return; }
    if (!all.length) {
      grid.innerHTML = `<div class="empty"><div class="empty-art">${icon("closet")}</div><h2 class="display">${t("closet.empty.title")}</h2><p>${t("closet.empty.body")}</p><button class="btn primary" id="emptyAdd" type="button">${icon("camera")}${t("closet.empty.cta")}</button></div>`;
      return;
    }
    const list = base.filter((it) => !state.group || groupOf(it.type).k === state.group).sort(SORTS[state.sort]);
    if (!list.length) { grid.innerHTML = `<div class="empty"><p>${t("closet.noMatch")}</p><button class="btn" id="clearF" type="button">${t("closet.clearFilters")}</button></div>`; return; }
    // solo se rehace la cuadrícula si de verdad cambia algo (la base de datos avisa muchas veces sin cambios)
    const key = store.locVer + list.map((it) => `${it.id}:${it.updatedAt || 0}:${it.status}`).join("|");
    if (key !== lastKey) {
      grid.innerHTML = `<div class="grid${lastKey ? " no-rise" : ""}">${list.map((it, i) => tile(it, i)).join("")}</div>`;
      lastKey = key;
    }
    // el color secundario toma los colores que más se repiten en lo que estás viendo
    const cnt = new Map(); list.forEach((it) => (it.colors || []).slice(0, 2).forEach((c, j) => c?.hex && cnt.set(c.hex, (cnt.get(c.hex) || 0) + (j ? 1 : 2))));
    const top = [...cnt].sort((a, b) => b[1] - a[1]).map(([h]) => h);
    const vivid = top.slice(0, 6).sort((a, b) => chroma(b) - chroma(a))[0]; // el más vivo de los habituales, para que no salga siempre gris
    tops = top.length ? [top[0], vivid || top[1] || top[0]] : null;
    viewHalo(view, ...(tops || [null]));
  }
  draw();
  return subscribe(draw);
}

function tile(it, i) {
  const sub = [it.brand, it.size].filter(Boolean).join(" · ") || label(TYPE[it.type]);
  const tone = it.tone || it.colors?.[0]?.hex || "#8a8f98";
  return `<button type="button" class="tile" data-id="${it.id}" data-tone="${tone}" style="--i:${Math.min(i, 20)};--tint:${tintFor(tone) || "var(--surface-solid)"}">
    <div class="tile-img">${it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy" decoding="async">` : `<i class="no-img" style="background:${tone}"></i>`}</div>
    <div class="tile-meta"><span class="tile-name">${esc(it.name)}</span><span class="tile-sub">${esc(sub)}</span></div>
    ${it.status && it.status !== "disponible" ? `<span class="badge ${it.status}">${t("status." + it.status)}</span>` : ""}
  </button>`;
}

function clearFilters() { for (const k in state.f) state.f[k] = []; }

function openFilters(onChange) {
  const items = store.items;
  const present = (fn) => new Set(items.flatMap(fn).filter(Boolean));
  const colorsHere = present((i) => (i.colors || []).map((c) => c.k));
  const sizes = [...present((i) => [i.size])].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const brands = [...present((i) => [i.brand])].sort((a, b) => a.localeCompare(b, "es"));
  const only = (list, key) => { const s = present((i) => [].concat(i[key])); return list.filter((x) => s.has(x.k)); };
  const group = (key, title, opts) => opts.length ? `<div class="section"><h3>${title}</h3><div class="chips" data-key="${key}">${opts.map((o) =>
    `<button type="button" class="chip" data-v="${esc(o.v)}" aria-pressed="${state.f[key].includes(o.v)}">${o.sw ? `<i class="swatch" style="background:${o.sw}"></i>` : ""}${esc(o.l)}</button>`).join("")}</div></div>` : "";
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("closet.filters")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    ${group("color", t("filter.color"), COLORS.filter((c) => colorsHere.has(c.k)).map((c) => ({ v: c.k, l: label(c), sw: c.hex })))}
    ${group("status", t("filter.status"), STATUSES.map((s) => ({ v: s, l: t("status." + s) })))}
    ${group("season", t("filter.season"), SEASONS.map((s) => ({ v: s, l: t("season." + s) })))}
    ${group("formality", t("filter.formality"), [1, 2, 3, 4, 5].map((n) => ({ v: String(n), l: t("formality." + n) })))}
    ${group("size", t("filter.size"), sizes.map((s) => ({ v: s, l: s })))}
    ${group("brand", t("filter.brand"), brands.map((s) => ({ v: s, l: s })))}
    ${group("pattern", t("filter.pattern"), only(PATTERNS, "pattern").map((x) => ({ v: x.k, l: label(x) })))}
    ${group("materialKey", t("filter.material"), only(MATERIALS, "materialKey").map((x) => ({ v: x.k, l: label(x) })))}
    ${group("fit", t("filter.fit"), only(FITS, "fit").map((x) => ({ v: x.k, l: label(x) })))}
    <div class="sheet-foot"><button class="btn" type="button" id="clear">${t("closet.clearFilters")}</button><button class="btn primary" type="button" id="apply"></button></div>`,
  { label: t("closet.filters") });
  const root = sheet.el;
  const upd = () => { $("#apply", root).textContent = t("closet.apply", { n: store.items.filter((i) => matches(i)).length }); onChange(); };
  root.onclick = (e) => {
    const b = e.target.closest(".chip");
    if (b) {
      const arr = state.f[b.parentElement.dataset.key], v = b.dataset.v, i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      b.setAttribute("aria-pressed", String(i < 0)); upd();
    }
    if (e.target.closest("#clear")) { clearFilters(); $$(".chip", root).forEach((c) => c.setAttribute("aria-pressed", "false")); upd(); }
    if (e.target.closest("#apply") || e.target.closest("[data-close]")) sheet.close();
  };
  upd();
}

function openSort(onChange) {
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("closet.sort")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="chips">${["recent", "color", "type", "brand"].map((k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${state.sort === k}">${t("closet.sort." + k)}</button>`).join("")}</div>`,
  { label: t("closet.sort") });
  sheet.el.onclick = (e) => {
    const b = e.target.closest(".chip"); if (b) { state.sort = b.dataset.k; onChange(); sheet.close(); }
    if (e.target.closest("[data-close]")) sheet.close();
  };
}

/** Lo vivo que es un color (#rrggbb): 0 gris, 255 muy saturado. */
function chroma(hex) { const n = parseInt(String(hex).slice(1), 16); if (isNaN(n)) return 0; const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return Math.max(...c) - Math.min(...c); }
