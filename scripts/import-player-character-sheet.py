"""Import one deterministic playable-character contact sheet into runtime WebPs."""

from __future__ import annotations

import argparse
import os
import shutil
import stat
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
VISIBLE_ALPHA_THRESHOLD = 8
MIN_VISIBLE_PIXELS = 1024
MIN_VISIBLE_SPAN = 32
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
    visible = alpha.point(
        lambda value: 255 if value > VISIBLE_ALPHA_THRESHOLD else 0
    )
    visible_pixels = visible.histogram()[255]
    bounds = visible.getbbox()
    if bounds is None:
        raise ImportFailure(f"near-empty used cell {index}")
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    if (
        visible_pixels < MIN_VISIBLE_PIXELS
        or width < MIN_VISIBLE_SPAN
        or height < MIN_VISIBLE_SPAN
    ):
        raise ImportFailure(f"near-empty used cell {index}: below minimum visible area")
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
            if opened.mode != "RGBA":
                raise ImportFailure("source sheet mode must be exactly RGBA")
            return opened.copy()
    except ImportFailure:
        raise
    except (FileNotFoundError, IsADirectoryError, PermissionError, UnidentifiedImageError, OSError) as error:
        raise ImportFailure("source is not a readable image") from error


def is_redirect(path: Path) -> bool:
    """Return whether an existing path is a symlink, junction, or reparse point."""
    try:
        metadata = os.lstat(path)
    except FileNotFoundError:
        return False
    file_attributes = getattr(metadata, "st_file_attributes", 0)
    reparse_attribute = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return stat.S_ISLNK(metadata.st_mode) or bool(
        reparse_attribute and file_attributes & reparse_attribute
    )


def lexical_path(path: Path) -> str:
    return os.path.normcase(os.path.abspath(os.fspath(path)))


def require_lexical_child(path: Path, parent: Path) -> None:
    if lexical_path(path.parent) != lexical_path(parent):
        raise ImportFailure(f"unsafe non-canonical asset path: {path}")


def require_concrete_directory(path: Path, *, allow_missing: bool = False) -> None:
    if not os.path.lexists(path):
        if allow_missing:
            return
        raise ImportFailure(f"missing asset directory: {path}")
    if is_redirect(path):
        raise ImportFailure(f"redirected symlink, junction, or reparse directory: {path}")
    try:
        metadata = os.lstat(path)
    except OSError as error:
        raise ImportFailure(f"cannot validate asset directory: {path}") from error
    if not stat.S_ISDIR(metadata.st_mode):
        raise ImportFailure(f"asset directory is not a concrete directory: {path}")


def ensure_storage_tree(target: Path, *, create_target: bool) -> None:
    expected_target = CHARACTERS_ROOT / target.name
    if lexical_path(target) != lexical_path(expected_target):
        raise ImportFailure(f"unsafe non-canonical character target: {target}")

    directories = (ROOT / "public", ROOT / "public" / "assets", CHARACTERS_ROOT)
    for directory in directories:
        if os.path.lexists(directory):
            require_concrete_directory(directory)
        elif create_target:
            directory.mkdir()
            require_concrete_directory(directory)

    if os.path.lexists(target):
        require_concrete_directory(target)
    elif create_target:
        target.mkdir()
        require_concrete_directory(target)


def require_regular_file(path: Path, parent: Path, *, allow_missing: bool) -> None:
    require_lexical_child(path, parent)
    if not os.path.lexists(path):
        if allow_missing:
            return
        raise ImportFailure(f"missing staged asset: {path.name}")
    if is_redirect(path):
        raise ImportFailure(f"redirected output file is not allowed: {path}")
    try:
        metadata = os.lstat(path)
    except OSError as error:
        raise ImportFailure(f"cannot validate asset file: {path}") from error
    if not stat.S_ISREG(metadata.st_mode):
        raise ImportFailure(f"asset output is not a regular file: {path}")


def target_directory(character: str) -> Path:
    if character not in SUPPORTED_CHARACTERS:
        raise ImportFailure(f"unsupported character: {character}")
    target = CHARACTERS_ROOT / character
    ensure_storage_tree(target, create_target=False)
    return target


def save_staged_outputs(staging: Path, outputs: dict[str, Image.Image]) -> None:
    for name, image in outputs.items():
        destination = staging / name
        try:
            image.save(destination, format="WEBP", quality=90, method=6)
            with Image.open(destination) as saved:
                saved.load()
                if saved.format != "WEBP" or saved.mode != "RGBA" or saved.size != image.size:
                    raise ImportFailure(f"failed to verify staged output: {name}")
        except ImportFailure:
            raise
        except (OSError, ValueError) as error:
            raise ImportFailure(f"failed to encode staged output: {name}") from error


def safe_remove_directory(path: Path, parent: Path) -> None:
    require_lexical_child(path, parent)
    if not os.path.lexists(path):
        return
    if is_redirect(path):
        if path.is_symlink():
            path.unlink()
        else:
            os.rmdir(path)
        return
    require_concrete_directory(path)
    shutil.rmtree(path)


def create_recovery_backup(target: Path) -> tuple[Path, dict[str, bytes | None]]:
    ensure_storage_tree(target, create_target=True)
    recovery = Path(
        tempfile.mkdtemp(prefix=f".{target.name}-recovery-", dir=CHARACTERS_ROOT)
    )
    require_lexical_child(recovery, CHARACTERS_ROOT)
    require_concrete_directory(recovery)
    originals: dict[str, bytes | None] = {}
    try:
        for name, _, _ in OUTPUTS:
            ensure_storage_tree(target, create_target=False)
            source = target / name
            require_regular_file(source, target, allow_missing=True)
            if not os.path.lexists(source):
                originals[name] = None
                continue
            original = source.read_bytes()
            originals[name] = original
            saved = recovery / name
            shutil.copy2(source, saved)
            require_regular_file(saved, recovery, allow_missing=False)
            if saved.read_bytes() != original:
                raise ImportFailure(f"failed to verify recovery backup: {name}")
        return recovery, originals
    except BaseException:
        safe_remove_directory(recovery, CHARACTERS_ROOT)
        raise


def outputs_match_originals(target: Path, originals: dict[str, bytes | None]) -> bool:
    try:
        ensure_storage_tree(target, create_target=False)
        for name, original in originals.items():
            destination = target / name
            require_regular_file(destination, target, allow_missing=True)
            if original is None:
                if os.path.lexists(destination):
                    return False
            elif not os.path.lexists(destination) or destination.read_bytes() != original:
                return False
    except (ImportFailure, OSError):
        return False
    return True


def restore_outputs(
    target: Path,
    recovery: Path,
    originals: dict[str, bytes | None],
) -> bool:
    for name, original in originals.items():
        restore_directory: Path | None = None
        try:
            ensure_storage_tree(target, create_target=False)
            destination = target / name
            require_regular_file(destination, target, allow_missing=True)
            if original is None:
                if os.path.lexists(destination):
                    destination.unlink()
                continue
            if os.path.lexists(destination) and destination.read_bytes() == original:
                continue

            saved = recovery / name
            require_regular_file(saved, recovery, allow_missing=False)
            restore_directory = Path(
                tempfile.mkdtemp(
                    prefix=f".{target.name}-restore-", dir=CHARACTERS_ROOT
                )
            )
            require_lexical_child(restore_directory, CHARACTERS_ROOT)
            require_concrete_directory(restore_directory)
            restore_file = restore_directory / name
            shutil.copy2(saved, restore_file)
            require_regular_file(restore_file, restore_directory, allow_missing=False)
            ensure_storage_tree(target, create_target=False)
            require_regular_file(destination, target, allow_missing=True)
            os.replace(restore_file, destination)
            ensure_storage_tree(target, create_target=False)
            require_regular_file(destination, target, allow_missing=False)
        except (ImportFailure, OSError):
            pass
        finally:
            if restore_directory is not None:
                try:
                    safe_remove_directory(restore_directory, CHARACTERS_ROOT)
                except (ImportFailure, OSError):
                    pass
    return outputs_match_originals(target, originals)


def replace_outputs(target: Path, staging: Path) -> None:
    target_existed = os.path.lexists(target)
    recovery, originals = create_recovery_backup(target)
    try:
        for name, _, _ in OUTPUTS:
            ensure_storage_tree(target, create_target=False)
            require_concrete_directory(staging)
            source = staging / name
            destination = target / name
            require_regular_file(source, staging, allow_missing=False)
            require_regular_file(destination, target, allow_missing=True)
            os.replace(source, destination)
            ensure_storage_tree(target, create_target=False)
            require_regular_file(destination, target, allow_missing=False)
    except BaseException as forward_error:
        restored = restore_outputs(target, recovery, originals)
        if restored:
            safe_remove_directory(recovery, CHARACTERS_ROOT)
            if not target_existed:
                try:
                    target.rmdir()
                except OSError:
                    pass
            raise ImportFailure("replacement failed; original assets restored") from forward_error
        raise ImportFailure(
            f"replacement failed; restoration incomplete; "
            f"recovery backup retained at {recovery}"
        ) from forward_error
    else:
        safe_remove_directory(recovery, CHARACTERS_ROOT)


def cleanup_staging(staging: Path) -> None:
    try:
        safe_remove_directory(staging, CHARACTERS_ROOT)
    except (ImportFailure, OSError):
        if os.path.lexists(staging):
            raise ImportFailure(f"failed to clean staging directory: {staging}")


def import_sheet(character: str, source: Path) -> None:
    target = target_directory(character)
    sheet = load_sheet(source)
    outputs = {
        name: render_cell(sheet, index, size)
        for name, index, size in OUTPUTS
    }

    ensure_storage_tree(target, create_target=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{character}-staging-", dir=CHARACTERS_ROOT))
    require_lexical_child(staging, CHARACTERS_ROOT)
    require_concrete_directory(staging)
    try:
        save_staged_outputs(staging, outputs)
        replace_outputs(target, staging)
    finally:
        cleanup_staging(staging)


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
