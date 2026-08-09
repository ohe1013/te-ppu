"""Import one deterministic playable-character contact sheet into runtime WebPs."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS_ROOT = ROOT / "public" / "assets" / "characters"
SUPPORTED_CHARACTERS = ("cloud-courier", "star-alchemist")
SHEET_SIZE = (2048, 1024)
CELL_SIZE = 512
CELL_INSET = 24
MIN_VISIBLE_PIXELS = 64
FULL_ART_SAFE_LONGEST = 896
OUTPUTS = (
    ("full.webp", 0, (1024, 1024)),
    ("portrait-idle.webp", 1, (256, 256)),
    ("portrait-focus.webp", 2, (256, 256)),
    ("portrait-attack.webp", 3, (256, 256)),
    ("portrait-hit.webp", 4, (256, 256)),
    ("portrait-win.webp", 5, (256, 256)),
    ("portrait-loss.webp", 6, (256, 256)),
)


class ImportFailure(ValueError):
    """Raised when a source sheet cannot be imported safely."""


def cell_box(index: int) -> tuple[int, int, int, int]:
    column = index % 4
    row = index // 4
    return (
        column * CELL_SIZE + CELL_INSET,
        row * CELL_SIZE + CELL_INSET,
        (column + 1) * CELL_SIZE - CELL_INSET,
        (row + 1) * CELL_SIZE - CELL_INSET,
    )


def visible_bounds(image: Image.Image, index: int) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    visible_pixels = sum(alpha.histogram()[9:])
    bounds = alpha.getbbox()
    if visible_pixels < MIN_VISIBLE_PIXELS or bounds is None:
        raise ImportFailure(f"near-empty used cell {index}")
    return bounds


def render_cell(sheet: Image.Image, index: int, output_size: tuple[int, int]) -> Image.Image:
    cell = sheet.crop(cell_box(index))
    content = cell.crop(visible_bounds(cell, index))
    if index == 0:
        scale = min(
            FULL_ART_SAFE_LONGEST / content.width,
            FULL_ART_SAFE_LONGEST / content.height,
        )
        fitted_size = (
            max(1, round(content.width * scale)),
            max(1, round(content.height * scale)),
        )
        content = content.resize(fitted_size, Image.Resampling.LANCZOS)
    else:
        content.thumbnail(output_size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", output_size, (0, 0, 0, 0))
    offset = (
        (output.width - content.width) // 2,
        (output.height - content.height) // 2,
    )
    output.alpha_composite(content, offset)
    return output


def load_sheet(source: Path) -> Image.Image:
    try:
        with Image.open(source) as opened:
            opened.load()
            if opened.size != SHEET_SIZE:
                raise ImportFailure(
                    "invalid fixed 4x2 geometry: expected 2048x1024"
                )
            if "A" not in opened.getbands():
                raise ImportFailure("source sheet is missing alpha")
            return opened.convert("RGBA")
    except ImportFailure:
        raise
    except (FileNotFoundError, IsADirectoryError, PermissionError, UnidentifiedImageError, OSError) as error:
        raise ImportFailure("source is not a readable image") from error


def target_directory(character: str) -> Path:
    if character not in SUPPORTED_CHARACTERS:
        raise ImportFailure(f"unsupported character: {character}")
    root = CHARACTERS_ROOT.resolve()
    target = (CHARACTERS_ROOT / character).resolve()
    if target.parent != root:
        raise ImportFailure(f"unsupported character: {character}")
    return target


def save_staged_outputs(staging: Path, outputs: dict[str, Image.Image]) -> None:
    for name, image in outputs.items():
        destination = staging / name
        image.save(destination, format="WEBP", quality=90, method=6)
        with Image.open(destination) as saved:
            saved.load()
            if saved.format != "WEBP" or saved.mode != "RGBA" or saved.size != image.size:
                raise ImportFailure(f"failed to verify staged output: {name}")


def replace_outputs(target: Path, staging: Path) -> None:
    existed = target.exists()
    target.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix=f".{target.name}-backup-", dir=target.parent))
    replaced: list[str] = []
    backed_up: list[str] = []
    try:
        for name, _, _ in OUTPUTS:
            destination = target / name
            if destination.exists():
                os.replace(destination, backup / name)
                backed_up.append(name)
            os.replace(staging / name, destination)
            replaced.append(name)
    except BaseException:
        for name in reversed(replaced):
            destination = target / name
            if destination.exists():
                destination.unlink()
        for name in reversed(backed_up):
            saved = backup / name
            if saved.exists():
                os.replace(saved, target / name)
        if not existed:
            try:
                target.rmdir()
            except OSError:
                pass
        raise
    finally:
        shutil.rmtree(backup, ignore_errors=True)


def import_sheet(character: str, source: Path) -> None:
    target = target_directory(character)
    sheet = load_sheet(source)
    outputs = {
        name: render_cell(sheet, index, size)
        for name, index, size in OUTPUTS
    }

    CHARACTERS_ROOT.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{character}-staging-", dir=CHARACTERS_ROOT))
    try:
        save_staged_outputs(staging, outputs)
        replace_outputs(target, staging)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", required=True)
    parser.add_argument("--source", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import_sheet(args.character, args.source)
    except ImportFailure as error:
        print(f"IMPORT_PLAYER_CHARACTER_SHEET_FAIL {error}", file=sys.stderr)
        return 1
    print(f"IMPORT_PLAYER_CHARACTER_SHEET_OK character={args.character}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
