#!/usr/bin/env python3
"""Android-only reconstructed study textures. NOT the original artist's textures.
Uses deterministic PIL/numpy procedural art for a runnable preview build.
"""
from pathlib import Path
import hashlib
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/ui/assets/study/tex"
OUT.mkdir(parents=True, exist_ok=True)
SPECS = {
    "brocade": ("fabric", (122, 39, 31)),
    "caihua": ("paint", (38, 86, 82)),
    "carpet": ("fabric", (146, 52, 35)),
    "carved-clouds": ("gold", (118, 75, 35)),
    "ceiling": ("paint", (42, 78, 89)),
    "cinnabar": ("lacquer", (124, 36, 29)),
    "clouds": ("sky", (177, 187, 177)),
    "door-skirt": ("lacquer", (110, 39, 29)),
    "fan-face": ("landscape", (216, 196, 153)),
    "floor-tiles": ("stone", (92, 91, 86)),
    "huanghuali": ("wood", (126, 84, 47)),
    "lantern-painting": ("landscape", (201, 169, 118)),
    "plaque-frame": ("gold", (124, 83, 39)),
    "porcelain-wrap": ("paint", (214, 218, 205)),
    "screen-qianli": ("landscape", (174, 195, 186)),
    "silk": ("fabric", (207, 194, 164)),
    "throne-back": ("fabric", (124, 43, 31)),
    "wallpaper": ("paper", (195, 175, 139)),
    "window-court": ("landscape", (169, 178, 154)),
    "zitan": ("wood", (60, 37, 30)),
    "carpet-extra": ("fabric", (150, 69, 45))
}
# Only the exact 21 runtime filenames; no arbitrary placeholder URLs.
SPECS.pop("carpet-extra")

for name, (kind, base) in SPECS.items():
    seed = int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")
    rng = np.random.default_rng(seed)
    width, height = (1600, 1100) if kind == "landscape" else (1024, 1024)
    yy, xx = np.indices((height, width), dtype=np.float32)
    noise = rng.normal(0, 1, (height, width)).astype(np.float32)
    # Low-frequency pigment and material variations.
    coarse = Image.fromarray(rng.integers(0, 255, (36, 36), dtype=np.uint8)).resize((width, height), Image.Resampling.BICUBIC)
    low = np.asarray(coarse, dtype=np.float32) / 255.0 - 0.5
    level = noise * (2.0 if kind in ("paper", "fabric") else 3.7) + low * 16.0
    if kind == "wood":
        grain = np.sin(yy * 0.10 + np.sin(xx * 0.023) * 7 + np.sin(yy * 0.005) * 14)
        level += grain * 12 + np.sin(yy * 0.028 + xx * 0.007) * 5
    if kind == "fabric":
        level += ((xx % 7 < 1).astype(np.float32) + (yy % 7 < 1).astype(np.float32)) * 8
    if kind == "stone":
        level += ((xx % 256 < 3) | (yy % 256 < 3)).astype(np.float32) * -36
        level += ((xx % 256 > 250) | (yy % 256 > 250)).astype(np.float32) * 11
    if kind == "paint":
        level += (np.sin(xx / 100.0) * np.cos(yy / 95.0)) * 6
    if kind == "gold":
        level += np.sin(xx / 15) * np.sin(yy / 18) * 17
    rgb = np.stack([np.clip(base[i] + level * (1 if i == 1 else 0.85), 0, 255) for i in range(3)], -1).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB")
    draw = ImageDraw.Draw(im, "RGBA")
    if kind == "landscape":
        # Original algorithmic ink-and-color landscape, not copied historical painting.
        for layer in range(7):
            y0 = int(height * (0.30 + layer * 0.085))
            points = [(0, height)]
            for x in range(-40, width + 80, 32):
                hill = math.sin(x / (92 + layer * 12) + layer) * (85 - layer * 7)
                hill += math.sin(x / 39 + layer * 1.2) * 22
                points.append((x, int(y0 + hill)))
            points.append((width, height))
            shade = (43 + 12 * layer, 78 + 10 * layer, 82 + 5 * layer, 105 + layer * 10)
            draw.polygon(points, fill=shade)
        for k in range(140):
            x, y = int(rng.integers(0, width)), int(rng.integers(height // 2, height))
            draw.line([(x, y), (x + int(rng.integers(-20, 20)), y - int(rng.integers(8, 50)))], fill=(25, 54, 48, 38), width=2)
        im = im.filter(ImageFilter.GaussianBlur(1.1))
    elif kind in ("fabric", "gold", "paint"):
        for k in range(1, 9):
            x = k * width // 9
            draw.line([(x, 0), (x, height)], fill=(224, 169, 83, 45), width=2)
        for k in range(1, 9):
            y = k * height // 9
            draw.line([(0, y), (width, y)], fill=(224, 169, 83, 35), width=2)
    output = OUT / (name + ".jpg")
    im.save(output, "JPEG", quality=84, optimize=True)
    print(f"[newui] generated reconstructed study texture: {output.name} ({output.stat().st_size} bytes)")
print(f"[newui] {len(SPECS)} reconstructed study textures created; these are not official artwork")
