#!/usr/bin/env python3
"""Build a minimal 2-axis variable test font (wght + wdth) for browser tests.

Output: test-vf.ttf in the project root. Masters are saved next to it and
kept so the build is reproducible.

Usage: python3 tests/build-test-font.py
"""

import os
from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import TTFont
from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.varLib import build as varlib_build
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
FAMILY = "VFStudio Test"
OUT = os.path.join(os.path.dirname(__file__), "..", "test-vf.ttf")


def build_master(wght, wdth, path):
    sw = 0.55 + (wdth - 25) * (1.6 - 0.55) / (200 - 25)
    glyphs, metrics = {}, {}

    def make(xw, yh):
        pen = TTGlyphPen(None)
        w = xw * sw
        pen.moveTo((0, 0))
        pen.lineTo((w, 0))
        pen.lineTo((w, yh))
        pen.lineTo((0, yh))
        pen.closePath()
        return pen.glyph()

    def makeV():
        pen = TTGlyphPen(None)
        w = 520 * sw
        pen.moveTo((0, 0))
        pen.lineTo((190 * sw, 0))
        pen.lineTo((w / 2 + 45, 700))
        pen.lineTo((w / 2 - 65, 700))
        pen.lineTo((w / 2 - 8, 185))
        pen.lineTo((w / 2 - 125, 700))
        pen.lineTo((w / 2 - 165, 700))
        pen.closePath()
        return pen.glyph()

    glyphs[".notdef"] = TTGlyphPen(None).glyph()
    metrics[".notdef"] = (500, 0)
    glyphs["space"] = make(200, 0)
    metrics["space"] = (int(280 * sw), 0)
    for name, (xw, yh) in {
        "V": (520, 700),
        "a": (460, 480),
        "r": (400, 480),
        "i": (210, 700),
        "b": (460, 700),
        "l": (210, 700),
        "e": (460, 480),
    }.items():
        glyphs[name] = makeV() if name == "V" else make(xw, yh)
        metrics[name] = (int((xw + 70) * sw), 0)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder([".notdef", "space", "V", "a", "r", "i", "b", "l", "e"])
    fb.setupCharacterMap({ord(c): c for c in "Variable"})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": FAMILY, "styleName": f"{wght} {wdth}"})
    fb.setupOS2(
        sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200
    )
    fb.setupPost()
    fb.font.save(path)
    return path


# DesignSpace locations are keyed by axis NAME.
master_locs = [
    {"Weight": 400, "Width": 100},
    {"Weight": 100, "Width": 25},
    {"Weight": 900, "Width": 25},
    {"Weight": 100, "Width": 200},
    {"Weight": 900, "Width": 200},
]
base = os.path.dirname(os.path.abspath(__file__))
paths = [
    build_master(l["Weight"], l["Width"], os.path.join(base, f"master_{i}.ttf"))
    for i, l in enumerate(master_locs)
]

doc = DesignSpaceDocument()
a1 = doc.newAxisDescriptor()
a1.tag = "wght"
a1.name = "Weight"
a1.minimum = 100
a1.default = 400
a1.maximum = 900
doc.addAxis(a1)
a2 = doc.newAxisDescriptor()
a2.tag = "wdth"
a2.name = "Width"
a2.minimum = 25
a2.default = 100
a2.maximum = 200
doc.addAxis(a2)
for loc, p in zip(master_locs, paths):
    src = doc.newSourceDescriptor()
    src.path = p
    src.location = loc
    src.familyName = FAMILY
    src.styleName = f"{loc['Weight']}-{loc['Width']}"
    doc.addSource(src)

vf, _, _ = varlib_build(doc)
vf["name"].setName(FAMILY, 1, 3, 1, 0x409)
vf["name"].setName("Regular", 2, 3, 1, 0x409)
vf["name"].setName(FAMILY, 4, 3, 1, 0x409)
vf["name"].setName(f"{FAMILY} Regular", 6, 3, 1, 0x409)
vf.save(OUT)
print("saved", os.path.abspath(OUT))

f = TTFont(OUT)
print("fvar:", [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in f["fvar"].axes])
