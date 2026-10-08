// Construction d'elements a partir de dessins SVG ecrits dans le plugin (icones, pointes de fleche, pictogrammes des boutons).
// Les consignes d'Obsidian demandent de ne pas utiliser innerHTML : le texte du dessin est lu comme du SVG (XML), puis ses
// elements sont copies dans la page. Un texte mal forme n'ajoute rien.
const SVG_NS = `http://www.w3.org/2000/svg`;

// Dessins deja lus : la carte pose une icone (repli, oeil, liens) sur chaque case, et relire le texte SVG a chaque fois coutait plus de la
// moitie du temps d'affichage d'une grande carte. Chaque texte n'est lu qu'une fois ; les elements sont ensuite copies. Cache borne.
const parsed = new Map<string, Node[]>();
const PARSED_LIMIT = 300;

function nodesOf(markup: string): Node[] {
  const known = parsed.get(markup);
  if (known) return known;
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, `image/svg+xml`);
  const nodes = doc.querySelector(`parsererror`) ? [] : Array.from(doc.documentElement.childNodes);
  if (parsed.size >= PARSED_LIMIT) parsed.delete(parsed.keys().next().value as string);
  parsed.set(markup, nodes);
  return nodes;
}

// Remplace le contenu de `el` par les elements SVG decrits par `markup` (texte vide : vide l'element).
export function setSvg(el: Element, markup: string): void {
  el.replaceChildren();
  if (markup === ``) return;
  for (const node of nodesOf(markup)) el.appendChild(el.ownerDocument.importNode(node, true));
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
