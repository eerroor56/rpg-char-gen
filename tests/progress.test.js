// Развитие персонажа после создания и «облако» в браузере (копия правил firestore.rules).
// Запуск: node tests/progress.test.js
global.window = global;
global.location = { search: '?cloud=local', hostname: 'localhost', origin: 'http://localhost', pathname: '/' };
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../data/data.js');
require('../js/config.js');
require('../js/rules.js');
const R = window.Rules;
R.init(window.GAME_DATA);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
window.App = { esc, cap: s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1), actions: {}, ui: {}, migrate: s => Object.assign(R.newState(), JSON.parse(JSON.stringify(s))), portrait: () => '', toast() {}, store: { get: (k, d) => d, set: () => true } };
require('../js/random.js');
require('../js/progress.js');
require('../js/cloud.js');
const Dev = window.Dev, C = window.Cloud, RH = window.RandomHero;

let fails = 0, passes = 0;
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', JSON.stringify(a), 'expected', JSON.stringify(b)); }
}

// ---- опыт и уровни: от L до L+1 нужно 100 × L
eq('no xp', Dev.levelsFromXp(50, 0).levels, 0);
eq('one level short', Dev.levelsFromXp(50, 4999).levels, 0);
eq('exactly one level', Dev.levelsFromXp(50, 5000), { levels: 1, level: 51, xpInto: 0, need: 5100 });
eq('two levels', Dev.levelsFromXp(50, 5000 + 5100 + 7).level, 52);
eq('level 1 → 2 costs 100 (пример из таблицы)', Dev.levelsFromXp(1, 100).level, 2);

// ---- герой: орк, взрослый
const st = Object.assign(R.newState(), { raceId: 'орки', ageCat: 'взрослый', name: 'Гром' });
RH.fill(st);
const res0 = R.compute(st);
eq('base hero valid', res0.errors.length, 0);
const L = res0.level;
const xp2 = 100 * L + 100 * (L + 1);
let rec = { state: st, gm: { xp: xp2 } };
let v = Dev.compute(rec);
eq('two levels from xp', v.res.level, L + 2);
eq('6 stat points', v.res.prog.statPoints, 6);
eq('unallocated warning', v.res.warnings.some(w => w.step === 'progress' && /характеристик/.test(w.msg)), true);
eq('creation level kept', v.res0.level, L);
rec.prog = { alloc: { t: 6, d: 0, s: 0, i: 0, l: 0 }, talents: {} };
v = Dev.compute(rec);
eq('alloc adds to body', v.res.stats.t - res0.stats.t >= 6, true);
eq('no stat warning after alloc', v.res.warnings.some(w => w.step === 'progress' && /характеристик/.test(w.msg)), false);
rec.prog.alloc.t = 7;
eq('over-allocation is an error', Dev.compute(rec).res.errors.some(e => e.step === 'progress'), true);
rec.prog.alloc.t = 6;

// ---- таланты: очко на каждом 5-м уровне
const toFive = 5 - (L % 5);
let xp = 0; for (let i = 0; i < toFive; i++) xp += 100 * (L + i);
v = Dev.compute({ state: st, gm: { xp }, prog: { alloc: { t: 3 * toFive }, talents: {} } });
eq('talent point at level multiple of 5', v.res.prog.talentPoints, 1);
eq('talent warning', v.res.warnings.some(w => /талантов/.test(w.msg)), true);
const tid = R.TALENTS.find(t => !t.base).id;
v = Dev.compute({ state: st, gm: { xp }, prog: { alloc: { t: 3 * toFive }, talents: { [tid]: 1 } } });
eq('talent spent', v.res.prog.talentSpent, 1);
eq('talent added', v.res.talents[tid].invUp, 1);
eq('no progress errors', v.res.errors.filter(e => e.step === 'progress').length, 0);

// ---- общины: сначала только бонус к статам
v = Dev.compute({ state: st, gm: { xp: 0, groups: [{ name: 'тест', kind: 'гильдия', st: ['10+', '5-', '*2', '0', ''] }] } });
eq('group add', v.res.stats.t - res0.stats.t, 10);
eq('group sub', v.res.stats.d - res0.stats.d, -5);
eq('group mul', v.res.stats.s, res0.stats.s * 2);

// ---- опыт за существо = его уровню
eq('xp for creature', Dev.xpFor(210, { der: { expPct: 0, expMul: 1 } }), 210);
eq('xp with +5% bonus', Dev.xpFor(200, { der: { expPct: 5, expMul: 1 } }), 210);

// ---- панель развития собирается без ошибок
window.App.ui = {};
const html = Dev.panel({ record: { state: st, gm: { xp: xp2 }, prog: { alloc: {}, talents: {} } }, perms: { gm: true, owner: true } }).html;
eq('panel shows level', html.includes('Уровень и опыт') && html.includes('Очки за новые уровни'), true);
const ro = Dev.panel({ record: { state: st, gm: { xp: 0 } }, perms: {} }).html;
eq('read-only panel has no grant buttons', ro.includes('data-act="devXp"'), false);

// ---- облако в браузере: те же правила, что в firestore.rules
(async () => {
  const denied = async (name, fn) => { try { await fn(); fails++; console.log('FAIL', name, 'was allowed'); } catch (e) { eq(name, e.code, 'permission-denied'); } };
  await C.init();
  eq('local mode', C.mode, 'local');
  eq('signed out', C.user, null);
  await C.signUp('Мастер', 'gm@test', 'x');
  const gmUid = C.uid();
  const cid = await C.createCampaign('Сумеречный тракт');
  const camp = C.camps[cid];
  eq('gm in members', camp.members, [gmUid]);
  const code = camp.code;
  await C.startSession(cid);

  await C.signUp('Петя', 'petya@test', 'x');
  const pUid = C.uid();
  await denied('outsider cannot read campaign', () => C.watchCampaign ? new Promise((ok, bad) => { const u = C.watchCampaign(cid, ok, bad); setTimeout(() => u(), 50); }) : null);
  eq('join', await C.joinCampaign(code), cid);
  eq('join twice is fine', await C.joinCampaign(code), cid);
  const chid = await C.createCharacter(cid, st, 'review');
  const ch = await new Promise(ok => { const u = C.watchCharacter(cid, chid, c => { u(); ok(c); }); });
  eq('owner set', [ch.owner, ch.ownerName, ch.status], [pUid, 'Петя', 'review']);
  eq('creation event has session', await new Promise(ok => { const u = C.watchEvents(cid, rows => { u(); ok(rows.find(e => e.chid === chid).session); }, null, { chid }); }), 1);
  await denied('player cannot grant xp', () => C.updateCharacter(cid, chid, { gm: { xp: 999 } }, 'хитрость'));
  await denied('player cannot approve', () => C.updateCharacter(cid, chid, { status: 'active' }, 'сам себя'));
  await denied('player cannot start session', () => C.startSession(cid));
  await C.updateCharacter(cid, chid, { status: 'draft' }, 'забирает');
  await C.updateCharacter(cid, chid, { notes: 'клятва' }, 'заметки');

  await C.signIn('gm@test', 'x');
  eq('gm back', C.uid(), gmUid);
  await C.updateCharacter(cid, chid, { status: 'active' }, 'ГМ утверждает');
  await C.updateCharacter(cid, chid, { gm: { xp: xp2, groups: [], learned: [], items: [], gold: 10 } }, 'опыт');
  await C.savePrivate(cid, chid, 'секрет');

  await C.signIn('petya@test', 'x');
  await denied('player cannot change sheet after approval', () => C.updateCharacter(cid, chid, { state: Object.assign({}, st, { name: 'Другой' }) }, 'правка'));
  await denied('player cannot read gm notes', () => new Promise((ok, bad) => { C.watchPrivate(cid, chid, ok, bad); }));
  await C.updateCharacter(cid, chid, { prog: { alloc: { t: 6 }, talents: {} } }, 'распределил очки');
  const ch2 = await new Promise(ok => { const u = C.watchCharacter(cid, chid, c => { u(); ok(c); }); });
  eq('player progression saved', [ch2.prog.alloc.t, ch2.gm.gold, ch2.status], [6, 10, 'active']);
  await denied('player cannot delete approved character', () => C.deleteCharacter(cid, chid, 'Гром'));

  await C.signUp('Вася', 'vasya@test', 'x');
  await denied('stranger cannot write events', () => C.note(cid, 'спам'));
  await denied('stranger cannot read characters', () => new Promise((ok, bad) => { C.watchCharacters(cid, ok, bad); }));
  await C.joinCampaign(code);
  await C.rename('Василий');
  await C.syncName(Object.assign({ id: cid }, await new Promise(ok => { const u = C.watchCampaign(cid, c => { u(); ok(c); }); })));
  eq('member renamed in campaign', (await new Promise(ok => { const u = C.watchCampaign(cid, c => { u(); ok(c); }); })).memberNames[C.uid()], 'Василий');
  await denied('member cannot rename others', () => C.updateCampaign(cid, { ['memberNames.' + pUid]: 'Пётр' }));
  await denied('member cannot rename campaign', () => C.updateCampaign(cid, { name: 'Моя' }));
  await denied('member cannot edit someone else\'s character', () => C.updateCharacter(cid, chid, { notes: 'чужое' }, 'чужое'));
  await C.leaveCampaign(cid);
  eq('left', (await new Promise(ok => { const u = C.watchMyCampaigns(rows => { u(); ok(rows.length); }); })), 0);

  await C.signIn('gm@test', 'x');
  await C.endSession(cid, 'дошли до тракта');
  const code2 = await C.newCode(cid);
  eq('new code differs', code2 !== code, true);
  await C.signIn('petya@test', 'x');
  await denied('player cannot delete campaign', () => C.deleteCampaign(cid));
  await C.signIn('gm@test', 'x');
  await C.deleteCampaign(cid);
  eq('campaign deleted', (await new Promise(ok => { const u = C.watchMyCampaigns(rows => { u(); ok(rows.length); }); })), 0);
  eq('nothing left', Object.keys(JSON.parse(mem['hero-workshop:cloud-local']).docs).length, 0);

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
