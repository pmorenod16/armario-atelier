// Perfil y bienvenida: cuerpo (maniquí con tus proporciones), tallas, ubicaciones, idioma y cuenta.
// Las mismas piezas sirven para la bienvenida (primer uso) y para la pestaña Perfil.
import { t, LANGUAGES, getLanguage } from "../i18n.js";
import { SIZE_KEYS } from "../catalog.js";
import { $, $$, esc, icon, toast, say, isNative } from "../ui.js";
import { store, saveProfile } from "../data.js";
import { locate, placeName, searchCity } from "../places.js";
import { auth, logOut } from "../firebase.js";
import { BUILD, checkUpdate } from "../updater.js";

const SIZE_PH = { camiseta: "M", jersey: "M", calzado: "43" };
const sizePh = (k) => t(`size.placeholder.${k}`) !== `size.placeholder.${k}` ? t(`size.placeholder.${k}`) : SIZE_PH[k] || "";

/* ---------- tallas ---------- */
function sizesBlock(p, change) {
  const el = document.createElement("div");
  el.className = "sizes";
  el.innerHTML = SIZE_KEYS.map((k) => `<label class="field"><span>${t("size." + k)}</span><input data-k="${k}" maxlength="16" autocomplete="off" placeholder="${esc(sizePh(k))}" value="${esc(p.sizes?.[k] || "")}"></label>`).join("");
  el.onchange = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    p.sizes = { ...(p.sizes || {}), [k]: e.target.value.trim() };
    change({ sizes: p.sizes });
  };
  return el;
}

/* ---------- ubicaciones ---------- */
function placesBlock(p, change) {
  const el = document.createElement("div");
  el.className = "stack";
  el.innerHTML = `
    <button class="btn" type="button" id="gps">${icon("gps")}${t("places.useGps")}</button>
    <p class="status" id="pst" aria-live="polite"></p>
    <div class="places" id="list"></div>
    <label class="searchbox">${icon("search")}<input class="input" type="search" id="cq" placeholder="${t("places.searchPh")}" aria-label="${t("places.search")}"></label>
    <div class="results" id="res"></div>`;
  const st = $("#pst", el);
  const commit = () => { draw(); change({ places: p.places, activePlace: p.activePlace }); };
  const add = (pl, activate = true) => {
    p.places = [pl, ...p.places.filter((x) => x.id !== pl.id)].slice(0, 8);
    if (activate) p.activePlace = pl.id;
    commit();
  };
  function draw() {
    $("#list", el).innerHTML = p.places.map((pl) => `
      <div class="place ${pl.id === p.activePlace ? "active" : ""}">${icon(pl.id === "gps" ? "gps" : "pin")}
        <div class="grow"><b>${esc(pl.name)}</b><small>${esc(pl.region || "")}</small></div>
        ${pl.id === p.activePlace ? `<span class="pill">${t("places.active")}</span>` : `<button class="btn sm" type="button" data-use="${pl.id}">${t("places.use")}</button>`}
        ${p.places.length > 1 ? `<button class="btn sm icon ghost" type="button" data-rm="${pl.id}" aria-label="${t("places.remove")} ${esc(pl.name)}">${icon("close")}</button>` : ""}
      </div>`).join("");
  }
  el.onclick = async (e) => {
    const use = e.target.closest("[data-use]"), rm = e.target.closest("[data-rm]"), pick = e.target.closest("[data-pick]");
    if (use) { p.activePlace = use.dataset.use; commit(); }
    if (rm) { p.places = p.places.filter((x) => x.id !== rm.dataset.rm); if (p.activePlace === rm.dataset.rm) p.activePlace = p.places[0].id; commit(); }
    if (pick) { add(JSON.parse(pick.dataset.pick)); $("#res", el).innerHTML = ""; $("#cq", el).value = ""; }
    if (e.target.closest("#gps")) {
      const b = $("#gps", el); b.disabled = true; say(st, t("places.locating"));
      try {
        const { lat, lon } = await locate();
        const n = await placeName(lat, lon);
        add({ id: "gps", name: n.name || t("places.current"), region: n.region, lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
        say(st, "");
      } catch (err) { say(st, t(err?.code === "denied" ? "places.gpsDenied" : "places.gpsFail"), "error"); }
      b.disabled = false;
    }
  };
  let timer;
  $("#cq", el).oninput = (e) => {
    clearTimeout(timer); const q = e.target.value.trim();
    if (q.length < 2) { $("#res", el).innerHTML = ""; return; }
    timer = setTimeout(async () => {
      try {
        const r = await searchCity(q);
        $("#res", el).innerHTML = r.length ? r.map((x) => `<button type="button" data-pick='${esc(JSON.stringify(x))}'><b>${esc(x.name)}</b> <span class="muted small">${esc(x.region)}</span></button>`).join("") : `<p class="muted small">${t("places.noResults")}</p>`;
      } catch { $("#res", el).innerHTML = `<p class="muted small">${t("places.gpsFail")}</p>`; }
    }, 300);
  };
  draw();
  return el;
}

/* ---------- pestaña Perfil ---------- */
export function renderProfile(view) {
  const p = structuredClone(store.profile);
  let saveTimer, pending = {};
  const change = (patch) => {
    Object.assign(pending, patch); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const x = pending; pending = {}; saveProfile(x).then(() => toast(t("profile.saved"))).catch(() => toast(t("item.saveFail"), "error")); }, 500);
  };
  const user = auth.currentUser;
  view.innerHTML = `
    <header class="head"><div><h1 class="display">${t("profile.title")}</h1><div class="sub">${esc(user?.displayName || user?.email || "")}</div></div></header>
    <div class="cards">
      <section class="card" id="cPlaces"><h2 class="display">${t("profile.places")}</h2></section>
      <section class="card span2" id="cSizes"><h2 class="display">${t("profile.sizes")}</h2></section>
      <a class="card style-link" href="#/estilo">
        <div class="row between"><h2 class="display">${t("style.title")}</h2>${icon("chevron")}</div>
        ${store.style?.summary ? `<b>${esc(store.style.name || "")}</b><p class="muted" style="margin:0">${esc(store.style.summary)}</p>
          <div class="palette mini-pal">${(store.style.palette || []).map((c) => `<i style="background:${c.hex}" title="${esc(c.name)}"></i>`).join("")}</div>`
        : `<p class="muted" style="margin:0">${t("style.emptyBody")}</p>`}
      </a>
      <section class="card" id="cRecut"><h2 class="display">${t("recut.title")}</h2>
        <p class="muted small" style="margin:0">${t("recut.body")}</p>
        <div class="row wrap"><button class="btn sm primary" type="button" id="recut">${icon("spark")}${t("recut.go", { n: store.items.filter((i) => i.hasImage).length })}</button><button class="btn sm ghost" type="button" id="unrecut">${icon("refresh")}${t("recut.undo")}</button></div>
        <div class="bar" id="recutBar" hidden><i></i></div>
        <p class="status" id="recutSt" aria-live="polite"></p></section>
      <section class="card"><h2 class="display">${t("profile.language")}</h2>
        <div class="seg">${LANGUAGES.map((l) => `<button type="button" aria-pressed="${l.k === getLanguage()}">${l.label}</button>`).join("")}</div>
        <p class="muted small" style="margin:0">${t("profile.language.soon")}</p></section>
      <section class="card span2"><h2 class="display">${t("profile.account")}</h2>
        <div class="field"><span>${t("profile.uid")}</span><div class="row"><code class="uid" style="flex:1">${esc(user?.uid || "")}</code><button class="btn sm" type="button" id="copy">${icon("copy")}${t("profile.copy")}</button></div></div>
        <div class="field"><span>${t("profile.version")}</span><div class="row"><code class="uid" style="flex:1">${esc(BUILD)}${isNative ? ` · ${esc(location.host)}` : ""}</code><button class="btn sm" type="button" id="upd">${icon("refresh")}${t("profile.checkUpdate")}</button></div></div>
        <div class="row wrap"><button class="btn" type="button" id="install" hidden>${t("common.install")}</button><button class="btn danger" type="button" id="out">${icon("logout")}${t("profile.signOut")}</button></div>
      </section>
    </div>`;
  $("#cPlaces", view).append(placesBlock(p, change));
  $("#cSizes", view).append(sizesBlock(p, change));
  $("#copy", view).onclick = async () => { try { await navigator.clipboard.writeText(user.uid); toast(t("profile.copied")); } catch {} };
  $("#out", view).onclick = () => logOut();
  $("#upd", view).onclick = () => checkUpdate({ manual: true });
  $("#recut", view).onclick = async () => {
    const b = $("#recut", view), st = $("#recutSt", view), bar = $("#recutBar", view);
    b.disabled = true; bar.hidden = false;
    const { recutAll } = await import("../recut.js");
    const r = await recutAll((p) => { say(st, t("recut.progress", { done: p.done, total: p.total, name: p.name || "" })); bar.firstElementChild.style.width = `${Math.round((p.done / Math.max(1, p.total)) * 100)}%`; });
    say(st, t("recut.done", r), "ok"); b.disabled = false;
  };
  $("#unrecut", view).onclick = async () => {
    const st = $("#recutSt", view); say(st, t("recut.undoing"));
    const { undoRecuts } = await import("../recut.js");
    const n = await undoRecuts(); say(st, t("recut.undone", { n }), "ok");
  };
  const inst = $("#install", view);
  if (window.__installEvt) { inst.hidden = false; inst.onclick = () => { window.__installEvt.prompt(); window.__installEvt = null; inst.hidden = true; }; }
  return () => { clearTimeout(saveTimer); if (Object.keys(pending).length) saveProfile(pending).catch(() => {}); };
}

/* ---------- bienvenida (primer uso) ---------- */
export function runOnboarding(host, done) {
  const p = structuredClone(store.profile);
  const steps = ["welcome", "sizes", "places"];
  let i = 0, current = null;
  host.hidden = false;
  host.innerHTML = `<div class="onb-inner"><div class="steps">${steps.map(() => "<i></i>").join("")}</div><div id="step"></div></div>
    <div class="onb-foot"><button class="btn" type="button" id="back">${t("onb.back")}</button><button class="btn primary" type="button" id="next"></button></div>`;
  const show = () => {
    current?.dispose?.();
    $$(".steps i", host).forEach((x, k) => x.classList.toggle("on", k <= i));
    const k = steps[i], box = document.createElement("div");
    box.className = "onb-step";
    if (k === "welcome") box.innerHTML = `<p class="muted small" style="margin:0">${t("onb.step", { n: 1, total: steps.length })}</p><h1 class="display">${t("onb.welcome.title")}</h1><p class="lead">${t("onb.welcome.body")}</p>`;
    else {
      box.innerHTML = `<p class="muted small" style="margin:0">${t("onb.step", { n: i + 1, total: steps.length })}</p><h1 class="display">${t(`onb.${k}.title`)}</h1><p class="lead">${t(`onb.${k}.body`)}</p>`;
      current = (k === "sizes" ? sizesBlock : placesBlock)(p, () => {});
      box.append(current);
    }
    $("#step", host).replaceChildren(box);
    $("#back", host).style.visibility = i ? "visible" : "hidden";
    $("#next", host).textContent = t(i === 0 ? "onb.start" : i === steps.length - 1 ? "onb.finish" : "onb.next");
    host.scrollTo(0, 0);
  };
  $("#back", host).onclick = () => { if (i) { i--; show(); } };
  $("#next", host).onclick = async () => {
    // el campo de talla con foco guarda su valor al perderlo
    document.activeElement?.blur?.();
    if (i < steps.length - 1) { i++; show(); return; }
    $("#next", host).disabled = true;
    current?.dispose?.();
    const { sizes, places, activePlace } = p;
    // sin esperar al servidor: Firestore lo aplica al momento en el móvil y lo sube cuando haya conexión
    saveProfile({ sizes, places, activePlace, onboarded: true }).catch(() => toast(t("item.saveFail"), "error"));
    host.hidden = true; host.innerHTML = ""; done();
  };
  show();
}
