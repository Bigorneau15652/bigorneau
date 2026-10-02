// Decoupage d'une formule TeX en « unites » (un symbole, un argument, une structure avec ses arguments, un exposant avec sa base)
// pour relier un clic dans l'apercu a la partie correspondante du texte TeX. Pour savoir quels elements dessines appartiennent a
// une unite, on redessine la formule avec cette unite en couleur (\color) : les elements du dessin qui prennent la couleur sont les
// siens. Ce module ne depend ni d'Obsidian ni du navigateur : il se teste avec node --test.

export interface TexUnit {
  // Plage du texte TeX qui est selectionnee quand on choisit l'unite. Pour un argument entre accolades, c'est le contenu
  // sans les accolades : supprimer l'unite laisse un emplacement vide « {} ».
  start: number;
  end: number;
}

// Nombre d'arguments des commandes les plus courantes ; les autres sont des symboles sans argument.
const ARGS: Record<string, number> = {
  frac: 2, dfrac: 2, tfrac: 2, cfrac: 2, binom: 2, sqrt: 1, text: 1, textbf: 1, textit: 1, mathrm: 1, mathbf: 1, mathbb: 1,
  mathcal: 1, mathit: 1, mathsf: 1, mathtt: 1, mathfrak: 1, boldsymbol: 1, overline: 1, underline: 1, hat: 1, widehat: 1, tilde: 1,
  widetilde: 1, vec: 1, bar: 1, dot: 1, ddot: 1, overbrace: 1, underbrace: 1, overrightarrow: 1, xrightarrow: 1, operatorname: 1,
  not: 1, boxed: 1, cancel: 1, mathop: 1,
};

const isSpace = (c: string): boolean => c === ` ` || c === `\n` || c === `\t` || c === `\r`;

export function texUnits(tex: string): TexUnit[] {
  const units: TexUnit[] = [];
  const seen = new Set<string>();
  const push = (start: number, end: number): void => {
    if (end <= start || tex.slice(start, end).trim() === ``) return;
    const key = `${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    units.push({ start, end });
  };
  const skip = (i: number): number => {
    while (i < tex.length && isSpace(tex[i])) i++;
    return i;
  };
  const startsWith = (i: number, s: string): boolean => tex.startsWith(s, i);
  // Fin d'une suite : accolade fermante, separateur de matrice, \right ou \end.
  const stops = (i: number): boolean => i >= tex.length || tex[i] === `}` || tex[i] === `&` || startsWith(i, `\\\\`) || startsWith(i, `\\right`) || startsWith(i, `\\end`);

  // Suite d'elements jusqu'a un arret ; renvoie la position de l'arret.
  const sequence = (from: number): number => {
    let i = skip(from);
    while (!stops(i)) {
      const next = element(i);
      i = skip(next > i ? next : i + 1);
    }
    return i;
  };

  // Delimiteur apres \left ou \right : un caractere, ou une commande comme \{ ou \langle.
  const delimiter = (i: number): number => {
    if (i >= tex.length) return tex.length;
    if (tex[i] !== `\\`) return i + 1;
    let j = i + 1;
    if (j < tex.length && !/[A-Za-z]/.test(tex[j])) return j + 1;
    while (j < tex.length && /[A-Za-z]/.test(tex[j])) j++;
    return j;
  };

  // Argument : groupe entre accolades (son contenu est une unite) ou un seul symbole.
  const argument = (i: number): number => {
    i = skip(i);
    if (i >= tex.length) return i;
    if (tex[i] === `{`) {
      const close = sequence(i + 1);
      push(i + 1, close);
      return tex[close] === `}` ? close + 1 : close;
    }
    return atom(i);
  };

  // Symbole ou structure, sans les exposants et indices qui le suivent.
  const atom = (i: number): number => {
    const c = tex[i];
    if (c === `{`) return argument(i);
    if (c === `\\`) {
      let j = i + 1;
      while (j < tex.length && /[A-Za-z]/.test(tex[j])) j++;
      if (j === i + 1) return Math.min(tex.length, i + 2);
      const name = tex.slice(i + 1, j);
      if (name === `left`) {
        const close = sequence(delimiter(skip(j)));
        let end = close;
        if (startsWith(close, `\\right`)) end = delimiter(skip(close + 6));
        push(i, end);
        return end;
      }
      if (name === `begin`) {
        const open = tex.indexOf(`}`, j);
        if (open < 0) return tex.length;
        let k = open + 1;
        while (k < tex.length) {
          const stop = sequence(k);
          if (tex[stop] === `&`) k = stop + 1;
          else if (startsWith(stop, `\\\\`)) k = stop + 2;
          else {
            k = stop;
            break;
          }
        }
        let end = k;
        if (startsWith(k, `\\end`)) {
          const close = tex.indexOf(`}`, k);
          end = close < 0 ? tex.length : close + 1;
        }
        push(i, end);
        return end;
      }
      let end = j;
      const count = ARGS[name] ?? 0;
      if (name === `sqrt`) {
        const k = skip(end);
        if (tex[k] === `[`) {
          const close = tex.indexOf(`]`, k);
          if (close > 0) {
            push(k + 1, close);
            end = close + 1;
          }
        }
      }
      for (let n = 0; n < count; n++) end = argument(end);
      push(i, end);
      return end;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < tex.length && /[0-9]/.test(tex[j])) j++;
      push(i, j);
      return j;
    }
    // Un caractere, y compris ceux hors du plan de base (deux unites de code).
    const len = c >= `\ud800` && c <= `\udbff` ? 2 : 1;
    push(i, i + len);
    return i + len;
  };

  // Element : symbole ou structure avec ses exposants et indices ; l'ensemble est lui aussi une unite.
  const element = (i: number): number => {
    let end: number;
    if (tex[i] === `^` || tex[i] === `_`) end = i;
    else end = atom(i);
    let k = skip(end);
    let scripts = false;
    while (tex[k] === `^` || tex[k] === `_`) {
      end = argument(k + 1);
      k = skip(end);
      scripts = true;
    }
    if (scripts) push(i, end);
    return end;
  };

  sequence(0);
  return units;
}

export interface SvgLeaf {
  // Couleur imposee par un \color englobant, ou null.
  color: string | null;
}

// Elements dessines (glyphes et traits) d'un dessin SVG de MathJax, dans l'ordre du document, hors des definitions de glyphes, avec la
// couleur que leur impose le plus proche element englobant qui en a une. Meme parcours que celui du navigateur dans l'apercu.
export function svgLeaves(svg: string): SvgLeaf[] {
  const out: SvgLeaf[] = [];
  const stack: { name: string; color: string | null }[] = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let defs = 0;
  for (let m = tag.exec(svg); m; m = tag.exec(svg)) {
    const [, closing, name, attrs, selfClosing] = m;
    if (closing) {
      const top = stack.pop();
      if (top && top.name === `defs`) defs--;
      continue;
    }
    const fill = /\sfill="([^"]*)"/.exec(attrs)?.[1];
    const parent = stack.length > 0 ? stack[stack.length - 1].color : null;
    const color = fill !== undefined && fill !== `currentColor` ? fill : parent;
    if (name === `defs` && !selfClosing) defs++;
    if (defs === 0 && (name === `use` || name === `rect`)) out.push({ color });
    if (!selfClosing) stack.push({ name, color });
  }
  return out;
}

// Texte TeX ou l'unite est dessinee dans la couleur donnee.
export function colorUnit(tex: string, unit: TexUnit, color: string): string {
  return `${tex.slice(0, unit.start)}{\\color{${color}}${tex.slice(unit.start, unit.end)}}${tex.slice(unit.end)}`;
}

// Supprime une unite choisie dans l'apercu. Un argument d'exposant ou d'indice disparait avec son signe (x^{2} devient x) ; un autre
// argument laisse son emplacement vide (\frac{a}{b} devient \frac{}{b}).
export function deleteUnit(tex: string, unit: TexUnit): { text: string; caret: number } {
  let { start, end } = unit;
  const braced = tex[start - 1] === `{` && tex[end] === `}`;
  if (braced && /[\^_]/.test(tex[start - 2] ?? ``)) {
    start -= 2;
    end += 1;
  } else if (!braced && /[\^_]/.test(tex[start - 1] ?? ``)) {
    start -= 1;
  }
  return { text: tex.slice(0, start) + tex.slice(end), caret: start };
}

// Unites qui contiennent l'element dessine d'indice donne, de la plus petite a la plus grande. `sets[k]` donne les indices des elements
// de l'unite k.
export function unitsAt(units: TexUnit[], sets: number[][], leaf: number): TexUnit[] {
  const found: { unit: TexUnit; size: number }[] = [];
  units.forEach((u, k) => {
    if (sets[k].includes(leaf)) found.push({ unit: u, size: sets[k].length });
  });
  found.sort((a, b) => a.size - b.size || a.unit.end - a.unit.start - (b.unit.end - b.unit.start));
  // Deux unites qui designent les memes elements et le meme texte ne sont proposees qu'une fois.
  const out: TexUnit[] = [];
  for (const f of found) if (!out.some((o) => o.start === f.unit.start && o.end === f.unit.end)) out.push(f.unit);
  return out;
}
