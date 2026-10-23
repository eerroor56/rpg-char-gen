#!/usr/bin/env python3
"""
Карта мира для справочника («Мир» → «Карта мира»).

    pip install numpy scipy opencv-python-headless pillow
    python tools/build_map.py

Рисует рельеф, моря и острова по раскладке ниже и сохраняет:
  img/map/world.webp, img/map/world-1200.webp — картинка карты (2400 и 1200 px в ширину);
  data/map.js — контуры земель и морей (для подсказок по клику), подписи и отметки мест.

Расположение земель в таблицах не записано, поэтому оно выведено из листа «миростроение»:
таблица «Океания» говорит, какие земли омывает каждое море (Парлак — между Кочиметэлем, Саанктарией,
Астаарой, Индакаром и Сехметом и т.д.), а климат и рельеф — из колонки «география» (Астаара — тундра
и лёд → север, Сехмет — пустыни, выжженные горы и тропики → юг). Если у ГМ другая картина мира,
поправьте LANDS / SEAS / PLACES: координаты — в единицах 1600 × 1000 (0,0 — левый верхний угол),
и запустите скрипт заново. Случайность фиксирована (SEED): при тех же настройках карта та же.
В конце скрипт пишет, какие земли омывает каждое море, — сверьте с таблицей «Океания».
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
W, H = 2400, 1500
S = W / 1600          # единицы раскладки → пиксели
SEED = 17

# ------------------------------------------------------------------ раскладка
# blobs:  (x, y, rx, ry, угол°) — эллипсы, из которых складывается суша
# cuts:   эллипсы-заливы, которые вырезаются из суши
# zones:  участки другого биома: (биом, [эллипсы])
# ranges: горные хребты: ([точки хребта], ширина, высота)
# rough:  изрезанность берега (1 — как у материков); snow: снег на вершинах (0–1)
# Берега потом искажаются шумом, поэтому на готовой карте земля сдвинута относительно эллипсов на несколько
# десятков единиц. label (подпись земли или моря) и PLACES задаются уже по готовой карте.
LANDS = [
    dict(name="Астаара", kind="материк", biome="tundra", label=(745, 165), snow=1.0, blobs=[
        (800, 150, 330, 92, 0), (545, 195, 150, 75, 15), (1065, 185, 175, 85, -10), (690, 95, 230, 55, 0), (930, 238, 100, 48, 0),
        (430, 185, 95, 32, 28), (660, 255, 55, 42, 10), (1185, 235, 75, 30, -35), (1000, 270, 45, 30, 20)],
        cuts=[(760, 262, 70, 38, 0), (870, 285, 40, 30, 0)],
        zones=[("ice", [(700, 60, 380, 70, 0), (1010, 100, 200, 55, 0), (470, 150, 80, 35, 0)], 2.4),
               ("taiga", [(600, 230, 110, 40, 10), (1000, 245, 120, 30, -5)])],
        ranges=[([(600, 125), (720, 140), (860, 128), (990, 150), (1090, 140)], 26, 1.0), ([(1110, 175), (1180, 215)], 18, 0.8)]),
    dict(name="Кочиметэль", kind="материк", biome="forest", label=(335, 462), snow=0.2, blobs=[
        (330, 425, 150, 165, -8), (255, 320, 115, 85, 22), (420, 515, 115, 95, 0), (235, 525, 85, 75, 0), (395, 330, 65, 55, 0),
        (480, 300, 70, 28, -35), (175, 585, 55, 28, 35), (505, 450, 40, 60, 0)],
        cuts=[(160, 420, 60, 70, 0), (470, 600, 45, 35, 0)],
        zones=[("plains", [(355, 505, 100, 60, 10), (270, 470, 50, 40, 0)]), ("hills", [(440, 410, 55, 80, 0)])],
        ranges=[([(195, 290), (255, 315), (310, 350)], 20, 0.55), ([(420, 360), (455, 420)], 14, 0.35)]),
    dict(name="Саанктария", kind="материк", biome="holy", label=(290, 832), blobs=[
        (370, 820, 160, 88, 6), (270, 785, 75, 62, 0), (480, 860, 80, 55, 0), (225, 860, 60, 25, -25), (430, 735, 50, 30, 20)],
        cuts=[(340, 905, 55, 30, 0)],
        zones=[("meadow_gold", [(440, 835, 70, 40, 0), (300, 800, 45, 30, 0)])],
        ranges=[([(330, 845), (385, 860)], 12, 0.35)]),
    dict(name="Сехмет", kind="материк", biome="desert", label=(800, 832), blobs=[
        (875, 815, 200, 112, -5), (735, 790, 95, 75, 0), (1015, 860, 115, 85, 0), (890, 720, 105, 52, 0),
        (690, 705, 55, 30, -30), (1100, 905, 55, 28, 20), (960, 690, 55, 30, 15)],
        cuts=[(800, 700, 55, 40, 0), (900, 945, 60, 35, 0)],
        zones=[("tropic", [(850, 705, 160, 32, 0), (735, 740, 60, 30, 0)], 1.9), ("dunes", [(800, 870, 115, 50, 0)], 1.4),
               ("scorched", [(985, 820, 115, 70, -20)], 1.5)],
        ranges=[([(905, 770), (965, 780), (1020, 815), (1045, 870)], 24, 1.0), ([(985, 760), (1030, 745)], 14, 0.6)]),
    dict(name="Индакар", kind="материк", biome="magic", label=(1150, 445), blobs=[
        (1120, 480, 125, 140, 15), (1060, 395, 75, 70, 0), (1180, 585, 85, 68, 0), (1030, 320, 45, 30, -40), (1240, 640, 45, 25, 30)],
        cuts=[(1235, 470, 55, 60, 0), (1010, 520, 40, 45, 0)],
        zones=[("magic_glade", [(1130, 470, 55, 45, 0), (1075, 400, 35, 28, 0), (1175, 580, 30, 25, 0)])],
        ranges=[]),
    dict(name="Иум-цек", kind="материк", biome="dark", label=(1375, 762), blobs=[
        (1375, 815, 155, 105, -15), (1270, 760, 85, 68, 0), (1470, 870, 100, 68, 0), (1205, 815, 55, 25, 25), (1500, 735, 50, 30, -30)],
        cuts=[(1390, 920, 50, 30, 0)],
        zones=[("ash", [(1430, 855, 105, 55, -10)]), ("carapace", [(1290, 770, 60, 45, 0)])],
        ranges=[([(1265, 805), (1320, 770), (1385, 760)], 15, 0.5)]),
    dict(name="Марекадж", kind="материк", biome="swamp", label=(1440, 335), blobs=[
        (1495, 370, 100, 160, 8), (1530, 255, 70, 80, 0), (1455, 480, 80, 65, 0), (1405, 330, 55, 25, 20), (1555, 520, 40, 30, 0)],
        cuts=[(1585, 380, 40, 60, 0)],
        zones=[("bone", [(1525, 250, 65, 55, 0)], 1.5), ("mushroom", [(1470, 470, 70, 55, 0)], 2.0), ("tar", [(1470, 360, 34, 26, 0)], 1.4)],
        ranges=[]),
    dict(name="Калигар", kind="остров", biome="misty", label=(1112, 655), rough=0.9, blobs=[
        (1115, 728, 52, 40, -20), (1092, 758, 24, 19, 0)], ranges=[([(1105, 725)], 14, 0.5)]),
    dict(name="Шочипили", kind="архипелаг", biome="tropic", label=(622, 552), rough=0.95, blobs=[
        (605, 612, 29, 18, 20), (655, 640, 23, 15, -10), (702, 612, 18, 13, 0), (622, 663, 15, 11, 0), (565, 640, 13, 10, 0), (683, 668, 12, 9, 0)],
        ranges=[([(605, 610)], 9, 0.6)]),
    dict(name="Хар Хагааш", kind="архипелаг", biome="volcanic", label=(588, 893), rough=0.95, blobs=[
        (600, 945, 36, 26, 0), (655, 968, 19, 14, 0), (553, 970, 16, 12, 0), (640, 918, 12, 9, 0)],
        ranges=[]),
    dict(name="Таас-Орон", kind="остров", biome="stone", label=(1050, 987), rough=0.9, blobs=[
        (1090, 945, 48, 29, 10)], ranges=[([(1070, 945), (1110, 940)], 10, 0.6)]),
    dict(name="Скеар", kind="архипелаг", biome="bio", label=(335, 265), rough=0.95, blobs=[
        (432, 262, 23, 15, 0), (482, 242, 18, 13, 0), (400, 290, 14, 10, 0), (472, 286, 12, 9, 0)], ranges=[]),
    dict(name="Тенанг", kind="остров", biome="hills_quiet", label=(110, 668), rough=0.9, blobs=[
        (140, 690, 40, 30, -15)], ranges=[]),
    dict(name="Тирнаног", kind="остров", biome="forest_old", label=(120, 386), rough=0.9, snow=0.6, blobs=[
        (80, 305, 36, 52, 10)], ranges=[([(78, 285), (86, 325)], 11, 0.8)]),
]
# реки: сколько на земле (истоки выбираются в глубине суши) и истоки, заданные вручную
RIVERS = {"Кочиметэль": 7, "Индакар": 4, "Астаара": 6, "Саанктария": 3, "Марекадж": 3, "Иум-цек": 2,
          "Тирнаног": 1, "Тенанг": 1, "Калигар": 1}
RIVER_SOURCES = [(962, 785), (985, 765)]          # Сехмет: Горы водопадов
# особые детали рельефа: ущелье (линия), кратер (точка и радиус)
GORGES = [[(1415, 430), (1430, 455), (1445, 485)]]
CRATERS = [(905, 205, 16)]
VOLCANOES = [(600, 945, 24), (655, 968, 13), (553, 970, 11)]      # Хар Хагааш: (x, y, радиус конуса)

# моря: якоря (x, y, вес) — граница между морями проходит посередине между якорями
SEAS = [
    dict(name="Парлак", sub="Сияющий океан", fx="shine", label=(790, 430), anchors=[(735, 455, 1.3), (640, 560, 0.9)]),
    dict(name="Лихарб", sub="чернильное море", fx="ink", label=(295, 222), anchors=[(460, 280, 0.95)]),
    dict(name="Штиза", sub="море копий", fx="spears", label=(1330, 135), anchors=[(1315, 165, 0.85), (1330, 300, 0.55)]),
    dict(name="Арвох", sub="море духов", fx="spirits", label=(972, 598), anchors=[(1125, 740, 0.95)]),
    dict(name="Сулетуд", sub="океан", fx="gloom", label=(1312, 565), anchors=[(1300, 555, 0.95), (1580, 660, 0.9), (1250, 330, 0.55)]),
    dict(name="Беро", sub="кипучее море", fx="boil", label=(800, 978), anchors=[(650, 950, 1.05)]),
    dict(name="Унгеста", sub="мирное море", fx="calm", label=(290, 625), anchors=[(185, 660, 0.95)]),
]
OPEN_SEA = [(50, 70, 1.1), (60, 930, 1.1), (1560, 965, 0.7), (1570, 50, 0.85), (230, 975, 0.6),
            (780, -40, 1.0), (1060, -30, 0.9), (380, -20, 0.8)]   # безымянный открытый океан (в т.ч. к северу от Астаары)

# места: «Улучшенная география» и храмы из «интересных мест» (с пометкой, где расположены)
PLACES = [   # at — точка на готовой карте (единицы 1600 × 1000); side="left" — подпись слева от значка
    dict(name="Алькаинские равнины", region="Кочиметэль", at=(330, 500), icon="plain"),
    dict(name="Лес Инвир", region="Кочиметэль", at=(222, 402), icon="forest"),
    dict(name="Город белого песка", region="Сехмет", at=(760, 862), icon="city"),
    dict(name="Горы водопадов", region="Сехмет", at=(985, 802), icon="peak"),
    dict(name="Кометный кратер", region="Астаара", at=(870, 186), icon="crater"),
    dict(name="Долина сна", region="Марекадж", at=(1492, 252), icon="dream", side="left"),
    dict(name="Ущелье смерти", region="Марекадж", at=(1437, 440), icon="gorge"),
    dict(name="Сумрачная библиотека", region="Иум-цек", at=(1300, 800), icon="tower"),
    dict(name="Пустоши застывших мучений", region="Иум-цек", at=(1445, 852), icon="waste", side="left"),
    dict(name="Восход лишений", region="Саанктария", at=(300, 785), icon="sun"),
    dict(name="Путь к Золотым вратам", region="Саанктария", at=(472, 876), icon="gate", side="left"),
    dict(name="Храм первого огня", region="Хар Хагааш", at=(571, 955), icon="temple"),
    dict(name="Храм совершенного тела", region="Шочипили", at=(588, 588), icon="temple"),
    # места, добавленные ГМ позже (точки подобраны внутри своей земли, вдали от берега и других отметок)
    dict(name="Централ", region="Кочиметэль", at=(278, 491), icon="city", side="left"),   # место — по правке ГМ
    dict(name="Иссушенные горы", region="Сехмет", at=(882, 733), icon="peak"),
    dict(name="Мулдхан", region="Сехмет", at=(682, 773), icon="_"),
    dict(name="Мизуками", region="Марекадж", at=(1384, 303), icon="_", side="left"),     # место — по правке ГМ
    dict(name="Лес двух лун", region="Индакар", at=(1199, 555), icon="forest"),
    dict(name="Зелёные водопады", region="Индакар", at=(1223, 363), icon="_"),
    dict(name="Кнун'гарикет", region="Индакар", at=(1111, 347), icon="_"),
    dict(name="Мэлхелла", region="Иум-цек", at=(1486, 723), icon="_"),
    dict(name="Солнечная башня", region="Саанктария", at=(437, 731), icon="tower"),
    dict(name="Санта-Вигилия", region="Саанктария", at=(389, 827), icon="temple"),
]

# биом: (цвет 1, цвет 2, рельеф 0–1, пестрота, лес)
BIOMES = {
    "forest": ("#2b5a2b", "#43773b", 0.24, 0.8, 1),
    "forest_old": ("#22502c", "#3a6b3c", 0.4, 0.8, 1),
    "taiga": ("#3c5b45", "#56735a", 0.3, 0.7, 1),
    "plains": ("#7f9f52", "#98b264", 0.12, 0.45, 0),
    "hills": ("#6f8f4a", "#8ba45e", 0.5, 0.6, 0),
    "tundra": ("#9aa08a", "#b9bba6", 0.25, 0.5, 0),
    "ice": ("#dfe9ef", "#f6fafc", 0.3, 0.25, 0),
    "holy": ("#8a9d58", "#b2ba77", 0.22, 0.5, 0),
    "meadow_gold": ("#d1c26e", "#eadc9c", 0.15, 0.4, 0),
    "desert": ("#d5b273", "#e8ca8f", 0.18, 0.45, 0),
    "dunes": ("#d6a660", "#edc583", 0.22, 0.4, 0),
    "scorched": ("#a35e36", "#c27c4c", 0.35, 0.6, 0),
    "tropic": ("#2d7838", "#4f9846", 0.25, 0.8, 1),
    "magic": ("#1f6a55", "#2e8c6c", 0.32, 0.8, 1),
    "magic_glade": ("#3db08f", "#80dcbb", 0.2, 0.5, 0),
    "dark": ("#3a3346", "#4e465c", 0.3, 0.55, 0),
    "carapace": ("#4a3a3e", "#634c4f", 0.35, 0.7, 0),
    "ash": ("#68646b", "#86828a", 0.15, 0.85, 0),
    "swamp": ("#4d5b33", "#677440", 0.06, 0.9, 0),
    "bone": ("#b8b096", "#d5cdb3", 0.18, 0.9, 0),
    "mushroom": ("#4f3f57", "#86608a", 0.15, 1.2, 1),
    "tar": ("#1f1c1b", "#35302c", 0.04, 0.4, 0),
    "misty": ("#6c8075", "#8b9c90", 0.35, 0.6, 0),
    "volcanic": ("#2b2522", "#43372f", 0.5, 0.6, 0),
    "stone": ("#827c76", "#a09a92", 0.45, 0.7, 0),
    "bio": ("#173a37", "#225149", 0.25, 0.7, 0),
    "hills_quiet": ("#90a970", "#adc18b", 0.45, 0.5, 0),
}
COLD = {"ice", "tundra", "taiga"}

# море: (мелководье, глубина)
SEA_COLORS = {
    "open": ("#3b8197", "#163d62"),
    "shine": ("#46b4b8", "#1b6688"),
    "ink": ("#334055", "#111827"),
    "spears": ("#4b7e8a", "#1c3a4e"),
    "spirits": ("#83a8a8", "#38606a"),
    "gloom": ("#3a6274", "#122a3e"),
    "boil": ("#5f8a83", "#2d4f57"),
    "calm": ("#68bcd6", "#245f94"),
}


# ------------------------------------------------------------------ инструменты
def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def fbm(h, w, seed, octaves=6, base=3, pers=0.5):
    """Фрактальный шум 0..1 (сумма сглаженных случайных сеток)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        nh = max(1, int(round(n * h / w)))
        g = rng.random((nh + 3, n + 3), dtype=np.float32)
        ox, oy = w // n, h // nh
        upg = cv2.resize(g, (w + 3 * ox, h + 3 * oy), interpolation=cv2.INTER_CUBIC)
        out += upg[oy:oy + h, ox:ox + w] * amp
        tot += amp
        amp *= pers
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo), 0, 1)


def ellipse_field(X, Y, blob):
    x, y, rx, ry, ang = blob
    x, y, rx, ry = x * S, y * S, rx * S, ry * S
    a = math.radians(ang)
    u = (X - x) * math.cos(a) + (Y - y) * math.sin(a)
    v = -(X - x) * math.sin(a) + (Y - y) * math.cos(a)
    return 1 - np.sqrt((u / rx) ** 2 + (v / ry) ** 2)


def blobs_field(X, Y, blobs):
    f = None
    for b in blobs:
        e = ellipse_field(X, Y, b)
        f = e if f is None else np.maximum(f, e)
    return f


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def line_dist(points, warp=None):
    """Расстояние (px) до ломаной (точки — в пикселях карты)."""
    m = np.full((H, W), 255, np.uint8)
    pts = np.array([[p[0], p[1]] for p in points], np.int32)
    if len(pts) == 1:
        cv2.circle(m, tuple(int(v) for v in pts[0]), 1, 0, -1)
    else:
        cv2.polylines(m, [pts], False, 0, 2)
    d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    if warp is not None:
        d = cv2.remap(d, warp[0], warp[1], cv2.INTER_LINEAR)
    return d


def to_path(mask, eps=1.6, min_area=30, holes=False):
    """Контур маски → путь SVG (с дырками-островами, если holes: тогда рисовать с fill-rule: evenodd)."""
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP if holes else cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cs:
        if cv2.contourArea(c) < min_area:
            continue
        c = cv2.approxPolyDP(c, eps, True)
        pts = c[:, 0, :]
        parts.append("M" + " ".join(f"{p[0]},{p[1]}" for p in pts) + "Z")
    return "".join(parts)


LO = 4            # во сколько раз меньше сетка для мягких переходов цвета


def soft_weights(index_map, n, sigma):
    small = cv2.resize(index_map.astype(np.float32), (W // LO, H // LO), interpolation=cv2.INTER_NEAREST).astype(np.int16)
    ws = np.zeros((H // LO, W // LO, n), np.float32)
    for k in np.unique(small):
        if k < 0:
            continue
        ws[..., k] = cv2.GaussianBlur((small == k).astype(np.float32), (0, 0), sigma)
    ws /= np.maximum(ws.sum(-1, keepdims=True), 1e-6)
    return ws


def up(a):
    return cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR)


def blend(img, color, amount):
    return img * (1 - amount[..., None]) + hexrgb(color) * amount[..., None]


# ------------------------------------------------------------------ рисование
def main():
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    # искажение координат: крупные заливы и мысы
    wx = (fbm(H, W, SEED + 1, 4, 2) - 0.5) * 130 + (fbm(H, W, SEED + 2, 4, 5) - 0.5) * 90
    wy = (fbm(H, W, SEED + 3, 4, 2) - 0.5) * 130 + (fbm(H, W, SEED + 4, 4, 5) - 0.5) * 90
    Xw, Yw = X + wx, Y + wy

    def scr(x, y):
        """Точка раскладки (единицы 1600 × 1000) → пиксель карты с учётом искажения берегов."""
        px, py = x * S, y * S
        qx, qy = px, py
        for _ in range(10):
            xi, yi = int(np.clip(qx, 0, W - 1)), int(np.clip(qy, 0, H - 1))
            qx, qy = px - wx[yi, xi], py - wy[yi, xi]
        return float(qx), float(qy)
    coast_n = fbm(H, W, SEED + 5, 8, 4, 0.6) - 0.5         # изрезанность берега
    detail = fbm(H, W, SEED + 6, 7, 16, 0.55)
    grain = fbm(H, W, SEED + 7, 4, 140)

    # --- суша
    land_id = np.full((H, W), -1, np.int16)
    best = np.full((H, W), -9.0, np.float32)
    rough_px = np.ones((H, W), np.float32)
    for i, L in enumerate(LANDS):
        f = blobs_field(Xw, Yw, L["blobs"])
        for c in L.get("cuts", []):
            f = np.minimum(f, -ellipse_field(Xw, Yw, c) * 1.5)
        f = np.clip(f, -1, 1)
        take = f > best
        land_id[take] = i
        rough_px[take] = L.get("rough", 1.0)
        best = np.maximum(best, f)
    shape = best + coast_n * 0.85 * rough_px
    land = shape > 0.12
    islet = fbm(H, W, SEED + 21, 4, 34)
    land |= (shape > -0.12) & (islet > 0.87)            # островки у берегов
    land = ndimage.binary_opening(land, iterations=1)
    lab, n = ndimage.label(land)                         # убрать крошки
    sizes = ndimage.sum(land, lab, range(1, n + 1))
    land &= np.isin(lab, 1 + np.nonzero(sizes >= 14)[0])
    land_id[~land] = -1

    # --- биомы (у зон рваные края)
    names = list(BIOMES)
    bidx = {nm: k for k, nm in enumerate(names)}
    biome = np.full((H, W), -1, np.int16)
    zone_noise = fbm(H, W, SEED + 22, 6, 6, 0.6) - 0.5
    for i, L in enumerate(LANDS):
        m = land_id == i
        biome[m] = bidx[L["biome"]]
        for z in L.get("zones", []):
            bname, zb, zk = z[0], z[1], (z[2] if len(z) > 2 else 0.95)      # третье число — рваность края зоны
            zf = blobs_field(Xw, Yw, zb) + zone_noise * zk
            biome[m & (zf > 0)] = bidx[bname]

    bw = soft_weights(biome, len(names), 2.0)

    def by_biome(vals):
        return up(bw @ np.asarray(vals, np.float32))

    c1 = by_biome([hexrgb(BIOMES[nm][0]) for nm in names])
    c2 = by_biome([hexrgb(BIOMES[nm][1]) for nm in names])
    mott = by_biome([BIOMES[nm][3] for nm in names])
    relief = by_biome([BIOMES[nm][2] for nm in names])
    forest = by_biome([BIOMES[nm][4] for nm in names])
    cold = by_biome([1.0 if nm in COLD else 0.0 for nm in names])
    desert = by_biome([1.0 if nm in ("desert", "dunes") else 0.0 for nm in names])
    t = np.clip(0.5 + (detail - 0.5) * 1.9 * mott + (grain - 0.5) * 0.6 * mott, 0, 1)
    col = c1 * (1 - t[..., None]) + c2 * t[..., None]
    # кроны деревьев: тёмная пятнистость в лесах
    canopy = smoothstep(0.45, 0.75, fbm(H, W, SEED + 27, 3, 110)) * forest
    col = col * (1 - 0.22 * canopy[..., None])
    # барханы в пустыне
    dune = np.sin((X * 0.55 + Y * 0.83) / 5.5 + fbm(H, W, SEED + 28, 4, 5) * 28)
    col = col * (1 + desert[..., None] * dune[..., None] * 0.05)

    # --- высоты: быстрый подъём от берега, дальше холмы с «промоинами» + хребты
    dist_in = ndimage.distance_transform_edt(land).astype(np.float32)
    base_e = smoothstep(0, 30, dist_in)
    hills = fbm(H, W, SEED + 23, 6, 10, 0.55)
    gullies = (1 - np.abs(2 * fbm(H, W, SEED + 31, 6, 22, 0.55) - 1)) ** 1.6
    ridged = (1 - np.abs(2 * fbm(H, W, SEED + 8, 7, 9, 0.55) - 1)) ** 2 * 0.65 + (1 - np.abs(2 * fbm(H, W, SEED + 32, 6, 26, 0.5) - 1)) ** 2 * 0.35
    elev = base_e * (0.05 + 0.5 * relief) * (0.55 * hills + 0.45 * gullies)
    rwarp = (X + (fbm(H, W, SEED + 29, 4, 10) - 0.5) * 40, Y + (fbm(H, W, SEED + 30, 4, 10) - 0.5) * 40)
    mt = np.zeros((H, W), np.float32)
    snowk = np.zeros((H, W), np.float32)
    for i, L in enumerate(LANDS):
        snowk[land_id == i] = L.get("snow", 0.0)
        for pts, width, height in L.get("ranges", []):
            d = line_dist([scr(*q) for q in pts], rwarp)
            g = np.exp(-(d / (width * S)) ** 2) * height
            mt = np.maximum(mt, g)
    mt *= land
    peaks = mt * (0.3 + 1.25 * ridged)
    elev = elev + peaks * base_e
    gorge = np.zeros((H, W), np.float32)
    for pts in GORGES:                                    # ущелье: рваная трещина с тёмным дном
        P = [scr(*q) for q in pts]
        dense = []
        for (x1, y1), (x2, y2) in zip(P, P[1:]):
            for t_ in np.linspace(0, 1, 18, endpoint=False):
                dense.append((x1 + (x2 - x1) * t_, y1 + (y2 - y1) * t_))
        dense.append(P[-1])
        rng_g = np.random.default_rng(SEED + 36)
        J = np.array([(x + rng_g.normal(0, 1.6), y + rng_g.normal(0, 1.6)) for x, y in dense])
        cv2.polylines(gorge, [np.int32(J * 8)], False, 1.0, 3, cv2.LINE_AA, shift=3)
    gorge = cv2.GaussianBlur(gorge, (0, 0), 0.7)
    elev = elev - gorge * 0.15
    rim = np.clip(cv2.GaussianBlur(gorge, (0, 0), 3) * 2 - gorge, 0, 1)
    for cx, cy, r in CRATERS:                             # кратер: вал и тёмная чаша
        cx, cy = scr(cx, cy)
        d = np.hypot(X - cx, Y - cy) / (r * S)
        elev = elev + np.exp(-((d - 1) / 0.25) ** 2) * 0.35 - np.exp(-(d / 0.8) ** 2) * 0.25
        col = col * (1 - 0.35 * np.exp(-(d / 0.9) ** 2)[..., None])
    lava = np.zeros((H, W), np.float32)
    rng_v = np.random.default_rng(SEED + 35)
    for vx0, vy0, vr in VOLCANOES:                        # вулканы: конус, кратер, лавовые потоки
        vx0, vy0 = scr(vx0, vy0)
        vx0, vy0 = vx0 / S, vy0 / S
        d = np.hypot(X - vx0 * S, Y - vy0 * S) / (vr * S)
        cone = np.clip(1 - d, 0, 1) ** 1.3 * 1.5
        crater_d = np.exp(-(d / 0.17) ** 2)
        elev = elev + (cone - crater_d * 0.55) * land
        col = blend(col, "#5b524c", np.clip(cone * 0.9, 0, 1) * land)
        lava = np.maximum(lava, smoothstep(0.22, 0.08, d))
        for _ in range(3 + int(rng_v.random() * 3)):
            a = rng_v.random() * 2 * math.pi
            pts = []
            for k in range(14):
                rr = 0.12 + 0.8 * k / 13
                a2 = a + math.sin(k * 0.9 + a) * 0.12
                pts.append((vx0 * S + math.cos(a2) * rr * vr * S, vy0 * S + math.sin(a2) * rr * vr * S))
            pts = np.array([[p[0] * 8, p[1] * 8] for p in pts], np.int32)
            cv2.polylines(lava, [pts], False, 1.0, 1 if vr < 15 else 2, cv2.LINE_AA, shift=3)
    lava *= land
    elev[~land] = 0
    # скалы и снег
    rock = smoothstep(0.15, 0.6, peaks)
    warm = by_biome([1.0 if nm in ("desert", "dunes", "scorched", "volcanic") else 0.0 for nm in names])
    rock_col = hexrgb("#8a8176") * (1 - warm[..., None]) + hexrgb("#9a5636") * warm[..., None]
    col = col * (1 - (rock * 0.6)[..., None]) + rock_col * (rock * 0.6)[..., None]
    snow = smoothstep(0.85 - 0.3 * snowk, 1.15 - 0.3 * snowk, peaks) * snowk
    col = blend(col, "#f3f6f8", np.clip(snow, 0, 1))
    # отмывка рельефа (свет с северо-запада); ровное место не темнеет и не светлеет
    es = cv2.GaussianBlur(elev, (0, 0), 1.0)
    gy, gx = np.gradient(es * 300)
    nz = 1 / np.sqrt(gx ** 2 + gy ** 2 + 1)
    shade = (gx * 0.5 + gy * 0.55 + 0.67) * nz / 0.67
    col = col * np.clip(0.3 + 0.7 * shade, 0.42, 1.45)[..., None]
    # реки: истоки в глубине суши, русло — вниз к ближайшему морю, с извивами
    flow = cv2.GaussianBlur(dist_in, (0, 0), 4) + (fbm(H, W, SEED + 33, 5, 9) - 0.5) * 34
    river = np.zeros((H, W), np.float32)
    rng_r = np.random.default_rng(SEED + 34)
    names_i0 = {L["name"]: i for i, L in enumerate(LANDS)}
    sources = [scr(x, y) for x, y in RIVER_SOURCES]
    for nm, cnt_r in RIVERS.items():
        m = land_id == names_i0[nm]
        dv = dist_in[m]
        if not dv.size:
            continue
        ys, xs = np.nonzero(m & (dist_in > np.percentile(dv, 70)))
        chosen = []
        for k in rng_r.permutation(len(xs)):
            p = (float(xs[k]), float(ys[k]))
            if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 70 for q in chosen + sources):
                chosen.append(p)
            if len(chosen) >= cnt_r:
                break
        sources += chosen
    for sx0, sy0 in sources:
        x, y = sx0, sy0
        pts = [(x, y)]
        for _ in range(4000):
            xi, yi = int(x), int(y)
            if not (1 <= xi < W - 1 and 1 <= yi < H - 1) or not land[yi, xi]:
                break
            win = flow[yi - 1:yi + 2, xi - 1:xi + 2].copy()
            win[1, 1] = 1e9
            j = int(np.argmin(win))
            dy, dx = j // 3 - 1, j % 3 - 1
            if win.flat[j] >= flow[yi, xi]:             # ямка — дальше прямо к берегу
                gy0, gx0 = np.gradient(dist_in[yi - 1:yi + 2, xi - 1:xi + 2])
                dx, dy = -np.sign(gx0[1, 1]) or 1, -np.sign(gy0[1, 1])
                flow[yi, xi] = 1e9
            x, y = x + dx, y + dy
            pts.append((x, y))
        if len(pts) < 25:
            continue
        P = np.array(pts[::3], np.float32)
        if len(P) < 6:
            continue
        P = cv2.GaussianBlur(P.reshape(-1, 1, 2), (1, 9), 0).reshape(-1, 2) if len(P) > 9 else P
        tang = np.gradient(P, axis=0)
        tang /= np.maximum(np.linalg.norm(tang, axis=1, keepdims=True), 1e-6)
        nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
        sarc = np.arange(len(P), dtype=np.float32) * 3
        ph1, ph2 = rng_r.random() * 6.28, rng_r.random() * 6.28
        off = np.sin(sarc / 26 + ph1) * 8 + np.sin(sarc / 10 + ph2) * 3
        off *= np.minimum(1, np.minimum(sarc, sarc[-1] - sarc) / 30)
        P = P + nrm * off[:, None]
        n_pts = len(P)
        for k in range(1, n_pts):
            w = 0.9 + 1.6 * (k / n_pts)
            p1 = (int(P[k - 1][0] * 8), int(P[k - 1][1] * 8))
            p2 = (int(P[k][0] * 8), int(P[k][1] * 8))
            cv2.line(river, p1, p2, 1.0, max(1, int(round(w))), cv2.LINE_AA, shift=3)
    river = np.clip(river, 0, 1) * land
    col = blend(col, "#3f7ea3", river * 0.85)
    col = blend(col, "#c8bfae", rim * 0.35)
    col = blend(col, "#120e10", gorge * 0.9)

    # --- моря
    dist_out = ndimage.distance_transform_edt(~land).astype(np.float32)
    sx, sy = np.meshgrid(np.arange(0, W, LO, dtype=np.float32), np.arange(0, H, LO, dtype=np.float32))
    sxw = sx + cv2.resize(wx, (sx.shape[1], sx.shape[0])) * 1.2
    syw = sy + cv2.resize(wy, (sx.shape[1], sx.shape[0])) * 1.2
    keys = [s["fx"] for s in SEAS] + ["open"]
    anchors = [(si, a) for si, s in enumerate(SEAS) for a in s["anchors"]] + [(len(SEAS), a) for a in OPEN_SEA]
    dmin = np.full(sx.shape, 1e9, np.float32)
    sea_small = np.zeros(sx.shape, np.int16)
    for si, (ax, ay, wgt) in anchors:
        d = np.hypot(sxw - ax * S, syw - ay * S) / wgt
        tk = d < dmin
        sea_small[tk] = si
        dmin = np.minimum(dmin, d)
    sea_id = cv2.resize(sea_small.astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST).astype(np.int16)
    sw = np.zeros(sea_small.shape + (len(keys),), np.float32)
    for si in range(len(keys)):
        sw[..., si] = cv2.GaussianBlur((sea_small == si).astype(np.float32), (0, 0), 10)
    sw /= np.maximum(sw.sum(-1, keepdims=True), 1e-6)
    sh = up(sw @ np.stack([hexrgb(SEA_COLORS[k][0]) for k in keys]))
    dp = up(sw @ np.stack([hexrgb(SEA_COLORS[k][1]) for k in keys]))
    swf = {k: up(np.ascontiguousarray(sw[..., i])) for i, k in enumerate(keys)}
    depth_t = (1 - np.exp(-dist_out / 24)) ** 0.8
    sea = sh * (1 - depth_t[..., None]) + dp * depth_t[..., None]
    waves = fbm(H, W, SEED + 10, 5, 50)
    sea *= (0.95 + 0.09 * waves[..., None])

    # Парлак: вода светится — светлые разводы и редкие искры
    glowp = smoothstep(0.45, 0.85, fbm(H, W, SEED + 24, 5, 14)) * swf["shine"] * smoothstep(3, 30, dist_out)
    sea = sea + glowp[..., None] * hexrgb("#6ff0dc") * 0.06
    rng = np.random.default_rng(SEED + 11)
    sparks = np.zeros((H, W), np.float32)
    for x, y in (rng.random((1400, 2)) * [W, H]).astype(int):
        sparks[y, x] = 0.4 + rng.random() * 0.6
    sparks = np.clip(cv2.GaussianBlur(sparks, (0, 0), 0.8) * 6 + cv2.GaussianBlur(sparks, (0, 0), 2.6) * 7, 0, 1)
    sea = sea + (sparks * swf["shine"] * (dist_out > 6))[..., None] * hexrgb("#d9fff8") * 0.6
    # Лихарб: чернильные разводы
    ink = swf["ink"] * smoothstep(0.45, 0.85, fbm(H, W, SEED + 25, 5, 9)) * 0.35
    sea = blend(sea, "#020205", ink)
    # Арвох: призрачная дымка вытянутыми полосами
    wisp = cv2.resize(cv2.resize(fbm(H, W, SEED + 12, 5, 8), (W // 6, H)), (W, H))
    sea = blend(sea, "#e6f6f1", swf["spirits"] * smoothstep(0.75, 0.98, wisp) * 0.16)
    # Беро: кипение — пена и пар
    bub = smoothstep(0.55, 0.75, fbm(H, W, SEED + 13, 3, 150)) * swf["boil"] * smoothstep(5, 15, dist_out)
    sea = sea * (1 + bub[..., None] * 0.07)
    sea = blend(sea, "#f2ede4", swf["boil"] * smoothstep(0.65, 0.92, fbm(H, W, SEED + 26, 5, 9)) * 0.12)
    # Сулетуд: тёмная зыбь
    sea = sea * (1 + (swf["gloom"] * (fbm(H, W, SEED + 14, 4, 36) - 0.5) * 0.35)[..., None])
    # кольца вдоль берега
    for r, a in ((6, 0.2), (13, 0.12), (23, 0.07)):
        ring = np.clip(1 - np.abs(dist_out - r) / 1.0, 0, 1) * a
        sea = blend(sea, "#eaf7f6", ring)
    # паковый лёд у северного края
    floe_f = fbm(H, W, SEED + 18, 5, 30) + (1 - smoothstep(0, 110, Y)) * 0.45 - 0.2
    floe = smoothstep(0.5, 0.53, floe_f) * (Y < 160) * 0
    sea = blend(sea, "#e8f1f5", floe * (0.9 + 0.1 * waves))
    fe = np.clip(floe - ndimage.grey_erosion(floe, size=(3, 3)), 0, 1)
    sea = sea * (1 - fe[..., None] * 0.3)

    img = np.where(land[..., None], col, sea).astype(np.float32)

    # Штиза: торчащие из воды брёвна-копья
    rng = np.random.default_rng(SEED + 15)
    sm = swf["spears"] > 0.55
    cnt = tries = 0
    while cnt < 55 and tries < 200000:
        tries += 1
        x, y = int(rng.random() * W), int(rng.random() * H)
        if not sm[y, x] or land[y, x] or dist_out[y, x] < 8:
            continue
        Ln = 10 + rng.random() * 9
        a = math.radians(-75 + rng.random() * 50)
        p2 = (int(x + Ln * math.cos(a)), int(y + Ln * math.sin(a)))
        cv2.ellipse(img, (x, y), (6, 2), 0, 0, 360, tuple(float(v) for v in hexrgb("#d3e8e8")), 1, cv2.LINE_AA)
        cv2.line(img, (x + 1, y + 1), (p2[0] + 1, p2[1] + 1), tuple(float(v) for v in hexrgb("#0f2230")), 2, cv2.LINE_AA)
        cv2.line(img, (x, y), p2, tuple(float(v) for v in hexrgb("#6b4a2c")), 2, cv2.LINE_AA)
        cnt += 1

    # линия берега
    edge = land & ~ndimage.binary_erosion(land, iterations=1)
    img[edge] = img[edge] * 0.6

    # свечение: Скеар (биолюминесценция), Индакар (магия), лава Хар Хагааша
    glow = np.zeros((H, W, 3), np.float32)
    rng = np.random.default_rng(SEED + 16)

    def dots(region_mask, n, color, r1=0.8, r2=3.0, amt=1.0):
        ys, xs = np.nonzero(region_mask[::2, ::2])
        if not len(xs):
            return
        pick = rng.choice(len(xs), size=min(n, len(xs)), replace=False)
        layer = np.zeros((H, W), np.float32)
        layer[ys[pick] * 2, xs[pick] * 2] = 1
        g = cv2.GaussianBlur(layer, (0, 0), r1) * 7 + cv2.GaussianBlur(layer, (0, 0), r2) * 12
        glow[...] += np.clip(g, 0, 1)[..., None] * hexrgb(color) * amt

    names_i = {L["name"]: i for i, L in enumerate(LANDS)}
    sk_land = land_id == names_i["Скеар"]
    sk_coast = ndimage.binary_dilation(sk_land, iterations=10) & ~sk_land
    dots(sk_land, 45, "#55fff0", 0.6, 2.0, 0.6)
    dots(sk_coast, 70, "#3ff5ff", 0.6, 2.0, 0.45)
    glow += cv2.GaussianBlur(sk_land.astype(np.float32), (0, 0), 5)[..., None] * hexrgb("#1fc7c2") * 0.25
    dots(biome == bidx["magic_glade"], 60, "#c4ffea", 0.7, 4, 0.5)
    dots(land_id == names_i["Индакар"], 50, "#a8ffe0", 0.7, 3, 0.3)
    glow += lava[..., None] * hexrgb("#ffb15a") * 0.9
    glow += cv2.GaussianBlur(lava, (0, 0), 2.5)[..., None] * hexrgb("#ff5a14") * 0.9
    glow += cv2.GaussianBlur(lava, (0, 0), 9)[..., None] * hexrgb("#ff4a10") * 0.35
    img = 1 - (1 - img) * (1 - np.clip(glow, 0, 1))      # «экран»

    # туманы: Калигар (туманный Альбион) и Тирнаног (остров из легенд)
    fog_n = fbm(H, W, SEED + 17, 5, 9)
    for nm, rad, amt in (("Калигар", 50, 0.35), ("Тирнаног", 65, 0.35)):
        m = (land_id == names_i[nm]).astype(np.float32)
        f = cv2.GaussianBlur(m, (0, 0), rad * 0.7)
        f = np.clip(f / max(f.max(), 1e-6) * 1.7, 0, 1) * smoothstep(0.3, 0.8, fog_n) * amt
        img = blend(img, "#eef2f1", f)

    # виньетка и зерно
    vx = (X / W - 0.5) * 2
    vy = (Y / H - 0.5) * 2
    vig = 1 - 0.3 * smoothstep(0.6, 1.5, np.sqrt(vx ** 2 * 0.85 + vy ** 2))
    img = img * vig[..., None] * (0.97 + 0.06 * grain[..., None])
    img = np.clip(img, 0, 1)

    out_dir = ROOT / "img" / "map"
    out_dir.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray((img * 255 + 0.5).astype(np.uint8))
    im.save(out_dir / "world.webp", "WEBP", quality=84, method=6)
    im.resize((1200, 750), Image.LANCZOS).save(out_dir / "world-1200.webp", "WEBP", quality=84, method=6)

    # --- контуры и подписи для сайта
    lands_js = []
    for i, L in enumerate(LANDS):
        m = land_id == i
        lands_js.append({"name": L["name"], "kind": L["kind"], "label": [round(L["label"][0] * S), round(L["label"][1] * S)],
                         "path": to_path(ndimage.binary_dilation(m, iterations=4), eps=2)})
    water = ~ndimage.binary_dilation(land, iterations=2)
    seas_js = []
    for si, s in enumerate(SEAS):
        m = (up(cv2.GaussianBlur((sea_small == si).astype(np.float32), (0, 0), 1.6)) > 0.5) & water   # плавная граница моря
        touch = ndimage.binary_dilation(m, iterations=8) & land
        borders = sorted({LANDS[i]["name"] for i in np.unique(land_id[touch]) if i >= 0})
        seas_js.append({"name": s["name"], "sub": s["sub"], "label": [round(s["label"][0] * S), round(s["label"][1] * S)],
                        "path": to_path(m, eps=3, min_area=400, holes=True), "borders": borders})
    places_js = [{"name": p["name"], "region": p["region"], "icon": p["icon"], "side": p.get("side", "right"),
                  "at": [round(p["at"][0] * S), round(p["at"][1] * S)]} for p in PLACES]
    data = {"w": W, "h": H, "img": "img/map/world.webp", "img1200": "img/map/world-1200.webp",
            "lands": lands_js, "seas": seas_js, "places": places_js}
    js = "/* Сгенерировано tools/build_map.py */\nwindow.WORLD_MAP = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "map.js").write_text(js, encoding="utf-8")
    for s in seas_js:
        print(f"{s['name']}: омывает {', '.join(s['borders'])}")
    print("map.js", len(js) // 1024, "КБ; world.webp", (out_dir / "world.webp").stat().st_size // 1024, "КБ")


if __name__ == "__main__":
    main()
