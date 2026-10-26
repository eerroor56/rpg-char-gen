/*
 * Генератор подземелий для ГМ (вкладка «Игра» → страница кампании).
 * Правила — лист «механики», «подземелья», и уточнения ГМ: комнаты разных типов (сколько каждого — DUNGEON.ROOMS),
 * коридоры длиной 2–8 (20% — лестница вниз: враги ниже получают +10% к статам), патрули в коридорах,
 * свет и расход пси и живости. Противники — из бестиария (открывается паролем ГМ).
 * Карта — как на листе «схемы»: комнаты с кодами (0 вход, 1 пустая, 2 противники, 3 сокровищница,
 * 4 ловушка, 5.1–5.6 специальные, 6 финал — он же комната босса, 8 секретная), между ними — длина коридора.
 * Последнее подземелье кампании хранится в этом браузере. Неоднозначные места — DUNGEON в js/config.js.
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, C = window.GM_CONFIG;
  const D = () => window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, norm = R.norm, ri = R.ri;
  const DC = C.DUNGEON;

  const rnd = n => Math.floor(Math.random() * n);
  const rint = (a, b) => a + rnd(b - a + 1);
  const pick = a => (a && a.length ? a[rnd(a.length)] : undefined);
  const chance = p => Math.random() < p;
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  const TYPES = {
    entrance: { code: '0', t: 'Вход' },
    empty: { code: '1', t: 'Пустая комната' },
    enemies: { code: '2', t: 'Комната с противниками' },
    treasury: { code: '3', t: 'Сокровищница' },
    trap: { code: '4', t: 'Ловушка' },
    special: { code: '5', t: 'Специальная комната' },
    final: { code: '6', t: 'Финал (комната босса)' },   // «финальная комната — она же босс комната» (ГМ)
    secret: { code: '8', t: 'Секретная комната' }
  };
  // «каждая специальная комната может появиться за одно подземелье до 2 раз … сверх лимита применяется комната ниже списком»;
  // «40% шанс, что в комнате будет тематический противник»
  const SPECIAL = ['алхимическая', 'комната с алтарём', 'оранжерея', 'кухня', 'библиотека', 'мастерская'];
  const THEMATIC = 0.4;
  const CORRIDOR = [2, 8], STAIRS = 0.2, STAIR_BONUS = 10;         // коридор 2–8; 20% — лестница; +10% к статам врагов за спуск
  const PATROL_STEP = 5, PATROL = [2, 6];                          // +5% за каждую пройденную комнату; отряд 2–6
  const ENEMIES = [1, 10];
  const CHESTS = [1, 3], CHEST_TRAP = 0.2, MIMIC = 0.1, COINS = [10, 100], CHEST_GEAR = [1, 3], CHEST_SPECIAL = [1, 3];
  const TRAP_ROLL = [20, 80], TRAP_DMG = [100, 500], TRAPS = [1, 3];  // в комнате 1–3 разные ловушки (урон и эффект у каждой свои)
  const BOSS_EXTRA = [0, 3];
  const ROOM_COST = 5, CORR_COST = 1;                              // пси, живость и % света: комната — 5, клетка коридора — 1
  // уровень освещения в процентах; ГМ может поменять его вручную. min — нижняя граница ступени
  const LIGHT = [
    { id: 'светло', range: '100–75%', min: 75, psi: 1, fx: 'игроки +10 к инициативе и +10 к попаданию' },
    { id: 'тускло', range: '75–50%', min: 50, psi: 2, fx: 'бонус игроков пропадает; потеря пси при перемещении ×2; враги +10 ко всем броскам' },
    { id: 'сумрачно', range: '50–1%', min: 1, psi: 4, fx: 'потеря пси ×4; игроки −10 ко всем броскам; враги +20; дроп с противников удваивается' },
    { id: 'темно', range: '0%', min: 0, psi: 8, fx: 'потеря пси ×8; игроки −20 ко всем броскам; враги +30 и +30% шанса крита; враги могут уронить золотую монету (50%)' }
  ];
  const TOP = { 'светло': 100, 'тускло': 74, 'сумрачно': 49, 'темно': 0 };   // подземелья, где свет хранился ступенью

  // ------------------------------------------------------------ данные
  const unlocked = () => !!(window.GMLock && window.GMLock.unlocked);
  const lvlOf = c => R.roundLevel(c.lvl);
  // уровни мира сверху вниз: «от *1 и ниже», «от 0 до -3»
  const ORDER = ['**4', '**3', '**2', '**1', '*3', '*2', '*1', '0', '-1', '-2', '-3'];
  function habMatch(hab, code) {
    if (!code) return true;
    const s = String(hab || '').toLowerCase();
    if (/всюду|везде/.test(s)) return true;
    const toks = (s.match(/\*\*\d|\*\d|\/\/\d|d\d|-\d|\b0\b/g) || []).map(t => t.toUpperCase());
    if (toks.includes(code.toUpperCase())) return true;
    const i = ORDER.indexOf(code), ix = toks.map(t => ORDER.indexOf(t)).filter(x => x >= 0);
    if (i < 0 || !ix.length) return false;
    if (/ниже/.test(s)) return i >= Math.min(...ix);
    if (/выше/.test(s)) return i <= Math.max(...ix);
    if (/(^|\s)(от|с)(\s|\*|-|\d)/.test(s) && /(до|по)(\s|\*|-|\d)/.test(s) && ix.length > 1) return i >= Math.min(...ix) && i <= Math.max(...ix);
    return false;
  }
  function pools(o) {
    const all = unlocked() ? D().creatures || [] : [];
    const mid = (o.min + o.max) / 2;
    const near = list => list.slice().sort((a, b) => Math.abs(lvlOf(a) - mid) - Math.abs(lvlOf(b) - mid));
    const here = all.filter(c => !c.cat && habMatch(c.hab, o.hab) && !/неспокойн\S*\s+вод/i.test(c.sec || ''));   // водные существа в комнатах не живут
    let foes = here.filter(c => lvlOf(c) >= o.min && lvlOf(c) <= o.max);
    if (foes.length < 3) foes = near(here).slice(0, 12);
    const allBoss = all.filter(c => c.cat === 'босс');
    const hereBoss = allBoss.filter(c => habMatch(c.hab, o.hab));
    return { foes, bosses: near(hereBoss.length ? hereBoss : allBoss).slice(0, 5), max: o.max, boss: o.boss !== false };
  }
  const symbols = () => (D().skills.symbols || []);
  const symName = s => String(s.name || '').replace(/\s*\(\d+\)$/, '');
  const statuses = () => {
    const st = unlocked() && D().mechanics ? (D().mechanics.main || []).find(x => /статус/.test(x.title)) : null;
    return st ? [...new Set(st.rows.map(r => r[0]).filter(Boolean))] : [];
  };
  const coin = id => (C.CURRENCIES.find(c => c.id === id) || {}).name || id;
  const gearBases = () => D().gear.weapons.filter(w => !R.NOT_WEAPON.includes(w.name)).concat(D().gear.armor, D().gear.shields.filter(s => !s.upgrade));
  const ingredients = () => (D().alchemy || {}).ingredients || [];

  // ------------------------------------------------------------ содержимое комнат
  // одна ловушка: урон 100–500 случайного типа (из списка символов), иногда статус-эффект
  function trapText() {
    const st = statuses();
    const status = st.length && chance(0.5) ? pick(st) : '';
    return `урон ${rint(...TRAP_DMG)} (${symName(pick(symbols()) || {}) || 'случайный тип'})${status ? `, накладывает «${status}»` : ''}`;
  }
  // reward — сундук с наградой в финале: он не бывает мимиком (иначе награды нет), ловушка возможна
  function chestText(reward) {
    if (!reward && chance(MIMIC)) return 'мимик!';
    const parts = [`монеты (${coin(pick(['м', 'се', 'з']))}): ${rint(...COINS)}`];
    const g = rint(...CHEST_GEAR), mats = D().materials || [], bases = gearBases();
    parts.push(Array.from({ length: g }, () => `${(pick(bases) || {}).name} (${(pick(mats) || {}).name})`).join(', '));
    // «особый дроп 1–3» — предметы группы «дроп из сундука» листа «разное»
    const drop = (D().items || []).filter(i => /сундук/.test(norm(i.g)));
    const n = rint(...CHEST_SPECIAL);
    parts.push(drop.length ? `особый дроп: ${Array.from({ length: n }, () => pick(drop).name).join(', ')}` : `особый дроп ×${n}`);
    if (chance(CHEST_TRAP)) parts.push(`⚠ ловушка: урон ${rint(...TRAP_DMG)} (${symName(pick(symbols()) || {})})`);
    return parts.join('; ');
  }
  // «трактат параметра — повышает выбранный параметр на 25» (лист «разное»): параметр выбирает тот, кто читает
  const treatise = () => 'трактат параметра (+25 к параметру на выбор)';
  function specialInfo(sub, info) {
    const ing = ingredients();
    switch (sub) {
      case 'алхимическая': {
        const n = rint(1, 3);
        const list = Array.from({ length: n }, () => {
          const i = pick(ing), e = i ? pick(i.e.filter(x => x[0])) : null;
          return e ? `зелье «${e[0]}» (из «${i.n.toLowerCase()}»)` : 'случайное зелье';
        });
        info.push(`Стойка с зельями: ${list.join(', ')}. Усиление или ослабление свойства — по выбору ГМ.`);
        break;
      }
      case 'комната с алтарём': {
        const g = pick((D().gods || []).concat(D().demons || []));
        info.push(`Алтарь: ${g ? g.name : 'случайный бог или демон'}. При взаимодействии — шанс усиления или ослабления до конца подземелья (мощность 20%): на урон или статы.`);
        break;
      }
      case 'оранжерея': {
        const plants = ing.filter(i => /растени/.test(i.g || ''));
        info.push(`Горшки с растениями: ${rint(5, 20)} × ${pick(plants) ? pick(plants).n.toLowerCase() : 'ингредиент растительного типа'}.`);
        break;
      }
      case 'кухня': {
        const f = pick((D().alchemy || {}).food || []);
        info.push(`Котлы и печи: ${rint(1, 5)} × ${f ? f.name : 'готовое блюдо'}.`);
        break;
      }
      case 'библиотека': {
        const found = [];
        if (chance(0.2)) found.push(`фолиант символа «${symName(pick(symbols().filter(s => s.cat !== 'запретные знания')) || {})}»`);
        let n = 0;
        for (let i = 0; i < 3; i++) if (chance(0.4)) n++;
        if (n) found.push(`${treatise()}${n > 1 ? ' ×' + n : ''}`);
        info.push(`Книжные шкафы: ${found.length ? found.join(', ') : 'ничего полезного'}.`);
        break;
      }
      case 'мастерская':
        info.push(`Ремесленные станки: ${rint(5, 10)} ед. материала «${((pick(D().materials || []) || {}).name || 'случайный')}».`);
        break;
      default: break;
    }
  }
  function fill(r, P) {
    const info = [], foes = [];
    const foe = (c, q) => { if (!c) return; const f = foes.find(x => x.n === c.n); if (f) f.q += q || 1; else foes.push({ n: c.n, lvl: lvlOf(c), q: q || 1, boss: c.cat === 'босс' }); };
    const some = n => { if (P.foes.length) for (let i = 0; i < n; i++) foe(pick(P.foes)); };
    switch (r.type) {
      case 'entrance': info.push('Вход в подземелье.'); break;
      case 'empty': info.push(`Интерьер: ${shuffle(DC.INTERIOR).slice(0, 2).join(', ')}. Ничего ценного.`); break;
      case 'enemies': { const n = rint(...ENEMIES); some(n); info.push(`Противников: ${n}. Все монстры агрессивны; учтите сложность и особенности выпавших.`); break; }
      case 'treasury': { const n = rint(...CHESTS); for (let i = 1; i <= n; i++) info.push(`Сундук ${i}: ${chestText()}`); break; }
      case 'trap': {
        const n = rint(...TRAPS);
        info.push(`Пройти комнату — бросок ${rint(...TRAP_ROLL)}+. ${n > 1 ? `Ловушек: ${n}` : 'Ловушка'}: ${Array.from({ length: n }, (_, i) => `${n > 1 ? `${i + 1}) ` : ''}${trapText()}`).join('; ')}.`);
        break;
      }
      case 'special':
        specialInfo(r.sub, info);
        if (chance(THEMATIC)) { some(1); info.push('Тематический противник.'); }
        break;
      case 'final': {
        if (P.boss) {
          const b = pick(P.bosses);
          if (b) foe(b, 1); else info.push('Босс — на выбор ГМ.');
          if (b && lvlOf(b) > P.max * 1.5) info.push('Ближе по уровню боссов в бестиарии нет — при необходимости замените его.');
          const n = rint(...BOSS_EXTRA);
          const ex = Array.from({ length: n }, () => pick(['тотем усиления врагов (20% мощности)', 'тотем ослабления героев (20% мощности)', 'источник лечения', `ловушка: ${trapText()}`]));
          info.push(n ? `Дополнения у босса: ${ex.join('; ')}.` : 'Без дополнений у босса.');
        }
        // «содержит 1 сундук с наградой и 1 кристальный слиток случайного типа» — сундук по тем же правилам, что в сокровищнице
        info.push(`Сундук с наградой: ${chestText(true)}`);
        info.push(`Ещё в награду: кристальный слиток «${((pick(D().crystals || []) || {}).name || 'случайный')}»; портал на поверхность.`);
        break;
      }
      case 'secret': info.push(`Открывается броском внимательности. Внутри: ${pick([treatise(), 'камень возрождения', 'право первородства'])}.`); break;
      default: break;
    }
    if ((r.type === 'enemies' || (r.type === 'final' && P.boss)) && !foes.length) info.push(unlocked() ? 'Подходящих существ в бестиарии не нашлось — расширьте уровни или место.' : 'Имена противников — после пароля ГМ (бестиарий).');
    r.info = info;
    r.foes = foes;
  }

  // ------------------------------------------------------------ генерация
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function generate(o) {
    const P = pools(o);
    const rooms = [], links = [], occ = new Map();
    const key = (x, y) => x + ',' + y;
    const add = (type, x, y, sub) => { const r = { id: rooms.length, type, sub: sub || '', x, y }; rooms.push(r); occ.set(key(x, y), r); return r; };
    const linked = (a, b) => links.some(l => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
    const link = (a, b, secret) => links.push({ a: a.id, b: b.id, len: rint(...CORRIDOR), stairs: !secret && chance(STAIRS), secret: !!secret });
    const free = r => DIRS.map(([dx, dy]) => [r.x + dx, r.y + dy]).filter(([x, y]) => !occ.has(key(x, y)));
    const inner = r => !['final', 'secret'].includes(r.type);
    const attach = (type, sub, from, secret) => {
      const cands = from ? [from] : shuffle(rooms.filter(inner));
      for (const r of cands) {
        const f = free(r);
        if (!f.length) continue;
        const [x, y] = pick(f);
        const n = add(type, x, y, sub);
        link(r, n, secret);
        return n;
      }
      return null;
    };
    // сколько комнат каждого типа — DUNGEON.ROOMS
    const roll = t => { const [lo, hi] = DC.ROOMS[t] || [0, 0]; return rint(lo, Math.max(lo, hi)); };
    const list = [];
    ['empty', 'enemies', 'treasury', 'trap'].forEach(t => { for (let i = roll(t); i > 0; i--) list.push({ type: t }); });
    // специальные: каждая — до SPECIAL_MAX раз, сверх лимита — следующая по списку
    const used = {};
    for (let i = roll('special'); i > 0; i--) {
      let k = rnd(SPECIAL.length), tries = 0;
      while ((used[SPECIAL[k]] || 0) >= DC.SPECIAL_MAX && tries < SPECIAL.length) { k = (k + 1) % SPECIAL.length; tries++; }
      if (tries >= SPECIAL.length) break;
      used[SPECIAL[k]] = (used[SPECIAL[k]] || 0) + 1;
      list.push({ type: 'special', sub: SPECIAL[k] });
    }
    const entrance = add('entrance', 0, 0);
    shuffle(list).forEach(x => attach(x.type, x.sub));
    // кольца: соседние комнаты иногда соединены вторым проходом (в таблице не задано, см. DUNGEON.LOOPS)
    rooms.slice().forEach(r => DIRS.forEach(([dx, dy]) => {
      const n = occ.get(key(r.x + dx, r.y + dy));
      if (n && n.id > r.id && !linked(r, n) && chance(DC.LOOPS)) link(r, n);
    }));
    // финал (он же комната босса) — в самой дальней от входа части
    const hops = bfs(rooms, links, entrance.id, () => 1);
    const far = rooms.filter(r => free(r).length).sort((a, b) => hops[b.id] - hops[a.id]);
    attach('final', '', far[0] || null);
    // секретные: к любым комнатам, кроме входа и финала, через тайный проход
    let secrets = roll('secret');
    shuffle(rooms.filter(r => inner(r) && r.type !== 'entrance')).forEach(r => {
      if (secrets > 0 && free(r).length) { attach('secret', '', r, true); secrets--; }
    });
    rooms.forEach(r => fill(r, P));
    const dg = { v: VERSION, at: Date.now(), opts: o, rooms, links, lightPct: 100, patrol: { rooms: 0, log: [] }, sel: null, foeCount: P.foes.length };
    depthOf(dg);
    return dg;
  }
  // кратчайшие пути: w(link) — вес ребра (0-1 BFS для лестниц)
  function bfs(rooms, links, from, w) {
    const dist = rooms.map(() => Infinity);
    dist[from] = 0;
    const dq = [from];
    while (dq.length) {
      const a = dq.shift();
      links.forEach(l => {
        const b = l.a === a ? l.b : l.b === a ? l.a : null;
        if (b === null) return;
        const d = dist[a] + w(l);
        if (d < dist[b]) { dist[b] = d; if (w(l) === 0) dq.unshift(b); else dq.push(b); }
      });
    }
    return dist;
  }
  // уровень подземелья: сколько лестниц вниз на кратчайшем пути от входа
  function depthOf(dg) {
    const d = bfs(dg.rooms, dg.links, 0, l => (l.stairs ? 1 : 0));
    dg.rooms.forEach(r => { r.depth = Number.isFinite(d[r.id]) ? d[r.id] : 0; });
  }
  // кратчайший путь от входа до финала: комнаты и клетки коридоров
  function pathToFinal(dg) {
    const fin = dg.rooms.find(r => r.type === 'final');
    if (!fin) return null;
    const prev = {}, seen = new Set([0]), q = [0];
    while (q.length) {
      const a = q.shift();
      if (a === fin.id) break;
      dg.links.forEach(l => {
        const b = l.a === a ? l.b : l.b === a ? l.a : null;
        if (b === null || seen.has(b)) return;
        seen.add(b); prev[b] = { a, l }; q.push(b);
      });
    }
    if (!prev[fin.id]) return null;
    let rooms = 0, cells = 0, cur = fin.id;
    while (cur !== 0) { const p = prev[cur]; rooms++; cells += p.l.len; cur = p.a; }
    return { rooms, cells };
  }

  // ------------------------------------------------------------ хранение
  const KEY = cid => 'hero-workshop:dungeon:' + cid;
  // подземелья старого вида (v1: отдельная комната босса) не открываются — их нужно сгенерировать заново
  const VERSION = 2;
  const load = cid => {
    const dg = App.store.get(KEY(cid), null);
    if (!dg || dg.v !== VERSION) return null;
    // в финале прежних подземелий был «сундук» без содержимого — бросаем его один раз и запоминаем
    let fixed = false;
    dg.rooms.forEach(r => {
      if (r.type !== 'final') return;
      r.info = r.info.flatMap(t => {
        const m = /^Награда: сундук; (.*)$/.exec(t);
        if (!m) return [t];
        fixed = true;
        return [`Сундук с наградой: ${chestText(true)}`, `Ещё в награду: ${m[1]}`];
      });
    });
    if (fixed) save(cid, dg);
    return dg;
  };
  const save = (cid, dg) => App.store.set(KEY(cid), dg);
  let ctx = { cid: '', rerender: () => {} };

  // ------------------------------------------------------------ отрисовка
  const codeOf = r => (r.type === 'special' ? `5.${SPECIAL.indexOf(r.sub) + 1}` : TYPES[r.type].code);
  const titleOf = r => (r.type === 'special' ? `${TYPES.special.t}: ${r.sub}` : TYPES[r.type].t);
  const roomLabel = r => `№${r.id} · ${codeOf(r)} · ${titleOf(r)}`;
  const lightPct = dg => (typeof dg.lightPct === 'number' ? dg.lightPct : TOP[dg.light] !== undefined ? TOP[dg.light] : 100);
  const lightOf = dg => { const p = lightPct(dg); return LIGHT.find(l => p >= l.min) || LIGHT[LIGHT.length - 1]; };
  const dim = (dg, n) => { dg.lightPct = Math.min(100, Math.max(0, lightPct(dg) - n)); };
  // источники света из листа «разное»: «факел — +25 очков свечения», «свеча — +5 очков свечения»; очко свечения = 1% света
  const lightSources = () => (D().items || []).map(it => {
    const m = String(it.effect || '').match(/\+\s*(\d+)\s*очк\S*\s+свечени/i);
    return m ? { n: it.name, v: +m[1] } : null;
  }).filter(Boolean);

  function mapHtml(dg) {
    const xs = dg.rooms.map(r => r.x), ys = dg.rooms.map(r => r.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const W = (Math.max(...xs) - x0) * 2 + 1, H = (Math.max(...ys) - y0) * 2 + 1;
    const grid = Array.from({ length: H }, () => Array(W).fill(null));
    dg.rooms.forEach(r => { grid[(r.y - y0) * 2][(r.x - x0) * 2] = { r }; });
    dg.links.forEach(l => {
      const a = dg.rooms[l.a], b = dg.rooms[l.b];
      grid[a.y + b.y - 2 * y0][a.x + b.x - 2 * x0] = { l, v: a.x === b.x };
    });
    const tpl = n => Array.from({ length: n }, (_, i) => (i % 2 ? 'var(--dg-cor)' : 'var(--dg-room)')).join(' ');
    const cell = c => {
      if (!c) return '<span class="dg-void"></span>';
      if (c.r) {
        const r = c.r;
        return `<button type="button" class="dg-room t-${r.type}${dg.sel === r.id ? ' is-sel' : ''}" data-act="dgSel" data-v="${r.id}" title="${esc(roomLabel(r))}${r.depth ? ` · уровень ${r.depth + 1}` : ''}" aria-label="${esc(roomLabel(r))}">${esc(codeOf(r))}</button>`;
      }
      const l = c.l;
      return `<span class="dg-cor ${c.v ? 'v' : 'h'}${l.stairs ? ' stairs' : ''}${l.secret ? ' secret' : ''}" title="коридор, длина ${l.len}${l.stairs ? ', лестница вниз' : ''}${l.secret ? ', тайный проход' : ''}">${l.len}${l.stairs ? '↓' : ''}</span>`;
    };
    return `<div class="dg-scroll"><div class="dg-map" style="grid-template-columns:${tpl(W)};grid-template-rows:${tpl(H)}">${grid.map(row => row.map(cell).join('')).join('')}</div></div>`;
  }

  function roomCard(dg, r) {
    const near = dg.links.filter(l => l.a === r.id || l.b === r.id).map(l => {
      const o = dg.rooms[l.a === r.id ? l.b : l.a];
      return `<button type="button" class="linklike small" data-act="dgSel" data-v="${o.id}">№${o.id} (${esc(codeOf(o))})</button> <span class="muted small">— коридор ${l.len}${l.stairs ? ', лестница' : ''}${l.secret ? ', тайный' : ''}</span>`;
    });
    return `<div class="dg-room-card">
      <div class="sec-head"><h3>${esc(roomLabel(r))}</h3>${r.depth ? `<span class="tag warn">уровень подземелья ${r.depth + 1}: враги +${r.depth * STAIR_BONUS}% к статам (кроме ловкости)</span>` : ''}</div>
      ${r.info.map(t => `<p class="small">${esc(t)}</p>`).join('')}
      ${r.foes.length ? `<ul class="dev-list">${r.foes.map(f => `<li><span><b>${esc(f.n)}</b>${f.q > 1 ? ` ×${f.q}` : ''}${f.boss ? ' <span class="tag bad">босс</span>' : ''}</span><span class="muted small">ур. ${fmt(f.lvl)}</span></li>`).join('')}</ul>` : ''}
      ${near.length ? `<p class="small dg-near">Выходы: ${near.join('; ')}</p>` : ''}
      <div class="row-actions">${r.type !== 'entrance' ? `<button type="button" class="btn small" data-act="dgReroll" data-v="${r.id}">Перебросить содержимое</button>` : ''}
        ${window.Battle && window.Battle.ready() ? `<button type="button" class="btn small" data-act="dgBattle" data-v="${r.id}" title="Поле боя с местностью этой комнаты${r.foes.length ? ' и её противниками' : ''}">На поле боя</button>` : ''}
        <button type="button" class="linklike small" data-act="dgSel" data-v="">закрыть</button></div>
    </div>`;
  }

  function trackerHtml(dg) {
    const L = lightOf(dg), p = dg.patrol || { rooms: 0, log: [] };
    const path = pathToFinal(dg);
    const chanceNow = Math.min(100, p.rooms * PATROL_STEP);
    return `<div class="dg-track">
      <div class="dg-track-col">
        <h3>Патрули в коридорах</h3>
        <p>Шанс встретить отряд: <b>${chanceNow}%</b> <span class="muted small">(+${PATROL_STEP}% за каждую пройденную комнату; на лестнице патрулей нет; после встречи — сброс)</span></p>
        <div class="row-actions"><button type="button" class="btn small" data-act="dgPatrol" data-v="room" title="+${PATROL_STEP}% к шансу патруля и −${ROOM_COST}% света">Комната пройдена</button>
          <button type="button" class="btn small primary" data-act="dgPatrol" data-v="roll">Коридор: бросок d100</button>
          <button type="button" class="linklike small" data-act="dgPatrol" data-v="reset">сбросить</button></div>
        ${p.log.length ? `<ul class="small dg-log">${p.log.slice(-4).reverse().map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="dg-track-col">
        <h3>Свет</h3>
        <div class="dg-light"><label>Освещение, % <input type="number" min="0" max="100" step="1" data-change="dgLight" value="${lightPct(dg)}"></label>
          <span class="tag ${L.min >= 50 ? '' : 'warn'}">${esc(cap(L.id))} (${L.range})</span></div>
        <p class="small">${esc(L.fx)}.</p>
        <div class="row-actions"><button type="button" class="btn small" data-act="dgDim" data-v="${CORR_COST}">Клетка коридора: −${CORR_COST}%</button>
          ${lightSources().map(s => `<button type="button" class="btn small" data-act="dgDim" data-v="-${s.v}" title="${esc(cap(s.n))}: +${s.v} очков свечения">${esc(cap(s.n))}: +${s.v}%</button>`).join('')}
          <button type="button" class="linklike small" data-act="dgDim" data-v="full">свет 100%</button></div>
        <p class="small">Комната: −${ROOM_COST * L.psi} пси, −${ROOM_COST} живости, −${ROOM_COST}% света; клетка коридора: −${CORR_COST * L.psi} пси, −${CORR_COST} живости, −${CORR_COST}% света.${path ? ` До финала кратчайшим путём: ${path.rooms} ${App.plural(path.rooms, 'комната', 'комнаты', 'комнат')} и ${path.cells} ${App.plural(path.cells, 'клетка', 'клетки', 'клеток')} коридора — <b>−${(path.rooms * ROOM_COST + path.cells * CORR_COST) * L.psi} пси, −${path.rooms * ROOM_COST + path.cells * CORR_COST} живости, −${path.rooms * ROOM_COST + path.cells * CORR_COST}% света</b> (пси — при нынешнем свете).` : ''}</p>
      </div></div>`;
  }

  function card(o) {
    ctx = { cid: o.cid, rerender: o.rerender || (() => {}) };
    const open = App.ui.dgOpen !== undefined ? App.ui.dgOpen : !!load(o.cid);
    const dg = load(o.cid);
    const lvl = Math.max(1, Math.round(o.level || 1));
    const opts = App.ui.dgOpts || (App.ui.dgOpts = { min: Math.max(0, Math.round(lvl * 0.5)), max: Math.round(lvl * 1.5) + 2, hab: '-1', boss: true });
    const layers = (D().world.layers || []);
    let html = `<section class="card dungeon-box" id="dungeon"><div class="sec-head"><h2>Генератор подземелий</h2>
      <button type="button" class="btn ghost small" data-act="dgToggle" aria-expanded="${open}">${open ? 'Свернуть' : 'Открыть'}</button></div>`;
    if (!open) return html + '<p class="muted small">Только для ГМ: комнаты, коридоры, ловушки, сундуки и противники из бестиария по правилам листа «механики».</p></section>';
    html += `<div class="form-grid dg-opts">
        <label>Уровень противников от <input type="number" min="0" step="1" data-change="dgOpt" data-k="min" value="${esc(opts.min)}"></label>
        <label>до <input type="number" min="0" step="1" data-change="dgOpt" data-k="max" value="${esc(opts.max)}"></label>
        <label>Где подземелье <select data-change="dgOpt" data-k="hab"><option value="">любые существа</option>${layers.map(l => `<option value="${esc(l.code)}" ${opts.hab === l.code ? 'selected' : ''}>${esc(l.code)} — ${esc(l.name)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-change="dgOpt" data-k="boss" ${opts.boss ? 'checked' : ''}> Босс в финальной комнате</label>
      </div>
      <div class="row-actions"><button type="button" class="btn primary" data-act="dgGen">${dg ? 'Сгенерировать заново' : 'Сгенерировать'}</button>
        ${dg ? `<button type="button" class="btn small" data-act="dgCopy">Скопировать текстом</button>
        <button type="button" class="btn small" data-act="gDgNotes">Добавить в заметки ГМ</button>
        <button type="button" class="linklike small danger" data-act="dgClear">удалить</button>` : ''}</div>
      ${unlocked() ? '' : '<p class="muted small">Противники берутся из бестиария — откройте закрытые разделы паролем ГМ (в справочнике), иначе в комнатах будет только их число.</p>'}`;
    if (!dg) return html + '</section>';
    const counts = {};
    dg.rooms.forEach(r => { const k = r.type === 'special' ? 'special' : r.type; counts[k] = (counts[k] || 0) + 1; });
    const sel = dg.sel !== null && dg.sel !== undefined ? dg.rooms[dg.sel] : null;
    const stairs = dg.links.filter(l => l.stairs).length;
    html += `<p class="small muted">Создано ${new Date(dg.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${dg.rooms.length} ${App.plural(dg.rooms.length, 'комната', 'комнаты', 'комнат')}, лестниц вниз: ${stairs}, уровней: ${Math.max(...dg.rooms.map(r => r.depth)) + 1}.
        ${Object.keys(TYPES).filter(k => counts[k]).map(k => `${TYPES[k].code} — ${TYPES[k].t.toLowerCase()} ×${counts[k]}`).join(', ')}.</p>
      ${mapHtml(dg)}
      <p class="small dg-legend"><span class="dg-key t-entrance">0</span> вход <span class="dg-key t-empty">1</span> пустая <span class="dg-key t-enemies">2</span> противники <span class="dg-key t-treasury">3</span> сокровищница <span class="dg-key t-trap">4</span> ловушка
        <span class="dg-key t-special">5.x</span> ${SPECIAL.map((s, i) => `5.${i + 1} ${s === 'комната с алтарём' ? 'алтарь' : s}`).join(', ')} <span class="dg-key t-final">6</span> финал (босс) <span class="dg-key t-secret">8</span> секретная;
        число между комнатами — длина коридора, ↓ — лестница вниз, пунктир — тайный проход. Нажмите на комнату, чтобы увидеть, что в ней.</p>
      ${sel ? roomCard(dg, sel) : ''}
      ${trackerHtml(dg)}
      <details class="dg-all"><summary>Все комнаты списком</summary>${dg.rooms.map(r => `<div class="dg-row"><b>${esc(roomLabel(r))}</b>${r.depth ? ` <span class="muted small">(уровень ${r.depth + 1})</span>` : ''}: ${esc(r.info.join(' '))}${r.foes.length ? ` <span class="muted">${esc(r.foes.map(f => `${f.n}${f.q > 1 ? ' ×' + f.q : ''} (ур. ${f.lvl})`).join(', '))}</span>` : ''}</div>`).join('')}</details>
    </section>`;
    return html;
  }

  // текстом — для буфера обмена и заметок ГМ
  function text(cid) {
    const dg = load(cid);
    if (!dg) return '';
    const path = pathToFinal(dg);
    const pl = (n, a, b, c) => `${n} ${App.plural(n, a, b, c)}`;
    return [`Подземелье (${new Date(dg.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}): ${pl(dg.rooms.length, 'комната', 'комнаты', 'комнат')}, лестниц вниз: ${dg.links.filter(l => l.stairs).length}${path ? `; до финала — ${pl(path.rooms, 'комната', 'комнаты', 'комнат')} и ${pl(path.cells, 'клетка', 'клетки', 'клеток')} коридора` : ''}.`]
      .concat(dg.rooms.map(r => {
        const near = dg.links.filter(l => l.a === r.id || l.b === r.id).map(l => `№${l.a === r.id ? l.b : l.a} (${l.len}${l.stairs ? '↓' : ''}${l.secret ? ', тайный' : ''})`);
        return `${roomLabel(r)}${r.depth ? ` [уровень ${r.depth + 1}, враги +${r.depth * STAIR_BONUS}%]` : ''}: ${r.info.join(' ')}${r.foes.length ? ' Противники: ' + r.foes.map(f => `${f.n}${f.q > 1 ? ' ×' + f.q : ''} (ур. ${f.lvl})`).join(', ') + '.' : ''} Выходы: ${near.join(', ')}.`;
      })).join('\n');
  }

  // ------------------------------------------------------------ действия
  const update = fn => { const dg = load(ctx.cid); if (!dg) return; fn(dg); save(ctx.cid, dg); ctx.rerender(); };
  Object.assign(App.actions, {
    dgToggle() { App.ui.dgOpen = !(App.ui.dgOpen !== undefined ? App.ui.dgOpen : !!load(ctx.cid)); ctx.rerender(); },
    dgOpt(t) {
      const o = App.ui.dgOpts || (App.ui.dgOpts = {});
      const k = t.dataset.k;
      o[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, Math.round(parseFloat(t.value) || 0)) : t.value;
    },
    dgGen() {
      const o = Object.assign({ min: 0, max: 10, hab: '', boss: true }, App.ui.dgOpts || {});
      if (o.max < o.min) [o.min, o.max] = [o.max, o.min];
      if (load(ctx.cid) && !confirm('Заменить текущее подземелье новым?')) return;
      const dg = generate(o);
      save(ctx.cid, dg);
      App.ui.dgOpen = true;
      ctx.rerender();
      App.toast(`Подземелье готово: ${dg.rooms.length} ${App.plural(dg.rooms.length, 'комната', 'комнаты', 'комнат')}`);
    },
    dgSel(b) { update(dg => { dg.sel = b.dataset.v === '' ? null : +b.dataset.v; }); },
    dgReroll(b) {
      update(dg => {
        const r = dg.rooms[+b.dataset.v];
        if (r) fill(r, pools(dg.opts));
      });
    },
    // свет вручную (ГМ) и расход: комната — в «Комната пройдена», клетка коридора — кнопкой
    dgBattle(b) {
      const dg = load(ctx.cid), r = dg && dg.rooms[+b.dataset.v];
      if (r && window.Battle) window.Battle.fromRoom(r);
    },
    dgLight(t) { update(dg => { dg.lightPct = Math.min(100, Math.max(0, Math.round(parseFloat(t.value) || 0))); }); },
    // + — расход (комната, клетка коридора), − в data-v — источник света (факел, свеча), full — свет 100%
    dgDim(b) { update(dg => { if (b.dataset.v === 'full') dg.lightPct = 100; else dim(dg, +b.dataset.v); }); },
    dgPatrol(b) {
      update(dg => {
        const p = dg.patrol || (dg.patrol = { rooms: 0, log: [] });
        const v = b.dataset.v;
        if (v === 'room') { p.rooms++; dim(dg, ROOM_COST); return; }
        if (v === 'reset') { p.rooms = 0; p.log = []; return; }
        const ch = Math.min(100, p.rooms * PATROL_STEP);
        const roll = rint(1, 100);
        if (roll <= ch) {
          const P = pools(dg.opts), n = rint(...PATROL);
          const names = P.foes.length ? Array.from({ length: n }, () => pick(P.foes).n) : [];
          const grouped = [...new Set(names)].map(x => `${x}${names.filter(y => y === x).length > 1 ? ' ×' + names.filter(y => y === x).length : ''}`);
          p.log.push(`d100 = ${roll} ≤ ${ch}%: патруль! ${n} ${App.plural(n, 'противник', 'противника', 'противников')}${grouped.length ? ': ' + grouped.join(', ') : ''}. Счётчик сброшен.`);
          p.rooms = 0;
        } else p.log.push(`d100 = ${roll} > ${ch}%: в коридоре тихо.`);
      });
    },
    dgCopy() {
      const t = text(ctx.cid);
      if (!t) return;
      const done = () => App.toast('Подземелье скопировано');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => prompt('Скопируйте:', t));
      else prompt('Скопируйте:', t);
    },
    dgClear() {
      if (!confirm('Удалить подземелье из этого браузера?')) return;
      try { localStorage.removeItem(KEY(ctx.cid)); } catch (e) { /* noop */ }
      ctx.rerender();
    }
  });

  window.Dungeon = { card, text, generate, habMatch };
})();
