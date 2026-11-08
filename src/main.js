// Arranque: acceso, bienvenida, navegación entre secciones y botón atrás de Android.
import "@fontsource-variable/geist";
import "@fontsource-variable/bricolage-grotesque";
import "./styles.css";
import { App } from "@capacitor/app";
import { t, translateDom, setLanguage } from "./i18n.js";
import { configured, watchAuth, logIn, register, resetPassword, logInWithGoogle } from "./firebase.js";
import { store, subscribe, startData, stopData } from "./data.js";
import { $, $$, icon, say, topSheet, isNative, setHalo } from "./ui.js";
import { renderCloset } from "./views/closet.js";
import { renderToday } from "./views/today.js";
import { renderStyle } from "./views/style.js";
import { renderProfile, runOnboarding } from "./views/profile.js";
import { openAdd } from "./views/add.js";

translateDom();
$$("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)));
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
const ROUTES = { hoy: renderToday, armario: renderCloset, compras: soon("shop"), perfil: renderProfile, estilo: renderStyle };
const DEFAULT = "hoy";

function route() {
  if (!store.ready.profile || $("#app").hidden) return;
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const r = ROUTES[name] ? name : DEFAULT;
  if (!ROUTES[name]) history.replaceState(null, "", `#/${DEFAULT}`);
  const navR = r === "estilo" ? "perfil" : r;
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
let unsubStore = null, onboarding = false;
watchAuth((user) => {
  unsubStore?.(); unsubStore = null; cleanup?.(); cleanup = null;
  while (topSheet()) topSheet().close();
  hideBoot();
  $("#authView").hidden = !!user;
  if (!user) { stopData(); $("#app").hidden = true; $("#onboarding").hidden = true; return; }
  startData();
  let started = false;
  unsubStore = subscribe(() => {
    if (!store.ready.profile) return;
    setLanguage(store.profile.language || "es");
    if (!store.profile.onboarded && !onboarding && !started) {
      onboarding = true; $("#app").hidden = true;
      runOnboarding($("#onboarding"), () => { onboarding = false; started = true; $("#app").hidden = false; route(); });
      return;
    }
    if (!started && !onboarding) { started = true; $("#app").hidden = false; route(); }
  });
});

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
if (!isNative && import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
