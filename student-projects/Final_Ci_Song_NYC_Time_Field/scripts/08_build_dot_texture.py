"""Render the fixed, seamless dot texture used behind the glass interface."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "dot-grid.png"
TILE_SIZE = 64
DOT_CENTER = TILE_SIZE // 2
DOT_RADIUS = 1.8


def main() -> None:
    tile = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    draw.ellipse(
        (
            DOT_CENTER - DOT_RADIUS,
            DOT_CENTER - DOT_RADIUS,
            DOT_CENTER + DOT_RADIUS,
            DOT_CENTER + DOT_RADIUS,
        ),
        fill=(184, 186, 190, 72),
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tile.save(OUTPUT, optimize=True)
    print(f"Rendered {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
