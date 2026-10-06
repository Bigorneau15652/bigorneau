// Export de haute qualite, etage 5 : repartition des lignes composees en pages, comme le fait TeX pour les pages.
// Chaque point de coupure possible (apres une ligne) a un cout : la penalite de la ligne (orpheline, veuve, titre) plus, quand
// les pages sont alignees en bas, la laideur de l'etirement vertical necessaire pour remplir la page. On retient, parmi les
// coupures qui tiennent dans la page, celle de cout minimal (la plus basse l'emporte en cas d'egalite). Les notes de bas de
// page sont reservees en bas de la page de leur appel, et celles qui ne tiennent pas se prolongent sur la page suivante.
// Reimplementation d'apres la these de Plass (1981) et le constructeur de pages de TeX, sans reprise de code.
import { badness } from "./line-break";
import type { DecorItem } from "./page-decor";
import { INF_PENALTY } from "./tex-params";
import { FloatBlock, FootnoteBlock, PageSetup, PageStyle, Row, TypesetDoc } from "./typeset";

// Une colonne de texte d'une feuille a plusieurs colonnes : ses lignes, ses flottants et ses notes, et sa place sur la feuille
// (decalage depuis la marge gauche, et largeur).
export interface ColumnPage {
  rows: Row[];
  footnotes: Row[];
  topFloats?: Row[];
  bottomFloats?: Row[];
  x: number;
  width: number;
}

export interface Page {
  number: number;
  // Lignes du corps de page. Quand les pages sont alignees en bas, la hauteur des espaces est deja ajustee.
  rows: Row[];
  // Lignes des notes de bas de page de la page, a placer en bas, sous un filet de separation.
  footnotes: Row[];
  // Figures et tableaux flottants : en haut de la page, avant le corps, ou en bas, juste au-dessus des notes. Chaque liste
  // comprend l'espace qui la separe du texte.
  topFloats?: Row[];
  bottomFloats?: Row[];
  // Feuille a plusieurs colonnes : chaque colonne se dessine a part. `rows`, `topFloats` et `bottomFloats` rassemblent alors celles de
  // toutes les colonnes (pour retrouver les ancres et les titres de la page) et ne sont pas dessinees.
  columns?: ColumnPage[];
  // Feuille de cette page quand elle differe de celle de la note (zone en paysage ou en portrait, voir page-zone.ts).
  setup?: PageSetup;
  header?: string;
  footer?: string;
  // En-tete, pied de page et numero composes d'apres les reglages de la note (voir page-decor.ts) : ils remplacent header et footer.
  decor?: DecorItem[];
}

// Hauteur reservee au filet de separation des notes (filet et espaces autour).
export const FOOTNOTE_RULE_HEIGHT = 12;
const EPS = 1e-6;
// Part de la page que les flottants peuvent occuper (sauf le premier, qui est toujours place).
const FLOAT_FRACTION = 0.75;

interface PlacedFloat {
  float: FloatBlock;
  position: `top` | `bottom`;
}

const floatRows = (p: PlacedFloat, gapRow: (h: number) => Row): Row[] => (p.position === `top` ? [...p.float.rows, gapRow(p.float.gap)] : [gapRow(p.float.gap), ...p.float.rows]);

// Numero de la page (a partir de 1) ou se trouve chaque ancre (titres, blocs avec identifiant, figures, tableaux).
export function anchorPages(pages: Page[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pages) {
    for (const list of [p.topFloats ?? [], p.rows, p.bottomFloats ?? []]) {
      for (const r of list) if (r.anchor !== undefined && !out.has(r.anchor)) out.set(r.anchor, p.number);
    }
  }
  return out;
}

// Colonnes de la feuille : celles de `columns`, ou une seule faite de la page elle-meme.
export function columnsOf(page: Page, textWidth: number): ColumnPage[] {
  return page.columns ?? [{ rows: page.rows, footnotes: page.footnotes, ...(page.topFloats ? { topFloats: page.topFloats } : {}), ...(page.bottomFloats ? { bottomFloats: page.bottomFloats } : {}), x: 0, width: textWidth }];
}

// Regroupe des pages d'une colonne en feuilles de `count` colonnes : la premiere colonne est a gauche, la suivante a droite, et ainsi
// de suite ; la feuille est numerotee a partir de 1. La derniere feuille peut n'avoir que quelques colonnes.
export function groupColumns(columnPages: Page[], count: number, width: number, gap: number, firstNumber = 1): Page[] {
  const out: Page[] = [];
  for (let k = 0; k < columnPages.length; k += count) {
    const group = columnPages.slice(k, k + count);
    const columns: ColumnPage[] = group.map((p, i) => ({
      rows: p.rows,
      footnotes: p.footnotes,
      ...(p.topFloats ? { topFloats: p.topFloats } : {}),
      ...(p.bottomFloats ? { bottomFloats: p.bottomFloats } : {}),
      x: i * (width + gap),
      width,
    }));
    const tops = group.flatMap((p) => p.topFloats ?? []);
    const bottoms = group.flatMap((p) => p.bottomFloats ?? []);
    out.push({ number: firstNumber + out.length, rows: group.flatMap((p) => p.rows), footnotes: [], ...(tops.length > 0 ? { topFloats: tops } : {}), ...(bottoms.length > 0 ? { bottomFloats: bottoms } : {}), columns });
  }
  return out;
}

// `firstNumber` : numero de la premiere page (une zone d'une autre orientation continue la numerotation de la partie precedente).
export function paginate(typeset: Pick<TypesetDoc, `rows` | `footnotes` | `title`>, setup: PageSetup, style: PageStyle, firstNumber = 1): Page[] {
  const rows = typeset.rows;
  const blocks = typeset.footnotes;
  const available = setup.height - setup.marginTop - setup.marginBottom;
  const n = rows.length;
  const pages: Page[] = [];
  // Notes deja imprimees (un appel repete ne reserve pas de place une seconde fois) et lignes de notes reportees.
  const printed = new Set<number>();
  let carry: Row[] = [];
  const sum = (rs: Row[]): number => rs.reduce((a, r) => a + r.height, 0);

  // Hauteur occupee par les notes d'une liste de cles, regles comprises.
  const footArea = (keys: number[], carried: number): number => {
    let h = carried;
    for (const k of keys) h += blocks.get(k)?.height ?? 0;
    return h > 0 ? h + FOOTNOTE_RULE_HEIGHT : 0;
  };
  const newKeys = (r: Row, into: number[]): void => {
    for (const k of r.notes ?? []) if (!printed.has(k) && !into.includes(k)) into.push(k);
  };

  const gapRow = (h: number): Row => ({ kind: `space`, text: ``, x: 0, width: 0, fontSize: setup.fontSize, height: h, wordSpacing: 0, breakAfter: 0, align: `left` });
  const floatHeight = (list: PlacedFloat[]): number => list.reduce((a, p) => a + p.float.height, 0);
  // Flottants qui attendent une place, dans l'ordre ou ils ont ete ecrits.
  let deferred: FloatBlock[] = [];
  // Derniere ligne qui n'est ni un espace ni un repere de flottant.
  let lastReal = -1;
  rows.forEach((r, k) => {
    if (r.kind !== `space` && !r.float) lastReal = k;
  });

  let i = 0;
  while (i < n || deferred.length > 0) {
    if (i < n && rows[i].kind === `space`) {
      i++;
      continue;
    }
    // Page de flottants seuls, apres la derniere ligne du texte.
    const bodyDone = i >= n;

    // Tableau coupe par la page precedente : son en-tete est repete en haut de celle-ci.
    const prefix: Row[] = !bodyDone && i > 0 && rows[i].table && rows[i - 1].table?.id === rows[i].table?.id ? (rows[i].table as { header: Row[] }).header : [];
    const prefixHeight = sum(prefix);

    const carriedHeight = sum(carry);
    const keys: number[] = [];
    // Flottants en attente : en haut de cette page, tant qu'ils y tiennent.
    const placed: PlacedFloat[] = [];
    let floatH = 0;
    const queue = deferred;
    deferred = [];
    while (queue.length > 0) {
      const f = queue[0];
      const fits = placed.length === 0 || (floatH + f.height <= available * FLOAT_FRACTION + EPS && prefixHeight + floatH + f.height + footArea(keys, carriedHeight) <= available + EPS);
      if (!fits) break;
      queue.shift();
      placed.push({ float: f, position: `top` });
      floatH += f.height;
      for (const r of f.rows) newKeys(r, keys);
    }
    const deferredNew: FloatBlock[] = [...queue];

    let height = prefixHeight;
    let stretch = 0;
    let best = -1;
    let bestCost = Infinity;
    let lastFit = -1;
    let bestSnap = { p: placed.length, d: deferredNew.length };
    let lastSnap = bestSnap;
    // Quand la page se termine de force (fin du texte, saut de page obligatoire), les reperes de flottants qui suivent la
    // derniere ligne appartiennent encore a cette page : `endIdx` est la derniere ligne qu'elle prend.
    let endIdx = -1;
    for (let j = i; j < n && !bodyDone; j++) {
      if (endIdx >= 0 && j > endIdx) break;
      const r = rows[j];
      height += r.height;
      stretch += r.stretch ?? 0;
      newKeys(r, keys);
      if (r.float) {
        // Un flottant se place sur cette page s'il y tient et si aucun flottant precedent n'attend : en haut, ou en bas si la
        // page est deja bien remplie. Sinon il attend la page suivante.
        const f = r.float;
        const before = height - prefixHeight;
        const atStart = placed.length === 0 && before === 0;
        const room = height + floatH + f.height + footArea(keys, carriedHeight) <= available + EPS;
        const fits = floatH + f.height <= available * FLOAT_FRACTION + EPS && room;
        // Repere pres du haut de la page : le flottant se place en haut ; pres du bas : en bas ; entre les deux, il attend le haut
        // de la page suivante pour ne pas passer avant du texte qui le precede de loin.
        const position = before <= available * 0.25 ? `top` : before >= available * 0.6 ? `bottom` : undefined;
        if (deferredNew.length === 0 && (atStart || (position && fits))) {
          placed.push({ float: f, position: position ?? `top` });
          floatH += f.height;
          for (const fr of f.rows) newKeys(fr, keys);
        } else {
          deferredNew.push(f);
        }
      }
      if (endIdx >= 0 || r.kind === `space` || r.float) continue;
      const total = height + floatH + footArea(keys, carriedHeight);
      if (total > available + EPS) break;
      lastFit = j;
      lastSnap = { p: placed.length, d: deferredNew.length };
      let next = j + 1;
      while (next < n && rows[next].float) next++;
      const forced = j >= lastReal || next >= n || rows[next].breakBefore === true;
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
        bestSnap = lastSnap;
      }
      if (forced) endIdx = j >= lastReal ? n - 1 : next - 1;
    }
    let snap = bestSnap;
    if (endIdx >= 0) {
      best = endIdx;
      snap = { p: placed.length, d: deferredNew.length };
    }
    if (!bodyDone) {
      // Aucune coupure permise : on coupe apres la derniere ligne qui tient, ou on laisse une ligne trop haute seule.
      if (best < 0) {
        best = lastFit >= 0 ? lastFit : i;
        snap = lastFit >= 0 ? lastSnap : { p: placed.length, d: deferredNew.length };
        // Marqueurs de flottants passes en revue au-dela de la derniere ligne gardee : ils sont reexamines a la page suivante.
      }
    } else {
      best = i - 1;
    }
    // Flottants deja traites : ceux de la page jusqu'a la coupure, et les reportes.
    const pagePlaced = placed.slice(0, snap.p);
    deferred = deferredNew.slice(0, snap.d);
    // Quand la ligne trop haute reste seule, les flottants rencontres avant elle ont pu etre comptes : ils le sont dans snap.

    const bodyOnly = bodyDone ? [] : rows.slice(i, best + 1);
    let body = [...prefix, ...bodyOnly];
    if (!bodyDone && rows[best + 1]?.table && rows[best]?.table && rows[best].table?.id === rows[best + 1].table?.id && body.length > 0) {
      // Tableau coupe ici : filet de fermeture sous la derniere ligne de la page.
      const last = body[body.length - 1];
      body = [...body.slice(0, -1), { ...last, rules: { ...last.rules, bottom: true } }];
    }
    const bodyKeys: number[] = [];
    for (const r of body) newKeys(r, bodyKeys);
    for (const p of pagePlaced) for (const r of p.float.rows) newKeys(r, bodyKeys);
    let foot: Row[] = [...carry];
    for (const k of bodyKeys) {
      foot.push(...(blocks.get(k) as FootnoteBlock).rows);
      printed.add(k);
    }
    carry = [];
    // Notes trop longues pour la page : la fin se prolonge sur la page suivante.
    const pageFloatH = floatHeight(pagePlaced);
    const bodyHeight = sum(body) + pageFloatH;
    if (foot.length > 0 && bodyHeight + FOOTNOTE_RULE_HEIGHT + sum(foot) > available + EPS) {
      const room = available - bodyHeight - FOOTNOTE_RULE_HEIGHT;
      let used = 0;
      let count = 0;
      while (count < foot.length && used + foot[count].height <= room + EPS) used += foot[count++].height;
      carry = foot.slice(count);
      foot = foot.slice(0, count);
    }

    let pageRows = body;
    if (style.flushBottom && !bodyDone && best < n - 1 && rows[best + 1].breakBefore !== true) {
      const footHeight = foot.length > 0 ? sum(foot) + FOOTNOTE_RULE_HEIGHT : 0;
      const slack = available - bodyHeight - footHeight;
      const room = body.reduce((a, r) => a + (r.stretch ?? 0), 0);
      if (slack > EPS && room > 0) {
        // Les espaces s'etirent proportionnellement a leur capacite, sans depasser le triple de leur hauteur.
        const factor = Math.min(slack / room, 3);
        pageRows = body.map((r) => (r.stretch ? { ...r, height: r.height + r.stretch * factor } : r));
      }
    }
    const top = pagePlaced.filter((p) => p.position === `top`).flatMap((p) => floatRows(p, gapRow));
    const bottom = pagePlaced.filter((p) => p.position === `bottom`).flatMap((p) => floatRows(p, gapRow));
    pages.push({ number: firstNumber + pages.length, rows: pageRows, footnotes: foot, ...(top.length > 0 ? { topFloats: top } : {}), ...(bottom.length > 0 ? { bottomFloats: bottom } : {}) });
    i = bodyDone ? n : best + 1;
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
    pages.push({ number: firstNumber + pages.length, rows: [], footnotes: kept });
    carry = carry.slice(kept.length);
  }

  // En-tetes et pieds de page.
  pages.forEach((p, index) => {
    if (style.footer === `number`) p.footer = String(p.number);
    if ((index === 0 && firstNumber === 1) || style.header === `none`) return;
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
