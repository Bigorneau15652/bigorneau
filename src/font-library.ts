// Polices ajoutees au coffre : regroupement des fichiers .ttf et .otf d'un dossier en familles (normal, italique, gras, gras italique)
// et liste des fichiers que l'on ne peut pas utiliser, avec la raison. Ce module ne depend pas d'Obsidian.
import { OpenTypeFont } from "./export/font";
import { Variant, variantFrom } from "./export/font-metrics";

export interface FontFile {
  path: string;
  bytes: Uint8Array;
}

export type ProblemKind = `unreadable` | `woff` | `collection` | `restricted` | `variable` | `duplicate` | `format`;

export interface FontProblem {
  path: string;
  kind: ProblemKind;
}

export interface LoadedFamily {
  // Identifiant stable (nom de la famille en minuscules, tirets) : c'est lui qui est enregistre dans les reglages et dans les notes.
  id: string;
  name: string;
  fonts: Partial<Record<Variant, OpenTypeFont>>;
  paths: Partial<Record<Variant, string>>;
}

export interface FontLibrary {
  families: LoadedFamily[];
  problems: FontProblem[];
}

export const FONT_EXTENSIONS = [`ttf`, `otf`];
// Extensions qu'un utilisateur depose souvent par habitude et que l'on signale : elles ne sont pas utilisables.
export const REJECTED_EXTENSIONS = [`woff`, `woff2`, `ttc`, `otc`];

export const extensionOf = (path: string): string => (path.includes(`.`) ? path.slice(path.lastIndexOf(`.`) + 1).toLowerCase() : ``);

export function familyId(name: string): string {
  const id = name
    .normalize(`NFD`)
    .replace(/[̀-ͯ]/g, ``)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, `-`)
    .replace(/^-+|-+$/g, ``);
  return id === `` ? `police` : id;
}

// Les quatre premiers octets disent de quelle sorte de fichier il s'agit, quelle que soit son extension.
function signature(bytes: Uint8Array): string {
  return String.fromCharCode(...Array.from(bytes.subarray(0, 4)));
}

// Nom de la famille d'un fichier. Les graisses autres que normal et gras (Light, Thin, Medium, Black...) forment chacune leur famille
// (« Lato Light »), sinon elles se disputeraient la place du style normal de la famille de base.
function familyName(font: OpenTypeFont, path: string): { name: string; base: boolean } {
  const family = font.family.trim() !== `` ? font.family.trim() : (path.split(`/`).pop() ?? path).replace(/\.[^.]+$/, ``);
  const words = font.subfamily
    .split(/\s+/)
    .filter((w) => w !== `` && !/^(italic|oblique|regular|normal|roman)$/i.test(w));
  if (words.length === 0 || (words.length === 1 && /^bold$/i.test(words[0]))) return { name: family, base: true };
  return { name: `${family} ${words.join(` `)}`, base: false };
}

// Regroupe les fichiers en familles. Les fichiers sont pris dans l'ordre des chemins pour que le resultat ne depende pas de l'ordre de
// lecture du coffre.
export function buildLibrary(files: FontFile[], parse: (bytes: Uint8Array) => OpenTypeFont = (b) => new OpenTypeFont(b)): FontLibrary {
  const families = new Map<string, LoadedFamily>();
  const problems: FontProblem[] = [];
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const ext = extensionOf(file.path);
    if (REJECTED_EXTENSIONS.includes(ext)) {
      problems.push({ path: file.path, kind: ext === `ttc` || ext === `otc` ? `collection` : `woff` });
      continue;
    }
    if (!FONT_EXTENSIONS.includes(ext)) continue;
    const sig = signature(file.bytes);
    if (sig === `wOFF` || sig === `wOF2`) {
      problems.push({ path: file.path, kind: `woff` });
      continue;
    }
    if (sig === `ttcf`) {
      problems.push({ path: file.path, kind: `collection` });
      continue;
    }
    let font: OpenTypeFont;
    try {
      font = parse(file.bytes);
    } catch {
      problems.push({ path: file.path, kind: `unreadable` });
      continue;
    }
    if (font.embeddingRestricted) {
      problems.push({ path: file.path, kind: `restricted` });
      continue;
    }
    if (font.isVariable) {
      problems.push({ path: file.path, kind: `variable` });
      continue;
    }
    const { name, base } = familyName(font, file.path);
    const id = familyId(name);
    let family = families.get(id);
    if (!family) {
      family = { id, name, fonts: {}, paths: {} };
      families.set(id, family);
    }
    // Une famille « de graisse » (Light, Thin, Medium...) n'a ni gras ni normal : son style de base est normal, avec ou sans italique.
    const variant = base ? variantFrom(font.isBold, font.isItalic) : variantFrom(false, font.isItalic);
    if (family.fonts[variant]) {
      problems.push({ path: file.path, kind: `duplicate` });
      continue;
    }
    family.fonts[variant] = font;
    family.paths[variant] = file.path;
  }
  return { families: [...families.values()].sort((a, b) => a.name.localeCompare(b.name)), problems };
}

// Variantes presentes d'une famille, dans l'ordre normal, italique, gras, gras italique.
export function variantsOf(family: LoadedFamily): Variant[] {
  return ([`regular`, `italic`, `bold`, `boldItalic`] as Variant[]).filter((v) => family.fonts[v] !== undefined);
}
