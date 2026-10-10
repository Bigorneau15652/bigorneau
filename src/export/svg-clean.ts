// Cleaning of the SVG drawn by MathJax before it is shown in the formula editor.
// A formula received from a third party can make MathJax write an address in the drawing (image, style, link, external reference).
// Shown as is, such a drawing would make the browser contact a remote server. This module keeps only plain drawing elements,
// drops every attribute that can load or run something, and keeps internal references (#identifier) that the glyphs need.
// It works on the text of the drawing, without any DOM, so that it can be tested with node --test.

// Elements that a MathJax drawing really uses. Any other tag is removed (its content stays as plain text).
const ALLOWED_TAGS = new Set([
  `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `use`, `defs`, `text`, `tspan`, `title`, `desc`, `a`,
  `clippath`, `mask`, `symbol`, `lineargradient`, `radialgradient`, `stop`,
]);

const SVG_NAMESPACE = `http://www.w3.org/2000/svg`;
const XLINK_NAMESPACE = `http://www.w3.org/1999/xlink`;

// A tag with its attributes, quotes respected (a quoted value may contain the sign >).
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
const ATTR_RE = /\s+([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

// True when a style value can load something or hide a trick (url(), @import, escapes, entities, scripts).
function styleIsUnsafe(value: string): boolean {
  return /url\s*\(|@import|image-set|expression|javascript|[\\&]|\/\*/i.test(value);
}

// True when an attribute may stay in the drawing.
function attributeIsSafe(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith(`on`)) return false;
  if (lower === `href` || lower === `xlink:href`) return value.startsWith(`#`);
  if (lower === `src` || lower === `action` || lower === `formaction` || lower === `srcset` || lower === `data`) return false;
  if (lower === `style`) return !styleIsUnsafe(value);
  if (lower === `xmlns`) return value === SVG_NAMESPACE;
  if (lower.startsWith(`xmlns:`)) return value === XLINK_NAMESPACE;
  // Values of other attributes (sizes, paths, classes) never load anything, but a reference url(...) must not appear.
  return !/url\s*\(|javascript\s*:/i.test(value);
}

// Rewrites one tag found by TAG_RE: removed when its name is not allowed, otherwise rebuilt without its unsafe attributes.
function cleanTag(whole: string, closing: string, name: string, attrs: string, selfClosing: string): string {
  if (!ALLOWED_TAGS.has(name.toLowerCase())) return ``;
  if (closing) return whole;
  let kept = ``;
  let changed = false;
  for (const m of attrs.matchAll(ATTR_RE)) {
    const value = m[2] ?? m[3] ?? m[4] ?? ``;
    if (attributeIsSafe(m[1], value)) kept += m[0];
    else changed = true;
  }
  return changed ? `<${name}${kept}${selfClosing}>` : whole;
}

// Returns the drawing without address, external reference, script or foreign element. A drawing made only of plain elements and
// internal references is returned unchanged. A sign < that does not start a well-formed tag is written as text.
export function cleanMathSvg(svg: string): string {
  // Declarations and instructions (DOCTYPE, ENTITY, CDATA, comments) have no place in a drawing.
  const text = svg.replace(/<!--[\s\S]*?-->/g, ``).replace(/<[!?][^>]*>/g, ``);
  const tag = new RegExp(TAG_RE.source, `y`);
  let out = ``;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== `<`) {
      const next = text.indexOf(`<`, i);
      const end = next < 0 ? text.length : next;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    tag.lastIndex = i;
    const m = tag.exec(text);
    if (m) {
      out += cleanTag(m[0], m[1], m[2], m[3], m[4]);
      i += m[0].length;
    } else {
      out += `&lt;`;
      i += 1;
    }
  }
  return out;
}
