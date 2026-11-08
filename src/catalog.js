// Catálogo de prendas: tipos, colores, estampados, materiales y ajustes.
// Se guardan las claves (k) en Firestore; las etiquetas por idioma viven aquí.
// La IA del servidor recibe estas mismas claves (worker/src/index.js → CATALOG_FOR_AI): mantener en sincronía.
import { getLanguage, tr } from "./i18n.js";

export const label = (entry) => entry ? (entry[getLanguage()] ?? tr(entry.es ?? entry.k)) : "";

// capa = cómo se coloca en el maniquí (fase 2)
export const LAYERS = ["top", "outer", "bottom", "dress", "shoes", "accessory"];

export const GROUPS = [
  { k: "camisetas", es: "Camisetas y polos", layer: "top" },
  { k: "camisas", es: "Camisas", layer: "top" },
  { k: "punto", es: "Jerséis y sudaderas", layer: "top" },
  { k: "abrigo", es: "Chaquetas y abrigos", layer: "outer" },
  { k: "pantalones", es: "Pantalones", layer: "bottom" },
  { k: "piezas", es: "Vestidos y monos", layer: "dress" },
  { k: "calzado", es: "Calzado", layer: "shoes" },
  { k: "complementos", es: "Complementos", layer: "accessory" },
];

export const TYPES = [
  { k: "camiseta", es: "Camiseta", g: "camisetas" },
  { k: "camiseta-ml", es: "Camiseta de manga larga", g: "camisetas" },
  { k: "polo", es: "Polo", g: "camisetas" },
  { k: "tirantes", es: "Camiseta de tirantes", g: "camisetas" },
  { k: "camisa", es: "Camisa", g: "camisas" },
  { k: "camisa-mc", es: "Camisa de manga corta", g: "camisas" },
  { k: "sobrecamisa", es: "Sobrecamisa", g: "camisas" },
  { k: "jersey", es: "Jersey", g: "punto" },
  { k: "cardigan", es: "Cárdigan", g: "punto" },
  { k: "sudadera", es: "Sudadera", g: "punto" },
  { k: "sudadera-capucha", es: "Sudadera con capucha", g: "punto" },
  { k: "chaleco-punto", es: "Chaleco de punto", g: "punto" },
  { k: "cazadora", es: "Cazadora", g: "abrigo" },
  { k: "chaqueta", es: "Chaqueta", g: "abrigo" },
  { k: "americana", es: "Americana", g: "abrigo" },
  { k: "abrigo", es: "Abrigo", g: "abrigo" },
  { k: "gabardina", es: "Gabardina", g: "abrigo" },
  { k: "plumifero", es: "Plumífero", g: "abrigo" },
  { k: "parka", es: "Parka", g: "abrigo" },
  { k: "chaleco", es: "Chaleco acolchado", g: "abrigo" },
  { k: "pantalon", es: "Pantalón", g: "pantalones" },
  { k: "chino", es: "Chino", g: "pantalones" },
  { k: "vaquero", es: "Vaquero", g: "pantalones" },
  { k: "traje-pantalon", es: "Pantalón de traje", g: "pantalones" },
  { k: "jogger", es: "Jogger / chándal", g: "pantalones" },
  { k: "bermuda", es: "Bermuda / pantalón corto", g: "pantalones" },
  { k: "falda", es: "Falda", g: "pantalones" },
  { k: "vestido", es: "Vestido", g: "piezas" },
  { k: "mono", es: "Mono", g: "piezas" },
  { k: "zapatillas", es: "Zapatillas", g: "calzado" },
  { k: "zapatos", es: "Zapatos", g: "calzado" },
  { k: "mocasines", es: "Mocasines", g: "calzado" },
  { k: "botas", es: "Botas", g: "calzado" },
  { k: "botines", es: "Botines", g: "calzado" },
  { k: "sandalias", es: "Sandalias", g: "calzado" },
  { k: "gorra", es: "Gorra", g: "complementos" },
  { k: "gorro", es: "Gorro", g: "complementos" },
  { k: "bufanda", es: "Bufanda", g: "complementos" },
  { k: "cinturon", es: "Cinturón", g: "complementos" },
  { k: "corbata", es: "Corbata", g: "complementos" },
  { k: "reloj", es: "Reloj", g: "complementos" },
  { k: "gafas", es: "Gafas de sol", g: "complementos" },
  { k: "mochila", es: "Mochila", g: "complementos" },
  { k: "bolso", es: "Bolso / bandolera", g: "complementos" },
  { k: "joya", es: "Joya", g: "complementos" },
  { k: "otro", es: "Otro", g: "complementos" },
];

// Familias de color para clasificar y filtrar (el tono exacto se guarda aparte en hex)
export const COLORS = [
  { k: "blanco", es: "Blanco", hex: "#F5F5F2" },
  { k: "crudo", es: "Crudo", hex: "#EDE6D6" },
  { k: "beige", es: "Beige", hex: "#D8C6A5" },
  { k: "camel", es: "Camel", hex: "#B5885A" },
  { k: "marron", es: "Marrón", hex: "#6E4B32" },
  { k: "gris-claro", es: "Gris claro", hex: "#C7C9CC" },
  { k: "gris", es: "Gris", hex: "#86898E" },
  { k: "antracita", es: "Antracita", hex: "#3C3F44" },
  { k: "negro", es: "Negro", hex: "#16171A" },
  { k: "azul-marino", es: "Azul marino", hex: "#1F2C4C" },
  { k: "azul", es: "Azul", hex: "#2F5DA8" },
  { k: "celeste", es: "Celeste", hex: "#9EC1E3" },
  { k: "denim", es: "Denim", hex: "#4A6A92" },
  { k: "verde", es: "Verde", hex: "#2F7A4D" },
  { k: "oliva", es: "Oliva", hex: "#6B6B3A" },
  { k: "caqui", es: "Caqui", hex: "#A39A6E" },
  { k: "rojo", es: "Rojo", hex: "#B3262E" },
  { k: "burdeos", es: "Burdeos", hex: "#6B1E2B" },
  { k: "rosa", es: "Rosa", hex: "#E6A9B6" },
  { k: "morado", es: "Morado", hex: "#5E3B7A" },
  { k: "amarillo", es: "Amarillo", hex: "#E3C34A" },
  { k: "mostaza", es: "Mostaza", hex: "#C2962B" },
  { k: "naranja", es: "Naranja", hex: "#D97434" },
  { k: "multicolor", es: "Multicolor", hex: "conic-gradient(#e55,#ec4,#5b7,#48c,#a5c,#e55)" },
];

export const PATTERNS = [
  { k: "liso", es: "Liso" },
  { k: "rayas", es: "Rayas" },
  { k: "cuadros", es: "Cuadros" },
  { k: "estampado", es: "Estampado" },
  { k: "grafico", es: "Gráfico / logo" },
  { k: "texturizado", es: "Texturizado" },
  { k: "degradado", es: "Degradado" },
];

export const MATERIALS = [
  { k: "algodon", es: "Algodón" },
  { k: "lino", es: "Lino" },
  { k: "lana", es: "Lana" },
  { k: "cachemira", es: "Cachemira" },
  { k: "seda", es: "Seda" },
  { k: "denim", es: "Denim" },
  { k: "poliester", es: "Poliéster" },
  { k: "nylon", es: "Nylon" },
  { k: "viscosa", es: "Viscosa" },
  { k: "cuero", es: "Piel" },
  { k: "ante", es: "Ante" },
  { k: "punto", es: "Punto" },
  { k: "mezcla", es: "Mezcla" },
  { k: "otro", es: "Otro" },
];

export const FITS = [
  { k: "slim", es: "Ajustado" },
  { k: "regular", es: "Regular" },
  { k: "relaxed", es: "Holgado" },
  { k: "oversize", es: "Oversize" },
];

export const SEASONS = ["primavera", "verano", "otono", "invierno"];
export const STATUSES = ["disponible", "sucia", "prestada"];
export const BUILDS = ["delgada", "media", "atletica", "robusta"];
export const SIZE_KEYS = ["camiseta", "camisa", "jersey", "americana", "pantalon", "vaquero", "calzado"];

const by = (list) => Object.fromEntries(list.map((x) => [x.k, x]));
export const TYPE = by(TYPES);
export const GROUP = by(GROUPS);
export const COLOR = by(COLORS);
export const PATTERN = by(PATTERNS);
export const MATERIAL = by(MATERIALS);
export const FIT = by(FITS);

export const groupOf = (typeKey) => GROUP[TYPE[typeKey]?.g] || GROUP.complementos;
export const layerOf = (typeKey) => groupOf(typeKey).layer;
export const colorSwatch = (k) => COLOR[k]?.hex || "#999";

/** Qué talla del perfil corresponde a cada tipo de prenda (para sugerirla al añadir). */
export function sizeKeyOf(typeKey) {
  if (typeKey === "vaquero") return "vaquero";
  if (["polo", "camiseta", "camiseta-ml", "tirantes"].includes(typeKey)) return "camiseta";
  return { camisas: "camisa", punto: "jersey", abrigo: "americana", pantalones: "pantalon", calzado: "calzado" }[TYPE[typeKey]?.g] || null;
}
