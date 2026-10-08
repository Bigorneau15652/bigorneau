// Mesures de temps du plugin, pour comprendre une lenteur : la derniere duree de chaque operation lourde (demarrage, chargement des
// scripts, reconstruction de la carte, composition de l'apercu de l'export, passages de l'editeur) et le nombre de passages. La fenetre
// « Diagnostic » les affiche et les copie. Ce module ne depend pas d'Obsidian.
export interface Sample {
  name: string;
  // Duree de la derniere mesure, en millisecondes, et la plus longue depuis le demarrage.
  ms: number;
  max: number;
  // Nombre de mesures depuis le demarrage.
  count: number;
  detail: string;
}

const samples = new Map<string, Sample>();

export function record(name: string, ms: number, detail = ``): void {
  const rounded = Math.round(ms * 10) / 10;
  const old = samples.get(name);
  samples.set(name, { name, ms: rounded, max: Math.max(old?.max ?? 0, rounded), count: (old?.count ?? 0) + 1, detail });
}

// Execute `f` et note sa duree.
export function timed<T>(name: string, f: () => T, detail: () => string = () => ``): T {
  const start = performance.now();
  try {
    return f();
  } finally {
    record(name, performance.now() - start, detail());
  }
}

export const samplesList = (): Sample[] => [...samples.values()].sort((a, b) => a.name.localeCompare(b.name));

export function formatSamples(list: Sample[]): string {
  if (list.length === 0) return ``;
  return list.map((s) => `${s.name} : ${s.ms} ms (maximum ${s.max} ms, ${s.count} fois)${s.detail === `` ? `` : `, ${s.detail}`}`).join(`\n`);
}

// Erreurs interceptees (le panneau, le chargement des scripts) : gardees pour la fenetre de diagnostic, les dernieres seulement.
const errors: string[] = [];
const ERROR_LIMIT = 8;

export function noteError(where: string, error: unknown): void {
  const text = error instanceof Error ? `${error.message}${error.stack ? ` | ${error.stack.split(`\n`).slice(1, 3).join(` `).trim()}` : ``}` : String(error);
  errors.push(`${where} : ${text}`);
  while (errors.length > ERROR_LIMIT) errors.shift();
}

export const errorsList = (): string[] => [...errors];
