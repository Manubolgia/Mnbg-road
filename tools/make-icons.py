#!/usr/bin/env python3
"""Rasterise web/icons/icon.svg to the PNG sizes the manifest asks for.

The mark is made only of axis-aligned rectangles, so a tiny rasteriser with
4x supersampling is enough and keeps the repo free of image dependencies.
Run from the repo root:  python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

BG = (0x16, 0x18, 0x1D)
RAIL = (0x2E, 0x6F, 0x8E)
PAPER = (0xF3, 0xF1, 0xEC)
ACCENT = (0xE2, 0x45, 0x2F)

# (x, y, w, h, colour) in the 512x512 design grid, painted in order.
RECTS = [
    (96, 249, 167, 14, RAIL),
    (249, 249, 14, 167, RAIL),
    (118, 216, 16, 80, RAIL),
    (158, 216, 16, 80, RAIL),
    (198, 216, 16, 80, RAIL),
    (216, 298, 80, 16, RAIL),
    (216, 338, 80, 16, RAIL),
    (216, 378, 80, 16, RAIL),
    (228, 96, 56, 188, PAPER),
    (228, 228, 188, 56, PAPER),
    (221, 221, 70, 70, ACCENT),
]

DESIGN = 512
SS = 4  # supersampling factor


def render(size: int) -> bytes:
    hi = size * SS
    scale = hi / DESIGN
    row = [BG] * hi
    pixels = [list(row) for _ in range(hi)]

    for x, y, w, h, colour in RECTS:
        x0, y0 = round(x * scale), round(y * scale)
        x1, y1 = round((x + w) * scale), round((y + h) * scale)
        for py in range(max(0, y0), min(hi, y1)):
            line = pixels[py]
            for px in range(max(0, x0), min(hi, x1)):
                line[px] = colour

    # box-filter down to the requested size
    out = bytearray()
    area = SS * SS
    for y in range(size):
        out.append(0)  # PNG filter: none
        for x in range(size):
            r = g = b = 0
            for dy in range(SS):
                line = pixels[y * SS + dy]
                for dx in range(SS):
                    c = line[x * SS + dx]
                    r += c[0]
                    g += c[1]
                    b += c[2]
            out += bytes((r // area, g // area, b // area))
    return bytes(out)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


def write_png(path: Path, size: int) -> None:
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(render(size), 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)
    print(f'{path}  {len(png)} bytes')


if __name__ == '__main__':
    out_dir = Path(__file__).resolve().parent.parent / 'web' / 'icons'
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (192, 512, 180):
        write_png(out_dir / f'icon-{size}.png', size)
