/* Этапы мастера создания персонажа */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, C = window.GM_CONFIG;
  const D = window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, signed = R.signed, norm = R.norm;

  // ------------------------------------------------------------ мелкие помощники разметки

  function select(bind, options, value, extra = '') {
    let html = `<select ${bind ? `data-bind="${bind}"` : ''} ${extra}>`;
    let group = null;
    options.forEach(o => {
      if (o.group !== undefined && o.group !== group) {
        if (group !== null) html += '</optgroup>';
        group = o.group;
        html += `<optgroup label="${esc(group)}">`;
      }
      html += `<option value="${esc(o.v)}" ${String(o.v) === String(value) ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.t)}</option>`;
    });
    if (group !== null) html += '</optgroup>';
    return html + '</select>';
  }

  function stepper(path, value, { min = -Infinity, max = Infinity, step = 1, label = '' } = {}) {
    return `<span class="stepper" role="group" aria-label="${esc(label)}">
      <button type="button" class="st-btn" data-act="inc" data-path="${path}" data-d="${-step}" data-min="${min}" data-max="${max}" ${value <= min ? 'disabled' : ''} aria-label="Уменьшить">−</button>
      <input type="number" inputmode="numeric" data-bind="${path}" value="${value}" ${Number.isFinite(min) ? `min="${min}"` : ''} ${Number.isFinite(max) ? `max="${max}"` : ''} aria-label="${esc(label)}">
      <button type="button" class="st-btn" data-act="inc" data-path="${path}" data-d="${step}" data-min="${min}" data-max="${max}" ${value >= max ? 'disabled' : ''} aria-label="Увеличить">+</button>
    </span>`;
  }

  const kv = (k, v) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`;
  const tag = (t, cls = '') => `<span class="tag ${cls}">${esc(t)}</span>`;

  function statRow(o) {
    return `<table class="stat-mini"><thead><tr>${R.STATS.map(k => `<th title="${R.STAT_NAMES[k]}">${R.STAT_SHORT[k]}</th>`).join('')}${o.lvl !== undefined ? '<th>Ур.</th>' : ''}</tr></thead>
      <tbody><tr>${R.STATS.map(k => `<td>${fmt(o[k])}</td>`).join('')}${o.lvl !== undefined ? `<td>${fmt(o.lvl)}</td>` : ''}</tr></tbody></table>`;
  }

  function sizeName(code) {
    const s = R.SIZES.find(x => x.id === code);
    return s ? s.name : (code || '—');
  }

  function groupName(row) {
    const g = R.index.society.get(+row);
    return g ? g.name : row;
  }

  function cellRefs(cell) {
    const s = String(cell || '').trim();
    if (!s || s === 'н') return 'нет';
    if (/^(демоны|боги)$/i.test(s)) return s;
    return s.replace(/\d+/g, n => groupName(n)).replace(/\/н\b/, ' / без веры').replace(/\./g, ' / ');
  }

  // ------------------------------------------------------------ шаг 1: раса

  function raceResults(st) {
    const q = norm(App.ui.raceQ || '');
    const al = App.ui.raceAlign || '';
    const sz = App.ui.raceSize || '';
    const list = D.races.filter(r => r.playable)
      .filter(r => !q || norm(r.name).includes(q) || norm(r.bonus).includes(q))
      .filter(r => !al || r.align === al)
      .filter(r => !sz || r.size === sz);
    return `<p class="muted small">${list.length} из ${D.races.filter(r => r.playable).length} игровых рас. Расы с пометками ♥ (эволюция) и ♠ (не игровые) — в справочнике.</p>
      <div class="race-list" role="listbox" aria-label="Расы">
        ${list.map(r => `<button type="button" role="option" aria-selected="${r.id === st.raceId}" class="race-opt ${r.id === st.raceId ? 'is-on' : ''}" data-act="pickRace" data-id="${esc(r.id)}">
          <span class="ro-name">${esc(cap(r.name))}</span>
          <span class="ro-meta">ур. ${fmt(R.roundLevel(r.lvl))}, ${esc(sizeName(r.size).toLowerCase())}, ${esc(r.align)}</span></button>`).join('') || '<p class="muted">Ничего не найдено — измените фильтр.</p>'}
      </div>`;
  }

  function raceList(st) {
    const al = App.ui.raceAlign || '';
    const sz = App.ui.raceSize || '';
    const aligns = [...new Set(D.races.filter(r => r.playable).map(r => r.align))].filter(Boolean);
    // фильтры обновляют только список (#raceResults), поле поиска не перерисовывается и не теряет фокус
    return `<div class="picker">
      <div class="picker-tools">
        <input type="search" placeholder="Поиск по названию или бонусу" value="${esc(App.ui.raceQ || '')}" data-ui="raceQ" data-ui-target="raceList" aria-label="Поиск расы" autocomplete="off">
        <select data-ui="raceAlign" data-ui-target="raceList" aria-label="Характер"><option value="">любой характер</option>${aligns.map(a => `<option ${a === al ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <select data-ui="raceSize" data-ui-target="raceList" aria-label="Размер"><option value="">любой размер</option>${R.SIZES.map(s => `<option value="${s.id}" ${s.id === sz ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
      </div>
      <div id="raceResults">${raceResults(st)}</div></div>`;
  }
  App.refreshRaceList = () => { const box = document.getElementById('raceResults'); if (box) box.innerHTML = raceResults(App.state); };

  function fxLine(f) {
    const half = (f.half ? ' (½)' : '') + (f.repl ? ' (репликант)' : '');
    const cond = f.cond ? ' — условно, не учитывается в расчёте' : '';
    switch (f.k) {
      case 'talent': return `${talentName(f.id)} ${signed(f.v)}${half}${cond}`;
      case 'attr': return `привлекательность ${signed(f.v)}${half}${cond}`;
      case 'zor': return `зоркость ${signed(f.v)}${half}${cond}`;
      case 'od': return `ОД ${signed(f.v)}${half}${cond}`;
      case 'hpRegen': return `реген ХП +${f.v}${half}${cond}`;
      case 'mpRegen': return `реген МП +${f.v}${half}${cond}`;
      case 'mpRegenMul': return `реген МП ×${f.v}${cond}`;
      case 'weapon': return `оружие «${f.group}»: урон +${f.v}${half}${cond}`;
      case 'weaponAcc': return `оружие «${f.group}»: точность +${f.v}${half}${cond}`;
      case 'prayers': return `молитвы +${f.v}`;
      case 'extraPos': return `доп. положительные черты +${f.v}${half}`;
      case 'passive': return `${f.id} +${f.v}${half} (пассивный навык)`;
      case 'symbol': return `магический символ: ${f.id === 'дракон' ? 'символ дракона' : f.id}${half}`;
      case 'symbolByAffiliation': return 'символ по принадлежности (клан / покровитель)';
      case 'ability': return `умение: ${f.id}${half}`;
      case 'hands': return `рук: ${f.v}`;
      case 'noWeapon': return 'оружие на старте взять нельзя (проверяется)';
      case 'noArmor': return 'другие доспехи носить нельзя (проверяется)';
      case 'noStartGear': return 'без стартовой экипировки, благословений, болезней и проклятия (проверяется)';
      case 'noSizeDebuff': return 'нет дебафа от роста: +10% получаемого урона от размера не действует';
      case 'noMediumArmorPenalty': return 'средние доспехи без штрафа ловкости';
      default: return null;
    }
  }

  function talentName(id) {
    const t = R.TALENTS.find(x => x.id === id);
    return t ? t.name.toLowerCase() : id;
  }

  function raceCard(st, res) {
    const race = res.race;
    if (!race) return '<div class="card empty">Выберите расу из списка — здесь появятся её параметры, бонусы и связи с другими таблицами.</div>';
    const r = race.base;
    let html = `<article class="card race-card"><header><h2>${esc(cap(race.name))}</h2>
      ${r.bonusFreq ? tag(r.bonusFreq, 'freq') : ''}</header>`;
    if (race.isHalf) {
      const opts = [{ v: '', t: '— раса —' }].concat(D.races.filter(x => x.playable && x.id !== 'полукровка').map(x => ({ v: x.id, t: cap(x.name) })));
      html += `<p class="note">Полукровка «получает статы путём сложения статов двух рас и делением их на 2 / имеет половинчатые бонусы и штрафы обеих рас / привлекательность −20». Характер и размер — «настраиваемые».</p>
        <div class="form-grid">
          <label>Первая родительская раса ${select('parentA', opts, st.parentA, 'data-rerender')}</label>
          <label>Вторая родительская раса ${select('parentB', opts, st.parentB)}</label>
          <label>Характер ${select('hbAlign', [{ v: '', t: '— выбрать —' }, 'добро', 'нейтрал', 'зло', 'мир'].map(x => typeof x === 'string' ? { v: x, t: x } : x), st.hbAlign)}</label>
          <label>Размер ${select('hbSize', [{ v: '', t: '— выбрать —' }].concat((race.sizeOptions || []).map(z => ({ v: z, t: sizeName(z) }))), st.hbSize)}</label>
        </div>`;
    }
    html += statRow(Object.assign({}, race.stats, { lvl: race.lvl }));
    html += `<p class="muted small">Уровень = (сумма характеристик − 25) / 3. За каждый уровень — 3 очка характеристик.</p>`;
    html += '<dl class="kv-list">';
    html += kv('Характер', esc(race.align || '—') + (race.align ? ` <span class="muted">(карма ${signed(C.KARMA[race.align] || 0)})</span>` : ''));
    const sz = R.SIZES.find(s => s.id === race.size);
    html += kv('Размер', sz ? `${esc(sz.name)} <span class="muted">— сырьё для оружия и брони ${esc(sz.mat)}, ${esc(sz.fx)}</span>`
      : `${esc(r.size || '—')}${race.ancestorRule ? ' <span class="muted">— определится по предку</span>' : ''}`);
    html += kv('Уровень обитания', R.habitatNames(race.habitat, true).map(esc).join('<br>') || '—');
    // фракция и религия на старте не выдаются — связи расы видит только ГМ
    if (!race.isHalf && window.GMLock && window.GMLock.unlocked) {
      html += kv('Фракция расы <span class="muted">(ГМ)</span>', esc(cellRefs(r.faction)) + ' <span class="muted">— в игре, не на старте</span>');
      html += kv('Религия расы <span class="muted">(ГМ)</span>', esc(cellRefs(r.religion)) + ' <span class="muted">— в игре, не на старте</span>');
    }
    if (r.evo) html += kv('Эволюция', `в «${esc(r.evo)}» <span class="muted">(лист «механики»: эволюция требует плоти древних и осколка легенды)</span>`);
    html += '</dl>';
    html += '<div class="bp">';
    race.bonuses.forEach(b => { html += `<div class="bp-item plus"><h3>Бонус${race.bonuses.length > 1 ? ': ' + esc(b.src) : ''}</h3><p>${esc(b.text || '—')}</p></div>`; });
    race.penalties.forEach(b => { html += `<div class="bp-item minus"><h3>Штраф${race.penalties.length > 1 ? ': ' + esc(b.src) : ''}</h3><p>${esc(b.text || '—')}</p></div>`; });
    html += '</div>';
    const fxs = race.fx.concat(race.pfx).map(fxLine).filter(Boolean);
    if (fxs.length) html += `<div class="applied"><h3>Учтено в расчёте</h3><ul>${fxs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    // Предок
    if (race.ancestorRule) html += ancestorBlock(st, res);
    if (race.id === 'они') {
      html += `<div class="sub"><h3>Клан Они</h3><p class="muted small">«Символ по принадлежности / бонус +50 к оружию клана». Клан подсказывает и демона-покровителя.</p>
        ${select('oniClan', [{ v: '', t: '— выбрать клан —' }].concat(R.ONI_CLANS.map(c => ({ v: c.id, t: `${c.id} — ${c.weapon.replace(' ( веер)', ' (веер)')}` }))), st.oniClan)}</div>`;
    }
    html += '</article>';
    return html;
  }

  function ancestorBlock(st, res) {
    const race = res.race, rule = race.ancestorRule;
    let opts = [{ v: '', t: '— выбрать —' }];
    const A = D.ancestors || [];   // открытый список возможных предков (без боссов и легенд)
    if (rule.kind === 'dragon') opts = opts.concat(A.filter(c => c.sec === 'Драконы').map(c => ({ v: c.n, t: `${c.n} (ур. ${fmt(R.roundLevel(c.lvl))}, ${sizeName(c.sz).toLowerCase()})` })));
    else if (rule.kind === 'insect') {
      opts = opts.concat(A.filter(c => c.ins === 'spider').map(c => ({ v: c.n, t: c.n, group: 'Пауки и насекомые' })));
      opts = opts.concat(A.filter(c => c.ins === 'other').map(c => ({ v: c.n, t: c.n, group: 'Другие существа с хитином / инсекто-мясом' })));
    } else if (rule.kind === 'beastRace') {
      const beasts = D.races.filter(x => x.playable && x.faction === '30');
      opts = opts.concat(beasts.map(x => ({ v: x.id, t: cap(x.name), group: 'Звериные расы' })));
    }
    if (rule.kind === 'demon' || rule.kind === 'god') {
      opts = opts.concat(R.patronList(rule.kind).map(d => {
        const sym = R.patronSymbol(d.name);
        return { v: d.name, t: `${d.name} — символ: ${sym || 'не задан'}` };
      }));
    }
    let html = `<div class="sub"><h3>${esc(rule.title)}</h3><p class="muted small">«${esc(rule.text)}»</p>`;
    if (rule.kind === 'monster') {
      html += `<input type="text" list="monsterList" data-bind="ancestor" data-rerender value="${esc(st.ancestor)}" placeholder="Начните вводить название существа" aria-label="Монстр-предок">
        <datalist id="monsterList">${A.map(c => `<option value="${esc(c.n)}">`).join('')}</datalist>
        <p class="muted small">Боссы и легенды исключены. Список — лист «Существа» (${A.length}).</p>`;
    } else {
      html += select('ancestor', opts, st.ancestor);
    }
    const a = race.ancestor;
    if (a && a.demon) {
      const who = rule.kind === 'god' ? 'боге' : 'демоне';
      html += `<div class="anc"><p><strong>${esc(a.name)}</strong> — стартовый магический символ: <strong>${esc(a.element || 'ещё не задан ГМ')}</strong></p>
        <p class="muted small">О ${who} (лист «Социум»): ${esc(a.demon.bonus)}. От ${rule.kind === 'god' ? 'бога' : 'демона'} при создании берётся только символ; остальное — дары веры, их получают в игре.</p></div>`;
    } else if (a && a.creature) {
      const c = a.creature;
      html += `<div class="anc"><p><strong>${esc(c.n)}</strong> ${c.m.map(m => tag(m)).join('')} — ур. ${fmt(R.roundLevel(c.lvl))}, ${esc(sizeName(c.sz).toLowerCase())}, ${esc(c.ch)}</p>${statRow(Object.assign({}, c, { lvl: R.roundLevel(c.lvl) }))}`;
      if (a.add) html += `<p>Прибавка +${rule.pct}%: ${R.STATS.map(k => `${R.STAT_SHORT[k]} ${signed(a.add[k])}`).join(', ')}</p>`;
      if (a.symbol) html += `<p>Знак дракона рода: <strong>${esc(a.symbol)}</strong></p>`;
      if (rule.kind === 'dragon') html += `<p>Размер драконида: ${esc(sizeName(race.size))} (предок ${esc(sizeName(c.sz).toLowerCase())} − 1)</p>`;
      if (a.abilities && a.abilities.length) {
        const mark = x => (Object.keys(x.fx).length ? ' <span class="calc-mark" title="учитывается в расчёте">расчёт</span>' : '');
        if (rule.kind === 'monster') {
          html += `<label>Умение монстра (одно, полной силы) ${select('ancestorAbility', [{ v: '', t: '— выбрать —' }].concat(a.abilities.map(x => ({ v: String(x.i), t: x.text.replace(/\s+/g, ' ').slice(0, 120) }))), st.ancestorAbility)}</label>`;
          if (a.picked) html += `<p class="small">${esc(a.picked.text)}${mark(a.picked)}</p>`;
        } else {
          html += `<p class="muted small">Навыки предка${rule.kind === 'dragon' ? ' — у драконида 50% мощности, числа уже поделены пополам' : ''}:</p>
            <ul class="abil">${a.abilities.map(x => `<li>${esc(x.text)}${mark(x)}</li>`).join('')}</ul>`;
        }
      } else html += '<p class="muted small">Особых навыков у предка в таблице нет.</p>';
      html += '</div>';
    } else if (a && a.race) {
      html += `<div class="anc"><p>Половина бонуса расы «${esc(cap(a.race.name))}»: ${esc(a.race.bonus)}</p></div>`;
    } else if (st.ancestor) {
      html += '<p class="issue warn">Существо с таким названием не найдено среди возможных предков — выберите из подсказок.</p>';
    }
    return html + '</div>';
  }

  // ------------------------------------------------------------ шаг 2: возраст

  function ageStep(st, res) {
    const race = res.race;
    const cards = R.AGES.map(a => `<button type="button" class="age-card ${st.ageCat === a.id ? 'is-on' : ''}" data-act="pickAge" data-id="${a.id}" aria-pressed="${st.ageCat === a.id}">
        <span class="age-title">${a.title}</span>
        <span class="age-range">${esc(a.range)}</span>
        <span class="age-fx">${esc(a.buff)}</span>
        <span class="age-lim">${esc(a.limit)}</span>
      </button>`).join('');
    let html = `<div class="age-grid">${cards}</div>`;
    if (!race) return html + '<div class="card empty">Сначала выберите расу: возраст считается от её среднего уровня.</div>';
    if (!res.age) return html;
    const rg = C.AGE_RANGES[res.age.id];
    html += `<div class="card age-calc">`;
    if (rg.min !== rg.max) {
      html += `<label class="range-label">Отклонение от среднего уровня: <output id="agePctOut">${signed(res.agePct)}%</output>
        <input type="range" min="${rg.min}" max="${rg.max}" step="1" value="${res.agePct}" data-bind="agePct" aria-label="Процент от среднего уровня">
        <span class="range-ends"><span>${signed(rg.min)}%</span><span>${signed(rg.max)}%</span></span></label>`;
    } else if (rg.min === 0) {
      html += '<p>Взрослый — ровно средний уровень расы, без изменения очков.</p>';
    } else {
      html += `<p>${esc(res.age.title)} — фиксированно <strong>${signed(rg.min)}%</strong> к среднему уровню расы${res.age.id === 'старец' ? ' (это верхняя граница возраста)' : ''}.</p>`;
    }
    html += `<div id="ageLive">${ageLive(res)}</div></div>`;
    return html;
  }

  function ageLive(res) {
    const pts = res.agePoints;
    return `<dl class="big-numbers">
      <div><dt>Средний уровень расы</dt><dd>${fmt(res.lvl0)}</dd></div>
      <div><dt>Уровень персонажа</dt><dd>${fmt(res.level)}</dd></div>
      <div><dt>${pts >= 0 ? 'Доп. очки характеристик' : 'Очки к снятию'}</dt><dd>${pts >= 0 ? '+' : '−'}${fmt(Math.abs(pts))}</dd></div>
      <div><dt>Очки талантов</dt><dd>${res.talentPoints}</dd></div>
    </dl>
    <p class="muted small">Уровень: ${fmt(res.lvl0)} × ${signed(res.agePct)}% → ${fmt(res.level)} (округляется до целого). Очки: 3 × (${fmt(res.level)} − ${fmt(res.lvl0)}) = ${signed(pts)}; всего характеристик станет на ${fmt(Math.abs(pts))} ${pts >= 0 ? 'больше' : 'меньше'} расовых. Таланты: ⌊${fmt(res.level)} / 5⌋ = ${res.talentPoints}. ОД от возраста: ${signed(res.age.od)}. Черт: до ${res.age.traits} положительных и ${res.age.traits} отрицательных.</p>`;
  }

  // ------------------------------------------------------------ шаг 3: дар / благословение / болезнь

  function boonStep(st, res) {
    const isHom = res.race && res.race.id === 'гомункулы';
    const tab = App.ui.boonTab || (st.boon.kind || 'gift');
    const tabs = [['gift', 'Тёмные дары', D.skills.gifts.length], ['buff', 'Благословения ♥', D.skills.buffs.filter(b => b.birth).length], ['disease', 'Врождённые болезни ♥', D.skills.diseases.filter(d => d.birth).length]];
    let html = `<p class="note">«Из тёмных даров, благословений и болезней можно взять что-то одно из всей колонки». Можно не брать ничего. Доступны только врождённые (♥) благословения и болезни.</p>`;
    if (isHom) html += '<p class="issue warn">Гомункулы: «на начале не могут взять экипировку / проклятие / благословение / болезнь» — доступны только тёмные дары.</p>';
    html += `<div class="seg" role="tablist">${tabs.map(([id, t, n]) => `<button type="button" role="tab" aria-selected="${tab === id}" class="${tab === id ? 'is-on' : ''}" data-act="boonTab" data-id="${id}">${t} <small>${n}</small></button>`).join('')}
      <button type="button" class="${!st.boon.kind ? 'is-on' : ''} none-btn" data-act="pickBoon" data-kind="" data-name="">Ничего не брать</button></div>`;
    let list = [];
    if (tab === 'gift') list = D.skills.gifts.map(g => ({ name: g.name, a: g.bonus, b: g.debuff, la: 'Дар', lb: 'Цена' }));
    if (tab === 'buff') list = D.skills.buffs.filter(b => b.birth).map(b => ({ name: b.name, a: b.effect, b: b.dur ? `длительность: ${b.dur}` : '', la: 'Эффект', lb: '' }));
    if (tab === 'disease') list = D.skills.diseases.filter(d => d.birth).map(d => ({ name: d.name, a: d.e1, b: d.e2, la: 'Эффект', lb: 'Проявление' }));
    const blocked = isHom && tab !== 'gift';
    if (res.boon) html += boonOptions(st, res);
    html += `<div class="boon-list">${list.map(it => {
      const on = st.boon.kind === tab && norm(st.boon.name) === norm(it.name);
      const fx = (R.BOON_FX[tab] || {})[norm(it.name)];
      return `<button type="button" class="boon ${on ? 'is-on' : ''}" ${blocked ? 'disabled' : ''} data-act="pickBoon" data-kind="${tab}" data-name="${esc(it.name)}" aria-pressed="${on}">
        <span class="boon-name">${esc(cap(it.name))}${fx ? ' <span class="calc-mark" title="учитывается в расчёте">расчёт</span>' : ''}</span>
        <span class="boon-a"><b>${it.la}:</b> ${esc(it.a)}</span>${it.b ? `<span class="boon-b">${it.lb ? `<b>${it.lb}:</b> ` : ''}${esc(it.b)}</span>` : ''}</button>`;
    }).join('')}</div>`;
    return html;
  }

  function rollBox(key, label, st) {
    const r = R.rollView((st.rolls || {})[key]);
    return `<div class="roll"><button type="button" class="btn" data-act="roll" data-kind="${key}">${r ? 'Перебросить' : 'Бросить'}: ${esc(label)}</button>
      ${r ? `<p><strong>${esc(r.v)}</strong>${r.block ? ` <span class="muted">(${esc(r.block)})</span>` : ''}${r.detail ? ` — ${esc(r.detail)}` : ''}<br><span class="muted small">бросков: ${r.n}${r.n > 1 ? ' — ГМ видит количество перебросов' : ''}</span></p>` : ''}</div>`;
  }

  function boonOptions(st, res) {
    const b = res.boon, fx = b.fx, o = st.boonOpt || {};
    let html = `<div class="card boon-opts"><h2>${esc(cap(b.src.name))}</h2>`;
    const statOpts = [{ v: '', t: '—' }].concat(R.STATS.map(k => ({ v: k, t: R.STAT_NAMES[k] })));
    if (fx.option === 'swap') html += `<p>«Поменять местами параметры»: итоговые значения двух характеристик меняются местами.</p><div class="form-grid"><label>Параметр 1 ${select('boonOpt.swapA', statOpts, o.swapA)}</label><label>Параметр 2 ${select('boonOpt.swapB', statOpts, o.swapB)}</label></div>`;
    if (fx.option === 'otherRace') {
      const opts = [{ v: '', t: '— раса —' }].concat(D.races.filter(r => r.playable && r.id !== 'полукровка').map(r => ({ v: r.id, t: cap(r.name) })));
      html += `<label>Раса, чьи стартовые бонусы вы берёте ${select('boonOpt.otherRace', opts, o.otherRace)}</label>`;
      const other = R.index.race.get(o.otherRace);
      if (other) {
        const noPen = !other.penalty || /^нет$/i.test(other.penalty.trim());
        html += `<div class="bp"><div class="bp-item plus"><h3>Бонус</h3><p>${esc(other.bonus)}</p></div><div class="bp-item minus"><h3>Удвоенный штраф</h3><p>${noPen ? 'у расы нет штрафа — «вы получите случайную удвоенную негативную черту»' : esc(other.penalty) + ' (×2)'}</p></div></div>`;
        if (noPen) html += rollBox('replicantTrait', 'случайная негативная черта', st);
      }
    }
    if (fx.option === 'word') html += `<label>Слово с отрицанием (напр. «несправедливость», «неподвижность», «неудача») <input type="text" data-bind="boonOpt.word" value="${esc(o.word || '')}"></label>`;
    if (fx.option === 'immunity') html += `<label>Тип урона для иммунитета <input type="text" list="dmgTypes" data-bind="boonOpt.immunity" value="${esc(o.immunity || '')}"></label>${dmgDatalist()}`;
    if (fx.option === 'prevExp') {
      const syms = [{ v: '', t: '— символ —' }].concat(D.skills.symbols.filter(s => s.cat !== 'запретные знания')
        .map(s => ({ v: s.name, t: `${s.name} (${s.req})`, group: s.cat === 'порицаемая' ? 'Порицаемые' : 'Обычные' }))
        .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Обычные' ? -1 : 1)));
      const actList = D.skills.startActives || [], stList = D.skills.startStances || [];   // открытые списки для создания
      const skillField = select('boonOpt.prevSkill', [{ v: '', t: '— физ. навык —' }].concat(actList.map(a => ({ v: a.name, t: `${a.name} (${a.req || 'без требований'})` }))), o.prevSkill);
      const stanceField = select('boonOpt.prevStance', [{ v: '', t: '— стойка —' }].concat(stList.map(s => ({ v: s.name, t: `${s.name} (${s.req})` }))), o.prevStance);
      html += `<p>«Вы можете выбрать 1 физ навык, 1 символ (из разрешённых), 1 стойку и 1 дополнительную положительную черту». Доп. черта выбирается на этапе «Черты» — лимит положительных увеличен на 1.</p>
        <div class="form-grid"><label>Физический навык ${skillField}</label>
        <label>Магический символ (обычный или порицаемый, не запретный) ${select('boonOpt.prevSymbol', syms, o.prevSymbol)}</label>
        <label>Стойка ${stanceField}</label></div>`;
      const sk = actList.find(a => a.name === o.prevSkill);
      const stc = stList.find(a => a.name === o.prevStance);
      html += reqNote(sk && sk.req, res) + reqNote(stc && stc.req, res);
      if (sk) html += `<p class="small"><b>${esc(sk.name)}:</b> ${esc(sk.effect)}; КД ${esc(sk.cd)}</p>`;
      if (stc) html += `<p class="small"><b>${esc(stc.name)}:</b> ${esc(stc.effect)}</p>`;
    }
    const ROLLS = { artifact: 'случайный артефакт', element: 'случайный символ', parts: 'сколько частей тела (1–3)', beasts: 'сколько существ (2–4)' };
    if (fx.roll) html += rollBox(fx.roll, ROLLS[fx.roll], st);
    const applied = [];
    if (fx.stat) applied.push(Object.entries(fx.stat).map(([k, v]) => `${R.STAT_NAMES[k]} ${signed(v)}`).join(', '));
    if (fx.mul) applied.push(Object.entries(fx.mul).map(([k, v]) => `${R.STAT_NAMES[k]} ×${fmt(v)}`).join(', '));
    if (fx.pct) applied.push(Object.entries(fx.pct).map(([k, v]) => `${R.STAT_NAMES[k]} +${v}%`).join(', '));
    if (fx.allPct) applied.push(`все характеристики +${fx.allPct}%`);
    if (fx.size) applied.push(`размер ${signed(fx.size)}`);
    if (fx.od) applied.push(`ОД ${signed(fx.od)}`);
    if (fx.zor) applied.push(`зоркость ${signed(fx.zor)}`);
    if (fx.prayers) applied.push(`молитвы +${fx.prayers}`);
    if (fx.mpRegenMul) applied.push(`реген МП ×${fx.mpRegenMul}`);
    if (fx.noHpRegen) applied.push('реген ХП отключён');
    if (fx.void) applied.push('нет параметра «тело»: ХП = дух');
    if (fx.noCast) applied.push('ячейки заклинаний: 0');
    if (fx.expMul) applied.push(`опыт ×${fx.expMul}`);
    if (fx.gold) applied.push(`${fx.gold} золотых монет в начале`);
    if (fx.freePos) applied.push(`+${fx.freePos} положительная черта`);
    if (applied.length) html += `<div class="applied"><h3>Учтено в расчёте</h3><ul>${applied.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    return html + '</div>';
  }

  function reqNote(req, res) {
    if (!req) return '';
    const parts = [];
    String(req).replace(/(\d+)\s*([тдсилТДСИЛ])/g, (m, n, k) => { parts.push([+n, { 'т': 't', 'д': 'd', 'с': 's', 'и': 'i', 'л': 'l' }[k.toLowerCase()]]); return m; });
    const bad = parts.filter(([n, k]) => res.stats[k] < n);
    if (!bad.length) return '';
    return `<p class="issue warn">Требования «${esc(req)}» не выполнены: ${bad.map(([n, k]) => `${R.STAT_NAMES[k].toLowerCase()} ${fmt(res.stats[k])} из ${n}`).join(', ')}.</p>`;
  }

  function dmgDatalist() {
    const items = D.skills.symbols.map(s => s.name.replace(/\s*\(\d\)/, '')).concat(['физический', 'магический', 'колющий', 'рубящий', 'режущий', 'дробящий', 'рвущий', 'секущий',
      'яд', 'кровотечение', 'горение', 'оглушение', 'страх', 'очарование', 'бешенство', 'проклятие', 'болезнь', 'безмолвие', 'слепота', 'сон', 'удушение']);
    return `<datalist id="dmgTypes">${[...new Set(items)].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  }

  // ------------------------------------------------------------ шаг 4: черты

  function traitsStep(st, res) {
    const ti = res.traits, age = res.age;
    let html = '';
    if (!age) return '<div class="card empty">Сначала выберите возраст: от него зависит, сколько черт можно взять.</div>';
    if (age.traits === 0) html += '<p class="issue err">Ребёнок «не может брать положительные и отрицательные черты на старте».</p>';
    html += `<div class="trait-meter">
      <div><span>Положительные</span><strong>${ti.pos.length} / ${ti.limitPos}</strong></div>
      <div><span>Отрицательные</span><strong>${ti.neg.length} / ${ti.limitNeg}</strong></div>
      <div class="${ti.pos.length > ti.balanceCap ? 'bad' : ti.pos.length === ti.balanceCap ? 'good' : ''}"><span>Баланс</span><strong>${ti.pos.length} : ${ti.balanceCap}</strong></div>
    </div>
    <p class="muted small">Возраст «${esc(age.title.toLowerCase())}»: до ${age.traits} каждого типа. Каждая положительная черта уравновешивается отрицательной; «немота» и «обычный» уравновешивают 2 положительных, «проклят» — 3, «калека» — 2 за каждую конечность (и на столько же расширяют лимит положительных).${ti.freeSrc.length ? ' Свободные положительные: ' + esc(ti.freeSrc.join(', ')) + '.' : ''} Противоположные черты (сильный / слабый и т.п.) взять вместе нельзя. Большинство черт можно взять несколько раз — кнопки «−» и «+» у выбранной черты, эффекты складываются.</p>`;
    const all = ti.pos.concat(ti.neg);
    const chosen = new Set(all);
    const count = k => all.filter(x => x === k).length;
    const col = (list, kind) => list.map(t => {
      const k = norm(t.name);
      const n = count(k), on = n > 0;
      const fx = R.TRAIT_FX[k] || {};
      const full = (kind === 'pos' && ti.pos.length >= ti.limitPos) || (kind === 'neg' && ti.neg.length >= ti.limitNeg);
      let reason = '';
      if (!on) {
        if (age.traits === 0) reason = 'недоступно ребёнку';
        else if (kind === 'pos' && ti.pos.length >= ti.limitPos) reason = 'лимит положительных';
        else if (kind === 'neg' && ti.neg.length >= ti.limitNeg) reason = 'лимит отрицательных';
        else if (fx.opp && chosen.has(norm(fx.opp))) reason = `противоположна «${fx.opp}»`;
        else {
          const opp = Object.entries(R.TRAIT_FX).find(([kk, f]) => f.opp && norm(f.opp) === k && chosen.has(kk));
          if (opp) reason = 'противоположна выбранной';
        }
        if (k === 'проклят' && res.race && res.race.id === 'гомункулы') reason = 'гомункулам нельзя';
      }
      const w = fx.weight ? `<span class="calc-mark">×${fx.weight}</span>` : k === 'калека' ? '<span class="calc-mark">×2 за конечность</span>' : '';
      const rep = on && R.traitRepeatable(k);
      const btn = `<button type="button" class="trait ${kind} ${on ? 'is-on' : ''}" data-act="toggleTrait" data-name="${esc(t.name)}" ${reason ? 'disabled' : ''} aria-pressed="${on}" ${on ? 'title="Убрать черту"' : ''}>
        <span class="tr-name">${esc(cap(t.name.trim()))} ${w}${n > 1 ? ` <span class="tr-n">×${n}</span>` : ''}</span><span class="tr-fx">${esc(t.effect)}</span>${reason ? `<span class="tr-why">${esc(reason)}</span>` : ''}</button>`;
      if (!rep) return btn;
      return `<div class="trait-row">${btn}<span class="trait-count" role="group" aria-label="Сколько раз взять «${esc(t.name.trim())}»">
        <button type="button" class="st-btn" data-act="traitCount" data-name="${esc(t.name)}" data-d="-1" aria-label="Взять на раз меньше">−</button>
        <output>${n}</output>
        <button type="button" class="st-btn" data-act="traitCount" data-name="${esc(t.name)}" data-d="1" ${full ? 'disabled' : ''} aria-label="Взять ещё раз">+</button></span></div>`;
    }).join('');
    html += `<div class="two-col traits"><section><h2 class="h-sec">Положительные</h2><div class="trait-list">${col(D.skills.traitsPos, 'pos')}</div></section>
      <section><h2 class="h-sec">Отрицательные</h2><div class="trait-list">${col(D.skills.traitsNeg, 'neg')}</div></section></div>`;
    // параметры черт
    const opts = [];
    const to = st.traitOpt || {};
    if (chosen.has('калека')) {
      opts.push(`<div class="opt"><h3>Калека</h3><p class="muted small">«Позволяет убрать энное количество конечностей и за каждую получить +2 очка положительных характеристик». Убранные руки уменьшают число рук для оружия (сейчас рук: ${res.hands} из ${res.handsBase}).</p>
        <div class="form-grid"><label>Руки ${stepper('traitOpt.arms', to.arms || 0, { min: 0, max: res.handsBase, label: 'Убрать рук' })}</label>
        <label>Ноги ${stepper('traitOpt.legs', to.legs || 0, { min: 0, max: 2, label: 'Убрать ног' })}</label></div></div>`);
    }
    const times = (k, f) => Array.from({ length: count(k) }, (_, i) => f(R.optKey, i, count(k) > 1 ? ` №${i + 1}` : '')).join('');
    if (chosen.has('резистентный')) opts.push(`<div class="opt"><h3>Резистентный: +10% сопротивления${count('резистентный') > 1 ? ' (за каждую черту; одинаковые складываются)' : ''}</h3>${times('резистентный', (key, i, nn) => `<input type="text" list="dmgTypes" data-bind="traitOpt.${key('resist', i)}" value="${esc(to[key('resist', i)] || '')}" placeholder="эффект или тип урона${nn}" aria-label="Резистентный к${nn}">`)}</div>`);
    if (chosen.has('уязвимый')) opts.push(`<div class="opt"><h3>Уязвимый: −10% сопротивления${count('уязвимый') > 1 ? ' (за каждую черту; одинаковые складываются)' : ''}</h3>${times('уязвимый', (key, i, nn) => `<input type="text" list="dmgTypes" data-bind="traitOpt.${key('vuln', i)}" value="${esc(to[key('vuln', i)] || '')}" placeholder="эффект или тип урона${nn}" aria-label="Уязвимый к${nn}">`)}</div>`);
    if (chosen.has('тайное знание')) {
      const syms = [{ v: '', t: '— символ —' }].concat(D.skills.symbols.map(s => ({ v: s.name, t: `${s.name} (${s.req})`, group: cap(s.cat) })).sort((a, b) => a.group.localeCompare(b.group)));
      opts.push(`<div class="opt"><h3>Тайное знание: любой магический символ со старта</h3>${times('тайное знание', (key, i) => select(`traitOpt.${key('secretSymbol', i)}`, syms, to[key('secretSymbol', i)]))}</div>`);
    }
    if (chosen.has('проклят')) opts.push(`<div class="opt"><h3>Проклят: неснимаемое проклятие</h3><p class="muted small">«При получении проклятия кидается 50/50 для верхнего (тёмные дары как проклятие) и нижнего блока (проклятия)».</p>${times('проклят', (key, i, nn) => rollBox(key('curse', i), 'проклятие' + nn, st))}</div>`);
    if (opts.length) html += `<div class="card"><h2>Параметры выбранных черт</h2>${opts.join('')}${dmgDatalist()}</div>`;
    return html;
  }

  // ------------------------------------------------------------ шаг 5: характеристики

  function statsStep(st, res) {
    const race = res.race;
    if (!race) return '<div class="card empty">Сначала выберите расу.</div>';
    if (!res.age) return '<div class="card empty">Сначала выберите возраст — от него зависит количество очков.</div>';
    const pts = res.agePoints, left = pts - res.allocSum;
    const stepSize = +App.ui.allocStep || 1;
    let html = `<div class="alloc-head">
      <p>${pts > 0 ? `Возраст даёт <strong>+${pts}</strong> очков: распределите их по характеристикам.` : pts < 0 ? `Юный возраст забирает <strong>${-pts}</strong> очков: снимите их с характеристик (не ниже 1).` : 'Взрослый: дополнительных очков нет.'}</p>
      ${pts ? `<p class="left ${left ? 'attn' : 'done'}">${left ? `Осталось: ${signed(left)}` : 'Все очки распределены'}</p>` : ''}
      ${Math.abs(pts) > 10 ? `<label class="inline">Шаг кнопок ${select(null, [1, 5, 10, 25, 50].map(n => ({ v: n, t: n })), stepSize, 'data-ui="allocStep"')}</label>` : ''}
      ${pts ? '<button type="button" class="btn ghost" data-act="allocEven">Поровну</button><button type="button" class="btn ghost" data-act="allocReset">Сбросить</button>' : ''}
    </div>`;
    html += `<table class="alloc"><thead><tr><th>Характеристика</th><th>Раса</th><th>Очки возраста</th><th>Модификаторы</th><th>Итог</th></tr></thead><tbody>`;
    R.STATS.forEach(k => {
      const base = res.baseStats[k];
      const a = +res.alloc[k] || 0;
      const fin = res.stats[k];
      const mods = res.statBreak[k].slice(1).filter(x => x.src !== 'очки возраста');
      const modSum = fin - base - a;
      const min = pts >= 0 ? 0 : Math.min(0, 1 - base);
      const max = pts >= 0 ? a + Math.max(0, left) : 0;
      html += `<tr><th scope="row">${R.STAT_NAMES[k]}</th><td>${fmt(base)}</td>
        <td>${pts ? stepper('alloc.' + k, a, { min, max, step: stepSize, label: R.STAT_NAMES[k] }) : '—'}</td>
        <td>${mods.length ? `<details><summary>${signed(modSum)}</summary><ul>${mods.map(m => `<li>${esc(m.src)}: ${m.op.startsWith('×') || m.op === '⇄' || m.op === '↑' ? esc(m.op) + ' ' : ''}${signed(m.v)}</li>`).join('')}</ul></details>` : '<span class="muted">нет</span>'}</td>
        <td class="fin">${fmt(fin)}</td></tr>`;
    });
    html += '</tbody></table>';
    html += derivedBlock(res);
    return html;
  }

  function derivedBlock(res) {
    const d = res.der;
    const item = (t, v, src, note) => `<div class="der"><dt>${t}</dt><dd>${v}</dd>${src ? `<p class="muted small">${esc(src)}</p>` : ''}${note ? `<p class="small">${note}</p>` : ''}</div>`;
    return `<h2 class="h-sec">Производные параметры</h2><dl class="der-grid">
      ${item('ХП', fmt(d.hp), (res.boon && res.boon.fx.void ? '«пустотный»: ХП = дух' : 'тело × 2') + (res.race && res.race.ancestor && res.race.ancestor.fx && res.race.ancestor.fx.hp ? ` + ${res.race.ancestor.fx.hp} (предок)` : ''))}
      ${item('Живость', d.viv === null ? '—' : fmt(d.viv), d.viv === null ? 'не нужно есть и спать' : 'тело × 1 (живость = голод)')}
      ${item('Реген ХП', fmt(d.hpRegen), d.hpRegenSrc.join(', '))}
      ${d.vamp ? item('Вампиризм', d.vamp + '%', d.vampSrc) : ''}
      ${item('МП', fmt(d.mp), 'дух × 2')}
      ${item('Пси', fmt(d.psi), 'дух × 2')}
      ${item('Реген МП', fmt(d.mpRegen), d.mpRegenSrc.join(', '))}
      ${item('ОД', signed(d.od), d.odSrc.join(', '), d.odCond.length ? 'Условно: ' + esc(d.odCond.map(f => signed(f.v)).join(', ')) + ' (в воде / на суше и т.п.)' : '')}
      ${item('Уворот', fmt(d.dodge), 'ловкость − штраф брони ± материал')}
      ${item('Слоты', `${fmt(d.slotsUsed)} / ${fmt(d.slots)}`, 'сила + сумки; занято снаряжением')}
      ${item('Зоркость', fmt(d.zor), 'база 50 + талант + бонусы')}
      ${item('Харизма', fmt(d.charisma), 'талант + бонусы; 0,5% скидки за очко')}
      ${item('Привлекательность', signed(d.attr), d.attrSrc.join(', ') || 'нет модификаторов', '±25 от характера НПС, ±25 за мировоззрение, +15 своя раса, +10 религия, +10 фракция')}
      ${item('Карма', signed(d.karma), R.KARMA_TEXT)}
      ${item('Молитвы в день', d.prayers, d.prayersSrc.join(', '))}
      ${item('Ячейки заклинаний', d.spellSlots, d.spellSlotsSrc.join(', '))}
      ${item('Размер', res.size ? res.size.name : '—', res.size ? `${res.size.fx}; сырьё ${res.size.mat}${res.sizeMods.length ? '; ' + res.sizeMods.join(', ') : ''}${res.flags.noSizeDebuff ? '; нет дебафа от роста' : ''}` : '')}
    </dl>`;
  }

  // ------------------------------------------------------------ шаг 6: таланты

  function talentsStep(st, res) {
    if (!res.race || !res.age) return '<div class="card empty">Сначала выберите расу и возраст.</div>';
    const left = res.talentPoints - res.talentSpent;
    let html = `<div class="alloc-head"><p>«За каждые 5 имеющихся уровней персонаж получает 1 очко таланта»: ⌊${fmt(res.level)} / 5⌋ = <strong>${res.talentPoints}</strong>.</p>
      <p class="left ${left ? 'attn' : 'done'}">${left > 0 ? `Осталось: ${left}` : left < 0 ? `Перерасход: ${-left}` : 'Все очки распределены'}</p></div>`;
    html += '<table class="alloc talents"><thead><tr><th>Талант</th><th>Вложено</th><th>Бонусы</th><th>Итог / предел</th><th>Что даёт</th></tr></thead><tbody>';
    R.TALENTS.forEach(t => {
      const v = res.talents[t.id];
      const p = (D.skills.talentInfo || []).find(x => x.name === t.id);
      const max = Math.min(v.maxInv, v.inv + Math.max(0, left));
      html += `<tr class="${v.blocked ? 'blocked' : ''}"><th scope="row">${t.name}${t.base ? ` <span class="muted small">(база ${t.base})</span>` : ''}</th>
        <td>${v.blocked ? '<span class="muted">запрещено «Ярким оком»</span>' : stepper(`talents.${t.id}`, v.inv, { min: 0, max, label: t.name })}</td>
        <td>${v.bsrc.length ? esc(v.bsrc.join(', ')) : '<span class="muted">—</span>'}</td>
        <td class="fin">${fmt(v.total)} ${v.sepBase ? `<span class="muted small">(${v.base} база + ${fmt(v.inv)} вложено${v.bonus ? ` ${signed(v.bonus)} бонусы` : ''}; вложить до ${t.max})</span>` : `<span class="muted">/ ${t.max}</span>`}</td>
        <td class="small">${esc(p ? p.effect : '')}${p && p.chance && /сотом/i.test(p.chance) ? `<br><span class="muted">${esc(p.chance)}</span>` : ''}</td></tr>`;
    });
    html += '</tbody></table>';
    const passives = (res.race.fx || []).filter(f => f.k === 'passive');
    if (passives.length) html += `<p class="note">Расовые пассивные навыки вне талантов: ${esc(passives.map(f => `${f.id} +${f.v}${f.half ? ' (½)' : ''}`).join(', '))}.</p>`;
    html += '<p class="muted small">Остальные пассивные навыки (алхимия, кузнечество, следопытство…) на старте не выбираются — их изучают уже в игре.</p>';
    return html;
  }

  // ------------------------------------------------------------ шаг 7: снаряжение

  function gearStep(st, res) {
    if (!res.race) return '<div class="card empty">Сначала выберите расу — размер влияет на количество материала и параметры предметов.</div>';
    const flags = res.flags, g = res.gear;
    let html = `<p class="note">«Игроки могут взять одно оружие и один элемент брони из ограниченного списка / так же 3 разных предмета (сумки / зелья / еда) и прочие мелочи, зелья не сильнее 50е». «Оружие и броня не могут быть кастомными, а только монолитными из одного вида материала».</p>`;
    if (flags.noStartGear) html += `<p class="issue err">${esc(res.race.name)}: «на начале не могут взять экипировку» — этап пропускается.</p>`;
    const size = res.size;
    if (size && size.k !== 1) html += `<p class="muted small">Размер «${esc(size.name.toLowerCase())}»: сырья ${esc(size.mat)} — единицы материала, влияющие на урон, и единицы брони умножаются на ${fmt(size.k)} и округляются до целого. Требования предметов — как в таблице.</p>`;
    const mats = C.START_MATERIALS.map(n => R.index.material.get(norm(n))).filter(Boolean);
    const matOpts = kind => [{ v: '', t: '— материал —' }].concat(mats.map(m => ({ v: m.name, t: `${m.name} — ${kind === 'w' ? 'урон' : 'броня'} ${m[kind === 'w' ? 'dmg' : 'arm']}/ед.` })));
    // Оружие
    const groups = { 'ближний бой': 'Ближний бой', 'стрелковое': 'Стрелковое', 'магическое': 'Магическое (сфера, гримуар, жезл, посох)', 'молитвенное': 'Молитвенное', 'инструмент': 'Инструменты', 'снаряды': 'Метательное (расходник)' };
    const wOpts = [{ v: '', t: '— без оружия —' }].concat(D.gear.weapons.filter(w => !R.NOT_WEAPON.includes(w.name)).map(w => ({ v: w.name, t: `${w.name} (${w.u}+${w.un} ед., ${w.reqRaw})`, group: groups[w.group] || w.group })));
    html += `<div class="two-col gear"><section class="card"><h2>Оружие</h2>${flags.noWeapon ? `<p class="issue err">${esc(res.race.name)}: «не могут держать в руках оружия и инструменты».</p>` : ''}
      <div class="form-grid"><label>Тип ${select('weapon.name', wOpts, st.weapon.name)}</label><label>Материал ${select('weapon.mat', matOpts('w'), st.weapon.mat)}</label></div>
      ${g.weapon ? weaponCard(g.weapon, res) : ''}`;
    if (g.weapon && Object.values(R.AMMO).some(list => list.includes(g.weapon.w.name))) {
      const am = Object.keys(R.AMMO).filter(a => R.AMMO[a].includes(g.weapon.w.name));
      html += `<h3>Боеприпасы <span class="muted small">(«прочие мелочи»)</span></h3><div class="form-grid"><label>Набор ${select('ammo.name', [{ v: '', t: '— нет —' }].concat(am.map(a => ({ v: a, t: a }))), st.ammo.name)}</label><label>Материал ${select('ammo.mat', matOpts('w'), st.ammo.mat)}</label></div>
        ${g.ammo ? `<p class="small">${esc(g.ammo.a.name)}: урон ${g.ammo.damage === null ? '—' : fmt(g.ammo.damage)}${g.ammo.m ? ` (${g.ammo.m.dmg} × ${fmt(g.ammo.units)} ед.)` : ''}, ${esc(g.ammo.a.fx)}</p>` : ''}`;
    }
    html += '</section>';
    // Броня
    const aOpts = [{ v: '', t: '— без брони —' }];
    D.gear.armor.forEach(a => aOpts.push({ v: a.name, t: `${a.name} (${a.u} ед., ${a.reqRaw}, штраф ловк. ${a.pen})`, group: { 'лёгкая': 'Лёгкая', 'средняя': 'Средняя', 'тяжёлая': 'Тяжёлая', 'джаггернаут': 'Джаггернаутская', 'одежда': 'Одежда' }[a.cls] }));
    D.gear.shields.filter(s => !s.upgrade).forEach(s => aOpts.push({ v: s.name, t: `${s.name} (${s.u} ед., ${s.reqRaw}, штраф ловк. ${s.pen})`, group: 'Щиты' }));
    html += `<section class="card"><h2>Элемент брони</h2>
      <div class="form-grid"><label>Тип ${select('armor.name', aOpts, st.armor.name)}</label><label>Материал ${select('armor.mat', matOpts('a'), st.armor.mat)}</label></div>
      ${g.armor ? armorCard(g.armor, res) : ''}</section></div>`;
    // Предметы
    html += `<section class="card"><h2>Предметы: до ${C.START_ITEMS}, разные</h2><div class="items">`;
    for (let i = 0; i < C.START_ITEMS; i++) html += itemSlot(st, i);
    html += `</div>
      <label>Прочие мелочи <textarea data-bind="misc" rows="2" placeholder="Верёвка, огниво, фляга…">${esc(st.misc)}</textarea></label></section>`;
    html += `<p class="small">Слоты инвентаря: занято ${fmt(res.der.slotsUsed)} из ${fmt(res.der.slots)} (сила ${fmt(res.stats.s)}${g.bagSlots ? ` + сумки ${g.bagSlots}` : ''}). Рук: ${res.hands}.</p>`;
    return html;
  }

  function effectLine(e, label) {
    if (!e) return '';
    let s = `<li><b>${label}:</b> ${esc(e.text)} <span class="tag sc">${esc(e.scale)}</span>`;
    if (e.units !== undefined) s += e.total ? ` → <strong>${esc(e.total)}</strong> <span class="muted">(× ${fmt(e.units)} ед.)</span>` : ` <span class="muted">(× ${fmt(e.units)} ед.)</span>`;
    return s + '</li>';
  }

  function reqList(req) {
    if (!req.length) return 'нет';
    return req.map(x => `<span class="${x.ok ? 'req-ok' : 'req-bad'}">${R.STAT_SHORT[x.stat]} ${x.need} (у вас ${fmt(x.have)})</span>`).join(', ');
  }

  function weaponCard(w, res) {
    const k = w.k;
    return `<dl class="kv-list compact">
      ${kv('Материал', w.m ? `${esc(w.m.name)}: ${w.m.dmg} урона за ед.` : '—')}
      ${kv('Единиц материала', `всего <strong>${fmt(w.unitsTotal)}</strong>: ${fmt(w.units)} влияют на урон${k !== 1 ? ` <span class="muted">(${fmt(w.w.u)} × ${fmt(k)} = ${fmt(Math.round(w.w.u * k * 100) / 100)} → ${fmt(w.units)})</span>` : ''} + ${fmt(w.unitsNon)} не влияют`)}
      ${kv('Урон', w.damage !== undefined ? `<strong>${fmt(w.damageTotal)}</strong>${w.mul ? ` <span class="muted">(×${w.mul.v} — ${esc(w.mul.src)})</span>` : ''}${w.bonus.length ? ` <span class="muted">(${fmt(w.damage)} ${w.bonus.map(b => `${b.kind === 'урон' ? '+' + b.v : ''} ${b.kind === 'урон' ? esc(b.src) : ''}`).join(' ')})</span>` : ''}` : '—')}
      ${w.bonus.filter(b => b.kind === 'точность').map(b => kv('Точность', `+${b.v} (${esc(b.src)})`)).join('')}
      ${w.armorFromNon !== undefined ? kv('Броня катара', fmt(w.armorFromNon)) : ''}
      ${kv('Тип урона', esc(w.w.dt || '—'))}
      ${kv('Дальность', esc(w.w.range || '—'))}
      ${kv('Требования', reqList(w.req))}
      ${kv('Слоты / руки', `${w.w.slots ?? '—'} / ${w.w.hands ?? '—'}`)}
      ${kv('Ур. навыка (ремесло)', w.w.skill ?? '—')}
    </dl>
    <ul class="fx-list">${w.w.fx ? `<li><b>Свойство:</b> ${esc(w.w.fx)}</li>` : ''}${effectLine(w.matEffect, 'Материал в оружии')}</ul>`;
  }

  function armorCard(a, res) {
    return `<dl class="kv-list compact">
      ${kv('Материал', a.m ? `${esc(a.m.name)}: ${a.m.arm} брони за ед.` : '—')}
      ${kv('Единиц материала', `${fmt(a.units)}${a.k !== 1 ? ` <span class="muted">(${fmt(a.a.u)} × ${fmt(a.k)} → ${fmt(a.units)})</span>` : ''}`)}
      ${kv('Броня', a.armor !== undefined ? `<strong>${fmt(a.armor)}</strong>` : '—')}
      ${kv('Штраф ловкости', `${a.pen}${a.penNote ? ` <span class="muted">(${esc(a.penNote)})</span>` : ''}`)}
      ${kv('Требования', reqList(a.req))}
      ${kv('Слоты', a.a.slots ?? '—')}
      ${kv('Ур. навыка (ремесло)', a.a.skill ?? '—')}
    </dl>
    <ul class="fx-list">${a.a.fx ? `<li>${esc(a.a.fx)}</li>` : ''}${effectLine(a.matEffect, 'Материал в броне')}${a.statFx && (a.statFx.l || a.statFx.hpRegen) ? `<li class="muted">Учтено: ${a.statFx.l ? `ловкость ${signed(a.statFx.l)}` : ''} ${a.statFx.hpRegen ? `реген ХП ${signed(a.statFx.hpRegen)}` : ''}</li>` : ''}</ul>`;
  }

  function itemSlot(st, i) {
    const it = (st.items || [])[i] || {};
    const kinds = [{ v: '', t: '— пусто —' }, { v: 'bag', t: 'Сумка' }, { v: 'potion', t: 'Зелье' }, { v: 'food', t: 'Еда' }];
    let sub = '';
    if (it.kind === 'bag') sub = select(`items.${i}.name`, [{ v: '', t: '— сумка —' }].concat(R.index.bags.map(b => ({ v: b.name, t: `${b.name} (${b.effect})` }))), it.name);
    if (it.kind === 'food') sub = select(`items.${i}.name`, [{ v: '', t: '— блюдо —' }].concat(D.alchemy.food.map(f => ({ v: f.name, t: `${f.name}: ${f.e.join(', ')}` }))), it.name);
    if (it.kind === 'potion') sub = `${select(`items.${i}.effect`, [{ v: '', t: '— эффект —' }].concat(R.POTION_TYPES.map(p => ({ v: p, t: p }))), it.effect)}
      <input type="text" data-bind="items.${i}.note" value="${esc(it.note || '')}" placeholder="уточнение (напр. «огонь»)" aria-label="Уточнение зелья">
      <label class="inline">Сила, е ${stepper(`items.${i}.power`, +it.power || 0, { min: 0, max: C.POTION_MAX, step: 5, label: 'Сила зелья' })}</label>`;
    return `<div class="item-slot"><span class="item-n">${i + 1}</span>${select(`items.${i}.kind`, kinds, it.kind || '', 'data-item-kind')}${sub}</div>`;
  }

  // ------------------------------------------------------------ шаг 8: предыстория

  function storyStep(st) {
    return `<div class="form-grid story">
      <label>Имя персонажа <input type="text" data-bind="name" value="${esc(st.name)}" maxlength="80" autocomplete="off" required></label>
      <label>Игрок <input type="text" data-bind="player" value="${esc(st.player)}" maxlength="80"></label>
      <label>Пол / обращение <input type="text" data-bind="gender" value="${esc(st.gender)}" maxlength="60"></label>
      <label class="wide">Внешность <textarea data-bind="look" rows="3">${esc(st.look)}</textarea></label>
      <label class="wide">Предыстория <textarea data-bind="story" rows="7">${esc(st.story)}</textarea></label>
      <label class="wide">Мотивация <textarea data-bind="motive" rows="3">${esc(st.motive)}</textarea></label>
      <label class="wide">Бонусы за предысторию <span class="muted">(необязательно — их назначает ГМ)</span> <textarea data-bind="gmBonus" rows="3" placeholder="«Можно получить дополнительные бонусы и предметы за предысторию и мотивацию… вплоть до вещей и навыков, которые нигде не прописаны»">${esc(st.gmBonus)}</textarea></label>
    </div>`;
  }

  // ------------------------------------------------------------ регистрация этапов

  App.steps = [
    { id: 'race', title: 'Раса', lead: 'Раса задаёт характеристики, средний уровень, размер и характер. Фракцию и религию персонаж получает уже в игре, выйдя в мир.', render: (st, res) => `<div class="race-step">${raceList(st)}${raceCard(st, res)}</div>` },
    { id: 'age', title: 'Возраст', lead: 'Возраст — это уровень относительно среднего уровня расы. Уровень добавляет или убирает очки характеристик (1 уровень = 3 очка), меняет ОД, очки талантов и число черт.', render: ageStep,
      live(work, res) { const o = work.querySelector('#agePctOut'); if (o) o.textContent = signed(res.agePct) + '%'; const l = work.querySelector('#ageLive'); if (l) l.innerHTML = ageLive(res); } },
    { id: 'boon', title: 'Тёмный дар, благословение или болезнь', short: 'Дар', render: boonStep },
    { id: 'traits', title: 'Черты', render: traitsStep },
    { id: 'stats', title: 'Характеристики', render: statsStep },
    { id: 'talents', title: 'Таланты', render: talentsStep },
    { id: 'gear', title: 'Снаряжение', render: gearStep },
    { id: 'story', title: 'Предыстория', render: storyStep },
    { id: 'summary', title: 'Лист персонажа', short: 'Итог', render: (st, res) => window.Sheet.render(st, res, true) }
  ];

  // ------------------------------------------------------------ действия

  Object.assign(App.actions, {
    pickRace(b) {
      const id = b.dataset.id;
      const st = this.state;
      if (st.raceId === id) return;
      Object.assign(st, { raceId: id, parentA: '', parentB: '', hbAlign: '', hbSize: '', ancestor: '', ancestorAbility: '', oniClan: '', alloc: { t: 0, d: 0, s: 0, i: 0, l: 0 } });
      this.changed();
      if (window.innerWidth < 1060) { const c = document.querySelector('.race-card'); if (c) c.scrollIntoView({ block: 'start' }); }
    },
    pickAge(b) {
      const id = b.dataset.id;
      const st = this.state;
      if (st.ageCat === id) return;
      st.ageCat = id;
      st.agePct = C.AGE_RANGES[id].def;
      st.alloc = { t: 0, d: 0, s: 0, i: 0, l: 0 };
      this.changed();
    },
    boonTab(b) { this.ui.boonTab = b.dataset.id; this.renderCreate(); },
    pickBoon(b) {
      const st = this.state;
      const kind = b.dataset.kind, name = b.dataset.name;
      if (st.boon.kind === kind && st.boon.name === name) { st.boon = { kind: '', name: '' }; }
      else st.boon = { kind, name };
      st.boonOpt = {};
      ['artifact', 'element', 'parts', 'beasts', 'replicantTrait'].forEach(k => { if (st.rolls) delete st.rolls[k]; });
      this.changed();
      const card = document.querySelector('.boon-opts');
      if (card) { const top = card.getBoundingClientRect().top; if (top < 60 || top > window.innerHeight - 120) card.scrollIntoView({ block: 'start' }); }
    },
    toggleTrait(b) {
      const st = this.state;
      const name = b.dataset.name;
      if (st.traits.some(t => norm(t) === norm(name))) dropTrait(st, name, 0);   // убрать все экземпляры
      else st.traits.push(name);
      this.changed();
    },
    traitCount(b) {
      const st = this.state;
      const name = b.dataset.name;
      const n = st.traits.filter(t => norm(t) === norm(name)).length;
      if (+b.dataset.d > 0) st.traits.push(name);
      else dropTrait(st, name, n - 1);
      this.changed();
    },
    inc(b) {
      const path = b.dataset.path;
      const d = parseFloat(b.dataset.d);
      const min = parseFloat(b.dataset.min), max = parseFloat(b.dataset.max);
      const parts = path.split('.');
      let o = this.state;
      for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] = o[parts[i]] || {});
      let v = (+o[parts[parts.length - 1]] || 0) + d;
      if (Number.isFinite(min)) v = Math.max(min, v);
      if (Number.isFinite(max)) v = Math.min(max, v);
      this.set(path, v);
    },
    roll(b) {
      const kind = b.dataset.kind;
      const r = R.roll(kind, this.state);
      if (!r) return;
      const prev = (this.state.rolls || {})[kind];
      this.state.rolls = this.state.rolls || {};
      this.state.rolls[kind] = Object.assign(r, { n: (prev ? prev.n : 0) + 1 });
      this.changed();
    },
    allocReset() { this.state.alloc = { t: 0, d: 0, s: 0, i: 0, l: 0 }; this.changed(); },
    allocEven() {
      const res = this.res;
      const pts = res.agePoints;
      const al = { t: 0, d: 0, s: 0, i: 0, l: 0 };
      if (pts > 0) {
        const each = Math.floor(pts / 5); let rest = pts - each * 5;
        R.STATS.forEach(k => { al[k] = each + (rest-- > 0 ? 1 : 0); });
      } else if (pts < 0) {
        // снимаем пропорционально расовым значениям, оставляя минимум 1
        let need = -pts;
        const base = res.baseStats;
        const total = R.STATS.reduce((a, k) => a + Math.max(0, base[k] - 1), 0);
        R.STATS.forEach(k => { const take = Math.min(Math.floor((base[k] - 1) * (-pts) / total), base[k] - 1); al[k] = -take; need -= take; });
        for (const k of R.STATS) { while (need > 0 && base[k] + al[k] > 1) { al[k]--; need--; } }
      }
      this.state.alloc = al;
      this.changed();
    }
  });

  // оставить у черты keep экземпляров; параметры и броски лишних экземпляров стираются
  function dropTrait(st, name, keep) {
    const k = norm(name);
    let seen = 0;
    st.traits = st.traits.filter(t => norm(t) !== k || ++seen <= keep);
    const opt = { 'резистентный': 'resist', 'уязвимый': 'vuln', 'тайное знание': 'secretSymbol' }[k];
    for (let i = keep; i < 10; i++) {
      if (opt) delete st.traitOpt[R.optKey(opt, i)];
      if (k === 'проклят' && st.rolls) delete st.rolls[R.optKey('curse', i)];
    }
    if (k === 'калека' && !keep) st.traitOpt.arms = st.traitOpt.legs = 0;
  }

  // смена типа предмета сбрасывает его поля
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches && t.matches('select[data-item-kind]')) {
      const m = t.dataset.bind.match(/^items\.(\d+)\.kind$/);
      if (m) {
        const i = +m[1];
        App.state.items = App.state.items || [];
        App.state.items[i] = { kind: t.value, name: '', effect: '', note: '', power: t.value === 'potion' ? C.POTION_MAX : 0 };
        App.changed();
        e.stopImmediatePropagation();
      }
    }
  }, true);
})();
