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
require('../js/craft.js');
require('../js/progress.js');
require('../js/inventory.js');
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

// ---- кастомное снаряжение (лист «механики»: ковка, крафтильня)
const K = window.Craft;
const ctxN = { sizeK: 1, stats: { t: 100, d: 100, s: 100, i: 100, l: 100 } };
const sword = parts => ({ id: 'x', kind: 'weapon', base: 'длинный меч', craft: { parts } });
let c = K.compute(sword([{ mat: 'сталь', u: 2, role: 'dmg' }, { mat: 'мифрил', u: 1, role: 'dmg' }, { mat: 'сталь', u: 1.5, role: 'non' }]), ctxN);
eq('mixed damage 2×11 + 1×36', c.damage, 58);
eq('mixed: no unit warnings', c.warnings, []);
eq('steel per-unit effect × 3,5 ед.', c.effects.find(e => /^сталь/.test(e.src)).text, '18% оглушить');
eq('mithril effect once', c.effects.some(e => /^мифрил/.test(e.src) && /мультиатаку/.test(e.text)), true);
c = K.compute(sword([{ mat: 'сталь', u: 2.6, role: 'dmg' }, { mat: 'мифрил', u: 0.4, role: 'dmg' }, { mat: 'сталь', u: 1.5, role: 'non' }]), ctxN);
eq('under half an ingot: no effect', c.effects.some(e => /^мифрил/.test(e.src)), false);
eq('under half an ingot: still adds damage', c.damage, Math.round(2.6 * 11 + 0.4 * 36));
c = K.compute(sword([{ mat: 'сталь', u: 2, role: 'dmg' }]), ctxN);
eq('unit shortage warned', c.warnings.length, 2);
const s3 = [{ mat: 'сталь', u: 3, role: 'dmg' }, { mat: 'сталь', u: 1.5, role: 'non' }];
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: s3, sharpen: 2 } }, ctxN);
eq('sharpen ×2 = +50%', c.damage, Math.round(33 * 1.5));
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: s3, quality: 3, coat: ['серебро'] } }, ctxN);
eq('enhanced craft 3Х', c.damage, 99);
eq('coating gives metal effect', c.effects.some(e => /напыление: серебро/.test(e.src)), true);
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: [{ mat: 'сфалерит', u: 3, role: 'dmg' }, { mat: 'таумий', u: 1.5, role: 'non' }], glyphs: [{ sym: 'огонь' }, { sym: 'лёд' }, { sym: 'тьма' }, { sym: 'свет' }] } }, ctxN);
eq('sphalerite +2 glyphs', c.glyphMax, 5);
eq('thaumium doubles glyph power: 105 × 50% × 2', c.glyphPower, 105);
eq('4 glyphs within limit', c.warnings.some(w => /Глифов/.test(w)), false);
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: [{ mat: 'рубин', u: 3, role: 'dmg' }, { mat: 'рубин', u: 1.5, role: 'non' }], modules: ['пружина'] } }, ctxN);
eq('crystal weapon', c.crystal, true);
eq('crystal weapon has no module sockets', c.warnings.some(w => /гнёзд/.test(w)), true);
c = K.compute({ kind: 'armor', base: 'тяжёлая кирса', craft: { parts: [{ mat: 'сталь', u: 8 }, { mat: 'мифрил', u: 8 }] } }, ctxN);
eq('mixed armor 8×30 + 8×100', c.armor, 1040);
eq('mithril halves armour agility penalty', c.pen, 5);
eq('cuirass goes on body', c.cat, 'body');
c = K.compute({ kind: 'weapon', base: 'длинный меч', size: 'г', craft: { parts: s3 } }, { sizeId: 'н', stats: ctxN.stats });
eq('giant-sized sword needs 3 × 1,4 → 4 units', c.needDmg, 4);
eq('size mismatch noted', c.notes.some(n => /рост/.test(n)), true);
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: s3 } }, { sizeId: 'г', stats: ctxN.stats });
eq('items do not follow the wearer size', c.needDmg, 3);
eq('one item — one inventory slot', c.slots, 1);
eq('table «slots» = gem sockets', c.sockets, 2);
c = K.compute({ kind: 'weapon', base: 'длинный меч', craft: { parts: s3, inlays: ['рубин', 'сапфир', 'алмаз'] } }, ctxN);
eq('too many gems warned', c.warnings.some(w => /гнёзд/.test(w)), true);
eq('bag takes no slot', K.compute({ kind: 'item', name: 'малая сумка' }, ctxN).slots, 0);
// стартовое снаряжение в инвентаре = расчёт мастера
let mism = 0;
for (let i = 0; i < 200; i++) {
  const h = RH.full(), r0 = R.compute(h);
  const inv = K.startInventory(h, r0);
  const cx = { sizeId: r0.size ? r0.size.id : 'н', stats: r0.stats, halfReq: r0.race.id === 'гомункулы', race: r0.race, oniClan: h.oniClan, flags: r0.flags };
  const e2 = K.equipStats(inv.items, inv.equip, cx, r0.hands);
  const w = e2.weapons.find(x => x.kind === 'weapon');
  if (r0.gear.weapon && r0.gear.weapon.m && (!w || w.damage !== r0.gear.weapon.damageTotal)) mism++;
  if (R.ri(r0.stats.l + e2.statFx.l - e2.pen) !== r0.der.dodge || e2.slotsUsed !== r0.der.slotsUsed) mism++;
}
eq('start gear in inventory matches the wizard', mism, 0);
// надеть: двуручное занимает две руки, новое оружие вытесняет его целиком
const slots = K.slotsFor(2);
const two = { id: 'a', kind: 'weapon', base: 'двуручный меч', craft: { parts: [] } };
let r = window.Inv.equipInto({}, two, { cat: 'hand', hands: 2 }, null, slots);
eq('two-hander takes both hands', [r.equip.hand1, r.equip.hand2], ['a', 'a']);
r = window.Inv.equipInto(r.equip, { id: 'b', kind: 'weapon' }, { cat: 'hand', hands: 1 }, 'hand1', slots);
eq('new weapon displaces two-hander', [r.equip.hand1, r.equip.hand2 || null, r.displaced], ['b', null, ['a']]);
r = window.Inv.equipInto({}, { id: 'r', kind: 'jewelry' }, { cat: 'ring' }, null, slots);
eq('ring goes to first ring slot', r.equip.ring1, 'r');
eq('10 ring slots', slots.filter(x => x.cat === 'ring').length, 10);
// состояния от ГМ меняют статы, кошелёк переносит старое золото
v = Dev.compute({ state: st, gm: { effects: [{ id: 'e1', kind: 'disease', name: 'кости-хрящи', mods: K.parseStatMods('ловкость +20 / -40 тело') }] } });
eq('disease mods applied', [v.res.stats.l - res0.stats.l, v.res.stats.t - res0.stats.t], [20, -40]);
v = Dev.compute({ state: st, gm: { gold: 7 } });
eq('legacy gold → wallet', v.inv.wallet.з, 7 + (res0.der.gold || 0));
eq('money formatting', K.money(1050203), '1 пл 5 з 2 се 3 м');
eq('price parsing', K.priceCopper('1(з),50(се)'), 15000);
eq('drop parsing', K.parseDrop('перо 10, серебро'), [{ name: 'перо', qty: 10 }, { name: 'серебро', qty: 1 }]);
eq('stat mods: «сила/ловкость-20»', K.parseStatMods('сила/ловкость-20').map(m => m.stat + m.v), ['s-20', 'l-20']);
eq('stat mods: «дух -2Х» halves', K.parseStatMods('дух -2Х')[0].v, 0.5);
eq('stat mods: percent ignored', K.parseStatMods('ловкость +20%'), []);

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
