/*
 * Развитие персонажа после создания (лист «механики»):
 *   «для повышения уровня требуется опыт в 100 раз больше числа текущего уровня»,
 *   «количество опыта за существо = его уровню», «за уровень 3 очка характеристик»,
 *   «каждый 5-й уровень — очко навыков (таланта)»; общины: «сначала только бонус к статам,
 *   остальные дары — по одному за каждые 10 заданий».
 *
 * Запись персонажа (и в браузере, и в облаке):
 *   { state — то, что собрано в мастере,
 *     prog  — что распределяет игрок: { alloc: {t,d,s,i,l}, talents: {id: n} },
 *     gm    — что выдаёт ГМ: { xp, groups, learned, items (инвентарь), invInit, wallet, effects },
 *     equip — что надето: { слот: id предмета } (меняют игрок и ГМ),
 *     notes — заметки игрока и ГМ }
 * Инвентарь, кошелёк и состояния — js/craft.js (расчёты) и js/inventory.js (интерфейс).
 * Панель работает с App.devCtx = { record, perms: {gm, owner}, save(patch, text), log, title, back }.
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, D = window.GAME_DATA;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, signed = R.signed, norm = R.norm;
  const zero = () => ({ t: 0, d: 0, s: 0, i: 0, l: 0 });

  // ------------------------------------------------------------ правила

  // уровни за накопленный опыт: от уровня L до L+1 нужно 100 × L опыта
  function levelsFromXp(start, xp) {
    let L = Math.max(0, Math.floor(start)), x = Math.max(0, Math.floor(+xp || 0)), n = 0;
    while (x >= 100 * Math.max(1, L) && n < 100000) { x -= 100 * Math.max(1, L); L++; n++; }
    return { levels: n, level: L, xpInto: x, need: 100 * Math.max(1, L) };
  }

  function normalize(rec) {
    rec.prog = Object.assign({ alloc: zero(), talents: {} }, rec.prog || {});
    rec.prog.alloc = Object.assign(zero(), rec.prog.alloc || {});
    rec.gm = Object.assign({ xp: 0, groups: [], learned: [], items: [], effects: [] }, rec.gm || {});
    if (!Array.isArray(rec.gm.effects)) rec.gm.effects = [];
    if (typeof rec.notes !== 'string') rec.notes = '';
    return rec;
  }

  // расчёт: сначала лист создания (стартовый уровень), потом развитие поверх
  function compute(rec) {
    normalize(rec);
    const state = App.migrate(rec.state);
    const res0 = R.compute(state);
    const lv = levelsFromXp(res0.level, rec.gm.xp);
    // состояния от ГМ (проклятия, болезни, эффекты) с прибавками и множителями к статам
    const mods = [];
    rec.gm.effects.forEach(e => (e.mods || []).forEach(m => mods.push({ stat: m.stat, op: m.op, v: m.v, src: `${(window.Craft && window.Craft.EFFECT_KINDS[e.kind] || 'эффект').toLowerCase()} «${e.name}»` })));
    const prog = { levels: lv.levels, alloc: rec.prog.alloc, talents: rec.prog.talents, groups: rec.gm.groups, mods };
    const res = R.compute(Object.assign({}, state, { prog }));
    const v = { state, res0, res, lv };
    // инвентарь и экипировка: урон, броня, уворот и слоты считаются по тому, что надето сейчас
    if (window.Craft && res.race) {
      const K = window.Craft;
      v.inv = K.inventoryOf(rec, state, res0);
      v.ctx = { sizeId: res.size ? res.size.id : 'н', craft: res.talents && res.talents['ремесло'] ? res.talents['ремесло'].total : 0, stats: res.stats, halfReq: res.race.id === 'гомункулы', race: res.race, oniClan: state.oniClan, flags: res.flags, creatures: creatures() };
      const eq = K.equipStats(v.inv.items, v.inv.equip, v.ctx, res.hands);
      v.eq = eq;
      const d = res.der;
      d.dodge = R.ri(res.stats.l + eq.statFx.l - eq.pen);
      d.slots = res.stats.s + eq.bagSlots;
      d.slotsUsed = eq.slotsUsed;
      const dReg = eq.statFx.hpRegen - ((res.gear && res.gear.hpRegenMod) || 0);
      if (dReg) { d.hpRegen = Math.max(0, d.hpRegen + dReg); (d.hpRegenSrc || []).push(`надетая броня ${signed(dReg)}`); }
      d.armor = eq.armor; d.magicArmor = eq.magicArmor;
    }
    return v;
  }

  // опыт за существо = его уровню, с бонусами персонажа к опыту
  function xpFor(lvl, res) {
    const d = res.der || {};
    return Math.max(0, Math.round(lvl * (1 + (d.expPct || 0) / 100) * (d.expMul || 1)));
  }

  // ------------------------------------------------------------ данные для подсказок
  const creatures = () => ((window.GMLock && window.GMLock.unlocked && D.creatures) ? D.creatures : (D.ancestors || []));
  const LEARN_KINDS = {
    skill: { t: 'Физический навык', list: () => (D.skills.actives || D.skills.startActives || []).map(x => x.name) },
    stance: { t: 'Стойка', list: () => (D.skills.stances || D.skills.startStances || []).map(x => x.name) },
    symbol: { t: 'Магический символ', list: () => D.skills.symbols.map(x => x.name) },
    passive: { t: 'Пассивный навык', list: () => (D.skills.passives || D.skills.talentInfo || []).map(x => x.name) },
    other: { t: 'Другое', list: () => [] }
  };
  const itemNames = () => [...new Set((D.items || []).map(i => i.name).concat((D.artifactPool || []).map(a => a.name)))];
  const joinable = () => ((D.society && D.society.groups) || [])
    .filter(g => !['болезнь', 'проклятие', 'событие'].includes(g.type) && g.join !== 'нельзя вступить');

  // ------------------------------------------------------------ отрисовка панели

  function stepBtn(act, key, d, disabled, label) {
    return `<button type="button" class="st-btn" data-act="${act}" data-key="${esc(key)}" data-d="${d}" ${disabled ? 'disabled' : ''} aria-label="${esc(label)}">${d > 0 ? '+' : '−'}</button>`;
  }

  function panel(ctx) {
    const rec = ctx.record, perms = ctx.perms || {};
    const v = compute(rec);
    const { res, res0, lv } = v;
    const draft = App.ui.devDraft || (App.ui.devDraft = { alloc: zero(), talents: {} });
    const p = res.prog || { statPoints: 0, statSpent: 0, talentPoints: 0, talentSpent: 0 };
    const canSpend = perms.gm || perms.owner;
    let html = '';

    // уровень и опыт
    const pct = Math.min(100, Math.round(100 * lv.xpInto / lv.need));
    html += `<section class="dev-card"><h2>Уровень и опыт</h2>
      <div class="dev-level"><div><span class="muted small">Уровень</span><strong>${fmt(res.level)}</strong>${lv.levels ? `<span class="muted small">при создании ${fmt(res0.level)}, +${lv.levels}</span>` : ''}</div>
        <div class="dev-xp"><span class="muted small">Опыт до уровня ${fmt(lv.level + 1)}: ${fmt(lv.xpInto)} / ${fmt(lv.need)}</span>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <span class="muted small">Всего набрано: ${fmt(rec.gm.xp || 0)}${res.der.expPct || res.der.expMul !== 1 ? ` · бонус к опыту: ${res.der.expPct ? signed(res.der.expPct) + '%' : ''}${res.der.expMul !== 1 ? ' ×' + res.der.expMul : ''}` : ''}</span></div></div>`;
    if (perms.gm) {
      const cr = creatures();
      html += `<div class="dev-row">
          <label>Начислить опыт <input type="number" min="0" step="1" data-ui="devXpAmount" data-ui-target="none" value="${esc(App.ui.devXpAmount || '')}" placeholder="сколько"></label>
          <button type="button" class="btn small" data-act="devXp">Начислить</button></div>
        <div class="dev-row">
          <label>За существо <input type="text" list="devCreatures" data-ui="devXpCreature" data-ui-target="none" value="${esc(App.ui.devXpCreature || '')}" placeholder="название существа"></label>
          <button type="button" class="btn small" data-act="devXpCreature">Начислить</button></div>
        <datalist id="devCreatures">${cr.map(c => `<option value="${esc(c.n)}">ур. ${fmt(R.roundLevel(c.lvl))}</option>`).join('')}</datalist>
        <p class="muted small">Опыт за существо = его уровню${res.der.expPct || res.der.expMul !== 1 ? ' с бонусами персонажа к опыту' : ''}. До следующего уровня нужно опыта в 100 раз больше текущего уровня.</p>`;
    }
    html += '</section>';

    // очки за новые уровни
    const statLeft = p.statPoints - p.statSpent - sumVals(draft.alloc);
    const talLeft = (p.talentPoints || 0) - (p.talentSpent || 0) - sumVals(draft.talents);
    if (p.statPoints || p.talentPoints) {
      html += `<section class="dev-card"><h2>Очки за новые уровни</h2>
        <p class="small">Характеристики: <b>${p.statSpent + sumVals(draft.alloc)} / ${p.statPoints}</b> · таланты: <b>${(p.talentSpent || 0) + sumVals(draft.talents)} / ${p.talentPoints || 0}</b></p>`;
      html += '<div class="dev-alloc-wrap">';
      if (canSpend && (statLeft > 0 || sumVals(draft.alloc))) {
        html += `<table class="dev-alloc"><caption>Характеристики — осталось ${Math.max(0, statLeft)}</caption><tbody>${R.STATS.map(k => `<tr><th>${R.STAT_NAMES[k]}</th><td>${fmt(res.stats[k])}</td>
          <td><span class="stepper">${stepBtn('devStep', 'alloc:' + k, -1, !(draft.alloc[k] > 0), 'Меньше')}<input type="number" min="0" step="1" inputmode="numeric" data-change="devSet" data-key="alloc:${k}" value="${draft.alloc[k] || 0}" aria-label="${R.STAT_NAMES[k]}: очков вложить">${stepBtn('devStep', 'alloc:' + k, 1, statLeft <= 0, 'Больше')}</span></td></tr>`).join('')}</tbody></table>`;
      }
      if (canSpend && (talLeft > 0 || sumVals(draft.talents))) {
        html += `<table class="dev-alloc"><caption>Таланты — осталось ${Math.max(0, talLeft)}</caption><tbody>${R.TALENTS.map(t => {
          const tv = res.talents[t.id], dv = draft.talents[t.id] || 0;
          const room = tv.blocked ? 0 : tv.maxInv - tv.inv - dv;
          return `<tr><th>${t.name}</th><td>${fmt(tv.total)}</td>
            <td><span class="stepper">${stepBtn('devStep', 'talent:' + t.id, -1, !(dv > 0), 'Меньше')}<input type="number" min="0" step="1" inputmode="numeric" data-change="devSet" data-key="talent:${t.id}" value="${dv}" aria-label="${esc(t.name)}: очков вложить">${stepBtn('devStep', 'talent:' + t.id, 1, talLeft <= 0 || room <= 0, 'Больше')}</span></td></tr>`;
        }).join('')}</tbody></table>`;
      }
      html += '</div>';
      if (sumVals(draft.alloc) || sumVals(draft.talents)) html += `<div class="dev-row"><button type="button" class="btn primary small" data-act="devSavePoints">Сохранить распределение</button><button type="button" class="btn ghost small" data-act="devResetPoints">Сбросить</button></div>`;
      else if (statLeft <= 0 && talLeft <= 0) html += '<p class="muted small">Все очки распределены.</p>';
      html += '</section>';
    }

    // общины
    const groups = rec.gm.groups || [];
    html += `<section class="dev-card"><h2>Фракции, гильдии, религия</h2>`;
    html += groups.length ? groups.map((g, i) => {
      const gifts = String(g.bonus || '').split('/').map(x => x.trim()).filter(Boolean);
      const open = Math.floor((g.quests || 0) / 10);
      const st = (g.st || []).map((raw, j) => { const pp = R.parseGroupStat(raw); if (!pp) return null; const k = R.STAT_SHORT[R.STATS[j]]; return pp.op === 'add' ? `${k} ${signed(pp.v)}` : pp.op === 'mul' ? `${k} ×${fmt(pp.v)}` : `${k}: ${pp.raw}`; }).filter(Boolean);
      return `<div class="dev-group"><p><b>${esc(g.name)}</b> <span class="tag">${esc(g.kind || g.type || 'община')}</span></p>
        <p class="small">Бонус к статам: ${st.length ? esc(st.join(', ')) : 'нет'}</p>
        ${gifts.length ? `<ol class="small gifts">${gifts.map((x, j) => `<li class="${j < open ? '' : 'locked'}">${j < open || perms.gm ? esc(x) : 'дар общины'}${j < open ? '' : ' <span class="muted">— откроется после ' + (10 * (j + 1)) + ' заданий</span>'}</li>`).join('')}</ol>` : ''}
        <p class="small">Заданий выполнено: <b>${g.quests || 0}</b>${perms.gm ? ` <button type="button" class="st-btn mini" data-act="devQuest" data-key="${i}" data-d="-1" ${g.quests ? '' : 'disabled'} aria-label="Минус задание">−</button><button type="button" class="st-btn mini" data-act="devQuest" data-key="${i}" data-d="1" aria-label="Плюс задание">+</button> <button type="button" class="linklike small" data-act="devLeave" data-key="${i}">выйти</button>` : ''}</p></div>`;
    }).join('') : '<p class="muted small">Пока ни в одной общине. Фракцию и религию персонаж получает в игре.</p>';
    if (perms.gm) {
      const list = joinable();
      if (list.length) {
        const types = [...new Set(list.map(g => g.type))];
        html += `<div class="dev-row"><select data-ui="devGroup" data-ui-target="none" aria-label="Община"><option value="">— вступить в общину —</option>${types.map(t => `<optgroup label="${esc(cap(t))}">${list.filter(g => g.type === t).map(g => `<option value="${g.row}" ${String(App.ui.devGroup) === String(g.row) ? 'selected' : ''}>${esc(g.name)}${g.join ? ' (' + esc(g.join) + ')' : ''}</option>`).join('')}</optgroup>`).join('')}</select>
          <button type="button" class="btn small" data-act="devJoin">Вступить</button></div>`;
      } else html += `<p class="muted small">Список общин — в закрытом разделе «Социум». Откройте закрытые разделы паролем ГМ, чтобы принимать персонажей в общины.</p>`;
    }
    html += '</section>';

    // навыки и символы
    const learned = rec.gm.learned || [];
    const lk = App.ui.devLearnKind || 'skill';
    html += `<section class="dev-card"><h2>Изученные навыки и символы</h2>
      ${learned.length ? `<ul class="dev-list">${learned.map((x, i) => `<li><span>${esc(x.name)} <span class="muted small">${esc((LEARN_KINDS[x.kind] || LEARN_KINDS.other).t.toLowerCase())}</span></span>${perms.gm ? `<button type="button" class="linklike small" data-act="devUnlearn" data-key="${i}">убрать</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Пока ничего не изучено после создания.</p>'}`;
    if (perms.gm) {
      html += `<div class="dev-row"><select data-ui="devLearnKind" data-ui-target="dev" aria-label="Что изучено">${Object.entries(LEARN_KINDS).map(([k, x]) => `<option value="${k}" ${k === lk ? 'selected' : ''}>${x.t}</option>`).join('')}</select>
        <input type="text" list="devLearnList" data-ui="devLearnName" data-ui-target="none" value="${esc(App.ui.devLearnName || '')}" placeholder="название">
        <button type="button" class="btn small" data-act="devLearn">Добавить</button></div>
        <datalist id="devLearnList">${LEARN_KINDS[lk].list().map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
    }
    html += '</section>';

    // заметки
    html += `<section class="dev-card"><h2>Заметки</h2>
      ${(perms.gm || perms.owner) ? `<textarea rows="4" data-ui="devNotes" data-ui-target="none" placeholder="что важно помнить о персонаже: клятвы, долги, знакомые">${esc(App.ui.devNotes !== undefined ? App.ui.devNotes : (rec.notes || ''))}</textarea>
      <div class="dev-row"><button type="button" class="btn small" data-act="devNotes">Сохранить заметки</button></div>` : `<p class="small pre">${esc(rec.notes || '—')}</p>`}
    </section>`;

    // проверка
    const errs = res.errors.filter(e => e.step === 'progress'), warns = res.warnings.filter(e => e.step === 'progress');
    if (errs.length || warns.length) html = `<div class="checks ${errs.length ? 'bad' : 'good'}"><ul>${errs.map(e => `<li class="err">${esc(e.msg)}</li>`).concat(warns.map(e => `<li class="warn">${esc(e.msg)}</li>`)).join('')}</ul></div>` + html;
    return { html, view: v };
  }

  function logList(entries) {
    if (!entries || !entries.length) return '<p class="muted small">Записей пока нет.</p>';
    return `<ol class="dev-log">${entries.map(e => {
      const at = e.at ? new Date(e.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '';
      return `<li><span class="muted small">${esc(at)}${e.session ? ` · сессия ${e.session}` : ''}${e.byName ? ` · ${esc(e.byName)}` : ''}</span><span>${esc(e.text)}</span></li>`;
    }).join('')}</ol>`;
  }

  // сводка развития для листа персонажа
  function sheetBlock(rec, v) {
    const g = rec.gm || {};
    const parts = [];
    parts.push(`<p><b>Уровень:</b> ${fmt(v.res.level)}${v.lv.levels ? ` (при создании ${fmt(v.res0.level)})` : ''}; опыт ${fmt(v.lv.xpInto)} / ${fmt(v.lv.need)} до следующего</p>`);
    if ((g.groups || []).length) parts.push(`<p><b>Общины:</b> ${g.groups.map(x => esc(x.name) + (x.quests ? ` (заданий: ${x.quests})` : '')).join(', ')}</p>`);
    if ((g.learned || []).length) parts.push(`<p><b>Изучено в игре:</b> ${g.learned.map(x => esc(x.name)).join(', ')}</p>`);
    if (window.Inv && v.inv) parts.push(window.Inv.sheetExtra(v, rec));
    if (rec.notes) parts.push(`<p class="pre small">${esc(rec.notes)}</p>`);
    return `<section class="sh-block wide"><h3>Развитие</h3>${parts.join('')}</section>`;
  }

  // страница персонажа: «Развитие · Лист · Журнал» (общая для «Моих героев» и кампаний)
  //   o = { record, perms, crumbs, sub, notice, actions, log, devLocked, privateBox }
  function page(o) {
    const v = compute(o.record);
    const tab = ['dev', 'gear', 'fx', 'sheet', 'log'].includes(App.ui.devTab) ? App.ui.devTab : 'dev';
    const race = v.res.race;
    const pics = race ? App.portrait(race.isHalf && race.parents ? race.parents : [race.base], 'dev-portrait') : '';
    let body;
    const I = window.Inv;
    if (tab === 'sheet') body = window.Sheet.render(v.state, v.res, false, { extra: sheetBlock(o.record, v), gearHtml: I ? I.sheetGear(v) : '' });
    else if (tab === 'log') body = logList(o.log);
    else if (o.devLocked) body = `<div class="card note">${o.devLocked}</div>`;
    else if (tab === 'gear' && I) body = I.gearTab(o, v);
    else if (tab === 'fx' && I) body = I.effectsTab(o, v);
    else body = panel(o).html;
    const nfx = (o.record.gm && o.record.gm.effects || []).length;
    const tabs = [['dev', 'Развитие'], ['gear', 'Снаряжение'], ['fx', `Состояния${nfx ? ` <small>${nfx}</small>` : ''}`], ['sheet', 'Лист персонажа'], ['log', 'Журнал']];
    return `<div class="page dev-page">
      ${o.crumbs ? `<p class="crumbs">${o.crumbs}</p>` : ''}
      <header class="dev-head">${pics}<div><h1>${esc(o.record.state.name || 'Безымянный герой')}</h1>
        <p class="muted">${o.sub || ''}</p></div></header>
      ${o.notice || ''}
      ${o.actions ? `<div class="row-actions dev-actions">${o.actions}</div>` : ''}
      <div class="seg dev-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'is-on' : ''}" data-act="devTab" data-v="${k}">${t}${k === 'log' && o.log && o.log.length ? ` <small>${o.log.length}</small>` : ''}</button>`).join('')}</div>
      <div class="dev-body">${body}</div>
      ${tab === 'dev' && o.privateBox ? o.privateBox : ''}
    </div>`;
  }

  // черновик распределения очков и поля ввода принадлежат одному персонажу
  function own(id) {
    if (App.ui.devFor === id) return;
    App.ui.devFor = id;
    App.ui.devDraft = { alloc: zero(), talents: {} };
    ['devXpAmount', 'devXpCreature', 'devLearnName', 'devNotes', 'devGroup', 'gPriv', 'invDraft', 'invSel', 'invAdd', 'invWallet', 'fxDraft', 'fxEdit', 'invQ'].forEach(k => { App.ui[k] = undefined; });
  }

  function sumVals(o) { return Object.values(o || {}).reduce((a, x) => a + (+x || 0), 0); }

  // ------------------------------------------------------------ действия (App.devCtx задаёт текущего персонажа)

  const ctx = () => App.devCtx;
  // перерисовка откладывается и склеивается: поле, теряющее фокус во время перерисовки, не ломает страницу
  let pending = false;
  const rerender = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; if (ctx()) ctx().render(); }, 0);
  };
  async function commit(patch, text) {
    const c = ctx();
    if (!c) return;
    try {
      await c.save(patch, text);
      App.toast(text.length > 70 ? text.slice(0, 68) + '…' : text);
    } catch (e) {
      App.toast('Не сохранилось: ' + (e && e.message ? e.message : e));
    }
    rerender();
  }
  const gmCopy = () => JSON.parse(JSON.stringify(normalize(ctx().record).gm));

  Object.assign(App.actions, {
    devTab(b) { App.ui.devTab = b.dataset.v; rerender(); },
    devXp() {
      const n = Math.floor(+App.ui.devXpAmount || 0);
      if (n <= 0) { App.toast('Укажите, сколько опыта начислить'); return; }
      const before = compute(ctx().record).res.level;
      const gm = gmCopy(); gm.xp = (gm.xp || 0) + n;
      App.ui.devXpAmount = '';
      const after = levelsFromXp(compute(ctx().record).res0.level, gm.xp).level;
      commit({ gm }, `Начислено ${n} опыта${after > before ? `, новый уровень: ${after}` : ''}`);
    },
    devXpCreature() {
      const name = String(App.ui.devXpCreature || '').trim();
      const c = creatures().find(x => norm(x.n) === norm(name));
      if (!c) { App.toast('Существо не найдено — выберите из подсказок'); return; }
      const v = compute(ctx().record);
      const n = xpFor(R.roundLevel(c.lvl), v.res);
      const gm = gmCopy(); gm.xp = (gm.xp || 0) + n;
      App.ui.devXpCreature = '';
      const after = levelsFromXp(v.res0.level, gm.xp).level;
      commit({ gm }, `Победа над «${c.n}» (ур. ${R.roundLevel(c.lvl)}): +${n} опыта${after > v.res.level ? `, новый уровень: ${after}` : ''}`);
    },
    devStep(b) {
      const [kind, key] = b.dataset.key.split(':');
      const d = +b.dataset.d;
      const draft = App.ui.devDraft || (App.ui.devDraft = { alloc: zero(), talents: {} });
      const box = kind === 'alloc' ? draft.alloc : draft.talents;
      box[key] = Math.max(0, (box[key] || 0) + d);
      rerender();
    },
    // число очков можно вписать сразу, не нажимая «+» десятки раз
    devSet(t) {
      const [kind, key] = t.dataset.key.split(':');
      const draft = App.ui.devDraft || (App.ui.devDraft = { alloc: zero(), talents: {} });
      const box = kind === 'alloc' ? draft.alloc : draft.talents;
      const v = compute(ctx().record), p = v.res.prog || {};
      const want = Math.max(0, Math.floor(+t.value || 0));
      let room;
      if (kind === 'alloc') room = p.statPoints - p.statSpent - sumVals(draft.alloc) + (box[key] || 0);
      else {
        const tv = v.res.talents[key];
        room = Math.min((p.talentPoints || 0) - (p.talentSpent || 0) - sumVals(draft.talents) + (box[key] || 0), tv && !tv.blocked ? tv.maxInv - tv.inv : 0);
      }
      box[key] = Math.min(want, Math.max(0, room));
      if (want > box[key]) App.toast(`Больше ${box[key]} сюда не вложить`);
      rerender();
    },
    devResetPoints() { App.ui.devDraft = { alloc: zero(), talents: {} }; rerender(); },
    devSavePoints() {
      const rec = normalize(ctx().record);
      const draft = App.ui.devDraft || { alloc: zero(), talents: {} };
      const prog = JSON.parse(JSON.stringify(rec.prog));
      const txt = [];
      R.STATS.forEach(k => { const v = draft.alloc[k] || 0; if (v) { prog.alloc[k] = (prog.alloc[k] || 0) + v; txt.push(`${R.STAT_SHORT[k]} +${v}`); } });
      Object.entries(draft.talents).forEach(([k, v]) => { if (v) { prog.talents[k] = (prog.talents[k] || 0) + v; const t = R.TALENTS.find(x => x.id === k); txt.push(`${t ? t.name : k} +${v}`); } });
      App.ui.devDraft = { alloc: zero(), talents: {} };
      if (!txt.length) return;
      commit({ prog }, `Распределены очки за новые уровни: ${txt.join(', ')}`);
    },
    devJoin() {
      const g = joinable().find(x => String(x.row) === String(App.ui.devGroup));
      if (!g) { App.toast('Выберите общину'); return; }
      const gm = gmCopy();
      if (gm.groups.some(x => x.name === g.name)) { App.toast('Персонаж уже в этой общине'); return; }
      gm.groups.push({ name: g.name, kind: g.type, row: g.row, st: g.st, bonus: g.bonus, quests: 0 });
      App.ui.devGroup = '';
      commit({ gm }, `Вступил: ${g.type} «${g.name}»`);
    },
    devQuest(b) {
      const gm = gmCopy(); const g = gm.groups[+b.dataset.key];
      if (!g) return;
      g.quests = Math.max(0, (g.quests || 0) + (+b.dataset.d));
      const opened = Math.floor(g.quests / 10) > Math.floor((g.quests - (+b.dataset.d)) / 10) && +b.dataset.d > 0;
      commit({ gm }, `«${g.name}»: заданий ${g.quests}${opened ? ' — открыт новый дар общины' : ''}`);
    },
    devLeave(b) {
      const gm = gmCopy(); const g = gm.groups[+b.dataset.key];
      if (!g || !confirm(`Персонаж выходит из «${g.name}»? Бонус к статам пропадёт.`)) return;
      gm.groups.splice(+b.dataset.key, 1);
      commit({ gm }, `Покинул «${g.name}»`);
    },
    devLearn() {
      const name = String(App.ui.devLearnName || '').trim();
      if (!name) { App.toast('Впишите название'); return; }
      const kind = App.ui.devLearnKind || 'skill';
      const gm = gmCopy(); gm.learned.push({ kind, name });
      App.ui.devLearnName = '';
      commit({ gm }, `Изучено: ${LEARN_KINDS[kind].t.toLowerCase()} «${name}»`);
    },
    devUnlearn(b) {
      const gm = gmCopy(); const x = gm.learned.splice(+b.dataset.key, 1)[0];
      if (x) commit({ gm }, `Убрано из изученного: «${x.name}»`);
    },
    devNotes() {
      const notes = String(App.ui.devNotes !== undefined ? App.ui.devNotes : (ctx().record.notes || ''));
      App.ui.devNotes = undefined;
      if (notes === (ctx().record.notes || '')) return;
      commit({ notes }, 'Обновлены заметки');
    }
  });

  window.Dev = { levelsFromXp, normalize, compute, xpFor, panel, page, own, logList, sheetBlock, sumVals, commit, gmCopy, creatures, zero };
})();
