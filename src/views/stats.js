// Estadísticas del armario (sin coste por uso, por decisión de Polete): qué usas de verdad,
// qué lleva meses sin salir del armario (¿donar o vender?), lo más puesto y lo que aún no has estrenado.
import { t, locale } from "../i18n.js";
import { esc, icon, openSheet } from "../ui.js";
import { store, wornIds, todayKey } from "../data.js";
import { GROUPS, COLOR, label, groupOf } from "../catalog.js";
import { openItem } from "./item.js";

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
// la ropa interior y los calcetines no cuentan para «qué parte del armario usas»
const counts = (it) => !["interior", "calcetines"].includes(groupOf(it.type)?.k);

export function openStats() {
  const items = store.items.filter(counts);
  const wear = store.wear || [];
  const usedSince = (d) => new Set(wear.filter((w) => w.date >= d).flatMap(wornIds));
  const u30 = usedSince(daysAgo(30)), u90 = usedSince(daysAgo(90));
  const pct = (set) => (items.length ? Math.round((items.filter((i) => set.has(i.id)).length / items.length) * 100) : 0);
  const p30 = pct(u30), p90 = pct(u90);

  // seis meses sin ponérselo (o nunca, y lleva más de seis meses en el armario)
  const limit = daysAgo(180);
  const forgotten = items.filter((i) => (i.lastWorn ? i.lastWorn < limit : (i.createdAt || 0) < Date.now() - 180 * DAY))
    .sort((a, b) => (a.lastWorn || "").localeCompare(b.lastWorn || ""));
  const unworn = items.filter((i) => !i.wearCount && !forgotten.includes(i));
  const top = items.filter((i) => i.wearCount).sort((a, b) => b.wearCount - a.wearCount).slice(0, 6);

  // por categoría: cuántas tienes y qué parte has usado en 90 días
  const byGroup = GROUPS.map((g) => {
    const list = items.filter((i) => groupOf(i.type)?.k === g.k);
    return { g, n: list.length, used: list.filter((i) => u90.has(i.id)).length };
  }).filter((x) => x.n);

  // colores que más te pones (por usos)
  const colorUse = new Map();
  items.forEach((i) => { const k = i.colors?.[0]?.k; if (k && i.wearCount) colorUse.set(k, (colorUse.get(k) || 0) + i.wearCount); });
  const colors = [...colorUse].sort((a, b) => b[1] - a[1]).slice(0, 6), cmax = colors[0]?.[1] || 1;

  const month = todayKey().slice(0, 7), daysLogged = wear.filter((w) => w.date.startsWith(month)).length;

  const mini = (list) => `<div class="stats-items">${list.map((i) => `<button type="button" class="stats-item" data-item="${i.id}">${i.thumb ? `<img src="${i.thumb}" alt="">` : ""}<span>${esc(i.name)}</span><small>${i.lastWorn ? t("stats.lastWorn", { d: fmt(i.lastWorn) }) : t("stats.never")}</small></button>`).join("")}</div>`;

  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("stats.title")}</h2><button class="btn icon ghost" type="button" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="stats">
      <div class="stats-kpis">
        <div class="kpi"><b>${items.length}</b><span>${t("stats.items")}</span></div>
        <div class="kpi"><b>${p30}%</b><span>${t("stats.used30")}</span></div>
        <div class="kpi"><b>${p90}%</b><span>${t("stats.used90")}</span></div>
        <div class="kpi"><b>${daysLogged}</b><span>${t("stats.daysMonth")}</span></div>
      </div>
      <p class="muted small">${p90 >= 70 ? t("stats.goodUse") : p90 >= 40 ? t("stats.midUse") : t("stats.lowUse")}</p>

      <section><h3>${t("stats.forgotten", { n: forgotten.length })}</h3>
        ${forgotten.length ? `<p class="muted small">${t("stats.forgottenHint")}</p>${mini(forgotten.slice(0, 12))}` : `<p class="muted small">${t("stats.noForgotten")}</p>`}</section>

      ${unworn.length ? `<section><h3>${t("stats.unworn", { n: unworn.length })}</h3><p class="muted small">${t("stats.unwornHint")}</p>${mini(unworn.slice(0, 12))}</section>` : ""}

      ${top.length ? `<section><h3>${t("stats.top")}</h3><div class="stats-items">${top.map((i) => `<button type="button" class="stats-item" data-item="${i.id}">${i.thumb ? `<img src="${i.thumb}" alt="">` : ""}<span>${esc(i.name)}</span><small>${t("stats.uses", { n: i.wearCount })}</small></button>`).join("")}</div></section>` : ""}

      <section><h3>${t("stats.byGroup")}</h3>
        ${byGroup.map((x) => `<div class="bar-row"><span>${esc(label(x.g))}</span><div class="bar"><i style="width:${Math.round((x.used / x.n) * 100)}%"></i></div><small>${x.used}/${x.n}</small></div>`).join("")}
        <p class="muted small">${t("stats.byGroupHint")}</p></section>

      ${colors.length ? `<section><h3>${t("stats.colors")}</h3>${colors.map(([k, n]) => `<div class="bar-row"><span><i class="dot" style="background:${COLOR[k]?.hex || "#999"}"></i>${esc(label(COLOR[k]) || k)}</span><div class="bar"><i style="width:${Math.round((n / cmax) * 100)}%;background:${COLOR[k]?.hex || "var(--ink)"}"></i></div><small>${n}</small></div>`).join("")}</section>` : ""}
    </div>`, { label: t("stats.title"), wide: true });
  sh.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    const b = e.target.closest("[data-item]"); if (b) openItem(b.dataset.item);
  });
  return sh;
}
const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
