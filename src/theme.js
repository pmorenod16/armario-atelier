// Aspecto de la app (14/11/2026): «sistema» (lo que tenga el móvil/ordenador), «claro» u «oscuro».
// Se guarda en el perfil (sale igual en todos tus dispositivos) y en el dispositivo (localStorage «theme»), que es lo que
// lee index.html antes de pintar para que no parpadee al abrir. styles.css: data-theme en <html> manda sobre el sistema.
const KEY = "theme";
const dark = matchMedia("(prefers-color-scheme: dark)");

export const getTheme = () => { try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; } };
/** ¿Se está viendo en oscuro ahora mismo? */
export const isDark = () => { const m = document.documentElement.dataset.theme; return m ? m === "dark" : dark.matches; };

export function applyTheme(mode = "system") {
  if (!["system", "light", "dark"].includes(mode)) mode = "system";
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme; else root.dataset.theme = mode;
  try { if (mode === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch { /* sin almacenamiento */ }
  paintBar();
  dispatchEvent(new Event("themechange"));
}
// color de la barra del navegador / ventana instalada
function paintBar() {
  const c = isDark() ? "#0C0D0F" : "#EDEEF0";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = c; m.removeAttribute("media"); });
}
dark.addEventListener?.("change", () => { if (!document.documentElement.dataset.theme) { paintBar(); dispatchEvent(new Event("themechange")); } });
