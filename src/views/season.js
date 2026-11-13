// Cambio de temporada (13/11/2026). Con la previsión de los próximos 10 días (Open-Meteo, sin clave; se guarda un día en el
// móvil) la app decide si toca el armario de calor (máximas medias ≥ 22 °C), de frío (≤ 15 °C) o de entretiempo, y propone:
// · guardar lo que es solo de la otra temporada (sus temporadas no incluyen ninguna de las de ahora),
// · sacar lo guardado que vuelve a tocar.
// Lo guardado pasa al estado «guardada»: no sale en outfits, maleta ni compras (como tintorería) pero sigue en tu armario.
// Se avisa en Armario y en Hoy una vez por cambio (perfil.seasonDone = clave del cambio, también al decir «Ahora no»).
// Prendas sin temporadas, de todo el año, ropa interior y calcetines no se tocan.
import { t } from "../i18n.js";
import { esc, icon, openSheet, toast } from "../ui.js";
import { store, saveProfile, setStatusMany, todayKey } from "../data.js";
import { TYPE } from "../catalog.js";
import { tripWeather } from "../weather.js";
import { tintFor } from "./add.js";

const NOW_SEASONS = { calor: ["verano", "primavera"], frio: ["invierno", "otono"], entre: null };
const LS = "season:wx";

/** Máxima media de los próximos días (guardada un día en el móvil; una sola consulta a la vez). */
let wxJob = null;
const avgMax = () => (wxJob ||= readAvgMax().finally(() => setTimeout(() => { wxJob = null; }, 60e3)));
async function readAvgMax() {
  try { const c = JSON.parse(localStorage.getItem(LS) || "null"); if (c?.date === todayKey()) return c.v; } catch { /* sin caché */ }
  const p = store.profile; const place = p?.places?.find((x) => x.id === p.activePlace) || p?.places?.[0];
  if (!place) return null;
  const w = await tripWeather(place, todayKey(), 10);
  const v = Math.round(w.days.reduce((a, d) => a + d.max, 0) / w.days.length);
  try { localStorage.setItem(LS, JSON.stringify({ date: todayKey(), v })); } catch { /* da igual */ }
  return v;
}
const modeOf = (max) => (max == null ? null : max >= 22 ? "calor" : max <= 15 ? "frio" : "entre");
// entretiempo: primavera (feb-jun) u otoño (jul-ene)
const midSeason = () => ([1, 2, 3, 4, 5].includes(new Date().getMonth()) ? "primavera" : "otono");

const seasonal = (it) => Array.isArray(it.seasons) && it.seasons.length > 0 && it.seasons.length < 4 && it.layer !== "under" && it.type !== "calcetines" && TYPE[it.type];

/** {mode, key, store[], out[]} con lo que toca mover ahora, o null. */
export async function seasonPlan() {
  if (!store.items.length) return null;
  const mode = modeOf(await avgMax().catch(() => null));
  if (!mode) return null;
  const now = NOW_SEASONS[mode] || [midSeason()];
  const fits = (it) => it.seasons.some((s) => now.includes(s));
  const toStore = mode === "entre" ? [] : store.items.filter((it) => seasonal(it) && it.status === "disponible" && !fits(it));
  const toOut = store.items.filter((it) => it.status === "guardada" && (!seasonal(it) || fits(it)));
  const d = new Date();
  const key = `${mode}-${d.getFullYear()}-${d.getMonth() < 7 ? "a" : "b"}`;
  return { mode, key, store: toStore, out: toOut };
}

/** Aviso para Armario/Hoy (o "" si no toca o ya se hizo/descartó). */
export async function seasonNoteHTML() {
  const p = await seasonPlan().catch(() => null);
  if (!p || p.store.length + p.out.length < 2 || store.profile?.seasonDone === p.key) return "";
  const parts = [p.store.length && t("season.partStore." + p.mode, { a: p.store.length }), p.out.length && t("season.partOut", { b: p.out.length })].filter(Boolean);
  return `<button type="button" class="notice season-note" data-season>${icon("box")} <span>${t("season.head." + p.mode)}: ${parts.join(" · ")}</span>${icon("chevron")}</button>`;
}

export async function openSeason() {
  const p = await seasonPlan().catch(() => null);
  if (!p) { toast(t("season.noWeather"), "error"); return; }
  const sel = new Set([...p.store, ...p.out].map((i) => i.id));
  const grid = (list) => `<div class="pick-grid">${list.map((it) => `<button type="button" class="pick" data-id="${it.id}" aria-pressed="true" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy">` : ""}<span>${esc(it.name)}</span><i>${icon("check")}</i></button>`).join("")}</div>`;
  const sh = openSheet(`<div class="sheet-head"><h2 class="display">${t("season.title")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <p class="muted">${t("season.why." + p.mode)}</p>
    ${p.store.length ? `<div class="section"><h3>${icon("box")} ${t("season.toStore", { n: p.store.length })}</h3><p class="muted small">${t("season.storeHint")}</p>${grid(p.store)}</div>` : ""}
    ${p.out.length ? `<div class="section"><h3>${icon("closet")} ${t("season.toOut", { n: p.out.length })}</h3>${grid(p.out)}</div>` : ""}
    ${!p.store.length && !p.out.length ? `<p class="muted">${t("season.nothing")}</p>` : ""}
    <div class="sheet-foot"><button class="btn" type="button" id="later">${t("season.later")}</button>${p.store.length + p.out.length ? `<button class="btn primary" type="button" id="apply">${icon("check")}${t("season.apply")}</button>` : ""}</div>`, { label: t("season.title"), wide: true });
  sh.el.onclick = async (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    const b = e.target.closest(".pick");
    if (b) { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); on ? sel.add(b.dataset.id) : sel.delete(b.dataset.id); return; }
    if (e.target.closest("#later")) { store.profile.seasonDone = p.key; saveProfile({ seasonDone: p.key }).catch(() => {}); sh.close(); return; }
    if (e.target.closest("#apply")) {
      const away = p.store.filter((i) => sel.has(i.id)).map((i) => i.id), back = p.out.filter((i) => sel.has(i.id)).map((i) => i.id);
      try {
        await setStatusMany(away, "guardada"); await setStatusMany(back, "disponible");
        store.profile.seasonDone = p.key; await saveProfile({ seasonDone: p.key });
        sh.close(); toast(t("season.done", { a: away.length, b: back.length }));
      } catch { toast(t("item.saveFail"), "error"); }
    }
  };
}
