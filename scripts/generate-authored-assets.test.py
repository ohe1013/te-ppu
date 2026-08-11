from __future__ import annotations

import importlib.util
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


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_authored_assets", SOURCE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load generator from {SOURCE_SCRIPT}")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    return generator


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
    def test_portrait_frames_cover_every_character_with_normalized_values(self) -> None:
        generator = load_generator()

        self.assertEqual(set(generator.PORTRAIT_FRAMES), set(generator.PORTRAITS))
        for center_x, center_y, size_fraction in generator.PORTRAIT_FRAMES.values():
            self.assertGreaterEqual(center_x, 0)
            self.assertLessEqual(center_x, 1)
            self.assertGreaterEqual(center_y, 0)
            self.assertLessEqual(center_y, 1)
            self.assertGreater(size_fraction, 0)
            self.assertLessEqual(size_fraction, 1)

    def test_portrait_crop_box_supports_an_off_center_frame(self) -> None:
        generator = load_generator()

        self.assertEqual(
            generator.portrait_crop_box((100, 200, 900, 1200), (0.75, 0.30, 0.50)),
            (500, 300, 900, 700),
        )

    def test_hit_effect_keeps_the_face_safe_zone_clear(self) -> None:
        generator = load_generator()
        transparent_portrait = Image.new("RGBA", (256, 256), (0, 0, 0, 0))

        hit_effect = generator.overlay_state(
            transparent_portrait,
            "hit",
            "cloud-courier",
        ).getchannel("A")

        self.assertIsNone(hit_effect.crop((0, 0, 256, 168)).getbbox())
        self.assertIsNotNone(hit_effect.crop((0, 168, 256, 256)).getbbox())

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
                        alpha_bbox = image.getchannel("A").getbbox()
                        self.assertIsNotNone(alpha_bbox)
                        assert alpha_bbox is not None
                        self.assertGreaterEqual(alpha_bbox[0], 8)
                        self.assertGreaterEqual(alpha_bbox[1], 8)
                        self.assertLessEqual(alpha_bbox[2], 248)
                        self.assertLessEqual(alpha_bbox[3], 248)

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
                        alpha_bbox = image.getchannel("A").getbbox()
                        self.assertIsNotNone(alpha_bbox)
                        assert alpha_bbox is not None
                        self.assertGreaterEqual(alpha_bbox[0], 8)
                        self.assertGreaterEqual(alpha_bbox[1], 8)
                        self.assertLessEqual(alpha_bbox[2], 248)
                        self.assertLessEqual(alpha_bbox[3], 248)


if __name__ == "__main__":
    unittest.main()
