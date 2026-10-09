"""从 frontend/assert/ 的完整组合标生成站点用的派生图（原件不动）。

产出（frontend/public/brand/，随 dist 部署）：
  logo-mark-<dark|light>.png     纯徽章（圆形肖像部分）→ 标头用，旁边仍是站点自己的排印文字
  logo-lockup-<dark|light>.png   完整组合标（徽章 + OmniNest + ATARRAYECHO）→ 想要整标时用

为什么不直接把整标塞进标头：它是 882×882 的方形整标，标头图框只有 22–30px 高，
里面的 "OmniNest" 会被压到 6px 左右——既读不出字，又和站点自己的 NESTSPACE 文字重复。
抠图必须**从四边泛洪**而不是全局阈值：浅色版的头发/皮肤本身就接近底色，全局阈值会在人脸上打出洞。

用法：python scripts/make-brand-logos.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "frontend"
SRC = ROOT / "assert"
OUT = ROOT / "public" / "brand"

TOL = 32            # 与底色的绝对色差和阈值：底色有轻微噪点（30,31,23 ↔ 31,32,23）
MIN_AREA = 80       # 小于此面积的连通块视为泛洪碎屑
MARK_HEIGHT = 128   # 标头 30px CSS × 最多 ~4 DPR
LOCKUP_HEIGHT = 320


def border_background_mask(arr: np.ndarray) -> np.ndarray:
    h, w, _ = arr.shape
    bg = arr[:4, :4].reshape(-1, 3).mean(axis=0)
    near = np.abs(arr.astype(int) - bg.astype(int)).sum(axis=2) < TOL
    seen = np.zeros_like(near)
    queue: deque[tuple[int, int]] = deque()

    def seed(y: int, x: int) -> None:
        if near[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))

    for x in range(w):
        seed(0, x)
        seed(h - 1, x)
    for y in range(h):
        seed(y, 0)
        seed(y, w - 1)
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def components(alpha: np.ndarray) -> list[np.ndarray]:
    """8 邻域连通块。整标里的字母彼此分离，所以"最大块"只有徽章。"""
    h, w = alpha.shape
    seen = np.zeros_like(alpha, dtype=bool)
    out: list[np.ndarray] = []
    for sy in range(h):
        for sx in range(w):
            if not alpha[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sy, sx)]
            seen[sy, sx] = True
            comp: list[tuple[int, int]] = []
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            mask = np.zeros_like(alpha, dtype=bool)
            for y, x in comp:
                mask[y, x] = True
            out.append(mask)
    return out


def keep(comp: np.ndarray, shape: tuple[int, ...]) -> bool:
    """够大、且不贴画布边缘（贴边的细长条是晕影/噪点，不是图案）。"""
    ys, xs = np.nonzero(comp)
    if len(ys) < MIN_AREA:
        return False
    h, w = shape[:2]
    return ys.min() > 0 and xs.min() > 0 and ys.max() < h - 1 and xs.max() < w - 1


def crop_to(img: Image.Image, mask: np.ndarray) -> Image.Image:
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    arr = np.array(img)
    sub = arr[y0:y1, x0:x1].copy()
    sub[~mask[y0:y1, x0:x1], 3] = 0
    return Image.fromarray(sub, "RGBA")


def save(img: Image.Image, path: Path, height: int) -> int:
    ratio = height / img.height
    img = img.resize((max(1, round(img.width * ratio)), height), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    return path.stat().st_size


OUT.mkdir(parents=True, exist_ok=True)
report = []
for theme in ("dark", "light"):
    src = SRC / f"logo_{theme}.png"
    rgb = np.array(Image.open(src).convert("RGB"))
    alpha = np.where(border_background_mask(rgb), 0, 255).astype("uint8")
    full = Image.fromarray(np.dstack([rgb, alpha]).astype("uint8"), "RGBA")

    comps = [c for c in components(alpha > 0) if keep(c, alpha.shape)]
    if not comps:
        raise SystemExit(f"{src.name}: 没识别到内容块，需要调 TOL/MIN_AREA")
    union = np.zeros_like(alpha, dtype=bool)
    for c in comps:
        union |= c
    biggest = max(comps, key=lambda c: int(c.sum()))

    lockup = crop_to(full, union)   # 徽章 + 两行文字（整标）
    mark = crop_to(full, biggest)   # 只有徽章（标头用）
    lockup_kb = save(lockup, OUT / f"logo-lockup-{theme}.png", LOCKUP_HEIGHT) / 1024
    mark_kb = save(mark, OUT / f"logo-mark-{theme}.png", MARK_HEIGHT) / 1024
    report.append(
        f"{theme}: 内容块 {len(comps)} 个 | mark {mark.size} {mark_kb:.1f}KB"
        f" | lockup {lockup.size} {lockup_kb:.1f}KB"
    )

# 视觉核对图：按真实标头尺寸贴到站点底色上（浏览器面板 0×0 时唯一能"看见"的办法）
for theme, base in (("dark", (26, 24, 20)), ("light", (232, 224, 203))):
    canvas = Image.new("RGB", (560, 96), base)
    mark = Image.open(OUT / f"logo-mark-{theme}.png").resize((30, 30), Image.LANCZOS)
    canvas.paste(mark, (16, 33), mark)
    lockup = Image.open(OUT / f"logo-lockup-{theme}.png").resize((76, 76), Image.LANCZOS)
    canvas.paste(lockup, (400, 10), lockup)
    canvas.save(SRC / f"preview-{theme}.png")

print("\n".join(report))
print("核对图: frontend/assert/preview-<dark|light>.png（左=30px 徽章，右=76px 整标）")
