// Export de haute qualite : conventions typographiques francaises (Imprimerie nationale, Lexique des regles typographiques;
// package babel pour le francais) appliquees avant la composition. Elles ne s'appliquent qu'aux textes en francais.
// Phase 1 de la liste : la liste complete sera etablie a partir du Lexique, voir docs/POLITIQUE-EXPORT.md paragraphe 2.7.
import { FINE_SPACE, NO_BREAK_SPACE } from "./font-metrics";

const SPACES = `    `;

// Abreviations apres lesquelles on ne coupe pas la ligne, et unites qui ne se separent pas du nombre qui les precede.
const ABBREVIATIONS = /(M\.|MM\.|Mme|Mmes|Mlle|Dr|Pr|p\.|pp\.|art\.|fig\.|chap\.|vol\.|n°|N°)[ ]+(?=[\p{L}\d])/gu;
const UNITS = /(\d)[ ]+(?=(?:kWh|MWh|GWh|kW|MW|W|Wh|m²|m³|m2|m3|%|€|°C|°|km|cm|mm|m|kg|t|g|h|min|s|an|ans|mois|jours?|euros?|k€|M€)(?![\p{L}\d]))/gu;

// Espace insecable apres les abreviations (M., Mme, p., n°) qui ne font pas partie d'un mot plus long (« AM. » n'est pas « M. »).
// Le caractere qui precede est verifie a la main, parce que les anciens iPhone et iPad ne savent pas lire les expressions a
// « lookbehind ».
export function abbreviationSpacing(text: string): string {
  return text.replace(ABBREVIATIONS, (m: string, abbr: string, at: number, whole: string) => {
    const prev = at > 0 ? (Array.from(whole.slice(Math.max(0, at - 2), at)).pop() as string) : ``;
    return /[\p{L}\d]/u.test(prev) ? m : `${abbr}${NO_BREAK_SPACE}`;
  });
}

// Insere ou normalise les espaces insecables : fine avant ; ! ? , insecable avant les deux-points et a l'interieur des
// guillemets francais, insecable apres les abreviations (M., Mme, p., n°) et entre un nombre et son unite.
export function frenchSpacing(text: string): string {
  let out = text;
  // Fine insecable avant ; ! ? (suites comme ?! comprises), si la ponctuation termine un mot ou une expression.
  out = out.replace(new RegExp(`([^${SPACES}\\s])[${SPACES}]*([;!?]+)(?=[\\s)\\]»”"\uE000]|$)`, `g`), `$1${FINE_SPACE}$2`);
  // Insecable avant les deux-points, sauf dans une heure (10:30) ou une adresse (http://).
  out = out.replace(new RegExp(`([^${SPACES}\\s:])[${SPACES}]*:(?=\\s|$)`, `g`), `$1${NO_BREAK_SPACE}:`);
  // Guillemets francais : insecable a l'interieur.
  out = out.replace(new RegExp(`«[${SPACES}]*`, `g`), `«${NO_BREAK_SPACE}`);
  out = out.replace(new RegExp(`[${SPACES}]*»`, `g`), `${NO_BREAK_SPACE}»`);
  out = abbreviationSpacing(out);
  out = out.replace(UNITS, `$1${NO_BREAK_SPACE}`);
  return out;
}
