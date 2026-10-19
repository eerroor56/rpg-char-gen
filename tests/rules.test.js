// Запуск: node tests/rules.test.js
// С паролем ГМ (GM_PASSWORD=... node tests/rules.test.js) дополнительно проверяются
// расшифровка закрытых разделов и расчёты, которым нужен бестиарий.
global.window = {};
require('../data/data.js');
require('../js/config.js');
require('../js/rules.js');
const R = window.Rules;
R.init(window.GAME_DATA);
const fs = require('fs'), path = require('path'), nodeCrypto = require('crypto'), zlib = require('zlib');

function unlockForTests(password) {
  const w = {};
  new Function('window', fs.readFileSync(path.join(__dirname, '../data/locked.js'), 'utf8'))(w);
  const L = w.GAME_LOCKED;
  const key = nodeCrypto.pbkdf2Sync(password, Buffer.from(L.salt, 'base64'), L.iter, 32, 'sha256');
  const ct = Buffer.from(L.ct, 'base64');
  const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(L.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  let plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  if (L.gz) plain = zlib.gunzipSync(plain);
  const x = JSON.parse(plain.toString('utf8'));
  const D = window.GAME_DATA;
  Object.assign(D, { creatures: x.creatures, creatureUpgrades: x.creatureUpgrades, creatureLegend: x.creatureLegend, society: x.society, artifacts: x.artifacts, mechanics: x.mechanics });
  Object.assign(D.skills, x.skills); Object.assign(D.alchemy, x.alchemy);
  R.init(D);
}
let fails = 0, passes = 0;
function eq(name, a, b) {
  const ok = typeof b === 'number' ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', a, 'expected', b); }
}
function st(o) { return Object.assign(R.newState(), o); }

// 1. Пример из ТЗ: 100 лвл, старец +100% → 200 лвл, +300 очков, всего 600
// Ищем расу с уровнем ровно 100: цахилгаан (140+85+30+35+35-25)/3 = 100
let s = st({ raceId: 'цахилгаан', ageCat: 'старец', agePct: 100 });
let r = R.compute(s);
eq('lvl0', r.lvl0, 100);
eq('level', r.level, 200);
eq('agePoints', r.agePoints, 300);
eq('total points = level*3', r.level * 3, 600);
eq('talentPoints', r.talentPoints, 40);
eq('od elder: только прибавка (возраст −1, размер б 0)', r.der.od, -1);
// 2. Распределение
s.alloc = { t: 100, d: 100, s: 100, i: 0, l: 0 };
r = R.compute(s);
eq('allocSum', r.allocSum, 300);
eq('stat t (без бонуса фракции)', r.stats.t, 240);
eq('no stats error', r.errors.filter(e => e.step === 'stats').length, 0);
// 3. Ребёнок -50%: снимаем очки
s = st({ raceId: 'империал', ageCat: 'ребёнок', agePct: -50 });
r = R.compute(s);
eq('child level integer (53 × 0,5 = 26,5 → 27)', r.level, 27);
eq('child points = 3 × (27 − 53)', r.agePoints, -78);
eq('child od', r.der.od, 2);
eq('child talents', r.talentPoints, 5);
s.traits = ['сильный'];
r = R.compute(s);
eq('child no traits', r.errors.some(e => e.step === 'traits'), true);
// 4. Черты: баланс
s = st({ raceId: 'империал', ageCat: 'взрослый', religion: 0, traits: ['сильный', 'крепкий'] });
r = R.compute(s);
eq('unbalanced', r.errors.some(e => /Баланс/.test(e.msg)), true);
s.traits.push('немота');
r = R.compute(s);
eq('немота балансирует 2', r.errors.some(e => e.step === 'traits'), false);
eq('stat s with сильный', r.stats.s, 30);
s.traits = ['сильный', 'слабый'];
r = R.compute(s);
eq('opposite pair', r.errors.some(e => /противоположны/.test(e.msg)), true);
// 5. Лимит черт юный = 2
s = st({ raceId: 'империал', ageCat: 'юный', agePct: -25, traits: ['сильный', 'крепкий', 'мозговитый', 'щуплый', 'слабый духом', 'неуклюжий'] });
r = R.compute(s);
eq('young limits', r.errors.filter(e => e.step === 'traits').length >= 2, true);
// 6. Калека 2 конечности = 4 положительных
s = st({ raceId: 'империал', ageCat: 'взрослый', traits: ['калека', 'сильный', 'крепкий', 'мозговитый', 'проворный'], traitOpt: { arms: 1, legs: 1 } });
r = R.compute(s);
eq('калека x2', r.traits.balanceCap, 4);
eq('калека ok', r.errors.filter(e => e.step === 'traits').length, 0);
eq('hands after калека', r.hands, 1);
// 7. Гомункулы: +3 свободных, без благословений
s = st({ raceId: 'гомункулы', ageCat: 'взрослый', traits: ['сильный', 'крепкий', 'мозговитый'], boon: { kind: 'buff', name: 'могущество' } });
r = R.compute(s);
eq('homunculus free', r.traits.free, 3);
eq('homunculus traits ok', r.errors.filter(e => e.step === 'traits').length, 0);
eq('homunculus no buff', r.errors.some(e => e.step === 'boon'), true);
// 8. Нежить
s = st({ raceId: 'империал', ageCat: 'взрослый', religion: 0, boon: { kind: 'gift', name: 'Нежить' } });
r = R.compute(s);
eq('нежить s', r.stats.s, 60); eq('нежить t', r.stats.t, 100); eq('нежить i (17,5 → 18)', r.stats.i, 18); eq('нежить d', r.stats.d, 25);
// 9. Весы
s = st({ raceId: 'империал', ageCat: 'взрослый', religion: 0, boon: { kind: 'gift', name: 'весы' }, boonOpt: { swapA: 's', swapB: 't' } });
r = R.compute(s);
eq('весы', [r.stats.s, r.stats.t], [50, 20]);
// 10. Фракция и религия на старте не выдаются — бонусов общины нет
s = st({ raceId: 'тифлинги', ageCat: 'взрослый' });
r = R.compute(s);
eq('no faction at start', r.aff.faction, null);
eq('no religion at start', r.aff.religion, null);
eq('tiefling t without faction', r.stats.t, 250);
eq('no affiliation errors', r.errors.filter(e => e.step === 'aff').length, 0);
// 10a. Возраст: пожилой +50%, старец +100% — верхняя граница
eq('elder clamp', R.compute(st({ raceId: 'цахилгаан', ageCat: 'старец', agePct: 200 })).level, 200);
eq('old fixed +50%', R.compute(st({ raceId: 'цахилгаан', ageCat: 'пожилой', agePct: 90 })).agePoints, 150);
// 10b. Эффект материала «за единицу» × общее число единиц (влияющие + не влияющие на урон)
s = st({ raceId: 'империал', ageCat: 'взрослый', weapon: { name: 'короткий меч', mat: 'сталь' } });
r = R.compute(s);
eq('short sword units total', r.gear.weapon.unitsTotal, 3);
eq('per-unit effect × total units', r.gear.weapon.matEffect.total, '15% оглушить');
// 10c. Справочник закрыт, но всё для создания доступно без пароля
eq('locked by default', R.isLocked(), true);
s = st({ raceId: 'дракониды', ageCat: 'взрослый', ancestor: 'виверна' });
r = R.compute(s);
eq('dragonid ancestor without password', !!(r.race.ancestor && r.race.ancestor.creature), true);
eq('dragonid size', r.size.id, 'н');
eq('dragonid +10% предка', r.stats.t, 250 + 50);
eq('dragonid no race errors', r.errors.filter(e => e.step === 'race').length, 0);
r = R.compute(st({ raceId: 'таррэ', ageCat: 'взрослый', ancestor: 'аль-каркаданн' }));
eq('tarre ancestor +10%', r.race.ancestor.add.t, 15);
r = R.compute(st({ raceId: 'таррэ', ageCat: 'взрослый', ancestor: 'нет такого' }));
eq('tarre unknown ancestor is error', r.errors.some(e => /нет среди возможных предков/.test(e.msg)), true);
eq('no bosses among ancestors', window.GAME_DATA.ancestors.some(c => c.sec === 'Боссы' || c.sec === 'легенды'), false);
eq('insect ancestors', window.GAME_DATA.ancestors.filter(c => c.ins).length > 20, true);
const art0 = R.roll('artifact');
eq('artifact roll named without password', /^артефакт №/.test(art0.v) || !art0.detail, false);
eq('legacy artifact roll resolved', R.rollView({ idx: 0, v: 'артефакт №1', n: 1 }).v, window.GAME_DATA.artifactPool[0].name);
eq('prev-exp lists public', window.GAME_DATA.skills.startActives.length > 50 && window.GAME_DATA.skills.startStances.length > 10, true);
r = R.compute(st({ raceId: 'эноши', ageCat: 'взрослый', ancestor: 'империал' }));
eq('enoshi non-beast ancestor warned', r.warnings.some(e => /не звериная/.test(e.msg)), true);
// 11. Полукровка
s = st({ raceId: 'полукровка', parentA: 'империал', parentB: 'норды', hbSize: 'н', hbAlign: 'нейтрал', ageCat: 'взрослый' });
r = R.compute(s);
eq('half t (62,5 → 63)', r.stats.t, 63);
eq('half attr', r.der.attr, -20);
eq('half charisma', r.talents['харизма'].bonus, 12);
// 12. Размер и оружие: гоблин (малый) длинный меч из стали
s = st({ raceId: 'гоблины', ageCat: 'взрослый', weapon: { name: 'длинный меч', mat: 'сталь' }, armor: { name: 'тяжёлая кирса', mat: 'жизни камень' } });
r = R.compute(s);
eq('goblin size', r.size.id, 'м');
eq('goblin od', r.der.od, 1);
eq('sword dmg (3 × 0,6 = 1,8 → 2 ед.)', r.gear.weapon.damage, 11 * 2);
eq('sword req s — как в таблице', r.gear.weapon.req.find(x => x.stat === 's').need, 25);
eq('armor (16 × 0,6 = 9,6 → 10 ед.)', r.gear.armor.armor, 9 * 10);
eq('armor hp regen per unit', r.gear.hpRegenMod, 10);
// 13. Расовый бонус оружия (орки секиры +30)
s = st({ raceId: 'орки', ageCat: 'взрослый', weapon: { name: 'секира', mat: 'железо' } });
r = R.compute(s);
eq('orc axe', r.gear.weapon.damageTotal, 9 * 7 + 30);
// 15. Зелье > 50
s = st({ raceId: 'империал', ageCat: 'взрослый', items: [{ kind: 'potion', effect: 'лечение (хп)', power: 60 }, { kind: 'bag', name: 'малая сумка' }, { kind: 'bag', name: 'малая сумка' }] });
r = R.compute(s);
eq('potion > 50', r.errors.some(e => /не сильнее/.test(e.msg)), true);
eq('duplicate items', r.errors.some(e => /дважды/.test(e.msg)), true);
eq('bag slots (сила 20 + 2 сумки)', r.der.slots, 20 + 10);
// 16. Шакше без оружия
s = st({ raceId: 'шакше', ageCat: 'взрослый', weapon: { name: 'нож', mat: 'сталь' } });
r = R.compute(s);
eq('shakshe no weapon', r.errors.some(e => /не могут держать/.test(e.msg)), true);
// 17. Таланты
s = st({ raceId: 'хоббиты', ageCat: 'взрослый', talents: { 'скрытность': 5 } });
r = R.compute(s);
eq('hobbit stealth', r.talents['скрытность'].total, 10);
eq('talent points', r.talentPoints, 10);
// 18. Все расы считаются без исключений
let bad = 0;
for (const race of window.GAME_DATA.races) {
  for (const age of ['ребёнок', 'юный', 'взрослый', 'пожилой', 'старец']) {
    try { R.compute(st({ raceId: race.id, ageCat: age, agePct: window.GM_CONFIG.AGE_RANGES[age].def })); } catch (e) { bad++; console.log('ERR', race.id, age, e.message); }
  }
}
eq('all races compute', bad, 0);
// все дары/болезни/черты
for (const g of window.GAME_DATA.skills.gifts) { try { R.compute(st({ raceId: 'империал', ageCat: 'взрослый', boon: { kind: 'gift', name: g.name } })); } catch (e) { bad++; console.log('ERR gift', g.name, e.message); } }
for (const g of window.GAME_DATA.skills.buffs) { try { R.compute(st({ raceId: 'империал', ageCat: 'взрослый', boon: { kind: 'buff', name: g.name } })); } catch (e) { bad++; console.log('ERR buff', g.name, e.message); } }
for (const w of window.GAME_DATA.gear.weapons) for (const m of window.GM_CONFIG.START_MATERIALS) { try { R.compute(st({ raceId: 'империал', ageCat: 'взрослый', weapon: { name: w.name, mat: m } })); } catch (e) { bad++; console.log('ERR w', w.name, m, e.message); break; } }
for (const a of window.GAME_DATA.gear.armor.concat(window.GAME_DATA.gear.shields)) for (const m of window.GM_CONFIG.START_MATERIALS) { try { R.compute(st({ raceId: 'империал', ageCat: 'взрослый', armor: { name: a.name, mat: m } })); } catch (e) { bad++; console.log('ERR a', a.name, m, e.message); break; } }
for (const k of ['artifact', 'element', 'parts', 'beasts', 'curse', 'replicantTrait']) { const x = R.roll(k); if (!x || !x.v) { bad++; console.log('roll fail', k); } }
eq('all items compute', bad, 0);
// BOON_FX ключи существуют в данных
const I = R.index;
for (const k of Object.keys(R.BOON_FX.gift)) if (!I.gift.has(k)) console.log('WARN no gift', k);
for (const k of Object.keys(R.BOON_FX.buff)) if (!I.buff.has(k)) console.log('WARN no buff', k);
for (const k of Object.keys(R.BOON_FX.disease)) if (!I.disease.has(k)) console.log('WARN no disease', k);
for (const k of Object.keys(R.TRAIT_FX)) if (!I.traitPos.has(k) && !I.traitNeg.has(k)) console.log('WARN no trait', k);
// 18a. Уровни целые
eq('race levels are integers', window.GAME_DATA.races.every(x => Number.isInteger(x.lvl)), true);
r = R.compute(st({ raceId: 'империал', ageCat: 'юный', agePct: -25 }));
eq('young level 39,75 → 40', r.level, 40);
eq('young points', r.agePoints, -39);
r = R.compute(st({ raceId: 'полукровка', parentA: 'империал', parentB: 'хоббиты', hbSize: 'н', hbAlign: 'нейтрал', ageCat: 'взрослый' }));
eq('half level integer', Number.isInteger(r.lvl0), true);
// 18b. Зоркость: база 50 и бонусы отдельно, вложить можно до 100
r = R.compute(st({ raceId: 'империал', ageCat: 'взрослый', traits: ['зоркий', 'слабый'], talents: { 'зоркость (базовая 50)': 10 } }));
eq('zor max invest 100', r.talents['зоркость (базовая 50)'].maxInv, 100);
eq('zor total 50+10+10', r.der.zor, 70);
r = R.compute(st({ raceId: 'империал', ageCat: 'взрослый', talents: { 'зоркость (базовая 50)': 100 } }));
eq('zor 150 without cap error', r.errors.some(e => /Зоркость/.test(e.msg)), false);
eq('zor 150', r.der.zor, 150);
// 18c. Повторяющиеся черты
r = R.compute(st({ raceId: 'империал', ageCat: 'взрослый', traits: ['сильный', 'сильный', 'щуплый', 'глупость'] }));
eq('сильный ×2 = +20', r.stats.s, 40);
eq('repeat traits ok', r.errors.filter(e => e.step === 'traits').length, 0);
r = R.compute(st({ raceId: 'империал', ageCat: 'взрослый', traits: ['немота', 'немота'] }));
eq('немота not repeatable', r.errors.some(e => /несколько раз/.test(e.msg)), true);
r = R.compute(st({ raceId: 'империал', ageCat: 'взрослый', traits: ['резистентный', 'резистентный', 'уязвимый'], traitOpt: { resist: 'огонь', resist2: 'яд', vuln: 'яд' } }));
eq('resist #2 vs vuln contradiction', r.errors.some(e => /противоречие/.test(e.msg)), true);
r = R.compute(st({ raceId: 'империал', ageCat: 'старец', agePct: 100, traits: ['тайное знание', 'тайное знание', 'проклят'], traitOpt: { secretSymbol: 'огонь', secretSymbol2: 'вода' } }));
eq('two secret symbols', r.symbols.filter(x => /тайное/.test(x.src)).length, 2);
eq('curse2 roll', !!R.roll('curse2'), true);
// 18d. Расхититель: в пуле есть проклятые артефакты
const cursedIx = window.GAME_DATA.artifactPool.findIndex(a => a.cursed);
eq('cursed artifacts in pool', cursedIx > 0, true);
eq('cursed artifact roll label', R.rollView({ idx: cursedIx, v: 'артефакт №' + (cursedIx + 1), n: 1 }).block, 'проклятый артефакт');
// 18e. Пример ГМ: драконид с Драконом алого камня, длинный лук из стали
s = st({ raceId: 'дракониды', ageCat: 'взрослый', ancestor: 'Дракон алого камня',
  traits: ['ускоренное заживление', 'ускоренное заживление', 'медленные рефлексы', 'тугоумие'],
  weapon: { name: 'длинный лук', mat: 'сталь' } });
r = R.compute(s);
eq('GM: size гигантский', r.size.id, 'г');
eq('GM: T = 250 + 800', r.stats.t, 1050);
eq('GM: ancestor regen halved', r.race.ancestor.fx.hpRegenPct, 100);
eq('GM: hp regen 210 × 1,1 × 2 = 462', r.der.hpRegen, 462);
eq('GM: vampirism 30%', r.der.vamp, 30);
eq('GM: bow damage 6 × 1,4 → 8 ед. × 11 = 88', r.gear.weapon.damageTotal, 88);
eq('GM: units total 8 + 3 = 11', r.gear.weapon.unitsTotal, 11);
eq('GM: stun 5% × 11 = 55%', r.gear.weapon.matEffect.total, '55% оглушить');
r = R.compute(Object.assign(s, { weapon: { name: 'ужасающий лук', mat: 'сталь' } }));
eq('GM: terrifying bow needs 25 л', r.gear.weapon.req.find(x => x.stat === 'l').need, 25);
eq('GM: terrifying bow needs 35 с', r.gear.weapon.req.find(x => x.stat === 's').need, 35);
// 18f. Тифлинги: демонический предок даёт символ принадлежности
r = R.compute(st({ raceId: 'тифлинги', ageCat: 'взрослый' }));
eq('tiefling needs demon ancestor', r.errors.some(e => /предка/.test(e.msg)), true);
r = R.compute(st({ raceId: 'тифлинги', ageCat: 'взрослый', ancestor: 'Diarkon' }));
eq('tiefling demon symbol', r.symbols.some(x => /тьма/.test(x.name) && /Diarkon/.test(x.src)), true);
eq('8 demons public', (window.GAME_DATA.demons || []).length, 8);
r = R.compute(st({ raceId: 'асимару', ageCat: 'взрослый' }));
eq('asimaru needs god', r.errors.some(e => /предка|покровител/.test(e.msg)), true);
r = R.compute(st({ raceId: 'асимару', ageCat: 'взрослый', ancestor: 'Ульмар' }));
eq('asimaru god symbol', r.symbols.some(x => /вода/.test(x.name) && /Ульмар/.test(x.src)), true);
eq('asimaru one symbol', r.symbols.filter(x => /покровител|принадлежност/.test(x.name)).length, 1);
eq('gods from GM list only', R.patronList('god').length, 10);
eq('Культ Кометы is not a god', R.patronList('god').some(g => /комет/i.test(g.name)), false);
eq('иссар → гравитация', R.patronSymbol('иссар/луна'), 'гравитация');
eq('Gilltarro → хаос', R.patronSymbol('Gilltarro'), 'хаос');
r = R.compute(st({ raceId: 'тифлинги', ageCat: 'взрослый', ancestor: 'Gilltarro' }));
eq('tiefling Gilltarro symbol хаос', r.symbols.some(x => /хаос/.test(x.name)), true);
r = R.compute(st({ raceId: 'асимару', ageCat: 'взрослый', ancestor: 'Культ Кометы' }));
eq('asimaru non-god rejected', r.errors.some(e => /нет среди возможных предков/.test(e.msg)), true);
// баситины: одноручные мечи ×2
r = R.compute(st({ raceId: 'баситины', ageCat: 'взрослый', weapon: { name: 'длинный меч', mat: 'сталь' } }));
eq('basitin long sword x2', r.gear.weapon.damage, 11 * 3 * 2);
r = R.compute(st({ raceId: 'баситины', ageCat: 'взрослый', weapon: { name: 'гигантский меч', mat: 'сталь' } }));
eq('basitin two-handed sword not x2', r.gear.weapon.mul, undefined);
r = R.compute(st({ raceId: 'баситины', ageCat: 'взрослый', weapon: { name: 'паноптикум (шакрам с рукоятью меча)', mat: 'сталь' } }));
eq('basitin panopticum not x2', r.gear.weapon.mul, undefined);
// 18g. Нигде нет дробных чисел
let frac = [];
for (const race of window.GAME_DATA.races.filter(x => x.playable)) {
  const anc = { 'дракониды': 'Дракон алого камня', 'таррэ': 'аль-каркаданн', 'тифлинги': 'Estar' }[race.id] || '';
  for (const age of ['ребёнок', 'юный', 'взрослый', 'пожилой', 'старец']) {
    const x = R.compute(st({ raceId: race.id, ageCat: age, agePct: window.GM_CONFIG.AGE_RANGES[age].def, ancestor: anc, parentA: 'империал', parentB: 'хоббиты', hbSize: 'н', hbAlign: 'нейтрал',
      weapon: { name: 'нож', mat: 'кость' }, armor: { name: 'тяжёлая кирса', mat: 'камень' } }));
    const nums = { level: x.level, ...x.stats, hp: x.der.hp, hpRegen: x.der.hpRegen, mpRegen: x.der.mpRegen, dodge: x.der.dodge, zor: x.der.zor,
      dmg: x.gear.weapon ? x.gear.weapon.damageTotal : 0, arm: x.gear.armor ? x.gear.armor.armor : 0 };
    for (const [k, v] of Object.entries(nums)) if (!Number.isInteger(v)) frac.push(`${race.id}/${age}/${k}=${v}`);
  }
}
if (frac.length) console.log('fractions:', frac.slice(0, 10));
eq('no fractional results', frac.length, 0);
// 19. С паролем ГМ: расшифровка и бестиарий
if (process.env.GM_PASSWORD) {
  let wrong = false;
  try { unlockForTests(process.env.GM_PASSWORD + 'x'); } catch (e) { wrong = true; }
  eq('wrong password rejected', wrong, true);
  unlockForTests(process.env.GM_PASSWORD);
  eq('unlocked', R.isLocked(), false);
  eq('creatures loaded', window.GAME_DATA.creatures.length > 100, true);
  r = R.compute(st({ raceId: 'дракониды', ageCat: 'взрослый', ancestor: 'виверна' }));
  eq('dragonid same with password', r.stats.t, 250 + 50);
  // открытые списки совпадают с закрытыми разделами
  const full = window.GAME_DATA.artifacts.filter(a => a.g === 'артефакты').map(a => a.name);
  const cursedFull = window.GAME_DATA.artifacts.filter(a => a.g === 'проклятые').map(a => a.name);
  eq('artifact pool = artifacts + cursed', window.GAME_DATA.artifactPool.map(a => a.name), full.concat(cursedFull));
  eq('start actives = actives', window.GAME_DATA.skills.startActives.map(a => a.name), window.GAME_DATA.skills.actives.map(a => a.name));
  const crByName = new Map(window.GAME_DATA.creatures.map(c => [c.n, c]));
  eq('ancestor stats = bestiary', window.GAME_DATA.ancestors.every(a => { const c = crByName.get(a.n); return c && c.t === a.t && c.l === a.l && c.sz === a.sz; }), true);
} else console.log('(GM_PASSWORD не задан — проверки закрытых разделов пропущены)');
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
