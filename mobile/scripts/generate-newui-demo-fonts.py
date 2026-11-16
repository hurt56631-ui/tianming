#!/usr/bin/env python3
"""Make smaller Android demo font aliases from four legacy OFL fonts.

These are temporary font replacements, not pixel-perfect reproductions of the
new desktop UI's seven originally designed font families. Do not modify
production font files; this runs in the isolated Android demo CI checkout.
"""
from pathlib import Path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "web/assets/fonts"
TARGET = ROOT / "web/ui/assets/fonts"
STYLES = ROOT / "web/ui/kit/fonts.css"
# Original fonts exist in the public official 'pages' branch.
FAMILIES = {
    "TM-WenKai": "ZCOOLXiaoWei-Regular.ttf",
    "TM-MaShanZheng": "MaShanZheng-Regular.ttf",
    "TM-Qiji": "ZCOOLQingKeHuangYou-Regular.ttf",
    "TM-Syuku": "MaShanZheng-Regular.ttf",
    "TM-Boku": "LongCang-Regular.ttf",
    "TM-Xing": "LongCang-Regular.ttf",
    "TM-Seal": "ZCOOLXiaoWei-Regular.ttf",
}
css = ["/* Android new-UI test: temporary SIL OFL font aliases, not official new UI font assets. */"]
for family, filename in FAMILIES.items():
    source = LEGACY / filename
    if not source.is_file():
        raise SystemExit(f"missing source OFL font: {source}")
    dest = TARGET / family / "00.woff2"
    dest.parent.mkdir(parents=True, exist_ok=True)
    font = TTFont(source)
    font.flavor = "woff2"
    font.save(dest)
    font.close()
    css.append(
        f"@font-face {{ font-family: '{family}';"
        f" src: url('../assets/fonts/{family}/00.woff2') format('woff2');"
        f" font-display: swap; }}"
    )
    print(f"[newui-font] {family} -> {filename} ({dest.stat().st_size} bytes)")
STYLES.write_text("\n".join(css) + "\n", encoding="utf-8")
print("[newui-font] preview CSS replaced only in isolated Android checkout")
