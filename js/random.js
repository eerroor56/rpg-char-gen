/*
 * Случайный персонаж. Собирает героя целиком по тем же правилам, что и мастер
 * (проверка — через Rules.compute), или перебрасывает отдельный шаг. После любого
 * броска «чинятся» зависящие шаги: если смена расы сломала распределение очков,
 * очки раскладываются заново, а всё, что осталось правильным, не трогается.
 */
(function () {
  'use strict';
  const R = window.Rules, C = window.GM_CONFIG, D = window.GAME_DATA;
  const norm = R.norm;

  // ------------------------------------------------------------ случайность
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => (a && a.length ? a[rnd(a.length)] : undefined);
  const chance = p => Math.random() < p;
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const weighted = list => { let x = Math.random() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) { if ((x -= w) < 0) return v; } return list[list.length - 1][0]; };
  const zero = () => ({ t: 0, d: 0, s: 0, i: 0, l: 0 });
  const errorsOf = (st, step) => R.compute(st).errors.filter(e => e.step === step);
  const REQ = { 'т': 't', 'д': 'd', 'с': 's', 'и': 'i', 'л': 'l' };
  // требования предмета ({л: 15, с: 18}) против характеристик; гомункулам — половина
  const fits = (req, stats, half) => Object.entries(req || {}).every(([k, v]) => !REQ[k] || (stats[REQ[k]] || 0) >= Math.ceil(half ? v / 2 : v));
  const reqOk = (req, stats) => {
    for (const m of String(req || '').matchAll(/(\d+)\s*([тдсилТДСИЛ])/g)) if ((stats[REQ[m[2].toLowerCase()]] || 0) < +m[1]) return false;
    return true;
  };

  // ------------------------------------------------------------ словари для имени и истории
  // имя: слог (на согласную) + гласная + окончание (на согласную), иногда ещё слог в середине
  const SYL1 = ['Ар', 'Бел', 'Вар', 'Гор', 'Дар', 'Эл', 'Зар', 'Ил', 'Кор', 'Лир', 'Мор', 'Нар', 'Ор', 'Рав', 'Сил', 'Тар', 'Ул', 'Фен', 'Хал', 'Шер',
    'Кай', 'Аш', 'Мир', 'Тал', 'Сар', 'Ив', 'Эр', 'Лан', 'Вел', 'Тор', 'Ран', 'Гил'];
  const VOW = ['а', 'и', 'о', 'е', 'а', 'и', 'у'];
  const MID = ['р', 'л', 'н', 'в', 'д', 'м'];
  const SYL3 = ['н', 'р', 'с', 'л', 'д', 'т', 'ния', 'на', 'ра', 'ла', 'рис', 'лин', 'мир', 'дар', 'вин', 'тан', 'рен', 'сель', 'нор', 'ан', 'ин'];
  const LOOKS = ['шрам через бровь', 'разноцветные глаза', 'седая прядь в волосах', 'татуировка-оберег на запястье', 'вечно обветренное лицо',
    'серьга из кости в одном ухе', 'плащ, заштопанный в десятке мест', 'обожжённые кончики пальцев', 'тихий хриплый голос', 'выцветший герб на одежде',
    'привычка теребить амулет', 'слишком дорогие для бродяги сапоги'];
  const MOTIVES = ['ищет пропавшего брата', 'хочет расплатиться со старым долгом', 'бежит от прошлого, которое идёт по пятам', 'мечтает найти легендарный артефакт',
    'дал клятву защищать слабых', 'хочет доказать семье, что чего-то стоит', 'ищет лекарство для близкого человека', 'жаждет мести за сожжённый дом',
    'собирает истории для своей книги', 'хочет разбогатеть и купить свой трактир', 'ищет учителя, который исчез много лет назад', 'выполняет последнюю волю наставника'];
  const ORIGINS = ['Вырос в портовом городе среди контрабандистов.', 'Бывший послушник храма, ушедший до пострига.', 'Сын лесника с окраины империи.',
    'Единственный выживший из каравана, сгинувшего в пустошах.', 'Служил в городской страже, пока не увидел лишнего.', 'Подмастерье алхимика, сбежавший после взрыва в лаборатории.',
    'Найдёныш, воспитанный бродячими артистами.', 'Потомок обедневшего рода с громкой фамилией.', 'Охотник на чудовищ в третьем поколении.',
    'Бывший гладиатор, выкупивший свободу.', 'Картограф, который однажды не вернулся из экспедиции вовремя.', 'Деревенский травник, которого позвала дорога.'];
  const WORDS = ['несправедливость', 'неподвижность', 'неудача', 'невезение', 'неточность', 'неосторожность'];
  const DMG = ['огонь', 'вода', 'лёд', 'молния', 'яд', 'кислота', 'тьма', 'святость', 'физический', 'магический', 'кровотечение', 'горение', 'оглушение', 'страх', 'очарование', 'сон', 'удушение', 'болезнь'];

  function randomName() {
    let n = pick(SYL1) + pick(VOW);
    if (chance(0.3)) n += pick(MID) + pick(VOW);
    let end = pick(SYL3);
    if (/^[аи]/.test(end) && /[аеиоуя]$/.test(n)) end = end.slice(1) || 'н';   // без «аан», «иин»
    n += end;
    return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  }

  // ------------------------------------------------------------ шаги
  function rollRace(st) {
    const races = D.races.filter(r => r.playable);
    const r = pick(races);
    Object.assign(st, { raceId: r.id, parentA: '', parentB: '', hbAlign: '', hbSize: '', ancestor: '', ancestorAbility: '', oniClan: '' });
    if (r.id === 'полукровка') {
      const pool = races.filter(x => x.id !== 'полукровка');
      const [a, b] = shuffle(pool);
      Object.assign(st, { parentA: a.id, parentB: b.id, hbAlign: pick(['добро', 'нейтрал', 'зло', 'мир']) });
      const res = R.compute(st);
      st.hbSize = pick((res.race && res.race.sizeOptions) || []) || '';
    }
    rollAncestor(st);
    if (r.id === 'они') st.oniClan = pick(R.ONI_CLANS).id;
  }

  function rollAncestor(st) {
    const rule = R.ANCESTOR[st.raceId];
    st.ancestor = ''; st.ancestorAbility = '';
    if (!rule) return;
    const A = D.ancestors || [];
    if (rule.kind === 'dragon') st.ancestor = (pick(A.filter(c => c.sec === 'Драконы')) || {}).n || '';
    else if (rule.kind === 'monster') {
      const withAb = A.filter(c => c.ab && c.ab.length);
      const c = pick(chance(0.85) && withAb.length ? withAb : A);
      if (c) { st.ancestor = c.n; st.ancestorAbility = c.ab && c.ab.length ? String(rnd(c.ab.length)) : ''; }
    } else if (rule.kind === 'insect') st.ancestor = (pick(A.filter(c => c.ins)) || {}).n || '';
    else if (rule.kind === 'beastRace') st.ancestor = (pick(D.races.filter(x => x.playable && x.faction === '30')) || {}).id || '';
    else st.ancestor = (pick(R.patronList(rule.kind)) || {}).name || '';
  }

  function rollAge(st) {
    const id = weighted([['ребёнок', 1], ['юный', 2], ['взрослый', 4], ['пожилой', 2], ['старец', 1]]);
    const rg = C.AGE_RANGES[id];
    st.ageCat = id;
    st.agePct = rg.min === rg.max ? rg.min : rg.min + rnd(rg.max - rg.min + 1);
  }

  function doRoll(st, key) {
    const r = R.roll(key, st);
    if (!r) return;
    st.rolls = st.rolls || {};
    st.rolls[key] = Object.assign(r, { n: 1 });
  }

  function clearBoon(st) {
    st.boon = { kind: '', name: '' }; st.boonOpt = {};
    ['artifact', 'element', 'parts', 'beasts', 'replicantTrait'].forEach(k => { if (st.rolls) delete st.rolls[k]; });
  }

  function rollBoon(st) {
    for (let attempt = 0; attempt < 12; attempt++) {
      clearBoon(st);
      if (chance(0.35)) return;                       // треть героев — без дара
      const res = R.compute(st);
      const hom = res.race && res.race.id === 'гомункулы';
      const kind = pick(hom ? ['gift'] : ['gift', 'gift', 'buff', 'disease']);
      const list = kind === 'gift' ? D.skills.gifts : kind === 'buff' ? D.skills.buffs.filter(b => b.birth) : D.skills.diseases.filter(d => d.birth);
      const b = pick(list);
      if (!b) continue;
      st.boon = { kind, name: b.name };
      const fx = (R.BOON_FX[kind] || {})[norm(b.name)] || {};
      const o = st.boonOpt;
      if (fx.option === 'swap') { const [a, c] = shuffle(R.STATS); o.swapA = a; o.swapB = c; }
      if (fx.option === 'otherRace') {
        const r = pick(D.races.filter(x => x.playable && x.id !== 'полукровка'));
        o.otherRace = r.id;
        if (!r.penalty || /^нет$/i.test(r.penalty.trim())) doRoll(st, 'replicantTrait');
      }
      if (fx.option === 'word') o.word = pick(WORDS);
      if (fx.option === 'immunity') o.immunity = pick(DMG);
      if (fx.option === 'prevExp') {
        const stats = R.compute(st).stats;
        const acts = D.skills.startActives || [], stances = D.skills.startStances || [];
        const syms = D.skills.symbols.filter(s => s.cat !== 'запретные знания');
        o.prevSkill = (pick(acts.filter(a => reqOk(a.req, stats))) || pick(acts) || {}).name || '';
        o.prevStance = (pick(stances.filter(a => reqOk(a.req, stats))) || pick(stances) || {}).name || '';
        o.prevSymbol = (pick(syms) || {}).name || '';
      }
      if (fx.roll) doRoll(st, fx.roll);
      if (!errorsOf(st, 'boon').length) return;
    }
    clearBoon(st);
  }

  function clearTraits(st) {
    st.traits = []; st.traitOpt = { arms: 0, legs: 0 };
    if (st.rolls) Object.keys(st.rolls).filter(k => /^curse\d*$/.test(k)).forEach(k => delete st.rolls[k]);
  }

  function rollTraits(st) {
    clearTraits(st);
    const res0 = R.compute(st);
    if (!res0.age || !res0.age.traits || chance(0.2)) return;     // пятая часть — без черт
    const limit = res0.age.traits, free = res0.traits.free || 0;
    const hom = res0.race && res0.race.id === 'гомункулы';
    const noCast = !!(res0.boon && res0.boon.fx.noCast);
    const oppOf = k => { const fx = R.TRAIT_FX[k] || {}; const back = Object.entries(R.TRAIT_FX).filter(([, f]) => f.opp && norm(f.opp) === k).map(([kk]) => kk); return (fx.opp ? [norm(fx.opp)] : []).concat(back); };
    for (let attempt = 0; attempt < 60; attempt++) {
      const traits = [], keys = new Set();
      const ok = n => !keys.has(n) && !oppOf(n).some(o => keys.has(o));
      const add = (name) => { traits.push(name); keys.add(norm(name)); };
      const nPos = 1 + rnd(Math.max(1, Math.min(limit + free, limit + 2)));
      for (const t of shuffle(D.skills.traitsPos)) { if (traits.length >= nPos) break; const k = norm(t.name); if (ok(k) && !(noCast && (R.TRAIT_FX[k] || {}).magic)) add(t.name); }
      // иногда одна черта берётся дважды
      if (chance(0.15) && traits.length && traits.length < nPos + 1) { const d = pick(traits.filter(n => R.traitRepeatable(n))); if (d) traits.push(d); }
      let posCount = traits.length;
      let weight = free, nNeg = 0;
      const opt = { arms: 0, legs: 0 };
      const magicPos = traits.some(n => (R.TRAIT_FX[norm(n)] || {}).magic);
      for (const t of shuffle(D.skills.traitsNeg)) {
        if (weight >= posCount || nNeg >= limit) break;
        const k = norm(t.name);
        if (!ok(k) || (k === 'проклят' && hom) || (k === 'обычный' && magicPos)) continue;
        const w = k === 'калека' ? 2 : (R.TRAIT_FX[k] || {}).weight || 1;
        if (w > 1 && weight + w > posCount + 1 && chance(0.7)) continue;   // крупные «уравновешиватели» — реже и без большого перебора
        if (k === 'калека') { if (!chance(0.3)) continue; opt.legs = 1; }
        weight += w; add(t.name); nNeg++;
      }
      // если отрицательные покрыли больше, добрать положительные до баланса
      const noMagic = keys.has('обычный') || (noCast);
      for (const t of shuffle(D.skills.traitsPos)) {
        if (posCount >= weight) break;
        const k = norm(t.name);
        if (!ok(k) || (noMagic && (R.TRAIT_FX[k] || {}).magic)) continue;
        add(t.name); posCount++;
      }
      st.traits = traits; st.traitOpt = opt;
      if (errorsOf(st, 'traits').length) continue;
      // параметры выбранных черт
      const count = k => traits.filter(n => norm(n) === k).length;
      const resist = shuffle(DMG);
      for (let i = 0; i < count('резистентный'); i++) opt[R.optKey('resist', i)] = resist[i];
      for (let i = 0; i < count('уязвимый'); i++) opt[R.optKey('vuln', i)] = resist[resist.length - 1 - i];
      const syms = shuffle(D.skills.symbols);
      for (let i = 0; i < count('тайное знание'); i++) opt[R.optKey('secretSymbol', i)] = syms[i].name;
      for (let i = 0; i < count('проклят'); i++) doRoll(st, R.optKey('curse', i));
      if (!errorsOf(st, 'traits').length) return;
    }
    clearTraits(st);
  }

  function rollStats(st, keep) {
    const res0 = R.compute(st);
    if (!res0.race || !res0.age) { st.alloc = zero(); return; }
    const P = res0.agePoints, base = res0.baseStats;
    let alloc = zero(), left = P;
    if (keep) {                                        // «дополнить»: оставить разложенное, если знак совпадает
      const cur = Object.assign(zero(), st.alloc || {});
      const sum = R.STATS.reduce((a, k) => a + (+cur[k] || 0), 0);
      const sameSign = R.STATS.every(k => (P >= 0 ? cur[k] >= 0 : cur[k] <= 0) && base[k] + cur[k] >= 1);
      if (sameSign && Math.abs(sum) <= Math.abs(P)) { alloc = cur; left = P - sum; }
    }
    if (left > 0) {
      const w = {}; R.STATS.forEach(k => { w[k] = Math.random() ** 2; });
      shuffle(R.STATS).slice(0, 1 + rnd(2)).forEach(k => { w[k] += 1.5; });   // 1–2 любимые характеристики
      const tot = R.STATS.reduce((a, k) => a + w[k], 0);
      let given = 0;
      R.STATS.forEach(k => { const v = Math.floor(left * w[k] / tot); alloc[k] += v; given += v; });
      for (let r = left - given; r > 0; r--) alloc[weighted(R.STATS.map(k => [k, w[k]]))]++;
    } else if (left < 0) {
      let need = -left;
      const cap = k => base[k] + alloc[k] - 1;
      const w = {}; R.STATS.forEach(k => { w[k] = Math.max(0, cap(k)) * (0.5 + Math.random()); });
      const tot = R.STATS.reduce((a, k) => a + w[k], 0) || 1;
      R.STATS.forEach(k => { const v = Math.min(cap(k), Math.floor(need * w[k] / tot)); alloc[k] -= v; });
      need = -P + R.STATS.reduce((a, k) => a + alloc[k], 0);
      for (const k of shuffle(R.STATS)) while (need > 0 && cap(k) > 0) { alloc[k]--; need--; }
    }
    st.alloc = alloc;
  }

  function rollTalents(st, keep) {
    if (!keep) st.talents = {};
    st.talents = st.talents || {};
    const res = R.compute(st);
    if (!res.race || !res.age) return;
    let left = res.talentPoints - res.talentSpent;
    if (left < 0) { st.talents = {}; return rollTalents(st, true); }
    const room = t => res.talents[t.id].maxInv - (st.talents[t.id] || 0);
    const avail = R.TALENTS.filter(t => !res.talents[t.id].blocked && room(t) > 0);
    const fav = shuffle(avail).slice(0, 2 + rnd(3));
    while (left > 0) {
      let cands = fav.filter(t => room(t) > 0);
      if (!cands.length) cands = avail.filter(t => room(t) > 0);
      const t = pick(cands);
      if (!t) break;
      const step = Math.max(1, Math.min(left, room(t), Math.ceil(left / 6)));
      st.talents[t.id] = (st.talents[t.id] || 0) + step;
      left -= step;
    }
  }

  function clearGear(st) {
    st.weapon = { name: '', mat: '' }; st.ammo = { name: '', mat: '' }; st.armor = { name: '', mat: '' }; st.items = []; st.misc = '';
  }

  function rollGear(st) {
    for (let attempt = 0; attempt < 25; attempt++) {
      clearGear(st);
      const res = R.compute(st);
      if (!res.race || res.flags.noStartGear) return;
      const mats = C.START_MATERIALS;
      // оружие: по рукам и, если получится, по требованиям
      if (!res.flags.noWeapon) {
        const half = res.race.id === 'гомункулы';
        const ws = D.gear.weapons.filter(w => !R.NOT_WEAPON.includes(w.name) && !(w.hands > res.hands) && fits(w.req, res.stats, half));
        const w = pick(ws);                 // если персонажу ничего не по силам — без оружия
        if (w) {
          st.weapon = { name: w.name, mat: pick(mats) };
          const am = Object.keys(R.AMMO).filter(a => R.AMMO[a].includes(w.name));
          if (am.length) st.ammo = { name: pick(am), mat: pick(mats) };
        }
      }
      // броня или щит
      if (!res.flags.noArmor && res.race.id !== 'тэтре' && chance(0.9)) {
        const twoHanded = (D.gear.weapons.find(w => w.name === st.weapon.name) || {}).hands >= 2 && res.hands <= 2;
        const half = res.race.id === 'гомункулы';
        const a = pick(D.gear.armor.concat(twoHanded ? [] : D.gear.shields.filter(s => !s.upgrade)).filter(x => fits(x.req, res.stats, half)));
        if (a) {
          const light = ['лёгкая', 'одежда'].includes(a.cls);
          st.armor = { name: a.name, mat: pick(mats.filter(m => light || norm(m) !== 'магическая ткань')) };
        }
      }
      // до трёх разных предметов
      const items = [];
      for (const kind of shuffle(['bag', 'potion', 'food']).slice(0, rnd(C.START_ITEMS + 1))) {
        if (kind === 'bag') items.push({ kind, name: (pick(R.index.bags) || {}).name || '' });
        if (kind === 'food') items.push({ kind, name: (pick(D.alchemy.food) || {}).name || '' });
        if (kind === 'potion') items.push({ kind, name: '', effect: pick(R.POTION_TYPES), note: '', power: 5 * (1 + rnd(C.POTION_MAX / 5)) });
      }
      st.items = items;
      const r2 = R.compute(st);
      if (!r2.errors.some(e => e.step === 'gear') && r2.der.slotsUsed <= r2.der.slots) return;
    }
    if (errorsOf(st, 'gear').length) clearGear(st);
  }

  function rollStory(st, keep) {
    const set = (k, v) => { if (!keep || !String(st[k] || '').trim()) st[k] = v; };
    set('name', randomName());
    set('gender', pick(['мужской', 'женский']));
    set('look', pick(LOOKS));
    set('story', pick(ORIGINS));
    set('motive', pick(MOTIVES));
  }

  // ------------------------------------------------------------ сборка и починка

  // после броска одного шага: чиним только то, что стало ошибкой
  function repair(st) {
    let res = R.compute(st);
    const bad = step => res.errors.some(e => e.step === step);
    if (!res.race) { rollRace(st); res = R.compute(st); }
    if (bad('race')) { rollAncestor(st); if (st.raceId === 'они' && !st.oniClan) st.oniClan = pick(R.ONI_CLANS).id; res = R.compute(st); }
    if (!res.age) { rollAge(st); res = R.compute(st); }
    if (bad('boon')) { rollBoon(st); res = R.compute(st); }
    if (bad('traits')) { rollTraits(st); res = R.compute(st); }
    if (bad('stats')) { rollStats(st); res = R.compute(st); }
    if (bad('talents') || res.talentSpent < res.talentPoints) { rollTalents(st, !bad('talents')); res = R.compute(st); }
    if (bad('gear')) { rollGear(st); res = R.compute(st); }
    if (bad('story')) rollStory(st, true);
    return st;
  }

  function full() {
    const st = R.newState();
    rollRace(st); rollAge(st); rollBoon(st); rollTraits(st);
    rollStats(st); rollTalents(st); rollGear(st); rollStory(st);
    return repair(st);
  }

  // «дополнить»: заполнить только пустое, выбранное игроком не трогать
  function fill(st) {
    if (!st.raceId) rollRace(st);
    else if (R.ANCESTOR[st.raceId] && !st.ancestor) rollAncestor(st);
    if (!st.ageCat) rollAge(st);
    rollStats(st, true);
    rollTalents(st, true);
    const hasGear = (st.weapon && st.weapon.name) || (st.armor && st.armor.name) || (st.items || []).some(i => i && i.kind);
    if (!hasGear) rollGear(st);
    rollStory(st, true);
    return repair(st);
  }

  const STEP = {
    race: st => { rollRace(st); },
    age: st => { rollAge(st); },
    boon: st => { rollBoon(st); },
    traits: st => { rollTraits(st); },
    stats: st => { rollStats(st); },
    talents: st => { rollTalents(st); },
    gear: st => { rollGear(st); },
    story: st => { rollStory(st); }
  };
  function step(st, id) {
    if (!STEP[id]) return st;
    STEP[id](st);
    return repair(st);
  }

  window.RandomHero = { full, fill, step, repair, steps: Object.keys(STEP), randomName };
})();
