# Armario Atelier

App para Android y ordenador para clasificar tu armario, montar outfits en un maniquí 3D con las fotos reales de tus prendas, analizar tu estilo de Pinterest y saber qué te falta comprar y dónde.

## Cómo está montada

| Pieza | Qué hace | Coste |
|---|---|---|
| App (`src/`, Vite + Capacitor) | Interfaz, cámara, recorte de fondo en el móvil, maniquí 3D (three.js) | Gratis |
| Firebase (Auth + Firestore) | Tu cuenta, tus prendas, fotos recortadas, outfits y perfil de estilo | Gratis (plan Spark) |
| Cloudflare Worker (`worker/`) | Guarda la clave de Gemini y hace las llamadas a la IA | Gratis |
| API de Gemini (Google) | Clasificar fotos, outfits, Pinterest, lista de compra, búsqueda en tiendas con Google | Gratis (plan gratuito, o con los 10 $/mes de crédito de Google AI Pro) |
| GitHub Actions | Compila el APK cada vez que subes cambios | Gratis |

No usa Firebase Storage (exige el plan Blaze): las fotos recortadas se guardan comprimidas en Firestore.

---

## Puesta en marcha (unos 30 minutos)

### 1. Firebase
1. En <https://console.firebase.google.com> crea un proyecto nuevo (por ejemplo `armario-atelier`).
2. **Authentication → Método de inicio de sesión → Correo electrónico/contraseña** → activar.
3. **Firestore Database → Crear base de datos** → modo producción → región `eur3 (Europe)`.
4. En **Firestore → Reglas**, pega el contenido de `firestore.rules` y publica.
5. **Configuración del proyecto → Tus apps → icono web `</>`** → registra una app → copia `apiKey`, `authDomain`, `projectId` y `appId` en `src/config.js`.

### 2. Clave de la API de Gemini (gratis)
1. Entra en <https://aistudio.google.com/apikey> → **Create API key** → elige el proyecto `armario-atelier` (el de Firebase).
2. Copia la clave. No la pongas nunca en la app ni en GitHub: va solo en Cloudflare.
3. **Si tienes Google AI Pro:** activa los 10 $/mes de crédito de Google Cloud en <https://developers.google.com/program/my-benefits> y asígnalos a ese proyecto. Así tu uso pasa al nivel de pago, cubierto por el crédito: sin límites tan bajos y sin que Google use tus fotos para mejorar sus productos. Pon una alerta de presupuesto de 10 $ en Google Cloud para no pasarte nunca.
4. Sin crédito, funciona igual con el plan gratuito, con límites diarios y con la condición de que Google puede usar lo que envías para mejorar sus productos.

### 2 bis. Reserva gratuita: NVIDIA (opcional)
Si Gemini llega a su límite o falla, el servidor pasa solo a NVIDIA para clasificar fotos, proponer outfits, analizar el estilo y la lista de compra (la búsqueda en tiendas sigue siendo solo de Gemini).
1. Crea una cuenta gratis en <https://build.nvidia.com> (pide verificar el móvil, no pide tarjeta).
2. **Get API Key** → copia la clave. Si algún modelo da error 403, entra en su página (Llama 3.2 90B Vision, Llama 3.3 70B) y pulsa *Try API* una vez.
3. Guárdala en Cloudflare como secreto `NVIDIA_API_KEY`.

### 3. Servidor (Cloudflare Worker)
Necesitas Node 22 en tu ordenador.
```bash
cd worker
npm install
npx wrangler login                       # abre el navegador para entrar en Cloudflare (cuenta gratis)
# edita wrangler.toml: FIREBASE_PROJECT_ID = "el projectId de tu Firebase"
npx wrangler secret put GEMINI_API_KEY     # pega tu clave de Gemini
npx wrangler secret put NVIDIA_API_KEY     # opcional: reserva de NVIDIA
npx wrangler deploy
```
Copia la dirección que te da (`https://armario-api.<algo>.workers.dev`) en `API_URL` de `src/config.js`.

### 4. Compilar el APK con GitHub
1. Crea un repositorio en GitHub y sube esta carpeta (con `src/config.js` ya rellenado; esos datos de Firebase no son secretos).
2. Pestaña **Actions → APK de Android**. Se ejecuta solo al subir cambios a `main` (o pulsa *Run workflow*). Tarda unos 6 minutos.
3. Al terminar, abre la ejecución y descarga **armario-atelier-apk** (es un .zip con `app-debug.apk` dentro).
4. Pasa el APK al móvil y ábrelo. Android te pedirá permitir instalar apps de ese origen.

### 5. Autorizar tu cuenta en el servidor
1. Abre la app, crea tu cuenta con correo y contraseña.
2. **Ajustes → Copiar** tu identificador.
3. En `worker/wrangler.toml` pon `ALLOWED_UIDS = "tu-identificador"` y vuelve a ejecutar `npx wrangler deploy`.

A partir de aquí, solo tu cuenta puede usar la IA con tu clave.

---

## Entrar con Google
- **Ordenador / web:** funciona directamente (ventana de Google).
- **APK de Android:** usa el inicio de sesión nativo de Google. Necesita que el APK se firme siempre con la misma clave, guardada en el secreto de GitHub `ANDROID_DEBUG_KEYSTORE` (Settings → Secrets and variables → Actions). Su huella SHA-1 está registrada en Firebase (app Android `com.polete.armario`). Si algún día cambias esa clave, añade la nueva SHA-1 en Firebase → Configuración del proyecto → app Android.

## En el ordenador (Windows, Mac o Linux)
La misma app se instala en el ordenador como aplicación (PWA), sin tienda y sin compilar nada:
1. En GitHub: **Settings → Pages → Source: GitHub Actions**. Desde ese momento, cada vez que subes cambios a `main` se publica sola (Actions → *Versión de ordenador y web*).
2. Añade la dirección que te da (`https://TU_USUARIO.github.io/NOMBRE_REPO`) a `ALLOWED_ORIGINS` en `worker/wrangler.toml` y ejecuta `npx wrangler deploy`.
3. Ábrela en **Chrome o Edge** → botón **Instalar** de la app (o el icono de instalar en la barra de direcciones). Queda con su propio icono y ventana, como cualquier programa.

Usa la misma cuenta que en el móvil: el armario se sincroniza entre los dos. En el ordenador puedes **arrastrar** fotos a la zona de foto o **pegarlas con Ctrl+V** (por ejemplo, una imagen copiada de la web de una tienda o de Pinterest). `Esc` cierra el editor.

## Uso

- **Fotos de prendas:** extiéndela sobre un fondo liso (sábana, suelo claro), de frente y con buena luz. La primera vez el móvil descarga el modelo de recorte (unos 40 MB, con wifi mejor); después recorta sin conexión.
- **Probador 3D:** la foto recortada se coloca sobre el maniquí y los lados y la espalda toman el color de la prenda. Arrastra para girar, pellizca para acercar.
- **Pinterest:** pega el enlace de un tablero **público** (`pinterest.com/usuario/tablero`). Se analizan los 12 pines más recientes. Si es secreto o Pinterest no responde, sube capturas.
- **Qué comprar:** primero *Analizar qué me falta*; luego, en cada prenda, *Buscar modelos ahora* busca con Google en las webs de Zara, Massimo Dutti, H&M, Mango, Pull&Bear, Bershka, Uniqlo y COS y te enseña modelos con precio y enlace.

## Coste de la IA
Cero. *Buscar modelos ahora* usa **Tavily** (1.000 búsquedas gratis al mes, sin tarjeta): crea la cuenta en <https://app.tavily.com>, copia la clave y guárdala en Cloudflare como secreto `TAVILY_API_KEY`. Tavily busca solo en las webs de las tiendas y Gemini (gratis) saca nombre, precio y enlace. Sin esa clave, se intenta la búsqueda de Google de Gemini, que necesita facturación.

Resto: La app usa Gemini (por defecto `gemini-3.5-flash`, configurable en `worker/wrangler.toml`). En el plan gratuito hay un número limitado de peticiones al día (lo ves en AI Studio) y la búsqueda con Google tiene un cupo gratuito mensual de sobra para uso personal. Con el crédito de Google AI Pro el uso normal de la app queda muy por debajo de los 10 $/mes.

## Desarrollo
```bash
npm install
npm run dev        # versión web en http://localhost:5173
npm run android    # compila y abre el proyecto en Android Studio (si lo tienes)
```
La versión web también se puede instalar como PWA: Actions → **Versión web (GitHub Pages)** (activa antes Pages en Settings → Pages → Source: GitHub Actions) y añade la dirección de Pages a `ALLOWED_ORIGINS` del Worker.

## Licencias
El recorte de fondo usa `@imgly/background-removal`, con licencia AGPL-3.0. Para uso personal no tienes que hacer nada; si algún día publicas la app para otras personas, esa licencia obliga a publicar también su código fuente (o a comprar la licencia comercial de IMG.LY).
