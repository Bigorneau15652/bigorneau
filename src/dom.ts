// Construction d'elements a partir de dessins SVG ecrits dans le plugin (icones, pointes de fleche, pictogrammes des boutons).
// Les consignes d'Obsidian demandent de ne pas utiliser innerHTML : le texte du dessin est lu comme du SVG (XML), puis ses
// elements sont copies dans la page. Un texte mal forme n'ajoute rien.
const SVG_NS = `http://www.w3.org/2000/svg`;

// Remplace le contenu de `el` par les elements SVG decrits par `markup` (texte vide : vide l'element).
export function setSvg(el: Element, markup: string): void {
  el.replaceChildren();
  if (markup === ``) return;
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, `image/svg+xml`);
  if (doc.querySelector(`parsererror`)) return;
  for (const node of Array.from(doc.documentElement.childNodes)) el.appendChild(el.ownerDocument.importNode(node, true));
}

// Ajoute dans `parent` l'element svg decrit par un texte SVG complet (un dessin de MathJax, par exemple) et le renvoie ; null si le texte
// est mal forme. Meme principe que setSvg : le texte est lu comme du XML, jamais comme du HTML.
export function appendSvgDocument(parent: Element, markup: string): SVGElement | null {
  const doc = new DOMParser().parseFromString(markup, `image/svg+xml`);
  if (doc.querySelector(`parsererror`) || doc.documentElement.localName !== `svg`) return null;
  const node = parent.ownerDocument.importNode(doc.documentElement, true) as unknown as SVGElement;
  parent.appendChild(node);
  return node;
}
