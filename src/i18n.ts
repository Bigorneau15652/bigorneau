// Langue du plugin : francais ou anglais, selon la langue d'Obsidian (ou le choix fait dans les reglages).
// Le texte francais sert de cle : `t("Texte francais")` renvoie la traduction anglaise si la langue est l'anglais, et le
// texte lui-meme sinon. Les valeurs variables s'ecrivent {0}, {1}... et se passent en arguments.
import { EN } from "./i18n-en";

export type Lang = `fr` | `en`;
export type LangSetting = `auto` | Lang;

let current: Lang = `fr`;

// Langue d'Obsidian : memorisee par l'application dans le stockage local (cle « language ») ; absente, c'est l'anglais.
export function detectLang(): Lang {
  try {
    const stored = (globalThis as { localStorage?: { getItem(k: string): string | null } }).localStorage?.getItem(`language`);
    return stored && stored.toLowerCase().startsWith(`fr`) ? `fr` : `en`;
  } catch {
    return `en`;
  }
}

export function setLanguage(mode: LangSetting): void {
  current = mode === `auto` ? detectLang() : mode;
}

export function currentLang(): Lang {
  return current;
}

export function t(fr: string, ...args: (string | number)[]): string {
  let out = current === `en` ? EN[fr] ?? fr : fr;
  args.forEach((a, i) => {
    out = out.split(`{${i}}`).join(String(a));
  });
  return out;
}
