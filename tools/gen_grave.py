#!/usr/bin/env python3
"""Generate a pixel-art grave sprite: a small earth mound with a wooden cross.

Fits a grassy meadow far better than a stone slab. Light from the TOP-LEFT
(lit left/top, shadowed right), with a soft cast shadow on the ground and a
grassy rim so the mound blends into the turf. Four gentle variants.

Outputs:
  animation/graves.png        spritesheet (24*4 x 30, RGBA)
  tools/_graves_contact.png   magnified review sheet

Run from repo root:  python3 tools/gen_grave.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "animation", "graves.png")
CONTACT = os.path.join(ROOT, "tools", "_graves_contact.png")

W, H, N = 24, 30, 4

WOOD_HI = (170, 130, 82, 255)
WOOD_BASE = (138, 100, 60, 255)
WOOD_SH = (98, 68, 42, 255)
WOOD_LINE = (54, 38, 24, 255)
DIRT_HI = (134, 102, 68, 255)
DIRT_BASE = (106, 78, 50, 255)
DIRT_SH = (78, 56, 34, 255)
GRASS = (108, 182, 80, 255)
GRASS_D = (82, 150, 60, 255)
SHADOW = (30, 46, 32, 110)
CLEAR = (0, 0, 0, 0)


def build_variant(v, mound_ellipse):
    img = Image.new("RGBA", (W, H), CLEAR)
    px = img.load()

    lean = {0: 0, 1: 1, 2: 0, 3: -1}[v]
    top = {0: 3, 1: 3, 2: 4, 3: 5}[v]
    grassy = v == 2

    def post_x(y):
        return 11 + round(lean * (24 - y) / 21.0)

    # ---- cast shadow on the ground (offset lower-right) ----
    cx, cy, rx, ry = 14, 28, 9, 2
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and 0 <= x < W and 0 <= y < H:
                px[x, y] = SHADOW

    # ---- earth mound ----
    mcx, mcy, mrx, mry = mound_ellipse
    for y in range(mcy - mry, mcy + mry + 2):
        for x in range(mcx - mrx, mcx + mrx + 1):
            if not (0 <= x < W and 0 <= y < H):
                continue
            if ((x - mcx) / mrx) ** 2 + ((y - mcy) / mry) ** 2 <= 1:
                px[x, y] = DIRT_HI if y < mcy else (DIRT_SH if y > mcy + mry - 1 else DIRT_BASE)
    # grass rim on top of the mound
    for x in range(mcx - mrx, mcx + mrx + 1):
        yy = mcy - mry
        while yy < mcy and not (0 <= x < W and px[x, yy][3] > 0):
            yy += 1
        if 0 <= x < W and 0 <= yy < H and px[x, yy][3] > 0:
            if (x % 2 == 0) or grassy:
                px[x, yy] = GRASS if x % 3 else GRASS_D

    # ---- wooden cross ----
    wood = set()
    for y in range(top, 25):          # vertical post (2px)
        wood.add((post_x(y), y))
        wood.add((post_x(y) + 1, y))
    ay = top + 5                       # horizontal arm (2px tall)
    axc = post_x(ay)
    for x in range(axc - 5, axc + 7):
        wood.add((x, ay))
        wood.add((x, ay + 1))
    wood = {(x, y) for (x, y) in wood if 0 <= x < W and 0 <= y < H}

    # outline first, then shade
    for (x, y) in list(wood):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (nx, ny) not in wood and 0 <= nx < W and 0 <= ny < H:
                    if px[nx, ny][3] == 0 or px[nx, ny] == SHADOW:
                        px[nx, ny] = WOOD_LINE
    for (x, y) in wood:
        is_post = y >= ay + 2 or (x in (post_x(y), post_x(y) + 1) and not (ay <= y <= ay + 1))
        if is_post:
            c = WOOD_HI if x == post_x(y) else WOOD_SH
        else:  # arm
            c = WOOD_HI if y == ay else WOOD_SH
        px[x, y] = c

    return img


def build():
    mounds = {
        0: (12, 26, 9, 3),
        1: (12, 26, 10, 3),
        2: (12, 25, 10, 4),
        3: (12, 26, 8, 3),
    }
    variants = [build_variant(v, mounds[v]) for v in range(N)]
    sheet = Image.new("RGBA", (W * N, H), CLEAR)
    for i, img in enumerate(variants):
        sheet.alpha_composite(img, (i * W, 0))
    sheet.save(OUT)

    scale, pad = 9, 6
    contact = Image.new("RGBA", (N * (W * scale + pad) + pad, H * scale + 2 * pad), (95, 150, 80, 255))
    for i, img in enumerate(variants):
        contact.alpha_composite(img.resize((W * scale, H * scale), Image.NEAREST), (pad + i * (W * scale + pad), pad))
    contact.save(CONTACT)
    print(f"wrote {OUT} ({W*N}x{H}, {N} variants)")
    print(f"wrote {CONTACT}")


if __name__ == "__main__":
    build()
