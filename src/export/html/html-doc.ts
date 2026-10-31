// HTML export: turns the document tree of a note into one self-contained HTML page that works as a reader (menus of the headings and
// of the thumbnails on the left, light and dark themes, full screen and wide mode on the right, images, 360 degree panoramas and
// embedded videos). No access to Obsidian: the module is tested with node --test.
import { defaultParagraphSettings, ParagraphSettings } from "../../paragraph-format";
import { BASE_POINTS, defaultTypography, HeadingSpec, TextSpec, TypographyStyle } from "../../text-style";
import { DocBlock, DocListItem, DocSection, ExportDoc, FOOTNOTE_CALL_RE } from "../doc-tree";
import { isImageTarget, isWebTarget } from "../image";
import { BOLD_OFF, BOLD_ON, InlineContext, ITALIC_OFF, ITALIC_ON, LINK_NUM_END, LINK_OFF, LINK_ON, MATH_END, MATH_ON, normalizeHeading, parseInline, plainOf, STRIKE_OFF, STRIKE_ON } from "../inline";
import type { MathAsset } from "../math";
import { mathKey } from "../math";
import { Anchors, collectAnchors, languageOf, namesList, numberSections, topLevel } from "../typeset";
import { READER_CSS, READER_JS } from "./reader-assets";

// A picture ready to be written into the page.
export interface HtmlImage {
  // Address of the picture: a data: address (one self-contained file), or the address of a file of the media folder.
  src: string;
  width: number;
  height: number;
  // True for a picture twice as wide as high: it is read as a 360 degree panorama.
  panorama: boolean;
}

export interface HtmlOptions {
  images: Map<string, HtmlImage>;
  formulas: Map<string, MathAsset>;
  typography?: TypographyStyle;
  paragraphs?: ParagraphSettings;
  // @font-face rules of the fonts that the page uses, already written.
  fontCss?: string;
  // Panorama viewer (script and style sheet), written into the page only when the note holds a panorama. With `jsUrl` and `cssUrl` the
  // page links to the files of the folder instead of holding the texts.
  panorama?: { js: string; css: string; jsUrl?: string; cssUrl?: string };
  // Mode with separate folders: the page links to its files, so its content policy allows its own address.
  separate?: boolean;
}

export interface HtmlResult {
  html: string;
  // Problems to show in the export report (same codes as the PDF report).
  warnings: string[];
  // Number of panoramas, of embedded videos and of pictures, for the report.
  panoramas: number;
}

const NOTE_ON = ``;
const NOTE_OFF = ``;

// Texts of the reader, by language.
const TEXTS = {
  fr: {
    plan: `Plan du document`, thumbs: `Miniatures`, dark: `Mode sombre`, light: `Mode clair`, full: `Plein écran`, wide: `Mode large`, escape: `Échap pour revenir`,
    fold: `Plier ou déplier`, noThumbs: `Aucune image dans ce document.`, flatPano: `Panorama à 360 degrés : ouvrez cette page depuis un site web pour pouvoir le faire tourner.`, notes: `Notes`, back: `Retour au texte`, listFigures: `Liste des figures`, listTables: `Liste des tableaux`,
    video: `Vidéo`, watch: `Regarder la vidéo sur le site d'origine`, audio: `Audio`, document: `Document PDF`, embed: `Contenu intégré`, missing: `Image introuvable`, web: `Image du web`, image: `Image`, untitled: `(sans titre)`, colon: ` : `,
  },
  en: {
    plan: `Document outline`, thumbs: `Thumbnails`, dark: `Dark mode`, light: `Light mode`, full: `Full screen`, wide: `Wide mode`, escape: `Press Esc to go back`,
    fold: `Fold or unfold`, noThumbs: `No picture in this document.`, flatPano: `360 degree panorama: open this page from a website to turn it.`, notes: `Notes`, back: `Back to the text`, listFigures: `List of figures`, listTables: `List of tables`,
    video: `Video`, watch: `Watch the video on the original site`, audio: `Audio`, document: `PDF document`, embed: `Embedded content`, missing: `Image not found`, web: `Web image`, image: `Image`, untitled: `(untitled)`, colon: `: `,
  },
};

// Escapes the five characters that matter in HTML text and attributes.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/"/g, `&quot;`).replace(/'/g, `&#39;`);
}

// Address that a link may carry: web, mail and places of the page. Anything else is shown as text.
function safeUrl(url: string): string | null {
  return /^(?:https?:\/\/|mailto:|#)/i.test(url.trim()) ? url.trim() : null;
}

// Player address of a video page (YouTube, Vimeo), or null when the page cannot be embedded.
export function embedUrl(target: string): string | null {
  const t = target.trim();
  const yt = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{6,20})([^#]*)/i.exec(t);
  if (yt) {
    const start = /[?&](?:t|start)=(\d{1,6})/.exec(yt[2]);
    return `https://www.youtube-nocookie.com/embed/${yt[1]}${start ? `?start=${start[1]}` : ``}`;
  }
  const vimeo = /^https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{5,12})(?:[/?#]|$)/i.exec(t);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

// Address of the video page that matches a player address, so that a link can open it in the browser.
export function watchUrl(player: string): string {
  const yt = /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]+)(?:\?start=(\d+))?$/.exec(player);
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}${yt[2] ? `&t=${yt[2]}` : ``}`;
  const vimeo = /^https:\/\/player\.vimeo\.com\/video\/(\d+)$/.exec(player);
  return vimeo ? `https://vimeo.com/${vimeo[1]}` : player;
}

// Black or white, whichever reads better on a background colour given as #rrggbb.
export function readableOn(background: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!m) return `#111111`;
  const luminance = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
  return luminance > 0.55 ? `#111111` : `#ffffff`;
}

// CSS size of a font height given in points: one tenth of a rem per point (11 points, the body of the PDF, is 1.1 rem).
const rem = (points: number): string => `${Math.round(points * 10) / 100}rem`;

// CSS family stack of a text element: the font added to the vault when there is one, then the font of the export.
function familyCss(spec: TextSpec): string {
  return spec.family === `` ? `` : `font-family:"mmwu-${spec.family}","MMW Libertinus Serif",Georgia,serif;`;
}

// CSS declarations of a text element: font, size, weight, style and colour.
function textCss(spec: TextSpec, base: number): string {
  let css = familyCss(spec);
  if (spec.points > 0) css += `font-size:${rem(spec.points)};`;
  else if (base !== BASE_POINTS.body) css += `font-size:${rem(base)};`;
  css += `font-weight:${spec.bold ? 700 : 400};font-style:${spec.italic ? `italic` : `normal`};`;
  if (spec.color !== ``) css += `color:${spec.color};`;
  return css;
}

// CSS rules of the typography of the note: body, title, headings, captions and notes.
export function typographyCss(ty: TypographyStyle): string {
  let css = `.feuille{${textCss(ty.body, BASE_POINTS.body)}font-size:${rem(ty.body.points > 0 ? ty.body.points : BASE_POINTS.body)};}`;
  const heading = (selector: string, spec: HeadingSpec, base: number): void => {
    let rule = textCss(spec, base);
    if (spec.points === 0) rule += `font-size:${rem(base)};`;
    if (spec.case !== `none`) rule += `text-transform:${spec.case === `upper` ? `uppercase` : spec.case === `lower` ? `lowercase` : `capitalize`};`;
    if (spec.underline) rule += `text-decoration:underline;`;
    if (spec.frame !== `none`) {
      rule += `border:${spec.frameWidth}pt solid ${spec.frameColor};padding:.2em .5em;max-width:100%;display:${spec.frame === `full` ? `block` : `table`};`;
      if (spec.frameFill !== ``) rule += `background:${spec.frameFill};${spec.color === `` ? `color:${readableOn(spec.frameFill)};` : ``}`;
    }
    css += `${selector}{${rule}}`;
  };
  heading(`.titre-doc`, ty.title, BASE_POINTS.title);
  ty.headings.forEach((h, i) => heading(`.feuille h2.t${i + 1},.feuille h3.t${i + 1},.feuille h4.t${i + 1},.feuille h5.t${i + 1},.feuille h6.t${i + 1}`, h, BASE_POINTS[`h${i + 1}`]));
  css += `.feuille figcaption,.feuille caption{${textCss(ty.caption, BASE_POINTS.caption)}${ty.caption.points === 0 ? `font-size:.9em;` : ``}}`;
  css += `.notes-fin{${textCss(ty.footnote, BASE_POINTS.footnote)}${ty.footnote.points === 0 ? `font-size:.92em;` : ``}}`;
  const highlight = (name: string, spec: TextSpec): void => {
    if (spec.highlight !== ``) css += `.sur-${name}{background:${spec.highlight};${spec.color === `` ? `color:${readableOn(spec.highlight)};` : ``}}`;
  };
  highlight(`corps`, ty.body);
  highlight(`legende`, ty.caption);
  highlight(`notes`, ty.footnote);
  highlight(`titre`, ty.title);
  ty.headings.forEach((h, i) => highlight(`t${i + 1}`, h));
  return css;
}

// Renders one note. All state of a rendering lives in this class, so that two renderings never share anything.
class Renderer {
  private warnings: string[] = [];
  private anchors: Anchors;
  private numbers: Map<DocSection, string>;
  private noteIds = new Map<string, number>();
  private notes: { n: number; text: string }[] = [];
  private figureIds = new Map<DocBlock, string>();
  private panoramas = 0;
  private ty: TypographyStyle;
  private para: ParagraphSettings;
  private texts: (typeof TEXTS)[`fr`];

  constructor(private doc: ExportDoc, private opts: HtmlOptions) {
    const language = languageOf(doc.language);
    this.texts = TEXTS[language];
    this.anchors = collectAnchors(doc, language);
    this.ty = opts.typography ?? defaultTypography();
    this.para = opts.paragraphs ?? defaultParagraphSettings();
    this.numbers = numberSections(doc.sections, this.ty, topLevel(doc.sections));
    // Figure and table numbers, in the order of the document, become the identifiers of their places in the page.
    let figures = 0;
    let tables = 0;
    for (const block of this.anchors.labels.keys()) this.figureIds.set(block, block.type === `figure` ? `fig-${++figures}` : `tab-${++tables}`);
  }

  // Identifier of a place of the page from an anchor of the typesetter (hid:3 becomes hid-3).
  private idOf(anchor: string): string {
    return anchor.replace(`:`, `-`);
  }

  private inlineContext(): InlineContext {
    return {
      noteName: this.doc.title,
      headingAnchor: (title) => this.anchors.headings.get(normalizeHeading(title)),
      block: (id) => this.anchors.blocks.get(id),
      pageRefs: false,
      warn: (m) => this.warnings.push(m),
      math: (tex) => this.opts.formulas.get(mathKey(tex, false)) ?? this.opts.formulas.get(mathKey(tex, true)),
    };
  }

  // Replaces the calls of footnotes by markers that carry the number of the note; the text of each note is kept for the end of the page.
  private withNotes(text: string): string {
    return text.replace(FOOTNOTE_CALL_RE, (whole: string, id: string | undefined, inline: string | undefined) => {
      if (id !== undefined) {
        const known = this.noteIds.get(id);
        if (known !== undefined) return `${NOTE_ON}${known}${NOTE_OFF}`;
        const def = this.doc.footnotes[id];
        if (def === undefined) {
          this.warnings.push(`note:${id}`);
          return whole;
        }
        const n = this.notes.length + 1;
        this.noteIds.set(id, n);
        this.notes.push({ n, text: def });
        return `${NOTE_ON}${n}${NOTE_OFF}`;
      }
      const n = this.notes.length + 1;
      this.notes.push({ n, text: inline ?? `` });
      return `${NOTE_ON}${n}${NOTE_OFF}`;
    });
  }

  // HTML of a text with its inline formatting: bold, italic, strike, links, formulas and calls of notes.
  inline(source: string, withNotes = true): string {
    const parsed = parseInline(withNotes ? this.withNotes(source) : source, this.inlineContext());
    const text = parsed.text;
    const open: { name: string; start: string }[] = [];
    let html = ``;
    let run = ``;
    const flush = (): void => {
      html += escapeHtml(run);
      run = ``;
    };
    const push = (name: string, start: string): void => {
      flush();
      open.push({ name, start });
      html += start;
    };
    // Closes the last open tag called `name`; the tags opened after it are closed and opened again around the gap.
    const pop = (name: string): void => {
      flush();
      let at = -1;
      for (let k = open.length - 1; k >= 0; k--) {
        if (open[k].name === name) {
          at = k;
          break;
        }
      }
      if (at < 0) return;
      const above = open.splice(at);
      for (let k = above.length - 1; k >= 0; k--) html += `</${above[k].name}>`;
      for (let k = 1; k < above.length; k++) {
        open.push(above[k]);
        html += above[k].start;
      }
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === BOLD_ON) push(`strong`, `<strong>`);
      else if (ch === BOLD_OFF) pop(`strong`);
      else if (ch === ITALIC_ON) push(`em`, `<em>`);
      else if (ch === ITALIC_OFF) pop(`em`);
      else if (ch === STRIKE_ON) push(`s`, `<s>`);
      else if (ch === STRIKE_OFF) pop(`s`);
      else if (ch === LINK_ON) {
        const end = text.indexOf(LINK_NUM_END, i);
        const url = parsed.links[Number(text.slice(i + 1, end))] ?? ``;
        i = end;
        const safe = safeUrl(url);
        if (safe === null) continue;
        push(`a`, safe.startsWith(`#`) ? `<a href="${escapeHtml(this.idOf(`#${safe.slice(1)}`))}">` : `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">`);
      } else if (ch === LINK_OFF) pop(`a`);
      else if (ch === MATH_ON) {
        flush();
        const end = text.indexOf(MATH_END, i);
        const asset = parsed.maths?.[Number(text.slice(i + 1, end))];
        i = end;
        if (asset) html += this.formula(asset, false);
      } else if (ch === NOTE_ON) {
        flush();
        const end = text.indexOf(NOTE_OFF, i);
        const n = Number(text.slice(i + 1, end));
        i = end;
        html += `<sup class="renvoi"><a id="renvoi-${n}" href="#note-${n}">${n}</a></sup>`;
      } else run += ch;
    }
    flush();
    for (let k = open.length - 1; k >= 0; k--) html += `</${open[k].name}>`;
    return html;
  }

  // Inline SVG drawing of a formula; its size follows the text (a thousandth of an em per unit).
  private formula(asset: MathAsset, display: boolean): string {
    const height = asset.ascent + asset.descent;
    const label = escapeHtml(asset.tex);
    const svg = `<svg class="${display ? `` : `fx`}" role="img" aria-label="${label}" viewBox="0 ${-asset.ascent} ${asset.width} ${height}" width="${(asset.width / 1000).toFixed(3)}em" height="${(height / 1000).toFixed(3)}em"${display ? `` : ` style="vertical-align:${(-asset.descent / 1000).toFixed(3)}em"`}><path d="${escapeHtml(asset.d)}"/></svg>`;
    return svg;
  }

  // Wraps a text in the highlight of its element when the typography asks for one.
  private highlighted(html: string, spec: TextSpec, name: string): string {
    return spec.highlight === `` ? html : `<span class="sur-${name}">${html}</span>`;
  }

  // Classes of a paragraph: alignment and the exceptions written in front of it.
  private paragraphClasses(b: Extract<DocBlock, { type: `paragraph` }>): string {
    const align = b.format?.align ?? this.para.align;
    const cls = [`al-${align === `justify` ? `j` : align === `left` ? `l` : align === `right` ? `r` : `c`}`];
    return cls.join(` `);
  }

  private block(b: DocBlock, afterHeading: string | undefined): string {
    switch (b.type) {
      case `paragraph`: {
        const id = b.id ? ` id="b-${escapeHtml(b.id)}"` : ``;
        return `<p${id} class="${this.paragraphClasses(b)}">${this.highlighted(this.inline(b.text), this.ty.body, `corps`)}</p>`;
      }
      case `list`:
        return this.list(b.ordered, b.items);
      case `quote`: {
        const id = b.id ? ` id="b-${escapeHtml(b.id)}"` : ``;
        return `<blockquote${id}>${b.text.split(/\n{2,}/).map((p) => `<p>${this.inline(p)}</p>`).join(``)}</blockquote>`;
      }
      case `code`:
        return `<pre class="code"><code${b.lang ? ` class="langue-${escapeHtml(b.lang.replace(/[^\w+-]/g, ``))}"` : ``}>${escapeHtml(b.text)}</code></pre>`;
      case `table`:
        return this.table(b);
      case `figure`:
        return this.figure(b);
      case `math`: {
        const asset = this.opts.formulas.get(mathKey(b.tex, true));
        const id = b.id ? ` id="b-${escapeHtml(b.id)}"` : ``;
        if (!asset) {
          this.warnings.push(`formule:${b.tex}`);
          return `<pre class="code"${id}>$$ ${escapeHtml(b.tex.replace(/\s+/g, ` `))} $$</pre>`;
        }
        return `<div class="fx-bloc"${id}>${this.formula(asset, true)}</div>`;
      }
      case `media`:
        return this.media(b);
      case `illustrations`:
        return this.illustrations(b.kind, afterHeading !== undefined && namesList(afterHeading, b.kind));
      case `zone`:
        return ``;
    }
  }

  // Lists with their levels: the flat items of the tree become nested lists.
  private list(ordered: boolean, items: DocListItem[]): string {
    let html = ``;
    const stack: string[] = [];
    for (const item of items) {
      const tag = (item.kind ?? (ordered ? `ordered` : `bullet`)) === `ordered` ? `ol` : `ul`;
      while (stack.length > item.depth + 1) html += `</li></${stack.pop()}>`;
      if (stack.length === item.depth + 1) {
        html += `</li>`;
        if (stack[stack.length - 1] !== tag) {
          html += `</${stack.pop()}>`;
        }
      }
      while (stack.length < item.depth + 1) {
        html += tag === `ol` && item.start !== undefined && item.start !== 1 ? `<ol start="${item.start}">` : `<${tag}>`;
        stack.push(tag);
        if (stack.length < item.depth + 1) html += `<li>`;
      }
      html += `<li>${this.inline(item.text)}`;
    }
    while (stack.length > 0) html += `</li></${stack.pop()}>`;
    return html;
  }

  private table(b: Extract<DocBlock, { type: `table` }>): string {
    const label = this.anchors.labels.get(b);
    const id = this.figureIds.get(b);
    const classes = [`tableau`, ...(b.style?.header ? [`entete`] : []), ...(b.style?.stripes ? [`zebre`] : []), ...(b.style?.equal ? [`egal`] : [])];
    const alias = b.id ? `<a id="b-${escapeHtml(b.id)}"></a>` : ``;
    let html = `${alias}<div class="tableau-defil"><table${id ? ` id="${id}"` : ``} class="${classes.join(` `)}">`;
    if (label) html += `<caption><strong>${escapeHtml(label)}</strong>${this.texts.colon}${this.highlighted(this.inline(b.caption ?? ``), this.ty.caption, `legende`)}</caption>`;
    html += `<tbody>`;
    for (const row of b.rows) {
      html += `<tr>`;
      row.forEach((cell, c) => {
        const align = b.align[c];
        html += `<td${align && align !== `left` ? ` class="al-${align === `right` ? `r` : `c`}"` : ``}>${this.inline(cell)}</td>`;
      });
      html += `</tr>`;
    }
    return `${html}</tbody></table></div>`;
  }

  private figure(b: Extract<DocBlock, { type: `figure` }>): string {
    const label = this.anchors.labels.get(b);
    const id = this.figureIds.get(b);
    const asset = this.opts.images.get(b.target);
    const alt = escapeHtml(plainOf(parseInline(b.caption).text));
    const alias = b.id ? `<a id="b-${escapeHtml(b.id)}"></a>` : ``;
    let inner: string;
    if (asset && asset.panorama) {
      this.panoramas++;
      inner = `<div class="panorama"><img class="source" src="${asset.src}" alt="${alt}"></div>`;
    } else if (asset) {
      const max = b.width ? ` style="max-width:${Math.round(b.width)}px"` : ``;
      inner = `<img src="${asset.src}" alt="${alt}" width="${Math.round(asset.width)}" height="${Math.round(asset.height)}"${max} loading="lazy" decoding="async">`;
    } else if (isWebTarget(b.target)) {
      this.warnings.push(`webimage:${b.target}`);
      const url = safeUrl(b.target);
      inner = `<p class="absente">[${this.texts.web}${this.texts.colon}${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.target)}</a>` : escapeHtml(b.target)}]</p>`;
    } else {
      if (isImageTarget(b.target)) this.warnings.push(`image:${b.target}`);
      inner = `<p class="absente">[${this.texts.missing}${this.texts.colon}${escapeHtml(b.target)}]</p>`;
    }
    const mini = asset ? ` data-mini="${escapeHtml(label ?? this.texts.image)}"` : ``;
    const figId = id ?? (asset ? `img-${this.thumbnails++}` : undefined);
    const caption = label ? `<figcaption><strong>${escapeHtml(label)}</strong>${this.texts.colon}${this.highlighted(this.inline(b.caption), this.ty.caption, `legende`)}</figcaption>` : ``;
    return `${alias}<figure${figId ? ` id="${figId}"` : ``}${mini}>${inner}${caption}</figure>`;
  }

  // Counter of the identifiers of pictures that have no number.
  private thumbnails = 1;

  private media(b: Extract<DocBlock, { type: `media` }>): string {
    const id = b.id ? ` id="b-${escapeHtml(b.id)}"` : ``;
    const caption = b.caption.trim() === `` ? `` : `<figcaption>${this.inline(b.caption)}</figcaption>`;
    const web = /^https?:\/\//i.test(b.target);
    const player = b.kind === `video` ? embedUrl(b.target) : null;
    if (player) {
      return `<figure class="media"${id}><div class="video"><iframe src="${escapeHtml(player)}" title="${escapeHtml(plainOf(parseInline(b.caption).text) || this.texts.video)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen"></iframe></div><p class="video-lien"><a href="${escapeHtml(watchUrl(player))}" target="_blank" rel="noopener noreferrer">${this.texts.watch}</a></p>${caption}</figure>`;
    }
    if (web && b.kind === `video` && /\.(mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i.test(b.target)) {
      return `<figure class="media"${id}><video controls preload="none" src="${escapeHtml(b.target)}"></video>${caption}</figure>`;
    }
    if (web && b.kind === `audio`) return `<figure class="media"${id}><audio controls preload="none" src="${escapeHtml(b.target)}"></audio>${caption}</figure>`;
    // A file of the vault or a page that cannot be embedded: a card with its name or its address.
    const kinds = { video: this.texts.video, audio: this.texts.audio, document: this.texts.document, embed: this.texts.embed };
    const icons = { video: `▶`, audio: `♫`, document: `\u{1F4C4}`, embed: `\u{1F517}` };
    const name = web ? `<a href="${escapeHtml(b.target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.target)}</a>` : escapeHtml(b.target.split(/[\\/]/).pop() ?? b.target);
    if (!web) this.warnings.push(`media:${b.target}`);
    return `<figure class="media"${id}><div class="carte-media"><span class="icone" aria-hidden="true">${icons[b.kind]}</span><span><strong>${kinds[b.kind]}</strong>${b.caption.trim() === `` ? `` : `${this.texts.colon}${this.inline(b.caption)}`}<br>${name}</span></div></figure>`;
  }

  // List of the figures or of the tables of the document, with links to their places.
  private illustrations(kind: `figures` | `tables`, underHeading: boolean): string {
    const sep = this.texts.colon;
    let items = ``;
    for (const [block, label] of this.anchors.labels) {
      if ((kind === `figures`) !== (block.type === `figure`)) continue;
      const caption = block.type === `figure` ? block.caption : block.type === `table` ? (block.caption ?? ``) : ``;
      items += `<li><a href="#${this.figureIds.get(block)}">${escapeHtml(label)}${sep}${this.inline(caption, false)}</a></li>`;
    }
    if (items === ``) return ``;
    const title = kind === `figures` ? this.texts.listFigures : this.texts.listTables;
    return `<nav class="liste-illustrations">${underHeading ? `` : `<h2 class="t1">${title}</h2>`}<ol>${items}</ol></nav>`;
  }

  // One section: its heading, its blocks and its sub-sections.
  private section(s: DocSection): string {
    const id = this.idOf(this.anchors.sections.get(s) ?? ``);
    const level = Math.min(Math.max(s.level, 1), 6);
    const tag = `h${Math.min(level + 1, 6)}`;
    const number = this.numbers.get(s);
    const title = s.title || this.texts.untitled;
    const spec = this.ty.headings[level - 1];
    let html = `<section class="chapitre"><${tag} id="${id}" class="t${level}" data-plan>${number ? `<span class="num">${escapeHtml(number)}</span> ` : ``}${this.highlighted(this.inline(title, false), spec, `t${level}`)}</${tag}>`;
    let previous: string | undefined = s.title;
    for (const b of s.blocks) {
      html += this.block(b, previous);
      previous = undefined;
    }
    for (const child of s.sections) html += this.section(child);
    return `${html}</section>`;
  }

  // Tree of the headings for the left menu.
  private tree(sections: DocSection[]): string {
    if (sections.length === 0) return ``;
    let html = `<ul>`;
    for (const s of sections) {
      const number = this.numbers.get(s);
      const text = `${number ? `${number} ` : ``}${plainOf(parseInline(s.title || this.texts.untitled).text)}`;
      html += `<li><div class="ligne"><a href="#${this.idOf(this.anchors.sections.get(s) ?? ``)}">${escapeHtml(text)}</a></div>${this.tree(s.sections)}</li>`;
    }
    return `${html}</ul>`;
  }

  // Notes of the document, at the end of the page, with a link back to each call.
  private endnotes(): string {
    if (this.notes.length === 0) return ``;
    const items = this.notes.map((note) => `<li id="note-${note.n}">${this.highlighted(this.inline(note.text, false), this.ty.footnote, `notes`)} <a class="retour" href="#renvoi-${note.n}" aria-label="${this.texts.back}">↩</a></li>`).join(``);
    return `<section class="notes-fin" aria-label="${this.texts.notes}"><h2 class="t1">${this.texts.notes}</h2><ol>${items}</ol></section>`;
  }

  render(): HtmlResult {
    const language = languageOf(this.doc.language);
    const titleHtml = this.highlighted(this.inline(this.doc.title, false), this.ty.title, `titre`);
    let content = `<header><h1 class="titre-doc">${titleHtml}</h1>${this.doc.author ? `<p class="auteur">${escapeHtml(this.doc.author)}</p>` : ``}</header>`;
    for (const b of this.doc.blocks) content += this.block(b, undefined);
    for (const s of this.doc.sections) content += this.section(s);
    content += this.endnotes();
    const ids = `${this.para.mode === `space` ? `mode-space` : `mode-indent`}`;
    const gap = { s: `.4em`, m: `.8em`, l: `1.4em` }[this.para.size] ?? `.8em`;
    const needsPanorama = this.panoramas > 0 && this.opts.panorama !== undefined;
    const labels = JSON.stringify({ light: this.texts.light, dark: this.texts.dark, escape: this.texts.escape, fold: this.texts.fold, noThumbs: this.texts.noThumbs, flatPano: this.texts.flatPano }).replace(/</g, `\\u003c`);
    const icon = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
    const plain = escapeHtml(plainOf(parseInline(this.doc.title).text));
    const own = this.opts.separate ? ` 'self'` : ``;
    const csp = `default-src 'none'; img-src${own} data: blob: https:; media-src https: data: blob:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; style-src 'unsafe-inline'${own}; script-src 'unsafe-inline'${own}; font-src${own} data:; connect-src${own} blob: data:`;
    const html = `<!doctype html>
<html lang="${language}" data-theme="clair">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="generator" content="Bigorneau">
${this.doc.author ? `<meta name="author" content="${escapeHtml(this.doc.author)}">\n` : ``}<title>${plain}</title>
<style>${this.opts.fontCss ?? ``}${READER_CSS}${typographyCss(this.ty)}.feuille{--ecart:${gap}}</style>
${needsPanorama ? (this.opts.panorama?.cssUrl ? `<link rel="stylesheet" href="${escapeHtml(this.opts.panorama.cssUrl)}">\n` : `<style>${this.opts.panorama?.css ?? ``}</style>\n`) : ``}</head>
<body>
<div class="boutons boutons-gauche">
<button type="button" class="bouton" id="b-plan" aria-expanded="false" title="${this.texts.plan}" aria-label="${this.texts.plan}">${icon(`<path d="M4 6h16M4 12h10M4 18h16M8 9l-3 3 3 3"/>`)}</button>
<button type="button" class="bouton" id="b-mini" aria-expanded="false" title="${this.texts.thumbs}" aria-label="${this.texts.thumbs}">${icon(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`)}</button>
</div>
<div class="panneaux">
<nav class="panneau panneau-plan" aria-label="${this.texts.plan}"><h2>${this.texts.plan}</h2><div class="arbre">${this.tree(this.doc.sections)}</div></nav>
<nav class="panneau panneau-mini" aria-label="${this.texts.thumbs}"><h2>${this.texts.thumbs}</h2><div class="vignettes" id="vignettes"></div></nav>
</div>
<div class="boutons boutons-droite">
<button type="button" class="bouton" id="b-theme" title="${this.texts.dark}" aria-label="${this.texts.dark}"><span class="icone-lune">${icon(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`)}</span><span class="icone-soleil" style="display:none">${icon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`)}</span></button>
<button type="button" class="bouton" id="b-plein" title="${this.texts.full}" aria-label="${this.texts.full}">${icon(`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`)}</button>
<button type="button" class="bouton" id="b-large" aria-pressed="false" title="${this.texts.wide}" aria-label="${this.texts.wide}">${icon(`<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>`)}</button>
</div>
<main><article class="feuille ${ids} al-${this.para.align === `justify` ? `j` : this.para.align === `left` ? `l` : this.para.align === `right` ? `r` : `c`}">
${content}
</article></main>
<script type="application/json" id="textes">${labels}</script>
${needsPanorama ? (this.opts.panorama?.jsUrl ? `<script src="${escapeHtml(this.opts.panorama.jsUrl)}"></script>\n` : `<script>${(this.opts.panorama?.js ?? ``).replace(/<\/script/gi, `<\\/script`)}</script>\n`) : ``}<script>${READER_JS}</script>
</body>
</html>
`;
    return { html, warnings: [...new Set(this.warnings)], panoramas: this.panoramas };
  }
}

// Renders the document tree of a note as one self-contained HTML page.
export function renderHtml(doc: ExportDoc, opts: HtmlOptions): HtmlResult {
  return new Renderer(doc, opts).render();
}
