/*
 * Вкладки «Снаряжение» и «Состояния» на странице персонажа (js/progress.js → Dev.page).
 *   Снаряжение: кукла со слотами (как в старых RPG), рюкзак, кошелёк, кузница для кастомных предметов,
 *               выдача предметов из таблиц, добыча с существ и «отсебятина».
 *   Состояния:  проклятия, болезни, тёмные дары, благословения, модификации, черты, статус-эффекты и свои;
 *               прибавки и множители к статам из них сразу учитываются в характеристиках.
 * Права: предметы, кошелёк и состояния меняет ГМ (поле gm); надеть и снять может и игрок (поле equip).
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, K = window.Craft, C = window.GM_CONFIG;
  const esc = App.esc, cap = App.cap, fmt = R.fmt, signed = R.signed, norm = R.norm;
  const Dev = () => window.Dev;
  const ctx = () => App.devCtx;
  const unlocked = () => !!(window.GMLock && window.GMLock.unlocked);
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = x => JSON.parse(JSON.stringify(x));
  const num = K.num;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;

  const view = () => Dev().compute(clone(ctx().record));

  // ------------------------------------------------------------ сохранение
  // ГМ меняет инвентарь, кошелёк или состояния; при первом изменении стартовое снаряжение переносится в запись
  function gmChange(mutate, text) {
    const v = view();
    const gm = Dev().gmCopy();
    if (!gm.invInit) { gm.items = clone(v.inv.items); gm.invInit = true; }
    if (!gm.wallet) gm.wallet = clone(v.inv.wallet);
    delete gm.gold;
    const equip = clone(v.inv.equip);
    const before = JSON.stringify(equip);
    if (mutate(gm, v, equip) === false) return;
    const patch = { gm };
    if (JSON.stringify(equip) !== before) patch.equip = equip;
    Dev().commit(patch, typeof text === 'function' ? text() : text);
  }

  // ------------------------------------------------------------ надеть / снять
  function equipInto(equip, item, calc, slotId, slots) {
    const e = Object.assign({}, equip);
    Object.keys(e).forEach(k => { if (e[k] === item.id) delete e[k]; });
    const cat = calc.cat;
    if (!cat) return { error: 'Этот предмет не надевается — он лежит в рюкзаке.' };
    let targets;
    if (cat === 'hand') {
      const need = Math.max(1, calc.hands || 1);
      const hands = slots.filter(s => s.cat === 'hand').map(s => s.id);
      if (need > hands.length) return { error: `«${item.name}» требует ${need} рук(и), у персонажа ${hands.length}.` };
      let ix = slotId ? hands.indexOf(slotId) : hands.findIndex((h, i) => i + need <= hands.length && hands.slice(i, i + need).every(x => !e[x]));
      if (ix < 0) ix = 0;
      if (ix + need > hands.length) ix = hands.length - need;
      targets = hands.slice(ix, ix + need);
    } else {
      if (slotId && !slots.some(s => s.id === slotId && s.cat === cat)) return { error: 'Сюда этот предмет не надеть.' };
      const free = slots.filter(s => s.cat === cat && !e[s.id]);
      targets = [slotId || (free[0] || slots.find(s => s.cat === cat) || {}).id].filter(Boolean);
    }
    if (!targets.length) return { error: 'Некуда надеть.' };
    const displaced = new Set(targets.map(t => e[t]).filter(Boolean));
    Object.keys(e).forEach(k => { if (displaced.has(e[k])) delete e[k]; });
    targets.forEach(t => { e[t] = item.id; });
    return { equip: e, displaced: [...displaced] };
  }

  function doEquip(id, slotId) {
    const v = view();
    const it = v.inv.items.find(x => x.id === id);
    if (!it) return;
    const calc = K.compute(it, v.ctx);
    const r = equipInto(v.inv.equip, it, calc, slotId, v.eq.slots);
    if (r.error) { App.toast(r.error); return; }
    const names = r.displaced.map(x => (v.inv.items.find(y => y.id === x) || {}).name).filter(Boolean);
    Dev().commit({ equip: r.equip }, `Надевает «${it.name}»${names.length ? ` вместо «${names.join('», «')}»` : ''}`);
  }
  function doUnequip(id) {
    const v = view();
    const it = v.inv.items.find(x => x.id === id);
    const e = Object.assign({}, v.inv.equip);
    Object.keys(e).forEach(k => { if (e[k] === id) delete e[k]; });
    Dev().commit({ equip: e }, `Снимает «${it ? it.name : 'предмет'}»`);
  }

  // ------------------------------------------------------------ вкладка «Снаряжение»
  function gearTab(o, v) {
    if (!v.inv) return '<div class="card empty">Сначала выберите расу.</div>';
    const perms = o.perms || {}, canEquip = perms.gm || perms.owner;
    const inv = v.inv, eq = v.eq;
    const byId = new Map(inv.items.map(x => [x.id, x]));
    const sel = App.ui.invSel ? byId.get(App.ui.invSel) : null;
    const selCalc = sel ? K.compute(sel, v.ctx) : null;
    const worn = new Set(Object.values(inv.equip));
    const slotHtml = s => {
      const id = inv.equip[s.id], it = id ? byId.get(id) : null;
      const fits = !it && selCalc && selCalc.cat === s.cat && !worn.has(sel.id);
      return `<button type="button" class="slot ${it ? 'full' : ''} ${it && sel && sel.id === it.id ? 'is-sel' : ''} ${fits ? 'fits' : ''}" data-act="invSlot" data-v="${s.id}" ${!it && !canEquip ? 'disabled' : ''}>
        <span class="slot-t">${esc(s.t)}</span><span class="slot-i">${it ? esc(it.name) : fits ? 'надеть сюда' : '—'}</span></button>`;
    };
    const by = cat => eq.slots.filter(s => s.cat === cat);
    const group = cats => cats.map(c => by(c).map(slotHtml).join('')).join('');
    const race = v.res.race;
    const pic = race ? App.portrait(race.isHalf && race.parents ? race.parents : [race.base], 'doll-pic') : '';
    const jewelWorn = eq.slots.some(s => ['ring', 'bracelet', 'earring', 'nose', 'brow'].includes(s.cat) && inv.equip[s.id]);
    const prWorn = by('prosth').some(s => inv.equip[s.id]);
    const selJewel = selCalc && ['ring', 'bracelet', 'earring', 'nose', 'brow'].includes(selCalc.cat);
    const weapons = eq.weapons.filter(w => roleKind(w.kind));

    let html = `<section class="dev-card doll-card"><h2>Экипировка</h2>
      ${eq.warnings.length ? `<div class="checks good"><ul>${eq.warnings.map(w => `<li class="warn">${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="doll">
        <div class="doll-col">${group(['head', 'face', 'neck', 'cloak', 'body'])}</div>
        <div class="doll-mid">${pic}
          <dl class="doll-sum">
            <div><dt>Броня</dt><dd>${fmt(eq.armor)}${eq.magicArmor ? ` <span class="muted small">+ маг ${fmt(eq.magicArmor)}</span>` : ''}</dd></div>
            <div><dt>Уворот</dt><dd>${fmt(v.res.der.dodge)}</dd></div>
            <div><dt>Штраф ловк.</dt><dd>${fmt(eq.pen)}</dd></div>
            <div><dt>Слоты</dt><dd class="${v.res.der.slotsUsed > v.res.der.slots ? 'bad-text' : ''}">${fmt(v.res.der.slotsUsed)} / ${fmt(v.res.der.slots)}</dd></div>
            ${weapons.map(w => `<div class="wide"><dt>${esc(w.item.name)}</dt><dd>урон ${w.damage === null ? '—' : fmt(w.damage)}${w.magicDamage ? ` + маг ${fmt(w.magicDamage)}` : ''}</dd></div>`).join('')}
          </dl></div>
        <div class="doll-col">${group(['gloves', 'belt', 'legs', 'feet', 'brooch'])}</div>
      </div>
      <div class="doll-hands">${group(['hand', 'ammo'])}</div>
      <details class="doll-more" ${jewelWorn || selJewel ? 'open' : ''}><summary>Украшения</summary><div class="doll-jewel">${group(['ring', 'bracelet', 'earring', 'nose', 'brow'])}</div></details>
      <details class="doll-more" ${prWorn || (selCalc && selCalc.cat === 'prosth') ? 'open' : ''}><summary>Протезы</summary><div class="doll-jewel">${group(['prosth'])}</div></details>
      ${canEquip ? '<p class="muted small">Выберите предмет в рюкзаке и нажмите «Надеть» или подсвеченный слот. Нажатие на занятый слот показывает предмет.</p>' : ''}
    </section>`;

    if (sel) html += itemCard(sel, selCalc, perms, worn.has(sel.id));

    // рюкзак
    const q = norm(App.ui.invQ || '');
    const bag = inv.items.filter(x => !worn.has(x.id) && (!q || norm(x.name).includes(q)));
    html += `<section class="dev-card bag-card"><div class="sec-head"><h2>Рюкзак</h2><span class="muted small">занято слотов ${fmt(v.res.der.slotsUsed)} из ${fmt(v.res.der.slots)} (сила${eq.bagSlots ? ` + сумки ${eq.bagSlots}` : ''}; каждый предмет — 1 слот)</span></div>
      ${inv.items.length > 8 ? `<input type="search" data-ui="invQ" data-ui-target="dev" value="${esc(App.ui.invQ || '')}" placeholder="Поиск в рюкзаке" aria-label="Поиск в рюкзаке">` : ''}
      ${bag.length ? `<ul class="bag">${bag.map(it => {
        const c = K.compute(it, v.ctx);
        const nums = [c.damage !== null && c.damage !== undefined ? `урон ${fmt(c.damage)}` : '', c.armor !== null && c.armor !== undefined ? `броня ${fmt(c.armor)}` : ''].filter(Boolean).join(' · ');
        return `<li class="${sel && sel.id === it.id ? 'is-sel' : ''}"><button type="button" class="linklike bag-name" data-act="invSel" data-v="${esc(it.id)}">${esc(it.name)}</button>${(+it.qty || 1) > 1 ? ` <b>×${+it.qty}</b>` : ''}
          <span class="tag">${esc(K.KIND_NAMES[it.kind] || it.kind)}</span>${it.src ? ` <span class="muted small">${esc(it.src)}</span>` : ''}${nums ? ` <span class="muted small">${nums}</span>` : ''}${c.warnings.length ? ' <span class="bad-text small" title="есть замечания">!</span>' : ''}
          ${canEquip && c.cat ? `<button type="button" class="btn small" data-act="invEquip" data-v="${esc(it.id)}">Надеть</button>` : ''}</li>`;
      }).join('')}</ul>` : `<p class="muted small">${inv.items.length ? 'Всё надето.' : 'Рюкзак пуст.'}</p>`}
    </section>`;

    html += walletCard(inv.wallet, perms);
    if (perms.gm) html += addCard(v);
    return html;
  }

  // карточка выбранного предмета
  // уровень ремесла, нужный игроку, чтобы изготовить предмет самому (число после дроби в таблице)
  const skillText = c => (c.skill === null || c.skill === undefined ? '' : `<span class="${c.skillOk === false ? 'req-bad' : c.skillOk ? 'req-ok' : ''}">ремесло ур. ${c.skill}</span>${c.craftHave !== null && c.craftHave !== undefined ? ` <span class="muted small">(у персонажа ${fmt(c.craftHave)})</span>` : ''}`);
  function itemCard(it, c, perms, isWorn) {
    const canEquip = perms.gm || perms.owner;
    const parts = ((it.craft || {}).parts || []).filter(p => p.mat);
    const kv = (t, x) => (x === '' || x === null || x === undefined ? '' : `<div><dt>${t}</dt><dd>${x}</dd></div>`);
    const reqs = (c.req || []).map(r => `<span class="${r.ok ? 'req-ok' : 'req-bad'}">${R.STAT_SHORT[r.stat]} ${r.need}</span>`).join(', ');
    return `<section class="dev-card item-card"><div class="sec-head"><h2>${esc(it.name)}${(+it.qty || 1) > 1 ? ` ×${+it.qty}` : ''}</h2><span class="tag">${esc(K.KIND_NAMES[it.kind] || it.kind)}${it.base && it.base !== it.name ? ': ' + esc(it.base) : ''}</span></div>
      <dl class="kv-list compact item-kv">
        ${kv('Урон', c.damage !== null && c.damage !== undefined ? `<strong>${fmt(c.damage)}</strong>${c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : ''}${gunDmgParts(c)}${c.mult && c.mult.length ? ` <span class="muted small">(${esc(c.mult.join(', '))})</span>` : ''}${(c.bonus || []).filter(b => b.kind === 'урон').map(b => ` <span class="muted small">+${b.v} ${esc(b.src)}</span>`).join('')}` : '')}
        ${kv('Броня', c.armor !== null && c.armor !== undefined ? `<strong>${fmt(c.armor)}</strong>${c.magicArmor ? ` + маг ${fmt(c.magicArmor)}` : ''}` : '')}
        ${kv('Материал', parts.length ? esc(parts.map(p => `${p.mat} ${fmt(num(p.u))} ед.${p.role === 'non' && roleKind(it.kind) ? ' (не на урон)' : ''}`).join(', ')) + (c.need ? ` <span class="muted small">— нужно ${fmt(c.need)} ед.</span>` : '') : '')}
        ${kv('Огнестрел', c.gun ? esc(gunStats(c)) : '')}
        ${kv('Тип урона', c.base && c.base.dt ? esc(c.base.dt) : '')}
        ${kv('Дальность', c.base && c.base.range ? esc(c.base.range) : '')}
        ${kv('Требования', reqs)}
        ${kv('Изготовить самому', skillText(c))}
        ${kv('Руки', c.hands || '')}
        ${kv('Штраф ловкости', c.pen || '')}
        ${kv('Гнёзда для камней', K.CRAFTABLE.includes(it.kind) && c.base ? `${c.sockets}${((it.craft || {}).inlays || []).length ? `, занято ${((it.craft || {}).inlays || []).length}` : ''}` : '')}
        ${kv('Размер', K.CRAFTABLE.includes(it.kind) ? esc(c.size.name) : '')}
        ${kv('Заточка', c.sharpen ? `${c.sharpen} из ${C.CRAFT.SHARPEN_MAX}` : '')}
        ${kv('Где надевать', c.cat ? K.CATS[c.cat] : '')}
        ${kv('Откуда', it.src ? esc(it.src) : '')}
      </dl>
      ${c.effects.length ? `<ul class="fx-list">${c.effects.map(e => `<li><b>${esc(e.src)}:</b> ${esc(e.text)}${e.scale && e.scale !== 'за предмет' ? ` <span class="tag sc">${esc(e.scale)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${c.glyphs.length ? `<p class="small"><b>Глифы</b> (мощь ${fmt(c.glyphPower)}${c.glyphMul > 1 ? `, ×${c.glyphMul}` : ''}; предел ${c.glyphMax}): ${c.glyphs.map(g => esc(g.sym) + (g.temp ? ' (временный)' : '') + (g.over ? ' ⚠' : '')).join(', ')}</p>` : ''}
      ${it.note ? `<p class="small pre">${esc(it.note)}</p>` : ''}
      ${c.warnings.length || c.notes.length ? `<ul class="small item-warn">${c.warnings.map(w => `<li class="bad-text">${esc(w)}</li>`).join('')}${c.notes.map(w => `<li class="muted">${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="row-actions">
        ${canEquip && c.cat ? (isWorn ? `<button type="button" class="btn" data-act="invUnequip" data-v="${esc(it.id)}">Снять</button>` : `<button type="button" class="btn primary" data-act="invEquip" data-v="${esc(it.id)}">Надеть</button>`) : ''}
        ${perms.gm ? `<button type="button" class="btn" data-act="invEdit" data-v="${esc(it.id)}">Изменить</button>
          <button type="button" class="btn ghost" data-act="invQty" data-v="${esc(it.id)}" data-d="1">+1</button>
          <button type="button" class="btn ghost" data-act="invQty" data-v="${esc(it.id)}" data-d="-1" ${(+it.qty || 1) > 1 ? '' : 'disabled'}>−1</button>
          <button type="button" class="btn ghost danger" data-act="invDel" data-v="${esc(it.id)}">Убрать</button>` : ''}
        <button type="button" class="linklike small" data-act="invSel" data-v="">закрыть</button>
      </div></section>`;
  }

  // ------------------------------------------------------------ кошелёк
  function walletCard(w, perms) {
    const coins = C.CURRENCIES;
    const total = K.walletCopper(w);
    const other = (w.other || []).filter(x => x && x.name);
    let html = `<section class="dev-card wallet-card"><div class="sec-head"><h2>Кошелёк</h2><span class="muted small">всего ≈ ${esc(K.money(total))}</span></div>
      <div class="coins">${coins.map(c => `<div class="coin ${num(w[c.id]) ? '' : 'zero'}"><b>${fmt(num(w[c.id]))}</b><span>${esc(c.id)}</span><small>${esc(c.name)}</small>
        ${perms.gm ? `<input type="number" step="1" data-ui="invW_${esc(c.id)}" data-ui-target="none" value="${esc(App.ui['invW_' + c.id] || '')}" placeholder="±" aria-label="Изменить: ${esc(c.name)}">` : ''}</div>`).join('')}</div>
      ${other.length ? `<ul class="dev-list">${other.map((x, i) => `<li><span>${esc(x.name)}: <b>${fmt(num(x.qty))}</b></span>${perms.gm ? `<input type="number" step="1" class="mini-num" data-ui="invWo_${i}" data-ui-target="none" value="${esc(App.ui['invWo_' + i] || '')}" placeholder="±" aria-label="Изменить: ${esc(x.name)}">` : ''}</li>`).join('')}</ul>` : ''}
      <p class="muted small">1 мд = 100 пл, 1 пл = 100 з, 1 з = 100 се, 1 се = 100 м. Цены в таблицах без пометки — в медных.</p>`;
    if (perms.gm) {
      html += `<div class="dev-row"><button type="button" class="btn small" data-act="invWallet">Применить изменения</button></div>
        <div class="dev-row"><input type="text" list="invCoins" data-ui="invWnName" data-ui-target="none" value="${esc(App.ui.invWnName || '')}" placeholder="особая валюта (честь, кровавая монета…)">
          <input type="number" class="mini-num" step="1" data-ui="invWnQty" data-ui-target="none" value="${esc(App.ui.invWnQty || '')}" placeholder="кол-во" aria-label="Количество">
          <button type="button" class="btn small" data-act="invWalletNew">Добавить</button></div>
        <datalist id="invCoins">${C.SPECIAL_CURRENCIES.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
    }
    return html + '</section>';
  }

  // ------------------------------------------------------------ выдача предметов (ГМ)
  function blankDraft(kind) {
    const d = { kind: kind || 'weapon', base: '', name: '', qty: 1, note: '', size: 'н',
      craft: { parts: [], coat: [], sharpen: 0, modules: [], model: '', glyphs: [], inlays: [], quality: 1, enrich: false, soul: { creature: '', mode: '', abilities: [] }, extra: '' } };
    if (kind === 'gun') d.craft.gun = blankGun();
    return d;
  }
  // огнестрел по умолчанию: один ствол, первый ресивер, модель на топливе («классика»)
  function blankGun() {
    const G = K.guns();
    return { barrels: [{ name: (G.barrels[0] || {}).name || '', n: 1 }], receiver: (G.receivers[0] || {}).name || '', scope: '', clip: 0,
      model: (G.models.find(m => m.fuel) || G.models[0] || {}).name || '', ammo: { type: (G.ammo[0] || {}).name || '', mat: '' }, fuel: '', hands: '' };
  }
  const roleKind = kind => kind === 'weapon' || kind === 'gun';   // материал делится на «урон» и «остальное»
  // при выборе основы — строки материала на все нужные единицы
  function fillParts(d, v) {
    const it = { kind: d.kind, base: d.base, size: d.size, craft: { parts: [], gun: d.craft.gun } };
    const c = K.compute(it, v.ctx);
    const mat = ((d.craft.parts || [])[0] || {}).mat || '';
    d.craft.parts = [];
    if (c.needDmg) d.craft.parts.push({ mat, u: c.needDmg, role: 'dmg' });
    if (c.needNon) d.craft.parts.push({ mat, u: c.needNon, role: 'non' });
  }

  function addCard(v) {
    const mode = App.ui.invAdd || 'craft';
    const tabs = [['craft', 'Изготовить'], ['brew', 'Кухня и зелья'], ['table', 'Из таблиц'], ['drop', 'Добыча с существа'], ['custom', 'Своё']];
    let body = '';
    if (mode === 'craft') body = craftForm(v);
    else if (mode === 'brew') body = window.Brew.form({ host: 'dev', issueAct: 'invBrewSave' });
    else if (mode === 'table') body = tableForm(v);
    else if (mode === 'drop') body = dropForm(v);
    else body = customForm(v);
    return `<section class="dev-card add-card" id="invAdd"><h2>${App.ui.invDraft && App.ui.invDraft.editId ? 'Изменить предмет' : 'Выдать предмет'}</h2>
      <div class="seg" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === mode}" class="${k === mode ? 'is-on' : ''}" data-act="invMode" data-v="${k}">${t}</button>`).join('')}</div>
      ${body}</section>`;
  }

  function matOptions() {
    return `<datalist id="invMats">${K.allMaterials().map(m => `<option value="${esc(m.name)}">урон ${m.dmg} · броня ${m.arm}${K.isCrystal(m.name) ? ' · камень' : ''}</option>`).join('')}</datalist>`;
  }

  function craftForm(v) {
    const d = App.ui.invDraft || (App.ui.invDraft = blankDraft('weapon'));
    const cr = d.craft;
    const kinds = K.CRAFTABLE;
    const bases = K.BASES[d.kind]();
    const item = Object.assign({}, d, { name: d.name || K.autoName(d) });
    const c = d.base ? K.compute(item, v.ctx) : null;
    const isW = roleKind(d.kind), isA = ['armor', 'shield', 'prosthesis'].includes(d.kind), isG = d.kind === 'gun';
    const partRows = role => cr.parts.map((p, i) => ({ p, i })).filter(x => (isW ? x.p.role === role : true)).map(({ p, i }) => `<div class="part-row">
        <input type="text" list="invMats" data-change="invField" data-k="craft.parts.${i}.mat" value="${esc(p.mat || '')}" placeholder="материал или камень" aria-label="Материал">
        <input type="number" min="0" step="0.1" class="mini-num" data-change="invField" data-k="craft.parts.${i}.u" value="${esc(p.u)}" aria-label="Единиц">
        <span class="muted small">ед.</span>
        <button type="button" class="linklike small" data-act="invPartDel" data-v="${i}">убрать</button></div>`).join('');
    let html = `<div class="form-grid">
      <label>Вид <select data-change="invKind">${kinds.map(k => opt(k, K.KIND_NAMES[k], d.kind)).join('')}</select></label>
      <label>${isG ? 'Корпус' : 'Основа'} <select data-change="invField" data-k="base"><option value="">— выберите —</option>${bases.map(b => opt(b.name, `${b.name}${typeof b.u === 'number' ? ` (${b.u.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${typeof b.un === 'number' && b.un ? '+' + b.un.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : ''} ед.)` : ''}`, d.base)).join('')}</select></label>
      <label>Размер предмета <select data-change="invField" data-k="size">${R.SIZES.map(z => opt(z.id, `${z.name} (сырьё ${z.mat})`, d.size || 'н')).join('')}</select>
        <span class="muted small">под какой рост сделан; под персонажа сам не подстраивается</span></label>
    </div>`;
    if (!d.base) return html + (isG ? '<p class="muted small">Выберите корпус — он задаёт, сколько стволов поместится. Детали огнестрела — из таблицы «оружие и броня» (колонки «деталь»), дальше пушка собирается из любых слитков по единицам.</p>'
      : '<p class="muted small">Выберите основу — из таблицы «оружие и броня». Дальше можно собрать её из любых слитков по единицам.</p>');
    html += matOptions();
    if (isG) html += gunForm(d, c);
    if (isW) {
      html += `<h3>Материал на урон${isG ? ' <span class="muted small">(стволы, ресивер, корпус)</span>' : ''} <span class="muted small" id="invSum_dmg">${sumText(d, c, 'dmg')}</span></h3>${partRows('dmg')}
        <button type="button" class="linklike small" data-act="invPartAdd" data-v="dmg">+ материал</button>
        <h3>Остальное${isG ? ' <span class="muted small">(прицел, обойма — урон не добавляют)</span>' : ''} <span class="muted small" id="invSum_non">${sumText(d, c, 'non')}</span></h3>${partRows('non')}
        <button type="button" class="linklike small" data-act="invPartAdd" data-v="non">+ материал</button>`;
    } else {
      html += `<h3>Материал <span class="muted small" id="invSum_all">${sumText(d, c, 'all')}</span></h3>${partRows()}
        <button type="button" class="linklike small" data-act="invPartAdd" data-v="non">+ материал</button>`;
    }
    html += `<p class="muted small">Эффект материала действует, если его не меньше ${fmt(c.need <= 0.5 ? C.CRAFT.EFFECT_MIN_SMALL : C.CRAFT.EFFECT_MIN_UNITS)} ед. Урон и броня — сумма по единицам.</p>`;
    // улучшения
    const syms = (window.GAME_DATA.skills.symbols || []).map(x => x.name);
    html += `<details class="craft-more" ${cr.coat.length || cr.sharpen || cr.modules.length || cr.model || cr.glyphs.length || cr.inlays.length || +cr.quality > 1 || cr.enrich || (cr.soul && cr.soul.mode) || cr.extra ? 'open' : ''}><summary>Улучшения: напыление, заточка, глифы, камни…</summary>
      <div class="form-grid">
        <label>${isA ? 'Улучшение на броневом верстаке' : 'Заточка на точильном станке'} <input type="number" min="0" max="${C.CRAFT.SHARPEN_MAX}" step="1" data-change="invField" data-k="craft.sharpen" value="${esc(cr.sharpen || 0)}"> <span class="muted small">+${C.CRAFT.SHARPEN_STEP}% ${isA ? 'защиты' : 'урона'} за раз, до ${C.CRAFT.SHARPEN_MAX}; шанс поломки — от ${C.CRAFT.SHARPEN_BREAK_FROM}%</span></label>
        <label>Усиленное ремесло <select data-change="invField" data-k="craft.quality">${C.CRAFT.QUALITY.map(qv => opt(qv, qv === 1 ? 'нет' : `${qv}Х`, cr.quality || 1)).join('')}</select> <span class="muted small">2Х — 40%, 3Х — 20%, если предмет создан с нуля из своего материала</span></label>
        <label>Модель <select data-change="invField" data-k="craft.model"><option value="">— нет —</option>${K.models().map(m => opt(m.id, `${m.name}: ${m.fx}`, cr.model)).join('')}</select> <span class="muted small">с 100 ур. ремесла</span></label>
        <label class="check"><input type="checkbox" data-change="invField" data-k="craft.enrich" ${cr.enrich ? 'checked' : ''}> Обогатитель: эффект материала 2Х</label>
      </div>
      <h3>Напыление <span class="muted small">даёт эффект металла, тратит целый слиток; на 1 оружие — 1</span></h3>
      ${cr.coat.map((m, i) => `<div class="part-row"><input type="text" list="invMats" data-change="invField" data-k="craft.coat.${i}" value="${esc(m)}" aria-label="Напыление"><button type="button" class="linklike small" data-act="invListDel" data-k="coat" data-v="${i}">убрать</button></div>`).join('')}
      <button type="button" class="linklike small" data-act="invListAdd" data-k="coat">+ напыление</button>
      ${isW && !isG ? `<h3>Доп. модули</h3><div class="mod-list">${K.modules().map(m => `<label class="check"><input type="checkbox" data-change="invModule" data-v="${esc(m.name)}" ${cr.modules.includes(m.name) ? 'checked' : ''}> ${esc(m.name)} <span class="muted small">(${fmt(m.u)} ед.) ${esc(m.fx)}</span></label>`).join('')}</div>` : ''}
      <h3>Зачарование глифами <span class="muted small" id="invGlyphHead">${glyphHead(c, isA)}</span></h3>
      <datalist id="invSyms">${syms.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      ${cr.glyphs.map((g, i) => `<div class="part-row"><input type="text" list="invSyms" data-change="invField" data-k="craft.glyphs.${i}.sym" value="${esc(g.sym || '')}" placeholder="символ" aria-label="Символ глифа">
        <label class="check"><input type="checkbox" data-change="invField" data-k="craft.glyphs.${i}.temp" ${g.temp ? 'checked' : ''}> временный</label>
        <button type="button" class="linklike small" data-act="invListDel" data-k="glyphs" data-v="${i}">убрать</button></div>`).join('')}
      <button type="button" class="linklike small" data-act="invListAdd" data-k="glyphs">+ глиф</button>
      <h3>Инкрустация и украшение <span class="muted small">камни и металлы дают свой «эффект украшения»</span></h3>
      ${cr.inlays.map((m, i) => `<div class="part-row"><input type="text" list="invMats" data-change="invField" data-k="craft.inlays.${i}" value="${esc(m)}" aria-label="Камень"><button type="button" class="linklike small" data-act="invListDel" data-k="inlays" data-v="${i}">убрать</button></div>`).join('')}
      <button type="button" class="linklike small" data-act="invListAdd" data-k="inlays">+ камень</button>
      <h3>Существо в предмете</h3>
      <div class="form-grid"><label>Как <select data-change="invField" data-k="craft.soul.mode"><option value="">— нет —</option>${opt('soul', 'заточённая душа (алтарь демонов, камень душ)', cr.soul.mode)}${opt('monster', 'предмет из монстра (алтарь крови)', cr.soul.mode)}</select></label>
        ${cr.soul.mode ? `<label>Существо <input type="text" list="invCreatures" data-change="invField" data-k="craft.soul.creature" value="${esc(cr.soul.creature || '')}" placeholder="из бестиария"></label>` : ''}</div>
      ${cr.soul.mode ? creaturesList() + (unlocked() ? '' : '<p class="muted small">Статы существ — в бестиарии: откройте закрытые разделы паролем ГМ.</p>') + soulAbilities(cr) : ''}
      <label>Особые свойства <textarea rows="2" data-change="invField" data-k="craft.extra" placeholder="наполнение кровью, маной, силой демона; уникальные свойства">${esc(cr.extra || '')}</textarea></label>
    </details>
    <div class="form-grid">
      <label>Название <input type="text" data-change="invField" data-k="name" value="${esc(d.name)}" placeholder="${esc(K.autoName(d))}"></label>
      <label>Количество <input type="number" min="1" step="1" data-change="invField" data-k="qty" value="${esc(d.qty || 1)}"></label>
      <label>Заметка <input type="text" data-change="invField" data-k="note" value="${esc(d.note)}" placeholder="кто выковал, откуда"></label>
    </div>`;
    html += `<div id="invPreview">${previewCard(item, c)}</div>`;
    html += `<div class="row-actions"><button type="button" class="btn primary" data-act="invSave">${d.editId ? 'Сохранить изменения' : 'Выдать'}</button>
      <button type="button" class="btn ghost" data-act="invReset">${d.editId ? 'Отмена' : 'Очистить'}</button></div>`;
    return html;
  }

  // детали огнестрела: стволы, ресивер, прицел, обойма, модель, патроны, топливо
  function gunForm(d, c) {
    const G = K.guns(), g = d.craft.gun || (d.craft.gun = blankGun());
    const fuels = K.fuels();
    const u2 = x => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    const u = p => `${u2(p.u)} ед.${p.reqRaw ? ', ' + p.reqRaw : ''}`;
    const body = K.baseOf('gun', d.base) || {};
    return `<h3>Стволы <span class="muted small" id="invGunHead">${gunHead(c)}</span></h3>
      ${g.barrels.map((b, i) => `<div class="part-row"><select data-change="invField" data-k="craft.gun.barrels.${i}.name" aria-label="Ствол">${G.barrels.map(p => opt(p.name, `${p.name} (${u(p)})${p.fx ? ' — ' + p.fx : ''}`, b.name)).join('')}</select>
        <input type="number" min="1" step="1" class="mini-num" data-change="invField" data-k="craft.gun.barrels.${i}.n" value="${esc(b.n)}" aria-label="Сколько таких стволов"><span class="muted small">шт.</span>
        ${g.barrels.length > 1 ? `<button type="button" class="linklike small" data-act="invGunDel" data-v="${i}">убрать</button>` : ''}</div>`).join('')}
      <button type="button" class="linklike small" data-act="invGunAdd">+ ствол другого вида</button>
      <div class="form-grid">
        <label>Ресивер <select data-change="invField" data-k="craft.gun.receiver"><option value="">— нет —</option>${G.receivers.map(p => opt(p.name, `${p.name} (${u(p)})${p.fx ? ' — ' + p.fx : ''}`, g.receiver)).join('')}</select></label>
        <label>Прицел <select data-change="invField" data-k="craft.gun.scope"><option value="">— нет —</option>${G.scopes.map(p => opt(p.name, `${p.name} (${u2(p.u)} ед.) — ${p.fx}`, g.scope)).join('')}</select></label>
        ${G.clip ? `<label>Обойма, патронов <input type="number" min="0" max="${G.clip.max}" step="1" data-change="invField" data-k="craft.gun.clip" value="${esc(g.clip || 0)}">
          <span class="muted small">${u2(G.clip.u)} ед. материала на патрон, до ${G.clip.max}; 0 — без обоймы</span></label>` : ''}
        <label>Модель огнестрела <select data-change="invField" data-k="craft.gun.model">${G.models.map(p => opt(p.name, `${p.name} — ${p.fx}`, g.model)).join('')}</select></label>
        <label>Патроны <select data-change="invField" data-k="craft.gun.ammo.type"><option value="">— не заряжено —</option>${G.ammo.map(p => opt(p.name, `${p.name} (${u2(p.u)} ед.)${p.fx ? ' — ' + p.fx : ''}`, (g.ammo || {}).type)).join('')}</select></label>
        <label>Материал патронов <input type="text" list="invMats" data-change="invField" data-k="craft.gun.ammo.mat" value="${esc((g.ammo || {}).mat || '')}" placeholder="сталь, свинец, серебро…"></label>
        <label>Топливо <input type="text" list="invFuels" data-change="invField" data-k="craft.gun.fuel" value="${esc(g.fuel || '')}" placeholder="${fuels.length ? 'порох, огненная соль…' : 'название; список — после пароля ГМ'}"></label>
        <label>Руки <select data-change="invField" data-k="craft.gun.hands">${opt('', `по корпусу: ${C.GUNS.HANDS[norm(body.name || '')] || C.GUNS.DEFAULT_HANDS}`, g.hands)}${opt(1, 'одна', g.hands)}${opt(2, 'две', g.hands)}</select></label>
      </div>
      <datalist id="invFuels">${fuels.map(f => `<option value="${esc(f.name)}">${esc(f.fx)}</option>`).join('')}</datalist>
      <p class="muted small">Урон = урон металла пушки + урон патрона, затем модель (пневматика — 50%, магнитно-электронное — ×1,5) и топливо («урон 2х» у пороха). Эффект металла — как у любого оружия, ниже в списке эффектов. Стволов за раз — столько выстрелов.</p>`;
  }
  function gunHead(c) {
    const g = c && c.gun;
    if (!g) return '';
    return `ячеек <b class="${g.cells > g.cap ? 'bad-text' : 'good-text'}">${g.cells}</b> из ${g.cap} · выстрелов за раз: ${g.shots}`;
  }
  // строка характеристик пушки для карточки предмета
  function gunStats(c) {
    const g = c.gun;
    return [`выстрелов за раз ${g.shots}${g.auto ? ', автоматический огонь' : ''}`, g.acc ? `точность ${signed(g.acc)}` : '', g.od ? `ОД ${signed(g.od)}` : '',
      g.zor ? `зоркость ${signed(g.zor)}` : '', g.fuelCap ? `вмещает ${fmt(g.fuelCap)}е топлива` : ''].filter(Boolean).join(' · ');
  }
  const gunDmgParts = c => (c.gun ? ` <span class="muted small">(металл ${fmt(c.gun.metal)}${c.gun.cart && c.gun.cart.mat ? ` + патрон ${fmt(c.gun.cart.dmg)}` : ''})</span>` : '');

  function sumText(d, c, role) {
    const have = d.craft.parts.filter(p => role === 'all' || p.role === role).reduce((a, p) => a + num(p.u), 0);
    const need = role === 'dmg' ? c.needDmg : role === 'non' ? c.needNon : c.need;
    return `нужно ${fmt(need)} ед., распределено <b class="${Math.abs(have - need) > 0.01 ? 'bad-text' : 'good-text'}">${fmt(Math.round(have * 100) / 100)}</b>`;
  }
  function glyphHead(c, isA) {
    return `до ${c.glyphMax}; мощь — ${C.CRAFT.GLYPH_POWER}% от ${isA ? 'брони' : 'атаки'} = ${fmt(c.glyphPower)}${c.glyphMul > 1 ? ` (×${c.glyphMul} от таумия / рунного кристалла)` : ''}`;
  }
  // точечное обновление формы без перерисовки (чтобы не терялись нажатия кнопок)
  function refreshCraft() {
    const d = App.ui.invDraft;
    if (!d || !d.base) return;
    const v = view();
    const item = Object.assign({}, d, { name: d.name || K.autoName(d) });
    const c = K.compute(item, v.ctx);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('invPreview', previewCard(item, c));
    ['dmg', 'non', 'all'].forEach(r => set('invSum_' + r, sumText(d, c, r)));
    set('invGlyphHead', glyphHead(c, ['armor', 'shield', 'prosthesis'].includes(d.kind)));
    set('invGunHead', gunHead(c));
    const nm = document.querySelector('[data-k="name"]');
    if (nm) nm.placeholder = K.autoName(d);
  }

  function previewCard(item, c) {
    if (!c) return '';
    const kv = (t, x) => `<span><b>${App.cap(t)}:</b> ${x}</span>`;
    return `<div class="craft-preview">
      ${[c.damage !== null && c.damage !== undefined ? kv('урон', fmt(c.damage) + (c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : '') + gunDmgParts(c) + (c.mult.length ? ` <span class="muted small">(${esc(c.mult.join(', '))})</span>` : '')) : '',
        c.gun ? kv('огнестрел', esc(gunStats(c))) : '', c.armor !== null && c.armor !== undefined ? kv('броня', fmt(c.armor) + (c.magicArmor ? ` + маг ${fmt(c.magicArmor)}` : '')) : '', c.pen ? kv('штраф ловк.', c.pen) : '',
        c.req.length ? kv('требования', c.req.map(r => `<span class="${r.ok ? 'req-ok' : 'req-bad'}">${R.STAT_SHORT[r.stat]} ${r.need}</span>`).join(', ')) : '', kv('гнёзда для камней', c.sockets), c.skill !== null && c.skill !== undefined ? kv('изготовить самому', skillText(c)) : '', c.cat ? kv('надевается', K.CATS[c.cat]) : ''].filter(Boolean).join(' · ')}
      ${c.effects.length ? `<ul class="fx-list small">${c.effects.map(e => `<li><b>${esc(e.src)}:</b> ${esc(e.text)}</li>`).join('')}</ul>` : ''}
      ${c.warnings.length ? `<ul class="small item-warn">${c.warnings.map(w => `<li class="bad-text">${esc(w)}</li>`).join('')}</ul>` : ''}
      ${c.notes.length ? `<ul class="small item-warn">${c.notes.map(w => `<li class="muted">${esc(w)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  const creatureList = () => (unlocked() && window.GAME_DATA.creatures ? window.GAME_DATA.creatures : []);
  function creaturesList() {
    return `<datalist id="invCreatures">${creatureList().map(c => `<option value="${esc(c.n)}">ур. ${fmt(R.roundLevel(c.lvl))}</option>`).join('')}</datalist>`;
  }
  function soulAbilities(cr) {
    if (cr.soul.mode !== 'monster' || !cr.soul.creature) return '';
    const c = creatureList().find(x => norm(x.n) === norm(cr.soul.creature));
    if (!c || !(c.ab || []).length) return '';
    return `<p class="small">Способности (1 пассивная и 1 активная):</p><div class="mod-list">${c.ab.map(a => { const t = a[1] || a[0]; return `<label class="check"><input type="checkbox" data-change="invAbility" data-v="${esc(t)}" ${(cr.soul.abilities || []).includes(t) ? 'checked' : ''}> ${esc(t)}</label>`; }).join('')}</div>`;
  }

  function tableForm() {
    const list = K.catalog(unlocked());
    const name = App.ui.invTName || '';
    const hit = name ? list.find(x => norm(x.name) === norm(name)) : null;
    return `<datalist id="invCatalog">${list.map(x => `<option value="${esc(x.name)}">${esc(K.KIND_NAMES[x.kind] || '')}${x.price ? ' · ' + esc(x.price) : ''}</option>`).join('')}</datalist>
      <div class="dev-row"><input type="text" list="invCatalog" data-change="invTPick" value="${esc(name)}" placeholder="название из таблиц: предмет, слиток, камень, артефакт, еда${unlocked() ? ', ингредиент' : ''}" aria-label="Предмет">
        <input type="number" class="mini-num" min="1" step="1" data-ui="invTQty" data-ui-target="none" value="${esc(App.ui.invTQty || 1)}" aria-label="Количество">
        <button type="button" class="btn small" data-act="invTAdd">Выдать</button></div>
      <div id="invTHit">${tableHit(hit, name)}</div>`
      + `<p class="muted small">Слитки и камни выдаются как материал (количество — в единицах); из них потом можно собрать предмет во вкладке «Изготовить».${unlocked() ? '' : ' Алхимические ингредиенты и полный список артефактов — после пароля ГМ.'}</p>`;
  }
  function tableHit(hit, name) {
    return `${hit ? `<p class="small"><span class="tag">${esc(K.KIND_NAMES[hit.kind])}</span> ${esc(hit.effect || '')}${hit.price ? ` <span class="muted">цена: ${esc(hit.price)}${K.priceCopper(hit.price) !== null ? ` (${esc(K.money(K.priceCopper(hit.price)))})` : ''}</span>` : ''}</p>` : name ? '<p class="muted small">В таблицах такого нет — выдайте через «Своё».</p>' : ''}`;
  }

  function dropForm() {
    const st = App.ui.invDrop || {};
    if (!unlocked()) return '<p class="muted small">Добыча записана в бестиарии — откройте закрытые разделы паролем ГМ. Без пароля добычу можно выдать через «Из таблиц» или «Своё».</p>';
    const c = st.creature ? creatureList().find(x => norm(x.n) === norm(st.creature)) : null;
    return `${creaturesList()}<div class="dev-row"><input type="text" list="invCreatures" data-change="invDropPick" value="${esc(st.creature || '')}" placeholder="существо" aria-label="Существо">
        <label>Разделочный стол <select data-change="invDropMult">${[1, 2, 3, 4].map(m => opt(m, m === 1 ? 'нет' : `×${m}`, st.mult || 1)).join('')}</select></label></div>
      ${c ? (st.rows || []).length ? `<ul class="dev-list">${st.rows.map((r, i) => `<li><span>${esc(r.name)}</span><input type="number" class="mini-num" min="0" step="1" data-change="invDropQty" data-v="${i}" value="${esc(r.qty)}" aria-label="Количество: ${esc(r.name)}"></li>`).join('')}</ul>
        <div class="dev-row"><button type="button" class="btn small" data-act="invDropTake">Забрать в рюкзак</button></div>` : '<p class="muted small">У этого существа в бестиарии нет добычи.</p>' : st.creature ? '<p class="muted small">Такого существа нет в бестиарии.</p>' : ''}
      <p class="muted small">Опыт за победу начисляется во вкладке «Развитие».</p>`;
  }

  function customForm() {
    const d = App.ui.invCustom || {};
    const cats = Object.entries(K.CATS);
    return `<div class="form-grid">
      <label>Название <input type="text" data-ui="invCName" data-ui-target="none" value="${esc(App.ui.invCName || '')}" maxlength="120"></label>
      <label>Где надевать <select data-ui="invCCat" data-ui-target="none"><option value="">— не надевается —</option>${cats.map(([k, t]) => opt(k, t, App.ui.invCCat || '')).join('')}</select></label>
      <label>Количество <input type="number" min="1" step="1" data-ui="invCQty" data-ui-target="none" value="${esc(App.ui.invCQty || 1)}"></label>
      <label class="wide">Описание и эффект <textarea rows="3" data-ui="invCText" data-ui-target="none" placeholder="что делает предмет">${esc(App.ui.invCText || '')}</textarea></label>
    </div>
    <div class="dev-row"><button type="button" class="btn small" data-act="invCAdd">Выдать</button></div>
    <p class="muted small">Для «отсебятины»: предметы, которых нет в таблицах. Урон и броню такого предмета считайте по эффекту; чтобы урон считался сам — изготовьте предмет из материала.</p>`;
  }

  // ------------------------------------------------------------ вкладка «Состояния»
  function effectsTab(o, v) {
    const perms = o.perms || {};
    const list = (o.record.gm && o.record.gm.effects) || [];
    const modsText = mods => (mods || []).map(m => `${R.STAT_SHORT[m.stat]} ${m.op === 'mul' ? '×' + fmt(m.v) : signed(m.v)}`).join(', ');
    const start = [];
    const b = v.res0.boon;
    if (b) start.push(`${{ gift: 'тёмный дар', buff: 'благословение', disease: 'болезнь' }[b.kind]} «${b.src.name}»`);
    const tr = (v.res0.traits || {});
    if ((tr.pos || []).length || (tr.neg || []).length) start.push(`черты: ${[...(tr.pos || []), ...(tr.neg || [])].join(', ')}`);
    let html = `<section class="dev-card"><h2>Состояния и эффекты</h2>
      ${list.length ? `<ul class="fx-cards">${list.map(e => `<li class="fx-${esc(e.kind)}"><div class="sec-head"><b>${esc(e.name)}</b><span class="tag">${esc(K.EFFECT_KINDS[e.kind] || e.kind)}</span></div>
        ${e.text ? `<p class="small">${esc(e.text)}</p>` : ''}
        ${(e.mods || []).length ? `<p class="small"><b>К статам:</b> ${esc(modsText(e.mods))} <span class="muted">— учтено в характеристиках</span></p>` : ''}
        ${e.note ? `<p class="small muted">${esc(e.note)}</p>` : ''}
        ${perms.gm ? `<div class="row-actions"><button type="button" class="linklike small" data-act="fxEdit" data-v="${esc(e.id)}">изменить</button><button type="button" class="linklike small danger" data-act="fxDel" data-v="${esc(e.id)}">снять</button></div>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Сейчас на персонаже нет проклятий, болезней и других эффектов от ГМ.</p>'}
      ${start.length ? `<p class="small muted">С создания: ${esc(start.join('; '))} — это часть листа создания.</p>` : ''}
    </section>`;
    if (perms.gm) html += fxForm();
    return html;
  }

  function blankFx() { return { kind: 'curse', name: '', text: '', note: '', mods: {} }; }
  function fxForm() {
    const d = App.ui.fxDraft || (App.ui.fxDraft = blankFx());
    const src = K.effectSources(unlocked()).filter(x => x.kind === d.kind);
    return `<section class="dev-card"><h2>${d.editId ? 'Изменить эффект' : 'Наложить эффект'}</h2>
      <div class="form-grid">
        <label>Что <select data-change="fxKind">${Object.entries(K.EFFECT_KINDS).filter(([k]) => k !== 'status' || unlocked()).map(([k, t]) => opt(k, t, d.kind)).join('')}</select></label>
        <label>Название <input type="text" list="fxList" data-change="fxPick" value="${esc(d.name)}" placeholder="${src.length ? 'из таблиц или своё' : 'название'}"></label>
      </div>
      <datalist id="fxList">${src.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
      <label>Описание <textarea rows="2" data-change="fxField" data-k="text">${esc(d.text)}</textarea></label>
      <p class="small"><b>Влияние на характеристики</b> <span class="muted">— подставляется из описания, можно поправить</span></p>
      <table class="fx-mods"><thead><tr><th></th><th>прибавка</th><th>множитель</th></tr></thead><tbody>${R.STATS.map(k => `<tr><th>${R.STAT_NAMES[k]}</th>
        <td><input type="number" step="1" data-change="fxField" data-k="mods.${k}.add" value="${esc(((d.mods || {})[k] || {}).add || '')}" aria-label="${R.STAT_NAMES[k]}: прибавка"></td>
        <td><input type="number" step="0.1" min="0" data-change="fxField" data-k="mods.${k}.mul" value="${esc(((d.mods || {})[k] || {}).mul || '')}" aria-label="${R.STAT_NAMES[k]}: множитель"></td></tr>`).join('')}</tbody></table>
      <label>Срок и заметка <input type="text" data-change="fxField" data-k="note" value="${esc(d.note)}" placeholder="например: до исцеления, 3 дня, стак 2 из 3"></label>
      <div class="row-actions"><button type="button" class="btn primary" data-act="fxSave">${d.editId ? 'Сохранить' : 'Наложить'}</button>
        ${d.editId ? '<button type="button" class="btn ghost" data-act="fxCancel">Отмена</button>' : ''}</div>
      <p class="muted small">«Если один и тот же тёмный дар будет получен 3 раза, он превратится в проклятие; любой тёмный дар может быть сразу наложен в виде проклятия».</p>
    </section>`;
  }
  // подставить описание и модификаторы в уже открытую форму
  function fxFillDom(d) {
    const tx = document.querySelector('[data-change="fxField"][data-k="text"]');
    if (tx && document.activeElement !== tx) tx.value = d.text || '';
    R.STATS.forEach(k => ['add', 'mul'].forEach(f => {
      const el = document.querySelector(`[data-k="mods.${k}.${f}"]`);
      if (el) el.value = ((d.mods || {})[k] || {})[f] || '';
    }));
  }
  const fxModsFromDraft = d => {
    const out = [];
    R.STATS.forEach(k => {
      const m = (d.mods || {})[k] || {};
      if (num(m.add)) out.push({ stat: k, op: 'add', v: Math.round(num(m.add)) });
      if (num(m.mul) && num(m.mul) !== 1) out.push({ stat: k, op: 'mul', v: num(m.mul) });
    });
    return out;
  };
  const fxDraftMods = mods => {
    const o = {};
    (mods || []).forEach(m => { o[m.stat] = o[m.stat] || {}; if (m.op === 'mul') o[m.stat].mul = m.v; else o[m.stat].add = (num(o[m.stat].add) + m.v); });
    return o;
  };

  // ------------------------------------------------------------ для листа персонажа
  function sheetGear(v) {
    if (!v.inv) return '';
    const byId = new Map(v.inv.items.map(x => [x.id, x]));
    const worn = [];
    const seen = new Set();
    v.eq.slots.forEach(s => {
      const id = v.inv.equip[s.id];
      if (!id || seen.has(id)) return;
      seen.add(id);
      const it = byId.get(id);
      const c = K.compute(it, v.ctx);
      const nums = [c.damage !== null && c.damage !== undefined ? `урон ${fmt(c.damage)}` : '', c.armor ? `броня ${fmt(c.armor)}` : ''].filter(Boolean).join(', ');
      worn.push(`<li><b>${esc(s.t.replace(/ \d+$/, ''))}:</b> ${esc(it.name)}${nums ? ` — ${nums}` : ''}${c.effects.filter(e => e.src !== 'свойство').length ? ` <span class="muted">(${esc(c.effects.filter(e => e.src !== 'свойство').map(e => e.text).join('; '))})</span>` : ''}</li>`);
    });
    const bag = v.inv.items.filter(x => !seen.has(x.id));
    const w = v.inv.wallet;
    return `${worn.length ? `<ul class="small">${worn.join('')}</ul>` : '<p class="muted">Ничего не надето.</p>'}
      <p><b>Броня:</b> ${fmt(v.eq.armor)}${v.eq.magicArmor ? ` (+ маг ${fmt(v.eq.magicArmor)})` : ''}; <b>уворот:</b> ${fmt(v.res.der.dodge)}; <b>слоты:</b> ${fmt(v.res.der.slotsUsed)} / ${fmt(v.res.der.slots)}</p>
      ${bag.length ? `<p><b>Рюкзак:</b> ${bag.map(x => esc(x.name) + ((+x.qty || 1) > 1 ? ' ×' + x.qty : '')).join(', ')}</p>` : ''}
      <p><b>Кошелёк:</b> ${esc(K.money(K.walletCopper(w)))}${(w.other || []).filter(x => x && x.name && num(x.qty)).map(x => `, ${esc(x.name)}: ${fmt(num(x.qty))}`).join('')}</p>`;
  }
  function sheetExtra(v, rec) {
    const list = (rec.gm && rec.gm.effects) || [];
    if (!list.length) return '';
    return `<p><b>Состояния:</b> ${list.map(e => `${esc((K.EFFECT_KINDS[e.kind] || '').toLowerCase())} «${esc(e.name)}»${(e.mods || []).length ? ` (${esc(e.mods.map(m => `${R.STAT_SHORT[m.stat]} ${m.op === 'mul' ? '×' + fmt(m.v) : signed(m.v)}`).join(', '))})` : ''}${e.note ? ` — ${esc(e.note)}` : ''}`).join('; ')}</p>`;
  }

  // ------------------------------------------------------------ действия
  // перерисовка откладывается и склеивается: иначе браузер ругается, если поле теряет фокус посреди перерисовки
  let pending = false;
  const rerender = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; if (ctx()) ctx().render(); }, 0);
  };
  const STRUCT = /^(base|size|craft\.soul\.mode|craft\.soul\.creature)$/;
  const setPath = (o, path, val) => {
    const ps = path.split('.');
    let x = o;
    for (let i = 0; i < ps.length - 1; i++) {
      const k = ps[i], nk = ps[i + 1];
      if (x[k] === undefined || x[k] === null) x[k] = /^\d+$/.test(nk) ? [] : {};
      x = x[k];
    }
    x[ps[ps.length - 1]] = val;
  };
  function addStack(items, it) {
    if (!it.craft) {
      const same = items.find(x => !x.craft && x.kind === it.kind && norm(x.name) === norm(it.name) && (x.effect || '') === (it.effect || ''));
      if (same) { same.qty = (+same.qty || 1) + (+it.qty || 1); return same; }
    }
    items.push(it);
    return it;
  }

  Object.assign(App.actions, {
    invSel(b) { App.ui.invSel = b.dataset.v || null; rerender(); if (b.dataset.v) setTimeout(() => { const c = document.querySelector('.item-card'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30); },
    invSlot(b) {
      const v = view();
      const id = v.inv.equip[b.dataset.v];
      if (id) { App.ui.invSel = id; rerender(); return; }
      const sel = App.ui.invSel && v.inv.items.find(x => x.id === App.ui.invSel);
      if (!sel) { App.toast('Выберите предмет в рюкзаке — потом нажмите на слот'); return; }
      doEquip(sel.id, b.dataset.v);
    },
    invEquip(b) { doEquip(b.dataset.v); },
    invUnequip(b) { doUnequip(b.dataset.v); },
    invQty(b) {
      const d = +b.dataset.d;
      gmChange(gm => { const it = gm.items.find(x => x.id === b.dataset.v); if (!it) return false; it.qty = Math.max(1, (+it.qty || 1) + d); }, `Количество: «${(view().inv.items.find(x => x.id === b.dataset.v) || {}).name}» ${d > 0 ? '+1' : '−1'}`);
    },
    invDel(b) {
      const it = view().inv.items.find(x => x.id === b.dataset.v);
      if (!it || !confirm(`Убрать «${it.name}» из инвентаря?`)) return;
      App.ui.invSel = null;
      gmChange((gm, v, equip) => { gm.items = gm.items.filter(x => x.id !== it.id); Object.keys(equip).forEach(k => { if (equip[k] === it.id) delete equip[k]; }); }, `Убран предмет «${it.name}»`);
    },
    invEdit(b) {
      const it = view().inv.items.find(x => x.id === b.dataset.v);
      if (!it) return;
      if (!K.CRAFTABLE.includes(it.kind)) {
        const name = prompt('Название', it.name); if (name === null) return;
        const effect = prompt('Описание и эффект', it.effect || ''); if (effect === null) return;
        gmChange(gm => { const x = gm.items.find(y => y.id === it.id); x.name = name.trim() || x.name; x.effect = effect; }, `Изменён предмет «${name.trim() || it.name}»`);
        return;
      }
      const d = blankDraft(it.kind);
      Object.assign(d, clone(it), { editId: it.id });
      d.craft = Object.assign(blankDraft(it.kind).craft, clone(it.craft || {}));
      if (!d.craft.soul) d.craft.soul = { creature: '', mode: '', abilities: [] };
      if (d.name === K.autoName(it)) d.name = '';
      if (!d.size) d.size = 'н';
      App.ui.invDraft = d; App.ui.invAdd = 'craft';
      rerender();
      setTimeout(() => { const c = document.getElementById('invAdd'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 30);
    },
    invMode(b) { App.ui.invAdd = b.dataset.v; rerender(); },
    invKind(t) { App.ui.invDraft = blankDraft(t.value); rerender(); },
    invField(t) {
      const d = App.ui.invDraft || (App.ui.invDraft = blankDraft('weapon'));
      const k = t.dataset.k;
      let val = t.type === 'checkbox' ? t.checked : t.value;
      if (t.type === 'number') val = num(val);
      setPath(d, k, val);
      // детали пушки меняют, сколько нужно материала: строки материала пересобираются
      const gunUnits = /^craft\.gun\.(barrels|receiver|scope|clip)/.test(k);
      if (k === 'base' || k === 'size' || gunUnits) fillParts(d, view());
      if (STRUCT.test(k) || gunUnits) rerender(); else refreshCraft();
    },
    invGunAdd() {
      const d = App.ui.invDraft; if (!d || !d.craft.gun) return;
      const G = K.guns(), used = d.craft.gun.barrels.map(b => b.name);
      d.craft.gun.barrels.push({ name: (G.barrels.find(p => !used.includes(p.name)) || G.barrels[0] || {}).name || '', n: 1 });
      fillParts(d, view()); rerender();
    },
    invGunDel(b) { const d = App.ui.invDraft; if (!d || !d.craft.gun) return; d.craft.gun.barrels.splice(+b.dataset.v, 1); fillParts(d, view()); rerender(); },
    invModule(t) {
      const d = App.ui.invDraft; if (!d) return;
      const n = t.dataset.v;
      d.craft.modules = t.checked ? [...new Set(d.craft.modules.concat(n))] : d.craft.modules.filter(x => x !== n);
      refreshCraft();
    },
    invAbility(t) {
      const d = App.ui.invDraft; if (!d) return;
      const a = d.craft.soul.abilities || (d.craft.soul.abilities = []);
      d.craft.soul.abilities = t.checked ? [...new Set(a.concat(t.dataset.v))] : a.filter(x => x !== t.dataset.v);
      refreshCraft();
    },
    invPartAdd(b) {
      const d = App.ui.invDraft; if (!d) return;
      const v = view();
      const c = K.compute(Object.assign({}, d), v.ctx);
      const role = b.dataset.v;
      const have = d.craft.parts.filter(p => !roleKind(d.kind) || p.role === role).reduce((a, p) => a + num(p.u), 0);
      const need = roleKind(d.kind) ? (role === 'dmg' ? c.needDmg : c.needNon) : c.need;
      d.craft.parts.push({ mat: '', u: Math.max(0, Math.round((need - have) * 100) / 100), role });
      rerender();
    },
    invPartDel(b) { const d = App.ui.invDraft; if (!d) return; d.craft.parts.splice(+b.dataset.v, 1); rerender(); },
    invListAdd(b) { const d = App.ui.invDraft; if (!d) return; const k = b.dataset.k; d.craft[k] = (d.craft[k] || []).concat(k === 'glyphs' ? [{ sym: '', temp: false }] : ['']); rerender(); },
    invListDel(b) { const d = App.ui.invDraft; if (!d) return; d.craft[b.dataset.k].splice(+b.dataset.v, 1); rerender(); },
    invReset() { App.ui.invDraft = blankDraft(App.ui.invDraft ? App.ui.invDraft.kind : 'weapon'); rerender(); },
    invSave() {
      const d = App.ui.invDraft; if (!d || !d.base) { App.toast('Выберите основу предмета'); return; }
      const cr = clone(d.craft);
      cr.parts = (cr.parts || []).filter(p => p.mat && num(p.u) > 0).map(p => ({ mat: p.mat.trim(), u: num(p.u), role: roleKind(d.kind) ? p.role : (d.kind === 'ammo' ? 'dmg' : 'non') }));
      if (cr.gun) cr.gun.barrels = (cr.gun.barrels || []).filter(b => b.name && num(b.n) > 0);
      else delete cr.gun;
      ['coat', 'inlays'].forEach(k => { cr[k] = (cr[k] || []).map(x => String(x).trim()).filter(Boolean); });
      cr.glyphs = (cr.glyphs || []).filter(g => g.sym && String(g.sym).trim());
      if (!cr.soul || !cr.soul.mode || !cr.soul.creature) delete cr.soul;
      if (!cr.parts.length) { App.toast('Укажите материал'); return; }
      const it = { id: d.editId || newId(), kind: d.kind, base: d.base, size: d.size || 'н', qty: Math.max(1, Math.floor(num(d.qty) || 1)), note: d.note || '', craft: cr };
      it.name = (d.name || '').trim() || K.autoName(it);
      const calc = K.compute(it, view().ctx);
      const sum = [calc.damage !== null && calc.damage !== undefined ? `урон ${calc.damage}` : '', calc.armor ? `броня ${calc.armor}` : ''].filter(Boolean).join(', ');
      const editing = !!d.editId;
      gmChange(gm => {
        if (editing) { const ix = gm.items.findIndex(x => x.id === it.id); if (ix < 0) return false; it.src = gm.items[ix].src; gm.items[ix] = it; }
        else { it.src = 'выдал ГМ'; gm.items.push(it); }
      }, `${editing ? 'Изменён предмет' : 'Получен предмет'} «${it.name}»${sum ? ` (${sum})` : ''}`);
      App.ui.invDraft = blankDraft(d.kind);
      App.ui.invSel = it.id;
    },
    invTPick(t) {
      App.ui.invTName = t.value;
      const hit = K.catalog(unlocked()).find(x => norm(x.name) === norm(t.value));
      const el = document.getElementById('invTHit');
      if (el) el.innerHTML = tableHit(hit, t.value);
    },
    invTAdd() {
      const name = String(App.ui.invTName || '').trim();
      if (!name) { App.toast('Выберите предмет'); return; }
      const hit = K.catalog(unlocked()).find(x => norm(x.name) === norm(name));
      if (!hit) { App.toast('В таблицах такого нет — выдайте через «Своё»'); return; }
      const qty = Math.max(1, num(App.ui.invTQty) || 1);
      const it = { id: newId(), kind: hit.kind, name: hit.name, effect: hit.effect, qty, src: 'выдал ГМ' };
      gmChange(gm => { addStack(gm.items, it); }, `Получено: «${hit.name}»${qty > 1 ? ' ×' + qty : ''}`);
      App.ui.invTName = ''; App.ui.invTQty = 1;
    },
    invDropPick(t) {
      const c = creatureList().find(x => norm(x.n) === norm(t.value));
      const mult = (App.ui.invDrop || {}).mult || 1;
      App.ui.invDrop = { creature: t.value, mult, base: c ? K.parseDrop(c.drop) : [], rows: c ? K.parseDrop(c.drop).map(r => ({ name: r.name, qty: r.qty * mult })) : [] };
      rerender();
    },
    invDropMult(t) {
      const st = App.ui.invDrop || (App.ui.invDrop = { rows: [], base: [] });
      st.mult = +t.value || 1;
      st.rows = (st.base || []).map(r => ({ name: r.name, qty: r.qty * st.mult }));
      rerender();
    },
    invDropQty(t) { const st = App.ui.invDrop; if (st && st.rows[+t.dataset.v]) st.rows[+t.dataset.v].qty = Math.max(0, Math.floor(num(t.value))); },
    invDropTake() {
      const st = App.ui.invDrop;
      const rows = st ? st.rows.filter(r => r.qty > 0) : [];
      if (!rows.length) { App.toast('Нечего забирать'); return; }
      const cat = K.catalog(unlocked());
      gmChange(gm => {
        rows.forEach(r => {
          const hit = cat.find(x => norm(x.name) === norm(r.name));
          addStack(gm.items, { id: newId(), kind: hit ? hit.kind : 'item', name: hit ? hit.name : r.name, effect: hit ? hit.effect : '', qty: r.qty, src: `добыча: ${st.creature}` });
        });
      }, `Добыча с «${st.creature}»: ${rows.map(r => `${r.name}${r.qty > 1 ? ' ' + r.qty : ''}`).join(', ')}`);
      App.ui.invDrop = null;
    },
    // блюдо, напиток или зелье из калькулятора (js/brew.js)
    invBrewSave() {
      const d = window.Brew.draft(), r = window.Brew.compute(d);
      if (!r.n) { App.toast('Добавьте ингредиенты'); return; }
      if (r.warnings.length && !confirm(`Есть замечания:\n${r.warnings.join('\n')}\n\nВсё равно выдать?`)) return;
      const name = String(d.name || '').trim() || r.name;
      const qty = Math.max(1, Math.floor(num(d.qty) || 1));
      const it = { id: newId(), kind: r.kind, name, effect: r.summary, note: r.recipe, qty, src: 'выдал ГМ' };
      gmChange(gm => { addStack(gm.items, it); }, `Получено: «${name}»${qty > 1 ? ' ×' + qty : ''} (${r.summary})`);
      App.ui.brew = window.Brew.blank(d.mode);
    },
    invCAdd() {
      const name = String(App.ui.invCName || '').trim();
      if (!name) { App.toast('Впишите название'); return; }
      const it = { id: newId(), kind: 'custom', name, effect: String(App.ui.invCText || ''), cat: App.ui.invCCat || '', qty: Math.max(1, Math.floor(num(App.ui.invCQty) || 1)), src: 'выдал ГМ' };
      gmChange(gm => { gm.items.push(it); }, `Получен предмет «${name}»`);
      ['invCName', 'invCText', 'invCCat', 'invCQty'].forEach(k => { App.ui[k] = undefined; });
    },
    invWallet() {
      const changes = [];
      gmChange(gm => {
        C.CURRENCIES.forEach(c => {
          const dv = Math.round(num(App.ui['invW_' + c.id]));
          if (!dv) return;
          gm.wallet[c.id] = num(gm.wallet[c.id]) + dv;
          if (gm.wallet[c.id] < 0) { App.toast(`Не хватает: ${c.name}`); gm.wallet[c.id] -= dv; return; }
          changes.push(`${dv > 0 ? '+' : '−'}${Math.abs(dv)} ${c.id}`);
        });
        (gm.wallet.other || []).forEach((x, i) => {
          const dv = Math.round(num(App.ui['invWo_' + i]));
          if (!dv) return;
          x.qty = Math.max(0, num(x.qty) + dv);
          changes.push(`${dv > 0 ? '+' : '−'}${Math.abs(dv)} ${x.name}`);
        });
        if (!changes.length) return false;
      }, () => `Кошелёк: ${changes.join(', ')}`);
      C.CURRENCIES.forEach(c => { App.ui['invW_' + c.id] = ''; });
      Object.keys(App.ui).filter(k => k.startsWith('invWo_')).forEach(k => { App.ui[k] = ''; });
    },
    invWalletNew() {
      const name = String(App.ui.invWnName || '').trim(), qty = Math.round(num(App.ui.invWnQty));
      if (!name || !qty) { App.toast('Впишите валюту и количество'); return; }
      gmChange(gm => {
        gm.wallet.other = gm.wallet.other || [];
        const x = gm.wallet.other.find(y => norm(y.name) === norm(name));
        if (x) x.qty = Math.max(0, num(x.qty) + qty); else gm.wallet.other.push({ name, qty: Math.max(0, qty) });
      }, `Кошелёк: ${qty > 0 ? '+' : '−'}${Math.abs(qty)} ${name}`);
      App.ui.invWnName = ''; App.ui.invWnQty = '';
    },

    // состояния
    fxKind(t) { App.ui.fxDraft = Object.assign(blankFx(), { kind: t.value, editId: (App.ui.fxDraft || {}).editId }); rerender(); },
    fxPick(t) {
      const d = App.ui.fxDraft || (App.ui.fxDraft = blankFx());
      d.name = t.value;
      const hit = K.effectSources(unlocked()).find(x => x.kind === d.kind && norm(x.name) === norm(t.value));
      if (hit) { d.text = hit.text; d.mods = fxDraftMods(K.parseStatMods(hit.text)); fxFillDom(d); }
    },
    fxField(t) {
      const d = App.ui.fxDraft || (App.ui.fxDraft = blankFx());
      setPath(d, t.dataset.k, t.value);
      if (t.dataset.k === 'text' && !Object.values(d.mods || {}).some(m => num(m.add) || num(m.mul))) { d.mods = fxDraftMods(K.parseStatMods(t.value)); fxFillDom(d); }
    },
    fxSave() {
      const d = App.ui.fxDraft;
      if (!d || !String(d.name || '').trim()) { App.toast('Впишите название эффекта'); return; }
      const e = { id: d.editId || newId(), kind: d.kind, name: d.name.trim(), text: d.text || '', note: d.note || '', mods: fxModsFromDraft(d), at: Date.now() };
      const m = e.mods.map(x => `${R.STAT_SHORT[x.stat]} ${x.op === 'mul' ? '×' + fmt(x.v) : signed(x.v)}`).join(', ');
      const editing = !!d.editId;
      gmChange(gm => {
        gm.effects = gm.effects || [];
        if (editing) { const ix = gm.effects.findIndex(x => x.id === e.id); if (ix < 0) return false; e.at = gm.effects[ix].at; gm.effects[ix] = e; }
        else gm.effects.push(e);
      }, `${editing ? 'Изменено' : 'Наложено'}: ${(K.EFFECT_KINDS[e.kind] || '').toLowerCase()} «${e.name}»${m ? ` (${m})` : ''}`);
      App.ui.fxDraft = blankFx();
    },
    fxEdit(b) {
      const e = ((ctx().record.gm || {}).effects || []).find(x => x.id === b.dataset.v);
      if (!e) return;
      App.ui.fxDraft = { kind: e.kind, name: e.name, text: e.text, note: e.note, mods: fxDraftMods(e.mods), editId: e.id };
      rerender();
    },
    fxCancel() { App.ui.fxDraft = blankFx(); rerender(); },
    fxDel(b) {
      const e = ((ctx().record.gm || {}).effects || []).find(x => x.id === b.dataset.v);
      if (!e || !confirm(`Снять «${e.name}»?`)) return;
      gmChange(gm => { gm.effects = (gm.effects || []).filter(x => x.id !== e.id); }, `Снято: ${(K.EFFECT_KINDS[e.kind] || '').toLowerCase()} «${e.name}»`);
    }
  });

  window.Inv = { gearTab, effectsTab, sheetGear, sheetExtra, equipInto };
})();
