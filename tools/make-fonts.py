#!/usr/bin/env python3
# Outil de developpement (non execute par le plugin) : reduit les quatre styles de Libertinus Serif (version officielle 7.051,
# licence SIL Open Font License 1.1) au latin, en conservant les ligatures et le crenage, et ecrit src/export/fonts-libertinus.ts.
# Necessite fonttools : pip install fonttools. Usage : python3 tools/make-fonts.py
import base64
import io
from fontTools import subset
from fontTools.ttLib import TTFont

STYLES = {
    "regular": "tools/LibertinusSerif-Regular.otf",
    "italic": "tools/LibertinusSerif-Italic.otf",
    "bold": "tools/LibertinusSerif-Bold.otf",
    "boldItalic": "tools/LibertinusSerif-BoldItalic.otf",
    # Chasse fixe pour le code et les tableaux.
    "mono": "tools/LibertinusMono-Regular.otf",
}

# Latin de base, Latin-1, Latin etendu A, ponctuation typographique (espaces, tirets, guillemets, puces, points de suite),
# monnaies, symboles courants (marque, fleches, moins).
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + [0x192, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x2002, 0x200B))
    + list(range(0x2010, 0x2016))
    + list(range(0x2018, 0x201F))
    + [0x2020, 0x2021, 0x2022, 0x2026, 0x202F, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2116, 0x2122]
    + [0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215]
)
FEATURES = ["kern", "liga", "clig", "ccmp", "locl"]

out = [
    "// Fichier genere par tools/make-fonts.py : ne pas modifier a la main.",
    "// Libertinus Serif 7.051 (normal, italique, gras, gras italique) et Libertinus Mono 7.051, sous-ensemble latin avec ligatures et crenage, licence SIL",
    "// Open Font License 1.1 (voir licences/). Chaque police est un fichier OpenType (contours CFF) en base 64.",
    "export const FONT_FILES: Record<string, string> = {",
]
for name, path in STYLES.items():
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    opts.glyph_names = False
    opts.legacy_kern = False
    opts.drop_tables += ["DSIG", "FFTM", "meta", "STAT", "gasp"]
    font = TTFont(path)
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(font)
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    out.append(f"  {name}: `{base64.b64encode(data).decode()}`,")
    f2 = TTFont(io.BytesIO(data))
    print(name, len(data), "octets", len(f2.getGlyphOrder()), "glyphes", sorted(f2.keys()))
out.append("};")
out.append("")
open("src/export/fonts-libertinus.ts", "w").write("\n".join(out))
