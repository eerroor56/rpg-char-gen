/* Лист персонажа и страница «Как считается» */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, C = window.GM_CONFIG, D = window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, signed = R.signed, norm = R.norm;

  function sizeName(code) { const s = R.SIZES.find(x => x.id === code); return s ? s.name : code === 'наст' ? 'Настраиваемый' : code; }

  function render(st, res, interactive, opts) {
    opts = opts || {};
    const race = res.race, d = res.der;
    if (!race) return '<div class="card empty">Лист появится, когда будет выбрана раса.</div>';
    const raceTitle = race.isHalf && race.parents && race.parents[0] && race.parents[1]
      ? `полукровка (${race.parents[0].name} и ${race.parents[1].name})` : race.name;
    let html = '';
    if (interactive) {
      const cloud = window.Game ? window.Game.sheetButtons() : '';
      html += `<div class="sheet-actions no-print">${cloud}
        <button type="button" class="btn ${cloud ? '' : 'primary'}" data-act="saveHero">${App.editingId ? 'Сохранить изменения' : 'Сохранить в «Мои герои»'}</button>
        <button type="button" class="btn" data-act="shareLink">Ссылка для ГМ</button>
        <button type="button" class="btn" data-act="exportHero">Скачать файл</button>
        <button type="button" class="btn" data-act="print">Печать / PDF</button>
        <button type="button" class="btn" data-act="exportImage">Скачать картинку</button>
        <button type="button" class="btn ghost" data-act="reset">Новый персонаж</button>
      </div>`;
      html += checks(res);
    }
    const pics = window.App.portrait(race.isHalf && race.parents ? race.parents : [race.base], 'sh-portrait');
    html += `<article class="sheet" id="sheet">
      <header class="sh-head ${pics ? 'has-portrait' : ''}">
        ${pics}
        <div class="sh-title"><h2>${esc(st.name || 'Безымянный герой')}</h2>
        <p>${esc(cap(raceTitle))}, ${res.age ? esc(res.age.title.toLowerCase()) : 'возраст не выбран'}${res.agePct ? ` (${signed(res.agePct)}% от среднего уровня)` : ''}${st.player ? `, игрок: ${esc(st.player)}` : ''}${st.gender ? `, ${esc(st.gender)}` : ''}</p></div>
        <dl class="sh-badges">
          <div><dt>Уровень</dt><dd>${fmt(res.level)}</dd></div>
          <div><dt>ОД в ход</dt><dd>${R.odText(d)}</dd></div>
          <div><dt>Карма</dt><dd>${signed(d.karma)}</dd></div>
        </dl>
      </header>
      <div class="sh-grid">
        <section class="sh-block"><h3>Характеристики</h3>
          <table class="sh-stats"><thead><tr><th></th><th>Раса</th><th>Итог</th></tr></thead><tbody>
          ${R.STATS.map(k => `<tr><th>${R.STAT_NAMES[k]}</th><td>${fmt(res.baseStats[k])}</td><td><strong>${fmt(res.stats[k])}</strong></td></tr>`).join('')}
          </tbody></table>
          <p class="small muted">Характер: ${esc(d.align || '—')}. Размер: ${res.size ? esc(res.size.name.toLowerCase()) : '—'}${res.size && res.size.fx !== 'без эффектов' ? ` (${esc(res.size.fx)})` : ''}. Рук: ${res.hands}.</p>
        </section>
        <section class="sh-block"><h3>Параметры</h3><dl class="sh-der">
          <div><dt>ХП</dt><dd>${fmt(d.hp)}</dd></div><div><dt>Реген ХП</dt><dd>${fmt(d.hpRegen)}</dd></div>
          <div><dt>МП</dt><dd>${fmt(d.mp)}</dd></div><div><dt>Реген МП</dt><dd>${fmt(d.mpRegen)}</dd></div>
          <div><dt>Пси</dt><dd>${fmt(d.psi)}</dd></div><div><dt>Живость</dt><dd>${d.viv === null ? '—' : fmt(d.viv)}</dd></div>
          ${d.vamp ? `<div><dt>Вампиризм</dt><dd>${d.vamp}%</dd></div>` : ''}
          <div><dt>Уворот</dt><dd>${fmt(d.dodge)}</dd></div><div><dt>Слоты</dt><dd>${fmt(d.slotsUsed)} / ${fmt(d.slots)}</dd></div>
          <div><dt>Зоркость</dt><dd>${fmt(d.zor)}</dd></div><div><dt>Харизма</dt><dd>${fmt(d.charisma)}</dd></div>
          <div><dt>Привлекат.</dt><dd>${signed(d.attr)}</dd></div><div><dt>Молитвы</dt><dd>${d.prayers}</dd></div>
          <div><dt>Ячейки закл.</dt><dd>${d.spellSlots}</dd></div><div><dt>Опыт</dt><dd>${d.expPct ? signed(d.expPct) + '%' : '±0%'}${d.expMul !== 1 ? ' ×' + d.expMul : ''}</dd></div>
          ${d.magPct ? `<div><dt>Маг. урон</dt><dd>${signed(d.magPct)}%</dd></div>` : ''}
          ${d.sizeIn || d.sizeOut ? `<div><dt>Урон от размера</dt><dd>получ. ${signed(d.sizeIn)}% / исх. ${signed(d.sizeOut)}%</dd></div>` : ''}
          ${d.gold ? `<div><dt>Золото</dt><dd>${d.gold}</dd></div>` : ''}
          ${d.revive ? `<div><dt>Воскрешения</dt><dd>${d.revive}</dd></div>` : ''}
          ${d.madness ? `<div><dt>Безумие</dt><dd>${d.madness}</dd></div>` : ''}
        </dl></section>
        <section class="sh-block"><h3>Таланты</h3><ul class="sh-list">
          ${R.TALENTS.map(t => { const v = res.talents[t.id]; return v.total ? `<li><span>${t.name}</span><b>${fmt(v.total)}</b></li>` : ''; }).join('') || '<li class="muted">нет</li>'}
        </ul></section>
        <section class="sh-block"><h3>Обитание и символы</h3>
          <p><b>Уровень обитания:</b> ${esc(R.habitatNames(race.habitat).join('; ') || '—')}</p>
          <p><b>Символы:</b> ${res.symbols.length ? res.symbols.map(s => esc(s.name)).join(', ') : 'нет'}</p>
          <p class="small muted">Фракцию и религию персонаж получает в игре, выйдя в мир.</p>
        </section>
        <section class="sh-block wide"><h3>Особенности</h3>
          ${res.age ? `<p><b>Возраст (${esc(res.age.title.toLowerCase())}):</b> ${esc(res.age.buff)}</p>` : ''}
          ${race.bonuses.map(b => `<p><b>Бонус${race.bonuses.length > 1 ? ' (' + esc(b.src) + ')' : ''}${b.freq ? ', ' + esc(b.freq) : ''}:</b> ${esc(b.text)}</p>`).join('')}
          ${race.penalties.map(b => `<p><b>Штраф${race.penalties.length > 1 ? ' (' + esc(b.src) + ')' : ''}:</b> ${esc(b.text)}</p>`).join('')}
          ${ancestorText(race)}
          ${race.id === 'они' && st.oniClan ? `<p><b>Клан:</b> ${esc(st.oniClan)}</p>` : ''}
        </section>
        <section class="sh-block wide"><h3>Дар, черты</h3>
          ${boonText(st, res)}
          ${traitText(st, res)}
        </section>
        ${opts.gearHtml ? `<section class="sh-block wide"><h3>Снаряжение сейчас</h3>${opts.gearHtml}</section>` : `<section class="sh-block wide"><h3>Снаряжение</h3>${gearText(st, res)}</section>`}
        ${st.look || st.story || st.motive || st.gmBonus ? `<section class="sh-block wide"><h3>Предыстория</h3>
          ${st.look ? `<p><b>Внешность:</b> ${esc(st.look)}</p>` : ''}
          ${st.story ? `<p class="pre">${esc(st.story)}</p>` : ''}
          ${st.motive ? `<p><b>Мотивация:</b> ${esc(st.motive)}</p>` : ''}
          ${st.gmBonus ? `<p><b>Бонусы за предысторию (ГМ):</b> ${esc(st.gmBonus)}</p>` : ''}</section>` : ''}
        ${opts.extra || ''}
      </div>
      <footer class="sh-foot small muted">Собрано в «Мастерской героя». ${res.ok ? 'Проверка правил пройдена.' : `Не пройдено проверок: ${res.errors.length}.`}</footer>
    </article>`;
    return html;
  }

  function ancestorText(race) {
    const a = race.ancestor;
    if (!a || a.unknown) return '';
    if (a.companion) {
      const c = a.creature;
      return `${App.entityPic(a.name, 'sh-anc-pic')}<p><b>Призрак-помощник:</b> ${esc(a.name)} — ур. ${fmt(R.roundLevel(c.lvl))}; ${R.STATS.map(k => `${R.STAT_SHORT[k]} ${fmt(c[k])}`).join(', ')}</p>`
        + (a.abilities && a.abilities.length ? `<ul class="small">${a.abilities.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '');
    }
    let t = `${a.race ? '' : App.entityPic(a.name, 'sh-anc-pic')}<p><b>Предок:</b> ${esc(a.name)}${a.add ? ` (+${race.ancestorRule.pct}% статов)` : ''}${a.symbol ? `, знак рода: ${esc(a.symbol)}` : ''}${a.demon ? `, стартовый магический символ: ${esc(a.element || 'не задан')}` : ''}${a.race ? ' (половина бонуса расы)' : ''}</p>`;
    const list = race.ancestorRule.kind === 'monster' ? (a.picked ? [a.picked] : []) : (a.abilities || []);
    if (list.length) t += `<p class="small"><b>${race.ancestorRule.kind === 'dragon' ? 'Навыки предка (50% мощности)' : race.ancestorRule.kind === 'monster' ? 'Умение монстра' : 'Навыки предка'}:</b></p><ul class="small">${list.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>`;
    return t;
  }

  function boonText(st, res) {
    const b = res.boon;
    if (!b) return '<p><b>Дар / благословение / болезнь:</b> нет</p>';
    const kind = { gift: 'Тёмный дар', buff: 'Благословение', disease: 'Врождённая болезнь' }[b.kind];
    const src = b.src;
    let t = `<p><b>${kind}: ${esc(cap(src.name))}</b> — ${esc(b.kind === 'gift' ? `${src.bonus} / цена: ${src.debuff}` : b.kind === 'buff' ? src.effect : `${src.e1} / ${src.e2}`)}</p>`;
    const o = st.boonOpt || {};
    const extra = [];
    if (o.swapA && o.swapB) extra.push(`меняются местами: ${R.STAT_NAMES[o.swapA]} и ${R.STAT_NAMES[o.swapB]}`);
    if (o.otherRace) { const r = R.index.race.get(o.otherRace); if (r) extra.push(`бонусы расы «${r.name}»: ${r.bonus}; удвоенный штраф: ${r.penalty}`); }
    if (o.word) extra.push(`отрицаемое слово: «${o.word}»`);
    if (o.immunity) extra.push(`иммунитет к: ${o.immunity}`);
    if (o.prevSkill) extra.push(`физ. навык: ${o.prevSkill}`);
    if (o.prevSymbol) extra.push(`символ: ${o.prevSymbol}`);
    if (o.prevStance) extra.push(`стойка: ${o.prevStance}`);
    ['artifact', 'element', 'parts', 'beasts', 'replicantTrait'].forEach(k => { const r = R.rollView((st.rolls || {})[k]); if (r) extra.push(`бросок: ${r.v}${r.detail ? ' — ' + r.detail : ''}${r.n > 1 ? ` (бросков: ${r.n})` : ''}`); });
    if (extra.length) t += `<ul class="small">${extra.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return t;
  }

  function traitText(st, res) {
    const ti = res.traits;
    const info = k => R.index.traitPos.get(k) || R.index.traitNeg.get(k) || { name: k, effect: '' };
    const to = st.traitOpt || {};
    const list = (base, n) => Array.from({ length: n }, (_, i) => to[R.optKey(base, i)]).filter(Boolean);
    const extra = (k, n) => {
      if (k === 'калека') return ` (убрано: рук ${to.arms || 0}, ног ${to.legs || 0})`;
      if (k === 'резистентный' && list('resist', n).length) return ` (${list('resist', n).join(', ')})`;
      if (k === 'уязвимый' && list('vuln', n).length) return ` (${list('vuln', n).join(', ')})`;
      if (k === 'тайное знание' && list('secretSymbol', n).length) return ` (${list('secretSymbol', n).join(', ')})`;
      if (k === 'проклят') {
        const rolls = Array.from({ length: n }, (_, i) => (st.rolls || {})[R.optKey('curse', i)]).filter(Boolean);
        if (rolls.length) return ` (${rolls.map(r => `${r.v}, ${r.block}${r.n > 1 ? `, бросков: ${r.n}` : ''}`).join('; ')})`;
      }
      return '';
    };
    const line = (arr, label) => {
      if (!arr.length) return '';
      const uniq = [...new Set(arr)];
      return `<p><b>${label}:</b></p><ul class="small">${uniq.map(k => {
        const n = arr.filter(x => x === k).length, t = info(k);
        return `<li><b>${esc(cap(t.name.trim()))}${n > 1 ? ` ×${n}` : ''}</b>${esc(extra(k, n))} — ${esc(t.effect)}</li>`;
      }).join('')}</ul>`;
    };
    return (line(ti.pos, 'Положительные черты') + line(ti.neg, 'Отрицательные черты')) || '<p><b>Черты:</b> нет</p>';
  }

  function gearText(st, res) {
    const g = res.gear;
    const parts = [];
    if (g.weapon) {
      const w = g.weapon;
      parts.push(`<p><b>Оружие:</b> ${esc(w.w.name)} из материала «${esc(w.m ? w.m.name : '—')}» — урон ${w.damageTotal !== undefined ? fmt(w.damageTotal) : '—'}, ${esc(w.w.dt || '')}${w.w.range ? ', дальность ' + esc(w.w.range) : ''}${w.matEffect ? `; материал: ${esc(w.matEffect.total || w.matEffect.text)}` : ''}${w.w.fx ? `; ${esc(w.w.fx)}` : ''}</p>`);
    }
    if (g.ammo) parts.push(`<p><b>Боеприпасы:</b> ${esc(g.ammo.a.name)}${g.ammo.m ? ` (${esc(g.ammo.m.name)}, урон ${fmt(g.ammo.damage)})` : ''}</p>`);
    if (g.armor) {
      const a = g.armor;
      parts.push(`<p><b>Броня:</b> ${esc(a.a.name)} из материала «${esc(a.m ? a.m.name : '—')}» — броня ${a.armor !== undefined ? fmt(a.armor) : '—'}, штраф ловкости ${a.pen}${a.matEffect ? `; материал: ${esc(a.matEffect.total || a.matEffect.text)}` : ''}</p>`);
    }
    if (g.items.length) parts.push(`<p><b>Предметы:</b> ${g.items.map(i => esc(i.label)).join('; ')}</p>`);
    if (st.misc) parts.push(`<p><b>Прочее:</b> ${esc(st.misc)}</p>`);
    return parts.join('') || '<p class="muted">Без снаряжения.</p>';
  }

  function checks(res) {
    const errs = res.errors, warns = res.warnings, notes = res.notes;
    const stepTitle = id => (App.steps.find(s => s.id === id) || {}).short || (App.steps.find(s => s.id === id) || {}).title || id;
    return `<div class="checks no-print ${errs.length ? 'bad' : 'good'}">
      <h2>${errs.length ? `Персонаж не готов: ${errs.length} ${App.plural(errs.length, 'ошибка', 'ошибки', 'ошибок')}` : 'Персонаж собран по правилам'}</h2>
      ${errs.length ? `<ul>${errs.map(e => `<li class="err"><button type="button" class="linklike" data-act="go" data-step="${e.step}">${esc(stepTitle(e.step))}</button>: ${esc(e.msg)}</li>`).join('')}</ul>` : ''}
      ${warns.length ? `<h3>Замечания</h3><ul>${warns.map(e => `<li class="warn"><button type="button" class="linklike" data-act="go" data-step="${e.step}">${esc(stepTitle(e.step))}</button>: ${esc(e.msg)}</li>`).join('')}</ul>` : ''}
      ${notes.length ? `<h3>Для ГМ</h3><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------ «Как считается»

  function renderRules(el) {
    const ages = R.AGES.map(a => {
      const rg = C.AGE_RANGES[a.id];
      return `<tr><th>${a.title}</th><td>${rg.min === rg.max ? signed(rg.min) + '%' : `${signed(rg.min)}% … ${signed(rg.max)}%`}</td><td>${signed(a.od)}</td><td>${a.traits}</td><td>${esc(a.buff)}</td></tr>`;
    }).join('');
    const sizes = R.SIZES.map(s => `<tr><th>${s.name}</th><td>×${fmt(s.k)}</td><td>${signed(s.od)}</td><td>${esc(s.fx)}</td></tr>`).join('');
    el.innerHTML = `<div class="page">
      <h1>Как считается персонаж</h1>
      <p class="lead">Правила взяты из таблицы игрока (лист «настройка персонажа») и книги ГМ. Там, где таблица допускает два прочтения, указано, какое выбрано; значения без однозначного источника задал ГМ — они собраны в таблице «Настройки ГМ» внизу страницы.</p>

      <p class="note">Все итоговые числа целые: характеристики, уровни, реген, урон, броня, проценты эффектов. Округление — до ближайшего целого, 0,5 — вверх.</p>

      <h2>1. Раса</h2>
      <ul>
        <li>Характеристики, характер, размер и уровень обитания — лист «Расы». Средний уровень расы = (тело + дух + сила + интеллект + ловкость − 25) / 3 (формула из книги ГМ), округляется до целого (0,5 — вверх). Все уровни на сайте целые.</li>
        <li>Расы с ♥ доступны только эволюцией, с ♠ — не игровые: при создании их выбрать нельзя, они есть в справочнике.</li>
        <li>Полукровка: характеристики — среднее двух родительских рас; числовые бонусы и штрафы родителей делятся пополам (с округлением к нулю); привлекательность −20; размер выбирается из размеров родителей, характер — свободно («настраиваемый»). Особые запреты родителей (например, «не могут держать оружие») у полукровки не применяются автоматически, а выводятся как замечание для ГМ.</li>
        ${D.races.some(r => r.bonusFreq) ? `<li>Цвет бонуса в книге ГМ показывает частоту: ${esc(D.raceLegend.freq.join(', '))} — это выводится рядом с бонусом.</li>` : ''}
        <li>Числовые части бонусов и штрафов (ОД, харизма, таланты, зоркость, привлекательность, реген, бонус к оружию, символы) разобраны и учитываются. Условные эффекты («ночью», «в воде», «за союзника»…) только показываются.</li>
        <li>Дракониды: дракон-предок из раздела «Драконы» листа «Существа»; +10% его статов, знак рода — его символ, размер — на ступень меньше предка; навыки предка — на 50% мощности (числа в описании делятся пополам). Из навыков считаются: регенерация (отдельным множителем поверх остальных процентов: «200% регенерация» → +100%, реген ×2), вампиризм, ОД, прибавки к регену ХП и МП; остальное выводится текстом на листе. Таррэ: монстр-предок, +10% статов и одно выбранное умение монстра в полную силу. Тифлинги: демонический предок — один из восьми демонов листа «Социум» (Diarkon, Roara, Xoria, Grando, Losis, Horgen, Gilltarro, Estar). Асимару: бог-покровитель — один из десяти богов (сетос, Ульмар, Артицал, калиго, виридис, волатур, иктум, иссар, ашур, Велбаса). Каждый бог и демон привязан к своему символу — это стартовый магический символ персонажа; дары религии при создании не даются. Связь бога или демона с символом в таблицах не записана — её задал ГМ (таблица настроек ниже). Скордиты: насекомое-предок из пауков и существ с хитином / инсекто-мясом; размер бонуса в таблице не указан, поэтому предок только отображается. Эноши: зверо-предок — одна из звериных рас, от неё берётся половина бонуса.</li>
        <li>Они: клан определяет символ и оружие клана (+50); демон-покровитель предлагается по стихии клана.</li>
      </ul>

      <h2>2. Возраст и очки</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Возраст</th><th>От среднего уровня</th><th>ОД</th><th>Черт каждого типа</th><th>Эффект</th></tr></thead><tbody>${ages}</tbody></table></div>
      <ul>
        <li>Уровень персонажа = средний уровень расы × (1 + процент), округлённый до целого. За уровень — 3 очка характеристик (лист «механики»), поэтому возраст даёт 3 × (уровень персонажа − средний уровень) очков. Пример: уровень 100, старец +100% → уровень 200, +300 очков, всего 600.</li>
        <li>При отрицательном проценте (ребёнок, юный) очки снимаются с характеристик; ни одна не может стать меньше 1.</li>
        <li>Очки талантов = ⌊уровень / 5⌋ («за каждые 5 имеющихся уровней — 1 очко таланта»).</li>
        <li>Пожилой — ровно ${signed(C.AGE_RANGES['пожилой'].min)}%, старец — ровно ${signed(C.AGE_RANGES['старец'].min)}% (это верхняя граница возраста). Взрослый — ровно средний уровень. Ребёнок и юный выбирают процент ползунком в своих границах.</li>
      </ul>

      <p class="note">Фракция и религия со старта не выдаются: их персонаж получает уже в игре, выйдя в мир. Поэтому их бонусы в создании не участвуют.</p>

      <h2>3. Дар, благословение или болезнь</h2>
      <ul>
        <li>Из всей колонки — тёмные дары, благословения, болезни — можно взять только одно или ничего.</li>
        <li>Благословения и болезни на старте — только врождённые (♥). Гомункулам нельзя благословения, болезни, проклятие и снаряжение.</li>
        <li>В расчёте: «Весы» (обмен двух итоговых характеристик), «Нежить» (сила ×3, тело ×2, интеллект и дух ÷2), «Пустотный» (ХП = дух, нет живости), «Скорость» (+3 ОД, опыт ×2), «Смертельная одержимость» (−1 ОД), «Яркое око» (+50 зоркости, скрытность запрещена), «Угольное зрение» (−40 зоркости), «Антимагия» (0 ячеек), «Священное очищение» (нет регена ХП), «Лазурный фимиам» (реген МП ×2), «Могущество» (+25% ко всем статам), «Любим маной» (реген МП ×4), «Любимое дитя» (+10 молитв), «Наследство» (25 золотых), болезни «Кости-хрящи», «Полицефалия», «Гигантизм», «Карликовость».</li>
        <li>«Предыдущий опыт»: 1 физический навык, 1 магический символ (обычный или порицаемый, не запретный), 1 стойка и +1 положительная черта.</li>
        <li>Случайные эффекты бросаются кнопкой, число бросков сохраняется в листе: «Расхититель древностей» (артефакт — обычный или проклятый), «Проводник стихии» (символ), «Длань» (1–3), «Альфа бестиа» (2–4), «Репликант» без штрафа у выбранной расы (негативная черта), «Проклят» (50/50 — тёмный дар как проклятие или проклятие из нижнего блока).</li>
      </ul>

      <h2>4. Черты</h2>
      <ul>
        <li>Лимит каждого типа — по возрасту (ребёнку черты нельзя). Каждая положительная черта уравновешивается отрицательной.</li>
        <li>«Немота» и «обычный» уравновешивают 2 положительных, «проклят» — 3, «калека» — 2 за каждую убранную конечность; лишние положительные расширяют и лимит. Гомункулы — ещё 3 свободных, «Предыдущий опыт» — ещё 1.</li>
        <li>Черты можно брать повторно — эффекты складываются (например, «сильный» ×2 = +20 силы), каждый экземпляр считается в лимите и балансе отдельно. Не повторяются черты-состояния: ${esc(['язык зверей', 'язык монстров', 'шаманизм', 'лидер', 'немота', 'калека', 'обычный', 'несобранный'].join(', '))}. У «резистентного», «уязвимого», «тайного знания» и «проклят» параметр или бросок — на каждый экземпляр.</li>
        <li>Противоположные черты (сильный/слабый, быстрые/медленные рефлексы, красота/уродство…) взять вместе нельзя. Убранные руки уменьшают число рук для оружия.</li>
        <li>Если отрицательных больше, чем нужно для баланса, выводится замечание (не ошибка).</li>
      </ul>

      <h2>5. Производные параметры</h2>
      <ul>
        <li>ХП = тело × 2; живость = тело; реген ХП = ⌊тело / 5⌋; МП = дух × 2; пси = дух × 2; реген МП = ⌊дух / 5⌋. Ребёнку +20% к регенерации; черты ±5%.</li>
        <li>Слоты = сила + сумки; каждый предмет занимает 1 слот (сумки места не занимают). Колонка «слоты» в таблице оружия и брони — это гнёзда для драгоценных камней. Требования вида «2л, 25с / 13»: до дроби — характеристики, чтобы пользоваться предметом, после — уровень навыка «ремесло», чтобы игрок изготовил предмет сам (на выданные ГМ и стартовые предметы не влияет). Уворот = ловкость − штраф ловкости брони ± эффекты материала.</li>
        <li>ОД в ход = ${C.BASE_OD_TURN} + модификаторы (возраст, размер, раса, черты, дар). На листе так и пишется: «${C.BASE_OD_TURN} + 1», «${C.BASE_OD_TURN} − 2». Общий запас ОД на игровой день (30) ведёт ГМ.</li>
        <li>Зоркость = 50 (база) + вложенные очки таланта + бонусы (раса, черты, дары). База и бонусы считаются отдельно от прокачки: предел 100 — только у вложенных очков, общего предела у зоркости нет. Харизма = талант + бонусы; привлекательность в пределах ±100; карма: добро +20, зло −20, остальные 0.</li>
        <li>Молитвы: 3 в день + бонусы (верующий, любимое дитя, асимару, Иссар, розарий +8, молитвенник +20). Ячейки заклинаний: 5 + хорошая/плохая память ±2, гильдия магов +5, гримуар +20; «обычный» и «Антимагия» обнуляют.</li>
      </ul>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Размер</th><th>Единицы материала</th><th>ОД</th><th>Урон</th></tr></thead><tbody>${sizes}</tbody></table></div>

      <h2>6. Снаряжение</h2>
      <ul>
        <li>Одно оружие и один элемент брони (или щит), монолитные из одного материала стартового списка: ${esc(C.START_MATERIALS.join(', '))}.</li>
        <li>Урон = урон материала за единицу × единицы, влияющие на урон; броня = броня материала × единицы. Размер умножает единицы, влияющие на урон, и единицы брони на свой процент с округлением до целого (длинный лук у гигантского: 6 × 1,4 = 8,4 → 8 ед.); единицы, не влияющие на урон, — как в таблице. Требования предметов меняются на тот же процент с округлением вверх (ужасающий лук у гигантского: ловкость 25 × 1,4 = 35, сила 35 × 1,4 = 49). Баситины: одноручные мечи — урон ×2.</li>
        <li>Эффект материала с пометкой «за единицу» умножается на общее число единиц предмета (у оружия — все единицы: и влияющие на урон, и остальные; длинный лук из стали у гигантского: 8 + 3 = 11 ед. × «5% оглушить» = 55%); «за предмет», «для каждого предмета отдельно», «не стакается» — как в легенде листа материалов. Ловкость и реген ХП из эффектов брони учитываются в параметрах.</li>
        <li>Требования предмета не запрещают его взять, но выводится штраф: ${esc(['сила −50% урона', 'тело −2 ОД', 'ловкость 50% нанести урон себе', 'интеллект — шанс наложить заклинание на себя', 'дух 50% потерять 25% пси'].join('; '))}.</li>
        <li>Магическая ткань — «только лёгкое». До ${C.START_ITEMS} разных предметов: сумки, зелья (не сильнее ${C.POTION_MAX}е), еда из таблицы блюд.</li>
      </ul>

      <h2>7. Развитие после создания</h2>
      <ul>
        <li>Опыт за побеждённое существо равен его уровню (с бонусами персонажа к опыту: черты ±5%, дары). Чтобы перейти с уровня N на N + 1, нужно 100 × N опыта.</li>
        <li>За каждый новый уровень — 3 очка характеристик, на каждом 5-м уровне — очко таланта. Распределяет игрок, ГМ видит результат.</li>
        <li>Лист создания после утверждения ГМ не меняется: развитие идёт поверх него, поэтому всегда видно, каким персонаж был при создании.</li>
        <li>При вступлении в общину (фракцию, гильдию, религию, ковен) сначала даётся только её бонус к характеристикам; остальные дары — по одному за каждые 10 выполненных заданий.</li>
        <li>Карма: на старте — по характеру (добро +20, зло −20), в игре её меняет ГМ во вкладке «Развитие» (±, с пояснением в журнале); предел — ±${C.KARMA_LIMIT}.</li>
        <li>Трактат и свиток параметра: при прочтении ГМ выбирает параметр, прибавка (трактат +25, свиток +10 — лист «разное») навсегда записывается в «Состояния» и сразу идёт в характеристики; уровень от этого не меняется, прочитанный предмет удаляется.</li>
        <li>В «Моих героях» развитие ведёт сам игрок; в кампании (вкладка «Игра») опыт, общины, навыки и предметы выдаёт ГМ, а всё изменённое попадает в журнал с номером сессии.</li>
      </ul>

      <h2>8. Снаряжение, кошелёк и состояния в игре</h2>
      <ul>
        <li>На старте оружие и броня монолитные (лист игрока). В игре предмет собирается из любых слитков и камней по единицам: урон и броня — сумма «урон/броня за ед. × единицы»; у оружия отдельно единицы на урон и остальные. У предмета свой размер — под какой рост он сделан (по умолчанию нормальный): он меняет нужные единицы и требования. Под рост персонажа предмет сам не подстраивается — ГМ может выдать гиганту и маленький нож.</li>
        <li>Эффект материала действует, если его в предмете не меньше ${fmt(C.CRAFT.EFFECT_MIN_UNITS)} слитка (у предметов до 0,5 ед. — ${fmt(C.CRAFT.EFFECT_MIN_SMALL)}); эффект «за единицу» умножается на число единиц этого материала. Мифрил в броне вдвое уменьшает штраф ловкости.</li>
        <li>Напыление даёт эффект металла (на оружие — ${C.CRAFT.COAT_MAX}). Точильный станок и броневой верстак: +${C.CRAFT.SHARPEN_STEP}% урона или защиты за раз, до ${C.CRAFT.SHARPEN_MAX} раз (прибавки складываются: 2 раза = +50%). Усиленное ремесло — 2Х или 3Х, обогатитель — 2Х эффект материала, модели A, D, L, T меняют урон, броню и штраф.</li>
        <li>Зачарование: до ${C.CRAFT.GLYPH_MAX} глифов (сфалерит +2), мощь глифа — ${C.CRAFT.GLYPH_POWER}% атаки (у брони — защиты); таумий 2Х, рунный кристалл 4Х; каждый лишний глиф — ${C.CRAFT.GLYPH_RISK}% шанс разрушить предмет, шанс складывается. Инкрустация камнем даёт его «эффект украшения». Кристальное оружие не имеет гнёзд для модулей.</li>
        <li>Заточённая душа (алтарь демонов, камень душ): +урон или +броня = сумма статов существа. Предмет из монстра (алтарь крови): физ. урон — сила существа, маг. — интеллект; физ. броня — тело, маг. — дух.</li>
        <li>Огнестрел (детали — лист «оружие и броня», колонки «деталь»): корпус определяет, сколько стволов поместится (широкий ствол занимает 2 ячейки, корабельный — только 1 и только в сверхтяжёлом корпусе); дальше ресивер, прицел, обойма (0,1 ед. на патрон, до ${C.GUNS.CLIP_MAX}), модель и патроны. Материал стволов, ресивера и корпуса идёт на урон, прицела и обоймы — нет. Урон по листу «механики»: урон металла пушки, затем модель (пневматика — 50%, магнитно-электронное — ×1,5) и топливо — ингредиент с пометкой «огнестрел» («порох: урон 2х»); эффект металла — как у любого оружия. Патроны урона не добавляют (уточнение ГМ): они дают эффект своего вида (бронебойные — урон сквозь броню и т. п.) и эффект материала. Стволов — столько выстрелов за раз. Требования деталей ${C.GUNS.REQ_SUM ? 'складываются' : 'берутся по наибольшей'}, уровень ремесла — по самой сложной детали. «Не складывается» (${esc(C.GUNS.NO_STACK.join(', '))}): +1 ОД даётся один раз на всё оружие. Рук в таблице нет: малый корпус — одна, остальные — ${C.GUNS.DEFAULT_HANDS} (ГМ может поменять). Патроны можно выдать и отдельно — как боеприпасы.</li>
        <li>Слоты: голова, лицо, амулет, плащ, тело, перчатки, пояс, поножи, ботинки, брошь, руки (сколько у расы; двуручное оружие — две), боеприпасы, 10 колец, 2 браслета (+2 при доп. руках), 6 серёг, нос, 2 брови, 4 протеза. Уворот = ловкость − штраф надетой брони ± эффекты материалов; слоты рюкзака = сила + сумки, каждый предмет (или стопка одинаковых) — 1 слот; камней в предмет — не больше его гнёзд.</li>
        <li>Валюта: ${esc(C.CURRENCIES.map(c => `${c.name} (${c.id})`).join(', '))}; каждая следующая = 100 предыдущих. Кроме монет ГМ может выдать особую валюту (честь и т. п.).</li>
        <li>Проклятия, болезни, тёмные дары, благословения, модификации, черты и статус-эффекты от ГМ: прибавки и множители к статам подставляются из описания («ловкость +20 / −40 тело», «сила 3Х», «дух −2Х» = ÷2) и сразу учитываются в характеристиках; ГМ может их поправить.</li>
      </ul>

      <h2>Настройки ГМ</h2>
      <p class="small muted">Решения ГМ там, где таблицы допускают разные прочтения.</p>
      ${configTable()}
      <h2>Случайный герой</h2>
      <p>Кнопка «Случайный герой» собирает персонажа по этим же правилам: раса (с предком, кланом или покровителем, если нужно), возраст, иногда дар, черты с балансом, очки характеристик и талантов, снаряжение по силам персонажу, имя и завязка истории. «Дополнить случайно» заполняет только то, что ещё не выбрано. Любой шаг можно перебросить отдельно — кнопкой «Случайно» на шаге или на листе; если от него что-то зависит и сломалось (например, очки после смены расы), оно пересоберётся само. Последний случайный бросок можно отменить.</p>

      <h2>Закрытые разделы</h2>
      <p>Бестиарий, навыки, социум, алхимия, артефакты и механики открываются в справочнике только по паролю ГМ; эти разделы зашифрованы. Для создания персонажа пароль не нужен: всё, что требуется мастеру, открыто — предки драконидов, таррэ и скордитов (существа без боссов и легенд: статы и навыки), физические навыки и стойки для «Предыдущего опыта», артефакты для «Расхитителя древностей» (название и эффект). Подробности — дроп, обитание, цены, способы получения — остаются в закрытых разделах.</p>
    </div>`;
  }

  // читаемая таблица настроек вместо «сырого» JSON
  function configTable() {
    const pct = v => signed(v) + '%';
    const ages = R.AGES.map(a => {
      const rg = C.AGE_RANGES[a.id];
      return `${a.title.toLowerCase()}: ${rg.min === rg.max ? pct(rg.min) : `${pct(rg.min)} … ${pct(rg.max)} (по умолчанию ${pct(rg.def)})`}`;
    }).join('<br>');
    const karma = Object.entries(C.KARMA).map(([k, v]) => `${k} ${signed(v)}`).join(', ') + ', остальные ±0';
    const rows = [
      ['Возраст: процент от среднего уровня расы', ages],
      ['Материалы стартового снаряжения', esc(C.START_MATERIALS.join(', '))],
      ['Предел уровня навыка (ремесла) стартовых предметов', C.START_ITEM_MAX_SKILL === null ? 'без ограничения' : esc(C.START_ITEM_MAX_SKILL)],
      ['Стартовых предметов (сумки, зелья, еда)', C.START_ITEMS],
      ['Сила зелий на старте', `не сильнее ${C.POTION_MAX}е`],
      ['Ячеек заклинаний на старте', C.BASE_SPELL_SLOTS],
      ['Молитв в день', C.BASE_PRAYERS],
      ['Базовая зоркость', C.BASE_ZOR],
      ['Предел привлекательности', `±${C.ATTR_LIMIT}`],
      ['Карма по характеру', esc(karma)],
      ['Огнестрел', esc(`эффект «не складывается»: ${C.GUNS.NO_STACK.join(', ')}; без урона: ${C.GUNS.NO_DAMAGE.join(', ')}; требования деталей ${C.GUNS.REQ_SUM ? 'складываются' : 'по наибольшей'}; рук по умолчанию ${C.GUNS.DEFAULT_HANDS}`)],
      ['Кухня, винокурня, зелья', esc(`прибавка опьянения от способа — ${C.BREW.ALCO_METHOD_ONCE ? 'один раз на напиток' : 'за каждый ингредиент'}; вырезки ${C.BREW.CUTS_ARE_INGREDIENTS ? 'считаются' : 'не считаются'} ингредиентами; основа ${C.BREW.BASE_FREE ? 'не занимает' : 'занимает'} место ингредиента`)],
      ['Предел кармы', `±${C.KARMA_LIMIT}`],
      ['Символы богов и демонов (тифлинги, асимару)', esc(Object.entries(C.PATRON_SYMBOLS || {}).map(([k, v]) => `${k} — ${v || 'не задан'}`).join('; '))]
    ];
    return `<div class="tbl-wrap"><table class="tbl cfg-tbl"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------ действия листа

  Object.assign(App.actions, {
    print() { window.print(); },
    exportImage() {
      const run = () => {
        const el = document.getElementById('sheet');
        if (!el || !window.html2canvas) { App.toast('Не удалось подготовить картинку'); return; }
        window.html2canvas(el, { backgroundColor: '#f3ead7', scale: 2 }).then(canvas => {
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/jpeg', 0.92);
          a.download = (App.state.name || 'герой') + '.jpg';
          document.body.appendChild(a); a.click(); a.remove();
        }).catch(() => App.toast('Не удалось подготовить картинку'));
      };
      if (window.html2canvas) return run();
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      sc.onload = run;
      sc.onerror = () => App.toast('Нет доступа к библиотеке картинок — воспользуйтесь «Печать / PDF»');
      document.head.appendChild(sc);
      App.toast('Готовлю картинку…');
    },
    shareLink() {
      const url = location.origin + location.pathname + '#hero=' + App.encode(App.state);
      const done = () => App.toast('Ссылка скопирована — отправьте её ГМ');
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, () => prompt('Скопируйте ссылку:', url));
      else prompt('Скопируйте ссылку:', url);
    },
    exportHero() {
      const name = (App.state.name || 'герой').replace(/[^\wа-яё\- ]/gi, '').trim() || 'герой';
      App.download(`${name}.json`, JSON.stringify({ format: 'hero-workshop', version: 2, hero: App.state }, null, 2));
    }
  });

  window.Sheet = { render, renderRules };
})();
