// Новая версия на React пока пользуется логикой и данными прежнего сайта (правила, расчёт персонажа, облако):
// перед запуском и сборкой они копируются из корня репозитория в public/ — источник правды остаётся один.
import { cpSync, rmSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const pub = new URL('../public/', import.meta.url);
const copy = (from, to) => {
  rmSync(new URL(to, pub), { recursive: true, force: true });
  cpSync(new URL(from, root), new URL(to, pub), { recursive: true });
};

copy('data/', 'data/');
copy('img/', 'img/');
// QR-коды пожертвований не выкладываются, пока страница «Поддержать» выключена (app/src/flags.ts: пометка Safe Browsing)
rmSync(new URL('img/support/', pub), { recursive: true, force: true });
copy('js/', 'legacy/js/');
// страница пожертвований прежнего сайта новой версией не подключается, а пока «Поддержать» выключено — и не выкладывается
rmSync(new URL('legacy/js/support.js', pub), { force: true });
// стили прежнего сайта (css/) новой версии не нужны: всё на экране рисует React со своими стилями
rmSync(new URL('legacy/css/', pub), { recursive: true, force: true });
// приложение (PWA): манифест и service worker — общие с прежним сайтом
cpSync(new URL('manifest.webmanifest', root), new URL('manifest.webmanifest', pub));
cpSync(new URL('sw.js', root), new URL('sw.js', pub));
console.log('sync-legacy: data, img, js, manifest, sw.js → public/');
