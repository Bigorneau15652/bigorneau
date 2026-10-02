// Aide du plugin : entrees d'aide et recherche. Les entrees sont ecrites en francais et en anglais ; le plugin et, plus tard, chaque
// script en fournissent. La recherche fonctionne hors connexion. Ce module ne depend pas d'Obsidian.

export type HelpLang = `fr` | `en`;

export interface HelpEntry {
  id: string;
  title: Record<HelpLang, string>;
  text: Record<HelpLang, string>;
  // Mots a trouver en plus du titre et du texte (synonymes, noms de commandes).
  keywords?: Partial<Record<HelpLang, string>>;
  // Contenu ajoute sous le texte (dessins, exemples). S'il remplace le texte, celui-ci ne sert qu'a la recherche.
  render?: (el: HTMLElement, lang: HelpLang) => void;
  renderReplacesText?: boolean;
}

// Texte sans majuscules, sans accents et sans ponctuation, pour comparer sans tenir compte de ces differences.
export function normalize(s: string): string {
  return s
    .normalize(`NFD`)
    .replace(/[̀-ͯ]/g, ``)
    .toLowerCase()
    .replace(/œ/g, `oe`)
    .replace(/æ/g, `ae`)
    .replace(/[^a-z0-9]+/g, ` `)
    .trim();
}

// Entrees qui contiennent tous les mots de la recherche, les plus pertinentes d'abord : un mot trouve dans le titre compte plus
// que dans les mots-cles, et plus que dans le texte. Une recherche vide renvoie toutes les entrees, dans l'ordre des entrees.
export function searchHelp(entries: HelpEntry[], query: string, lang: HelpLang): HelpEntry[] {
  const words = normalize(query).split(` `).filter((w) => w !== ``);
  if (words.length === 0) return [...entries];
  const scored: { entry: HelpEntry; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const title = normalize(entry.title[lang]);
    const keys = normalize(entry.keywords?.[lang] ?? ``);
    const text = normalize(entry.text[lang]);
    let score = 0;
    for (const w of words) {
      const s = (title.includes(w) ? 3 : 0) + (keys.includes(w) ? 2 : 0) + (text.includes(w) ? 1 : 0);
      if (s === 0) return;
      score += s;
    }
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.entry);
}

// Entrees d'aide enregistrees : celles du plugin, puis celles des scripts quand ils existeront.
export class HelpRegistry {
  private items: HelpEntry[] = [];

  add(entries: HelpEntry[]): void {
    for (const e of entries) {
      if (this.items.some((x) => x.id === e.id)) throw new Error(`Entrée d'aide déjà enregistrée : ${e.id}`);
      this.items.push(e);
    }
  }

  all(): HelpEntry[] {
    return [...this.items];
  }
}
