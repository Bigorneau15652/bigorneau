// Messages du compte rendu d'export, d'apres les signalements de la composition. Ce module ne depend pas d'Obsidian.
import { t } from "./i18n";

export interface ReportOptions {
  // Faux quand le script Formules est desactive : les formules restent ecrites telles quelles, ce que le compte rendu dit une seule
  // fois au lieu de signaler chaque formule.
  formulasEnabled: boolean;
}

export function warningLines(warnings: string[], opts: ReportOptions = { formulasEnabled: true }): string[] {
  const out: string[] = [];
  let formulas = false;
  for (const w of warnings) {
    if (w.startsWith(`note:`)) out.push(t(`Note de bas de page sans définition : {0}`, w.slice(5)));
    else if (w.startsWith(`image:`)) out.push(t(`Image introuvable : {0}`, w.slice(6)));
    else if (w.startsWith(`webimage:`)) out.push(t(`Image du web non téléchargée, remplacée par son adresse : {0}`, w.slice(9)));
    else if (w.startsWith(`renvoi:`)) out.push(t(`Renvoi sans cible dans la note : {0}`, w.slice(7)));
    else if (w.startsWith(`formule:`)) {
      if (opts.formulasEnabled) out.push(t(`Formule non dessinée, son texte est gardé tel quel : {0}`, w.slice(8)));
      else formulas = true;
    } else if (w.startsWith(`media:`)) out.push(t(`Média remplacé par un cadre avec son adresse : {0}`, w.slice(6)));
  }
  if (formulas) out.push(t(`Le script Formules est désactivé : les formules restent écrites telles quelles. Activez-le avec le bouton bigorneau du panneau.`));
  return out;
}
