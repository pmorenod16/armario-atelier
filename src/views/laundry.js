// La colada (13/11/2026): lo sucio agrupado en lavadoras por color y tipo de lavado (blancos, claros, oscuros, colores
// vivos y delicada: lana, cachemira, seda, viscosa o etiqueta «a mano»), con el peso aproximado de cada carga y la
// temperatura (la más baja que pida alguna etiqueta). Una carga está «lista» al llegar a media lavadora (LOAD_KG·0,5) o
// antes si te estás quedando sin camisetas/camisas limpias. «Lavada» devuelve esas prendas a disponible (usos a 0).
// Desde Armario (botón «Colada») y un aviso en Hoy cuando hay una lista (readyLoads).
import { t, locale, phrase as P } from "../i18n.js";
import { $, esc, icon, openSheet, toast } from "../ui.js";
import { store, markClean, washAll } from "../data.js";
import { TYPE } from "../catalog.js";
import { tintFor } from "./add.js";

export const LOAD_KG = 7; // lavadora normal
const KG = { camiseta: 0.15, "camiseta-ml": 0.2, polo: 0.2, tirantes: 0.1, top: 0.1, camisa: 0.22, "camisa-mc": 0.18, blusa: 0.15, sobrecamisa: 0.45,
  jersey: 0.45, cardigan: 0.45, sudadera: 0.5, "sudadera-capucha": 0.6, "chaleco-punto": 0.3, pantalon: 0.5, chino: 0.5, vaquero: 0.7, "traje-pantalon": 0.5,
  jogger: 0.45, bermuda: 0.35, falda: 0.3, vestido: 0.35, mono: 0.5, calcetines: 0.06, sujetador: 0.06, "sujetador-sin-tirantes": 0.06, bralette: 0.05,
  "sujetador-deportivo": 0.08, cazadora: 0.9, chaqueta: 0.9, plumifero: 0.9, parka: 1.1, chaleco: 0.5, gorro: 0.1, bufanda: 0.2, gorra: 0.1 };
const WHITE = new Set(["blanco", "crudo"]);
const LIGHT = new Set(["beige", "nude", "gris-claro", "celeste", "rosa", "amarillo", "camel"]);
const BRIGHT = new Set(["rojo", "naranja", "verde", "morado", "mostaza", "azul", "multicolor"]);
const DELICATE_MAT = new Set(["lana", "cachemira", "seda", "viscosa"]);
// orden y temperatura de cada carga
const LOADS = {
  blancos: { temp: 40, es: "Blancos" }, claros: { temp: 30, es: "Claros" }, oscuros: { temp: 30, es: "Oscuros" },
  colores: { temp: 30, es: "Colores vivos" }, delicada: { temp: 20, es: "Delicada" },
};

const kgOf = (it) => KG[it.type] ?? 0.3;
export function loadOf(it) {
  const care = String(it.care || "").toLowerCase();
  if (DELICATE_MAT.has(it.materialKey) || /a mano|delicad|à mà|by hand|hand wash|lana|wool/.test(care) || TYPE[it.type]?.g === "interior") return "delicada";
  const c = it.colors?.[0]?.k || "";
  if (WHITE.has(c)) return "blancos";
  if (LIGHT.has(c)) return "claros";
  if (BRIGHT.has(c) && it.pattern !== "rayas") return "colores";
  return "oscuros";
}
const careTemp = (it) => { const m = String(it.care || "").match(/(\d{2})\s*º?°?\s*c?/i); const n = m ? +m[1] : null; return n && n >= 20 && n <= 90 ? n : null; };

/** Lo sucio repartido en cargas: [{k, items, kg, temp, ready, short}] (las listas primero). */
export function laundryLoads() {
  const dirty = store.items.filter((i) => i.status === "sucia");
  const groups = {};
  for (const it of dirty) (groups[loadOf(it)] ||= []).push(it);
  // ¿te quedas sin camisetas/camisas limpias? Entonces la carga que las lleva corre prisa
  const cleanTops = store.items.filter((i) => i.status === "disponible" && ["camisetas", "camisas"].includes(TYPE[i.type]?.g)).length;
  return Object.keys(LOADS).filter((k) => groups[k]).map((k) => {
    const items = groups[k], kg = Math.round(items.reduce((a, i) => a + kgOf(i), 0) * 10) / 10;
    const temps = items.map(careTemp).filter(Boolean);
    const temp = Math.min(LOADS[k].temp, ...(temps.length ? temps : [LOADS[k].temp]));
    const short = cleanTops <= 2 && items.some((i) => ["camisetas", "camisas"].includes(TYPE[i.type]?.g));
    const ready = kg >= LOAD_KG * (k === "delicada" ? 0.3 : 0.5) || (short && kg >= 1);
    return { k, items, kg, temp, ready, short };
  }).sort((a, b) => b.ready - a.ready || b.kg - a.kg);
}
export const readyLoads = () => laundryLoads().filter((l) => l.ready);
const loadName = (k) => P(LOADS[k].es);
const kgText = (n) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });

/** Aviso corto para Hoy (o "" si no hay ninguna lista). */
export function laundryNoteHTML() {
  const r = readyLoads(); if (!r.length) return "";
  const l = r[0];
  return `<button type="button" class="notice laundry-note" data-laundry>${icon("wash")} <span>${t(l.short ? "laundry.noteShort" : "laundry.note", { load: loadName(l.k).toLowerCase(), kg: kgText(l.kg) })}</span>${icon("chevron")}</button>`;
}

export function openLaundry() {
  const sh = openSheet(`<div class="sheet-head"><h2 class="display">${t("laundry.title")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div><div id="lbody"></div>`, { label: t("laundry.title"), wide: true });
  const body = $("#lbody", sh.el);
  const draw = () => {
    const loads = laundryLoads(), dry = store.items.filter((i) => i.status === "tintoreria");
    const thumbs = (list) => `<div class="l-items">${list.map((it) => `<span class="l-item" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}" title="${esc(it.name)}">${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}">` : esc(it.name.slice(0, 2))}</span>`).join("")}</div>`;
    body.innerHTML = !loads.length && !dry.length ? `<div class="empty"><div class="empty-art">${icon("wash")}</div><p>${t("laundry.empty")}</p></div>` : `
      <p class="muted small">${t("laundry.hint", { kg: LOAD_KG })}</p>
      ${loads.map((l) => `<section class="card load ${l.ready ? "ready" : ""}">
        <div class="row between"><div><b>${esc(loadName(l.k))}</b> <span class="muted small">· ${t(l.k === "delicada" ? "laundry.delicate" : "laundry.temp", { t: l.temp })}</span></div>
          <span class="pill ${l.ready ? "on" : ""}">${t(l.ready ? "laundry.ready" : "laundry.notYet")}</span></div>
        <div class="load-bar" role="img" aria-label="${t("laundry.kg", { kg: kgText(l.kg), max: LOAD_KG })}"><i style="width:${Math.min(100, (l.kg / LOAD_KG) * 100)}%"></i></div>
        <p class="muted small">${t("laundry.kg", { kg: kgText(l.kg), max: LOAD_KG })} · ${t("laundry.count", { n: l.items.length })}${l.short ? ` · <b>${t("laundry.short")}</b>` : ""}${l.k === "oscuros" ? ` · ${t("laundry.inside")}` : ""}</p>
        ${thumbs(l.items)}
        <button class="btn sm ${l.ready ? "primary" : ""}" type="button" data-wash="${l.k}">${icon("check")}${t("laundry.done")}</button>
      </section>`).join("")}
      ${dry.length ? `<section class="card load"><b>${t("status.tintoreria")}</b>${thumbs(dry)}<button class="btn sm" type="button" data-dry>${icon("check")}${t("laundry.dryDone")}</button></section>` : ""}
      <div class="sheet-foot"><button class="btn" type="button" data-all>${icon("wash")}${t("wash.all", { n: loads.reduce((a, l) => a + l.items.length, 0) + dry.length })}</button></div>`;
  };
  draw();
  sh.el.onclick = async (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    const w = e.target.closest("[data-wash]"), d = e.target.closest("[data-dry]"), a = e.target.closest("[data-all]");
    if (!w && !d && !a) return;
    try {
      const ids = w ? laundryLoads().find((l) => l.k === w.dataset.wash)?.items.map((i) => i.id) || []
        : d ? store.items.filter((i) => i.status === "tintoreria").map((i) => i.id) : null;
      const n = ids ? (await markClean(ids), ids.length) : await washAll();
      toast(t("wash.done", { n }));
      // la base de datos avisa al momento; se repinta en cuanto llega
      setTimeout(draw, 300);
    } catch { toast(t("item.saveFail"), "error"); }
  };
}
