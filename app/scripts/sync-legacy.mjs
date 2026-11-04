// Новая версия на React пока пользуется логикой и данными прежнего сайта (правила, расчёт персонажа, облако):
// перед запуском и сборкой они копируются из корня репозитория в public/ — источник правды остаётся один.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const pub = new URL('../public/', import.meta.url);
const copy = (from, to) => {
  rmSync(new URL(to, pub), { recursive: true, force: true });
  cpSync(new URL(from, root), new URL(to, pub), { recursive: true });
};

copy('data/', 'data/');
copy('img/', 'img/');
copy('js/', 'legacy/js/');
copy('css/', 'legacy/css/');   // стили встроенных частей прежнего сайта (лист, инвентарь, кампания, бой)
// у прежнего сайта .page — его страница (ширина, отступы, заголовки и списки внутри); в новой версии .page — своя
// страница React, и эти правила ломали бы её, пока подключены старые стили. Встроенным кускам они не нужны.
const css = new URL('legacy/css/style.css', pub);
writeFileSync(css, readFileSync(css, 'utf8').replace(/\.page(?![\w-])/g, '.legacy-page'));
// приложение (PWA): манифест и service worker — общие с прежним сайтом
cpSync(new URL('manifest.webmanifest', root), new URL('manifest.webmanifest', pub));
cpSync(new URL('sw.js', root), new URL('sw.js', pub));
console.log('sync-legacy: data, img, js, css, manifest, sw.js → public/');
