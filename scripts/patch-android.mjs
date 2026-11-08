// Añade los permisos de cámara y fotos al proyecto Android generado por Capacitor.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
const path = "android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(path, "utf8");
const perms = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  // plan del día desde el calendario del móvil, por voz y aviso por la mañana
  '<uses-permission android:name="android.permission.READ_CALENDAR" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
];
for (const p of perms) if (!xml.includes(p.split(" ")[1])) xml = xml.replace("</manifest>", `    ${p}\n</manifest>`);
// el reconocimiento de voz de Google tiene que ser visible para la app (Android 11+)
if (!xml.includes("android.speech.RecognitionService")) xml = xml.replace("</manifest>", `    <queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>\n</manifest>`);
writeFileSync(path, xml);
console.log("Permisos añadidos a AndroidManifest.xml");

// Inicio de sesión con Google nativo: configuración de Firebase y variables del plugin
if (existsSync("android-config/google-services.json")) {
  copyFileSync("android-config/google-services.json", "android/app/google-services.json");
  console.log("google-services.json copiado a android/app");
}
const varsPath = "android/variables.gradle";
let vars = readFileSync(varsPath, "utf8");
if (!vars.includes("rgcfaIncludeGoogle")) {
  vars = vars.replace(/ext\s*\{/, "ext {\n    rgcfaIncludeGoogle = true\n    androidxCredentialsVersion = '1.3.0'");
  writeFileSync(varsPath, vars);
  console.log("Variables de Google añadidas a variables.gradle");
}

// Descarga de Gradle: más margen (a veces services.gradle.org tarda más de 10 s en responder)
const wrapperPath = "android/gradle/wrapper/gradle-wrapper.properties";
if (existsSync(wrapperPath)) {
  let w = readFileSync(wrapperPath, "utf8");
  w = /networkTimeout=/.test(w) ? w.replace(/networkTimeout=\d+/, "networkTimeout=120000") : w + "\nnetworkTimeout=120000\n";
  writeFileSync(wrapperPath, w);
  console.log("Tiempo de espera de Gradle ampliado");
}

// Firma: el APK de depuración se firma SIEMPRE con ~/.android/debug.keystore (el del secreto ANDROID_DEBUG_KEYSTORE),
// con v1+v2+v3, para que cada versión se pueda instalar encima de la anterior y entrar con Google funcione.
const appGradle = "android/app/build.gradle";
if (existsSync(appGradle)) {
  let g = readFileSync(appGradle, "utf8");
  if (!g.includes("// firma-fija")) {
    g += `
// firma-fija
android {
    signingConfigs {
        fija {
            storeFile file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
            enableV1Signing true
            enableV2Signing true
            enableV3Signing true
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.fija }
    }
}
`;
    writeFileSync(appGradle, g);
  }
}
