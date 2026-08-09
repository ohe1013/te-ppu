from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = PROJECT_ROOT / "scripts" / "generate-authored-assets.py"
CHARACTER_IDS = ("cloud-courier", "star-alchemist")
STATES = ("idle", "focus", "attack", "hit", "win", "loss")


def install_generator(root: Path) -> Path:
    destination = root / "scripts" / SOURCE_SCRIPT.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_SCRIPT, destination)
    return destination


def write_full_art(path: Path, color: tuple[int, int, int, int]) -> None:
    image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((220, 90, 804, 960), radius=160, fill=color)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", lossless=True)


def write_portrait(path: Path, color: tuple[int, int, int, int]) -> bytes:
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((24, 20, 232, 244), fill=color)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", lossless=True)
    return path.read_bytes()


def prepare_players(root: Path, states: tuple[str, ...]) -> dict[tuple[str, str], bytes]:
    sentinels = {}
    colors = {
        "cloud-courier": (65, 145, 245, 255),
        "star-alchemist": (145, 85, 220, 255),
    }
    for character_id in CHARACTER_IDS:
        directory = root / "public" / "assets" / "characters" / character_id
        write_full_art(directory / "full.webp", colors[character_id])
        for index, state in enumerate(states):
            color = (220 - index * 12, 55 + index * 15, 95 + index * 9, 255)
            sentinels[(character_id, state)] = write_portrait(
                directory / f"portrait-{state}.webp",
                color,
            )
    return sentinels


def run_generator(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    script = install_generator(root)
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )


class GenerateAuthoredAssetsTest(unittest.TestCase):
    def test_default_preserves_imported_portraits_and_derives_only_missing_states(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sentinels = prepare_players(root, ("idle",))

            result = run_generator(root)

            self.assertEqual(result.returncode, 0, result.stderr)
            for character_id in CHARACTER_IDS:
                character = root / "public" / "assets" / "characters" / character_id
                self.assertEqual(
                    (character / "portrait-idle.webp").read_bytes(),
                    sentinels[(character_id, "idle")],
                )
                for state in STATES[1:]:
                    path = character / f"portrait-{state}.webp"
                    self.assertTrue(path.is_file(), f"missing derived portrait {path}")
                    with Image.open(path) as image:
                        self.assertEqual(image.size, (256, 256))
                        self.assertEqual(image.mode, "RGBA")

    def test_force_derived_portraits_is_the_only_mode_that_replaces_existing_states(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sentinels = prepare_players(root, STATES)

            result = run_generator(root, "--force-derived-portraits")

            self.assertEqual(result.returncode, 0, result.stderr)
            for character_id in CHARACTER_IDS:
                character = root / "public" / "assets" / "characters" / character_id
                for state in STATES:
                    path = character / f"portrait-{state}.webp"
                    self.assertNotEqual(path.read_bytes(), sentinels[(character_id, state)])
                    with Image.open(path) as image:
                        self.assertEqual(image.size, (256, 256))
                        self.assertEqual(image.mode, "RGBA")


if __name__ == "__main__":
    unittest.main()
