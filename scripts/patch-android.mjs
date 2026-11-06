// Añade los permisos de cámara y fotos al proyecto Android generado por Capacitor.
import { readFileSync, writeFileSync } from "node:fs";
const path = "android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(path, "utf8");
const perms = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
];
for (const p of perms) if (!xml.includes(p.split(" ")[1])) xml = xml.replace("</manifest>", `    ${p}\n</manifest>`);
writeFileSync(path, xml);
console.log("Permisos añadidos a AndroidManifest.xml");
