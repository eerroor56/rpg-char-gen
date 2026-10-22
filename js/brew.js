/*
 * Кухня, винокурня и алхимический стол: калькуляторы блюд, напитков и зелий.
 * Правила — лист «механики» («готовка», «Алкоголе варение», «Алхимия», крафтильни: ступка и пестик,
 * реторта, перегонный куб, кальцатор, концентратор); ингредиенты — лист «алхимия» (открываются паролем ГМ).
 * Форма встраивается в справочник («Алхимия и кухня») и в выдачу предметов ГМ (персонаж → «Снаряжение»).
 * Неоднозначные места — BREW в js/config.js.
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, C = window.GM_CONFIG;
  const D = () => window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, norm = R.norm, ri = R.ri;
  const BC = C.BREW;
  const num = v => { const x = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };

  const MAX_ING = 10;          // «максимальное количество ингредиентов 10» (готовка и алкоголь)
  const SPOIL = 30;            // «продукт всё ещё можно испортить, если кинуть ниже 30, тогда все эффекты будут негативными»
  const CANNED = 0.5;          // «консервируются … показатели ухудшаются на 50%»
  const CONC = 2;              // концентратор «удваивает эффект зелья»
  // крафтильни: «выделяет 1-й … 4-й эффект ингредиента»
  const STATIONS = ['ступка и пестик', 'реторта', 'перегонный куб', 'кальцатор'];
  const COOK = [
    { id: 'варка', eff: 1, base: 'жидкая основа, похожая на воду', plus: '+ полезные свойства жидкости' },
    { id: 'жарка', eff: 2 },
    { id: 'тушение', eff: 3 },
    { id: 'запекание', eff: 4, base: 'основа, похожая на масло', plus: '+ полезные свойства масла' }
  ];
  const ALCO = [
    { id: 'ферментация', eff: 1, drunk: 1 }, { id: 'дистилляция', eff: 2, drunk: 2 },
    { id: 'мацерация', eff: 3, drunk: 3 }, { id: 'перколяция', eff: 4, drunk: 4 }
  ];
  const ALCO_PER = 2;          // «каждый ингредиент добавляет +2 опьянения»
  // «виды зелий»: слоты и уровень алхимии (если лист «механики» открыт — берётся оттуда)
  const POTIONS = [['отвар', 2, 0], ['настой', 5, 5], ['снадобье', 10, 20], ['зелье', 15, 30], ['микстура', 20, 40],
    ['концентрат', 25, 50], ['рамуан', 30, 60], ['улах', 40, 80], ['краут', 50, 100]].map(([id, slots, lvl]) => ({ id, slots, lvl }));
  // вырезки и выжимки: живость — 10% тела существа, эффект его элемента — 10% духа; блюдо из босса — 25% стата навсегда
  const CUT = { ziv: 0.1, elem: 0.1, boss: 0.25 };
  const TEMPER = [[/агресс/, 'урон +20%'], [/нейтр/, 'ОД +2'], [/мир/, 'пси +20%']];
  const MARKS = { '♦': 'сила +25', '♣': 'тело +25', '♥': 'дух +25', '♠': 'интеллект +25', '◘': 'ловкость +5' };
  const BOSS_STATS = ['t', 'd', 's', 'i'];   // «постоянный бонус к одной из 4 характеристик»
  const HERBS = [1, 5];        // сбор трав (уточнение ГМ): 1–5 случайных ингредиентов из таблицы растений
  const MODES = [['cook', 'Кухня'], ['alco', 'Винокурня'], ['potion', 'Алхимический стол']];

  // ------------------------------------------------------------ данные
  const unlocked = () => !!(window.GMLock && window.GMLock.unlocked);
  const ings = () => (D().alchemy || {}).ingredients || [];
  let ix = null, ixSrc = null;
  function ing(name) {
    const list = ings();
    if (ixSrc !== list) { ix = new Map(); list.forEach(i => { if (!ix.has(norm(i.n))) ix.set(norm(i.n), i); }); ixSrc = list; }
    return name ? ix.get(norm(name)) || null : null;
  }
  const baseText = i => ((i && i.x) || []).filter(x => x[1] === 'основа' && norm(x[0]) !== 'основа').map(x => x[0]).join('; ');
  const bases = () => ings().filter(i => (i.x || []).some(x => x[1] === 'основа'));
  // растения — группа «растения / легко в сборе» листа «алхимия» (без строки «семена»: это не трава, а правило)
  const plants = () => ings().filter(i => /растени/.test(norm(i.g)) && norm(i.n) !== 'семена');
  function gather() {
    const list = plants(), n = HERBS[0] + Math.floor(Math.random() * (HERBS[1] - HERBS[0] + 1)), out = [];
    for (let k = 0; k < n && list.length; k++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const x = out.find(y => y.n === p.n);
      if (x) x.qty++; else out.push({ n: p.n, qty: 1 });
    }
    return out;
  }
  const creatures = () => (unlocked() && D().creatures) || [];
  const symName = code => { const s = R.index.symbolByRow && R.index.symbolByRow.get(String(code)); return s ? s.name.replace(/\s*\(\d+\)$/, '') : ''; };
  function potionTypes() {
    const sec = unlocked() && D().mechanics ? (D().mechanics.main || []).find(s => /алхими/i.test(s.title || '')) : null;
    const rows = sec ? sec.rows.map(r => ({ id: norm(r[0]).replace(/^концитрат$/, 'концентрат'), slots: parseInt((String(r[1]).match(/(\d+)\s*слот/) || [])[1], 10), lvl: parseInt(String(r[2]), 10) }))
      .filter(x => x.id && x.slots) : [];
    return rows.length ? rows.map(x => Object.assign(x, { lvl: Number.isFinite(x.lvl) ? x.lvl : 0 })) : POTIONS;
  }

  // ------------------------------------------------------------ эффекты
  // «живость +5», «яд -20е», «ОД-1», «+1ОД», «стан 1х», «Огонь 100е»; остальное — текстом («невидимость»)
  const STATLIKE = /^(живост|хп|мана|мп|пси|сил|тел|дух|инт|ловк|од$|дроп|привлек|зор|урон|точн|опьян)/;
  function parseEff(text, mark) {
    const t = String(text || '').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
    let name = t, v = null, unit = '', sg = false, m;
    if ((m = t.match(/^([^\d+\-]*?)\s*([+-])?\s*(\d+(?:[.,]\d+)?)\s*(е|e|х|x|п|%)?\.?$/i)) && m[1].trim()) {
      name = m[1].trim(); v = (m[2] === '-' ? -1 : 1) * num(m[3]); sg = !!m[2];
      unit = (m[4] || '').toLowerCase().replace('e', 'е').replace('x', 'х');
    } else if ((m = t.match(/^([+-])\s*(\d+(?:[.,]\d+)?)\s*([а-яё][а-яё .]*)$/i))) {
      name = m[3].trim(); v = (m[1] === '-' ? -1 : 1) * num(m[2]); sg = true;
    }
    const n = norm(name);
    return { name: n, text: t, v, unit, sg, mark: mark || '', stat: STATLIKE.test(n) };
  }
  // одинаковые эффекты складываются; у статов (живость, хп, сила…) бафф и дебафф взаимно гасятся,
  // у стихий («огонь -10е») пометка меняет смысл (резист или урон), поэтому они считаются отдельно
  function combine(list) {
    const map = new Map();
    list.forEach(({ e, qty, src }) => {
      const key = e.v === null ? `t|${e.name}|${e.mark}` : e.stat ? `s|${e.name}|${e.unit}` : `n|${e.name}|${e.unit}|${e.mark}`;
      let x = map.get(key);
      if (!x) { x = { name: e.name, label: e.v === null ? e.text : e.name, v: e.v === null ? null : 0, unit: e.unit, sg: e.sg, mark: e.mark, stat: e.stat, n: 0, src: [] }; map.set(key, x); }
      if (e.v !== null) x.v += e.v * qty;
      x.sg = x.sg || e.sg;
      x.n += qty;
      if (src && !x.src.includes(src)) x.src.push(src);
    });
    return [...map.values()].map(x => { if (x.stat && x.v !== null && x.v) x.mark = x.v > 0 ? '+' : '-'; return x; });
  }
  const signedNum = (v, sg) => (v < 0 ? '−' + fmt(-v) : (sg ? '+' : '') + fmt(v));
  const effStr = (x, dur) => (x.v === null ? x.label : `${x.label} ${signedNum(x.v, x.sg || x.stat)}${x.unit}`)
    + (x.n > 1 ? ` (×${x.n}${dur ? `, длительность +${x.n - 1}х` : ''})` : '');
  const fx = (name, v, mark, extra) => Object.assign({ name, label: name, v, unit: '', sg: true, mark: mark || '', stat: true, n: 1, src: [] }, extra || {});

  // строки ингредиентов: { i, qty, name, eff }
  const rowsOf = d => (d.rows || []).map(r => ({ i: ing(r.ing), name: String(r.ing || '').trim(), qty: Math.max(0, Math.floor(num(r.qty))), eff: Math.min(4, Math.max(1, Math.floor(num(r.eff)) || 1)) }))
    .filter(r => r.name && r.qty);
  const zivIn = i => i.e.reduce((a, [t, s]) => { const e = parseEff(t, s); return a + (/^живост/.test(e.name) && e.v !== null ? e.v : 0); }, 0);

  // ------------------------------------------------------------ расчёт
  function compute(d) {
    const out = { mode: d.mode, effects: [], main: null, warnings: [], notes: [], n: 0, spoiled: false, name: '' };
    const roll = Math.floor(num(d.roll));
    const rows = rowsOf(d);
    rows.filter(r => !r.i).forEach(r => out.warnings.push(`Нет в таблице ингредиентов: «${r.name}».`));
    const ok = rows.filter(r => r.i);
    const list = [];
    const names = ok.map(r => r.i.n.toLowerCase() + (r.qty > 1 ? ' ×' + r.qty : ''));
    const short = arr => arr.slice(0, 3).join(', ') + (arr.length > 3 ? '…' : '');

    if (d.mode === 'potion') {
      const types = potionTypes();
      const t = types.find(x => x.id === norm(d.potion)) || types[0];
      const st = new Set();
      let lvl = 0;
      ok.forEach(r => {
        const ex = r.i.e[r.eff - 1];
        if (!ex) { out.warnings.push(`У «${r.i.n}» нет ${r.eff}-го эффекта.`); return; }
        st.add(STATIONS[r.eff - 1]);
        lvl = Math.max(lvl, parseInt(r.i.lvl, 10) || 0);
        list.push({ e: parseEff(ex[0], ex[1]), qty: r.qty, src: r.i.n });
      });
      out.n = ok.reduce((a, r) => a + r.qty, 0);
      const b = ing(d.base);
      if (d.base && !b) out.warnings.push(`Нет в таблице: «${d.base}».`);
      if (b && !BC.BASE_FREE) out.n += 1;
      out.cap = t.slots;
      if (out.n > t.slots) out.warnings.push(`Эффектов ${out.n}, а у вида «${t.id}» ${t.slots} ${App.plural(t.slots, 'слот', 'слота', 'слотов')}: возьмите вид покрупнее.`);
      out.effects = combine(list);
      if (b) out.effects.push(fx(`основа «${b.n.toLowerCase()}»: ${baseText(b) || 'без особых свойств'}`, null, '', { stat: false }));
      if (d.conc) out.effects.forEach(x => { if (x.v !== null) x.v = ri(x.v * CONC); });
      out.notes.push(`«${cap(t.id)}»: ${t.slots} ${App.plural(t.slots, 'слот', 'слота', 'слотов')} эффектов, нужен ${t.lvl} ур. алхимии.`);
      if (st.size) out.notes.push(`Крафтильни: ${[...st].join(', ')}${out.effects.filter(x => !/^основа/.test(x.label)).length > 1 ? ', алхимический смешиватель (объединить разные эффекты)' : ''}${d.conc ? ', концентратор' : ''}.`);
      if (lvl) out.notes.push(`Ингредиенты требуют до ${lvl} ур. навыка.`);
      out.kind = 'potion';
      out.dur = true;
      out.name = `${cap(t.id)}${out.effects.length ? ': ' + short(out.effects.filter(x => !/^основа/.test(x.label)).map(x => effStr(x))) : ''}`;
    } else {
      const isCook = d.mode !== 'alco';
      const m = isCook ? (COOK.find(x => x.id === d.method) || COOK[0]) : (ALCO.find(x => x.id === d.alco) || ALCO[0]);
      let ziv = 0, n = 0;
      ok.forEach(r => {
        n += r.qty;
        if (isCook) ziv += zivIn(r.i) * r.qty;   // «вся живость, что есть в самих ингредиентах»
        const ex = r.i.e[m.eff - 1];
        if (!ex) { out.notes.push(`У «${r.i.n}» нет ${m.eff}-го эффекта — ${m.id} ничего из него не выделит.`); return; }
        const e = parseEff(ex[0], ex[1]);
        // «если выделенным эффектом оказывается живость, то она удваивается»
        if (isCook && /^живост/.test(e.name) && e.v !== null) ziv += e.v * r.qty;
        else list.push({ e, qty: r.qty, src: r.i.n });
        if (!isCook && baseText(r.i)) out.notes.push(`${r.i.n} — основа: ${baseText(r.i)}.`);
      });
      const extra = [];
      if (isCook) {
        const b = ing(d.base);
        if (m.base && !b) out.warnings.push(d.base ? `Нет в таблице: «${d.base}».` : `Для способа «${m.id}» нужна ${m.base}.`);
        if (b) {
          extra.push(fx(`основа «${b.n.toLowerCase()}»: ${baseText(b) || 'без особых свойств'}`, null, '', { stat: false }));
          if (!m.base) out.notes.push(`Основа нужна для варки и запекания; при способе «${m.id}» она не используется.`);
          else if (!BC.BASE_FREE) { n += 1; ziv += zivIn(b); }
        }
        // вырезки и выжимки
        (d.cuts || []).forEach(ct => {
          const q = Math.max(0, Math.floor(num(ct.qty)));
          if (!ct.cr || !q) return;
          const c = creatures().find(x => norm(x.n) === norm(ct.cr));
          if (!c) { out.warnings.push(`Существо «${ct.cr}» не найдено в бестиарии${unlocked() ? '' : ' (он открывается паролем ГМ)'}.`); return; }
          const boss = c.cat === 'босс';
          const qq = boss ? 1 : q;
          if (boss && q > 1) out.warnings.push(`С босса «${c.n}» можно получить только 1 вырезку.`);
          const src = `вырезка: ${c.n}`;
          if (BC.CUTS_ARE_INGREDIENTS) n += qq;
          ziv += ri(c.t * CUT.ziv) * qq;
          const sym = symName(c.sym);
          if (sym) list.push({ e: { name: `стихия «${sym}»`, text: '', v: ri(c.d * CUT.elem), unit: '', sg: true, mark: '+', stat: false }, qty: qq, src });
          const tm = TEMPER.find(([re]) => re.test(norm(c.ch)));
          if (tm) list.push({ e: parseEff(tm[1], '+'), qty: qq, src });
          (c.m || []).forEach(mk => { if (MARKS[mk]) list.push({ e: parseEff(MARKS[mk], '+'), qty: qq, src }); });
          if (boss) {
            const s = BOSS_STATS.includes(ct.stat) ? ct.stat : 's';
            extra.push(fx(`навсегда: ${R.STAT_NAMES[s].toLowerCase()}`, ri(c[s] * CUT.boss), '+', { stat: false, src: [c.n] }));
          }
        });
        n = Math.max(n, 0);
        ziv += n;   // «за каждый ингредиент +1 живости»
        out.main = fx('живость', ziv, ziv >= 0 ? '+' : '-');
        out.kind = 'food';
        out.name = `${cap(m.id)}${names.length ? ': ' + short(names) : ''}`;
        if (n > MAX_ING) out.warnings.push(`Ингредиентов ${n}, а можно не больше ${MAX_ING}.`);
        out.notes.push(`${cap(m.id)} выделяет ${m.eff}-й эффект ингредиента${m.plus ? ' ' + m.plus : ''}. Навык «кулинария» даёт шанс получить 2 блюда вместо 1.`);
      } else {
        const drunk = ALCO_PER * n + (BC.ALCO_METHOD_ONCE ? m.drunk : m.drunk * n);
        out.main = fx('опьянение', drunk, '-');
        out.kind = 'food';
        out.name = `Напиток (${m.id})${names.length ? ': ' + short(names) : ''}`;
        if (n > MAX_ING) out.warnings.push(`Ингредиентов ${n}, а можно не больше ${MAX_ING}.`);
        out.notes.push(`${cap(m.id)} выделяет ${m.eff}-й эффект ингредиента, +${m.drunk} опьянения${BC.ALCO_METHOD_ONCE ? '' : ' за ингредиент'}; каждый ингредиент — ещё +${ALCO_PER}.`);
      }
      out.n = n;
      out.cap = MAX_ING;
      out.effects = combine(list).concat(extra);
      // испорчено: все эффекты негативные; консервы: показатели хуже на 50%
      if (roll >= 1 && roll < SPOIL) {
        out.spoiled = true;
        [out.main].concat(out.effects).forEach(x => { x.mark = '-'; if (x.v !== null && x.stat && x.v > 0) x.v = -x.v; });
      }
      if (d.canned) [out.main].concat(out.effects).forEach(x => { if (x.v !== null) x.v = ri(x.v * CANNED); });
    }
    if (!ok.length) out.notes.unshift('Добавьте ингредиенты.');
    out.summary = [out.main].concat(out.effects).filter(Boolean).map(x => effStr(x, out.dur)).join(', ') + (out.spoiled ? ' (испорчено)' : '') + (d.canned && d.mode !== 'potion' ? ' (консервы)' : '');
    out.recipe = (d.mode === 'potion' ? ok.map(r => `${r.i.n.toLowerCase()} — ${r.eff}-й эффект${r.qty > 1 ? ' ×' + r.qty : ''}`) : names).join(', ')
      + (d.base && ing(d.base) ? `; основа: ${ing(d.base).n.toLowerCase()}` : '')
      + ((d.cuts || []).filter(c => c.cr).length ? `; вырезки: ${(d.cuts || []).filter(c => c.cr).map(c => c.cr + (num(c.qty) > 1 ? ' ×' + num(c.qty) : '')).join(', ')}` : '');
    return out;
  }

  // ------------------------------------------------------------ форма
  function blank(mode) {
    return { mode: mode || 'cook', method: COOK[0].id, alco: ALCO[0].id, potion: POTIONS[0].id, base: '', rows: [{ ing: '', qty: 1, eff: 1 }],
      cuts: [], roll: '', canned: false, conc: false, name: '', qty: 1 };
  }
  const draft = () => App.ui.brew || (App.ui.brew = blank());
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
  const countText = (d, r) => (d.mode === 'potion' ? `слотов занято <b class="${r.n > r.cap ? 'bad-text' : 'good-text'}">${r.n}</b> из ${r.cap}` : `ингредиентов <b class="${r.n > r.cap ? 'bad-text' : 'good-text'}">${r.n}</b> из ${r.cap}`);

  function outHtml(r) {
    const li = x => `<li><span class="eff ${x.mark === '+' ? 'plus' : x.mark === '-' ? 'minus' : ''}">${esc(effStr(x, r.dur))}</span>${x.src.length ? ` <span class="muted">— ${esc(x.src.join(', '))}</span>` : ''}</li>`;
    return `<div class="craft-preview brew-out${r.spoiled ? ' spoiled' : ''}">
      <p class="brew-name"><b>${esc(r.name)}</b> <span class="tag">${r.kind === 'potion' ? 'зелье' : r.mode === 'alco' ? 'напиток' : 'блюдо'}</span>${r.spoiled ? ' <span class="tag bad">испорчено</span>' : ''}</p>
      ${r.main ? `<p class="brew-main"><span class="eff ${r.main.mark === '-' ? 'minus' : 'plus'}">${esc(effStr(r.main))}</span></p>` : ''}
      ${r.effects.length ? `<ul class="brew-fx">${r.effects.map(li).join('')}</ul>` : ''}
      ${r.warnings.length ? `<ul class="small item-warn">${r.warnings.map(w => `<li class="bad-text">${esc(w)}</li>`).join('')}</ul>` : ''}
      ${r.notes.length ? `<ul class="small item-warn">${r.notes.map(w => `<li class="muted">${esc(w)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  // сбор трав: результат можно добавить в рецепт, а у ГМ в инвентаре — сразу в рюкзак (opts.herbsAct)
  function herbsHtml(opts) {
    const h = App.ui.brewHerbs;
    return `<div class="brew-herbs">
      <div class="row-actions"><button type="button" class="btn small" data-act="brewHerbs">Сбор трав</button>
        <span class="muted small">${HERBS[0]}–${HERBS[1]} случайных растений из таблицы ингредиентов</span></div>
      ${h && h.length ? `<ul class="brew-fx">${h.map(x => { const i = ing(x.n); return `<li><b>${esc(x.n)}</b>${x.qty > 1 ? ` ×${x.qty}` : ''} <span class="muted small">— ${esc(i ? i.e.map(e => e[0]).join(', ') : '')}</span></li>`; }).join('')}</ul>
        <div class="row-actions"><button type="button" class="btn small" data-act="brewHerbsUse">Добавить в рецепт</button>
          ${opts.herbsAct ? `<button type="button" class="btn small primary" data-act="${esc(opts.herbsAct)}">Забрать в рюкзак</button>` : ''}
          <button type="button" class="linklike small" data-act="brewHerbsClear">убрать</button></div>` : ''}
    </div>`;
  }

  // opts: { host: 'ref' | 'dev', issueAct: действие кнопки «Выдать», herbsAct: «Забрать в рюкзак» (только у ГМ в инвентаре) }
  let host = 'ref';
  function form(opts) {
    opts = opts || {};
    host = opts.host || 'ref';
    if (!ings().length) {
      return `<p class="muted small">Ингредиенты записаны в закрытом разделе «Алхимия и кухня» — откройте его паролем ГМ.</p>${window.GMLock ? window.GMLock.form('Кухня и алхимия: раздел для ГМ', 'Калькулятору нужны ингредиенты из листа «алхимия» — они открываются паролем ГМ.') : ''}`;
    }
    const d = draft();
    const r = compute(d);
    const isCook = d.mode === 'cook', isAlco = d.mode === 'alco', isPot = d.mode === 'potion';
    const m = COOK.find(x => x.id === d.method) || COOK[0];
    const effOpts = (i, sel) => [1, 2, 3, 4].map(k => { const e = i && i.e[k - 1]; return e ? opt(k, `${k}: ${e[0]} — ${STATIONS[k - 1]}`, sel) : ''; }).join('');
    let html = `<div class="brew">
      ${herbsHtml(opts)}
      <div class="seg" role="tablist">${MODES.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === d.mode}" class="${k === d.mode ? 'is-on' : ''}" data-act="brewMode" data-v="${k}">${t}</button>`).join('')}</div>
      <div class="form-grid">`;
    if (isCook) {
      html += `<label>Способ <select data-change="brewField" data-k="method">${COOK.map(x => opt(x.id, `${x.id} — ${x.eff}-й эффект${x.plus ? ' ' + x.plus : ''}`, d.method)).join('')}</select></label>
        ${m.base ? `<label>Основа <input type="text" list="brewBases" data-change="brewField" data-k="base" value="${esc(d.base || '')}" placeholder="${m.eff === 1 ? 'вода, молоко, кровь…' : 'рост.масло, слив.масло, жир…'}"> <span class="muted small">${esc(m.base)}</span></label>` : ''}`;
    } else if (isAlco) {
      html += `<label>Способ <select data-change="brewField" data-k="alco">${ALCO.map(x => opt(x.id, `${x.id} — ${x.eff}-й эффект, +${x.drunk} опьянения`, d.alco)).join('')}</select></label>`;
    } else {
      html += `<label>Вид <select data-change="brewField" data-k="potion">${potionTypes().map(x => opt(x.id, `${x.id} — ${x.slots} ${App.plural(x.slots, 'слот', 'слота', 'слотов')}, с ${x.lvl} ур. алхимии`, norm(d.potion))).join('')}</select></label>
        <label>Основа <span class="muted small">(необязательно)</span> <input type="text" list="brewBases" data-change="brewField" data-k="base" value="${esc(d.base || '')}" placeholder="мёд, слизь, вода…"></label>`;
    }
    html += `</div>
      <h3>Ингредиенты <span class="muted small" id="brewCount">${countText(d, r)}</span></h3>
      ${d.rows.map((x, i) => `<div class="part-row">
        <input type="text" list="brewIngs" data-change="brewField" data-k="rows.${i}.ing" value="${esc(x.ing || '')}" placeholder="ингредиент" aria-label="Ингредиент">
        ${isPot ? `<select data-change="brewField" data-k="rows.${i}.eff" aria-label="Какой эффект выделить">${effOpts(ing(x.ing), x.eff) || '<option value="1">— выберите ингредиент —</option>'}</select>` : ''}
        <input type="number" min="1" step="1" class="mini-num" data-change="brewField" data-k="rows.${i}.qty" value="${esc(x.qty)}" aria-label="Сколько"><span class="muted small">шт.</span>
        <button type="button" class="linklike small" data-act="brewDel" data-k="rows" data-v="${i}">убрать</button></div>`).join('')}
      <button type="button" class="linklike small" data-act="brewAdd" data-k="rows">+ ингредиент</button>`;
    if (isCook) {
      const cl = creatures();
      html += `<h3>Вырезки и выжимки <span class="muted small">разделочный стол; живость — 10% тела существа, стихия — 10% духа</span></h3>
        ${cl.length ? (d.cuts || []).map((x, i) => {
          const c = cl.find(y => norm(y.n) === norm(x.cr));
          return `<div class="part-row">
            <input type="text" list="brewCreatures" data-change="brewField" data-k="cuts.${i}.cr" value="${esc(x.cr || '')}" placeholder="существо" aria-label="Существо">
            <input type="number" min="1" step="1" class="mini-num" data-change="brewField" data-k="cuts.${i}.qty" value="${esc(x.qty)}" aria-label="Сколько вырезок"><span class="muted small">шт.</span>
            ${c && c.cat === 'босс' ? `<label class="inline">навсегда <select data-change="brewField" data-k="cuts.${i}.stat">${BOSS_STATS.map(s => opt(s, `${R.STAT_NAMES[s].toLowerCase()} +${ri(c[s] * CUT.boss)}`, x.stat || 's')).join('')}</select></label>` : ''}
            <button type="button" class="linklike small" data-act="brewDel" data-k="cuts" data-v="${i}">убрать</button></div>`;
        }).join('') + `<button type="button" class="linklike small" data-act="brewAdd" data-k="cuts">+ вырезка</button>
          <datalist id="brewCreatures">${cl.map(c => `<option value="${esc(c.n)}">${c.cat === 'босс' ? 'босс · ' : ''}${esc(c.ch || '')}</option>`).join('')}</datalist>`
        : '<p class="muted small">Существа — в бестиарии: он открывается паролем ГМ.</p>'}`;
    }
    html += `<div class="form-grid">
      ${isPot ? `<label class="check"><input type="checkbox" data-change="brewField" data-k="conc" ${d.conc ? 'checked' : ''}> Концентратор: эффект зелья 2Х</label>`
        : `<label>Бросок ${isCook ? 'готовки' : 'варки'} <span class="brew-roll"><input type="number" min="1" max="100" step="1" data-change="brewField" data-k="roll" value="${esc(d.roll || '')}" aria-label="Результат броска d100">
            <button type="button" class="btn small" data-act="brewRoll">d100</button></span> <span class="muted small">ниже ${SPOIL} — все эффекты негативные</span></label>
          <label class="check"><input type="checkbox" data-change="brewField" data-k="canned" ${d.canned ? 'checked' : ''}> Консервы / долгое хранение: показатели −50%</label>`}
      </div>
      <datalist id="brewIngs">${ings().map(i => `<option value="${esc(i.n)}">${esc(i.e.map(e => e[0]).join(', '))}</option>`).join('')}</datalist>
      <datalist id="brewBases">${bases().map(i => `<option value="${esc(i.n)}">${esc(baseText(i))}</option>`).join('')}</datalist>
      <div id="brewOut">${outHtml(r)}</div>`;
    if (opts.issueAct) {
      html += `<div class="form-grid">
          <label>Название <input type="text" data-change="brewField" data-k="name" value="${esc(d.name || '')}" placeholder="${esc(r.name)}" maxlength="120"></label>
          <label>Количество <input type="number" min="1" step="1" data-change="brewField" data-k="qty" value="${esc(d.qty || 1)}"></label>
        </div>
        <div class="row-actions"><button type="button" class="btn primary" data-act="${esc(opts.issueAct)}">Выдать</button>
          <button type="button" class="btn ghost" data-act="brewReset">Очистить</button></div>`;
    } else html += `<div class="row-actions"><button type="button" class="btn ghost small" data-act="brewReset">Очистить</button></div>`;
    html += `<details class="brew-help"><summary>Как считается</summary><ul class="small">
        <li><b>Кухня.</b> За каждый ингредиент +1 живости и вся живость, что есть в самих ингредиентах; способ выделяет эффект: варка — 1-й (+ свойства жидкой основы), жарка — 2-й, тушение — 3-й, запекание — 4-й (+ свойства масла). Если выделена живость — она удваивается. Не больше ${MAX_ING} ингредиентов.</li>
        <li><b>Вырезки и выжимки</b> (разделочный стол): живость — 10% тела существа, эффект его стихии — 10% духа; характер: агрессивный — урон +20%, нейтральный — ОД +2, мирный — пси +20%; метки ♦ сила +25, ♣ тело +25, ♥ дух +25, ♠ интеллект +25, ◘ ловкость +5. Бонусы от нескольких вырезок складываются. С босса — одна вырезка: постоянный бонус к одной из 4 характеристик, 25% от его показателя.</li>
        <li><b>Винокурня.</b> Каждый ингредиент +${ALCO_PER} опьянения; ферментация выделяет 1-й эффект (+1), дистилляция — 2-й (+2), мацерация — 3-й (+3), перколяция — 4-й (+4)${BC.ALCO_METHOD_ONCE ? ' — один раз на напиток' : ' — за каждый ингредиент'}. Не больше ${MAX_ING} ингредиентов.</li>
        <li>Бросок ниже ${SPOIL} портит блюдо или напиток: все эффекты становятся негативными. Консервы и долгое хранение — показатели хуже на 50%.</li>
        <li><b>Алхимический стол.</b> Вид зелья задаёт число слотов (отвар 2 … краут 50) и нужный уровень алхимии. Каждый выделенный эффект занимает слот: ступка и пестик — 1-й эффект ингредиента, реторта — 2-й, перегонный куб — 3-й, кальцатор — 4-й. Одинаковые эффекты складываются и продлевают длительность на 1х. Разные эффекты объединяет алхимический смешиватель, концентратор удваивает эффект.</li>
        <li>Зелёным — бафф, красным — дебафф (как в листе «алхимия»): у стихий минус при баффе — резист, при дебаффе — урон. Бафф и дебафф одной характеристики (сила +1 и сила −1) гасят друг друга.</li>
      </ul></details></div>`;
    return html;
  }

  // ------------------------------------------------------------ обновление
  let pending = false;
  function rerender() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (host === 'dev') { if (App.devCtx) App.devCtx.render(); } else if (window.Reference) window.Reference.refresh();
    }, 0);
  }
  // точечное обновление без перерисовки формы (чтобы не терялись нажатия)
  function refresh() {
    const d = draft(), r = compute(d);
    const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
    set('brewOut', outHtml(r));
    set('brewCount', countText(d, r));
    const nm = document.querySelector('[data-change="brewField"][data-k="name"]');
    if (nm) nm.placeholder = r.name;
  }
  const setPath = (o, path, val) => {
    const ps = path.split('.');
    let x = o;
    for (let i = 0; i < ps.length - 1; i++) { if (x[ps[i]] === undefined || x[ps[i]] === null) x[ps[i]] = /^\d+$/.test(ps[i + 1]) ? [] : {}; x = x[ps[i]]; }
    x[ps[ps.length - 1]] = val;
  };
  // честный d100, как у кубика кампании
  function d100() {
    const cr = window.crypto;
    if (!cr || !cr.getRandomValues) return Math.floor(Math.random() * 100) + 1;
    const a = new Uint32Array(1), lim = 4294967200;
    do { cr.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % 100 + 1;
  }

  Object.assign(App.actions, {
    brewMode(b) { draft().mode = b.dataset.v; rerender(); },
    brewField(t) {
      const d = draft(), k = t.dataset.k;
      setPath(d, k, t.type === 'checkbox' ? t.checked : t.value);
      // от этих полей зависит разметка формы: поле основы, список эффектов ингредиента, бонус босса
      if (k === 'method' || k === 'potion' || (d.mode === 'potion' && /^rows\.\d+\.ing$/.test(k)) || /^cuts\.\d+\.cr$/.test(k)) rerender(); else refresh();
    },
    brewAdd(b) {
      const d = draft(), k = b.dataset.k;
      d[k] = (d[k] || []).concat(k === 'cuts' ? [{ cr: '', qty: 1, stat: 's' }] : [{ ing: '', qty: 1, eff: 1 }]);
      rerender();
    },
    brewDel(b) { const d = draft(); (d[b.dataset.k] || []).splice(+b.dataset.v, 1); rerender(); },
    brewRoll() { const d = draft(); d.roll = d100(); App.toast(`d100: ${d.roll}${d.roll < SPOIL ? ' — испорчено' : ''}`); rerender(); },
    brewReset() { App.ui.brew = blank(draft().mode); rerender(); },
    brewHerbs() {
      App.ui.brewHerbs = gather();
      const n = App.ui.brewHerbs.reduce((a, x) => a + x.qty, 0);
      App.toast(n ? `Собрано: ${n} ${App.plural(n, 'растение', 'растения', 'растений')}` : 'Растений в таблице нет');
      rerender();
    },
    brewHerbsUse() {
      const d = draft();
      d.rows = d.rows.filter(r => r.ing);
      (App.ui.brewHerbs || []).forEach(x => {
        const r = d.rows.find(y => norm(y.ing) === norm(x.n) && (d.mode !== 'potion' || +y.eff === 1));
        if (r) r.qty = (+r.qty || 1) + x.qty; else d.rows.push({ ing: x.n, qty: x.qty, eff: 1 });
      });
      if (!d.rows.length) d.rows.push({ ing: '', qty: 1, eff: 1 });
      App.ui.brewHerbs = null;
      rerender();
    },
    brewHerbsClear() { App.ui.brewHerbs = null; rerender(); }
  });

  window.Brew = { form, compute, draft, blank, parseEff, potionTypes, ing };
})();
