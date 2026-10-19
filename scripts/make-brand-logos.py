"""从 frontend/design/Logo.png 生成站点用的派生图（原件不动）。

产出（frontend/public/brand/，随 dist 部署）：
  logo-mark.png          徽章 → 标头用（40px CSS × 最多 ~4 DPR = 160px 高）
  logo-banner.png        横版整标（design/Logo horizontal scroll.png 裁白边）→ 只给 README / 文档当头图
  favicon.ico            16/32/48，带回底圆盘
  apple-touch-icon.png   180，不透明满铺（iOS 把透明区域按黑色渲染）

**2026-10-19 起只有一版**：不再按深浅主题各出一张（旧的 logo-mark-on-{dark,light}.png 与
logo-lockup-on-{dark,light}.png 已删）。判据仍然是"抠图后的主体与背景的明暗关系"——新素材是
浅发 + 深色衣着，两种主题底上都立得住，所以一张够用；但**浏览器图标自带底板**（圆盘底），
因为标签栏的深浅不由我们控制。含字标的整标（design/Logo horizontal scroll.png）只留作原件：
它的字标是深墨色，放进深色主题的标头会直接看不见，而标头本来就有站点自己的排印文字。

抠图必须**从四边泛洪**而不是全局阈值：头发的浅色本身就接近底色，全局阈值会在人脸上打出洞。
另外新素材的透明被压平成了棋盘格（PNG 没有 alpha 通道），所以底色按"与四边均色的色差"判定，
棋盘的两档（约 246 / 约 252）都落在容差里、会被一起泛洪掉；被主体包住的棋盘残屑是独立小块，
由"只取最大连通块"（subject_mask）一并丢掉。

用法：python scripts/make-brand-logos.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "frontend"
SRC = ROOT / "design"
OUT = ROOT / "public" / "brand"

SOURCE = SRC / "Logo.png"
TOL = 70            # 与底色的三通道色差之和：棋盘两档之差约 18，头发主体约 150
MARK_HEIGHT = 160   # 标头 40px CSS × 最多 ~4 DPR
ICON_SIZE = 180
ICON_ART_INSET = 0.94  # 圆盘底上主体占画布的比例（留一圈底边）
# 图标底板用深墨：新主体是浅色头发，浅底会把头发与背景糊成一片（按 preview.png 目测定的）
ICON_GROUND = (26, 24, 20)


def border_background_mask(arr: np.ndarray) -> np.ndarray:
    """从四条边泛洪"接近底色"的像素；返回 True = 背景。

    底色用**边框像素的中位数**，不是均值：这张图的下边压着深色的衣服，均值会被拖成中灰，
    于是泛洪几乎什么都抠不掉（实测只剩 0.6% 背景）。三条边以底色为主时中位数仍落在底色上。
    """
    h, w, _ = arr.shape
    border = np.concatenate(
        [
            arr[:4, :].reshape(-1, 3),
            arr[-4:, :].reshape(-1, 3),
            arr[:, :4].reshape(-1, 3),
            arr[:, -4:].reshape(-1, 3),
        ]
    )
    bg = np.median(border, axis=0)
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
    """8 邻域连通块。贴边的晕影与棋盘残屑都是独立小块，靠这个筛掉。"""
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


def subject_mask(alpha: np.ndarray) -> np.ndarray:
    """只保留**最大连通块** = 人物主体。

    新素材是通体相连、且贴着画布底边的半身像，旧脚本那条"贴边的块视为晕影"的规则会把主体
    整个丢掉（实测：过滤后一块不剩）。而压平的棋盘残屑恰好都是被主体包住的独立小块，
    取最大块同时解决了两件事：既留住主体，又清掉残屑。
    """
    comps = components(alpha)
    if not comps:
        raise SystemExit("没识别到任何内容块，需要调 TOL")
    return max(comps, key=lambda c: int(c.sum()))


def crop_to(img: Image.Image, mask: np.ndarray) -> Image.Image:
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    arr = np.array(img)
    sub = arr[y0:y1, x0:x1].copy()
    sub[~mask[y0:y1, x0:x1], 3] = 0
    return Image.fromarray(sub)


def square_crop(art: Image.Image) -> Image.Image:
    """居中取正方形：图标画布是方的，主体尽量铺满才有辨识度。"""
    side = min(art.size)
    left = (art.width - side) // 2
    top = (art.height - side) // 2
    return art.crop((left, top, left + side, top + side))


def build_icon(size: int, art: Image.Image) -> Image.Image:
    """带底 favicon：**圆盘**底而不是方块——方形底在标签栏里会显出一个突兀的方块（被明确否过），
    圆盘与主体同形，浅色/深色标签栏上都能看清。"""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, size - 1, size - 1), fill=ICON_GROUND + (255,))
    inner = max(1, round(size * ICON_ART_INSET))
    scaled = art.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(scaled, (off, off), scaled)
    return canvas


OUT.mkdir(parents=True, exist_ok=True)

rgb = np.array(Image.open(SOURCE).convert("RGB"))
bg_mask = border_background_mask(rgb)
alpha = np.where(bg_mask, 0, 255).astype("uint8")
full = Image.fromarray(np.dstack([rgb, alpha]).astype("uint8"))

subject = subject_mask(alpha)
mark = crop_to(full, subject)
mark = mark.resize(
    (max(1, round(mark.width * MARK_HEIGHT / mark.height)), MARK_HEIGHT), Image.LANCZOS
)
mark.save(OUT / "logo-mark.png", "PNG", optimize=True)

icon_art = square_crop(mark)
build_icon(48, icon_art).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
touch = Image.new("RGB", (ICON_SIZE, ICON_SIZE), ICON_GROUND)
touch_art = icon_art.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
touch.paste(touch_art, (0, 0), touch_art)
touch.save(OUT / "apple-touch-icon.png", "PNG", optimize=True)

# ---- README / 文档用的横版头图 ----------------------------------------------
# 横版整标（徽章 + NestSpace 字标）**不进标头**：字标是深墨色，深色主题下会看不见，而标头本来
# 就有站点自己的排印文字。但 README 头图是另一回事——GitHub 的深色主题下它是一块浅色卡片，
# 自带底色反而稳。所以这里只**裁掉四周留白**（保留原件的近白底），不做抠底：
# 抠成透明的话，同一张图在 GitHub 深色主题里就只剩看不见的一行字。
BANNER_SOURCE = SRC / "Logo horizontal scroll.png"
BANNER_HEIGHT = 200
BANNER_PAD = 24

if BANNER_SOURCE.exists():
    banner_rgb = np.array(Image.open(BANNER_SOURCE).convert("RGB"))
    banner_bg = np.median(
        np.concatenate([
            banner_rgb[:4, :].reshape(-1, 3), banner_rgb[-4:, :].reshape(-1, 3),
            banner_rgb[:, :4].reshape(-1, 3), banner_rgb[:, -4:].reshape(-1, 3),
        ]),
        axis=0,
    )
    # 内容包围盒：与底色差得够多的像素才算内容（近白底 + 深墨字，判据很稳）
    ink = np.abs(banner_rgb.astype(int) - banner_bg.astype(int)).sum(axis=2) > 60
    ys, xs = np.nonzero(ink)
    if len(ys) == 0:
        raise SystemExit(f"{BANNER_SOURCE.name}: 没找到内容包围盒")
    y0 = max(0, ys.min() - BANNER_PAD)
    y1 = min(banner_rgb.shape[0], ys.max() + 1 + BANNER_PAD)
    x0 = max(0, xs.min() - BANNER_PAD)
    x1 = min(banner_rgb.shape[1], xs.max() + 1 + BANNER_PAD)
    banner = Image.fromarray(banner_rgb[y0:y1, x0:x1])
    banner = banner.resize(
        (max(1, round(banner.width * BANNER_HEIGHT / banner.height)), BANNER_HEIGHT),
        Image.LANCZOS,
    )
    banner.save(OUT / "logo-banner.png", "PNG", optimize=True)

# 视觉核对图：同一张标头图分别贴到深浅两种底色上，再排一行真实尺寸的图标
# （浏览器面板 0×0 时唯一能"看见"的办法；尺寸给足，早先的 30px 缩略图会被预览器再缩一次，
#  肉眼根本分不出好坏——踩过）。
canvas = Image.new("RGB", (760, 250), (255, 255, 255))
for col, (label, bg) in enumerate((("dark", (24, 25, 23)), ("light", (244, 243, 238)))):
    x0 = col * 380
    ImageDraw.Draw(canvas).rectangle((x0, 0, x0 + 380, 190), fill=bg)
    canvas.paste(mark, (x0 + 24, 35), mark)
    ImageDraw.Draw(canvas).text((x0 + 196, 90), f"header on {label} background", fill=(190, 60, 60))
for i, size in enumerate((16, 32, 48)):
    icon = build_icon(size, icon_art)
    canvas.paste(icon, (24 + i * 56, 200), icon)
ImageDraw.Draw(canvas).text((200, 212), "favicon 16 / 32 / 48 (disc ground)", fill=(120, 120, 120))
canvas.save(SRC / "preview.png")

print(f"抠图：背景 {bg_mask.mean() * 100:.1f}%，主体占画布 {subject.mean() * 100:.1f}%")
print(f"标头徽章 {mark.size} · {(OUT / 'logo-mark.png').stat().st_size // 1024}KB")
print(f"图标     favicon.ico (16/32/48) + apple-touch-icon.png ({ICON_SIZE})，底板 RGB{ICON_GROUND}")
print("核对图   frontend/design/preview.png（左右=深浅主题下的标头，下方=真实尺寸图标）")
