// Perfil y bienvenida: cuerpo (maniquí con tus proporciones), tallas, ubicaciones, idioma y cuenta.
// Las mismas piezas sirven para la bienvenida (primer uso) y para la pestaña Perfil.
import { t, LANGUAGES, getLanguage, ensureLanguage } from "../i18n.js";
import { SIZE_KEYS, TYPE, label } from "../catalog.js";
import { $, $$, esc, icon, toast, say, isNative } from "../ui.js";
import { store, saveProfile, WASH_AFTER, washLimit } from "../data.js";
import { locate, placeName, searchCity } from "../places.js";
import { auth, logOut } from "../firebase.js";
import { BUILD, checkUpdate } from "../updater.js";
import { canNotify, setMorningReminder, canCalendar, planFromCalendar } from "../native.js";
import { STORES, LOCAL_DEFAULT, allowedStores } from "../storesearch.js";
import { isAdmin, watchAccessList, setAccess, removeAccess } from "../access.js";

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
let ptab = "me"; // pestaña de Perfil (se recuerda al volver)
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
    <div class="seg ptabs" role="tablist">${["me", "settings", "account"].map((k) => `<button type="button" role="tab" data-pt="${k}" aria-pressed="${ptab === k}">${t("profile.tab." + k)}</button>`).join("")}</div>
    <div class="cards">
      <section class="card" data-pt="me" id="cPlaces"><h2 class="display">${t("profile.places")}</h2></section>
      <section class="card span2" data-pt="me" id="cSizes"><h2 class="display">${t("profile.sizes")}</h2></section>
      <section class="card" data-pt="settings" id="cConn"><h2 class="display">${t("conn.title")}</h2>
        ${canCalendar() ? `<div class="conn-row">${icon("calendar")}<div class="grow"><b>${t("conn.cal")}</b><small class="muted">${t(store.profile?.calAuto ? "conn.calOn" : "conn.calOff")}</small></div>
          <button class="btn sm ${store.profile?.calAuto ? "ghost" : "primary"}" type="button" id="calConn">${t(store.profile?.calAuto ? "conn.disconnect" : "conn.connect")}</button></div>` : ""}
        <div class="conn-row">${icon("pin")}<div class="grow"><b>Pinterest</b><small class="muted">${store.style?.boardUrl ? esc(t("conn.pinOn", { board: store.style.boardUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, ""), date: new Date(store.style.checkedAt || store.style.analyzedAt || Date.now()).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })) : t("conn.pinOff")}</small></div>
          ${store.style?.boardUrl ? `<button class="btn sm ghost" type="button" id="pinNow">${icon("refresh")}${t("conn.checkNow")}</button>` : `<a class="btn sm primary" href="#/estilo">${t("conn.connect")}</a>`}</div>
        <p class="status" id="connSt" aria-live="polite"></p>
      </section>
            ${canNotify() ? `<section class="card" data-pt="settings"><h2 class="display">${t("remind.title")}</h2>
        <label class="auto-row"><input type="checkbox" id="remOn" ${store.profile?.reminder ? "checked" : ""}><span>${t("remind.on")}</span></label>
        <label class="field"><span>${t("remind.time")}</span><input class="input" type="time" id="remAt" value="${esc(store.profile?.reminder || "08:00")}"></label></section>` : ""}
      <section class="card" data-pt="settings"><h2 class="display">${t("profile.wash")}</h2>
        <label class="auto-row"><input type="checkbox" id="washCheck" ${store.profile?.washCheck === false ? "" : "checked"}><span>${t("wash.check")}<small class="muted"> · ${t("wash.checkHint")}</small></span></label>
        <label class="auto-row" id="autoRow" ${store.profile?.washCheck === false ? "" : "hidden"}><input type="checkbox" id="autoDirty" ${store.profile?.autoDirty === false ? "" : "checked"}><span>${t("wash.auto")}</span></label>
        <details class="wash-edit"><summary>${t("wash.edit")}</summary>
          <p class="muted small">${t("wash.editHint")}</p>
          <div class="wash-grid">${Object.keys(WASH_AFTER).filter((k) => TYPE[k]).map((k) => `<label><span>${esc(label(TYPE[k]))}</span><input class="input" type="number" min="0" max="30" inputmode="numeric" data-wash="${k}" value="${washLimit(k)}"></label>`).join("")}</div>
          <button class="btn sm ghost" type="button" id="washReset">${icon("refresh")}${t("wash.reset")}</button>
        </details></section>
      <section class="card" data-pt="settings" id="cStores"><h2 class="display">${t("stores.title")}</h2>
        <p class="muted small">${t("stores.hint")}</p>
        <div class="chips" id="storeChips">${STORES.map(([n]) => `<button type="button" class="chip" data-store="${esc(n)}" aria-pressed="${allowedStores(p).includes(n)}">${esc(n)}</button>`).join("")}</div>
        <div class="row wrap"><button class="btn sm ghost" type="button" id="storesReset">${icon("refresh")}${t("stores.reset")}</button></div>
      </section>
      <section class="card" data-pt="settings" id="cRecut"><h2 class="display">${t("recut.title")}</h2>
        <p class="muted small" style="margin:0">${t("recut.body")}</p>
        <div class="row wrap"><button class="btn sm primary" type="button" id="recut">${icon("spark")}${t("recut.go", { n: store.items.filter((i) => i.hasImage).length })}</button><button class="btn sm ghost" type="button" id="unrecut">${icon("refresh")}${t("recut.undo")}</button></div>
        <div class="bar" id="recutBar" hidden><i></i></div>
        <p class="status" id="recutSt" aria-live="polite"></p></section>
      <section class="card" data-pt="me"><h2 class="display">${t("profile.section")}</h2>
        <div class="seg" id="section">${["hombre", "mujer"].map((k) => `<button type="button" data-sec="${k}" aria-pressed="${(store.profile?.section || "hombre") === k}">${t("section." + k)}</button>`).join("")}</div>
        <p class="muted small" style="margin:0">${t("profile.sectionHint")}</p></section>
      <section class="card" data-pt="me"><h2 class="display">${t("profile.language")}</h2>
        <div class="seg" id="langs">${LANGUAGES.map((l) => `<button type="button" data-lang="${l.k}" aria-pressed="${l.k === getLanguage()}">${l.label}</button>`).join("")}</div>
        <p class="status" id="langSt" aria-live="polite"></p>
        <p class="muted small" style="margin:0">${t("profile.language.note")}</p></section>
      ${isAdmin() ? `<section class="card span2" data-pt="account" id="cAccess"><h2 class="display">${t("access.title")}</h2><p class="muted small" style="margin:0">${t("access.adminHint")}</p><div id="accList"><p class="muted">${t("common.loading")}</p></div></section>` : ""}
      <section class="card span2" data-pt="account"><h2 class="display">${t("profile.account")}</h2>
        <div class="field"><span>${t("profile.uid")}</span><div class="row"><code class="uid" style="flex:1">${esc(user?.uid || "")}</code><button class="btn sm" type="button" id="copy">${icon("copy")}${t("profile.copy")}</button></div></div>
        <div class="field"><span>${t("profile.version")}</span><div class="row"><code class="uid" style="flex:1">${esc(BUILD)}${isNative ? ` · ${esc(location.host)}` : ""}</code><button class="btn sm" type="button" id="upd">${icon("refresh")}${t("profile.checkUpdate")}</button></div></div>
        <div class="row wrap"><button class="btn" type="button" id="install" hidden>${t("common.install")}</button><button class="btn danger" type="button" id="out">${icon("logout")}${t("profile.signOut")}</button></div>
      </section>
    </div>`;
  const showTab = () => {
    $$(".ptabs [data-pt]", view).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pt === ptab)));
    $$(".cards > [data-pt]", view).forEach((c) => (c.hidden = c.dataset.pt !== ptab));
  };
  $(".ptabs", view).onclick = (e) => { const b = e.target.closest("[data-pt]"); if (b) { ptab = b.dataset.pt; showTab(); } };
  showTab();
  $("#cPlaces", view).append(placesBlock(p, change));
  $("#cSizes", view).append(sizesBlock(p, change));
  let unsubAcc = null;
  if (isAdmin()) {
    const box = $("#accList", view);
    unsubAcc = watchAccessList((list) => {
      if (!list) { box.innerHTML = `<p class="status" data-kind="error">${t("access.rulesMissing")}</p>`; return; }
      if (!list.length) { box.innerHTML = `<p class="muted">${t("access.none")}</p>`; return; }
      box.innerHTML = list.map((a) => `<div class="acc-row">
        <div class="grow"><b>${esc(a.name || a.email || a.uid)}</b><small class="muted">${esc(a.email || "")} · ${new Date(a.requestedAt || 0).toLocaleDateString("es-ES")}</small></div>
        <span class="pill acc-${a.status}">${t("access.st." + a.status)}</span>
        <div class="row">${a.status !== "aprobado" ? `<button class="btn sm primary" type="button" data-acc="${a.uid}" data-to="aprobado">${t("access.approve")}</button>` : ""}
          ${a.status !== "denegado" ? `<button class="btn sm ghost" type="button" data-acc="${a.uid}" data-to="denegado">${t(a.status === "aprobado" ? "access.revoke" : "access.deny")}</button>` : ""}
          <button class="btn sm icon ghost" type="button" data-acc="${a.uid}" data-to="borrar" aria-label="${t("access.remove")}">${icon("trash")}</button></div>
      </div>`).join("");
    });
    box.onclick = async (e) => {
      const b = e.target.closest("[data-acc]"); if (!b) return;
      b.disabled = true;
      try { b.dataset.to === "borrar" ? await removeAccess(b.dataset.acc) : await setAccess(b.dataset.acc, b.dataset.to); toast(t("access.saved")); }
      catch { b.disabled = false; toast(t("item.saveFail"), "error"); }
    };
  }
  const calB = $("#calConn", view);
  if (calB) calB.onclick = async () => {
    const st = $("#connSt", view);
    if (store.profile?.calAuto) { await saveProfile({ calAuto: false }); store.profile.calAuto = false; toast(t("conn.calDisconnected")); return renderProfile(view); }
    calB.disabled = true;
    try { await planFromCalendar(); await saveProfile({ calAuto: true }); store.profile.calAuto = true; toast(t("conn.calConnected")); return renderProfile(view); }
    catch (e) { calB.disabled = false; say(st, e?.message || t("today.calFail"), "error"); }
  };
  const pinB = $("#pinNow", view);
  if (pinB) pinB.onclick = async () => {
    pinB.disabled = true; say($("#connSt", view), t("conn.checking"));
    try { await (await import("../stylesync.js")).autoRefresh({ force: true }); say($("#connSt", view), t("conn.checked"), "ok"); }
    catch { say($("#connSt", view), t("style.fail"), "error"); }
    pinB.disabled = false;
  };
  $("#copy", view).onclick = async () => { try { await navigator.clipboard.writeText(user.uid); toast(t("profile.copied")); } catch {} };
  $("#out", view).onclick = () => logOut();
  $("#langs", view).onclick = async (e) => {
    const b = e.target.closest("[data-lang]"); if (!b || b.dataset.lang === getLanguage()) return;
    const l = b.dataset.lang, st = $("#langSt", view);
    $("#langs", view).querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      if (l !== "es") await ensureLanguage(l, (d, n) => say(st, t("profile.translating", { d, n })));
      await saveProfile({ language: l });
      location.reload();
    } catch (err) { say(st, err?.message || t("profile.translateFail"), "error"); $("#langs", view).querySelectorAll("button").forEach((x) => (x.disabled = false)); }
  };
  $("#section", view).onclick = (e) => {
    const b = e.target.closest("[data-sec]"); if (!b) return;
    $("#section", view).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    change({ section: b.dataset.sec });
  };
  $("#storeChips", view).onclick = (e) => {
    const b = e.target.closest("[data-store]"); if (!b) return;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    const on = [...view.querySelectorAll("#storeChips [aria-pressed=true]")].map((x) => x.dataset.store);
    if (!on.length) { b.setAttribute("aria-pressed", "true"); return toast(t("stores.atLeastOne")); }
    change({ stores: on });
  };
  $("#storesReset", view).onclick = () => { change({ stores: null }); view.querySelectorAll("#storeChips [data-store]").forEach((x) => x.setAttribute("aria-pressed", String(LOCAL_DEFAULT.includes(x.dataset.store)))); };
  $("#autoDirty", view).onchange = (e) => change({ autoDirty: e.target.checked });
  $("#washCheck", view).onchange = (e) => { $("#autoRow", view).hidden = e.target.checked; change({ washCheck: e.target.checked }); };
  view.querySelector(".wash-grid").onchange = (e) => {
    const k = e.target.dataset?.wash; if (!k) return;
    const v = Math.max(0, Math.min(30, Math.round(+e.target.value || 0))); e.target.value = v;
    p.washAfter = { ...(p.washAfter || {}), [k]: v }; change({ washAfter: p.washAfter });
  };
  $("#washReset", view).onclick = () => {
    p.washAfter = {}; change({ washAfter: {} });
    view.querySelectorAll("[data-wash]").forEach((i) => (i.value = WASH_AFTER[i.dataset.wash]));
  };
  const remOn = $("#remOn", view), remAt = $("#remAt", view);
  if (remOn) {
    const apply = async () => {
      const time = remOn.checked ? remAt.value || "08:00" : null;
      try { await setMorningReminder(time); change({ reminder: time }); toast(time ? t("remind.set", { time }) : t("remind.off")); }
      catch (e) { remOn.checked = false; toast(e?.message || t("item.saveFail"), "error"); }
    };
    remOn.onchange = apply; remAt.onchange = () => { if (remOn.checked) apply(); };
  }
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
  return () => { unsubAcc?.(); clearTimeout(saveTimer); if (Object.keys(pending).length) saveProfile(pending).catch(() => {}); };
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
