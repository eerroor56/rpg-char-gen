#!/usr/bin/env python3
"""
Картинки для сайта: расы, существа бестиария, НПС, общины, боги и демоны.

    pip install pillow cryptography
    python tools/build_images.py --races папка_рас
    python tools/build_images.py --creatures папка_существ --npcs папка_нпс --groups папка_фракций --password "пароль ГМ"

Скрипт сопоставляет имена файлов с названиями из таблиц (регистр, «ё/е», опечатки в 1–2 буквы
и уточнения в скобках не мешают: «саури.jpg» → «саури (аргониане)», «Сетос.jpg» → «церковь Сетоса»),
уменьшает картинки и сохраняет в WebP:
  img/races/<имя>.webp — расы (до 900 px), список — window.RACE_IMAGES в data/images.js;
  img/p/<код>.webp     — существа, НПС, общины, боги, демоны (до 560 px), список — window.PORTRAITS.
Бестиарий и «Социум» закрыты паролем ГМ, поэтому у этих картинок вместо названия — код
(хеш названия): по файлам и списку нельзя узнать, кто есть в закрытых разделах. Пароль нужен,
только чтобы прочитать названия из data/locked.js.

Папки, которые не указаны, не трогаются: их картинки остаются как были.
Файлы, которые не удалось сопоставить, выводятся в конце — переименуйте их или добавьте в ALIASES.
Сначала соберите данные (build_data.py), потом картинки: сопоставление идёт по свежим названиям.
"""
import argparse
import base64
import gzip
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT_JS = ROOT / "data" / "images.js"
EXT = (".jpg", ".jpeg", ".jfif", ".png", ".gif", ".bmp", ".webp")

# имена файлов, которые не совпадают с названием в таблице (норм. имя файла → название или список названий)
ALIASES = {
    # расы
    "альтмеры": "высшие эльфы",
    "босмеры": "лесные эльфы",
    "фалмер": "морозные эльфы",
    "железный вайкул": "стальной вайкул",
    "гомункл": "гомункулы",
    # существа
    "изапот": "изопод",
    "энлигтен": "Энгильтен",
    "лесные флиши": "лесной флиша",
    "липель предвесник смерти": "липель",
    "фогмуэрун последний король эоха": "Фогмуэрун",
    "лесмес нетленный ризничий и спящая инфанта": ["Лесмес нетленный ризничий", "Спящая Инфанта"],
    "шабал и удумбал": ["шабал (красный)", "Удумбал (чёрный)"],
    "призматичный рогатик": "призматический рогатик",
    # боги и демоны
    "сетос": "церковь Сетоса",
    "артициал": "Артицал",
    "виридий": "Виридис",
    "азатот": '"слепой безумный бог" (Азатот)',
    "ньярлатотеп": '"ползучий хаос" (Ньярлатотеп)',
    "шаб ниггурат": '"чёрная коза лесов" (Шаб-ниггурат)',
}
# похожие, но другие существа — не сопоставлять
BLOCK = {"вилиан", "кримб", "бугристая макрель", "пустынный попрыгунчик"}

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                     "u", "f", "kh", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def norm(s):
    return re.sub(r"[^a-z0-9а-я]+", " ", str(s).lower().replace("ё", "е")).strip()


def base_name(s):
    """Без уточнения в скобках и без второй половины «иссар/луна»."""
    s = re.sub(r"\(.*?\)", " ", str(s))
    s = re.split(r"[/]", s)[0]
    return norm(s)


def slug(s):
    s = "".join(TRANSLIT.get(c, c) for c in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "race"


def fnv(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return "%08x" % h


def key(name):
    """Код картинки по названию — такой же считает сайт (App.picKey в js/ui.js)."""
    n = norm(name)
    return fnv(n) + fnv(n + "|")


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def match(stem, names):
    """Список названий, которым соответствует файл (обычно одно)."""
    k = norm(stem)
    if k in BLOCK:
        return []
    al = ALIASES.get(k)
    if al:
        al = al if isinstance(al, list) else [al]
        return [n for a in al for n in names if norm(n) == norm(a)]
    by = {n: norm(n) for n in names}
    hit = [n for n, v in by.items() if v == k]
    if hit:
        return hit[:1]
    kb = base_name(stem)
    hit = [n for n in names if base_name(n) == kb and kb]
    if hit:
        return hit[:1]
    hit = [n for n, v in by.items() if v.startswith(k + " ") or k.startswith(v + " ")]
    if len(hit) == 1:
        return hit
    best = min(((lev(k, v), n) for n, v in by.items()), default=(99, None))
    if best[0] <= 1 or (best[0] <= 2 and len(k) >= 8):
        return [best[1]]
    best = min(((lev(kb, base_name(n)), n) for n in names), default=(99, None))
    if kb and (best[0] <= 1 or (best[0] <= 2 and len(kb) >= 8)):
        return [best[1]]
    return []


def load_js(path, var):
    src = path.read_text(encoding="utf-8")
    m = re.search(r"window\." + var + r"\s*=\s*", src)
    if not m:
        return None
    start = m.end()
    depth, i, in_str, esc = 0, start, False, False
    while i < len(src):
        c = src[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0:
                return json.loads(src[start:i + 1])
        i += 1
    return None


def decrypt_locked(password):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    L = load_js(ROOT / "data" / "locked.js", "GAME_LOCKED")
    k = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), base64.b64decode(L["salt"]), L["iter"], 32)
    raw = AESGCM(k).decrypt(base64.b64decode(L["iv"]), base64.b64decode(L["ct"]), None)
    if L.get("gz"):
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def convert(f, out, max_side, quality):
    if out.exists() and out.stat().st_mtime >= f.stat().st_mtime:   # уже сжата — не пересчитываем
        with Image.open(out) as im:
            return im.width, im.height
    im = Image.open(f)
    im.seek(0)
    im = ImageOps.exif_transpose(im)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    w, h = im.size
    if max(w, h) > max_side:
        s = max_side / max(w, h)
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=quality, method=6)
    return im.width, im.height


def files(folder):
    return [f for f in sorted(Path(folder).iterdir()) if f.is_file() and f.suffix.lower() in EXT]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", help="папка с картинками рас (как --races)")
    ap.add_argument("--races")
    ap.add_argument("--creatures")
    ap.add_argument("--npcs")
    ap.add_argument("--groups", help="общины, боги и демоны")
    ap.add_argument("--password", default=os.environ.get("GM_PASSWORD"))
    a = ap.parse_args()
    races_dir = a.races or a.folder
    if not (races_dir or a.creatures or a.npcs or a.groups):
        print(__doc__)
        sys.exit(1)

    data = load_js(ROOT / "data" / "data.js", "GAME_DATA")
    race_imgs = (load_js(OUT_JS, "RACE_IMAGES") if OUT_JS.exists() else None) or {}
    portraits = (load_js(OUT_JS, "PORTRAITS") if OUT_JS.exists() else None) or {}
    report = []

    if races_dir:
        race_imgs = {}
        names = {r["name"]: r["id"] for r in data["races"]}
        out_dir = ROOT / "img" / "races"
        unmatched = []
        for f in files(races_dir):
            hit = match(f.stem, list(names))
            if not hit:
                unmatched.append(f.name)
                continue
            rid = names[hit[0]]
            name = slug(rid) + ".webp"
            w, h = convert(f, out_dir / name, 900, 82)
            race_imgs[rid] = {"src": f"img/races/{name}", "w": w, "h": h}
        missing = [r["name"] for r in data["races"] if r["id"] not in race_imgs]
        report.append(("Расы", len(race_imgs), unmatched, missing))

    locked = None
    if a.creatures or a.npcs or a.groups:
        if not a.password:
            sys.exit("Нужен пароль ГМ (--password или GM_PASSWORD), чтобы прочитать названия из закрытых разделов.")
        locked = decrypt_locked(a.password)

    def portrait_set(folder, names, title):
        groups = {}
        unmatched = []
        for f in files(folder):
            hit = match(f.stem, names)
            if not hit:
                unmatched.append(f.name)
                continue
            for n in hit:
                groups.setdefault(n, []).append(f)
        out_dir = ROOT / "img" / "p"
        for n, fs in groups.items():
            k = key(n)
            entry = []
            for i, f in enumerate(fs):
                name = f"{k}{'' if i == 0 else '-' + str(i + 1)}.webp"
                w, h = convert(f, out_dir / name, 560, 74)
                entry.append({"src": f"img/p/{name}", "w": w, "h": h})
            portraits[k] = entry
        missing = [n for n in names if n not in groups]
        report.append((title, len(groups), unmatched, missing))

    if a.creatures:
        names = list(dict.fromkeys([c["n"] for c in locked["creatures"]] + [c["n"] for c in data["ancestors"]]))
        portrait_set(a.creatures, names, "Существа")
    if a.npcs:
        portrait_set(a.npcs, [r[0] for r in locked["society"]["npcs"] if r and r[0]], "НПС")
    if a.groups:
        names = list(dict.fromkeys([g["name"] for g in locked["society"]["groups"]] + [g["name"] for g in data["gods"]] + [d["name"] for d in data["demons"]]))
        portrait_set(a.groups, names, "Общины, боги, демоны")

    js = ("/* Сгенерировано tools/build_images.py */\n"
          "window.RACE_IMAGES = %s;\n"
          "/* существа, НПС, общины, боги и демоны: ключ — код названия (App.picKey) */\n"
          "window.PORTRAITS = %s;\n") % (json.dumps(race_imgs, ensure_ascii=False, separators=(",", ":")),
                                         json.dumps(portraits, ensure_ascii=False, separators=(",", ":")))
    OUT_JS.write_text(js, encoding="utf-8")
    for title, n, unmatched, missing in report:
        print(f"{title}: {n} с картинкой")
        if unmatched:
            print("  не сопоставлены (переименуйте или добавьте в ALIASES):", ", ".join(unmatched))
        if missing:
            print(f"  без картинки ({len(missing)}):", ", ".join(missing[:60]) + (" …" if len(missing) > 60 else ""))
    size = sum(f.stat().st_size for f in (ROOT / "img").rglob("*.webp"))
    print(f"Всего картинок на сайте: {size // 1024 // 1024} МБ")


if __name__ == "__main__":
    main()
