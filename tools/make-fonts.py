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
# monnaies, symboles courants (marque, fleches, moins), puis les signes d'un rapport technique : grec, exposants et indices,
# fractions, operateurs mathematiques courants, fleches simples et doubles, degres Celsius et Fahrenheit, ohm.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + [0x192, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x2002, 0x200B))
    + list(range(0x2010, 0x2016))
    + list(range(0x2018, 0x201F))
    + [0x2020, 0x2021, 0x2022, 0x2026, 0x202F, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2116, 0x2122]
    + [0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215]
    # Grec (majuscules sans la case vide 0x3A2, minuscules, variantes de theta, phi et pi).
    + [c for c in range(0x391, 0x3AA) if c != 0x3A2]
    + list(range(0x3B1, 0x3CA))
    + [0x3D1, 0x3D5, 0x3D6, 0x3F5]
    # Exposants et indices (chiffres, signes, parentheses, lettres usuelles), fractions.
    + list(range(0x2070, 0x209D))
    + [0x2153, 0x2154, 0x215B, 0x215C, 0x215D, 0x215E]
    # Fleches (simples, doubles, aller-retour) et operateurs mathematiques courants.
    + [0x2194, 0x2195, 0x21A6, 0x21D0, 0x21D1, 0x21D2, 0x21D3, 0x21D4]
    + [0x2200, 0x2202, 0x2203, 0x2205, 0x2206, 0x2207, 0x2208, 0x2209, 0x220B, 0x2211, 0x2213, 0x2218, 0x2219, 0x221A, 0x221D, 0x221E]
    + [0x2220, 0x2227, 0x2228, 0x2229, 0x222A, 0x222B, 0x2234, 0x2235, 0x223C, 0x2243, 0x2245, 0x2248, 0x2260, 0x2261]
    + [0x2264, 0x2265, 0x226A, 0x226B, 0x2282, 0x2283, 0x2286, 0x2287, 0x2295, 0x2297, 0x22A5, 0x22C5]
    # Divers : litre, ohm, degres Celsius et Fahrenheit, diametre.
    + [0x2103, 0x2109, 0x2113, 0x2126, 0x2300]
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
