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
];
for (const p of perms) if (!xml.includes(p.split(" ")[1])) xml = xml.replace("</manifest>", `    ${p}\n</manifest>`);
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
