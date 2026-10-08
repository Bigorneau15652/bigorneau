// Lecture d'une archive zip (les polices de DaFont et de Google Fonts se telechargent ainsi) : liste des fichiers de polices (.ttf, .otf)
// qu'elle contient. Chaque fichier est stocke tel quel ou compresse (deflate) ; la decompression est fournie par l'appelant
// (DecompressionStream dans Obsidian). Ce module ne depend pas d'Obsidian.
export interface ZipEntry {
  // Nom du fichier sans son dossier.
  name: string;
  data: Uint8Array;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

const FONT_FILE = /\.(ttf|otf)$/i;

// Fichiers de polices de l'archive. Les fichiers caches de macOS (__MACOSX, ._nom) sont ignores. Une archive illisible donne une liste vide.
export async function fontFilesOfZip(bytes: Uint8Array, inflate: Inflate): Promise<ZipEntry[]> {
  // Fin de l'annuaire central : signature 0x06054b50, au plus 65 557 octets avant la fin du fichier.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const out: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= bytes.length && u32(bytes, at) === 0x02014b50; n++) {
    const method = u16(bytes, at + 10);
    const compressed = u32(bytes, at + 20);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const local = u32(bytes, at + 42);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    const name = path.split(`/`).pop() ?? path;
    if (!FONT_FILE.test(name) || path.startsWith(`__MACOSX/`) || name.startsWith(`._`)) continue;
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const raw = bytes.subarray(start, start + compressed);
    try {
      if (method === 0) out.push({ name, data: raw.slice() });
      else if (method === 8) out.push({ name, data: await inflate(raw) });
    } catch {
      // Fichier de l'archive abime : il est ignore.
    }
  }
  return out;
}
