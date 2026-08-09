from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = PROJECT_ROOT / "scripts" / "import-player-character-sheet.py"
SHEET_SIZE = (2048, 1024)
CELL_SIZE = 512
CELL_INSET = 24
CHARACTER_IDS = ("cloud-courier", "star-alchemist")
STATES = ("idle", "focus", "attack", "hit", "win", "loss")
OUTPUT_NAMES = ("full.webp", *(f"portrait-{state}.webp" for state in STATES))
CELL_COLORS = (
    (240, 70, 80, 255),
    (60, 170, 245, 255),
    (245, 190, 45, 255),
    (125, 85, 220, 255),
    (45, 200, 135, 255),
    (235, 100, 180, 255),
    (110, 125, 145, 255),
)


def install_script(root: Path) -> Path:
    destination = root / "scripts" / SOURCE_SCRIPT.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if SOURCE_SCRIPT.exists():
        shutil.copy2(SOURCE_SCRIPT, destination)
    return destination


def draw_sheet(
    path: Path,
    *,
    mode: str = "RGBA",
    size: tuple[int, int] = SHEET_SIZE,
    near_empty_cell: int | None = None,
    mark_size: int | None = None,
    low_alpha_noise: bool = False,
) -> None:
    if mode == "RGBA":
        background = (0, 0, 0, 0)
    elif mode == "LA":
        background = (0, 0)
    else:
        background = (0, 0, 0)
    image = Image.new(mode, size, background)
    draw = ImageDraw.Draw(image)
    for index, rgba in enumerate(CELL_COLORS):
        column = index % 4
        row = index // 4
        horizontal_padding = 112 if index == 0 else 16
        left = column * CELL_SIZE + CELL_INSET + horizontal_padding
        top = row * CELL_SIZE + CELL_INSET + 16
        right = (column + 1) * CELL_SIZE - CELL_INSET - horizontal_padding
        bottom = (row + 1) * CELL_SIZE - CELL_INSET - 16
        if mode == "RGBA":
            color = rgba
        elif mode == "LA":
            color = (rgba[0], rgba[3])
        else:
            color = rgba[:3]
        if index == near_empty_cell:
            draw.point(((left + right) // 2, (top + bottom) // 2), fill=color)
        elif mark_size is not None:
            center_x = (left + right) // 2
            center_y = (top + bottom) // 2
            half = mark_size // 2
            draw.rectangle(
                (center_x - half, center_y - half, center_x - half + mark_size - 1,
                 center_y - half + mark_size - 1),
                fill=color,
            )
        else:
            draw.rounded_rectangle((left, top, right, bottom), radius=48, fill=color)
        if low_alpha_noise:
            if mode != "RGBA":
                raise ValueError("low-alpha noise requires RGBA")
            cell_left = column * CELL_SIZE + CELL_INSET + 1
            cell_top = row * CELL_SIZE + CELL_INSET + 1
            cell_right = (column + 1) * CELL_SIZE - CELL_INSET - 2
            cell_bottom = (row + 1) * CELL_SIZE - CELL_INSET - 2
            draw.point((cell_left, cell_top), fill=(255, 255, 255, 1))
            draw.point((cell_right, cell_bottom), fill=(255, 255, 255, 1))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


def run_cli(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    script = install_script(root)
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )


def load_importer(root: Path):
    script = install_script(root)
    module_name = f"te_ppu_importer_{id(root)}"
    spec = importlib.util.spec_from_file_location(module_name, script)
    if spec is None or spec.loader is None:
        raise AssertionError("failed to load importer module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def create_directory_redirect(link: Path, target: Path) -> None:
    if os.name == "nt":
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise AssertionError(result.stderr or result.stdout)
    else:
        link.symlink_to(target, target_is_directory=True)


def remove_directory_redirect(link: Path) -> None:
    if not os.path.lexists(link):
        return
    if os.name == "nt":
        os.rmdir(link)
    else:
        link.unlink()


def write_existing_outputs(target: Path) -> dict[str, bytes]:
    target.mkdir(parents=True, exist_ok=True)
    originals = {}
    for index, name in enumerate(OUTPUT_NAMES):
        content = f"original-{index}-{name}".encode("ascii")
        originals[name] = content
        (target / name).write_bytes(content)
    return originals


def thresholded_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()


class ImportPlayerCharacterSheetTest(unittest.TestCase):
    def test_imports_each_supported_character_from_fixed_4x2_geometry(self) -> None:
        for character_id in CHARACTER_IDS:
            with self.subTest(character_id=character_id), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "source.png"
                draw_sheet(source)
                untouched = root / "public" / "assets" / "characters" / "hero-engineer" / "sentinel.bin"
                untouched.parent.mkdir(parents=True)
                untouched.write_bytes(b"untouched-player")

                result = run_cli(
                    root,
                    "--character", character_id,
                    "--source", str(source),
                )

                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(untouched.read_bytes(), b"untouched-player")
                target = root / "public" / "assets" / "characters" / character_id
                self.assertEqual(sorted(path.name for path in target.iterdir()), sorted(OUTPUT_NAMES))
                for index, name in enumerate(OUTPUT_NAMES):
                    with Image.open(target / name) as image:
                        expected_size = (1024, 1024) if name == "full.webp" else (256, 256)
                        self.assertEqual(image.format, "WEBP")
                        self.assertEqual(image.mode, "RGBA")
                        self.assertEqual(image.size, expected_size)
                        self.assertEqual(image.getpixel((0, 0))[3], 0)
                        if name == "full.webp":
                            bounds = image.getchannel("A").getbbox()
                            self.assertIsNotNone(bounds)
                            assert bounds is not None
                            width = bounds[2] - bounds[0]
                            height = bounds[3] - bounds[1]
                            self.assertGreaterEqual(max(width, height), 880)
                            self.assertLessEqual(max(width, height), 920)
                            self.assertGreater(bounds[0], 0)
                            self.assertGreater(bounds[1], 0)
                            self.assertLess(bounds[2], image.width)
                            self.assertLess(bounds[3], image.height)
                            self.assertLessEqual(abs((bounds[0] + bounds[2]) - image.width), 4)
                            self.assertLessEqual(abs((bounds[1] + bounds[3]) - image.height), 4)
                            self.assertAlmostEqual(width / height, 241 / 433, delta=0.03)
                        actual = image.getpixel((image.width // 2, image.height // 2))
                        for channel, expected in zip(actual[:3], CELL_COLORS[index][:3]):
                            self.assertLessEqual(abs(channel - expected), 20)

    def test_rejects_non_image_and_missing_alpha_sources_without_output(self) -> None:
        cases = (
            ("not-image", lambda path: path.write_text("not an image", encoding="utf-8"), r"image"),
            ("rgb", lambda path: draw_sheet(path, mode="RGB"), r"RGBA"),
            ("la", lambda path: draw_sheet(path, mode="LA"), r"RGBA"),
        )
        for label, write_source, expected_error in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "source.png"
                write_source(source)

                result = run_cli(
                    root,
                    "--character", "cloud-courier",
                    "--source", str(source),
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertRegex(result.stderr, expected_error)
                self.assertFalse((root / "public" / "assets" / "characters" / "cloud-courier").exists())

    def test_rejects_target_directory_redirect_before_touching_another_character(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source)
            characters = root / "public" / "assets" / "characters"
            hero = characters / "hero-engineer"
            originals = write_existing_outputs(hero)
            redirected_target = characters / "cloud-courier"
            create_directory_redirect(redirected_target, hero)
            try:
                result = run_cli(
                    root,
                    "--character", "cloud-courier",
                    "--source", str(source),
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertRegex(result.stderr, r"redirect|reparse|junction|symlink")
                self.assertEqual(
                    {name: (hero / name).read_bytes() for name in OUTPUT_NAMES},
                    originals,
                )
            finally:
                remove_directory_redirect(redirected_target)

    def test_rejects_redirected_characters_root_before_writing_outside_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source)
            assets = root / "public" / "assets"
            assets.mkdir(parents=True)
            redirected_root = root / "redirected-characters"
            redirected_root.mkdir()
            characters = assets / "characters"
            create_directory_redirect(characters, redirected_root)
            try:
                result = run_cli(
                    root,
                    "--character", "star-alchemist",
                    "--source", str(source),
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertRegex(result.stderr, r"redirect|reparse|junction|symlink")
                self.assertFalse((redirected_root / "star-alchemist").exists())
            finally:
                remove_directory_redirect(characters)

    def test_rejects_unsupported_and_path_traversal_character_ids(self) -> None:
        for character_id in ("hero-engineer", "../escaped-character"):
            with self.subTest(character_id=character_id), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "source.png"
                draw_sheet(source)

                result = run_cli(
                    root,
                    "--character", character_id,
                    "--source", str(source),
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertRegex(result.stderr, r"unsupported character")
                self.assertFalse((root / "public" / "assets" / "characters" / "escaped-character").exists())

    def test_rejects_sheet_dimensions_outside_the_fixed_4x2_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source, size=(2047, 1024))

            result = run_cli(
                root,
                "--character", "cloud-courier",
                "--source", str(source),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertRegex(result.stderr, r"4x2|2048x1024|geometry")
            self.assertFalse((root / "public" / "assets" / "characters" / "cloud-courier").exists())

    def test_validates_all_seven_used_cells_before_any_output_is_replaced(self) -> None:
        for near_empty_cell in range(7):
            with self.subTest(cell=near_empty_cell), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "source.png"
                draw_sheet(source, near_empty_cell=near_empty_cell)
                target = root / "public" / "assets" / "characters" / "star-alchemist"
                target.mkdir(parents=True)
                sentinels = {}
                for index, name in enumerate(OUTPUT_NAMES):
                    sentinel = f"sentinel-{index}".encode("ascii")
                    sentinels[name] = sentinel
                    (target / name).write_bytes(sentinel)

                result = run_cli(
                    root,
                    "--character", "star-alchemist",
                    "--source", str(source),
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertRegex(result.stderr, r"near-empty")
                self.assertEqual(
                    {name: (target / name).read_bytes() for name in OUTPUT_NAMES},
                    sentinels,
                )

    def test_rejects_exactly_eight_by_eight_marks_in_every_used_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source, mark_size=8)

            result = run_cli(
                root,
                "--character", "cloud-courier",
                "--source", str(source),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertRegex(result.stderr, r"near-empty|minimum visible")
            self.assertFalse((root / "public" / "assets" / "characters" / "cloud-courier").exists())

    def test_low_alpha_noise_does_not_expand_the_visible_crop(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source, low_alpha_noise=True)

            result = run_cli(
                root,
                "--character", "cloud-courier",
                "--source", str(source),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            with Image.open(root / "public" / "assets" / "characters" / "cloud-courier" / "full.webp") as image:
                bounds = thresholded_bounds(image)
                self.assertIsNotNone(bounds)
                assert bounds is not None
                width = bounds[2] - bounds[0]
                height = bounds[3] - bounds[1]
                self.assertGreaterEqual(max(width, height), 880)
                self.assertLessEqual(max(width, height), 920)
                self.assertLessEqual(abs((bounds[0] + bounds[2]) - image.width), 4)
                self.assertLessEqual(abs((bounds[1] + bounds[3]) - image.height), 4)
                self.assertAlmostEqual(width / height, 241 / 433, delta=0.03)

    def test_forward_replace_failure_restores_all_existing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source)
            target = root / "public" / "assets" / "characters" / "star-alchemist"
            originals = write_existing_outputs(target)
            importer = load_importer(root)
            real_replace = importer.os.replace

            def fail_forward(source_path, destination_path):
                source_candidate = Path(source_path)
                if "staging" in source_candidate.parent.name and source_candidate.name == "portrait-focus.webp":
                    raise OSError("injected forward replacement failure")
                return real_replace(source_path, destination_path)

            with patch.object(importer.os, "replace", side_effect=fail_forward):
                with self.assertRaisesRegex(importer.ImportFailure, r"original assets restored"):
                    importer.import_sheet("star-alchemist", source)

            self.assertEqual(
                {name: (target / name).read_bytes() for name in OUTPUT_NAMES},
                originals,
            )
            self.assertEqual(list(target.parent.glob(".star-alchemist-recovery-*")), [])
            self.assertEqual(list(target.parent.glob(".star-alchemist-staging-*")), [])

    def test_rollback_replace_failure_retains_complete_recovery_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source)
            target = root / "public" / "assets" / "characters" / "star-alchemist"
            originals = write_existing_outputs(target)
            importer = load_importer(root)
            real_replace = importer.os.replace

            def fail_forward_and_rollback(source_path, destination_path):
                source_candidate = Path(source_path)
                destination_candidate = Path(destination_path)
                if "staging" in source_candidate.parent.name and source_candidate.name == "portrait-focus.webp":
                    raise OSError("injected forward replacement failure")
                if (
                    ("restore" in source_candidate.parent.name or "backup" in source_candidate.parent.name)
                    and destination_candidate.name == "portrait-idle.webp"
                ):
                    raise OSError("injected rollback replacement failure")
                return real_replace(source_path, destination_path)

            with patch.object(importer.os, "replace", side_effect=fail_forward_and_rollback):
                with self.assertRaises(importer.ImportFailure) as caught:
                    importer.import_sheet("star-alchemist", source)

            message = str(caught.exception)
            match = re.search(r"recovery backup retained at (.+)$", message)
            self.assertIsNotNone(match, message)
            assert match is not None
            recovery = Path(match.group(1))
            self.assertTrue(recovery.is_dir())
            self.assertEqual(
                {name: (recovery / name).read_bytes() for name in OUTPUT_NAMES},
                originals,
            )
            self.assertEqual(list(target.parent.glob(".star-alchemist-staging-*")), [])

    def test_encode_failure_happens_before_replacement_and_cleans_staging(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            draw_sheet(source)
            target = root / "public" / "assets" / "characters" / "cloud-courier"
            originals = write_existing_outputs(target)
            importer = load_importer(root)

            with patch.object(importer.Image.Image, "save", side_effect=OSError("injected encode failure")):
                with self.assertRaisesRegex(importer.ImportFailure, r"encode|staged output"):
                    importer.import_sheet("cloud-courier", source)

            self.assertEqual(
                {name: (target / name).read_bytes() for name in OUTPUT_NAMES},
                originals,
            )
            self.assertEqual(list(target.parent.glob(".cloud-courier-staging-*")), [])
            self.assertEqual(list(target.parent.glob(".cloud-courier-recovery-*")), [])


if __name__ == "__main__":
    unittest.main()
