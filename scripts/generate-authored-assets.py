"""Generate the deterministic pixel/UI portion of the authored asset pack.

Character masters are produced separately and placed under
public/assets/characters/<id>/full.webp.  This script creates the strict
16x16 pixel tiles, item cells, battle atlas, UI SVGs, portrait derivatives,
and layered 840x1480 floor backgrounds used by the first authored pack.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
CHARACTERS = ASSETS / "characters"


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha


def scale4(image: Image.Image) -> Image.Image:
    return image.resize((image.width * 4, image.height * 4), Image.Resampling.NEAREST)


def pixel_tile(kind: str, base: str, pattern: str) -> Image.Image:
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    outline = rgba("#24213b")
    shadow = rgba("#3b3158")
    fill = rgba(base)
    light = tuple(min(255, channel + 58) for channel in fill[:3]) + (255,)
    dark = tuple(max(0, channel - 52) for channel in fill[:3]) + (255,)
    draw.rounded_rectangle((1, 1, 14, 14), radius=2, fill=outline)
    draw.rectangle((3, 3, 12, 12), fill=shadow)
    draw.rectangle((3, 2, 12, 11), fill=fill)
    draw.line((4, 3, 11, 3), fill=light, width=1)
    draw.line((3, 4, 3, 11), fill=light, width=1)
    draw.line((4, 12, 11, 12), fill=dark, width=1)
    draw.line((12, 4, 12, 11), fill=dark, width=1)
    if pattern == "stripe":
        draw.line((4, 7, 11, 7), fill=light, width=1)
        draw.line((4, 9, 11, 9), fill=dark, width=1)
    elif pattern == "hook":
        draw.rectangle((4, 5, 5, 10), fill=light)
        draw.rectangle((5, 10, 9, 11), fill=dark)
    elif pattern == "corner":
        draw.line((5, 5, 10, 10), fill=light, width=1)
        draw.point((10, 5), fill=dark)
    elif pattern == "core":
        draw.rectangle((6, 6, 9, 9), fill=light)
        draw.point((7, 7), fill=rgba("#fff4a6"))
    elif pattern == "zig":
        draw.line((4, 8, 6, 6, 8, 8, 10, 6), fill=light, width=1)
    elif pattern == "cross":
        draw.line((8, 4, 8, 10), fill=light, width=1)
        draw.line((5, 7, 11, 7), fill=light, width=1)
    elif pattern == "reverse-zig":
        draw.line((4, 6, 6, 8, 8, 6, 10, 8), fill=light, width=1)
    draw.rectangle((6, 4, 9, 4), fill=(255, 255, 255, 58))
    return scale4(image)


def garbage_tile() -> Image.Image:
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((1, 1, 14, 14), radius=2, fill=rgba("#24213b"))
    draw.rectangle((3, 3, 12, 12), fill=rgba("#69708d"))
    draw.rectangle((4, 4, 11, 5), fill=rgba("#a9b0c7"))
    draw.line((4, 7, 7, 9, 6, 12), fill=rgba("#3b3158"), width=1)
    draw.line((9, 5, 8, 8, 11, 10), fill=rgba("#3b3158"), width=1)
    draw.point((5, 6), fill=rgba("#ff5d73"))
    return scale4(image)


def item_tile(kind: str) -> Image.Image:
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((1, 1, 14, 14), radius=2, fill=rgba("#24213b"))
    draw.rectangle((3, 3, 12, 12), fill=rgba("#343c66"))
    draw.rectangle((4, 4, 11, 5), fill=rgba("#6575a9"))
    if kind == "row-clear":
        color = rgba("#fff4a6")
        draw.line((4, 8, 11, 8), fill=color, width=2)
        draw.line((5, 6, 10, 6), fill=rgba("#ffca5c"), width=1)
        draw.point((4, 8), fill=rgba("#ffffff"))
        draw.point((11, 8), fill=rgba("#ffffff"))
    elif kind == "freeze":
        color = rgba("#8ee8ff")
        draw.line((8, 4, 8, 11), fill=color, width=1)
        draw.line((5, 6, 11, 9), fill=color, width=1)
        draw.line((5, 9, 11, 6), fill=color, width=1)
        draw.point((8, 8), fill=rgba("#ffffff"))
    else:
        color = rgba("#f19cff")
        draw.arc((4, 4, 11, 11), 205, 30, fill=color, width=2)
        draw.arc((5, 5, 12, 12), 25, 210, fill=rgba("#ffd166"), width=1)
        draw.polygon([(11, 4), (11, 7), (9, 6)], fill=color)
        draw.polygon([(5, 12), (5, 9), (7, 10)], fill=rgba("#ffd166"))
    return scale4(image)


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def write_webp(path: Path, image: Image.Image, quality: int = 85) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=quality, method=6)


def generate_tiles_and_items() -> None:
    blocks = {
        "i": ("#43d9ff", "stripe"),
        "j": ("#5474ff", "hook"),
        "l": ("#ffa13d", "corner"),
        "o": ("#ffdc4a", "core"),
        "s": ("#62d96b", "zig"),
        "t": ("#b86cff", "cross"),
        "z": ("#ff5d73", "reverse-zig"),
    }
    for key, (color, pattern) in blocks.items():
        write_png(ASSETS / "blocks" / f"tile-{key}.png", pixel_tile(key, color, pattern))
    write_png(ASSETS / "blocks" / "garbage.png", garbage_tile())
    for kind in ("row-clear", "freeze", "queue-swap"):
        write_png(ASSETS / "items" / f"{kind}.png", item_tile(kind))


def draw_effect_frame(group: str, frame: int, count: int, width: int, height: int) -> Image.Image:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    progress = frame / max(1, count - 1)
    cx, cy = width / 2, height / 2
    if group == "move-dust":
        radius = 8 + progress * 20
        alpha = int(210 * (1 - progress))
        for offset in (-1, 0, 1):
            draw.ellipse((cx - radius + offset * 18, height * .64 - radius * .25,
                          cx - radius + offset * 18 + radius, height * .64 + radius * .25),
                         fill=(238, 220, 178, alpha))
    elif group == "rotate-spark":
        radius = 7 + progress * 14
        color = (255, 220, 74, int(255 * (1 - progress * .35)))
        for idx in range(4):
            angle = progress * math.tau + idx * math.tau / 4
            x = cx + math.cos(angle) * radius
            y = cy + math.sin(angle) * radius
            draw.rectangle((x - 3, y - 3, x + 3, y + 3), fill=color)
    elif group in ("land-impact", "garbage-land"):
        radius = 8 + progress * (width * .38)
        color = (255, 236, 176, int(230 * (1 - progress)))
        draw.ellipse((cx - radius, height * .70 - radius * .25,
                      cx + radius, height * .70 + radius * .25), outline=color, width=max(2, width // 32))
        draw.rectangle((cx - width * .18, height * .63, cx + width * .18, height * .7),
                       fill=(255, 255, 255, int(100 * (1 - progress))))
    elif group == "line-clear":
        alpha = int(255 * (1 - abs(progress - .5) * 1.8))
        draw.rectangle((0, height * (.35 - progress * .12), width, height * (.65 + progress * .12)),
                       fill=(255, 246, 188, max(0, alpha)))
        for x in range(0, width, max(1, width // 10)):
            draw.rectangle((x + int(progress * 18), 0, x + 6 + int(progress * 18), height),
                           fill=(255, 255, 255, int(alpha * .6)))
    elif group == "attack-shot":
        radius = 9 + int(3 * math.sin(progress * math.tau))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(255, 159, 67, 235))
        draw.ellipse((cx - radius * .55, cy - radius * .55, cx + radius * .55, cy + radius * .55),
                     fill=(255, 246, 188, 235))
        for idx in range(4):
            angle = idx * math.pi / 2 + progress * math.tau
            draw.rectangle((cx + math.cos(angle) * radius * 1.2 - 2,
                            cy + math.sin(angle) * radius * 1.2 - 2,
                            cx + math.cos(angle) * radius * 1.2 + 2,
                            cy + math.sin(angle) * radius * 1.2 + 2), fill=(255, 93, 115, 225))
    elif group == "item-acquire":
        radius = 12 + progress * 42
        color = (255, 220, 74, int(240 * (1 - progress)))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=color, width=5)
        for idx in range(8):
            angle = idx * math.tau / 8
            x = cx + math.cos(angle) * radius
            y = cy + math.sin(angle) * radius
            draw.rectangle((x - 5, y - 5, x + 5, y + 5), fill=color)
    elif group == "freeze-overlay":
        color = (142, 232, 255, 150)
        draw.line((0, height * .28, width * .4, 0), fill=color, width=3)
        draw.line((width * .6, height, width, height * .72), fill=(255, 255, 255, 110), width=3)
        draw.line((width * .75, 0, width, height * .25), fill=(77, 180, 226, 120), width=2)
    elif group == "combo-pop":
        radius = 10 + progress * 40
        color = (184, 108, 255, int(220 * (1 - progress)))
        draw.ellipse((cx - radius, cy - radius * .55, cx + radius, cy + radius * .55), outline=color, width=6)
        for idx in range(6):
            angle = idx * math.tau / 6
            x = cx + math.cos(angle) * radius * 1.1
            y = cy + math.sin(angle) * radius * .65
            draw.rectangle((x - 5, y - 5, x + 5, y + 5), fill=(255, 220, 74, int(210 * (1 - progress))))
    return image


ATLAS_GROUPS = [
    ("move-dust", 4, 64, 64),
    ("rotate-spark", 5, 64, 64),
    ("land-impact", 5, 128, 64),
    ("line-clear", 6, 640, 64),
    ("attack-shot", 6, 64, 64),
    ("garbage-land", 5, 128, 64),
    ("item-acquire", 8, 128, 128),
    ("freeze-overlay", 8, 64, 64),
    ("combo-pop", 6, 256, 128),
]


def generate_atlas() -> None:
    atlas = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    frames: dict[str, object] = {}
    x, y, row_height = 0, 0, 0
    for group, count, width, height in ATLAS_GROUPS:
        for frame in range(count):
            if x + width > atlas.width:
                x = 0
                y += row_height + 8
                row_height = 0
            image = draw_effect_frame(group, frame, count, width, height)
            atlas.alpha_composite(image, (x, y))
            name = f"{group}/{frame:02d}.png"
            frames[name] = {
                "frame": {"x": x, "y": y, "w": width, "h": height},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": width, "h": height},
                "sourceSize": {"w": width, "h": height},
            }
            x += width + 8
            row_height = max(row_height, height)
    write_png(ASSETS / "effects" / "battle-atlas.png", atlas)
    data = {
        "frames": frames,
        "meta": {
            "image": "battle-atlas.png",
            "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height},
            "scale": "1",
        },
    }
    (ASSETS / "effects").mkdir(parents=True, exist_ok=True)
    (ASSETS / "effects" / "battle-atlas.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


ICON_PATHS = {
    "rotate": '<path d="M5 6.5A7 7 0 1 1 4.4 13M5 6.5V2.8M5 6.5h3.7"/><path d="M19 17.5A7 7 0 0 1 19.6 11M19 17.5v3.7M19 17.5h-3.7"/>',
    "settings": '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="m19.2 13.1 1.5 1.1-1.8 3.1-1.8-.7a7.5 7.5 0 0 1-1.5.9l-.3 1.9h-3.6l-.3-1.9a7.5 7.5 0 0 1-1.5-.9l-1.8.7-1.8-3.1 1.5-1.1a7.7 7.7 0 0 1 0-1.8L6.3 10.2l1.8-3.1 1.8.7a7.5 7.5 0 0 1 1.5-.9l.3-1.9h3.6l.3 1.9a7.5 7.5 0 0 1 1.5.9l1.8-.7 1.8 3.1-1.5 1.1a7.7 7.7 0 0 1 0 1.8Z"/>',
    "sound-on": '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    "sound-off": '<path d="m4 10 4 0 5-4v12l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>',
    "haptics-on": '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M4 8v8M20 8v8M2 10v4M22 10v4"/>',
    "haptics-off": '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M4 8v8M20 8v8M2 10v4M22 10v4"/><path d="m3 3 18 18"/>',
    "exit": '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
}


def generate_icons() -> None:
    for name, body in ICON_PATHS.items():
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{body}</svg>\n'
        path = ASSETS / "ui" / f"{name}.svg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(svg, encoding="utf-8")


def overlay_state(image: Image.Image, state: str, character: str) -> Image.Image:
    image = image.convert("RGBA")
    tint = {
        "focus": (74, 217, 255, 26),
        "attack": (255, 159, 67, 30),
        "hit": (255, 93, 115, 55),
        "win": (255, 220, 74, 50),
        "loss": (81, 93, 151, 70),
        "worry": (142, 232, 255, 36),
        "cheer": (255, 220, 74, 46),
        "smug": (184, 108, 255, 28),
        "panic": (255, 93, 115, 54),
        "defeat": (81, 93, 151, 70),
        "rage": (255, 54, 74, 58),
        "idle": (0, 0, 0, 0),
    }.get(state, (0, 0, 0, 0))
    if tint[3]:
        layer = Image.new("RGBA", image.size, tint)
        # Keep the transparent background transparent; tint only existing art.
        layer.putalpha(image.getchannel("A").point(lambda value: value * tint[3] // 255))
        image = Image.alpha_composite(image, layer)
    draw = ImageDraw.Draw(image)
    if state in {"attack", "rage"}:
        draw.arc((20, 20, 236, 236), 205, 335, fill=(255, 220, 74, 185), width=3)
    elif state in {"hit", "panic"}:
        draw.line((24, 30, 232, 218), fill=(255, 93, 115, 185), width=3)
        draw.line((232, 30, 24, 218), fill=(255, 159, 67, 125), width=2)
    elif state == "win" or state == "cheer":
        for x, y in ((26, 42), (218, 58), (42, 214), (210, 204)):
            draw.rectangle((x - 3, y - 3, x + 3, y + 3), fill=(255, 244, 166, 210))
    elif state in {"loss", "defeat"}:
        draw.line((28, 216, 228, 216), fill=(31, 31, 65, 140), width=4)
    return image


PORTRAITS = {
    "hero-engineer": ["idle", "focus", "attack", "hit", "win", "loss"],
    "owl-companion": ["idle", "worry", "cheer"],
    "quartermaster": ["idle", "smug", "attack", "hit", "panic", "defeat"],
    "alchemist": ["idle", "smug", "attack", "hit", "panic", "defeat"],
    "guard-captain": ["idle", "smug", "attack", "hit", "panic", "defeat"],
    "dark-engineer": ["idle", "smug", "attack", "hit", "panic", "defeat"],
    "demon-king": ["idle", "attack", "hit", "rage", "defeat"],
}


def derive_portraits() -> None:
    for character, states in PORTRAITS.items():
        source_path = CHARACTERS / character / "full.webp"
        if not source_path.exists():
            continue
        source = Image.open(source_path).convert("RGBA")
        bbox = source.getbbox() or (0, 0, source.width, source.height)
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        size = int(min(width * .72, height * .38))
        cx = (bbox[0] + bbox[2]) // 2
        cy = bbox[1] + int(height * .22)
        left = max(0, cx - size // 2)
        top = max(0, cy - size // 2)
        crop = source.crop((left, top, min(source.width, left + size), min(source.height, top + size)))
        crop = crop.resize((256, 256), Image.Resampling.LANCZOS)
        for state in states:
            portrait = overlay_state(crop, state, character)
            write_webp(CHARACTERS / character / f"portrait-{state}.webp", portrait, quality=90)


FLOOR_PALETTES = {
    "tower-exterior": ("#24204d", "#7356b6", "#ffdc4a"),
    "floor-01": ("#4a392e", "#a48144", "#d9b35d"),
    "floor-02": ("#34214d", "#843d93", "#9df55d"),
    "floor-03": ("#1d3557", "#3f6fa8", "#b9d3e6"),
    "floor-04": ("#2a234b", "#c35e37", "#ff9f43"),
    "floor-05": ("#171525", "#641e35", "#d8a23c"),
}


def generate_background(name: str, colors: tuple[str, str, str]) -> Image.Image:
    width, height = 840, 1480
    image = Image.new("RGB", (width, height), colors[0])
    draw = ImageDraw.Draw(image)
    top = Image.new("RGB", (width, height), colors[0])
    top_pixels = top.load()
    c0, c1 = rgba(colors[0])[:3], rgba(colors[1])[:3]
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(int(c0[i] * (1 - ratio) + c1[i] * ratio) for i in range(3))
        draw.line((0, y, width, y), fill=color)
    accent = colors[2]
    if name == "tower-exterior":
        draw.polygon([(160, 1350), (260, 260), (580, 260), (680, 1350)], fill=colors[1])
        draw.rectangle((265, 250, 575, 1360), outline=accent, width=10)
        for floor in range(5):
            y = 430 + floor * 180
            draw.rectangle((305, y, 535, y + 105), fill=colors[0], outline=accent, width=5)
            draw.ellipse((395, y + 25, 445, y + 75), fill=accent)
        draw.polygon([(330, 1360), (390, 1200), (450, 1200), (510, 1360)], fill=colors[0])
    else:
        draw.rectangle((80, 170, 760, 1300), outline=accent, width=8)
        for x in range(120, 760, 80):
            draw.line((x, 190, x, 1280), fill=(255, 255, 255, 22), width=2)
        for y in range(260, 1280, 110):
            draw.line((100, y, 740, y), fill=(255, 255, 255, 18), width=2)
        if name == "floor-01":
            for x in (170, 310, 500, 640):
                draw.rectangle((x, 380, x + 92, 540), fill=colors[1], outline=accent, width=4)
                draw.line((x + 12, 410, x + 80, 510), fill=accent, width=3)
        elif name == "floor-02":
            for x, y in ((180, 390), (360, 300), (560, 470), (260, 760), (520, 820)):
                draw.ellipse((x, y, x + 76, y + 120), fill=colors[1], outline=accent, width=4)
                draw.line((x + 38, y - 50, x + 38, y), fill=accent, width=3)
        elif name == "floor-03":
            draw.polygon([(150, 350), (330, 470), (150, 590)], fill=colors[1], outline=accent)
            draw.polygon([(690, 350), (510, 470), (690, 590)], fill=colors[1], outline=accent)
            draw.line((420, 280, 420, 1120), fill=accent, width=10)
        elif name == "floor-04":
            for x, y in ((180, 380), (570, 520), (270, 820), (520, 930)):
                draw.rectangle((x, y, x + 140, y + 26), fill=accent)
                draw.ellipse((x + 18, y - 24, x + 66, y + 24), outline=colors[2], width=5)
                draw.line((x + 100, y, x + 230, y + 80), fill=accent, width=6)
        else:
            draw.rectangle((280, 300, 560, 1000), fill=colors[1], outline=accent, width=8)
            draw.polygon([(300, 1000), (420, 760), (540, 1000)], fill=colors[0], outline=accent)
            draw.ellipse((350, 390, 490, 530), outline=accent, width=10)
            draw.line((420, 330, 420, 590), fill=accent, width=6)
    # Keep the gameplay center visually quiet.
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle((140, 330, 700, 1160), fill=(8, 8, 24, 64))
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def generate_backgrounds() -> None:
    for name, colors in FLOOR_PALETTES.items():
        image = generate_background(name, colors)
        write_webp(ASSETS / "backgrounds" / f"{name}.webp", image, quality=82)


def main() -> None:
    generate_tiles_and_items()
    generate_atlas()
    generate_icons()
    generate_backgrounds()
    derive_portraits()
    print("AUTHORED_PIXEL_ASSETS_OK")


if __name__ == "__main__":
    main()
