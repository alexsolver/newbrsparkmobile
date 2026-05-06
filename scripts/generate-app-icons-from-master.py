#!/usr/bin/env python3
"""
Gera ícones Expo/Android/Live Activity a partir de um master 1024×1024 (RGB, sem alfa).

Uso:
  python3 scripts/generate-app-icons-from-master.py assets/icon-master-1024.png
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from collections import deque

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
LIVE = ASSETS / "liveActivity"


def edge_connected_dark_to_white_rgba(im: Image.Image, rgb_max_thr: int = 52) -> Image.Image:
    """
    Remove «matte» preto típico de ícones exportados com cantos rectos: inunda a partir das
    bordas e substitui por branco opaco tudo o que estiver ligado ao exterior com max(R,G,B)
    abaixo do limiar (não afecta o interior do símbolo, que não toca na borda da imagem).
    """
    arr = np.asarray(im.convert("RGBA")).copy()
    h, w = arr.shape[0], arr.shape[1]
    mx = np.maximum(np.maximum(arr[:, :, 0], arr[:, :, 1]), arr[:, :, 2])
    dark = mx < rgb_max_thr

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def try_push(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and dark[y, x] and not visited[y, x]:
            visited[y, x] = True
            q.append((y, x))

    for x in range(w):
        try_push(0, x)
        try_push(h - 1, x)
    for y in range(h):
        try_push(y, 0)
        try_push(y, w - 1)

    while q:
        y, x = q.popleft()
        arr[y, x] = (255, 255, 255, 255)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    return Image.fromarray(arr)


def load_rgb(path: Path) -> Image.Image:
    raw = Image.open(path).convert("RGBA")
    raw = edge_connected_dark_to_white_rgba(raw, rgb_max_thr=52)
    im = raw.convert("RGB")
    if im.size != (1024, 1024):
        im = ImageOps.fit(im, (1024, 1024), method=Image.Resampling.LANCZOS)
    return im


def white_to_transparent_rgb(im: Image.Image, thr: int = 248) -> Image.Image:
    arr = np.asarray(im.convert("RGB"), dtype=np.uint16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    white = (r > thr) & (g > thr) & (b > thr)
    rgba = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = arr.astype(np.uint8)
    rgba[:, :, 3] = np.where(white, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba)


def monochrome_silhouette(im_rgb: Image.Image, thr: int = 245) -> Image.Image:
    """Camada Android themed: silhueta preta sobre transparente."""
    arr = np.asarray(im_rgb, dtype=np.uint16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    white = (r > thr) & (g > thr) & (b > thr)
    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    out[:, :, 0] = 0
    out[:, :, 1] = 0
    out[:, :, 2] = 0
    out[:, :, 3] = np.where(white, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def solid_white(size: int = 1024) -> Image.Image:
    return Image.new("RGB", (size, size), (255, 255, 255))


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python3 scripts/generate-app-icons-from-master.py <master.png>", file=sys.stderr)
        return 1
    master_path = Path(sys.argv[1]).expanduser().resolve()
    if not master_path.is_file():
        print(f"Ficheiro não encontrado: {master_path}", file=sys.stderr)
        return 1

    LIVE.mkdir(parents=True, exist_ok=True)
    master = load_rgb(master_path)

    canon_master = (ASSETS / "icon-master-1024.png").resolve()
    if master_path.resolve() == canon_master:
        master.save(canon_master, "PNG", optimize=True)

    # App Store / Expo principal + splash (sem transparência)
    master.save(ASSETS / "icon.png", "PNG", optimize=True)
    master.save(ASSETS / "splash-icon.png", "PNG", optimize=True)

    # Android adaptive: primeiro plano = arte completa; fundo branco sólido
    master.save(ASSETS / "android-icon-foreground.png", "PNG", optimize=True)
    solid_white(1024).save(ASSETS / "android-icon-background.png", "PNG", optimize=True)
    monochrome_silhouette(master).save(ASSETS / "android-icon-monochrome.png", "PNG", optimize=True)

    # Live Activity: mesma marca, fundo transparente, 360 px (nítido em @2x/@3x)
    badge = white_to_transparent_rgb(master, thr=248)
    badge = badge.resize((360, 360), Image.Resampling.LANCZOS)
    badge.save(LIVE / "aria-badge.png", "PNG", optimize=True)

    # Favicon web
    fav = master.resize((48, 48), Image.Resampling.LANCZOS)
    fav.save(ASSETS / "favicon.png", "PNG", optimize=True)

    print("Gerado:")
    for rel in (
        "assets/icon.png",
        "assets/splash-icon.png",
        "assets/android-icon-foreground.png",
        "assets/android-icon-background.png",
        "assets/android-icon-monochrome.png",
        "assets/liveActivity/aria-badge.png",
        "assets/favicon.png",
    ):
        print(f"  {ROOT / rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
