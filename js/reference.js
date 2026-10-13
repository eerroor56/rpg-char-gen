/* Справочник: всё содержимое таблиц, не относящееся напрямую к созданию персонажа */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, D = window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, norm = R.norm;
  const PAGE = 150;

  const sizeName = c => { const s = R.SIZES.find(x => x.id === c); return s ? s.name.toLowerCase() : c; };
  const marks = m => (m || []).map(x => `<span class="mark" title="${esc(markTitle(x))}">${x}</span>`).join('');
  const markTitle = m => ({ '♥': 'эволюция / с рождения', '♠': 'не игровая / проклятие', '♦': 'крайне опасен', '♣': 'болезнь', '◘': 'паразит' }[m] || '');
  const tag = (t, cls = '') => t ? `<span class="tag ${cls}">${esc(t)}</span>` : '';
  const groupName = row => { const g = R.index.society.get(+row); return g ? g.name : row; };
  const refs = cell => { const s = String(cell || '').trim(); if (!s || s === 'н') return 'нет'; return s.replace(/\d+/g, n => groupName(n)).replace(/\/н\b/, ' / нет'); };
  const symName = n => { const s = R.index.symbolByRow.get(String(n)); return s ? s.name : (n === 'н' ? '—' : (n || '')); };

  function row(cells, extraText = '') {
    return { cells, text: norm(cells.join(' ').replace(/<[^>]+>/g, ' ') + ' ' + extraText) };
  }
  function generic(t, title, note) {
    return { title, note, cols: t.columns && t.columns.some(Boolean) ? t.columns : null, rows: t.rows.map(r => row(r.c.map(esc))) };
  }

  // ------------------------------------------------------------ разделы

  const SECTIONS = [
    { id: 'races', title: 'Расы', build() {
      const f = App.ui.refRaceF || '';
      const races = D.races.filter(r => !f || (f === 'play' && r.playable) || (f === 'evo' && r.evolutionOnly) || (f === 'npc' && r.npcOnly));
      const gm = gmOpen();   // фракция и религия расы — только для ГМ (игрокам они выдаются в игре)
      return [{ title: 'Все расы', note: `Значки: ♥ — ${esc(D.raceLegend.marks['♥'])}, ♠ — ${esc(D.raceLegend.marks['♠'])}. Цвет бонуса в таблице: ${esc(D.raceLegend.freq.join(', '))}.`,
        tools: `<select data-ui="refRaceF" data-ui-target="ref" aria-label="Фильтр рас"><option value="">все расы (${D.races.length})</option><option value="play" ${f === 'play' ? 'selected' : ''}>игровые</option><option value="evo" ${f === 'evo' ? 'selected' : ''}>только эволюцией ♥</option><option value="npc" ${f === 'npc' ? 'selected' : ''}>не игровые ♠</option></select>`,
        cols: ['Раса', 'Т', 'Д', 'С', 'И', 'Л', 'Ур.', 'Характер', 'Обитание'].concat(gm ? ['Фракция', 'Религия'] : [], ['Размер', 'Бонус', 'Штраф', 'Эволюция']),
        rows: races.map(r => row([`<b>${esc(cap(r.name))}</b> ${marks(r.marks)}`, r.t, r.d, r.s, r.i, r.l, r.id === 'полукровка' ? 'среднее' : fmt(r.lvl), esc(r.align), esc(R.habitatNames(r.habitat).join('; '))]
          .concat(gm ? [esc(refs(r.faction)), esc(refs(r.religion))] : [], [esc(sizeName(r.size)), esc(r.bonus) + (r.bonusFreq ? ' ' + tag(r.bonusFreq, 'freq') : ''), esc(r.penalty), esc(r.evo)]))) }];
    } },
    { id: 'society', title: 'Социум', locked: true, build() {
      const S = D.society;
      const tf = App.ui.refSocT || '';
      const types = [...new Set(S.groups.map(g => g.type))];
      return [
        { title: 'Фракции, гильдии, религии', note: `Цвет названия — сложность вступления: ${esc(S.joinLegend.join(', '))}. ${esc(S.joinNote)} Числа в колонках характеристик: «10+» — прибавка, «10−» — убавка, «*2», «3Х» — умножение, «2/» — деление.`,
          tools: `<select data-ui="refSocT" data-ui-target="ref" aria-label="Тип общины"><option value="">все типы</option>${types.map(t => `<option ${t === tf ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`,
          cols: ['№', 'Название', 'Т', 'Д', 'С', 'И', 'Л', 'Статус', 'Бонус и дары', 'Тип', 'Вступление'],
          rows: S.groups.filter(g => !tf || g.type === tf).map(g => row([g.row, `<b>${esc(g.name)}</b>${g.demon ? ' ' + tag('столп') : ''}`, ...g.st.map(esc), esc(g.status), esc(g.bonus), esc(g.type), tag(g.join, 'join')])) },
        { title: 'НПС', cols: ['Имя', 'Т', 'Д', 'С', 'И', 'Л', 'Ур.', 'Квест', 'Награда'], rows: S.npcs.map(n => row(n.map((x, i) => i === 6 ? fmt(parseFloat(x)) : esc(x)))) },
        { title: 'Квесты', cols: ['Название', 'Завязка', 'Развязка', 'Награда'], rows: S.quests.map(q => row(q.map(esc))) },
        { title: 'Глобальные квесты', cols: ['Название', 'Завязка', 'Развязка', 'Награда'], rows: S.globalQuests.map(q => row(q.map(esc))) }
      ];
    } },
    { id: 'bestiary', title: 'Бестиарий', locked: true, build() {
      const sec = App.ui.refBeastSec || '';
      const secs = [...new Set(D.creatures.map(c => c.sec))];
      const list = D.creatures.filter(c => !sec || c.sec === sec);
      return [
        { title: 'Существа', note: esc(D.creatureLegend.join(' / ')) + '. Особенности — из примечаний к ячейкам листа «Существа». Символ — по номеру строки листа «скилы».',
          tools: `<select data-ui="refBeastSec" data-ui-target="ref" aria-label="Раздел бестиария"><option value="">все разделы (${D.creatures.length})</option>${secs.map(s => `<option value="${esc(s)}" ${s === sec ? 'selected' : ''}>${esc(s)} (${D.creatures.filter(c => c.sec === s).length})</option>`).join('')}</select>`,
          cols: ['Существо', 'Т', 'Д', 'С', 'И', 'Л', 'Ур.', 'Характер', 'Обитание', 'Символ', 'Размер', 'Дроп', 'Особенности'],
          rows: list.map(c => row([`<b>${esc(c.n)}</b> ${marks(c.m)} ${tag(c.cat)}${c.note ? `<br><span class="muted small">${esc(c.note)}</span>` : ''}`, c.t, c.d, c.s, c.i, c.l, fmt(c.lvl), esc(c.ch), esc(R.habitatNames(c.hab).join('; ') || c.hab), esc(symName(c.sym)), esc(sizeName(c.sz)), esc(c.drop), c.ab.length ? `<ul class="abil">${c.ab.map(([k, t]) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''], c.sec)) },
        { title: 'Улучшения монстров', cols: ['Улучшение', 'Т', 'Д', 'С', 'И', 'Л', 'Эффект'], rows: D.creatureUpgrades.map(u => row(u.map(esc))) }
      ];
    } },
    { id: 'magic', title: 'Магия', build() {
      const S = D.skills;
      return [
        { title: 'Магические символы', note: 'Категория — по цвету в листе «скилы»: запретные знания, порицаемая, обычная. «и» — интеллект, «р» — расходник, «кд» — перезарядка. «Предыдущий опыт» даёт 1 символ из разрешённых (обычных), «Тайное знание» — любой.',
          cols: ['Символ', 'Требование', 'Эффект 1', 'Эффект 2', 'Связка', 'Гримуар', 'Цена', 'Категория'],
          rows: S.symbols.map(s => row([`<b>${esc(s.name)}</b>`, esc(s.req), esc(s.e1), esc(s.e2), esc(s.link), esc(s.grim), esc(s.price), tag(s.cat, s.cat === 'запретные знания' ? 'bad' : s.cat === 'порицаемая' ? 'warn' : '')])) },
        generic(S.utility, 'Утилитарные заклинания'),
        generic(S.rituals, 'Ритуалы'),
        generic(S.prayers, 'Молитвы'),
        generic(S.specialMagic, 'Особое'),
        generic(S.chords, 'Песенные аккорды')
      ];
    } },
    { id: 'skills', title: 'Навыки', locked: true, build() {
      const S = D.skills;
      return [
        { title: 'Стойки', note: '«Можно выбрать стойку, в которой вы будете сражаться на постоянку и не тратить на это ОД. Переход из стойки в стойку тратит 1 ОД.»', cols: ['Стойка', 'Эффект', 'Требование', 'Цена'], rows: S.stances.map(s => row([`<b>${esc(s.name)}</b>`, esc(s.effect), esc(s.req), esc(s.price)])) },
        { title: 'Активные (физические) навыки', cols: ['Навык', 'Эффект', 'Требования', 'КД', 'Тип', 'Цена'], rows: S.actives.map(s => row([`<b>${esc(s.name)}</b>${s.special ? ' ' + tag('особый', 'warn') : ''}`, esc(s.effect), esc(s.req), esc(s.cd), esc(s.type), esc(s.price)])) },
        { title: 'Пассивные навыки', note: 'Первые 11 — таланты, в них распределяются очки талантов при создании (1 очко за 5 уровней).', cols: ['Навык', 'Эффект', 'Требования', 'Шанс срабатывания', 'Кач.', 'Цена'], rows: S.passives.map(s => row([`<b>${esc(s.name)}</b>${s.base ? ' ' + tag('талант') : ''}`, esc(s.effect), esc(s.req), esc(s.chance), esc(s.q), esc(s.price)])) }
      ];
    } },
    { id: 'gifts', title: 'Дары и проклятия', build() {
      const S = D.skills;
      return [
        { title: 'Тёмные дары', cols: ['Дар', 'Бонус', 'Дебафф'], rows: S.gifts.map(g => row([`<b>${esc(g.name)}</b>`, esc(g.bonus), esc(g.debuff)])) },
        { title: 'Благословения', cols: ['Название', 'Эффект', 'Длительность', 'Получение'], rows: S.buffs.map(b => row([`<b>${esc(b.name)}</b>${b.birth ? ' <span class="mark">♥</span>' : ''}`, esc(b.effect), esc(b.dur), esc(b.how)])) },
        { title: 'Болезни', note: esc(S.diseaseNote) + '. ♥ — врождённые, доступны при создании.', cols: ['Болезнь', 'Эффект 1', 'Эффект 2', 'Вид'], rows: S.diseases.map(d => row([`<b>${esc(d.name)}</b>${d.birth ? ' <span class="mark">♥</span>' : ''}`, esc(d.e1), esc(d.e2), tag(d.cat)])) },
        { title: 'Правила проклятий', cols: null, rows: S.legends.curseRules.slice(1).map(x => row([esc(x)])) },
        { title: 'Особые проклятия', cols: ['Проклятие', 'Эффект'], rows: S.cursesSpecial.map(c => row([`<b>${esc(c.name)}</b>${c.itemCurse ? ' ' + tag('проклятие предмета, нельзя со старта', 'warn') : ''}`, esc(c.effect)])) },
        { title: 'Проклятия', cols: ['Проклятие', 'Эффект'], rows: S.curses.map(c => row([`<b>${esc(c.name)}</b>`, esc(c.effect)])) },
        { title: 'Модификации, модули и ободрения', cols: ['Название', 'Эффект', 'Длительность', 'Источник'], rows: S.mods.map(m => row([`<b>${esc(m[0])}</b>`, esc(m[1]), esc(m[2]), esc(m[3])])) }
      ];
    } },
    { id: 'traits', title: 'Черты', build() {
      const S = D.skills;
      return [
        { title: 'Положительные', cols: ['Черта', 'Эффект'], rows: S.traitsPos.map(t => row([`<b>${esc(t.name)}</b>`, esc(t.effect)])) },
        { title: 'Отрицательные', cols: ['Черта', 'Эффект'], rows: S.traitsNeg.map(t => row([`<b>${esc(t.name)}</b>`, esc(t.effect)])) },
        { title: 'Приобретаемые в игре', cols: ['Черта', 'Эффект', 'Как получить'], rows: S.traitsAcq.map(t => row([`<b>${esc(t.name)}</b>`, esc(t.effect), esc(t.how)])) }
      ];
    } },
    { id: 'alchemy', title: 'Алхимия и кухня', locked: true, build() {
      const A = D.alchemy;
      const g = App.ui.refAlchG || '';
      const groups = [...new Set(A.ingredients.map(i => i.g))];
      return [
        { title: 'Ингредиенты', note: `Зелёным — бафф, красным — дебафф (лист «алхимия»). Пометки названия: ${esc(A.nameLegend.join(', '))}. Доп. свойства по применению: ${esc(A.useLegend.join(', '))}.`,
          tools: `<select data-ui="refAlchG" data-ui-target="ref" aria-label="Группа ингредиентов"><option value="">все группы</option>${groups.map(x => `<option value="${esc(x)}" ${x === g ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`,
          cols: ['Ингредиент', 'Эффекты', 'Цена', 'Ур. навыка', 'Дополнительно', 'Группа'],
          rows: A.ingredients.filter(i => !g || i.g === g).map(i => row([`<b>${esc(i.n)}</b> ${tag(i.tag, i.tag === 'запрещённое' ? 'bad' : 'warn')}`, i.e.map(([t, s]) => `<span class="eff ${s === '+' ? 'plus' : s === '-' ? 'minus' : ''}">${esc(t)}</span>`).join(' '), esc(i.price), esc(i.lvl), i.x.map(([t, u]) => `${esc(t)} ${tag(u)}`).join('<br>'), esc(i.g)])) },
        { title: 'Еда', cols: ['Блюдо', 'Эффекты', 'Приготовление', 'Цена'], rows: A.food.map(f => row([`<b>${esc(f.name)}</b>`, esc(f.e.join(', ')), esc(f.cook), esc(f.price)])) },
        { title: 'Алкоголь', cols: ['Напиток', 'Эффекты', 'Приготовление', 'Цена'], rows: A.alcohol.map(f => row([`<b>${esc(f.name)}</b>`, esc(f.e.join(', ')), esc(f.cook), esc(f.price)])) },
        { title: 'Эссенции', note: esc(A.essenceNote), cols: ['Эссенция', 'Эффект', 'Цена'], rows: A.essences.map(e => row([`<b>${esc(e.name)}</b>`, esc(e.effect), esc(e.price)])) }
      ];
    } },
    { id: 'materials', title: 'Материалы', build() {
      const start = new Set(window.GM_CONFIG.START_MATERIALS.map(norm));
      const eff = e => e && e.t ? `${esc(e.t)}${e.sc ? ' ' + tag(e.sc, 'sc') : ''}` : '';
      return [
        { title: 'Материалы', note: `Цвет эффекта в листе «материаллы»: ${esc(D.materialLegend.scale.join(', '))}. Отмеченные «старт» можно взять при создании персонажа.`,
          cols: ['Материал', 'Урон / ед.', 'Броня / ед.', 'В оружии', 'В броне', 'В украшении', 'Сплавы и добыча', 'Цена', 'Ур. навыка'],
          rows: D.materials.map(m => row([`<b>${esc(m.name)}</b> ${marks(m.marks)}${start.has(norm(m.name)) ? ' ' + tag('старт', 'good') : ''}`, fmt(m.dmg), fmt(m.arm), eff(m.ew), eff(m.ea), eff(m.ej), esc(R.habitatNames(m.src).length && /^[-*\/D0-9, .]+$/.test(m.src) ? R.habitatNames(m.src).join('; ') : m.src), esc(m.price), esc(m.skill)])) },
        { title: 'Кристаллы', cols: ['Кристалл', 'Урон / слиток', 'Броня / слиток', 'В оружии', 'В броне', 'Инкрустация / украшение', 'Добыча', 'Цена за камень', 'Ур. навыка'],
          rows: D.crystals.map(m => row([`<b>${esc(m.name)}</b> ${marks(m.marks)}`, fmt(m.dmg), fmt(m.arm), eff(m.ew), eff(m.ea), eff(m.ej), esc(R.habitatNames(m.src).length && /^[-*\/D0-9, .]+$/.test(m.src) ? R.habitatNames(m.src).join('; ') : m.src), esc(m.price), esc(m.skill)])) }
      ];
    } },
    { id: 'gear', title: 'Оружие и броня', build() {
      const G = D.gear, T = G.tables;
      return [
        { title: 'Оружие', note: '«Влияет на урон» и «не влияет на урон» — единицы материала. Урон = урон материала за единицу × единицы, влияющие на урон. Требование: характеристики / уровень навыка ремесла.',
          cols: ['Оружие', 'Группа', 'Влияет на урон', 'Не влияет', 'Требование / ур. навыка', 'Эффекты', 'Тип урона', 'Дальность', 'Слоты', 'Руки'],
          rows: G.weapons.map(w => row([`<b>${esc(w.name)}</b>`, esc(w.group), esc(w.uRaw), fmt(w.un), esc(w.reqRaw), esc(w.fx), esc(w.dt), esc(w.range), fmt(w.slots), fmt(w.hands)])) },
        { title: 'Щиты', cols: ['Щит', 'Единиц материала', 'Требование', 'Слоты', 'Штраф ловкости', 'Эффект'], rows: G.shields.map(s => row([`<b>${esc(s.name)}</b>`, esc(s.uRaw), esc(s.reqRaw), fmt(s.slots), fmt(s.pen), esc(s.fx)])) },
        { title: 'Броня', cols: ['Элемент', 'Класс', 'Единиц материала', 'Требование', 'Слоты', 'Штраф ловкости'], rows: G.armor.map(a => row([`<b>${esc(a.name)}</b>`, esc(a.cls), fmt(a.u), esc(a.reqRaw), fmt(a.slots), fmt(a.pen)])) },
        generic(T.jewelry, 'Украшения', esc(T.jewelryNote)),
        generic(T.prosthetics, 'Протезирование'),
        generic(T.modern, 'Модернизация', esc(T.modernNote)),
        generic(T.modules, 'Дополнительные модули'),
        generic(T.instruments, 'Музыкальные инструменты'),
        generic(T.gunParts, 'Огнестрел: детали', esc(T.gunNotes.join(' / ')))
      ];
    } },
    { id: 'items', title: 'Предметы', build() {
      const groups = [...new Set(D.items.map(i => i.g))];
      return groups.map(g => ({ title: cap(g), cols: ['Предмет', 'Описание', 'Крафт', 'Крафтильня', 'Цена'], rows: D.items.filter(i => i.g === g).map(i => row([`<b>${esc(i.name)}</b>`, esc(i.effect), esc(i.craft), esc(i.station), esc(i.price)])) }));
    } },
    { id: 'artifacts', title: 'Артефакты', locked: true, build() {
      const ag = [...new Set(D.artifacts.map(a => a.g))];
      return ag.map(g => ({ title: cap(g), cols: ['Артефакт', 'Эффект', 'Получение', 'Источник', 'Тип'], rows: D.artifacts.filter(a => a.g === g).map(a => row([`<b>${esc(a.name)}</b>`, esc(a.effect), esc(a.how), esc(a.from), esc(a.type)])) }));
    } },
    { id: 'mechanics', title: 'Механики', locked: true, build() {
      const M = D.mechanics;
      return M.main.map(s => ({ title: cap(s.title || 'Общее'), cols: s.head.length ? [''].concat(s.head) : null, rows: s.rows.map(r => row(r.map((x, i) => i === 0 ? `<b>${esc(x)}</b>` : esc(x)))) }))
        .concat([generic(M.craft, 'Крафтильни'), generic(M.dungeon, 'Подземелья')]);
    } },
    { id: 'world', title: 'Мир', build() {
      const W = D.world;
      const blocks = [
        { title: 'Уровни мира', note: 'На эти коды ссылается колонка «уровень обитания» рас и существ.', cols: ['Код', 'Название', 'Эффект / условие'], rows: W.layers.map(l => row([`<b>${esc(l.code)}</b>`, esc(l.name), esc(l.effect)])) },
        { title: 'Улучшенная география', cols: ['Место', 'Эффект на монстров', 'Эффект на игрока'], rows: W.places.map(p => row([p.isRegion ? `<b>${esc(p.name)}</b>` : esc(p.name), esc(p.monsters), esc(p.players)], p.region)) }
      ];
      W.sections.forEach(s => blocks.push({ title: cap(s.title), cols: [cap(s.title)].concat(s.head), rows: s.rows.map(r => row(r.map((x, i) => i === 0 ? `<b>${esc(x)}</b>` : esc(x)))) }));
      if (D.schemes.length) blocks.push({ title: 'Схемы', note: 'Сетка с листа «схемы» как есть.', cols: null, grid: D.schemes, rows: [] });
      return blocks;
    } }
  ];

  // ------------------------------------------------------------ отрисовка

  const LOCK_ICON = '<svg class="lock-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1 1 0 0 1 13 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5zm1.5 0h4V5a2 2 0 0 0-4 0v2z"/></svg>';
  const gmOpen = () => !!(window.GMLock && window.GMLock.unlocked);
  const isClosed = s => s.locked && !gmOpen();

  function render(el) {
    const cur = SECTIONS.find(s => s.id === App.ui.refSection) || SECTIONS[0];
    App.ui.refSection = cur.id;
    const closed = isClosed(cur);
    const hasLocked = !!(D.meta && D.meta.locked);
    el.innerHTML = `<div class="ref">
      <nav class="ref-nav" aria-label="Разделы справочника">${SECTIONS.map(s => `<a href="#ref/${s.id}" class="${s.id === cur.id ? 'is-on' : ''}${s.locked ? ' gm' : ''}" aria-current="${s.id === cur.id ? 'page' : 'false'}">${esc(s.title)}${isClosed(s) ? ' ' + LOCK_ICON + '<span class="sr-only"> (закрыто паролем)</span>' : ''}</a>`).join('')}
        ${hasLocked && gmOpen() ? '<p class="gm-mode">Режим ГМ включён <button type="button" class="linklike" data-act="gmLock">Выйти</button></p>' : ''}</nav>
      <div class="ref-body">
        <div class="ref-head"><h1>${esc(cur.title)}</h1>
          ${closed ? '' : `<input type="search" data-ui="refQ" data-ui-target="ref" value="${esc(App.ui.refQ || '')}" placeholder="Поиск в разделе" aria-label="Поиск в разделе">`}</div>
        <div id="refContent"></div>
      </div></div>`;
    // на телефоне меню разделов — горизонтальная лента: показываем текущий раздел
    const on = el.querySelector('.ref-nav a.is-on');
    if (on && window.innerWidth <= 1060) { const nav = on.parentElement; nav.scrollLeft += on.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - on.offsetWidth) / 2; }
    refresh();
  }

  function refresh() {
    const box = document.getElementById('refContent');
    if (!box) return;
    const cur = SECTIONS.find(s => s.id === App.ui.refSection) || SECTIONS[0];
    if (isClosed(cur)) {
      box.innerHTML = window.GMLock.form(`${cur.title}: раздел для ГМ`,
        'Бестиарий, навыки, социум, алхимия, артефакты и механики закрыты паролем ГМ. Данные зашифрованы — без пароля их не прочитать даже из файлов сайта.');
      return;
    }
    const q = norm(App.ui.refQ || '');
    const blocks = cur.build();
    App.ui.refLimit = App.ui.refLimit || {};
    let total = 0;
    const html = blocks.map((b, bi) => {
      const key = cur.id + ':' + bi;
      if (b.grid) {
        return `<section class="ref-block"><h2>${esc(b.title)}</h2>${b.note ? `<p class="muted small">${b.note}</p>` : ''}<div class="tbl-wrap"><table class="tbl grid">${b.grid.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div></section>`;
      }
      const rows = q ? b.rows.filter(r => r.text.includes(q)) : b.rows;
      total += rows.length;
      if (q && !rows.length) return '';
      const lim = App.ui.refLimit[key] || PAGE;
      const shown = rows.slice(0, lim);
      return `<section class="ref-block"><div class="rb-head"><h2>${esc(b.title)} <small>${rows.length}</small></h2>${b.tools || ''}</div>
        ${b.note ? `<p class="muted small">${b.note}</p>` : ''}
        <div class="tbl-wrap"><table class="tbl">${b.cols ? `<thead><tr>${b.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}
        <tbody>${shown.map(r => `<tr>${r.cells.map(c => { const v = c === undefined || c === null ? '' : String(c); const len = v.replace(/<[^>]+>/g, '').length; return `<td${len > 70 ? ' class="long"' : len > 25 ? ' class="mid"' : ''}>${v}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        ${rows.length > lim ? `<button type="button" class="btn ghost more" data-act="refMore" data-key="${key}">Показать ещё (${rows.length - lim})</button>` : ''}
      </section>`;
    }).join('');
    box.innerHTML = html || `<div class="card empty">По запросу «${esc(App.ui.refQ)}» в разделе ничего нет.</div>`;
  }

  Object.assign(App.actions, {
    refMore(b) { App.ui.refLimit[b.dataset.key] = (App.ui.refLimit[b.dataset.key] || PAGE) + PAGE * 2; refresh(); },
    gmLock() { window.GMLock.lock(); }
  });

  window.Reference = { render, refresh, SECTIONS };
})();
