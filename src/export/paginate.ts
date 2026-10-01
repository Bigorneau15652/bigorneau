// Export de haute qualite, etage 5 : repartition des lignes composees en pages, comme le fait TeX pour les pages.
// Chaque point de coupure possible (apres une ligne) a un cout : la penalite de la ligne (orpheline, veuve, titre) plus, quand
// les pages sont alignees en bas, la laideur de l'etirement vertical necessaire pour remplir la page. On retient, parmi les
// coupures qui tiennent dans la page, celle de cout minimal (la plus basse l'emporte en cas d'egalite). Les notes de bas de
// page sont reservees en bas de la page de leur appel, et celles qui ne tiennent pas se prolongent sur la page suivante.
// Reimplementation d'apres la these de Plass (1981) et le constructeur de pages de TeX, sans reprise de code.
import { badness } from "./line-break";
import { INF_PENALTY } from "./tex-params";
import { FootnoteBlock, PageSetup, PageStyle, Row, TypesetDoc } from "./typeset";

export interface Page {
  number: number;
  // Lignes du corps de page. Quand les pages sont alignees en bas, la hauteur des espaces est deja ajustee.
  rows: Row[];
  // Lignes des notes de bas de page de la page, a placer en bas, sous un filet de separation.
  footnotes: Row[];
  header?: string;
  footer?: string;
}

// Hauteur reservee au filet de separation des notes (filet et espaces autour).
export const FOOTNOTE_RULE_HEIGHT = 12;
const EPS = 1e-6;

export function paginate(typeset: Pick<TypesetDoc, `rows` | `footnotes` | `title`>, setup: PageSetup, style: PageStyle): Page[] {
  const rows = typeset.rows;
  const blocks = typeset.footnotes;
  const available = setup.height - setup.marginTop - setup.marginBottom;
  const n = rows.length;
  const pages: Page[] = [];
  // Notes deja imprimees (un appel repete ne reserve pas de place une seconde fois) et lignes de notes reportees.
  const placed = new Set<number>();
  let carry: Row[] = [];
  const sum = (rs: Row[]): number => rs.reduce((a, r) => a + r.height, 0);

  // Hauteur occupee par les notes d'une liste de cles, regles comprises.
  const footArea = (keys: number[], carried: number): number => {
    let h = carried;
    for (const k of keys) h += blocks.get(k)?.height ?? 0;
    return h > 0 ? h + FOOTNOTE_RULE_HEIGHT : 0;
  };
  const newKeys = (r: Row, into: number[]): void => {
    for (const k of r.notes ?? []) if (!placed.has(k) && !into.includes(k)) into.push(k);
  };

  let i = 0;
  while (i < n) {
    while (i < n && rows[i].kind === `space`) i++;
    if (i >= n) break;

    const carriedHeight = sum(carry);
    let height = 0;
    let stretch = 0;
    const keys: number[] = [];
    let best = -1;
    let bestCost = Infinity;
    let lastFit = -1;
    for (let j = i; j < n; j++) {
      const r = rows[j];
      height += r.height;
      stretch += r.stretch ?? 0;
      newKeys(r, keys);
      if (r.kind === `space`) continue;
      const total = height + footArea(keys, carriedHeight);
      if (total > available + EPS) break;
      lastFit = j;
      const forced = j === n - 1 || rows[j + 1].breakBefore === true;
      const penalty = forced ? -INF_PENALTY : r.breakAfter;
      // Une penalite infinie interdit la coupure ici.
      if (penalty >= INF_PENALTY) continue;
      let bad = 0;
      if (style.flushBottom && !forced) {
        const slack = available - total;
        bad = slack <= EPS ? 0 : badness(slack, stretch);
      }
      if (bad + penalty <= bestCost) {
        best = j;
        bestCost = bad + penalty;
      }
      if (forced) break;
    }
    // Aucune coupure permise : on coupe apres la derniere ligne qui tient, ou on laisse une ligne trop haute seule.
    const fallback = best < 0;
    if (fallback) best = lastFit >= 0 ? lastFit : i;

    const body = rows.slice(i, best + 1);
    const bodyKeys: number[] = [];
    for (const r of body) newKeys(r, bodyKeys);
    let foot: Row[] = [...carry];
    for (const k of bodyKeys) {
      foot.push(...(blocks.get(k) as FootnoteBlock).rows);
      placed.add(k);
    }
    carry = [];
    // Notes trop longues pour la page : la fin se prolonge sur la page suivante.
    const bodyHeight = sum(body);
    if (foot.length > 0 && bodyHeight + FOOTNOTE_RULE_HEIGHT + sum(foot) > available + EPS) {
      const room = available - bodyHeight - FOOTNOTE_RULE_HEIGHT;
      let used = 0;
      let count = 0;
      while (count < foot.length && used + foot[count].height <= room + EPS) used += foot[count++].height;
      carry = foot.slice(count);
      foot = foot.slice(0, count);
    }

    let pageRows = body;
    if (style.flushBottom && best < n - 1 && rows[best + 1].breakBefore !== true) {
      const footHeight = foot.length > 0 ? sum(foot) + FOOTNOTE_RULE_HEIGHT : 0;
      const slack = available - bodyHeight - footHeight;
      const room = body.reduce((a, r) => a + (r.stretch ?? 0), 0);
      if (slack > EPS && room > 0) {
        // Les espaces s'etirent proportionnellement a leur capacite, sans depasser le triple de leur hauteur.
        const factor = Math.min(slack / room, 3);
        pageRows = body.map((r) => (r.stretch ? { ...r, height: r.height + r.stretch * factor } : r));
      }
    }
    pages.push({ number: pages.length + 1, rows: pageRows, footnotes: foot });
    i = best + 1;
  }
  // Notes reportees apres la derniere ligne : elles occupent des pages sans corps.
  while (carry.length > 0) {
    const kept: Row[] = [];
    let used = 0;
    for (const f of carry) {
      if (used + f.height > available - FOOTNOTE_RULE_HEIGHT + EPS && kept.length > 0) break;
      kept.push(f);
      used += f.height;
    }
    pages.push({ number: pages.length + 1, rows: [], footnotes: kept });
    carry = carry.slice(kept.length);
  }

  // En-tetes et pieds de page.
  pages.forEach((p, index) => {
    if (style.footer === `number`) p.footer = String(p.number);
    if (index === 0 || style.header === `none`) return;
    if (style.header === `title`) {
      p.header = typeset.title;
      return;
    }
    // En-tete courant : le chapitre qui commence la page, sauf si un chapitre commence en haut de la page (son titre est deja la).
    const first = p.rows.find((r) => r.kind !== `space`);
    if (first?.chapterStart) return;
    if (first?.chapter) p.header = first.chapter;
  });
  return pages;
}
