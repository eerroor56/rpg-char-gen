/*
 * Права доступа к онлайн-игре: копия firestore.rules в js/cloud.js (локальный режим ?cloud=local) и то, как
 * сайт пользуется облаком. Настоящий Firestore здесь не запускается — это проверка логики правил и клиента.
 * Запуск: node tests/cloud.test.js
 */
'use strict';
const path = require('path');

const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.location = { search: '?cloud=local' };
global.window = global;
window.Rules = { compute: () => ({ race: null, level: 0, ok: true }) };
window.App = { migrate: s => s, toast() {} };
require(path.join(__dirname, '..', 'js', 'cloud.js'));
const C = window.Cloud;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const denied = async (name, fn) => { try { await fn(); fail++; console.log('FAIL (не запрещено)', name); } catch (e) { ok(name, e && e.code === 'permission-denied'); } };
const allowed = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL (запрещено)', name, e && e.message); } };
const as = async email => { await C.signIn(email, 'x'); await new Promise(r => setTimeout(r, 5)); };
const raw = () => JSON.parse(localStorage.getItem('hero-workshop:cloud-local')).docs;

(async () => {
  await C.init();
  await as('gm@test');
  const gmUid = C.uid();
  const cid = await C.createCampaign('Проверка');
  const code1 = raw()['campaigns/' + cid].code;

  // ---- вход в кампанию
  await as('p1@test');
  const p1 = C.uid();
  await allowed('игрок входит по коду', () => C.joinCampaign(code1));
  ok('игрок в участниках', raw()['campaigns/' + cid].members.includes(p1));

  await as('p2@test');
  // без кода, зная только адрес кампании
  await denied('вход без кода по адресу кампании', () => C.updateCampaign(cid, { members: C.op.union([C.uid()]), ['memberNames.' + C.uid()]: 'x' }));
  await denied('вход с неверным кодом', () => C.updateCampaign(cid, { members: C.op.union([C.uid()]), ['memberNames.' + C.uid()]: 'x', ['joinedWith.' + C.uid()]: 'ZZZZZZ' }));

  // ГМ исключает игрока — код приглашения меняется сам (уточнение ГМ): старым кодом и адресом не вернуться
  await as('gm@test');
  await C.myCampaigns();
  await allowed('ГМ исключает игрока', () => C.removeMember(cid, p1));
  const code2 = raw()['campaigns/' + cid].code;
  ok('при исключении код сменился', code2 && code2 !== code1);
  ok('старый код удалён', !raw()['joinCodes/' + code1] && !!raw()['joinCodes/' + code2]);
  ok('исключённого нет в участниках', !raw()['campaigns/' + cid].members.includes(p1));
  await as('p1@test');
  await denied('исключённый: старый код в joinedWith', () => C.updateCampaign(cid, { members: C.op.union([p1]), ['memberNames.' + p1]: 'p1', ['joinedWith.' + p1]: code1 }));
  await denied('исключённый: без кода', () => C.updateCampaign(cid, { members: C.op.union([p1]), ['memberNames.' + p1]: 'p1' }));
  let msg = '';
  try { await C.joinCampaign(code1); } catch (e) { msg = e.message; }
  ok('старый код больше не находит кампанию', /нет/.test(msg));
  await allowed('по новому коду — можно', () => C.joinCampaign(code2));

  // ---- персонажи
  const st = { name: 'Тест', raceId: '' };
  await denied('игрок создаёт персонажа сразу с деньгами', () => C.createCharacter(cid, st, 'review', { purse: { з: 1000 } }));
  await denied('игрок создаёт персонажа с предметами', () => C.createCharacter(cid, st, 'review', { made: [{ t: 'a', item: { name: 'меч' } }] }));
  await denied('игрок создаёт персонажа с выдачей ГМ', () => C.createCharacter(cid, st, 'review', { gm: { xp: 9999 } }));
  await denied('игрок создаёт персонажа сразу «в игре»', () => C.createCharacter(cid, st, 'active'));
  let chid;
  await allowed('игрок создаёт персонажа с картинкой', async () => { chid = await C.createCharacter(cid, st, 'review', { pic: '' }); });

  await as('gm@test');
  await allowed('ГМ утверждает', () => C.updateCharacter(cid, chid, { status: 'active', gm: { xp: 0, wallet: { з: 10, other: [] } } }));

  await as('p1@test');
  await denied('игрок меняет выданное ГМ (gm)', () => C.updateCharacter(cid, chid, { gm: { xp: 100000 } }));
  await denied('игрок меняет лист после утверждения', () => C.updateCharacter(cid, chid, { state: { name: 'x' } }));
  await denied('игрок сам себя «оживляет»/меняет статус', () => C.updateCharacter(cid, chid, { status: 'review' }));
  await denied('игрок меняет свои ХП в бою (vit)', () => C.updateCharacter(cid, chid, { vit: { hp: 999 } }));
  await denied('игрок добавляет себе денег (purse +)', () => C.updateCharacter(cid, chid, { purse: { з: 5 } }));
  await allowed('игрок платит (purse −)', () => C.updateCharacter(cid, chid, { purse: { з: -1 } }));
  await allowed('игрок разменивает монету (сумма та же)', () => C.updateCharacter(cid, chid, { purse: { з: -2, се: 100 } }));
  await denied('размен «с прибылью»', () => C.updateCharacter(cid, chid, { purse: { з: -2, се: 101 } }));
  await allowed('игрок двигает свою фишку', () => C.updateCharacter(cid, chid, { pos: { x: 1, y: 2 } }));

  // чужой персонаж
  await as('p3@test');
  await denied('не участник читает персонажей', () => new Promise((res, rej) => { const off = C.watchCharacters(cid, rows => { off(); res(rows); }, e => { off(); rej(e); }); }));
  await denied('не участник читает кампанию', () => new Promise((res, rej) => { const off = C.watchCampaign(cid, c => { off(); res(c); }, e => { off(); rej(e); }); }));
  await allowed('третий игрок входит по коду', () => C.joinCampaign(code2));
  await denied('игрок меняет чужого персонажа', () => C.updateCharacter(cid, chid, { notes: 'взлом' }));
  await denied('игрок удаляет чужого персонажа', () => C.deleteCharacter(cid, chid, 'Тест'));
  await denied('игрок меняет кампанию (ГМ-поля)', () => C.updateCampaign(cid, { name: 'моя' }));
  await denied('игрок пишет заметки ГМ', () => C.savePrivate(cid, '_campaign', 'x'));
  await denied('игрок начинает сессию', () => C.startSession(cid));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
