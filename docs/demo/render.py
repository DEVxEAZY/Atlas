#!/usr/bin/env python3
"""Render the editable launch SVGs with local Chromium and ffmpeg; no network.

Usage: python3 docs/demo/render.py --chrome /path/to/chrome-headless-shell
Requires Python 3 + Pillow, Chromium, ffmpeg, and DejaVu Sans / Sans Mono.
The same tool/font versions produce byte-identical outputs. See README.md.
"""

import argparse
import hashlib
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

SOURCE = Path(__file__).resolve().parent
DOCS = SOURCE.parent
SCENES = [
    ("01-running.svg", 3),
    ("02-detach.svg", 2.5),
    ("03-elsewhere.svg", 2.5),
    ("04-hub.svg", 3),
    ("05-preview.svg", 4.5),
    ("06-reenter.svg", 3.5),
    ("07-repository.svg", 3),
]


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def render(chrome, source, target, profile):
    root = ET.parse(source).getroot()
    width, height = int(root.attrib["width"]), int(root.attrib["height"])
    run(chrome, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--disable-lcd-text",
        "--font-render-hinting=none", "--no-first-run",
        "--run-all-compositor-stages-before-draw",
        "--user-data-dir=" + str(profile),
        f"--window-size={width},{height}", "--screenshot=" + str(target),
        source.as_uri())
    with Image.open(target) as image:
        assert image.size == (width, height), (source, image.size)
        image.convert("RGB").save(target, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=shutil.which("chromium") or shutil.which("google-chrome"))
    parser.add_argument("--inspect-dir", type=Path, help="Keep rendered PNGs for inspection")
    args = parser.parse_args()
    if not args.chrome:
        parser.error("Pass --chrome /path/to/chromium or chrome-headless-shell")
    for source in [DOCS / "atlas-hub.svg", DOCS / "social-preview.svg", *SOURCE.glob("*.svg")]:
        ET.parse(source)
    with tempfile.TemporaryDirectory(prefix="atlas-launch-render-") as temporary:
        scratch = Path(temporary)
        render(args.chrome, DOCS / "social-preview.svg", DOCS / "social-preview.png", scratch / "profile")
        render(args.chrome, DOCS / "atlas-hub.svg", scratch / "atlas-hub.png", scratch / "profile")
        frame = 0
        for name, duration in SCENES:
            raster = scratch / (Path(name).stem + ".png")
            render(args.chrome, SOURCE / name, raster, scratch / "profile")
            for _ in range(int(duration * 2)):
                (scratch / f"frame-{frame:03}.png").symlink_to(raster)
                frame += 1
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-framerate", "2", "-i", str(scratch / "frame-%03d.png"),
            "-filter_complex",
            "split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];"
            "[b][p]paletteuse=dither=none",
            "-frames:v", str(frame), "-loop", "0", str(DOCS / "atlas-demo.gif"))
        if args.inspect_dir:
            args.inspect_dir.mkdir(parents=True, exist_ok=True)
            for raster in scratch.glob("*.png"):
                if not raster.is_symlink():
                    shutil.copy2(raster, args.inspect_dir / raster.name)
    assert (DOCS / "social-preview.png").stat().st_size < 1_000_000
    assert (DOCS / "atlas-demo.gif").stat().st_size <= 8 * 1024 * 1024
    with Image.open(DOCS / "atlas-demo.gif") as gif:
        assert gif.is_animated and gif.size == (1100, 700)
        assert gif.info["loop"] == 0
        duration_ms = 0
        for i in range(gif.n_frames):
            gif.seek(i)
            duration_ms += gif.info["duration"]
        assert duration_ms == 22_000, duration_ms
        print(f"GIF: {gif.size}, {gif.n_frames} frames, {duration_ms / 1000:g}s, infinite loop")
    for name in ["social-preview.png", "atlas-demo.gif"]:
        data = (DOCS / name).read_bytes()
        print(f"{name}: {len(data)} bytes; sha256 {hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
