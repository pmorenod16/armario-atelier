// Buscar una prenda con Google Lens a partir de su foto. Sin claves: en el móvil se comparte la foto
// (elige "Google Lens" o "Buscar imagen" en el menú); en el ordenador se abre Lens en otra pestaña con la foto.
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "./ui.js";
import { blobToBase64 } from "./api.js";

export async function searchWithLens(blob) {
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: `lens-${Date.now()}.jpg`, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: "Buscar con Google Lens", files: [uri], dialogTitle: "Elige Google Lens" });
    return;
  }
  // ordenador: formulario de subida de Lens en una pestaña nueva
  try {
    const form = document.createElement("form");
    form.action = "https://lens.google.com/v3/upload"; form.method = "POST"; form.enctype = "multipart/form-data"; form.target = "_blank";
    const input = document.createElement("input"); input.type = "file"; input.name = "encoded_image";
    const dt = new DataTransfer(); dt.items.add(new File([blob], "prenda.jpg", { type: blob.type || "image/jpeg" }));
    input.files = dt.files; form.append(input); form.hidden = true;
    document.body.append(form); form.submit(); form.remove();
  } catch {
    window.open("https://lens.google.com/", "_blank", "noopener");
  }
}
