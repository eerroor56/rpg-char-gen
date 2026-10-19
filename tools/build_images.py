#!/usr/bin/env python3
"""
Картинки рас для листа персонажа.

    pip install pillow
    python tools/build_images.py папка/с/картинками

Скрипт сопоставляет имена файлов с расами из data/data.js (регистр, «ё/е»,
опечатки в 1–2 буквы и названия в скобках не мешают: «саури.jpg» → «саури (аргониане)»),
уменьшает картинки до 900 px по длинной стороне, сохраняет в img/races/<имя>.webp
и пишет список в data/images.js. Файлы, которые не удалось сопоставить, выводятся
в конце — их можно переименовать или добавить в ALIASES ниже.

Чтобы заменить одну картинку: положите новую в ту же папку под именем расы
и запустите скрипт ещё раз.
"""
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "img" / "races"
OUT_JS = ROOT / "data" / "images.js"
MAX_SIDE = 900
QUALITY = 82

# имена файлов, которые не совпадают с названием расы в таблице
ALIASES = {
    "альтмеры": "высшие эльфы",
    "босмеры": "лесные эльфы",
    "фалмер": "морозные эльфы",
    "железный вайкул": "стальной вайкул",
}

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                     "u", "f", "kh", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def norm(s):
    return re.sub(r"[^a-zа-я0-9]+", " ", s.lower().replace("ё", "е")).strip()


def slug(s):
    s = "".join(TRANSLIT.get(c, c) for c in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "race"


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def load_races():
    src = (ROOT / "data" / "data.js").read_text(encoding="utf-8")
    data = json.loads(src[src.index("=") + 1:src.rstrip().rindex(";")])
    return data["races"]


def match(name, races):
    k = norm(ALIASES.get(norm(name), name))
    by_name = {r["id"]: norm(r["name"]) for r in races}
    for rid, nm in by_name.items():
        if nm == k:
            return rid
    for rid, nm in by_name.items():                     # «саури» → «саури (аргониане)»
        if nm.split(" ")[0] == k or nm.startswith(k + " "):
            return rid
    best = min(((lev(k, re.sub(r"\s*\(.*", "", nm)), rid) for rid, nm in by_name.items()), default=(99, None))
    return best[1] if best[0] <= 2 else None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    races = load_races()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest, unmatched = {}, []
    for f in sorted(src.iterdir()):
        if not f.is_file() or f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"):
            continue
        rid = match(f.stem, races)
        if not rid:
            unmatched.append(f.name)
            continue
        im = Image.open(f)
        im.seek(0)                                      # у анимированных — первый кадр
        im = ImageOps.exif_transpose(im)
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")
        w, h = im.size
        if max(w, h) > MAX_SIDE:
            s = MAX_SIDE / max(w, h)
            im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        name = slug(rid) + ".webp"
        im.save(OUT_DIR / name, "WEBP", quality=QUALITY, method=6)
        manifest[rid] = {"src": f"img/races/{name}", "w": im.width, "h": im.height}
    js = "/* Сгенерировано tools/build_images.py — картинки рас для листа персонажа */\nwindow.RACE_IMAGES = %s;\n" % json.dumps(
        manifest, ensure_ascii=False, separators=(",", ":"))
    OUT_JS.write_text(js, encoding="utf-8")
    total = sum((OUT_DIR / Path(v["src"]).name).stat().st_size for v in manifest.values())
    print(f"OK: {len(manifest)} картинок, {total // 1024} КБ → {OUT_DIR}")
    missing = [r["name"] for r in races if r["id"] not in manifest]
    if unmatched:
        print("Не сопоставлены (переименуйте или добавьте в ALIASES):", ", ".join(unmatched))
    if missing:
        print("Расы без картинки:", ", ".join(missing))


if __name__ == "__main__":
    main()
