from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

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


def draw_sheet(path: Path, *, mode: str = "RGBA", size: tuple[int, int] = SHEET_SIZE,
               near_empty_cell: int | None = None) -> None:
    background = (0, 0, 0, 0) if mode == "RGBA" else (0, 0, 0)
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
        color = rgba if mode == "RGBA" else rgba[:3]
        if index == near_empty_cell:
            draw.point(((left + right) // 2, (top + bottom) // 2), fill=color)
        else:
            draw.rounded_rectangle((left, top, right, bottom), radius=48, fill=color)
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
            ("rgb", lambda path: draw_sheet(path, mode="RGB"), r"alpha"),
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


if __name__ == "__main__":
    unittest.main()
