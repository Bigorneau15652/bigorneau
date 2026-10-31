// Langue du plugin : francais ou anglais, selon la langue d'Obsidian (ou le choix fait dans les reglages).
// Le texte francais sert de cle : `t("Texte francais")` renvoie la traduction anglaise si la langue est l'anglais, et le
// texte lui-meme sinon. Les valeurs variables s'ecrivent {0}, {1}... et se passent en arguments.
import { EN } from "./i18n-en";

export type Lang = `fr` | `en`;
export type LangSetting = `auto` | Lang;

let current: Lang = `fr`;

// Langue d'Obsidian. Plusieurs sources, de la plus sure a la moins sure : la cle « language » du stockage local (absente quand
// l'application est en anglais, et absente aussi dans certaines versions), la langue de la bibliotheque de dates de l'application
// (moment, reglee sur la langue d'Obsidian), l'attribut lang de la page, enfin la langue du navigateur. Sans aucune de ces
// informations, c'est l'anglais.
export function detectLang(): Lang {
  try {
    if (typeof window === `undefined`) return `en`;
    const host = window as unknown as { localStorage?: { getItem(key: string): string | null }; moment?: { locale?: () => string }; document?: { documentElement?: { lang?: string } }; navigator?: { language?: string } };
    const sources = [host.localStorage?.getItem(`language`), host.moment?.locale?.(), host.document?.documentElement?.lang, host.navigator?.language];
    for (const value of sources) {
      if (typeof value === `string` && value.trim() !== ``) return value.trim().toLowerCase().startsWith(`fr`) ? `fr` : `en`;
    }
    return `en`;
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
