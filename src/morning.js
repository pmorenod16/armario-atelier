// Outfit listo al despertar (13/11/2026). El aviso de la mañana (perfil.reminder "HH:MM") ya no es un recordatorio fijo:
// trae el outfit del día preparado por el motor de la app (sin IA, al instante) con el tiempo de ese día y, si el calendario
// está conectado, tus planes. Las notificaciones se programan desde la app (Android no deja calcular nada a esa hora), así
// que se preparan cada vez que abres la app y cuando la dejas: el siguiente aviso con su outfit, y los 6 días siguientes un
// aviso normal por si no abres la app. Desde la notificación: «Me lo pongo» (lo apunta) u «Otras opciones» (abre Hoy).
// El outfit se guarda como propuesta de Hoy/Mañana (si ya tenías propuestas para ese día, se usa la primera; si ya lo
// apuntaste, el aviso solo te lo recuerda).
import { t } from "./i18n.js";
import { store, saveToday, dayPlan, todayKey, logWear } from "./data.js";
import { isWomen, BRA_TYPES } from "./catalog.js";
import { suggestOutfits, ensureGlasses, pickSocks, pickUnder } from "./engine.js";
import { todayWeather, describe } from "./weather.js";
import { canNotify, canCalendar, planFromCalendar } from "./native.js";
import { toast } from "./ui.js";

const MAIN = 801, REST = [802, 803, 804, 805, 806, 807];
let lastRun = 0, running = null;

const at = (date, hhmm) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(date); d.setHours(h, m, 0, 0); return d; };
const extrasFor = (ids, temp) => {
  const its = ids.map((id) => store.items.find((i) => i.id === id)).filter(Boolean);
  return [pickSocks(its, store.items, { temp })?.id, isWomen() ? pickUnder(its, store.items)?.id : null].filter(Boolean);
};

/** Prepara el outfit del próximo aviso y programa las notificaciones. force = sin esperar (al cambiar la hora del aviso). */
export function prepareMorning(force = false) {
  if (!canNotify() || !store.ready.items || !store.ready.profile) return Promise.resolve();
  if (running) return running;
  if (!force && Date.now() - lastRun < 10 * 60e3) return Promise.resolve();
  lastRun = Date.now();
  running = run().catch((e) => console.warn("aviso de la mañana", e)).finally(() => { running = null; });
  return running;
}

async function run() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: [MAIN, ...REST].map((id) => ({ id })) }).catch(() => {});
  const time = store.profile?.reminder;
  if (!time) return;
  await registerActions(LocalNotifications);
  // el próximo aviso: hoy si aún no ha llegado la hora (y no has apuntado nada), si no mañana
  const now = new Date();
  let day = now < at(now, time) && !store.wear.some((w) => w.date === todayKey()) ? now : new Date(now.getTime() + 864e5);
  const key = todayKey(day), off = key === todayKey() ? 0 : 1;
  const when = at(day, time);
  const n = await outfitNotice(key, off).catch((e) => { console.warn("outfit del aviso", e); return null; });
  const notes = [{
    id: MAIN, schedule: { at: when, allowWhileIdle: true },
    ...(n || { title: t("remind.genTitle"), body: t("remind.genBody") }),
  }];
  // por si no abres la app en unos días: aviso normal (el outfit se prepara al abrirla)
  REST.forEach((id, i) => notes.push({ id, title: t("remind.genTitle"), body: t("remind.genBody"), schedule: { at: at(new Date(when.getTime() + (i + 1) * 864e5), time), allowWhileIdle: true } }));
  await LocalNotifications.schedule({ notifications: notes });
}

/** Título, texto y datos de la notificación con el outfit del día `key` (lo prepara si no hay). */
export async function outfitNotice(key, off) {
  const worn = store.wear.find((w) => w.date === key);
  const names = (ids) => ids.map((id) => store.items.find((i) => i.id === id)?.name).filter(Boolean).join(" · ");
  if (worn) return { title: t("morning.readyTitle", { title: worn.title || t("today.yourOutfit") }), body: names(worn.itemIds), extra: { open: "hoy" } };
  let plan = dayPlan(key), wx = null;
  const place = store.profile.places?.find((x) => x.id === store.profile.activePlace) || store.profile.places?.[0];
  if (place) wx = await todayWeather(place, off).catch(() => null);
  if (!plan?.outfits?.length) {
    const avail = store.items.filter((i) => i.status === "disponible" && i.layer !== "under" && !BRA_TYPES.has(i.type) && i.type !== "calcetines");
    if (avail.length < 2) return null;
    let planText = plan?.plan || "";
    if (!planText && store.profile?.calAuto && canCalendar()) planText = await planFromCalendar(new Date(Date.parse(key + "T12:00:00"))).catch(() => "") || "";
    const r = suggestOutfits({ items: avail, weather: wx, plan: planText || t("today.defaultPlan"), style: store.style, wear: store.wear, feedback: store.feedback, count: 4, date: new Date(Date.parse(key + "T12:00:00")) });
    if (!r.outfits?.length) return null;
    const outfits = ensureGlasses(r.outfits, store.items);
    plan = { date: key, plan: planText, placeId: place?.id || null, weather: wx ? { t: wx.now.t, min: wx.min, max: wx.max, code: wx.code } : null, outfits, missing: r.missing || null, auto: true };
    await saveToday(plan, off ? "tomorrow" : "today");
  }
  const o = plan.outfits[0];
  const w = plan.weather || (wx && { min: wx.min, max: wx.max, code: wx.code });
  const wline = w ? `${describe(w.code).text} · ${w.min}–${w.max} °C\n` : "";
  return {
    title: t("morning.title", { title: o.title }),
    body: wline + names(o.itemIds),
    actionTypeId: "outfit",
    extra: { date: key, itemIds: o.itemIds, title: o.title, how: o.how || [], plan: plan.plan || "", temp: plan.weather?.t ?? null, weather: plan.weather || null },
  };
}

let actionsDone = false;
async function registerActions(LN) {
  if (actionsDone) return; actionsDone = true;
  await LN.registerActionTypes({ types: [{ id: "outfit", actions: [
    { id: "wear", title: t("morning.wear"), foreground: true },
    { id: "other", title: t("morning.other"), foreground: true },
  ] }] }).catch(() => {});
}

/** Al tocar la notificación o sus botones (también si la app estaba cerrada: Capacitor guarda el evento). */
export async function listenMorning() {
  if (!canNotify()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  LocalNotifications.addListener("localNotificationActionPerformed", async (ev) => {
    const x = ev?.notification?.extra;
    if (x?.open === "deseos") { (await import("./views/shop.js")).showShopTab("wish"); location.hash = "#/compras"; return; }
    location.hash = "#/hoy";
    if (ev?.actionId !== "wear" || !x?.itemIds?.length) return;
    await until(() => store.ready.items && store.ready.profile);
    if (store.wear.some((w) => w.date === x.date)) return toast(t("today.wornSaved"));
    try {
      await logWear({ date: x.date, itemIds: x.itemIds, extraIds: extrasFor(x.itemIds, x.temp), title: x.title, plan: x.plan, how: x.how, weather: x.weather });
      toast(t("today.wornSaved"));
    } catch { toast(t("item.saveFail"), "error"); }
  });
}
const until = (fn) => new Promise((res) => { const tick = () => (fn() ? res() : setTimeout(tick, 300)); tick(); });
