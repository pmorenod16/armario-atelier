// El tiempo con Open-Meteo (gratis y sin clave). Previsión de 16 días; para fechas más lejanas
// se usa lo que hizo esos mismos días el año pasado (archivo histórico) como referencia.
const CODES = [
  [[0], "Despejado", "sun"], [[1], "Casi despejado", "sun"], [[2], "Intervalos de nubes", "cloudsun"], [[3], "Nublado", "cloud"],
  [[45, 48], "Niebla", "fog"], [[51, 53, 55, 56, 57], "Llovizna", "rain"], [[61, 63, 80, 81], "Lluvia", "rain"],
  [[65, 82], "Lluvia fuerte", "rain"], [[66, 67], "Lluvia helada", "rain"], [[71, 73, 75, 77, 85, 86], "Nieve", "snow"],
  [[95, 96, 99], "Tormenta", "storm"],
];
export function describe(code) {
  const c = CODES.find(([list]) => list.includes(code));
  return { text: c?.[1] || "—", icon: c?.[2] || "cloud" };
}

const cache = new Map();
async function getJson(url) {
  if (cache.has(url) && Date.now() - cache.get(url).t < 15 * 60_000) return cache.get(url).d;
  const r = await fetch(url);
  if (!r.ok) throw new Error("tiempo " + r.status);
  const d = await r.json(); cache.set(url, { t: Date.now(), d }); return d;
}

/** Tiempo de hoy en un sitio: ahora, máxima/mínima, lluvia, viento y unas horas clave. */
export async function todayWeather({ lat, lon }, offset = 0) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=2`
    + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day"
    + "&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code"
    + "&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,weather_code,wind_speed_10m_max,uv_index_max";
  const d = await getJson(u);
  const i = Math.min(offset, d.daily.time.length - 1), today = d.daily.time[i];
  const hours = d.hourly.time.map((t, i) => ({ h: +t.slice(11, 13), day: t.slice(0, 10), t: d.hourly.temperature_2m[i], feels: d.hourly.apparent_temperature[i], rain: d.hourly.precipitation_probability[i], code: d.hourly.weather_code[i] }))
    .filter((x) => x.day === today);
  const at = (h) => hours.find((x) => x.h === h);
  const key = [8, 11, 14, 17, 20, 23].map(at).filter(Boolean);
  return {
    date: today,
    // mañana no hay «ahora»: se usa el mediodía
    now: i === 0 ? { t: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature), code: d.current.weather_code, wind: Math.round(d.current.wind_speed_10m) }
      : (() => { const n = at(12) || at(14) || hours[0] || {}; return { t: Math.round(n.t ?? d.daily.temperature_2m_max[i]), feels: Math.round(n.feels ?? n.t ?? 0), code: d.daily.weather_code[i], wind: Math.round(d.daily.wind_speed_10m_max[i]) }; })(),
    min: Math.round(d.daily.temperature_2m_min[i]), max: Math.round(d.daily.temperature_2m_max[i]),
    feelsMin: Math.round(d.daily.apparent_temperature_min[i]), feelsMax: Math.round(d.daily.apparent_temperature_max[i]),
    rain: d.daily.precipitation_probability_max[i] ?? 0, rainMm: d.daily.precipitation_sum[i] ?? 0,
    wind: Math.round(d.daily.wind_speed_10m_max[i]), uv: d.daily.uv_index_max[i], code: d.daily.weather_code[i],
    hours: key.map((x) => ({ h: x.h, t: Math.round(x.t), rain: x.rain, code: x.code })),
  };
}

/** Resumen en texto para la IA. */
export function weatherText(w, place) {
  const d = describe(w.code).text.toLowerCase();
  return `${place}: ${d}. Ahora ${w.now.t} °C (sensación ${w.now.feels} °C). Mínima ${w.min} °C, máxima ${w.max} °C (sensación ${w.feelsMin}–${w.feelsMax} °C). `
    + `Probabilidad de lluvia ${w.rain}%${w.rainMm ? ` (${w.rainMm} mm)` : ""}. Viento hasta ${w.wind} km/h. UV ${w.uv ?? "?"}. `
    + `Por horas: ${w.hours.map((x) => `${x.h}h ${x.t} °C${x.rain >= 30 ? ` lluvia ${x.rain}%` : ""}`).join(", ")}.`;
}

/** Tiempo por días para un viaje (start = "AAAA-MM-DD", days ≤ 21). */
export async function tripWeather({ lat, lon }, start, days) {
  const end = new Date(start); end.setDate(end.getDate() + days - 1);
  const endS = end.toISOString().slice(0, 10);
  const limit = new Date(); limit.setDate(limit.getDate() + 15);
  const vars = "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code";
  if (end <= limit) {
    const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&start_date=${start}&end_date=${endS}&daily=${vars}`);
    return { source: "prevision", days: d.daily.time.map((t, i) => ({ date: t, min: Math.round(d.daily.temperature_2m_min[i]), max: Math.round(d.daily.temperature_2m_max[i]), rain: d.daily.precipitation_probability_max[i] ?? null, code: d.daily.weather_code[i] })) };
  }
  // demasiado lejos: mismos días del año pasado
  const shift = (s) => { const x = new Date(s); x.setFullYear(x.getFullYear() - 1); return x.toISOString().slice(0, 10); };
  const d = await getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&timezone=auto&start_date=${shift(start)}&end_date=${shift(endS)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code`);
  return { source: "año-pasado", days: d.daily.time.map((t, i) => {
    const real = new Date(t); real.setFullYear(real.getFullYear() + 1);
    return { date: real.toISOString().slice(0, 10), min: Math.round(d.daily.temperature_2m_min[i]), max: Math.round(d.daily.temperature_2m_max[i]), rain: d.daily.precipitation_sum[i] > 1 ? 70 : 10, code: d.daily.weather_code[i] };
  }) };
}
