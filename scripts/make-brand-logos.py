"""从 frontend/assert/ 的完整组合标生成站点用的派生图（原件不动）。

产出（frontend/public/brand/，随 dist 部署）：
  logo-mark-on-dark.png     纯徽章 → 标头用（深色主题），旁边仍是站点自己的排印文字
  logo-mark-on-light.png    纯徽章 → 标头用（浅色主题）
  logo-lockup-on-dark.png   完整组合标（徽章 + OmniNest + ATARRAYECHO）→ 深色主题
  logo-lockup-on-light.png  同上 → 浅色主题
  favicon.ico / apple-touch-icon.png   浏览器图标（同日生成；favicon 透明，iOS 图标带底）

**文件名按"用在哪种背景上"命名，不按原件的底色**——这是踩过一次的坑：
  assert/logo_light.png 是浅底 + 浅发人物，抠掉底色后主体是**浅色**，只适合深色背景；
  assert/logo_dark.png  是深底 + 深发人物，抠掉底色后主体是**深色**，只适合浅色背景。
早期按原件底色命名（logo-mark-dark = 深底那版）并直接把"dark"喂给深色主题，结果深色标头拿到
深发主体 → 头发与背景糊成一片、头像看着是破的。判定依据是"抠图后主体与背景的明暗关系"。

为什么不直接把整标塞进标头：它是 882×882 的方形整标，标头图框只有几十 px 高，
里面的 "OmniNest" 会被压到几 px——既读不出字，又和站点自己的 NESTSPACE 文字重复。
抠图必须**从四边泛洪**而不是全局阈值：浅色版的头发/皮肤本身就接近底色，全局阈值会在人脸上打出洞。

用法：python scripts/make-brand-logos.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "frontend"
SRC = ROOT / "assert"
OUT = ROOT / "public" / "brand"

TOL = 32            # 与底色的绝对色差和阈值：底色有轻微噪点（30,31,23 ↔ 31,32,23）
MIN_AREA = 80       # 小于此面积的连通块视为泛洪碎屑
MARK_HEIGHT = 160   # 标头 40px CSS × 最多 ~4 DPR
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

# 源件 → 目标背景：判定依据是"抠图后的主体明暗"，不是源件底色的名字（见文件头说明）
VARIANTS = (
    ("light", "on-dark", (26, 24, 20)),      # 浅底 + 浅发主体 → 深色背景
    ("dark", "on-light", (232, 224, 203)),   # 深底 + 深发主体 → 浅色背景
)

for src_theme, dest, _bg in VARIANTS:
    src = SRC / f"logo_{src_theme}.png"
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
    lockup_kb = save(lockup, OUT / f"logo-lockup-{dest}.png", LOCKUP_HEIGHT) / 1024
    mark_kb = save(mark, OUT / f"logo-mark-{dest}.png", MARK_HEIGHT) / 1024
    report.append(
        f"{src_theme} → {dest}: 内容块 {len(comps)} 个 | mark {mark.size} {mark_kb:.1f}KB"
        f" | lockup {lockup.size} {lockup_kb:.1f}KB"
    )

# ---- 浏览器图标 -------------------------------------------------------------
# favicon **带回底**，但底色做成**圆盘**而不是方块：素材本身就是圆形徽章，方形底在标签栏里
# 会显出一个突兀的方块（被明确否过），圆盘贴合同形状，浅色/深色标签栏上都能看清。
# 用深墨那版素材（logo-mark-on-light.png）——浅墨那版在浅色标签栏上几乎看不见。
# 素材是竖构图（圆盘上下还有装饰尖），只按高度贴合进正方形会显得小，
# 所以**居中取正方形**（保留圆盘、裁掉上下尖）再尽量铺满，主体才真正占满图标。
# apple-touch-icon 同样**不透明**（iOS 把透明区域按黑色渲染），满铺方形交给系统加圆角遮罩。
ICON_ART = "logo-mark-on-light.png"
ICON_GROUND = (232, 224, 203)   # 与站点浅底一致
ICON_ART_INSET = 0.94           # 圆盘底上主体占画布的比例（留一圈底边）


def _icon_art() -> Image.Image:
    art = Image.open(OUT / ICON_ART).convert("RGBA")
    side = min(art.size)
    left = (art.width - side) // 2
    top = (art.height - side) // 2
    return art.crop((left, top, left + side, top + side))


def build_icon(size: int) -> Image.Image:
    """带底 favicon：圆盘底 + 居中放大的徽章"""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, size - 1, size - 1), fill=ICON_GROUND + (255,))
    inner = max(1, round(size * ICON_ART_INSET))
    art = _icon_art().resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(art, (off, off), art)
    return canvas


build_icon(48).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
_touch_art = _icon_art().resize((180, 180), Image.LANCZOS)
_touch = Image.new("RGB", (180, 180), ICON_GROUND)
_touch.paste(_touch_art, (0, 0), _touch_art)
_touch.save(OUT / "apple-touch-icon.png", "PNG", optimize=True)

# 视觉核对图：贴到各自的目标底色上（浏览器面板 0×0 时唯一能"看见"的办法）。
# 尺寸给足：早先的 30px 缩略图在宽画布上会被预览器再缩一次，肉眼根本分不出好坏（踩过）。
for _src_theme, dest, bg in VARIANTS:
    canvas = Image.new("RGB", (720, 200), bg)
    mark = Image.open(OUT / f"logo-mark-{dest}.png")
    mark = mark.resize((120, round(120 * mark.height / mark.width)), Image.LANCZOS)
    canvas.paste(mark, (24, 40), mark)
    lockup = Image.open(OUT / f"logo-lockup-{dest}.png")
    lockup = lockup.resize((150, round(150 * lockup.height / lockup.width)), Image.LANCZOS)
    canvas.paste(lockup, (420, 25), lockup)
    ImageDraw.Draw(canvas).text(
        (200, 90), f"mark on {dest[3:]}\n(120px 徽章 / 150px 整标)", fill=(190, 60, 60)
    )
    canvas.save(SRC / f"preview-{dest}.png")

print("\n".join(report))
print("核对图: frontend/assert/preview-on-<dark|light>.png（左=120px 徽章，右=150px 整标）")
print("图标: frontend/public/brand/favicon.ico (16/32/48) + apple-touch-icon.png (180)")

