// Arranque: acceso, bienvenida, navegación entre secciones y botón atrás de Android.
import "@fontsource-variable/geist";
import "@fontsource-variable/bricolage-grotesque";
import "./styles.css";
import { App } from "@capacitor/app";
import { t, translateDom, setLanguage, getLanguage, ensureLanguage } from "./i18n.js";
import { configured, watchAuth, logIn, register, resetPassword, logInWithGoogle, auth, logOut } from "./firebase.js";
import { watchAccess } from "./access.js";
import { store, subscribe, startData, stopData } from "./data.js";
import { $, $$, icon, say, topSheet, isNative, setHalo, setHaloBase } from "./ui.js";
import { renderCloset } from "./views/closet.js";
import { renderToday } from "./views/today.js";
import { renderStyle } from "./views/style.js";
import { renderShop } from "./views/shop.js";
import { renderProfile, runOnboarding } from "./views/profile.js";
import { openAdd } from "./views/add.js";
import { startUpdater } from "./updater.js";

translateDom();
$$("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)));
window.__booted = true; // el código ha cargado (index.html deja de vigilar el arranque)
// si una parte de la app que se carga al momento ya no existe (versión nueva publicada), recargar
window.addEventListener("vite:preloadError", (e) => { e.preventDefault?.(); try { if (sessionStorage.getItem("chunk-retry") === "1") return; sessionStorage.setItem("chunk-retry", "1"); } catch {} location.reload(); });
const boot = $("#boot");
const hideBoot = () => { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); };

/* ---------- acceso ---------- */
const AUTH_ERR = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.", "auth/wrong-password": "Contraseña incorrecta.",
  "auth/user-not-found": "No hay ninguna cuenta con ese correo.", "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Entra con ella.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.", "auth/invalid-email": "Ese correo no es válido.",
  "auth/network-request-failed": "Sin conexión. Comprueba tu internet.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  "auth/popup-blocked": "El navegador ha bloqueado la ventana de Google. Permite ventanas emergentes para esta página y vuelve a probar.",
  "auth/account-exists-with-different-credential": "Ese correo ya tiene cuenta con contraseña. Entra con la contraseña.",
  "auth/unauthorized-domain": "Esta dirección no está autorizada para entrar con Google.",
};
const CANCELLED = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/google-cancelled"];
let mode = "login";
$("#authSwitch").onclick = () => {
  mode = mode === "login" ? "signup" : "login";
  $("#authSubmit").textContent = t(mode === "login" ? "auth.login" : "auth.signup");
  $("#authSwitch").textContent = t(mode === "login" ? "auth.toSignup" : "auth.toLogin");
  $("#authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
  say("#authStatus", "");
};
$("#googleBtn").onclick = async () => {
  if (!configured) return say("#authStatus", t("auth.notConfigured"), "error");
  $("#googleBtn").disabled = true; say("#authStatus", t("auth.opening"));
  try { await logInWithGoogle(); }
  catch (err) {
    const cancelled = CANCELLED.includes(err?.code) || /cancel/i.test(String(err?.message || err?.code || ""));
    say("#authStatus", cancelled ? "" : (AUTH_ERR[err?.code] || "No se ha podido entrar con Google. Inténtalo de nuevo."), cancelled ? "" : "error");
  } finally { $("#googleBtn").disabled = false; }
};
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!configured) return say("#authStatus", t("auth.notConfigured"), "error");
  const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
  $("#authSubmit").disabled = true; say("#authStatus", t(mode === "login" ? "auth.entering" : "auth.creating"));
  try { mode === "login" ? await logIn(email, pass) : await register(email, pass); }
  catch (err) { say("#authStatus", AUTH_ERR[err.code] || "No se ha podido entrar. Inténtalo de nuevo.", "error"); }
  finally { $("#authSubmit").disabled = false; }
});
$("#authForgot").onclick = async () => {
  const email = $("#authEmail").value.trim();
  if (!email) return say("#authStatus", t("auth.resetNeedsEmail"), "error");
  try { await resetPassword(email); say("#authStatus", t("auth.resetSent"), "ok"); }
  catch (err) { say("#authStatus", AUTH_ERR[err.code] || "No se ha podido enviar el correo.", "error"); }
};

/* ---------- secciones ---------- */
let view = $("#view"); // let: al deslizar, la capa de la pantalla vecina pasa a ser #view (sin volver a pintarla)
let cleanup = null;
const soon = (k) => (v) => {
  v.innerHTML = `<div class="soon"><div class="soon-card"><div class="soon-orb"></div><span class="pill">${t(`soon.${k}.phase`)}</span><h1 class="display">${t(`soon.${k}.title`)}</h1><p>${t(`soon.${k}.body`)}</p></div></div>`;
};
const ROUTES = { hoy: (v) => renderToday(v), outfits: (v) => renderToday(v, "outfits"), armario: renderCloset, compras: renderShop, perfil: renderProfile, estilo: renderStyle };
const DEFAULT = "hoy";

function route() {
  if (!store.ready.profile || $("#app").hidden) return;
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const r = ROUTES[name] ? name : DEFAULT;
  if (!ROUTES[name]) history.replaceState(null, "", `#/${DEFAULT}`);
  const navR = r;
  $$("#nav a").forEach((a) => (a.dataset.route === navR ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (adopted === r) { adopted = null; return; } // ya pintada al deslizar
  if (cleanup) cleanup();
  setHalo(null);
  view.classList.remove("settled");
  cleanup = ROUTES[r](view) || null;
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);

// Deslizar el dedo de lado = pantalla siguiente/anterior, en el orden de la barra (Polete, 10/11/2026).
// Como en Instagram (3.ª versión, «que vea la pantalla a la que deslizo»): al empezar a arrastrar se pinta la pantalla vecina
// en una capa (.view.peek) pegada al lado; las dos siguen al dedo. Al soltar, si has pasado el 25 % del ancho o lo has lanzado
// rápido, termina de entrar la vecina; si no, vuelven las dos. Mientras se pinta la vecina, window.__peek evita que cambie el halo.
// No se activa si el gesto empieza en algo que ya se desliza de lado (carruseles, pestañas, chips), en un campo,
// en el lienzo del outfit al colocar prendas, ni pegado al borde (ahí está el gesto «atrás» de Android).
const SWIPE_ORDER = ["hoy", "armario", "outfits", "estilo", "compras", "perfil"];
const EASE = "cubic-bezier(.22,.8,.25,1)";
let sw = null, peek = null, adopted = null; // peek = { el, name, dir, cleanup, halo }
const scrollsX = (el) => {
  for (let e = el; e && e !== view; e = e.parentElement) {
    if (e.matches?.("input, textarea, select, [contenteditable], .board.editing, .board.editing *, [data-noswipe]")) return true;
    if (e.scrollWidth > e.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
};
const curIndex = () => SWIPE_ORDER.indexOf((location.hash.match(/^#\/(\w+)/) || [])[1] || DEFAULT);
const move = (el, x, ms) => { if (!el) return; el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none"; el.style.transform = `translate3d(${x}px,0,0)`; };
const clearView = () => { view.style.transition = view.style.transform = view.style.willChange = ""; };
function dropPeek() { if (!peek) return; try { peek.cleanup?.(); } catch {} peek.el.remove(); peek = null; }
function buildPeek(name, dir) {
  if (peek?.name === name) return peek;
  dropPeek();
  const el = document.createElement("div");
  el.className = "view peek settled"; el.setAttribute("aria-hidden", "true"); el.inert = true;
  $("#app").appendChild(el);
  window.__peek = true; window.__peekHalo = null;
  let cleanup = null;
  try { cleanup = ROUTES[name](el) || null; } catch {} finally { window.__peek = false; }
  return (peek = { el, name, dir, cleanup, halo: window.__peekHalo });
}
$("#app").addEventListener("touchstart", (e) => {
  if (!view.contains(e.target)) return void (sw = null);
  const tp = e.touches[0];
  sw = e.touches.length === 1 && tp.clientX > 28 && tp.clientX < innerWidth - 28 && !document.body.classList.contains("has-sheet") && !scrollsX(e.target)
    ? { x: tp.clientX, y: tp.clientY, lock: null, dx: 0, pts: [[tp.clientX, performance.now()]] } : null;
}, { passive: true });
$("#app").addEventListener("touchmove", (e) => {
  if (!sw) return;
  const tp = e.touches[0], dx = tp.clientX - sw.x, dy = tp.clientY - sw.y;
  if (!sw.lock) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    sw.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y"; // se decide la dirección una vez
    if (sw.lock === "y") { sw = null; return; }
    view.style.willChange = "transform";
  }
  e.preventDefault(); // mientras se arrastra de lado, la página no hace scroll
  const i = curIndex(), dir = dx < 0 ? 1 : -1, next = i >= 0 ? SWIPE_ORDER[i + dir] : null;
  sw.dx = next ? dx : dx * 0.25; // en la primera/última pantalla, resistencia de goma
  sw.pts.push([tp.clientX, performance.now()]); if (sw.pts.length > 5) sw.pts.shift();
  if (next) { const p = buildPeek(next, dir); move(p.el, sw.dx + dir * innerWidth); } else dropPeek();
  move(view, sw.dx);
}, { passive: false });
function endSwipe() {
  if (!sw) return;
  const s = sw; sw = null;
  if (s.lock !== "x") return;
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]], v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]); // px/ms
  const i = curIndex(), dir = s.dx < 0 ? 1 : -1, next = SWIPE_ORDER[i + dir];
  const go = i >= 0 && next && peek?.name === next && (Math.abs(s.dx) > innerWidth * 0.25 || (Math.abs(v) > 0.45 && Math.sign(v) === Math.sign(s.dx) && Math.abs(s.dx) > 30));
  if (!go) { // vuelven las dos
    move(view, 0, 240); if (peek) move(peek.el, dir * innerWidth, 240);
    setTimeout(() => { clearView(); dropPeek(); }, 250);
    return;
  }
  const ms = Math.round(Math.max(140, Math.min(260, (innerWidth - Math.abs(s.dx)) / Math.max(1.1, Math.abs(v))))); // al ritmo del dedo
  move(view, -dir * innerWidth, ms); move(peek.el, 0, ms);
  setTimeout(() => {
    // la vecina ya ocupa la pantalla: la capa PASA A SER #view tal cual (sin volver a pintarla: así no parpadea)
    const old = view, p = peek; peek = null;
    if (cleanup) { try { cleanup(); } catch {} }
    cleanup = p.cleanup || null;
    // sin mover el nodo de sitio (moverlo reinicia las animaciones de entrada de las prendas = parpadeo): se quita la vieja
    // y la capa, que ya estaba detrás en #app, queda en su lugar. «settled» = sin animaciones de entrada en lo ya pintado
    old.remove();
    p.el.className = "view settled"; p.el.id = "view"; p.el.tabIndex = -1; p.el.removeAttribute("aria-hidden"); p.el.inert = false;
    p.el.style.cssText = "";
    view = p.el;
    window.scrollTo(0, 0);
    if (p.halo) setHalo(...p.halo); else setHalo(null);
    adopted = next; location.hash = `#/${next}`;
  }, ms);
}
$("#app").addEventListener("touchend", endSwipe, { passive: true });
$("#app").addEventListener("touchcancel", () => { if (sw?.lock === "x") { sw = null; move(view, 0, 200); setTimeout(() => { clearView(); dropPeek(); }, 210); } else sw = null; }, { passive: true });
$("#addBtn").onclick = () => openAdd();

// arrastrar una foto a cualquier parte en el ordenador = añadir prenda
document.addEventListener("dragover", (e) => { if (!$("#app").hidden && !topSheet()) e.preventDefault(); });
document.addEventListener("drop", (e) => {
  if ($("#app").hidden || topSheet()) return;
  const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
  if (f) { e.preventDefault(); openAdd(f); }
});

/* ---------- sesión ---------- */
let unsubStore = null, unsubAccess = null, onboarding = false, autoChecked = false;
/** Pantalla mientras un administrador aprueba la cuenta. */
function showWaiting(st) {
  const host = $("#onboarding"), u = auth.currentUser;
  $("#app").hidden = true; host.hidden = false;
  host.innerHTML = `<div class="onb-inner"><div class="onb-step">
    <div class="empty-art">${icon(st === "denegado" ? "close" : "spark")}</div>
    <h1 class="display">${t(st === "denegado" ? "access.deniedTitle" : "access.waitTitle")}</h1>
    <p class="lead">${t(st === "denegado" ? "access.deniedBody" : "access.waitBody")}</p>
    <p class="muted small">${t("access.as", { who: (u?.email || u?.displayName || "").replace(/[<>&]/g, "") })}</p>
    <div class="row wrap"><button class="btn" type="button" id="accOut">${icon("logout")}${t("profile.signOut")}</button></div>
  </div></div>`;
  $("#accOut", host).onclick = () => logOut();
}
watchAuth((user) => {
  unsubStore?.(); unsubStore = null; unsubAccess?.(); unsubAccess = null; cleanup?.(); cleanup = null;
  while (topSheet()) topSheet().close();
  hideBoot();
  $("#authView").hidden = !!user;
  if (!user) { stopData(); $("#app").hidden = true; $("#onboarding").hidden = true; return; }
  // primero, ¿tiene acceso? (los administradores siempre; el resto, cuando lo aprueban)
  let opened = false;
  unsubAccess = watchAccess((st) => {
    if (st === "aprobado" || st === "error") { if (!opened) { opened = true; $("#onboarding").hidden = true; $("#onboarding").innerHTML = ""; openApp(); } return; }
    if (opened) { opened = false; unsubStore?.(); unsubStore = null; cleanup?.(); cleanup = null; stopData(); }
    showWaiting(st);
  });
});
function openApp() {
  startData();
  let started = false;
  let baseKey = "";
  unsubStore = subscribe(() => {
    // color secundario de fondo: la paleta de tu estilo (si no hay, el gris de serie)
    const pal = store.style?.palette || [], k = pal.slice(0, 3).map((p) => p.hex).join();
    if (k !== baseKey) { baseKey = k; setHaloBase(pal[0]?.hex, pal[1]?.hex || pal[2]?.hex); }
    if (!store.ready.profile) return;
    setLanguage(store.profile.language || "es"); translateDom();
    if (getLanguage() !== "es" && !window.__i18nChecked) { window.__i18nChecked = true; ensureLanguage(getLanguage()).then((n) => { if (n) { setLanguage(getLanguage()); translateDom(); route(); } }).catch(() => {}); }
    if (!store.profile.onboarded && !onboarding && !started) {
      onboarding = true; $("#app").hidden = true;
      runOnboarding($("#onboarding"), () => { onboarding = false; started = true; $("#app").hidden = false; route(); });
      return;
    }
    if (!started && !onboarding) { started = true; $("#app").hidden = false; route(); }
    // cada 3 días mira si tus tableros de Pinterest tienen pines nuevos (en segundo plano)
    if (started && !autoChecked && store.ready.style !== false) { autoChecked = true; setTimeout(() => import("./stylesync.js").then((m) => m.autoRefresh()).catch(() => {}), 6000); }
  });
}

/* ---------- Android: botón atrás ---------- */
if (isNative) {
  App.addListener("backButton", () => {
    const s = topSheet();
    if (s) return s.close();
    if (!location.hash.startsWith(`#/${DEFAULT}`)) { location.hash = `#/${DEFAULT}`; return; }
    App.minimizeApp();
  });
}

/* ---------- web instalable ---------- */
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installEvt = e; });
// también en el APK (carga la web publicada): así se abre y se usa el armario sin conexión
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(() => {
    // guardar todo lo que la app ha cargado (y lo que vaya cargando: pantallas que se abren al momento)
    const send = () => navigator.serviceWorker.controller?.postMessage({ type: "cache", urls: performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.startsWith(location.origin) && u.includes("/assets/")) });
    setTimeout(send, 8000); setInterval(send, 5 * 60 * 1000);
  }).catch(() => {});
}
// aviso de sin conexión: el armario, el calendario y los outfits de la app siguen funcionando
const netState = () => { document.body.classList.toggle("is-offline", !navigator.onLine); };
window.addEventListener("offline", () => { netState(); toastOffline(); });
window.addEventListener("online", netState);
netState();
function toastOffline() { import("./ui.js").then((m) => m.toast(t("offline.toast"))); }

/* ---------- actualizaciones ---------- */
startUpdater();
import("./native.js").then((m) => m.listenReminder()).catch(() => {});
