import { locale } from "./i18n.js";
// Funciones del móvil: plan del día desde el calendario, dictar el plan por voz y aviso cada mañana.
// En el ordenador: voz con el reconocimiento del navegador (si lo tiene); calendario y avisos solo en el APK.
import { Capacitor } from "@capacitor/core";
import { isNative } from "./ui.js";

const has = (name) => isNative && Capacitor.isPluginAvailable(name);
export const canCalendar = () => has("CapacitorCalendar");
export const canNotify = () => has("LocalNotifications");
export const canVoice = () => has("SpeechRecognition") || (!isNative && !!(window.SpeechRecognition || window.webkitSpeechRecognition));

/** Planes de hoy del calendario del móvil (incluye Google Calendar si está sincronizado): «10:00 Clase · 18:30 Cena». */
export async function planFromCalendar(date = new Date()) {
  const { CapacitorCalendar } = await import("@ebarooni/capacitor-calendar");
  const p = await CapacitorCalendar.requestReadOnlyCalendarAccess();
  if (p.result !== "granted") throw new Error("Sin permiso para leer el calendario. Actívalo en Ajustes → Aplicaciones → Armario Atelier → Permisos.");
  const from = new Date(date); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  const { result } = await CapacitorCalendar.listEventsInRange({ from: from.getTime(), to: to.getTime() });
  const hhmm = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const evs = (result || []).filter((e) => e.title).sort((a, b) => a.startDate - b.startDate);
  return evs.map((e) => `${e.isAllDay ? "" : hhmm(e.startDate) + " "}${e.title}${e.location ? ` (${e.location})` : ""}`).join(" · ");
}

/** Dicta el plan: devuelve el texto reconocido (castellano). */
export async function planByVoice() {
  if (has("SpeechRecognition")) {
    const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error("El reconocimiento de voz no está disponible en este móvil.");
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new Error("Sin permiso para el micrófono. Actívalo en los ajustes de la app.");
    const r = await SpeechRecognition.start({ language: locale(), maxResults: 1, popup: true, partialResults: false, prompt: "¿Qué vas a hacer hoy?" });
    return r.matches?.[0] || "";
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error("Tu navegador no permite dictar.");
  return new Promise((resolve, reject) => {
    const rec = new SR(); rec.lang = locale(); rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => resolve(e.results[0][0].transcript);
    rec.onerror = (e) => reject(new Error(e.error === "not-allowed" ? "Sin permiso para el micrófono." : "No te he entendido. Prueba otra vez."));
    rec.onend = () => resolve("");
    rec.start();
  });
}

/** Activa (pide permiso) o quita el aviso de la mañana. Lo programa morning.js con el outfit del día. */
export async function setMorningReminder(time) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  if (!time) { await LocalNotifications.cancel({ notifications: [801, 802, 803, 804, 805, 806, 807].map((id) => ({ id })) }).catch(() => {}); return; }
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") throw new Error("Sin permiso para avisos. Actívalos en Ajustes → Aplicaciones → Armario Atelier → Notificaciones.");
}
