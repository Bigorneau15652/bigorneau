// HTML export: the style sheet and the script of the reader that is written into every exported page. They are plain text, kept apart
// from the renderer so that html-doc.ts stays readable. The script contains no backtick and no dollar followed by a brace, because it
// lives in a raw template literal.

// Style sheet of the reader: layout (side menus, sheet, buttons), light and dark themes, wide mode, full screen and print.
export const READER_CSS = String.raw`
:root{--accent:#3b6ea5;--taille-menu:280px;--taille-mini:210px}
:root[data-theme="clair"]{--fond:#e7e7e3;--feuille:#fff;--texte:#1d1d1f;--doux:#5c5c63;--panneau:#f6f6f3;--bord:#c9c9c2;--code:#f1f1ee;--zebre:#f3f3f0;--entete:#e4e4df;--lien:#1a4d8f}
:root[data-theme="sombre"]{--fond:#151518;--feuille:#222226;--texte:#e8e8ea;--doux:#a4a4ad;--panneau:#1d1d21;--bord:#3a3a40;--code:#2c2c31;--zebre:#27272b;--entete:#33333a;--lien:#8fb8ee}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--fond);color:var(--texte);font-family:"MMW Libertinus Serif",Georgia,serif}
.bouton{width:40px;height:40px;border-radius:10px;border:1px solid var(--bord);background:var(--panneau);color:var(--texte);cursor:pointer;display:grid;place-items:center;padding:0}
.bouton:hover{border-color:var(--accent)}
.bouton[aria-pressed="true"],.bouton[aria-expanded="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
.bouton svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.boutons{position:fixed;top:12px;z-index:40;display:flex;flex-direction:column;gap:8px}
.boutons-gauche{left:10px}
.boutons-droite{right:10px}
.panneaux{position:fixed;top:0;bottom:0;left:60px;z-index:30;display:flex}
.panneau{display:none;overflow:auto;padding:14px 12px 40px;background:var(--panneau);border-right:1px solid var(--bord);font:14px/1.4 system-ui,sans-serif}
.panneau h2{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--doux)}
.panneau-plan{width:var(--taille-menu)}
.panneau-mini{width:var(--taille-mini)}
body.plan-ouvert .panneau-plan,body.mini-ouvert .panneau-mini{display:block}
.arbre,.arbre ul{list-style:none;margin:0;padding:0}
.arbre ul{padding-left:14px}
.arbre li{margin:2px 0}
.arbre .ligne{display:flex;align-items:baseline;gap:2px}
.arbre a{color:var(--texte);text-decoration:none;padding:2px 4px;border-radius:4px;display:block;flex:1}
.arbre a:hover{background:var(--entete)}
.arbre a.actif{background:var(--accent);color:#fff}
.arbre .bascule{border:0;background:none;color:var(--doux);cursor:pointer;width:18px;padding:0;font-size:12px;transform:rotate(90deg)}
.arbre li.ferme>.ligne>.bascule{transform:none}
.arbre li.ferme>ul{display:none}
.vignettes{display:flex;flex-direction:column;gap:12px}
.vignette{display:block;text-decoration:none;color:var(--texte);border:1px solid var(--bord);border-radius:6px;padding:6px;background:var(--feuille)}
.vignette:hover{border-color:var(--accent)}
.vignette img{display:block;width:100%;height:110px;object-fit:contain;background:var(--code)}
.vignette span{display:block;margin-top:4px;font-size:12px;color:var(--doux)}
main{margin-left:calc(60px + var(--gauche,0px));margin-right:60px;padding:24px 16px 90px}
body.plan-ouvert{--gauche:var(--taille-menu)}
body.mini-ouvert{--gauche:var(--taille-mini)}
body.plan-ouvert.mini-ouvert{--gauche:calc(var(--taille-menu) + var(--taille-mini))}
.feuille{max-width:860px;margin:0 auto;background:var(--feuille);padding:56px 64px;box-shadow:0 2px 18px rgba(0,0,0,.2);line-height:1.55;overflow-wrap:break-word}
body.large .feuille{max-width:none;margin:0;background:transparent;box-shadow:none;padding:16px 3vw}
body.plein .boutons,body.plein .panneaux{display:none}
body.plein main{margin:0;padding:24px 8px 60px}
.astuce{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:8px;font:14px system-ui,sans-serif;z-index:60;opacity:0;pointer-events:none;transition:opacity .3s}
.astuce.visible{opacity:1}
.feuille a{color:var(--lien)}
.feuille h2,.feuille h3,.feuille h4,.feuille h5,.feuille h6,.titre-doc{line-height:1.25;margin:1.6em 0 .5em;scroll-margin-top:16px}
.titre-doc{margin-top:0}
.auteur{margin:0 0 2em;color:var(--doux)}
.feuille p{margin:0 0 .8em}
.al-j{text-align:justify;hyphens:auto}
.al-l{text-align:left}
.al-r{text-align:right}
.al-c{text-align:center}
.mode-indent p+p{text-indent:1.5em;margin-top:0}
.mode-space p{margin:0 0 var(--ecart,.8em)}
.feuille ul,.feuille ol{margin:0 0 .9em;padding-left:1.6em}
.feuille blockquote{margin:0 0 .9em;padding:.1em 1em;border-left:3px solid var(--bord);color:var(--doux)}
.feuille pre.code{background:var(--code);padding:10px 14px;border-radius:6px;overflow:auto;font:13px/1.45 ui-monospace,Consolas,monospace}
.feuille figure{margin:1.2em 0;text-align:center}
.feuille figure img{max-width:100%;height:auto}
.feuille figcaption,.feuille caption{font-size:.9em;color:var(--doux);margin-top:.4em}
.feuille caption{caption-side:top;text-align:center;margin:0 0 .4em}
.tableau-defil{overflow-x:auto;max-width:100%;margin:1.2em 0}
.feuille table{border-collapse:collapse;margin:0 auto}
.feuille td,.feuille th{border:1px solid var(--bord);padding:4px 10px;vertical-align:top;overflow-wrap:anywhere}
.feuille table.entete tr:first-child td{background:var(--entete);font-weight:bold}
.feuille table.zebre tr:nth-child(even) td{background:var(--zebre)}
.feuille table.egal{table-layout:fixed;width:100%}
.feuille td.al-r{text-align:right}
.feuille td.al-c{text-align:center}
.fx{display:inline-block;height:1.1em;fill:currentColor}
.fx-bloc{margin:1em 0;text-align:center}
.fx-bloc svg{fill:currentColor;max-width:100%}
.panorama{height:60vh;min-height:280px;max-height:640px;background:var(--code);border-radius:6px;overflow:hidden;position:relative}
.panorama .source{width:100%;height:100%;object-fit:cover}
.panorama.actif .source{display:none}
.video{position:relative;aspect-ratio:16/9;background:#000;border-radius:6px;overflow:hidden}
.video-lien{text-align:center;font-size:.9em;margin:.4em 0 0}
.hors-ligne .video{display:none}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.feuille video,.feuille audio{max-width:100%}
.carte-media{display:flex;gap:12px;align-items:center;border:1px solid var(--bord);border-radius:8px;padding:10px 14px;text-align:left;background:var(--code)}
.carte-media .icone{font-size:26px}
.absente{color:var(--doux);font-style:italic}
.liste-illustrations ol{list-style:none;padding:0}
.renvoi{font-size:.75em;line-height:0}
.notes-fin{margin-top:3em;border-top:1px solid var(--bord);font-size:.92em}
.notes-fin .retour{text-decoration:none;margin-left:.4em}
@media (max-width:760px){
.panneaux{left:60px}.panneau-plan,.panneau-mini{width:min(calc(100vw - 120px),320px)}
main{margin:0;padding:64px 10px 80px}
.feuille{padding:28px 18px}
}
@media print{.boutons,.panneaux,.astuce{display:none}main{margin:0;padding:0}.feuille{box-shadow:none;max-width:none;padding:0;background:#fff;color:#000}body{background:#fff}}
`;

// Script of the reader: side menus, themes, full screen, wide mode, thumbnails, panoramas. It uses only the DOM, no network.
export const READER_JS = String.raw`
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  // A page opened from a file sends no address to YouTube, which then refuses the player (error 153): only the link stays.
  if (location.protocol === "file:") root.classList.add("hors-ligne");
  var texts = JSON.parse(doc.getElementById("textes").textContent);
  var KEY = "bigorneau-lecteur";

  function load() {
    try { return JSON.parse(window.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked */ }
  }
  var state = load();

  function button(id) { return doc.getElementById(id); }
  function setPressed(btn, on) { btn.setAttribute("aria-pressed", on ? "true" : "false"); }

  /* Theme */
  var dark = state.theme ? state.theme === "sombre" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var themeBtn = button("b-theme");
  function applyTheme() {
    root.setAttribute("data-theme", dark ? "sombre" : "clair");
    themeBtn.setAttribute("title", dark ? texts.light : texts.dark);
    themeBtn.setAttribute("aria-label", dark ? texts.light : texts.dark);
    themeBtn.querySelector(".icone-lune").style.display = dark ? "none" : "";
    themeBtn.querySelector(".icone-soleil").style.display = dark ? "" : "none";
  }
  themeBtn.addEventListener("click", function () { dark = !dark; state.theme = dark ? "sombre" : "clair"; save(state); applyTheme(); });
  applyTheme();

  /* Side menus: the headings and the thumbnails open independently, both on the left */
  var menus = [];
  function menu(btnId, cls, key) {
    var btn = button(btnId);
    if (!btn) return;
    var entry = { set: null };
    function set(on) {
      body.classList.toggle(cls, on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      state[key] = on;
      save(state);
      /* on a narrow screen the menus cover the text: only one is open at a time */
      if (on && window.innerWidth <= 760) menus.forEach(function (other) { if (other !== entry) other.set(false); });
    }
    entry.set = set;
    menus.push(entry);
    btn.addEventListener("click", function () { set(!body.classList.contains(cls)); });
    set(!!state[key] && window.innerWidth > 760);
  }
  menu("b-plan", "plan-ouvert", "plan");
  menu("b-mini", "mini-ouvert", "mini");

  /* Wide mode */
  var wideBtn = button("b-large");
  function setWide(on) { body.classList.toggle("large", on); setPressed(wideBtn, on); state.wide = on; save(state); }
  wideBtn.addEventListener("click", function () { setWide(!body.classList.contains("large")); });
  setWide(!!state.wide);

  /* Full screen: every button disappears, Escape brings them back */
  var tip = doc.createElement("div");
  tip.className = "astuce";
  tip.textContent = texts.escape;
  body.appendChild(tip);
  var tipTimer = 0;
  function showTip() {
    tip.classList.add("visible");
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(function () { tip.classList.remove("visible"); }, 3000);
  }
  function leaveFull() {
    body.classList.remove("plein");
    if (doc.fullscreenElement && doc.exitFullscreen) { try { doc.exitFullscreen(); } catch (e) { /* ignored */ } }
  }
  button("b-plein").addEventListener("click", function () {
    body.classList.add("plein");
    showTip();
    if (root.requestFullscreen) {
      var asked = root.requestFullscreen();
      if (asked && asked.catch) asked.catch(function () { /* the page style alone is enough */ });
    }
  });
  doc.addEventListener("fullscreenchange", function () { if (!doc.fullscreenElement) body.classList.remove("plein"); });
  doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && body.classList.contains("plein")) leaveFull(); });

  /* Fold buttons of the heading tree */
  var items = doc.querySelectorAll(".arbre li");
  Array.prototype.forEach.call(items, function (li) {
    var sub = li.querySelector(":scope > ul");
    var line = li.querySelector(":scope > .ligne");
    if (!sub || !line) return;
    var toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "bascule";
    toggle.textContent = "▸";
    toggle.setAttribute("aria-label", texts.fold);
    toggle.addEventListener("click", function () { li.classList.toggle("ferme"); });
    line.insertBefore(toggle, line.firstChild);
  });

  /* Current heading highlighted in the tree while reading */
  var links = {};
  Array.prototype.forEach.call(doc.querySelectorAll(".arbre a[href^='#']"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var current = null;
  function mark(id) {
    var a = links[id];
    if (!a || a === current) return;
    if (current) current.classList.remove("actif");
    a.classList.add("actif");
    current = a;
    var panel = a.closest(".panneau");
    if (panel && a.offsetParent) {
      var box = a.getBoundingClientRect();
      var pbox = panel.getBoundingClientRect();
      if (box.top < pbox.top + 20 || box.bottom > pbox.bottom - 20) panel.scrollTop += box.top - pbox.top - pbox.height / 3;
    }
  }
  var headings = Array.prototype.slice.call(doc.querySelectorAll("[data-plan]"));
  function onScroll() {
    var found = null;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= 80) found = headings[i]; else break;
    }
    if (found) mark(found.id);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Thumbnails of the figures: they reuse the image already in the page, nothing is stored twice */
  var strip = doc.getElementById("vignettes");
  if (strip) {
    Array.prototype.forEach.call(doc.querySelectorAll("figure[data-mini]"), function (fig) {
      var img = fig.querySelector("img");
      if (!img) return;
      var a = doc.createElement("a");
      a.className = "vignette";
      a.href = "#" + fig.id;
      var thumb = doc.createElement("img");
      thumb.src = img.src;
      thumb.alt = "";
      thumb.loading = "lazy";
      var label = doc.createElement("span");
      label.textContent = fig.getAttribute("data-mini");
      a.appendChild(thumb);
      a.appendChild(label);
      strip.appendChild(a);
    });
    if (!strip.firstChild) {
      var none = doc.createElement("p");
      none.textContent = texts.noThumbs;
      strip.appendChild(none);
    }
  }

  /* 360 degree panoramas: the viewer starts when the picture comes into view */
  function blobOf(src) {
    var comma = src.indexOf(",");
    var type = src.slice(5, src.indexOf(";"));
    var raw = window.atob(src.slice(comma + 1));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return window.URL.createObjectURL(new Blob([bytes], { type: type }));
  }
  function startPanorama(box) {
    if (box.getAttribute("data-pret") || !window.pannellum) return;
    box.setAttribute("data-pret", "1");
    var img = box.querySelector(".source");
    var inline = img.getAttribute("src").indexOf("data:") === 0;
    /* A browser refuses to read a picture file for the viewer when the page itself is a file: the flat picture stays, with a note. */
    if (!inline && location.protocol === "file:") {
      var note = doc.createElement("p");
      note.className = "video-lien";
      note.textContent = texts.flatPano;
      if (box.parentNode) box.parentNode.insertBefore(note, box.nextSibling);
      return;
    }
    try {
      var holder = doc.createElement("div");
      holder.style.width = "100%";
      holder.style.height = "100%";
      box.appendChild(holder);
      window.pannellum.viewer(holder, { type: "equirectangular", panorama: inline ? blobOf(img.src) : img.src, autoLoad: true, compass: false, showFullscreenCtrl: false });
      box.classList.add("actif");
    } catch (e) { /* the flat picture stays visible */ }
  }
  var boxes = doc.querySelectorAll(".panorama");
  if (boxes.length > 0) {
    if ("IntersectionObserver" in window) {
      var watcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) { startPanorama(entry.target); watcher.unobserve(entry.target); } });
      }, { rootMargin: "200px" });
      Array.prototype.forEach.call(boxes, function (b) { watcher.observe(b); });
    } else {
      Array.prototype.forEach.call(boxes, startPanorama);
    }
  }
})();
`;
