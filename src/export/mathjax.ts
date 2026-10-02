// Export de haute qualite : dessin des formules par MathJax (bibliotheque mathjax-full, licence Apache 2.0, integree au plugin).
// MathJax lit la formule en TeX et produit un dessin SVG, que math.ts ramene a un contour. Aucun navigateur n'est necessaire :
// l'adaptateur « lite » de MathJax travaille sur un arbre en memoire, ce qui permet de tester ce module avec node --test.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
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
  engine = { convert: (tex, display) => adaptor.serializeXML(doc.convert(tex, { display })) };
  return engine;
}

// Dessin d'une formule TeX, ou null si MathJax la refuse (syntaxe incorrecte) ou si le dessin est illisible.
export function renderTex(tex: string, display: boolean): MathAsset | null {
  try {
    return parseMathSvg(getEngine().convert(tex, display), tex, display);
  } catch {
    return null;
  }
}
