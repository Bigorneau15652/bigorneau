// Export de haute qualite : dessin des formules par MathJax (bibliotheque mathjax-full, licence Apache 2.0, integree au plugin).
// MathJax lit la formule en TeX et produit un dessin SVG, que math.ts ramene a un contour. Aucun navigateur n'est necessaire :
// l'adaptateur « lite » de MathJax travaille sur un arbre en memoire, ce qui permet de tester ce module avec node --test.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { MathAsset, parseMathSvg } from "./math";

interface Engine {
  convert(tex: string, display: boolean): string;
}

let engine: Engine | undefined;

// Le moteur est cree a la premiere formule. Les extensions qui chargent d'autres fichiers a la demande (autoload, require) sont
// laissees de cote : elles ne fonctionnent pas dans un fichier unique. Les extensions noundefined et noerrors sont ecartees pour qu'une
// commande inconnue ou une formule incorrecte soit refusee (et signalee) au lieu d'etre dessinee comme du texte.
function getEngine(): Engine {
  if (engine) return engine;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const packages = AllPackages.filter((p: string) => ![`autoload`, `require`, `noundefined`, `noerrors`].includes(p));
  const doc = mathjax.document(``, { InputJax: new TeX({ packages }), OutputJax: new SVG({ fontCache: `local` }) });
  engine = { convert: (tex, display) => adaptor.serializeXML(doc.convert(tex, { display }) as LiteElement) };
  return engine;
}

// Formules deja dessinees : l'apercu de l'export est recompose a chaque pause de frappe, et chaque formule garde son dessin d'une fois a
// l'autre (le dessin ne depend que du texte TeX et du mode). Le cache est borne.
const CACHE_LIMIT = 400;
const assets = new Map<string, MathAsset | null>();
const svgs = new Map<string, string | null>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return value;
}

// Dessin d'une formule TeX, ou null si MathJax la refuse (syntaxe incorrecte) ou si le dessin est illisible.
export function renderTex(tex: string, display: boolean): MathAsset | null {
  const key = `${display ? `D` : `I`}:${tex}`;
  if (assets.has(key)) return assets.get(key) as MathAsset | null;
  try {
    return remember(assets, key, parseMathSvg(getEngine().convert(tex, display), tex, display));
  } catch {
    return remember(assets, key, null);
  }
}

// Dessin SVG complet d'une formule (celui de MathJax, avec ses glyphes), pour l'apercu de l'editeur de formules ; null si MathJax la
// refuse. Le texte renvoye est l'element svg seul.
export function renderTexSvg(tex: string, display: boolean): string | null {
  const key = `${display ? `D` : `I`}:${tex}`;
  if (svgs.has(key)) return svgs.get(key) as string | null;
  try {
    const out = getEngine().convert(tex, display);
    if (/data-mml-node="merror"|<mjx-merror|data-mjx-error/.test(out)) return remember(svgs, key, null);
    const from = out.indexOf(`<svg`);
    const to = out.lastIndexOf(`</svg>`);
    return remember(svgs, key, from < 0 || to < 0 ? null : out.slice(from, to + 6));
  } catch {
    return remember(svgs, key, null);
  }
}
