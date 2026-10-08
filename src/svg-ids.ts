// Les dessins de MathJax portent des identifiants (MJX-1-TEX-...) qui sont les memes d'un dessin a l'autre. Dans une page qui en
// contient plusieurs, une reference (<use href="#MJX-1-...">) retrouve le premier element portant cet identifiant, qui peut se trouver dans
// un dessin cache (section repliee, onglet inactif) : le symbole reste alors invisible. Chaque dessin recoit donc des identifiants propres.
// Ce module ne depend pas d'Obsidian.
export function uniqueSvgIds(markup: string, suffix: string): string {
  const ids = new Set<string>();
  for (const m of markup.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  let out = markup;
  for (const id of ids) {
    const renamed = `${id}-${suffix}`;
    out = out.split(`id="${id}"`).join(`id="${renamed}"`);
    for (const end of [`"`, `'`, `)`]) out = out.split(`#${id}${end}`).join(`#${renamed}${end}`);
  }
  return out;
}
