# Armario Atelier — guía para Claude Code

App personal de Polete (estudiante de ingeniería, Girona) para clasificar su armario, montar outfits en un maniquí 3D con las fotos reales de sus prendas, sacar su estilo de un tablero de Pinterest y decidir qué comprar y dónde. Funciona como **APK de Android** (Capacitor) y como **PWA instalable en el ordenador** (GitHub Pages), con el mismo código.

## Idioma y tono
- Toda la interfaz, los mensajes de error y los comentarios del código en **español**.
- Mensajes de error: dicen qué ha pasado y qué hacer, sin disculpas. Nunca mostrar textos técnicos al usuario.

## Estructura
```
index.html            Interfaz (4 pestañas: Armario, Probador 3D, Mi estilo, Qué comprar) + acceso
src/main.js           Lógica de la interfaz: estado, render, cámara, arrastrar/pegar, llamadas a la API
src/viewer.js         Maniquí 3D con three.js; cada prenda = foto recortada en superficie curva + volumen de tela del color medio de la foto
src/cutout.js         Quita el fondo en el dispositivo: @imgly/background-removal (modelo isnet_quint8) → si falla, relleno por color de fondo → si no, foto tal cual. Devuelve WebP con transparencia
src/firebase.js       Auth (correo/contraseña y Google: popup en web, @capacitor-firebase/authentication nativo en Android con skipNativeAuth → signInWithCredential) + Firestore con caché local multipestaña
src/api.js            fetch al Worker con el token de Firebase; errores ya traducidos
src/config.js         Configuración de Firebase y URL del Worker (no son secretos)
src/styles.css        Tokens de diseño en :root (claro/oscuro con prefers-color-scheme)
public/               manifest.webmanifest, sw.js (solo web), iconos
worker/src/index.js   Cloudflare Worker: verifica el token de Firebase (jose) + ALLOWED_UIDS y llama a la API de Gemini (función askAI)
scripts/patch-android.mjs  Añade permisos de cámara/fotos al AndroidManifest generado
.github/workflows/    android.yml (APK en cada push a main), web.yml (GitHub Pages)
firestore.rules       Cada usuario solo accede a users/{uid}/**
```
La carpeta `android/` no se versiona: la genera CI con `npx cap add android`.

## Comandos
```bash
npm install && npm run dev      # web en http://localhost:5173
npm run build                   # dist/ (lo usan Capacitor y Pages)
npm run android                 # build + cap sync + abrir Android Studio
cd worker && npx wrangler dev   # servidor local en :8787
cd worker && npx wrangler deploy
```

## Modelo de datos (Firestore)
- `users/{uid}/items/{id}`: `name, category (top|outer|bottom|dress|shoes|accessory), shape, colorName, colorHex, season, formality 1-5, tags[], hasImage, aspect, imageVersion, cutMethod (ia|fondo-liso|sin-recorte), createdAt`
- `users/{uid}/images/{id}`: `data` (WebP en base64), `mime, width, height`. Separado de items para que el listado sea ligero. **Límite de 1 MiB por documento**: el recorte se comprime a ≤600 KB (cutout.js) y main.js rechaza base64 > 980 000 caracteres.
- `users/{uid}/outfits/{id}`: `name, itemIds[], createdAt`
- `users/{uid}/meta/style`: perfil de estilo (`summary, keywords, palette[{name,hex}], keyPieces, silhouettes, avoid, source, boardUrl, pinCount`)
- `users/{uid}/meta/shopping`: `advice, gaps[{piece, category, why, priority, searchTerm, colorHex, priceRange, stores[], combinesWith[], products[]}]`
- No se usa Firebase Storage a propósito (exige plan Blaze).

## API del Worker (POST, `Authorization: Bearer <idToken de Firebase>`)
| Ruta | Entrada | Salida |
|---|---|---|
| `/api/classify` | `{image}` JPEG base64 | datos de la prenda |
| `/api/outfits` | `{wardrobe, style, occasion, weather}` | `{outfits:[{title,itemIds,why,tip}]}` |
| `/api/style/images` | `{images[]}` | `{style}` |
| `/api/style/pinterest` | `{url}` tablero público → lee `<usuario>/<tablero>.rss` y descarga hasta 12 pines | `{style, pinCount}` |
| `/api/gaps` | `{wardrobe, style, budget, section}` | `{advice, gaps}` |
| `/api/shop` | `{piece, searchTerm, colorHint, section, budget, stores}` → Gemini con búsqueda de Google; enlaces filtrados a los dominios de las tiendas (si no, se usa el enlace de la fuente de Google) | `{products:[{store,name,price,url,color}]}` |

IA: **Gemini** (decisión de Polete: coste cero; tiene Google AI Pro con 10 $/mes de crédito de Cloud). Modelos en `wrangler.toml`: `MODEL_MAIN` y `MODEL_FAST` = `gemini-3.5-flash`. Llamadas REST a `generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` con `x-goog-api-key`; JSON forzado con `responseMimeType` salvo en la búsqueda (no se puede combinar con `google_search`). La clave va como secreto `GEMINI_API_KEY`, nunca en el código. **Reserva:** `askAI` prueba Gemini (`askGemini`) y, si no hay clave o falla con 429/5xx, usa NVIDIA (`askNvidia`, `integrate.api.nvidia.com/v1/chat/completions`, formato OpenAI; visión `meta/llama-3.2-90b-vision-instruct` con 1 imagen por petición, texto `meta/llama-3.3-70b-instruct`; secreto `NVIDIA_API_KEY`). La búsqueda en tiendas (`search: true`) no tiene reserva y **no funciona en el plan gratuito de Gemini** (429 RESOURCE_EXHAUSTED, comprobado el 6/11/2026): necesita facturación/créditos; si falla devuelve SEARCH_UNAVAILABLE y la app muestra los enlaces de las tiendas. Probado en real: `/api/gaps` funciona con Gemini gratis. Tiendas: zara, massimo, hm, mango, pull, bershka, uniqlo, cos (todas con tiendas físicas en España); los ids coinciden en `worker/src/index.js` (STORE_DOMAINS) y `src/main.js` (STORES).

## Detalles que hay que respetar
- El origen de Capacitor 8 en Android es `https://localhost`; la web de Pages debe estar en `ALLOWED_ORIGINS` del Worker.
- Google en Android: `android-config/google-services.json` (lo copia `patch-android.mjs`), `rgcfaIncludeGoogle` en variables.gradle, y firma fija desde el secreto `ANDROID_DEBUG_KEYSTORE` (SHA-1 `CF:0F:B5:87:4C:53:9B:50:39:DB:3A:A8:C0:06:71:48:FB:DB:1C:94` registrada en Firebase). Firebase JS fijado en 12.x por compatibilidad con el plugin.
- `ALLOWED_UIDS` vacío = el Worker rechaza a todos (a propósito). El usuario copia su uid desde Ajustes.
- Las fotos van siempre por `shrinkPhoto` antes de procesarlas o enviarlas.
- `@imgly/background-removal` es AGPL-3.0: bien para uso personal; avisar si se plantea publicar la app.
- Antes de dar algo por terminado: `npm run build` sin errores y, si tocas `viewer.js`, comprobar el maniquí de frente, de lado y de espaldas.

## Estado
Hecho: todo lo anterior. Comprobado: el APK compila en Actions y la web se publica en https://pmorenod16.github.io/armario-atelier/. Firebase configurado (proyecto armario-atelier, eur3, reglas publicadas, dominio de Pages autorizado). Probado en real: login con Google en web, `/api/gaps` con Gemini. Sin probar: clasificar fotos reales, RSS de Pinterest, login con Google en el APK.
Ideas pendientes: notificación "qué me pongo hoy" según el tiempo, estadísticas de uso de cada prenda, iconos de la tienda en los resultados.
