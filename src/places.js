// Ubicaciones: GPS del móvil/navegador y búsqueda de ciudades. Servicios gratuitos y sin clave:
// Open-Meteo (búsqueda de ciudades; también dará el tiempo en la fase 2) y BigDataCloud (nombre de la ciudad a partir del GPS).
import { Geolocation } from "@capacitor/geolocation";
import { isNative } from "./ui.js";

export async function locate() {
  if (isNative) {
    const perm = await Geolocation.checkPermissions().catch(() => ({}));
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      const r = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] }).catch(() => ({}));
      if (r.location !== "granted" && r.coarseLocation !== "granted") throw { code: "denied" };
    }
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    return { lat: p.coords.latitude, lon: p.coords.longitude };
  }
  if (!navigator.geolocation) throw { code: "fail" };
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
    (e) => rej({ code: e.code === 1 ? "denied" : "fail" }),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  ));
}

export async function placeName(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`);
    const d = await r.json();
    return { name: d.city || d.locality || d.principalSubdivision || null, region: [d.principalSubdivision, d.countryName].filter(Boolean).join(", ") };
  } catch { return { name: null, region: "" }; }
}

export async function searchCity(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es&format=json`);
  const d = await r.json();
  return (d.results || []).map((x) => ({
    id: `c${x.id}`, name: x.name, region: [x.admin1, x.country].filter(Boolean).join(", "),
    lat: +x.latitude.toFixed(4), lon: +x.longitude.toFixed(4),
  }));
}
