import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc } from "../src/export/doc-tree";
import { builtinFontCss, builtinFontFiles, dataUri, exportFileName, fromBase64, isPanorama, toBase64, userFontCss } from "../src/export/html/html-assets";
import { embedUrl, escapeHtml, HtmlImage, readableOn, renderHtml, typographyCss } from "../src/export/html/html-doc";
import { READER_JS } from "../src/export/html/reader-assets";
import { defaultTypography, setPath } from "../src/text-style";

const png = `data:image/png;base64,iVBORw0KGgo=`;
const image = (panorama = false): HtmlImage => ({ src: png, width: 400, height: panorama ? 200 : 300, panorama });
const render = (text: string, images: [string, HtmlImage][] = [], extra = {}) => renderHtml(buildExportDoc(text, `Note.md`), { images: new Map(images), formulas: new Map(), ...extra });

test(`the page is one file with the reader buttons and a strict content policy`, () => {
  const { html } = render(`# Chapter\nSome text.`);
  assert.match(html, /^<!doctype html>/);
  for (const id of [`b-plan`, `b-mini`, `b-theme`, `b-plein`, `b-large`]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /Content-Security-Policy/);
  assert.ok(!/<link\b|@import|<script[^>]+src=/.test(html), `no outside file`);
  assert.ok(!/(?:src|href)="https?:\/\/[^"]*\.(?:js|css)"/.test(html));
});

test(`the script of the reader is valid JavaScript`, () => {
  assert.doesNotThrow(() => new Function(READER_JS));
  assert.ok(!READER_JS.includes(`innerHTML`) && !READER_JS.includes(`eval(`));
});

test(`text is escaped and unsafe links stay plain text`, () => {
  const { html } = render(`# T\nA <script>alert(1)</script> and [bad](javascript:alert(1)) and [good](https://example.org/a?b=1&c=2).`);
  assert.ok(!html.includes(`<script>alert(1)`));
  assert.ok(!html.includes(`href="javascript:`));
  assert.match(html, /href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"/);
  assert.equal(escapeHtml(`<a href="x">'&</a>`), `&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;`);
});

test(`headings give the tree of the left menu, with their numbers`, () => {
  const text = `# One\n## One A\n# Two\nText.`;
  const plain = render(text).html;
  assert.match(plain, /<h2 id="hid-1" class="t1" data-plan>/);
  assert.match(plain, /<a href="#hid-2">One A<\/a>/);
  const numbered = render(text, [], { typography: setPath(defaultTypography(), `numbering`, `decimal`) }).html;
  assert.match(numbered, /<span class="num">1\.1<\/span>/);
  assert.match(numbered, /<a href="#hid-3">2 Two<\/a>/);
});

test(`inline formatting nests correctly even when styles cross`, () => {
  const { html } = render(`# T\nPlain **bold *both* bold** and *it ~~strike~~*.`);
  assert.match(html, /<strong>bold <em>both<\/em> bold<\/strong>/);
  assert.match(html, /<em>it <s>strike<\/s><\/em>/);
});

test(`footnotes become numbered calls and a list at the end`, () => {
  const { html, warnings } = render(`# T\nSentence[^a] and another^[inline note] and a missing[^zz].\n\n[^a]: The first note.`);
  assert.match(html, /<sup class="renvoi"><a id="renvoi-1" href="#note-1">1<\/a><\/sup>/);
  assert.match(html, /<li id="note-2">inline note/);
  assert.match(html, /<li id="note-1">The first note\./);
  assert.deepEqual(warnings, [`note:zz`]);
});

test(`lists keep their levels and their kinds`, () => {
  const { html } = render(`# T\n- one\n  - nested\n- two\n\n1. first\n2. second`);
  assert.match(html, /<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test(`named tables and figures are numbered and the lists of illustrations link to them`, () => {
  const text = `# T\n%% liste: figures %%\n\nTableau : Results\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![[photo.png|A photo]]\n`;
  const { html } = render(text, [[`photo.png`, image()]]);
  assert.match(html, /<caption><strong>Tableau 1<\/strong>[^<]*Results<\/caption>/);
  assert.match(html, /<figure id="fig-1" data-mini="Figure 1"><img src="data:image\/png/);
  assert.match(html, /<figcaption><strong>Figure 1<\/strong>[^<]*A photo<\/figcaption>/);
  assert.match(html, /<nav class="liste-illustrations">.*<a href="#fig-1">Figure 1/s);
});

test(`a missing picture is reported and replaced by a note`, () => {
  const { html, warnings } = render(`# T\n![[nowhere.png|Lost]]`);
  assert.match(html, /\[Image introuvable/);
  assert.deepEqual(warnings, [`image:nowhere.png`]);
});

test(`a picture twice as wide as high is a panorama and brings the viewer`, () => {
  const none = render(`# T\n![[pano.jpg|View]]`, [[`pano.jpg`, image(true)]]);
  assert.match(none.html, /<div class="panorama"><img class="source"/);
  assert.equal(none.panoramas, 1);
  assert.ok(!none.html.includes(`window.pannellum=`));
  const withViewer = render(`# T\n![[pano.jpg|View]]`, [[`pano.jpg`, image(true)]], { panorama: { js: `window.pannellum={viewer:function(){}};`, css: `.pnlm{}` } });
  assert.ok(withViewer.html.includes(`window.pannellum={viewer`));
  assert.ok(withViewer.html.includes(`.pnlm{}`));
  const flat = render(`# T\n![[a.png|View]]`, [[`a.png`, image(false)]], { panorama: { js: `window.pannellum=1;`, css: `` } });
  assert.ok(!flat.html.includes(`window.pannellum=1`));
});

test(`videos: online links become players, files of the vault become cards`, () => {
  assert.equal(embedUrl(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s`), `https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42`);
  assert.equal(embedUrl(`https://youtu.be/dQw4w9WgXcQ`), `https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ`);
  assert.equal(embedUrl(`https://vimeo.com/123456789`), `https://player.vimeo.com/video/123456789`);
  assert.equal(embedUrl(`https://example.org/page`), null);
  const { html, warnings } = render(`# T\n![[https://youtu.be/dQw4w9WgXcQ|The talk]]\n\n![[clip.mp4|Local clip]]`);
  assert.match(html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /<div class="carte-media">.*clip\.mp4/s);
  assert.deepEqual(warnings, [`media:clip.mp4`]);
});

test(`the typography of the note reaches the style sheet`, () => {
  let ty = setPath(defaultTypography(), `h1.case`, `upper`);
  ty = setPath(ty, `h1.frame`, `full`);
  ty = setPath(ty, `h1.frameFill`, `#ffee00`);
  ty = setPath(ty, `body.points`, 12);
  ty = setPath(ty, `body.color`, `#112233`);
  const css = typographyCss(ty);
  assert.match(css, /text-transform:uppercase/);
  assert.match(css, /background:#ffee00/);
  assert.match(css, /\.feuille\{[^}]*font-size:1\.2rem/);
  assert.match(css, /color:#112233/);
});

test(`the English page uses English labels and an English colon`, () => {
  const { html } = render(`---\nlang: en\n---\n# T\n![[a.png|A view]]`, [[`a.png`, image()]]);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<strong>Figure 1<\/strong>: A view/);
  assert.match(html, /Document outline/);
});

test(`text stays readable on a coloured frame or highlight`, () => {
  assert.equal(readableOn(`#fff3bf`), `#111111`);
  assert.equal(readableOn(`#1b1b2f`), `#ffffff`);
  let ty = setPath(defaultTypography(), `h1.frame`, `full`);
  ty = setPath(ty, `h1.frameFill`, `#fff3bf`);
  ty = setPath(ty, `body.highlight`, `#202040`);
  const css = typographyCss(ty);
  assert.match(css, /background:#fff3bf;color:#111111;/);
  assert.match(css, /\.sur-corps\{background:#202040;color:#ffffff;\}/);
  // An explicit colour is never overridden.
  const kept = typographyCss(setPath(setPath(setPath(defaultTypography(), `h1.frame`, `full`), `h1.frameFill`, `#fff3bf`), `h1.color`, `#aa0000`));
  assert.ok(!kept.includes(`color:#111111`));
});

test(`bytes become data addresses, panoramas are told by their shape, fonts of the vault are written only when used`, () => {
  assert.equal(toBase64(new Uint8Array([72, 105])), `SGk=`);
  assert.equal(dataUri(`image/png`, new Uint8Array([1, 2, 3])), `data:image/png;base64,AQID`);
  assert.equal(toBase64(new Uint8Array(100000)).length, Math.ceil(100000 / 3) * 4);
  assert.ok(isPanorama(4096, 2048) && isPanorama(2000, 1000));
  assert.ok(!isPanorama(800, 400) && !isPanorama(3000, 1000) && !isPanorama(0, 0));
  assert.match(builtinFontCss(), /font-family:"MMW Libertinus Serif";font-style:italic;font-weight:700/);
  const font = { data: new Uint8Array([0, 1, 0, 0]), flavor: `truetype` } as never;
  const used = userFontCss(setPath(defaultTypography(), `body.family`, `lora`), [{ id: `lora`, fonts: { regular: font } }, { id: `other`, fonts: { regular: font } }]);
  assert.match(used, /font-family:"mmwu-lora"[^}]*data:font\/ttf;base64,AAEAAA==/);
  assert.ok(!used.includes(`mmwu-other`));
});

test(`a video embed code is found alone, indented, in a list, in a paragraph tag or after text`, () => {
  const frame = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay" allowfullscreen></iframe>`;
  const cases = [`${frame}`, `   ${frame}`, `- point\n  ${frame}`, `- ${frame}`, `<p>${frame}</p>`, `<div>\n${frame}\n</div>`, `Texte avant ${frame} texte apres`];
  for (const body of cases) {
    const doc = buildExportDoc(`# T\n${body}\n`, `N.md`);
    const media = JSON.stringify(doc).match(/"type":"media"/g) ?? [];
    assert.equal(media.length, 1, body);
  }
  const { html } = render(`# T\nTexte avant ${frame} texte apres\n`);
  assert.match(html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /Texte avant/);
  assert.match(html, /texte apres/);
});

test(`a video keeps a link to its page and a wide table scrolls inside its own frame`, () => {
  const { html } = render(`# T\n![](https://youtu.be/dQw4w9WgXcQ?t=42)\n\n| a | b |\n|---|---|\n| c | d |\n`);
  assert.match(html, /<p class="video-lien"><a href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&amp;t=42"/);
  assert.match(html, /<div class="tableau-defil"><table/);
  assert.match(html, /<\/table><\/div>/);
});

test(`the mode with separate folders links to its files instead of holding them`, () => {
  const media: HtmlImage = { src: `medias/photo.png`, width: 400, height: 300, panorama: false };
  const pano: HtmlImage = { src: `medias/vue%20360.jpg`, width: 4000, height: 2000, panorama: true };
  const { html } = render(`# T\n![[photo.png|Une photo]]\n\n![[vue 360.jpg|Un panorama]]\n`, [[`photo.png`, media], [`vue 360.jpg`, pano]], {
    separate: true,
    fontCss: builtinFontFiles().css,
    panorama: { js: ``, css: ``, jsUrl: `lib/pannellum.js`, cssUrl: `lib/pannellum.css` },
  });
  assert.match(html, /<img src="medias\/photo\.png"/);
  assert.match(html, /<img class="source" src="medias\/vue%20360\.jpg"/);
  assert.match(html, /<link rel="stylesheet" href="lib\/pannellum\.css">/);
  assert.match(html, /<script src="lib\/pannellum\.js"><\/script>/);
  assert.match(html, /img-src 'self' data:/);
  assert.match(html, /connect-src 'self' blob: data:/);
  assert.match(html, /src:url\(polices\/libertinus-regular\.otf\)/);
  assert.ok(!html.includes(`base64,`), `no picture or font travels inside the page`);
  // The single file keeps its strict policy.
  assert.ok(!/img-src 'self'/.test(render(`# T\nTexte`).html));
});

test(`fonts as files and names of the files of the exported folder`, () => {
  const fonts = builtinFontFiles();
  assert.deepEqual(fonts.files.map((f) => f.name), [`libertinus-regular.otf`, `libertinus-italic.otf`, `libertinus-bold.otf`, `libertinus-bolditalic.otf`]);
  assert.ok(fonts.files.every((f) => f.bytes.length > 10000));
  assert.equal(fromBase64(toBase64(new Uint8Array([1, 2, 250, 255]))).join(`,`), `1,2,250,255`);
  const taken = new Set<string>();
  assert.equal(exportFileName(`Plan général.PNG`, taken), `Plan-général.png`);
  assert.equal(exportFileName(`plan général.png`, taken), `plan-général-2.png`);
  assert.equal(exportFileName(`a b?c#d.jpg`, taken), `a-b-c-d.jpg`);
  assert.equal(exportFileName(`...`, taken), `fichier`);
});
