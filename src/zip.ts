// Lecture d'une archive zip (les polices de DaFont et de Google Fonts se telechargent ainsi) : liste des fichiers de polices (.ttf, .otf)
// qu'elle contient. Chaque fichier est stocke tel quel ou compresse (deflate) ; la decompression est fournie par l'appelant
// (DecompressionStream dans Obsidian). Ce module ne depend pas d'Obsidian.
export interface ZipEntry {
  // Nom du fichier sans son dossier.
  name: string;
  data: Uint8Array;
}

// Decompression supplied by the caller. It must stop and throw as soon as the result would be longer than `limit` bytes, because the
// size declared in the header of an archive can lie.
export type Inflate = (data: Uint8Array, limit: number) => Promise<Uint8Array>;

// Limits of an archive of fonts: size of one file, size of all the files together, number of entries of the directory that are read.
export const ZIP_MAX_ENTRY = 50 * 1024 * 1024;
export const ZIP_MAX_TOTAL = 150 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 500;

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

const FONT_FILE = /\.(ttf|otf)$/i;

// Fichiers de polices de l'archive. Les fichiers caches (__MACOSX, ._nom, .nom) sont ignores. Une archive illisible donne une liste vide.
// Un fichier qui depasse les limites ci-dessus n'est pas extrait : son nom est ajouté à `refused` quand cette liste est donnee.
export async function fontFilesOfZip(bytes: Uint8Array, inflate: Inflate, refused?: string[]): Promise<ZipEntry[]> {
  // Fin de l'annuaire central : signature 0x06054b50, au plus 65 557 octets avant la fin du fichier.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const count = Math.min(u16(bytes, end + 10), ZIP_MAX_ENTRIES);
  let at = u32(bytes, end + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  const decoder = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= bytes.length && u32(bytes, at) === 0x02014b50; n++) {
    const method = u16(bytes, at + 10);
    const compressed = u32(bytes, at + 20);
    const declared = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const local = u32(bytes, at + 42);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    const name = path.split(`/`).pop() ?? path;
    if (!FONT_FILE.test(name) || path.startsWith(`__MACOSX/`) || name.startsWith(`.`)) continue;
    if (compressed > ZIP_MAX_ENTRY || declared > ZIP_MAX_ENTRY || total + Math.min(declared, ZIP_MAX_ENTRY) > ZIP_MAX_TOTAL) {
      refused?.push(name);
      continue;
    }
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const raw = bytes.subarray(start, start + compressed);
    try {
      let data: Uint8Array | null = null;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflate(raw, ZIP_MAX_ENTRY);
      if (data && (data.length > ZIP_MAX_ENTRY || total + data.length > ZIP_MAX_TOTAL)) {
        refused?.push(name);
      } else if (data) {
        total += data.length;
        out.push({ name, data });
      }
    } catch {
      // Fichier de l'archive abime, ou plus gros que la limite : il est ignore.
      refused?.push(name);
    }
  }
  return out;
}
