/*
 * Правила создания персонажа.
 * Все расчёты — здесь; интерфейс только показывает результат.
 * Источник правил: таблица игрока (лист «настройка персонажа») и книга ГМ
 * (листы «механики», «скиллы», «материалы», «оружие и броня», «Социум», «Расы»).
 */
(function () {
  'use strict';
  const C = window.GM_CONFIG;
  let D = null;           // GAME_DATA
  const IX = {};          // индексы

  // ---------------------------------------------------------------- справочные константы правил

  const STATS = ['t', 'd', 's', 'i', 'l'];
  const STAT_NAMES = { t: 'Тело', d: 'Дух', s: 'Сила', i: 'Интеллект', l: 'Ловкость' };
  const STAT_SHORT = { t: 'Т', d: 'Д', s: 'С', i: 'И', l: 'Л' };
  const REQ_KEY = { 'т': 't', 'д': 'd', 'с': 's', 'и': 'i', 'л': 'l' };
  // «2л, 25с / 13» в таблице: до дроби — характеристики (→ «Л 2, С 25»), после — уровень навыка «ремесло»,
  // нужный, чтобы игрок изготовил предмет сам (item.skill)
  const reqText = req => Object.entries(req || {}).map(([k, v]) => `${STAT_SHORT[REQ_KEY[k]] || k.toUpperCase()} ${String(v).replace('.', ',')}`).join(', ');

  // Возраст (лист «настройка персонажа», Этап 1)
  const AGES = [
    { id: 'ребёнок', title: 'Ребёнок', range: 'от 0 до −50% от среднего уровня', od: 2, traits: 0,
      buff: '+2 ОД / +20% к хп и мп регену', limit: 'не может брать положительные и отрицательные черты на старте',
      regenMul: 1.2 },
    { id: 'юный', title: 'Юный', range: 'от −50% среднего уровня до среднего уровня', od: 1, traits: 2,
      buff: '+1 ОД / 50% резиста потери пси', limit: 'может взять до 2 положительных и 2 отрицательных черт' },
    { id: 'взрослый', title: 'Взрослый', range: 'средний указанный уровень', od: 0, traits: 3,
      buff: 'стандарт без особых эффектов', limit: '3 положительных и 3 отрицательных черты' },
    { id: 'пожилой', title: 'Пожилой', range: '+50% к среднему уровню', od: 0, traits: 4,
      buff: 'навыки и магия получают +50% эффективности / −20% сопротивления болезням', limit: '4 черты' },
    { id: 'старец', title: 'Старец', range: '+100% к среднему уровню (максимум)', od: -1, traits: 5,
      buff: 'навыки и магия получают +100% эффективности / −40% сопротивления болезням / −1 ОД', limit: '5 черт' }
  ];

  // Размеры (лист «механики», «размеры»)
  const SIZES = [
    { id: 'см', name: 'Совсем малый', k: 0.2, mat: 'на 80% меньше', od: 2, inc: 10, out: -5, fx: '+10% получаемого / −5% исходящего / +2 ОД' },
    { id: 'м', name: 'Малый', k: 0.6, mat: 'на 40% меньше', od: 1, inc: 10, out: -5, fx: '+10% получаемого / −5% исходящего / +1 ОД' },
    { id: 'с', name: 'Средний', k: 0.8, mat: 'на 20% меньше', od: 0, inc: 10, out: 0, fx: '+10% получаемого / не влияет на исходящий' },
    { id: 'н', name: 'Нормальный', k: 1, mat: 'без изменений', od: 0, inc: 0, out: 0, fx: 'без эффектов' },
    { id: 'б', name: 'Большой', k: 1.2, mat: 'на 20% больше', od: 0, inc: 0, out: 10, fx: '+10% исходящего / не влияет на получаемый' },
    { id: 'г', name: 'Гигантский', k: 1.4, mat: 'на 40% больше', od: -1, inc: -5, out: 10, fx: '+10% исходящего / −5% получаемого / −1 ОД' },
    { id: 'т', name: 'Титанический', k: 1.8, mat: 'на 80% больше', od: -2, inc: -5, out: 10, fx: '+10% исходящего / −5% получаемого / −2 ОД' }
  ];
  const SIZE_IX = Object.fromEntries(SIZES.map((s, i) => [s.id, i]));

  // Пассивные таланты (Этап 2): очко таланта за каждые 5 уровней
  const TALENTS = [
    { id: 'шахтёрство', name: 'Шахтёрство', max: 100 },
    { id: 'фермерство', name: 'Фермерство', max: 100 },
    { id: 'ремесло', name: 'Ремесло', max: 100 },
    { id: 'кулинария', name: 'Кулинария', max: 100 },
    { id: 'свежевание', name: 'Свежевание', max: 100 },
    { id: 'скрытность', name: 'Скрытность', max: 80 },
    { id: 'воровство', name: 'Воровство', max: 80 },
    { id: 'внимательность', name: 'Внимательность', max: 50 },
    { id: 'точность', name: 'Точность', max: 100 },
    { id: 'зоркость (базовая 50)', name: 'Зоркость', max: 100, base: 50 },
    { id: 'харизма', name: 'Харизма', max: 100 }
  ];

  // Предел таланта — «максимальный уровень» из таблицы пассивок, если он там есть (зоркость — 300 вместе с базой 50,
  // вложить можно 250); без данных — значения выше. Для таланта с базой возвращается предел вложенных очков
  function talentCap(t) {
    const info = (((window.GAME_DATA || {}).skills || {}).talentInfo || []).find(p => norm(p.name) === norm(t.id));
    if (!info || !info.max) return t.max;
    return t.base ? Math.max(0, info.max - t.base) : info.max;
  }

  // Черты можно брать повторно (эффекты складываются), кроме «состояний», которые не удваиваются
  const NON_REPEAT = ['язык зверей', 'язык монстров', 'шаманизм', 'лидер', 'немота', 'калека', 'обычный', 'несобранный'];
  const traitRepeatable = k => !NON_REPEAT.includes(norm(k));
  // параметр i-го экземпляра черты: resist, resist2, resist3…
  const optKey = (base, i) => (i ? base + (i + 1) : base);

  const KARMA_TEXT = 'персонажи добра получают +20 кармы / зла −20 / нейтралы стартуют с 0';

  // Черты: эффекты и противоположные пары (лист «скиллы», колонки P–R)
  const TRAIT_FX = {
    'быстрые рефлексы': { od: 2, opp: 'медленные рефлексы' },
    'второе дыхание': { opp: 'утомлённый' },
    'ускоренное заживление': { hpRegenPct: 5, opp: 'слабая регенерация' },
    'быстро обучаемый': { exp: 5, opp: 'тугоумие' },
    'потоки маны': { mpRegenPct: 5, opp: 'нечувствительность к потоку' },
    'чистое волшебство': { magPct: 10, opp: 'слабая магия', magic: true },
    'язык зверей': { ability: true }, 'язык монстров': { ability: true }, 'шаманизм': { ability: true },
    'зоркий': { zor: 10, opp: 'близорукий' },
    'сильный': { stat: { s: 10 }, opp: 'слабый' },
    'крепкий': { stat: { t: 10 }, opp: 'щуплый' },
    'мозговитый': { stat: { i: 10 }, opp: 'глупость' },
    'сильный духом': { stat: { d: 10 }, opp: 'слабый духом' },
    'проворный': { stat: { l: 10 }, opp: 'неуклюжий' },
    'тайное знание': { option: 'symbol', magic: true },
    'крупный': { size: 1, opp: 'мелкий' },
    'хорошая память': { slots: 2, opp: 'плохая память', magic: true },
    'красота': { attr: 15, opp: 'уродство' },
    'верующий': { prayers: 3, opp: 'отрицание' },
    'оратор': { charisma: 10, opp: 'молчаливый' },
    'резистентный': { option: 'resist' },
    // отрицательные
    'медленные рефлексы': { od: -2 },
    'тугоумие': { exp: -5 },
    'слабая регенерация': { hpRegenPct: -5 },
    'нечувствительность к потоку': { mpRegenPct: -5 },
    'слабая магия': { magPct: -10 },
    'немота': { weight: 2 },
    'близорукий': { zor: -10 },
    'слабый': { stat: { s: -10 } },
    'щуплый': { stat: { t: -10 } },
    'глупость': { stat: { i: -10 } },
    'слабый духом': { stat: { d: -10 } },
    'неуклюжий': { stat: { l: -10 } },
    'калека': { option: 'limbs' },
    'плохая память': { slots: -2 },
    'мелкий': { size: -1 },
    'уродство': { attr: -15 },
    'отрицание': { prayers: -3 },
    'молчаливый': { charisma: -10 },
    'обычный': { weight: 2, noMagic: true },
    'проклят': { weight: 3, option: 'curse' },
    'уязвимый': { option: 'vuln' }
  };

  // Тёмные дары / благословения / болезни — эффекты, которые влияют на расчёт
  const BOON_FX = {
    gift: {
      'весы': { option: 'swap' },
      'нежить': { mul: { s: 3, t: 2, i: 0.5, d: 0.5 } },
      'пустотный': { void: true },
      'скорость (особый режим)': { od: 3, expMul: 2 },
      'смертельная одержимость': { od: -1 },
      'яркое око': { zor: 50, noStealth: true },
      'угольное зрение': { zor: -40 },
      'антимагия': { noCast: true },
      'расхититель древностей': { roll: 'artifact' },
      'проводник стихии': { roll: 'element' },
      'репликант': { option: 'otherRace' },
      'негатор': { option: 'word' },
      'длань': { roll: 'parts' },
      'альфа бестиа': { roll: 'beasts' },
      'священное очищение': { noHpRegen: true },
      'лазурный фимиам': { mpRegenMul: 2 },
      'дар повелителя кошмаров': { madness: 1 }
    },
    buff: {
      'предыдущий опыт': { option: 'prevExp', freePos: 1 },
      'любимое дитя': { prayers: 10 },
      'наследство': { gold: 25 },
      'любим маной': { mpRegenMul: 4 },
      'могущество': { allPct: 25 },
      'устойчивость': { option: 'immunity' },
      'вечный': { revive: 1 }
    },
    disease: {
      'кости-хрящи': { stat: { l: 20, t: -40 } },
      'полицефалия': { pct: { i: 20 } },
      'гигантизм': { stat: { t: 10, s: 10, l: -20 }, size: 1 },
      'карликовость': { stat: { l: 20, t: -10, s: -10 }, size: -1 }
    }
  };

  // Клан Они: «бонус +50 к оружию клана / лёд - катана / воздух - тесен / земля - канабо / смерть - кама /
  // золото - катар / тьма - тонфы / огонь - нагината / плоть - шуаньгоу»
  const ONI_CLANS = [
    { id: 'лёд', weapon: 'катана', demon: 'Xoria' },
    { id: 'воздух', weapon: 'тесен ( веер)', demon: 'Losis' },
    { id: 'земля', weapon: 'канабо', demon: 'Grando' },
    { id: 'смерть', weapon: 'кама', demon: 'Horgen' },
    { id: 'золото', weapon: 'катар', demon: 'Gilltarro' },
    { id: 'тьма', weapon: 'тонфы', demon: 'Diarkon' },
    { id: 'огонь', weapon: 'нагината', demon: 'Roara' },
    { id: 'плоть', weapon: 'шуаньгоу', demon: 'Estar' }
  ];

  // Расы, которым нужен «предок»
  const ANCESTOR = {
    'дракониды': { kind: 'dragon', title: 'Дракон-предок', text: '+10% статов дракона предка / навыки дракона предка (50% мощности) / знание знака дракона рода / размер: дракон предок −1', pct: 10, required: true },
    'таррэ': { kind: 'monster', title: 'Монстр-предок', text: 'умение монстра / форма монстра / +10% от статов предка монстра', pct: 10, required: true },
    'скордиты': { kind: 'insect', title: 'Насекомое-предок', text: 'призвать насекомое / бонус от насекомого предка (размер бонуса в таблице не указан — по решению ГМ)', pct: 0, required: false },
    'эноши': { kind: 'beastRace', title: 'Зверо-предок', text: 'имеют половину от бонуса своего зверо предка', pct: 0, required: false },
    'тифлинги': { kind: 'demon', title: 'Демонический предок', text: 'символ принадлежности — символ демона-предка, он же стартовый магический символ (демоны из листа «Социум»)', pct: 0, required: true },
    'калаштар': { kind: 'ghost', title: 'Призрак-помощник', text: 'дух любого существа не выше уровня хозяина, сохранивший разум и навыки и неразрывно связанный с хозяином', pct: 0, required: true },
    'асимару': { kind: 'god', title: 'Бог-покровитель', text: 'символ бога по принадлежности — стартовый магический символ (боги из листа «Социум»)', pct: 0, required: true }
  };

  const AMMO = {
    'колчан стрел': ['пехотный лук', 'лук', 'длинный лук', 'ужасающий лук', '"скорпион"'],
    'колчан болтов': ['наручный арбалет', 'арбалет', '"скорпион"'],
    'комплект игл': ['духовая трубка', '"скорпион"']
  };
  const NOT_WEAPON = ['колчан стрел', 'колчан болтов', 'комплект игл', 'бомба', 'мина'];

  const POTION_TYPES = ['лечение (хп)', 'восстановление маны', 'восстановление пси', 'живость', 'щит',
    'противоядие', 'резист к элементу', 'другое (описать)'];

  // ---------------------------------------------------------------- утилиты

  const roundLevel = x => Math.floor(x + 0.5 + 1e-9);   // 0,5 — вверх
  const ri = roundLevel;                                  // все итоговые числа на сайте — целые
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const r1 = x => Math.round(x * 10) / 10;
  const trunc = x => (x < 0 ? Math.ceil(x) : Math.floor(x));
  const fmt = x => {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    const v = r1(x);
    return (Object.is(v, -0) ? 0 : v).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  };
  const signed = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x));

  function init(data) {
    D = data;
    IX.race = new Map(D.races.map(r => [r.id, r]));
    IX.society = new Map(((D.society || {}).groups || []).map(g => [g.row, g]));
    IX.gift = new Map(D.skills.gifts.map(g => [norm(g.name), g]));
    IX.buff = new Map(D.skills.buffs.map(g => [norm(g.name), g]));
    IX.disease = new Map(D.skills.diseases.map(g => [norm(g.name), g]));
    IX.traitPos = new Map(D.skills.traitsPos.map(t => [norm(t.name), t]));
    IX.traitNeg = new Map(D.skills.traitsNeg.map(t => [norm(t.name), t]));
    IX.material = new Map(D.materials.map(m => [norm(m.name), m]));
    IX.weapon = new Map(D.gear.weapons.map(w => [norm(w.name), w]));
    IX.armor = new Map(D.gear.armor.map(a => [norm(a.name), a]));
    IX.shield = new Map(D.gear.shields.map(a => [norm(a.name), a]));
    IX.symbol = new Map(D.skills.symbols.map(s => [norm(s.name), s]));
    IX.symbolByRow = new Map(D.skills.symbols.map(s => [String(s.row), s]));
    IX.layer = new Map(D.world.layers.map(l => [l.code, l]));
    // предки для драконидов, таррэ и скордитов — открытый список (бестиарий целиком закрыт паролем)
    IX.creature = new Map((D.ancestors || D.creatures || []).map(c => [norm(c.n), c]));
    IX.traitName = new Map(D.skills.traitsPos.concat(D.skills.traitsNeg).map(t => [norm(t.name), t.name.trim()]));
    IX.food = new Map(D.alchemy.food.map(f => [norm(f.name), f]));
    IX.bags = D.items.filter(i => /сумка/.test(i.name));
    // нормализуем ключи эффектов
    for (const kind of Object.keys(BOON_FX)) {
      const o = {};
      for (const [k, v] of Object.entries(BOON_FX[kind])) o[norm(k)] = v;
      BOON_FX[kind] = o;
    }
    const t = {};
    for (const [k, v] of Object.entries(TRAIT_FX)) t[norm(k)] = v;
    Object.keys(TRAIT_FX).forEach(k => delete TRAIT_FX[k]);
    Object.assign(TRAIT_FX, t);
  }

  function newState() {
    return {
      v: 2,
      raceId: '', parentA: '', parentB: '', hbAlign: '', hbSize: '',
      ancestor: '', ancestorAbility: '', oniClan: '',
      ageCat: '', agePct: 0,
      boon: { kind: '', name: '' },
      boonOpt: {},
      traits: [],
      traitOpt: { arms: 0, legs: 0 },
      alloc: { t: 0, d: 0, s: 0, i: 0, l: 0 },
      talents: {},
      weapon: { name: '', mat: '' }, ammo: { name: '', mat: '' }, armor: { name: '', mat: '' },
      items: [],
      misc: '',
      rolls: {},
      name: '', player: '', gender: '', look: '', story: '', motive: '', gmBonus: ''
    };
  }

  // ---------------------------------------------------------------- раса

  function sizeIndex(code) {
    return code in SIZE_IX ? SIZE_IX[code] : null;
  }

  function habitatNames(code, withEffect) {
    if (!code) return [];
    const toks = String(code).match(/\*\*\d|\*\d|\/\/\d|D\d|-\d|\b0\b/g) || [];
    return [...new Set(toks)].map(t => {
      const l = IX.layer.get(t);
      if (!l) return t;
      return `${t} — ${l.name}${withEffect && l.effect ? ` (${l.effect.replace(/^\/|\/$/g, '').replace(/\/$/, '')})` : ''}`;
    });
  }

  // Навыки предка: у драконидов — 50% мощности. Делятся пополам числа с единицами (%, е, атк, ОД, лвк, урон, хп, мп)
  // и числа со знаком; кратность (4х), клетки (5к), площадь (3х3) и цена «за 1ОД» не меняются.
  function halveText(t) {
    return String(t).replace(/(за\s*)?([+\-−]?)(\d+(?:[.,]\d+)?)(\s*)(%|е(?![а-яё])|атк|АТК|ОД|од(?![а-яё])|лвк|урон|хп|мп)?/g, (all, za, sign, num, sp, unit) => {
      if (za || (!sign && !unit)) return all;
      return `${sign}${ri(parseFloat(num.replace(',', '.')) / 2)}${sp}${unit || ''}`;
    });
  }
  // числовые эффекты из текста навыка, которые можно посчитать
  function abilityFx(text) {
    const t = String(text).toLowerCase().replace(/\s+/g, ' ');
    const fx = {};
    let m;
    if ((m = t.match(/(\d+)\s*%\s*регенерац/))) fx.hpRegenPct = +m[1];
    else if (/удвоенн\S*\s+регенерац/.test(t)) fx.hpRegenPct = 100;
    if ((m = t.match(/(\d+)\s*%\s*вампиризм/))) fx.vamp = +m[1];
    if ((m = t.match(/\+\s*(\d+)\s*хп(?![а-яё])(?!\s*(?:и\s*мп\s*)?реген)/))) fx.hp = +m[1];
    if ((m = t.match(/\+\s*(\d+)\s*од(?![а-яё])/))) fx.od = +m[1];
    if ((m = t.match(/\+\s*(\d+)\s*е?\s*хп регена/)) || (m = t.match(/хп реген\S*\s*\+?\s*(\d+)/))) fx.hpRegen = +m[1];
    if ((m = t.match(/\+\s*(\d+)\s*е?\s*(?:мп|мана) регена/)) || (m = t.match(/(?:мп|мана) реген\S*\s*\+?\s*(\d+)/))) fx.mpRegen = +m[1];
    return fx;
  }
  function sumFx(list) {
    const out = {};
    list.forEach(fx => Object.entries(fx).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; }));
    return out;
  }

  // символ бога / демона: настройки ГМ (js/config.js), для демонов запасной вариант — кланы Они
  function patronSymbol(name) {
    const map = C.PATRON_SYMBOLS || {};
    const key = Object.keys(map).find(k => norm(k) === norm(name));
    if (key && map[key]) return map[key];
    const clan = ONI_CLANS.find(c => norm(c.demon) === norm(name));
    return clan ? clan.id : '';
  }

  // демоны — восемь из листа «Социум»; боги — только те, кому ГМ задал символ в js/config.js
  function patronList(kind) {
    if (kind === 'demon') return D.demons || [];
    const map = C.PATRON_SYMBOLS || {};
    return (D.gods || []).filter(g => Object.keys(map).some(k => norm(k) === norm(g.name) && map[k]));
  }

  function halve(fx) {
    return fx.map(f => {
      const c = Object.assign({}, f, { half: true });
      if (typeof c.v === 'number') c.v = trunc(c.v / 2);
      return c;
    });
  }

  function resolveRace(st) {
    const r = IX.race.get(st.raceId);
    if (!r) return null;
    const res = {
      base: r, id: r.id, name: r.name, isHalf: r.id === 'полукровка',
      stats: { t: r.t, d: r.d, s: r.s, i: r.i, l: r.l }, lvl: roundLevel(r.lvl),
      align: r.align, size: r.size, habitat: r.habitat,
      factionCell: r.faction, religionCell: r.religion,
      bonuses: [], penalties: [], fx: [], pfx: [], notes: [], ancestor: null, flagsHalf: []
    };
    if (res.isHalf) {
      const A = IX.race.get(st.parentA), B = IX.race.get(st.parentB);
      res.parents = [A, B];
      if (A && B) {
        STATS.forEach(k => { res.stats[k] = ri((A[k] + B[k]) / 2); });
        res.lvl = roundLevel((STATS.reduce((a, k) => a + res.stats[k], 0) - 25) / 3);
        res.bonuses.push({ src: `${A.name} (½)`, text: A.bonus }, { src: `${B.name} (½)`, text: B.bonus });
        res.penalties.push({ src: `${A.name} (½)`, text: A.penalty }, { src: `${B.name} (½)`, text: B.penalty });
        res.fx = halve(A.fx).concat(halve(B.fx));
        res.pfx = halve(A.pfx).concat(halve(B.pfx));
        // флаги-запреты родителей не делятся пополам — показываем как примечание для ГМ
        const flagKeys = ['noWeapon', 'noArmor', 'noStartGear', 'noSizeDebuff', 'noMediumArmorPenalty', 'hands'];
        res.flagsHalf = res.fx.concat(res.pfx).filter(f => flagKeys.includes(f.k));
        res.fx = res.fx.filter(f => !flagKeys.includes(f.k));
        res.pfx = res.pfx.filter(f => !flagKeys.includes(f.k));
        const sizes = [...new Set([A.size, B.size].filter(z => z in SIZE_IX))];
        res.sizeOptions = sizes.length ? sizes : ['н'];
        res.size = res.sizeOptions.includes(st.hbSize) ? st.hbSize : (res.sizeOptions.length === 1 ? res.sizeOptions[0] : '');
        res.align = st.hbAlign || '';
      }
      res.penalties.push({ src: 'Полукровка', text: 'привлекательность −20' });
      res.pfx.push({ k: 'attr', v: -20 });
      res.habitat = '0';
    } else {
      res.bonuses.push({ src: r.name, text: r.bonus, freq: r.bonusFreq });
      res.penalties.push({ src: r.name, text: r.penalty });
      res.fx = r.fx.slice();
      res.pfx = r.pfx.slice();
    }
    // предок
    const anc = ANCESTOR[r.id];
    if (anc) {
      res.ancestorRule = anc;
      if (anc.kind === 'beastRace') {
        const ar = IX.race.get(st.ancestor);
        if (ar && ar.faction !== '30') res.ancestorNotBeast = true;
        if (ar) {
          res.ancestor = { kind: anc.kind, name: ar.name, race: ar };
          res.bonuses.push({ src: `Зверо-предок: ${ar.name} (½)`, text: ar.bonus });
          res.fx = res.fx.concat(halve(ar.fx).filter(f => !['noWeapon', 'noArmor', 'noStartGear', 'hands'].includes(f.k)));
        }
      } else if (anc.kind === 'demon' || anc.kind === 'god') {
        // демон / бог задаёт стартовый магический символ (не дары религии)
        const dm = patronList(anc.kind).find(d => norm(d.name) === norm(st.ancestor));
        if (dm) res.ancestor = { kind: anc.kind, name: dm.name, demon: dm, element: patronSymbol(dm.name) || null };
        else if (String(st.ancestor || '').trim()) res.ancestor = { kind: anc.kind, name: String(st.ancestor).trim(), unknown: true };
      } else {
        const cr = IX.creature.get(norm(st.ancestor));
        if (!cr && String(st.ancestor || '').trim()) res.ancestor = { kind: anc.kind, name: String(st.ancestor).trim(), unknown: true };
        if (cr) {
          res.ancestor = { kind: anc.kind, name: cr.n, creature: cr, companion: anc.kind === 'ghost' };
          if (anc.pct) {
            res.ancestor.add = {};
            STATS.forEach(k => { res.ancestor.add[k] = ri(cr[k] * anc.pct / 100); });
          }
          // навыки предка: дракониды — все навыки на 50% мощности; таррэ — одно выбранное умение
          const abil = (cr.ab || []).map(([k, t], i) => ({ i, text: anc.kind === 'dragon' ? halveText(t) : t, orig: t }));
          abil.forEach(a => { a.fx = abilityFx(a.text); });
          res.ancestor.abilities = abil;
          if (anc.kind === 'dragon') res.ancestor.fx = sumFx(abil.map(a => a.fx));
          else if (anc.kind === 'monster') {
            const pick = abil.find(a => String(a.i) === String(st.ancestorAbility));
            res.ancestor.picked = pick || null;
            res.ancestor.fx = pick ? pick.fx : {};
          } else res.ancestor.fx = {};
          if (anc.kind === 'dragon') {
            const si = sizeIndex(cr.sz);
            if (si !== null) res.size = SIZES[Math.max(0, si - 1)].id;
            const sym = IX.symbolByRow.get(String(cr.sym));
            res.ancestor.symbol = sym ? sym.name : null;
          }
        }
      }
    }
    // «Репликант»: стартовые бонусы другой расы и её удвоенный штраф
    if (norm(st.boon && st.boon.name) === 'репликант' && st.boon.kind === 'gift') {
      const o = IX.race.get((st.boonOpt || {}).otherRace);
      if (o) {
        const flagKeys = ['noWeapon', 'noArmor', 'noStartGear', 'noSizeDebuff', 'noMediumArmorPenalty', 'hands', 'extraPos'];
        res.bonuses.push({ src: `Репликант: ${o.name}`, text: o.bonus });
        res.penalties.push({ src: `Репликант: ${o.name} (×2)`, text: o.penalty });
        res.fx = res.fx.concat(o.fx.filter(f => !flagKeys.includes(f.k)).map(f => Object.assign({}, f, { repl: true })));
        res.pfx = res.pfx.concat(o.pfx.filter(f => !flagKeys.includes(f.k)).map(f => Object.assign({}, f, { repl: true }, typeof f.v === 'number' ? { v: f.v * 2 } : {})));
      }
    }
    return res;
  }

  // ---------------------------------------------------------------- фракции

  function parseGroupStat(v) {
    const s = String(v || '').trim().replace(/\s/g, '');
    if (!s || s === '0') return null;
    let m;
    if ((m = s.match(/^(\d+)\+$/))) return { op: 'add', v: +m[1], raw: v };
    if ((m = s.match(/^(\d+)-$/))) return { op: 'add', v: -m[1], raw: v };
    if ((m = s.match(/^\*(\d+)$/)) || (m = s.match(/^(\d+)\*$/)) || (m = s.match(/^(\d+)[XХхx]$/))) return { op: 'mul', v: +m[1], raw: v };
    if ((m = s.match(/^(\d+)\/$/))) return { op: 'mul', v: 1 / +m[1], raw: v };
    return { op: 'note', raw: v };
  }

  // ---------------------------------------------------------------- дар / благо / болезнь

  function resolveBoon(st) {
    const b = st.boon || {};
    if (!b.kind || !b.name) return null;
    const key = norm(b.name);
    const src = b.kind === 'gift' ? IX.gift.get(key) : b.kind === 'buff' ? IX.buff.get(key) : IX.disease.get(key);
    if (!src) return null;
    const fx = (BOON_FX[b.kind] || {})[key] || {};
    return { kind: b.kind, key, src, fx };
  }

  // ---------------------------------------------------------------- черты

  function traitInfo(st, race, age, boon) {
    const pos = [], neg = [];
    (st.traits || []).forEach(n => {
      const k = norm(n);
      if (IX.traitPos.has(k)) pos.push(k);
      else if (IX.traitNeg.has(k)) neg.push(k);
    });
    const limit = age ? age.traits : 0;
    let weight = 0, extraFromNeg = 0;
    neg.forEach(k => {
      const fx = TRAIT_FX[k] || {};
      let w = fx.weight || 1;
      if (k === 'калека') w = 2 * Math.max(0, (st.traitOpt.arms || 0) + (st.traitOpt.legs || 0));
      weight += w;
      extraFromNeg += Math.max(0, w - 1);
    });
    let free = 0;
    const freeSrc = [];
    if (race) {
      const ep = race.fx.filter(f => f.k === 'extraPos').reduce((a, f) => a + f.v, 0);
      if (ep) { free += ep; freeSrc.push(`${race.name}: +${ep}`); }
    }
    if (boon && boon.fx.freePos) { free += boon.fx.freePos; freeSrc.push(`${boon.src.name}: +${boon.fx.freePos}`); }
    const limitNeg = limit;
    const limitPos = limit === 0 && age && age.id === 'ребёнок' ? 0 : limit + extraFromNeg + free;
    return { pos, neg, limit, limitNeg, limitPos, weight, free, freeSrc, balanceCap: weight + free };
  }

  // ---------------------------------------------------------------- снаряжение

  function multiplyEffect(text, n) {
    // «2% оглушить» × 3 → «6% оглушить»; иначе показываем множитель текстом
    const m = String(text).match(/^([+\-−]?)(\d+(?:[.,]\d+)?)(\s*%?)(.*)$/);
    if (!m || /[\/]/.test(text)) return null;
    const v = ri(parseFloat(m[2].replace(',', '.')) * n);
    return `${m[1]}${v}${m[3]}${m[4]}`;
  }

  // единицы материала с учётом размера: пересчитанные округляются до целого (6 × 1,4 = 8,4 → 8);
  // при нормальном размере и для долей единицы (¼, ½) — как в таблице
  function sizeUnits(u, k) {
    if (k === 1) return u;
    const x = u * k;
    return x >= 1 ? ri(x) : r2(x);
  }
  function r2(x) { return Math.round(x * 100) / 100; }

  function scaledEffect(eff, units) {
    if (!eff || !eff.t) return null;
    const out = { text: eff.t, scale: eff.sc || 'за предмет' };
    if (eff.sc === 'за единицу') {
      out.units = units;
      out.total = multiplyEffect(eff.t, units);
    }
    return out;
  }

  // числовые эффекты брони, влияющие на параметры (ловкость, хп-реген)
  function armorStatEffects(text, perUnit, units) {
    const res = { l: 0, hpRegen: 0 };
    const mult = perUnit ? units : 1;
    String(text || '').toLowerCase().split('/').forEach(seg => {
      let m;
      if ((m = seg.match(/ловкост[ьи]\s*([+\-−])\s*(\d+)/))) res.l += (m[1] === '+' ? 1 : -1) * +m[2] * mult;
      else if ((m = seg.match(/([+\-−])\s*(\d+)\s*ловкост/))) res.l += (m[1] === '+' ? 1 : -1) * +m[2] * mult;
      if ((m = seg.match(/хп реген\s*\+\s*(\d+)/))) res.hpRegen += +m[1] * mult;
    });
    res.l = ri(res.l); res.hpRegen = ri(res.hpRegen);
    return res;
  }

  // требования предмета меняются на процент размера («статы и требования оружия и брони меняются
  // на тот же процент» — лист «механики»), округление вверх; гомункулам — половина
  function reqCheck(req, k, stats, halfReq) {
    const out = [];
    for (const [key, v] of Object.entries(req || {})) {
      const sk = REQ_KEY[key];
      if (!sk) continue;
      let need = Math.round(v * k * 100) / 100;
      if (halfReq) need = need / 2;
      need = Math.ceil(need);
      const have = stats[sk];
      out.push({ stat: sk, need, have, ok: have >= need });
    }
    return out;
  }

  const REQ_PENALTY = {
    s: 'сила: −50% урона', t: 'тело: −2 ОД', l: 'ловкость: 50% нанести урон себе',
    i: 'интеллект: шанс наложить заклинание на себя', d: 'дух: 50% потерять 25% пси'
  };

  function computeGear(st, ctx) {
    const { race, sizeK, stats, errors, warnings, flags } = ctx;
    const g = { weapon: null, ammo: null, armor: null, items: [], slotsUsed: 0, bagSlots: 0, dodgeMod: 0, hpRegenMod: 0,
      prayers: 0, spellSlots: 0, effects: [] };
    const allowedMats = new Set(C.START_MATERIALS.map(norm));
    const halfReq = race && race.id === 'гомункулы';
    const hasGear = (st.weapon && st.weapon.name) || (st.armor && st.armor.name) || (st.items || []).some(i => i && i.kind);

    if (flags.noStartGear && hasGear) errors.push({ step: 'gear', msg: `${race.name}: «на начале не могут взять экипировку» — уберите снаряжение и предметы.` });

    // --- оружие
    if (st.weapon && st.weapon.name) {
      const w = IX.weapon.get(norm(st.weapon.name));
      const m = IX.material.get(norm(st.weapon.mat));
      if (!w) errors.push({ step: 'gear', msg: 'Неизвестное оружие.' });
      else {
        const res = { w, m, k: sizeK };
        // размер меняет единицы, влияющие на урон (округляются до целого); остальные единицы — как в таблице
        res.units = sizeUnits(w.u, sizeK); res.unitsNon = w.un; res.unitsTotal = r2(res.units + w.un);
        if (m) {
          res.damage = ri(m.dmg * res.units);
          res.matEffect = scaledEffect(m.ew, res.unitsTotal);
          if (norm(w.name) === 'катар') res.armorFromNon = ri(m.dmg * w.un);
        }
        res.req = reqCheck(w.req, sizeK, stats, halfReq);
        res.bonus = [];
        (race ? race.fx : []).forEach(f => {
          if ((f.k === 'weapon' || f.k === 'weaponAcc') && f.types.map(norm).includes(norm(w.name)) && !f.cond) {
            res.bonus.push({ kind: f.k === 'weapon' ? 'урон' : 'точность', v: f.v, src: f.half ? 'раса (½)' : 'раса' });
          }
        });
        if (race && race.id === 'они' && st.oniClan) {
          const cl = ONI_CLANS.find(c => c.id === st.oniClan);
          if (cl && norm(cl.weapon) === norm(w.name)) res.bonus.push({ kind: 'урон', v: 50, src: `оружие клана (${cl.id})` });
        }
        // баситины: «одноручные мечи имеют Х2 урон» — оружие со словом «меч» в названии на одну руку
        if (race && race.id === 'баситины' && res.damage !== undefined && w.hands === 1 && /(^|\s)меч(\s|$)/.test(norm(w.name))) {
          res.damage *= 2; res.mul = { v: 2, src: 'баситины: одноручный меч' };
        }
        res.damageTotal = (res.damage || 0) + res.bonus.filter(b => b.kind === 'урон').reduce((a, b) => a + b.v, 0);
        if (!m) errors.push({ step: 'gear', msg: 'Выберите материал оружия (оружие монолитное — из одного материала).' });
        else if (!allowedMats.has(norm(m.name))) errors.push({ step: 'gear', msg: `Материал «${m.name}» не входит в стартовый список.` });
        if (flags.noWeapon) errors.push({ step: 'gear', msg: `${race.name}: «не могут держать в руках оружия и инструменты».` });
        if (C.START_ITEM_MAX_SKILL && w.skill > C.START_ITEM_MAX_SKILL) errors.push({ step: 'gear', msg: `«${w.name}» требует ${w.skill} ур. навыка — выше стартового предела ${C.START_ITEM_MAX_SKILL}.` });
        res.req.filter(x => !x.ok).forEach(x => warnings.push({ step: 'gear', msg: `«${w.name}»: не хватает ${STAT_NAMES[x.stat].toLowerCase()} (${fmt(x.have)} из ${x.need}) — штраф при использовании: ${REQ_PENALTY[x.stat]}.` }));
        if (w.hands && ctx.hands < w.hands) errors.push({ step: 'gear', msg: `«${w.name}» требует ${w.hands} рук(и), доступно: ${ctx.hands}.` });
        g.slotsUsed += 1;                       // «1 предмет занимает 1 слот»; «слоты» в таблице — гнёзда для камней
        if (norm(w.name) === 'гримуар') g.spellSlots += 20;
        if (norm(w.name) === 'розарий') g.prayers += 8;
        if (norm(w.name) === 'молитвенник') g.prayers += 20;
        g.weapon = res;
      }
    }
    // --- боеприпасы
    if (st.ammo && st.ammo.name && g.weapon) {
      const a = IX.weapon.get(norm(st.ammo.name));
      const m = IX.material.get(norm(st.ammo.mat));
      if (a) {
        const fits = (AMMO[a.name] || []).map(norm).includes(norm(g.weapon.w.name));
        const au = sizeUnits(a.u, sizeK);
        g.ammo = { a, m, units: au, damage: m ? ri(m.dmg * au) : null, fits };
        g.slotsUsed += 1;
        if (!fits) warnings.push({ step: 'gear', msg: `«${a.name}» не подходит к «${g.weapon.w.name}».` });
        if (m && !allowedMats.has(norm(m.name))) errors.push({ step: 'gear', msg: `Материал боеприпасов «${m.name}» не входит в стартовый список.` });
      }
    }
    // --- броня / щит
    if (st.armor && st.armor.name) {
      const key = norm(st.armor.name);
      const a = IX.armor.get(key) || IX.shield.get(key);
      const isShield = IX.shield.has(key);
      const m = IX.material.get(norm(st.armor.mat));
      if (!a) errors.push({ step: 'gear', msg: 'Неизвестный элемент брони.' });
      else {
        const res = { a, m, isShield, k: sizeK };
        res.units = sizeUnits(a.u || 0, sizeK);
        res.pen = a.pen || 0;
        if (flags.noMediumArmorPenalty && a.cls === 'средняя') { res.pen = 0; res.penNote = 'средние доспехи не дают штраф (раса)'; }
        if (m) {
          res.armor = ri(m.arm * res.units);
          res.matEffect = scaledEffect(m.ea, res.units);
          const se = armorStatEffects(m.ea.t, m.ea.sc === 'за единицу', res.units);
          res.statFx = se;
          g.dodgeMod += se.l; g.hpRegenMod += se.hpRegen;
          if (norm(m.name) === 'магическая ткань' && !['лёгкая', 'одежда'].includes(a.cls) && !isShield) {
            errors.push({ step: 'gear', msg: 'Магическая ткань — «только лёгкое»: выберите лёгкую броню или одежду.' });
          }
          if (!allowedMats.has(norm(m.name))) errors.push({ step: 'gear', msg: `Материал «${m.name}» не входит в стартовый список.` });
        } else errors.push({ step: 'gear', msg: 'Выберите материал брони (монолитная — из одного материала).' });
        res.req = reqCheck(a.req, sizeK, stats, halfReq);
        res.req.filter(x => !x.ok).forEach(x => warnings.push({ step: 'gear', msg: `«${a.name}»: не хватает ${STAT_NAMES[x.stat].toLowerCase()} (${fmt(x.have)} из ${x.need}) — штраф: ${REQ_PENALTY[x.stat]}.` }));
        if (C.START_ITEM_MAX_SKILL && a.skill > C.START_ITEM_MAX_SKILL) errors.push({ step: 'gear', msg: `«${a.name}» требует ${a.skill} ур. навыка — выше стартового предела.` });
        g.dodgeMod -= res.pen;
        g.slotsUsed += 1;
        if (flags.noArmor) errors.push({ step: 'gear', msg: `${race.name}: не могут носить другие доспехи.` });
        if (race && race.id === 'тэтре') warnings.push({ step: 'gear', msg: 'Тэтре: «при отсутствии брони имеют 80% шанс не получить физ урон и 30% маг урон» — с бронёй бонус теряется.' });
        if (isShield && g.weapon && g.weapon.w.hands >= 2 && ctx.hands <= 2) warnings.push({ step: 'gear', msg: 'Щит и двуручное оружие одновременно не удержать двумя руками.' });
        g.armor = res;
      }
    }
    // --- предметы
    const items = (st.items || []).filter(i => i && i.kind);
    if (items.length > C.START_ITEMS) errors.push({ step: 'gear', msg: `Можно взять не более ${C.START_ITEMS} предметов (сумки / зелья / еда).` });
    const seen = new Set();
    items.forEach((it, ix) => {
      let label = '', key = '';
      if (it.kind === 'bag') {
        const b = IX.bags.find(x => norm(x.name) === norm(it.name));
        if (!b) { errors.push({ step: 'gear', msg: `Предмет ${ix + 1}: выберите сумку.` }); return; }
        const sl = parseInt(String(b.effect).replace(/\D/g, ''), 10) || 0;
        g.bagSlots += sl;
        label = `${b.name} (${b.effect})`; key = 'bag:' + norm(b.name);
      } else if (it.kind === 'food') {
        const f = IX.food.get(norm(it.name));
        if (!f) { errors.push({ step: 'gear', msg: `Предмет ${ix + 1}: выберите блюдо.` }); return; }
        label = `${f.name} (${f.e.join(', ')})`; key = 'food:' + norm(f.name);
      } else if (it.kind === 'potion') {
        const p = +it.power || 0;
        const type = it.effect || '';
        if (!type) errors.push({ step: 'gear', msg: `Предмет ${ix + 1}: укажите эффект зелья.` });
        if (p <= 0) errors.push({ step: 'gear', msg: `Предмет ${ix + 1}: укажите силу зелья.` });
        if (p > C.POTION_MAX) errors.push({ step: 'gear', msg: `Зелье «${type}»: сила ${p}е — на старте не сильнее ${C.POTION_MAX}е.` });
        label = `Зелье: ${type}${it.note ? ' — ' + it.note : ''} (${p}е)`;
        key = 'potion:' + norm(type) + ':' + norm(it.note || '');
      }
      if (seen.has(key)) errors.push({ step: 'gear', msg: `«${label}» выбран дважды — предметы должны быть разными.` });
      seen.add(key);
      if (it.kind !== 'bag') g.slotsUsed += 1;   // сумки места не занимают, а добавляют его
      g.items.push({ kind: it.kind, label });
    });
    return g;
  }

  // ---------------------------------------------------------------- главный расчёт

  function compute(st) {
    const errors = [], warnings = [], notes = [];
    const out = { errors, warnings, notes };
    const race = resolveRace(st);
    out.race = race;
    if (!race) {
      errors.push({ step: 'race', msg: 'Выберите расу.' });
    } else {
      if (!race.base.playable) errors.push({ step: 'race', msg: `«${race.name}» недоступна при создании (${race.base.evolutionOnly ? 'только эволюцией' : 'не игровая раса'}).` });
      if (race.isHalf) {
        if (!race.parents || !race.parents[0] || !race.parents[1]) errors.push({ step: 'race', msg: 'Полукровке нужны обе родительские расы.' });
        else {
          if (race.parents[0].id === race.parents[1].id) errors.push({ step: 'race', msg: 'Родительские расы полукровки должны различаться.' });
          if (!race.size) errors.push({ step: 'race', msg: 'Выберите размер полукровки (из размеров родителей).' });
          if (!race.align) errors.push({ step: 'race', msg: 'Выберите характер полукровки («настраиваемый»).' });
          race.flagsHalf.forEach(f => warnings.push({ step: 'race', msg: `Особенность родителя (${f.k === 'hands' ? f.v + ' рук' : f.k}) у полукровки — по решению ГМ.` }));
        }
      }
      if (race.ancestorRule) {
        if (!race.ancestor && race.ancestorRule.required) errors.push({ step: 'race', msg: `${race.name}: выберите предка (${race.ancestorRule.title.toLowerCase()}).` });
        else if (!race.ancestor) warnings.push({ step: 'race', msg: `${race.name}: предок не выбран (${race.ancestorRule.title.toLowerCase()}).` });
        else if (race.ancestorNotBeast) warnings.push({ step: 'race', msg: `«${race.ancestor.name}» — не звериная раса; зверо-предок выбирается из звериных рас.` });
        else if (race.ancestor.unknown) {
          if (race.ancestorRule.required) errors.push({ step: 'race', msg: `«${race.ancestor.name}» нет среди возможных предков — выберите из списка.` });
          else warnings.push({ step: 'race', msg: `«${race.ancestor.name}» нет среди возможных предков — проверьте название.` });
        }
        else if (race.ancestorRule.kind === 'monster' && race.ancestor.abilities && race.ancestor.abilities.length && !race.ancestor.picked) {
          warnings.push({ step: 'race', msg: 'Таррэ: выберите умение монстра-предка.' });
        }
      }
      if (race.id === 'они' && !st.oniClan) errors.push({ step: 'race', msg: 'Они: выберите клан (определяет символ и оружие клана +50).' });
      if (race.id === 'хенра') notes.push('Хенра: «у вас есть второй подконтрольный персонаж» — создайте близнеца отдельным героем.');
    }

    // --- возраст
    const age = AGES.find(a => a.id === st.ageCat) || null;
    out.age = age;
    const rng = age ? C.AGE_RANGES[age.id] : null;
    let pct = age ? Math.min(rng.max, Math.max(rng.min, +st.agePct || 0)) : 0;
    out.agePct = pct;
    if (!age) errors.push({ step: 'age', msg: 'Выберите возраст.' });
    const lvl0 = race ? race.lvl : 0;
    // уровни целые: уровень персонажа округляется до ближайшего, очки = 3 за каждый уровень разницы
    const level = roundLevel(lvl0 * (1 + pct / 100));
    const agePoints = 3 * (level - lvl0);
    out.lvl0 = lvl0; out.level = level; out.agePoints = agePoints;
    out.talentPoints = Math.floor(level / 5 + 1e-9);
    // --- развитие после создания (уровни за опыт, вложенные очки, фракция / религия)
    const prog = st.prog || null;
    const levelsUp = prog ? Math.max(0, Math.floor(+prog.levels || 0)) : 0;
    out.levelStart = level; out.levelsUp = levelsUp;
    out.talentPointsStart = out.talentPoints;
    if (levelsUp) { out.level = level + levelsUp; out.talentPoints = Math.floor(out.level / 5 + 1e-9); }
    // призрак-помощник Калаштара — не выше уровня хозяина
    if (race && race.ancestor && race.ancestor.companion && roundLevel(race.ancestor.creature.lvl) > level) {
      errors.push({ step: 'race', msg: `Призрак-помощник «${race.ancestor.name}» (ур. ${roundLevel(race.ancestor.creature.lvl)}) сильнее хозяина (ур. ${level}) — выберите существо не выше вашего уровня.` });
    }

    // --- фракция и религия на старте не выдаются (их получают в игре)
    const aff = { faction: null, religion: null };
    out.aff = aff;

    // --- дар
    const boon = resolveBoon(st);
    out.boon = boon;
    const isHomunculus = race && race.id === 'гомункулы';
    if (boon && isHomunculus && (boon.kind === 'buff' || boon.kind === 'disease')) {
      errors.push({ step: 'boon', msg: 'Гомункулы: «на начале не могут взять … благословение / болезнь».' });
    }
    if (boon && boon.kind === 'disease' && !boon.src.birth) errors.push({ step: 'boon', msg: 'На старте доступны только врождённые болезни (♥).' });
    if (boon && boon.kind === 'buff' && !boon.src.birth) errors.push({ step: 'boon', msg: 'На старте доступны только врождённые благословения (♥).' });
    const bo = st.boonOpt || {};
    if (boon) {
      if (boon.fx.option === 'swap') {
        if (!bo.swapA || !bo.swapB || bo.swapA === bo.swapB) errors.push({ step: 'boon', msg: '«Весы»: выберите два разных параметра, которые меняются местами.' });
      }
      if (boon.fx.option === 'otherRace' && !IX.race.get(bo.otherRace)) errors.push({ step: 'boon', msg: '«Репликант»: выберите расу, чьи стартовые бонусы берёте.' });
      if (boon.fx.option === 'word' && !String(bo.word || '').trim()) warnings.push({ step: 'boon', msg: '«Негатор»: впишите слово с отрицанием.' });
      if (boon.fx.option === 'immunity' && !String(bo.immunity || '').trim()) warnings.push({ step: 'boon', msg: '«Устойчивость»: укажите тип урона для иммунитета.' });
      if (boon.fx.roll && !(st.rolls || {})[boon.fx.roll]) warnings.push({ step: 'boon', msg: `«${boon.src.name}»: сделайте бросок (кнопка у дара).` });
      if (boon.fx.option === 'prevExp') {
        if (!bo.prevSkill || !bo.prevSymbol || !bo.prevStance) warnings.push({ step: 'boon', msg: '«Предыдущий опыт»: выберите физ. навык, символ и стойку.' });
      }
    }

    // --- черты
    const ti = traitInfo(st, race, age, boon);
    out.traits = ti;
    if (age) {
      const total = ti.pos.length + ti.neg.length;
      if (age.traits === 0 && total) errors.push({ step: 'traits', msg: 'Ребёнок не может брать черты на старте.' });
      else {
        if (ti.neg.length > ti.limitNeg) errors.push({ step: 'traits', msg: `Отрицательных черт ${ti.neg.length} — для возраста «${age.title}» не более ${ti.limitNeg}.` });
        if (ti.pos.length > ti.limitPos) errors.push({ step: 'traits', msg: `Положительных черт ${ti.pos.length} — доступно не более ${ti.limitPos}.` });
        if (ti.pos.length > ti.balanceCap) errors.push({ step: 'traits', msg: `Баланс черт: положительных ${ti.pos.length}, а отрицательные (с учётом особых) покрывают только ${ti.balanceCap}. Добавьте отрицательную черту или уберите положительную.` });
        else if (ti.weight > ti.pos.length && ti.neg.length) warnings.push({ step: 'traits', msg: `Баланс нарушен в минус: отрицательные черты покрывают ${ti.weight}, а положительных взято ${ti.pos.length}. Можно взять ещё ${Math.min(ti.weight - ti.pos.length, Math.max(0, ti.limitPos - ti.pos.length))} положительную(ых).` });
      }
    } else if ((st.traits || []).length) {
      errors.push({ step: 'traits', msg: 'Сначала выберите возраст — от него зависит количество черт.' });
    }
    const allTraits = ti.pos.concat(ti.neg);
    // эффекты черт для расчёта (+ удвоенная случайная черта «Репликанта», если у выбранной расы нет штрафа)
    const tn = k => IX.traitName.get(k) || k;
    const traitFx = allTraits.map(k => [tn(k), TRAIT_FX[k]]);
    if (boon && boon.key === 'репликант' && st.rolls && st.rolls.replicantTrait) {
      const other = IX.race.get((st.boonOpt || {}).otherRace);
      const noPen = other && (!other.penalty || /^нет$/i.test(other.penalty.trim()));
      const rk = norm(st.rolls.replicantTrait.v), f = TRAIT_FX[rk];
      if (noPen && f) {
        const d = {};
        for (const [kk, vv] of Object.entries(f)) {
          if (kk === 'stat') { d.stat = {}; for (const [a, b] of Object.entries(vv)) d.stat[a] = b * 2; }
          else if (typeof vv === 'number' && kk !== 'weight') d[kk] = vv * 2;
        }
        traitFx.push([`${tn(rk)} ×2 (репликант)`, d]);
      }
    }
    const uniq = [...new Set(allTraits)];
    const cnt = k => allTraits.filter(x => x === k).length;
    uniq.forEach(k => {
      const fx = TRAIT_FX[k] || {};
      if (fx.opp && allTraits.includes(norm(fx.opp))) errors.push({ step: 'traits', msg: `Черты «${tn(k)}» и «${tn(norm(fx.opp))}» противоположны — взять обе нельзя.` });
      if (cnt(k) > 1 && !traitRepeatable(k)) errors.push({ step: 'traits', msg: `Черту «${tn(k)}» нельзя взять несколько раз.` });
    });
    const to = st.traitOpt || {};
    const optList = (base, k) => Array.from({ length: cnt(k) }, (_, i) => String(to[optKey(base, i)] || '').trim());
    if (allTraits.includes('калека') && ((to.arms || 0) + (to.legs || 0)) < 1) errors.push({ step: 'traits', msg: '«Калека»: укажите, сколько конечностей убрать (за каждую +2 положительных).' });
    const resists = optList('resist', 'резистентный'), vulns = optList('vuln', 'уязвимый');
    if (resists.some(x => !x)) warnings.push({ step: 'traits', msg: '«Резистентный»: выберите эффект / тип урона.' });
    if (vulns.some(x => !x)) warnings.push({ step: 'traits', msg: '«Уязвимый»: выберите эффект / тип урона.' });
    const both = resists.filter(x => x && vulns.some(v => norm(v) === norm(x)));
    if (both.length) errors.push({ step: 'traits', msg: `«Резистентный» и «Уязвимый» к одному и тому же (${both.join(', ')}) — противоречие.` });
    const secrets = optList('secretSymbol', 'тайное знание');
    if (secrets.some(x => !x)) warnings.push({ step: 'traits', msg: '«Тайное знание»: выберите магический символ.' });
    else if (new Set(secrets.map(norm)).size < secrets.length) warnings.push({ step: 'traits', msg: '«Тайное знание»: один и тот же символ выбран дважды.' });
    if (allTraits.includes('проклят')) {
      if (isHomunculus) errors.push({ step: 'traits', msg: 'Гомункулы не могут взять проклятие на старте.' });
      const missing = Array.from({ length: cnt('проклят') }, (_, i) => optKey('curse', i)).filter(key => !(st.rolls || {})[key]).length;
      if (missing) warnings.push({ step: 'traits', msg: `«Проклят»: сделайте бросок проклятия${missing > 1 ? ` (осталось ${missing})` : ''} — 50/50 верхний/нижний блок.` });
    }
    const noMagic = allTraits.includes('обычный');
    if (noMagic) allTraits.filter(k => (TRAIT_FX[k] || {}).magic).forEach(k => warnings.push({ step: 'traits', msg: `«${tn(k)}» бесполезна: черта «обычный» лишает магии.` }));
    if (boon && boon.fx.noCast) allTraits.filter(k => (TRAIT_FX[k] || {}).magic).forEach(k => warnings.push({ step: 'traits', msg: `«${tn(k)}» бесполезна при «Антимагии».` }));

    // --- флаги расы
    const flags = {};
    (race ? race.fx.concat(race.pfx) : []).forEach(f => {
      if (['noWeapon', 'noArmor', 'noStartGear', 'noSizeDebuff', 'noMediumArmorPenalty'].includes(f.k)) flags[f.k] = true;
    });

    // --- характеристики
    const base = race ? Object.assign({}, race.stats) : { t: 0, d: 0, s: 0, i: 0, l: 0 };
    const alloc = Object.assign({ t: 0, d: 0, s: 0, i: 0, l: 0 }, st.alloc || {});
    const allocSum = STATS.reduce((a, k) => a + (+alloc[k] || 0), 0);
    out.allocSum = allocSum;
    const br = {};    // разбивка по шагам
    STATS.forEach(k => { br[k] = [{ src: race && race.isHalf ? 'полукровка: среднее родителей' : 'раса', v: base[k], op: '=' }]; });
    const cur = {};
    STATS.forEach(k => {
      const a = +alloc[k] || 0;
      cur[k] = base[k] + a;
      if (a) br[k].push({ src: 'очки возраста', v: a, op: '+' });
    });
    if (race) {
      if (allocSum !== agePoints) {
        errors.push({ step: 'stats', msg: agePoints >= 0
          ? `Распределите очки возраста: ${allocSum} из ${agePoints}.`
          : `Снимите очки за юный возраст: снято ${-allocSum} из ${-agePoints}.` });
      }
      STATS.forEach(k => {
        const a = +alloc[k] || 0;
        if (agePoints >= 0 && a < 0) errors.push({ step: 'stats', msg: `${STAT_NAMES[k]}: нельзя опускать ниже расового значения.` });
        if (agePoints < 0 && a > 0) errors.push({ step: 'stats', msg: `${STAT_NAMES[k]}: при отрицательных очках можно только снимать.` });
        if (base[k] + a < 1) errors.push({ step: 'stats', msg: `${STAT_NAMES[k]} не может быть меньше 1.` });
      });
    }
    // плоские прибавки
    const addFlat = (k, v, src) => { if (!v) return; cur[k] += v; br[k].push({ src, v, op: '+' }); };
    if (race && race.ancestor && race.ancestor.add) STATS.forEach(k => addFlat(k, race.ancestor.add[k], `предок ${race.ancestor.name} (+${race.ancestorRule.pct}%)`));
    traitFx.forEach(([k, fx]) => { if (fx && fx.stat) for (const [s, v] of Object.entries(fx.stat)) addFlat(s, v, `черта «${k}»`); });
    if (boon && boon.fx.stat) for (const [s, v] of Object.entries(boon.fx.stat)) addFlat(s, v, `${boon.kind === 'disease' ? 'болезнь' : 'дар'} «${boon.src.name}»`);
    // развитие: очки за новые уровни (3 за уровень) и бонусы общин к статам
    const progAlloc = Object.assign({ t: 0, d: 0, s: 0, i: 0, l: 0 }, (prog && prog.alloc) || {});
    const progSpent = STATS.reduce((a, k) => a + Math.max(0, +progAlloc[k] || 0), 0);
    if (prog) {
      STATS.forEach(k => { const v = +progAlloc[k] || 0; if (v < 0) errors.push({ step: 'progress', msg: `${STAT_NAMES[k]}: очки развития нельзя снимать.` }); else addFlat(k, v, 'развитие: новые уровни'); });
      if (progSpent > 3 * levelsUp) errors.push({ step: 'progress', msg: `Очков развития вложено ${progSpent}, а получено ${3 * levelsUp} (3 за уровень).` });
      else if (progSpent < 3 * levelsUp) warnings.push({ step: 'progress', msg: `Не распределено очков характеристик за новые уровни: ${3 * levelsUp - progSpent}.` });
    }
    const groupMul = [];
    ((prog && prog.groups) || []).forEach(g => (g.st || []).forEach((raw, i) => {
      const p = parseGroupStat(raw), k = STATS[i];
      if (!p || !k) return;
      if (p.op === 'add') addFlat(k, p.v, `${g.kind || 'община'} «${g.name}»`);
      if (p.op === 'mul') groupMul.push([k, p.v, `${g.kind || 'община'} «${g.name}»`]);
    }));
    // состояния, выданные ГМ (проклятия, болезни, эффекты): прибавки к статам и множители
    ((prog && prog.mods) || []).forEach(m => {
      const k = STATS.includes(m.stat) ? m.stat : null, v = +m.v;
      if (!k || !Number.isFinite(v) || !v) return;
      if (m.op === 'mul') { if (v > 0 && v !== 1) groupMul.push([k, v, m.src || 'эффект']); }
      else addFlat(k, v, m.src || 'эффект');
    });
    out.prog = prog ? { levelsUp, statPoints: 3 * levelsUp, statSpent: progSpent, alloc: progAlloc } : null;
    // множители
    const mulStat = (k, m, src) => { const before = cur[k]; cur[k] = ri(cur[k] * m); br[k].push({ src, v: cur[k] - before, op: '×' + fmt(m) }); };
    if (boon && boon.fx.mul) for (const [s, m] of Object.entries(boon.fx.mul)) mulStat(s, m, `дар «${boon.src.name}»`);
    if (boon && boon.fx.allPct) STATS.forEach(k => mulStat(k, 1 + boon.fx.allPct / 100, `благословение «${boon.src.name}» (+${boon.fx.allPct}%)`));
    if (boon && boon.fx.pct) for (const [s, v] of Object.entries(boon.fx.pct)) mulStat(s, 1 + v / 100, `болезнь «${boon.src.name}» (+${v}%)`);
    groupMul.forEach(([k, m, src]) => mulStat(k, m, src));
    // весы
    if (boon && boon.fx.option === 'swap' && bo.swapA && bo.swapB && bo.swapA !== bo.swapB && STATS.includes(bo.swapA) && STATS.includes(bo.swapB)) {
      const a = bo.swapA, b = bo.swapB, va = cur[a], vb = cur[b];
      cur[a] = vb; cur[b] = va;
      br[a].push({ src: `«Весы»: обмен с «${STAT_NAMES[b]}»`, v: vb - va, op: '⇄' });
      br[b].push({ src: `«Весы»: обмен с «${STAT_NAMES[a]}»`, v: va - vb, op: '⇄' });
    }
    // «эффекты болезней не могут опустить показатели ниже единицы»
    STATS.forEach(k => { if (race && cur[k] < 1) { br[k].push({ src: 'минимум 1', v: 1 - cur[k], op: '↑' }); cur[k] = 1; } cur[k] = ri(cur[k]); });
    const isVoid = boon && boon.fx.void;
    out.stats = cur; out.statBreak = br; out.baseStats = base; out.alloc = alloc;

    // --- размер
    let sizeIx = race ? sizeIndex(race.size) : null;
    const sizeMods = [];
    if (sizeIx !== null) {
      traitFx.forEach(([k, fx]) => { if (fx && fx.size) { sizeIx += fx.size; sizeMods.push(`черта «${k}» ${signed(fx.size)}`); } });
      if (boon && boon.fx.size) { sizeIx += boon.fx.size; sizeMods.push(`болезнь «${boon.src.name}» ${signed(boon.fx.size)}`); }
      sizeIx = Math.max(0, Math.min(SIZES.length - 1, sizeIx));
    }
    const size = sizeIx !== null ? SIZES[sizeIx] : null;
    out.size = size; out.sizeMods = sizeMods;
    if (race && !size && !race.isHalf) warnings.push({ step: 'race', msg: `Размер расы «${race.size}» не распознан${race.ancestorRule ? ' — выберите предка' : ''}.` });
    const sizeK = size ? size.k : 1;

    // --- руки
    let hands = 2;
    (race ? race.fx : []).forEach(f => { if (f.k === 'hands') hands = Math.max(hands, f.v); });
    const handsBase = hands;
    if (allTraits.includes('калека')) hands = Math.max(0, hands - (to.arms || 0));
    out.hands = hands; out.handsBase = handsBase;
    if (allTraits.includes('калека') && (to.arms || 0) > handsBase) errors.push({ step: 'traits', msg: `«Калека»: у расы всего ${handsBase} рук(и).` });
    if (allTraits.includes('калека') && (to.legs || 0) > 2) errors.push({ step: 'traits', msg: '«Калека»: ног не больше двух.' });

    // --- таланты
    const talents = {};
    let talentSpent = 0;
    const raceTalent = {};
    (race ? race.fx.concat(race.pfx) : []).forEach(f => { if (f.k === 'talent' && !f.cond) raceTalent[f.id] = (raceTalent[f.id] || 0) + f.v; });
    let talentSpentStart = 0, talentSpentUp = 0;
    TALENTS.forEach(t => {
      const cap = talentCap(t);
      const invStart = Math.max(0, +((st.talents || {})[t.id]) || 0);
      const invUp = prog ? Math.max(0, +((prog.talents || {})[t.id]) || 0) : 0;
      const inv = invStart + invUp;
      talentSpentStart += invStart; talentSpentUp += invUp;
      talentSpent += inv;
      let bonus = raceTalent[t.id] || 0;
      const bsrc = bonus ? [`раса ${signed(bonus)}`] : [];
      if (t.id === 'харизма') traitFx.forEach(([k, fx]) => { if (fx && fx.charisma) { bonus += fx.charisma; bsrc.push(`«${k}» ${signed(fx.charisma)}`); } });
      if (t.id.startsWith('зоркость')) {
        (race ? race.fx : []).forEach(f => { if (f.k === 'zor' && !f.cond) { bonus += f.v; bsrc.push(`раса ${signed(f.v)}`); } });
        traitFx.forEach(([k, fx]) => { if (fx && fx.zor) { bonus += fx.zor; bsrc.push(`«${k}» ${signed(fx.zor)}`); } });
        if (boon && boon.fx.zor) { bonus += boon.fx.zor; bsrc.push(`«${boon.src.name}» ${signed(boon.fx.zor)}`); }
      }
      const baseV = t.base || 0;
      const total = baseV + inv + bonus;
      const blocked = t.id === 'скрытность' && boon && boon.fx.noStealth;
      // зоркость: базовые 50 и бонусы считаются отдельно от прокачки — предел только у вложенных очков
      const maxInv = t.base ? cap : Math.max(0, cap - Math.max(0, bonus));
      talents[t.id] = { def: t, inv, invStart, invUp, bonus, bsrc, base: baseV, total, maxInv, cap, sepBase: !!t.base, blocked };
      if (inv > maxInv) errors.push({ step: 'talents', msg: t.base ? `${t.name}: вложить можно не больше ${cap} (вложено ${inv}).` : `${t.name}: не выше ${cap} (вложено ${inv}, с бонусами ${total}).` });
      if (blocked && inv) errors.push({ step: 'talents', msg: '«Яркое око»: вы не можете применять скрытность — не вкладывайте в неё очки.' });
    });
    // пассивные навыки, изученные в игре, прокачиваются теми же очками талантов (prog.passives: { название: вложено })
    const passiveSpent = prog ? Object.values(prog.passives || {}).reduce((a, x) => a + Math.max(0, +x || 0), 0) : 0;
    talentSpentUp += passiveSpent; talentSpent += passiveSpent;
    out.talents = talents; out.talentSpent = talentSpent;
    if (!prog) {
      if (talentSpent > out.talentPoints) errors.push({ step: 'talents', msg: `Очков талантов потрачено ${talentSpent} из ${out.talentPoints}.` });
      else if (race && age && talentSpent < out.talentPoints) warnings.push({ step: 'talents', msg: `Не распределено очков талантов: ${out.talentPoints - talentSpent}.` });
    } else {
      const upPoints = out.talentPoints - out.talentPointsStart;
      if (talentSpentStart > out.talentPointsStart) errors.push({ step: 'talents', msg: `Очков талантов при создании потрачено ${talentSpentStart} из ${out.talentPointsStart}.` });
      if (talentSpentUp > upPoints) errors.push({ step: 'progress', msg: `Очков талантов за новые уровни вложено ${talentSpentUp}, а получено ${upPoints}.` });
      else if (talentSpentUp < upPoints) warnings.push({ step: 'progress', msg: `Не распределено очков талантов за новые уровни: ${upPoints - talentSpentUp}.` });
      Object.assign(out.prog, { talentPoints: upPoints, talentSpent: talentSpentUp });
    }

    // --- снаряжение
    const gear = computeGear(st, { race, sizeK, stats: cur, errors, warnings, flags, hands });
    out.gear = gear;

    // --- производные параметры
    const T = isVoid ? 0 : cur.t, Dh = cur.d;
    const der = {};
    der.hp = isVoid ? Dh : 2 * T;
    const ancHp = race && race.ancestor && race.ancestor.fx && race.ancestor.fx.hp;
    if (ancHp) der.hp += ancHp;
    der.viv = isVoid ? null : T;
    // реген хп
    let hpReg = Math.floor(T / 5);
    const hpRegSrc = [`тело/5 = ${Math.floor(T / 5)}`];
    (race ? race.fx : []).forEach(f => { if (f.k === 'hpRegen' && !f.cond) { hpReg += f.v; hpRegSrc.push(`раса +${f.v}`); } });
    if (gear.hpRegenMod) { hpReg += gear.hpRegenMod; hpRegSrc.push(`материал брони ${signed(gear.hpRegenMod)}`); }
    const ancFx = (race && race.ancestor && race.ancestor.fx) || {};
    const ancSrc = race && race.ancestor ? `предок ${race.ancestor.name}${race.ancestorRule.kind === 'dragon' ? ' (50%)' : ''}` : '';
    if (ancFx.hpRegen) { hpReg += ancFx.hpRegen; hpRegSrc.push(`${ancSrc} +${ancFx.hpRegen}`); }
    let hpPct = 0;
    traitFx.forEach(([k, fx]) => { if (fx && fx.hpRegenPct) { hpPct += fx.hpRegenPct; hpRegSrc.push(`«${k}» ${signed(fx.hpRegenPct)}%`); } });
    if (age && age.regenMul) { hpPct += 20; hpRegSrc.push('ребёнок +20%'); }
    hpReg = hpReg * (1 + hpPct / 100);
    // «200% регенерация» предка — отдельный множитель поверх остальных процентов
    if (ancFx.hpRegenPct) { hpReg = hpReg * (1 + ancFx.hpRegenPct / 100); hpRegSrc.push(`${ancSrc}: регенерация +${ancFx.hpRegenPct}%`); }
    if (boon && boon.fx.noHpRegen) { hpReg = 0; hpRegSrc.push(`«${boon.src.name}»: реген хп отключён`); }
    der.hpRegen = ri(hpReg); der.hpRegenSrc = hpRegSrc;
    der.vamp = ancFx.vamp || 0; der.vampSrc = ancFx.vamp ? ancSrc : '';
    der.mp = 2 * Dh; der.psi = 2 * Dh;
    let mpReg = Math.floor(Dh / 5);
    const mpRegSrc = [`дух/5 = ${Math.floor(Dh / 5)}`];
    (race ? race.fx : []).forEach(f => { if (f.k === 'mpRegen' && !f.cond) { mpReg += f.v; mpRegSrc.push(`раса +${f.v}`); } });
    if (ancFx.mpRegen) { mpReg += ancFx.mpRegen; mpRegSrc.push(`${ancSrc} +${ancFx.mpRegen}`); }
    let mpPct = 0;
    traitFx.forEach(([k, fx]) => { if (fx && fx.mpRegenPct) { mpPct += fx.mpRegenPct; mpRegSrc.push(`«${k}» ${signed(fx.mpRegenPct)}%`); } });
    if (age && age.regenMul) { mpPct += 20; mpRegSrc.push('ребёнок +20%'); }
    mpReg = mpReg * (1 + mpPct / 100);
    (race ? race.fx : []).forEach(f => { if (f.k === 'mpRegenMul' && !f.cond) { mpReg *= f.v; mpRegSrc.push(`раса ×${f.v}`); } });
    if (boon && boon.fx.mpRegenMul) { mpReg *= boon.fx.mpRegenMul; mpRegSrc.push(`«${boon.src.name}» ×${boon.fx.mpRegenMul}`); }
    der.mpRegen = ri(mpReg); der.mpRegenSrc = mpRegSrc;
    der.slots = cur.s + gear.bagSlots; der.slotsUsed = gear.slotsUsed;
    if (der.slotsUsed > der.slots) warnings.push({ step: 'gear', msg: `Предметов ${der.slotsUsed}, а слотов ${der.slots} (сила + сумки; каждый предмет — 1 слот).` });
    der.dodge = ri(cur.l + gear.dodgeMod);
    // ОД
    const odSrc = [];
    let od = 0;
    if (age && age.od) { od += age.od; odSrc.push(`возраст ${signed(age.od)}`); }
    if (size && size.od) { od += size.od; odSrc.push(`размер ${signed(size.od)}`); }
    (race ? race.fx.concat(race.pfx) : []).forEach(f => { if (f.k === 'od' && !f.cond) { od += f.v; odSrc.push(`раса ${signed(f.v)}${f.half ? ' (½)' : ''}`); } });
    traitFx.forEach(([k, fx]) => { if (fx && fx.od) { od += fx.od; odSrc.push(`«${k}» ${signed(fx.od)}`); } });
    if (boon && boon.fx.od) { od += boon.fx.od; odSrc.push(`«${boon.src.name}» ${signed(boon.fx.od)}`); }
    if (ancFx.od) { od += ancFx.od; odSrc.push(`${ancSrc} ${signed(ancFx.od)}`); }
    der.od = od; der.odMod = od; der.odSrc = odSrc.length ? odSrc : ['нет модификаторов'];
    der.odBase = C.BASE_OD_TURN || 0; der.odTotal = der.odBase + od;
    if (race && der.odTotal < 1) warnings.push({ step: 'stats', msg: `ОД в ход: ${odText(der)} = ${der.odTotal} — меньше одного действия за ход.` });
    const condOd = (race ? race.fx.concat(race.pfx) : []).filter(f => f.k === 'od' && f.cond);
    der.odCond = condOd;
    // привлекательность
    let attr = 0; const attrSrc = [];
    (race ? race.fx.concat(race.pfx) : []).forEach(f => { if (f.k === 'attr' && !f.cond) { attr += f.v; attrSrc.push(`раса ${signed(f.v)}`); } });
    traitFx.forEach(([k, fx]) => { if (fx && fx.attr) { attr += fx.attr; attrSrc.push(`«${k}» ${signed(fx.attr)}`); } });
    der.attr = Math.max(-C.ATTR_LIMIT, Math.min(C.ATTR_LIMIT, attr)); der.attrSrc = attrSrc;
    der.charisma = talents['харизма'] ? talents['харизма'].total : 0;
    der.zor = talents['зоркость (базовая 50)'] ? talents['зоркость (базовая 50)'].total : C.BASE_ZOR;
    // карма
    const align = race ? race.align : '';
    der.karma = C.KARMA[align] || 0; der.align = align;
    // молитвы
    let prayers = C.BASE_PRAYERS; const prSrc = [`база ${C.BASE_PRAYERS}`];
    traitFx.forEach(([k, fx]) => { if (fx && fx.prayers) { prayers += fx.prayers; prSrc.push(`«${k}» ${signed(fx.prayers)}`); } });
    if (boon && boon.fx.prayers) { prayers += boon.fx.prayers; prSrc.push(`«${boon.src.name}» +${boon.fx.prayers}`); }
    (race ? race.fx : []).forEach(f => { if (f.k === 'prayers') { prayers += f.v; prSrc.push(`раса +${f.v}`); } });
    if (gear.prayers) { prayers += gear.prayers; prSrc.push(`оружие +${gear.prayers}`); }
    if (race && race.id === 'фариштаи') { prayers = 0; prSrc.push('Фариштаи: не могут использовать молитвы'); }
    der.prayers = Math.max(0, prayers); der.prayersSrc = prSrc;
    der.faithless = !aff.religion;
    // ячейки заклинаний
    let slots = C.BASE_SPELL_SLOTS; const slSrc = [`база ${C.BASE_SPELL_SLOTS}`];
    traitFx.forEach(([k, fx]) => { if (fx && fx.slots) { slots += fx.slots; slSrc.push(`«${k}» ${signed(fx.slots)}`); } });
    if (gear.spellSlots) { slots += gear.spellSlots; slSrc.push(`гримуар +${gear.spellSlots}`); }
    if (noMagic) { slots = 0; slSrc.push('«обычный»: лишает магии'); }
    if (boon && boon.fx.noCast) { slots = 0; slSrc.push('«Антимагия»: не можете применять магию'); }
    der.spellSlots = Math.max(0, slots); der.spellSlotsSrc = slSrc;
    // опыт и проценты
    let exp = 0; traitFx.forEach(([k, fx]) => { if (fx && fx.exp) exp += fx.exp; });
    der.expPct = exp; der.expMul = boon && boon.fx.expMul ? boon.fx.expMul : 1;
    let mag = 0; traitFx.forEach(([k, fx]) => { if (fx && fx.magPct) mag += fx.magPct; });
    der.magPct = mag;
    der.gold = boon && boon.fx.gold ? boon.fx.gold : 0;
    der.revive = boon && boon.fx.revive ? boon.fx.revive : 0;
    der.madness = boon && boon.fx.madness ? boon.fx.madness : 0;
    der.sizeIn = size ? (flags.noSizeDebuff && size.inc > 0 ? 0 : size.inc) : 0;
    der.sizeOut = size ? size.out : 0;
    out.der = der;
    out.flags = flags;

    // --- символы и особенности
    const symbols = [];
    const addSym = (name, src) => { if (name && !symbols.some(s => norm(s.name) === norm(name))) symbols.push({ name, src }); };
    (race ? race.fx : []).forEach(f => {
      if (f.k === 'symbol') addSym(f.id === 'дракон' ? 'символ дракона' : f.id, f.half ? 'раса (½)' : 'раса');
      if (f.k === 'symbolByAffiliation') {
        if (race.id === 'они' && st.oniClan) addSym(`символ клана: ${st.oniClan}`, 'раса (клан)');
        else if (!(race.ancestor && race.ancestor.demon)) addSym('символ покровителя — выберите бога-покровителя', 'раса');
      }
    });
    if (race && race.ancestor && race.ancestor.symbol) addSym(race.ancestor.symbol, `знак дракона рода (${race.ancestor.name})`);
    if (race && race.ancestor && race.ancestor.demon) addSym(race.ancestor.element ? `символ принадлежности: ${race.ancestor.element}` : 'символ принадлежности — ГМ ещё не задал символ', `${race.ancestorRule.kind === 'god' ? 'бог-покровитель' : 'демон-предок'} ${race.ancestor.name}`);
    for (let i = 0; i < cnt('тайное знание'); i++) { const sym = to[optKey('secretSymbol', i)]; if (sym) addSym(sym, 'черта «тайное знание»'); }
    if (boon && boon.fx.option === 'prevExp' && bo.prevSymbol) addSym(bo.prevSymbol, 'благословение «предыдущий опыт»');
    if (boon && boon.fx.roll === 'element' && st.rolls && st.rolls.element) addSym(`${st.rolls.element.v} (усилен ×3)`, '«проводник стихии»');
    out.symbols = symbols;

    // --- итоговая проверка
    const nameMissing = !String(st.name || '').trim();
    if (nameMissing) errors.push({ step: 'story', msg: 'Укажите имя персонажа.' });
    if (noMagic && boon && boon.fx.noCast) notes.push('«обычный» и «Антимагия» обе отключают магию.');
    out.ok = errors.length === 0;
    return out;
  }

  // ---------------------------------------------------------------- случайные броски

  // ОД в ход: «3 + 1», «3 − 2», «3»
  function odText(d) {
    const m = d.odMod !== undefined ? d.odMod : d.od;
    const b = d.odBase !== undefined ? d.odBase : (C.BASE_OD_TURN || 0);
    return m ? `${b} ${m > 0 ? '+' : '−'} ${Math.abs(m)}` : `${b}`;
  }

  function rnd(n) { return Math.floor(Math.random() * n); }
  function isLocked() { return !D.creatures; }
  // «Расхититель древностей»: открытый список артефактов (раздел «Артефакты» справочника закрыт)
  function artifactRoll(idx) {
    const a = (D.artifactPool || [])[idx];
    return a ? { v: a.name, detail: a.effect, block: a.cursed ? 'проклятый артефакт' : 'артефакт' } : null;
  }
  // бросок из прошлой версии сайта мог сохраниться только номером — показываем название
  function rollView(r) {
    if (r && r.idx !== undefined && /^артефакт №/.test(r.v || '')) return Object.assign({}, r, artifactRoll(r.idx) || {});
    return r;
  }
  function roll(kind, st) {
    kind = String(kind).replace(/\d+$/, '');   // curse2, curse3 — повторные броски проклятия
    if (kind === 'artifact') {
      const idx = rnd((D.artifactPool || []).length || 1);
      return Object.assign({ idx }, artifactRoll(idx));
    }
    if (kind === 'element') {
      const list = D.skills.symbols.filter(s => s.cat !== 'запретные знания' && /Хе/.test(s.e1));
      const s = list[rnd(list.length)];
      return { v: s.name, detail: s.e1 };
    }
    if (kind === 'parts') { const n = 1 + rnd(3); return { v: `${n}`, detail: `удалено частей тела или органов: ${n}` }; }
    if (kind === 'beasts') { const n = 2 + rnd(3); return { v: `${n}`, detail: `за вами ходят ${n} случайных существа (изначально нейтральны)` }; }
    if (kind === 'curse') {
      // «при получении проклятия кидается 50/50 для верхнего и нижнего блока»
      const upper = Math.random() < 0.5;
      if (upper) {
        const g = D.skills.gifts[rnd(D.skills.gifts.length)];
        return { v: g.name, block: 'верхний блок (тёмный дар в виде проклятия)', detail: `${g.bonus} / ${g.debuff}` };
      }
      const c = D.skills.curses[rnd(D.skills.curses.length)];
      return { v: c.name, block: 'нижний блок (проклятия)', detail: c.effect };
    }
    if (kind === 'replicantTrait') {
      const t = D.skills.traitsNeg[rnd(D.skills.traitsNeg.length)];
      return { v: t.name, detail: `${t.effect} (удвоено)` };
    }
    return null;
  }

  window.Rules = {
    init, newState, compute, roll, rollView, isLocked, norm, fmt, signed, r1, roundLevel, traitRepeatable, optKey, patronSymbol, patronList, odText, talentCap,
    STATS, STAT_NAMES, STAT_SHORT, AGES, SIZES, TALENTS, TRAIT_FX, BOON_FX, ONI_CLANS, ANCESTOR, AMMO, NOT_WEAPON,
    POTION_TYPES, KARMA_TEXT, habitatNames, parseGroupStat,
    sizeUnits, scaledEffect, multiplyEffect, reqCheck, reqText, armorStatEffects, REQ_PENALTY, ri,
    get index() { return IX; }
  };
})();
