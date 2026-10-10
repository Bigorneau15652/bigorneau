// Ajout de polices dans le dossier des polices du coffre depuis des fichiers choisis sur l'ordinateur (n'importe ou) : fichiers .ttf et
// .otf, ou archives .zip telechargees sur un site de polices.
import { App, normalizePath, TFile } from "obsidian";
import { fontFilesOfZip, Inflate } from "./zip";

export interface ImportReport {
  // Noms des fichiers de polices copies dans le coffre.
  added: string[];
  // Fichiers ignores (format non pris en charge, archive sans police).
  skipped: string[];
}

const inflate: Inflate = async (data) => {
  const g = globalThis as unknown as { DecompressionStream?: new (format: string) => { readable: ReadableStream; writable: WritableStream } };
  if (!g.DecompressionStream) throw new Error(`DecompressionStream indisponible`);
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(new g.DecompressionStream(`deflate-raw`));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// Nom de fichier sans caractere interdit dans un chemin.
const safeName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, `_`);

async function ensureFolder(app: App, folder: string): Promise<void> {
  let path = ``;
  for (const part of normalizePath(folder).split(`/`)) {
    path = path === `` ? part : `${path}/${part}`;
    if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
  }
}

export async function importFonts(app: App, folder: string, files: File[]): Promise<ImportReport> {
  const report: ImportReport = { added: [], skipped: [] };
  await ensureFolder(app, folder);
  const write = async (name: string, data: Uint8Array): Promise<void> => {
    const path = normalizePath(`${folder}/${safeName(name)}`);
    const buffer = data.slice().buffer;
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await app.vault.modifyBinary(existing, buffer);
    else await app.vault.createBinary(path, buffer);
    report.added.push(safeName(name));
  };
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (lower.endsWith(`.zip`)) {
      const inside = await fontFilesOfZip(bytes, inflate);
      if (inside.length === 0) report.skipped.push(file.name);
      for (const entry of inside) await write(entry.name, entry.data);
    } else if (lower.endsWith(`.ttf`) || lower.endsWith(`.otf`)) await write(file.name, bytes);
    else report.skipped.push(file.name);
  }
  return report;
}
