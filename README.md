# Bigorneau

Bigorneau is an Obsidian plugin for writing notes as mind maps. Every heading of a note becomes a node of the map, and every node holds a real paragraph, so the map is a way to write and reorganise a long text and not just a diagram. The same plugin includes a long document composer: it turns a note into a typeset PDF, with the line breaking of TeX, French and British English hyphenation, footnotes, tables, figures, a table of contents, cross-references and formulas.

A French version of this file is available in [README.fr.md](README.fr.md).

## Installation

Bigorneau is being submitted to the Obsidian community plugin directory. Until it is listed there, install it with the BRAT plugin:

1. Install the community plugin BRAT in Obsidian.
2. Run the command "BRAT: Add a beta plugin for testing".
3. Enter `Bigorneau15652/bigorneau`.
4. Enable Bigorneau in Settings, Community plugins.

The interface exists in French and in English. It follows the language of Obsidian by default, and the language can be chosen in the plugin settings. The long document composer is available on desktop only. The map and the list view work on every device.

If you used this plugin under its former name, Mindmap Note Writing, disable the old plugin before enabling Bigorneau. Bigorneau imports the settings of the old plugin the first time it starts.

## Writing with the map

Open the map of the active note with the ribbon icon or with the command "Open the map of the active note". The first node of the map is the name of the note, and every Markdown heading is a chapter. Tab creates a sub-heading, Enter creates a heading of the same level, and Delete removes a heading after a confirmation. A double click or F2 on a node opens a small window with the title, a short title that is shown on the map only, a comment and labels. Drag a node, or use Cmd or Ctrl with Shift and the arrow keys, to move it with its branch. Cmd or Ctrl with C, X and V copy, cut and paste headings as Markdown. Cmd or Ctrl with Shift and Enter switches between the map and the note.

Labels have a name, a background colour and a text colour, and there is no limit to their number. They are defined in the menu of the map and appear only on the map. The short title, the comment and the labels of a heading are kept in an invisible comment under the heading. Plugin comments of the form `%% mmw ... %%` are hidden in the note and protected against accidental deletion.

The eye icon that appears when you hover a node hides the heading and its sub-headings in the note. The text stays in the file, and the nodes stay on the map, greyed out. The burger menu can also show only the active chapter in the note, instead of greying out the others.

Links between headings are written with the chain button: it writes a link `[[Note#Target heading|Link to Target heading]]` at the start of the text of the first heading and draws a dotted arrow to the target. The same window searches the notes of the vault, so a link can point to another note, which then appears as a node on the left of the map. A globe appears on a heading whose paragraph contains web links or embedded videos, and a click opens the page.

The list view condenses the map into one heading per line, indented by level, with a triangle to fold the children and the same drag and drop to reorganise headings. Switch with the button of the command bar or with the command "Switch between Mindmap view and List view".

A pinned note copies the selected chapter into its own pane, above the dynamic note that follows the map. Use "Add a pinned note" in the burger menu or the command of the same name. Floating topics are free notes that belong to no chapter: a double click on the background of the map creates one, and it can be dropped near the structure to join the map. The Appearance panel offers six shapes for the nodes, colours, line types and text alignment, applied to the whole map, to one level or to one heading. A question mark at the bottom right of the map opens a help panel with the shortcuts.

## Long document composer

The command "Preview the note export" opens a pane next to the note that shows the note as A4 pages, and "Export the note to PDF" writes the PDF into the vault, in the folder of the note by default, after asking for confirmation before replacing a file. The preview and the PDF come from the same page description, so they are identical. Hidden headings, floating topics and plugin comments are not exported.

The text is set with the line breaking algorithm of Knuth and Plass, with French or British English hyphenation (add `lang: en` to the properties of the note for English), and with the spacing rules of French typography: thin non-breaking spaces before the semicolon, the exclamation mark and the question mark, non-breaking spaces before the colon and inside guillemets, and after abbreviations and between a number and its unit. Punctuation and hyphens at the end of a line protrude slightly into the margin, which can be turned off. The font is Libertinus Serif, with Libertinus Mono for code, embedded in the PDF.

Pages avoid widows and orphans, keep a heading with its text, place footnotes at the bottom of the page of their call, with a rule and carry-over onto the next page, and show the title of the current chapter in the header and the page number in the footer. The PDF has selectable text, hierarchical bookmarks that follow the headings, clickable links, and metadata: title, language, date, and author, taken from the `author` property of the note or from the plugin settings.

Bold, italic and links are set in the text. Footnotes are written `[^id]` with a definition `[^id]: text` anywhere in the note, or inline as `^[text]`.

A Markdown table is set in a sober style, with a rule above the table, a rule under the header row and a rule below, a bold header row and no grid. Column widths adapt to the content, cell text wraps like a paragraph, column alignment comes from the separator row (`:--`, `:-:`, `--:`), and a long table is split between rows with its header repeated on the next page. A line that starts with `Table:` or `Tableau :` directly above a table is its caption, numbered automatically.

A figure is an image written `![[plan.png|Caption]]`, or `![[plan.png|Caption|400]]` with a width in pixels. PNG, JPEG, WebP, GIF and SVG are supported, reduced to at most 300 dots per inch at the displayed size (colour JPEG files are kept as they are). The caption reads "Figure 1: Caption". A missing image, or an image from the web, which is never downloaded, is replaced by a visible marker and listed in the export report. Captioned figures and tables float like in LaTeX, at the top or the bottom of a page where they fit, unless the setting asks to keep them where they are written.

A table of contents is added under the title when the note has the property `toc: true` or when the settings ask for it. `toc-depth: 2` limits the levels. Page numbers are computed after the final layout, with dot leaders and clickable entries. `chapter-toc: true` adds a table of contents at the start of each top-level chapter, listing only its sub-headings, with `chapter-toc-depth: 3` to set its levels. The properties of a note override the settings.

Cross-references: `[[#Heading]]` becomes a clickable link to the heading. To point to a figure or a table, add a block identifier at the end of the line, such as `![[plan.png|Plan]] ^plan`, or `^conso` alone on the line after a table, then write `[[#^plan]]`, which is displayed "Figure 1". A setting adds "(page N)" after the text of the reference.

Formulas are written `$formula$` inside the text and `$$formula$$` on their own lines. They are drawn by the MathJax library included in the plugin and written in the PDF as vector graphics, so they stay sharp at any zoom. A formula that MathJax rejects is kept as written and reported.

A video, a sound, an embedded PDF or an embedded web content cannot be played on paper. Each one is replaced by a frame with its kind, its title and its address, which is clickable in the PDF when it is a web address. A setting replaces the frame by a plain line of text.

The settings of the chapter "PDF export" cover the author of the PDF, the page header, the page footer, pages aligned at the bottom, a page break before each chapter, footnote numbering, protrusion, the tables of contents, the placement of figures and tables, the references and the media. Five commands of the command palette write into the note, and you can give them a keyboard shortcut in the Obsidian settings: insert a footnote, turn the table of contents of the note on or off, insert a table caption, insert an inline formula and insert a block formula.

## Privacy and disclosures

Bigorneau does not connect to the internet. It has no telemetry, no advertising, no account and no payment. It reads and writes files only inside your vault. Links open in your browser only when you click them, and images from the web are not downloaded for the export.

## Credits and licences

Bigorneau is published under the MIT licence (see [LICENSE](LICENSE)). The long document composer includes the following works, and their licences are in the folder [licences](licences) and in [NOTICE](NOTICE):

- The fonts Libertinus Serif and Libertinus Mono, version 7.051, copyright 2012-2024 The Libertinus Project Authors, SIL Open Font License 1.1.
- The MathJax library, version 3.2.2, copyright The MathJax Consortium, Apache License 2.0.
- The hyphenation patterns of French (Daniel Flipo, Bernard Gaulle, Arthur Reutenauer) and of British English (Dominik Wujastyk, Graham Toal), MIT licence, from the hyph-utf8 project.

The line breaking algorithm (Knuth and Plass, 1981) and the hyphenation algorithm (Liang, 1983) are reimplemented from their published descriptions, without reuse of code.

## Development

The code is written in TypeScript. `npm install` installs the tools, `npm test` runs the tests, and `npm run build` produces `main.js`. The design documents are in the folder [docs](docs), in French.
