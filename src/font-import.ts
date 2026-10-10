// Ajout de polices dans le dossier des polices du coffre depuis des fichiers choisis sur l'ordinateur (n'importe ou) : fichiers .ttf et
// .otf, ou archives .zip telechargees sur un site de polices.
import { App, normalizePath, TFile } from "obsidian";
import { t } from "./i18n";
import { fontFilesOfZip, Inflate, ZIP_MAX_ENTRY } from "./zip";

export interface ImportReport {
  // Noms des fichiers de polices copies dans le coffre.
  added: string[];
  // Parmi eux, ceux qui ont remplace un fichier different du meme nom.
  replaced: string[];
  // Fichiers deja presents dans le coffre avec exactement le meme contenu : rien n'est ecrit.
  unchanged: string[];
  // Fichiers ignores (format non pris en charge, archive sans police, nom en double dans l'import).
  skipped: string[];
  // Fichiers refuses (trop volumineux, archive abimee) ou dont la copie a echoue.
  failed: string[];
}

// Largest font file accepted, alone or inside an archive.
const MAX_FONT_FILE = ZIP_MAX_ENTRY;

const inflate: Inflate = async (data, limit) => {
  const g = window as unknown as { DecompressionStream?: new (format: string) => { readable: ReadableStream; writable: WritableStream } };
  if (!g.DecompressionStream) throw new Error(`DecompressionStream indisponible`);
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(new g.DecompressionStream(`deflate-raw`));
  // The result is read piece by piece and the reading stops beyond `limit`: the size announced by an archive may be false.
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`fichier trop volumineux`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
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

const sameBytes = (a: ArrayBuffer, b: Uint8Array): boolean => {
  if (a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
};

export async function importFonts(app: App, folder: string, files: File[]): Promise<ImportReport> {
  const report: ImportReport = { added: [], replaced: [], unchanged: [], skipped: [], failed: [] };
  await ensureFolder(app, folder);
  // Names written during this import: a second file with the same name is not allowed to overwrite the first one.
  const seen = new Set<string>();
  const write = async (name: string, data: Uint8Array): Promise<void> => {
    const clean = safeName(name);
    if (clean.startsWith(`.`)) {
      report.skipped.push(name);
      return;
    }
    if (seen.has(clean.toLowerCase())) {
      report.skipped.push(`${name} (${t(`nom en double`)})`);
      return;
    }
    seen.add(clean.toLowerCase());
    const path = normalizePath(`${folder}/${clean}`);
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      if (sameBytes(await app.vault.readBinary(existing), data)) {
        report.unchanged.push(clean);
        return;
      }
      await app.vault.modifyBinary(existing, data.slice().buffer);
      report.replaced.push(clean);
    } else await app.vault.createBinary(path, data.slice().buffer);
    report.added.push(clean);
  };
  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (file.size > MAX_FONT_FILE * 3 && lower.endsWith(`.zip`)) {
        report.failed.push(file.name);
        continue;
      }
      if (!lower.endsWith(`.zip`) && file.size > MAX_FONT_FILE) {
        report.failed.push(file.name);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (lower.endsWith(`.zip`)) {
        const refused: string[] = [];
        const inside = await fontFilesOfZip(bytes, inflate, refused);
        if (inside.length === 0 && refused.length === 0) report.skipped.push(file.name);
        report.failed.push(...refused.map((name) => `${file.name} : ${name}`));
        for (const entry of inside) await write(entry.name, entry.data);
      } else if (lower.endsWith(`.ttf`) || lower.endsWith(`.otf`)) await write(file.name, bytes);
      else report.skipped.push(file.name);
    } catch {
      report.failed.push(file.name);
    }
  }
  return report;
}
