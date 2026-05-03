from __future__ import annotations

from pathlib import Path

from PIL import Image

PNG_SIZES = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256, 512]
ICO_SIZES = [
    (16, 16),
    (20, 20),
    (24, 24),
    (32, 32),
    (40, 40),
    (48, 48),
    (64, 64),
    (72, 72),
    (96, 96),
    (128, 128),
    (256, 256),
]


def _fit_square(image: Image.Image, size: int, resample: int) -> Image.Image:
    rgba = image.convert("RGBA")
    src_w, src_h = rgba.size
    if src_w <= 0 or src_h <= 0:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))

    scale = min(size / src_w, size / src_h)
    out_w = max(1, int(round(src_w * scale)))
    out_h = max(1, int(round(src_h * scale)))

    resized = rgba.resize((out_w, out_h), resample)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - out_w) // 2
    y = (size - out_h) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


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
        for size in PNG_SIZES:
            out = icons_dir / f"jadwaljaga-{size}.png"
            resized = _fit_square(image, size, resample)
            resized.save(out, format="PNG", optimize=True)

        ico_path = icons_dir / "jadwaljaga.ico"
        ico_source = _fit_square(image, 1024, resample)
        ico_source.save(ico_path, format="ICO", sizes=ICO_SIZES)

    print(f"Generated {len(PNG_SIZES)} PNG icons in: {icons_dir}")
    print(f"Generated multi-size ICO in: {icons_dir / 'jadwaljaga.ico'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
