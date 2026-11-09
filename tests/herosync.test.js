/*
 * «Мои герои» в облаке (js/herosync.js): старая копия из браузера не должна записываться поверх более новой из облака,
 * а неудавшаяся отправка — повторяется при следующем изменении. Облако здесь — заглушка. Запуск: node tests/herosync.test.js
 */
'use strict';
const path = require('path');

const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.window = global;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); return true; }
};
window.App = { store, toast() {}, tab: '' };
const sent = [];
let snap = null, failNext = false;
window.Cloud = {
  user: { uid: 'u1', name: 'Игрок' },
  configured: () => true,
  init: () => Promise.resolve(true),
  onAuth() {},
  watchHeroes(cb) { snap = cb; return () => {}; },
  putHeroes(docs) { sent.push(docs); if (failNext) { failNext = false; return Promise.reject(new Error('слишком большой')); } return Promise.resolve(); },
  errorText: e => e.message
};
const KEY = 'hero-workshop:heroes';
store.set('hero-workshop:heroes-owner', 'u1');
store.set(KEY, [{ id: 'h1', savedAt: 100, state: { name: 'Старый' } }]);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

require(path.join(__dirname, '..', 'js', 'herosync.js'));

(async () => {
  await wait(700);                         // HeroSync.start ждёт 600 мс
  ok('подписка на облако', !!snap);
  // правка в браузере до ответа сервера — не отправляется
  const l = store.get(KEY); l[0].state.name = 'Старый+'; store.set(KEY, l);
  await wait(500);
  ok('до ответа сервера ничего не отправлено', sent.length === 0);
  // снимок из кэша (без сети) — пустой; это не значит, что в облаке пусто
  snap([], { fromCache: true });
  await wait(500);
  ok('снимок из кэша не вызывает отправку', sent.length === 0);
  // сервер: в облаке новее (сохранено с телефона)
  snap([{ id: 'h1', savedAt: 200, deleted: false, data: JSON.stringify({ id: 'h1', savedAt: 200, state: { name: 'Новый с телефона' } }) }], { fromCache: false });
  await wait(50);
  ok('более новая версия из облака пришла в браузер', store.get(KEY)[0].state.name === 'Новый с телефона');
  ok('старая копия не ушла поверх новой', !sent.some(d => d.some(x => x.id === 'h1' && /Старый/.test(x.data))));

  // отправка не удалась — при следующем изменении уходит снова
  failNext = true;
  const l2 = store.get(KEY); l2[0].state.name = 'Правка 1'; l2[0].savedAt = 300; store.set(KEY, l2);
  await wait(500);
  ok('первая отправка была', sent.length === 1);
  await wait(50);
  ok('ошибка показана', window.HeroSync.status().err === 'слишком большой');
  const l3 = store.get(KEY); l3.push({ id: 'h2', savedAt: 310, state: { name: 'Второй' } }); store.set(KEY, l3);
  await wait(500);
  const last = sent[sent.length - 1] || [];
  ok('после ошибки герой отправлен снова', last.some(x => x.id === 'h1' && /Правка 1/.test(x.data)) && last.some(x => x.id === 'h2'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
