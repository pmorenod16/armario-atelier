// Copia de seguridad: guardar todo el armario en un archivo (y recuperarlo).
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { isNative } from "./ui.js";
import { exportBackup, importBackup } from "./data.js";

/** Crea el archivo y lo comparte/guarda. Devuelve {name, mb}. */
export async function downloadBackup(onStep) {
  const obj = await exportBackup(onStep);
  const json = JSON.stringify(obj);
  const name = `armario-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const mb = Math.round((json.length / 1048576) * 10) / 10;
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "Copia del armario", files: [uri], dialogTitle: "Guardar la copia (Drive, correo, Archivos…)" });
  } else {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  return { name, mb };
}

/** Lee un archivo de copia elegido por el usuario y lo restaura. */
export async function restoreFromFile(file, onStep) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { throw new Error("ARCHIVO"); }
  return importBackup(obj, onStep);
}
