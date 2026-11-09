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
const view = $("#view");
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
  if (cleanup) cleanup();
  setHalo(null);
  cleanup = ROUTES[r](view) || null;
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);
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
