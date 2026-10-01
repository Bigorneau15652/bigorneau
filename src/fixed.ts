// Notes fixes : copies d'un chapitre ouvertes dans leur propre volet, au-dessus de la note dynamique (celle qui suit la
// carte). Une note fixe garde le titre choisi et ne montre que son contenu.
import { activeLines, flattenDoc, MmDoc } from "./model";

// Chapitre d'une note fixe, retrouve par son titre quand la structure de la note a change.
export interface FixedTarget {
  key: string;
  title: string;
}

export interface FixedRange {
  key: string;
  startLine: number;
  endLine: number;
}

// Lignes du chapitre d'une note fixe. Le titre est cherche d'abord a la place memorisee, puis ailleurs dans la note ;
// null si le titre n'existe plus. Sans `includeSubtitles`, seul le paragraphe du titre est montre.
export function resolveFixed(doc: MmDoc, target: FixedTarget, includeSubtitles: boolean): FixedRange | null {
  const flat = flattenDoc(doc);
  const same = (e: { key: string; node: { title: string } }): boolean => e.node.title === target.title;
  const found = flat.find((e) => e.key === target.key && same(e)) ?? flat.find(same);
  if (!found) return null;
  const lines = activeLines(doc, found.key, includeSubtitles);
  return lines ? { key: found.key, ...lines } : null;
}
