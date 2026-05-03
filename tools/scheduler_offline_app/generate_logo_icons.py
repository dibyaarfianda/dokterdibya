from __future__ import annotations

from pathlib import Path

from PIL import Image

PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> int:
    base_dir = Path(__file__).resolve().parent
    source_path = base_dir / "assets" / "jadwaljaga.png"
    icons_dir = base_dir / "assets" / "icons"

    if not source_path.exists():
        print(f"ERROR: Source logo not found: {source_path}")
        return 1

    icons_dir.mkdir(parents=True, exist_ok=True)

    resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS

    with Image.open(source_path) as image:
        rgba = image.convert("RGBA")

        for size in PNG_SIZES:
            out = icons_dir / f"jadwaljaga-{size}.png"
            resized = rgba.resize((size, size), resample)
            resized.save(out, format="PNG", optimize=True)

        ico_path = icons_dir / "jadwaljaga.ico"
        rgba.save(ico_path, format="ICO", sizes=ICO_SIZES)

    print(f"Generated {len(PNG_SIZES)} PNG icons in: {icons_dir}")
    print(f"Generated multi-size ICO in: {icons_dir / 'jadwaljaga.ico'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
