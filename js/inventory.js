/*
 * Вкладки «Снаряжение» и «Состояния» на странице персонажа (js/progress.js → Dev.page).
 *   Снаряжение: кукла со слотами (как в старых RPG), рюкзак, кошелёк, кузница для кастомных предметов,
 *               выдача предметов из таблиц, добыча с существ и «отсебятина».
 *   Состояния:  проклятия, болезни, тёмные дары, благословения, модификации, черты, статус-эффекты и свои;
 *               прибавки и множители к статам из них сразу учитываются в характеристиках.
 * Права: предметы и состояния меняет ГМ (поле gm); надеть и снять может и игрок (поле equip).
 * Кошелёк: валюту выдаёт и забирает ГМ (gm.wallet), тратит и разменивает игрок (purse) — сдача считается сама.
 * Передача предметов другому персонажу кампании: отдающий пишет в своего персонажа give, получатель, приняв, — got.
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
    if (!gm.invInit) { gm.items = clone(v.inv.base); gm.invInit = true; }
    if (!gm.wallet) gm.wallet = clone(v.inv.issued);   // только выданное ГМ, без трат игрока
    delete gm.gold;
    // принятое от других персонажей переносится в список ГМ, чтобы его можно было менять (got[].in — уже перенесено)
    const got = gots(ctx().record), fresh = got.filter(g => g.item && !g.in);
    if (fresh.length && !Array.isArray(gm.items)) gm.items = [];
    fresh.forEach(g => gm.items.push(clone(g.item)));
    // созданное самим игроком (made) — тоже: сырьё списывается из списка ГМ, предмет добавляется (made[].in — уже перенесено)
    const made = mades(ctx().record), freshMade = made.filter(m => m.item && !m.in);
    if (freshMade.length && !Array.isArray(gm.items)) gm.items = [];
    freshMade.forEach(m => {
      (m.used || []).forEach(u => {
        const ix = gm.items.findIndex(y => y && y.id === u.iid);
        if (ix < 0) return;
        const left = r2((+gm.items[ix].qty || 1) - num(u.qty));
        if (left > 0) gm.items[ix].qty = left; else gm.items.splice(ix, 1);
      });
      gm.items.push(clone(m.item));
    });
    // ингредиенту — его свойства из таблицы: она закрыта паролем, а игроку они нужны, чтобы готовить самому
    if (unlocked() && Array.isArray(gm.items)) gm.items.forEach(x => { if (x && !x.ing && !K.CRAFTABLE.includes(x.kind)) { const i = ingData(x.name); if (i) x.ing = i; } });
    const equip = clone(v.inv.equip);
    const before = JSON.stringify(equip);
    if (mutate(gm, v, equip) === false) return;
    const patch = { gm };
    if (fresh.length) patch.got = got.map(g => (g.item && !g.in ? { t: g.t, from: g.from, fromName: g.fromName || '', ms: g.ms || 0, in: true } : g));
    if (freshMade.length) patch.made = made.map(m => (m.item && !m.in ? { t: m.t, ms: m.ms || 0, what: m.what || '', name: m.item.name, in: true } : m));
    if (JSON.stringify(equip) !== before) patch.equip = equip;
    Dev().commit(patch, typeof text === 'function' ? text() : text);
  }

  // ------------------------------------------------------------ передача предметов между персонажами кампании
  // На чужого персонажа и на поле gm у игрока прав нет, поэтому передача в два шага: отдающий записывает её в своего персонажа (give) —
  // вещь пропадает из его инвентаря; получатель принимает (got) — вещь появляется у него. Пока не приняли, отдавший может отменить
  const gives = rec => (Array.isArray(rec && rec.give) ? rec.give : []).filter(g => g && g.t && g.item);
  const gots = rec => (Array.isArray(rec && rec.got) ? rec.got : []).filter(g => g && g.t);
  const party = () => (ctx() && ctx().party) || null;   // другие персонажи кампании; у героя вне кампании их нет
  const taken = (ch, t) => gots(ch).some(x => x.t === t);
  const heroName = ch => (ch && ch.name) || 'Безымянный герой';
  const giveLabel = g => `«${g.item.name}»${(+g.item.qty || 1) > 1 ? ' ×' + (+g.item.qty) : ''}`;
  // что передают персонажу chid и он ещё не принял
  function incoming(rec, chid, chars) {
    const out = [];
    (chars || []).forEach(ch => { if (ch.id !== chid) gives(ch).forEach(g => { if (g.to === chid && !taken(rec, g.t)) out.push({ g, from: ch }); }); });
    return out;
  }
  const outgoing = (rec, chars) => gives(rec).map(g => ({ g, to: (chars || []).find(c => c.id === g.to) || null })).filter(x => !x.to || !taken(x.to, x.g.t));

  function transferCard(perms) {
    const P = party(), c = ctx();
    if (!P) return '';
    const can = perms.gm || perms.owner;
    const inc = incoming(c.record, c.chid, P), outg = outgoing(c.record, P);
    if (!inc.length && !outg.length) return '';
    return `<section class="dev-card give-card"><h2>Передача предметов</h2>
      ${inc.length ? `<h3>Вам передают</h3><ul class="give-list">${inc.map(({ g, from }) => `<li><span>${esc(giveLabel(g))} от <b>${esc(heroName(from))}</b></span>${can ? `<button type="button" class="btn small primary" data-act="invTake" data-v="${esc(g.t)}" data-from="${esc(from.id)}">Принять</button>` : ''}</li>`).join('')}</ul>` : ''}
      ${outg.length ? `<h3>Ждут, пока примут</h3><ul class="give-list">${outg.map(({ g, to }) => `<li><span>${esc(giveLabel(g))} → <b>${esc(to ? heroName(to) : (g.toName || 'персонаж удалён'))}</b></span>${can ? `<button type="button" class="btn small ghost" data-act="invGiveBack" data-v="${esc(g.t)}">Отменить</button>` : ''}</li>`).join('')}</ul>
        <p class="muted small">Пока передачу не приняли, вещи нет ни у кого из двоих; отмена возвращает её обратно.</p>` : ''}
    </section>`;
  }
  // «Передать» в карточке предмета: кому (персонажи кампании в игре) и сколько из стопки
  function giveRow(it, perms) {
    const P = party();
    if (!P || !(perms.gm || perms.owner)) return '';
    const to = P.filter(ch => ch.status === 'active');
    if (!to.length) return '';
    const n = +it.qty || 1;
    return `<div class="dev-row give-row"><label>Передать <select data-ui="invGiveTo" data-ui-target="none" aria-label="Кому передать">${opt('', '— кому —', App.ui.invGiveTo || '')}${to.map(ch => opt(ch.id, heroName(ch) + (ch.ownerName ? ` (игрок ${ch.ownerName})` : ''), App.ui.invGiveTo || '')).join('')}</select></label>
      ${n > 1 ? `<label>сколько <input type="number" class="mini-num" min="1" max="${n}" step="1" data-ui="invGiveN" data-ui-target="none" value="${esc(App.ui.invGiveN || n)}"></label>` : ''}
      <button type="button" class="btn" data-act="invGive" data-v="${esc(it.id)}">Передать</button></div>`;
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
    const artWorn = by('artifact').some(s => inv.equip[s.id]);
    const selJewel = selCalc && ['ring', 'bracelet', 'earring', 'nose', 'brow'].includes(selCalc.cat);
    const weapons = eq.weapons.filter(w => roleKind(w.kind));

    let html = transferCard(perms) + `<section class="dev-card doll-card"><h2>Экипировка</h2>
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
      <details class="doll-more" ${artWorn || (selCalc && selCalc.cat === 'artifact') ? 'open' : ''}><summary>Артефакты</summary><div class="doll-jewel">${group(['artifact'])}</div></details>
      ${canEquip ? '<p class="muted small">Выберите предмет в рюкзаке и нажмите «Надеть» или подсвеченный слот. Нажатие на занятый слот показывает предмет.</p>' : ''}
    </section>`;

    if (sel) html += itemCard(sel, selCalc, perms, worn.has(sel.id), num(v.res.der.charisma));

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

    html += spellCard(o.record, v, canEquip);
    html += walletCard(inv.wallet, perms);
    if (perms.gm) html += addCard(v) + stationsCard(o.record, v);
    else if (perms.owner) html += makeCard(v, o.record);
    return html;
  }

  // ------------------------------------------------------------ крафт самим игроком
  // Игрок создаёт предмет, блюдо или зелье из сырья в рюкзаке, если хватает навыка и есть крафтильня. Поле gm у игрока закрыто,
  // поэтому созданное пишется в персонажа (made: [{ t, ms, what, item, used: [{ iid, qty }] }]): предмет появляется сразу,
  // сырьё сразу вычитается (js/craft.js, inventoryOf); при следующем изменении инвентаря ГМ всё переносится в gm.items.
  // Крафтильни — отмеченные ГМ (gm.stations) и лежащие в рюкзаке предметом с тем же названием (C.MAKE)
  const MK = C.MAKE;
  const r2 = x => Math.round(x * 100) / 100;
  const mades = rec => (Array.isArray(rec && rec.made) ? rec.made : []).filter(m => m && m.t);
  const isGear = it => K.CRAFTABLE.includes(it.kind);
  // свойства ингредиента из таблицы (только у ГМ: таблица закрыта паролем) — записываются в выданный предмет
  const ingData = name => {
    const i = ((window.GAME_DATA.alchemy || {}).ingredients || []).find(x => norm(x.n) === norm(name));
    return i ? clone(i) : null;
  };
  function d100() {
    const cr = window.crypto;
    if (!cr || !cr.getRandomValues) return Math.floor(Math.random() * 100) + 1;
    const a = new Uint32Array(1), lim = 4294967200;
    do { cr.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % 100 + 1;
  }
  function stationsOf(rec, v) {
    const own = ((rec.gm || {}).stations || []).filter(Boolean);
    const bag = [...new Set(v.inv.items.filter(it => MK.STATIONS.some(s => norm(s) === norm(it.name))).map(it => it.name))];
    const all = new Set(own.concat(bag).map(norm));
    return { own, bag, all: [...new Set(own.concat(bag))], has: name => !name || all.has(norm(name)) };
  }
  // сырьё в рюкзаке (не надетое, не снаряжение): слитки и камни — в единицах, ингредиенты — штуками
  const rawItems = (v, name) => { const worn = new Set(Object.values(v.inv.equip)); return v.inv.items.filter(it => !worn.has(it.id) && !isGear(it) && norm(it.name) === norm(name)); };
  const bagHave = (v, name) => r2(rawItems(v, name).reduce((a, it) => a + (+it.qty || 1), 0));
  const addNeed = (m, name, qty) => { const k = norm(name), x = m.get(k); if (x) x.qty = r2(x.qty + qty); else m.set(k, { name, qty: r2(qty) }); };
  const needText = req => [...req.values()].map(x => `${x.name} ${fmt(x.qty)}`).join(', ');
  // что списать: по стопкам рюкзака, пока не наберётся нужное → [{ iid, qty }]
  function takeFromBag(v, req) {
    const used = [];
    req.forEach(({ name, qty }) => {
      let left = qty;
      rawItems(v, name).forEach(it => {
        if (left <= 0) return;
        const n = r2(Math.min(+it.qty || 1, left));
        used.push({ iid: it.id, qty: n });
        left = r2(left - n);
      });
    });
    return used;
  }
  const needsHtml = list => `<div class="make-needs"><h3>Что нужно</h3><ul>${list.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><span aria-hidden="true">${x.ok ? '✓' : '✗'}</span> ${esc(x.text)}</li>`).join('')}</ul></div>`;

  // кузница: крафтильня по виду предмета (и для заточки, глифов, обогатителя), ремесло, распределённый материал и сырьё в рюкзаке
  function forgeNeeds(v, d) {
    const rec = ctx().record, st = stationsOf(rec, v), cr = d.craft, list = [], req = new Map();
    const need = (ok, text) => list.push({ ok: !!ok, text });
    if (!d.base) return { list: [{ ok: false, text: 'выберите основу' }], ok: false, req };
    const c = K.compute(Object.assign({}, d, { name: d.name || K.autoName(d) }), v.ctx);
    const qty = Math.max(1, Math.floor(num(d.qty) || 1));
    const isA = ['armor', 'shield', 'prosthesis'].includes(d.kind);
    const station = s => { if (s) need(st.has(s), `крафтильня «${s}»`); };
    station(MK.FORGE[d.kind]);
    if (num(cr.sharpen) > 0) station(isA ? MK.SHARPEN_ARMOR : MK.SHARPEN_WEAPON);
    const glyphs = (cr.glyphs || []).filter(g => g && g.sym);
    if (glyphs.length) {
      station(MK.GLYPH);
      const known = knownSymbols(rec, v).map(norm);
      glyphs.forEach(g => need(known.includes(norm(g.sym)), `символ «${g.sym}» изучен`));
    }
    if (cr.enrich) station(MK.ENRICH);
    const craft = num(v.ctx.craft);
    if (c.skill !== null && c.skill !== undefined) need(craft >= c.skill, `ремесло ${fmt(c.skill)} — у персонажа ${fmt(craft)}`);
    if (cr.model) need(craft >= MK.MODEL_CRAFT, `модель — ремесло ${MK.MODEL_CRAFT}, у персонажа ${fmt(craft)}`);
    const parts = (cr.parts || []).filter(p => p && p.mat && num(p.u) > 0);
    const split = !roleKind(d.kind) || Math.abs((c.haveDmg || 0) - (c.needDmg || 0)) <= 0.01;
    need(parts.length && Math.abs((c.have || 0) - c.need) <= 0.01 && split, `материал распределён: ${fmt(c.have || 0)} из ${fmt(c.need)} ед.`);
    parts.forEach(p => addNeed(req, String(p.mat).trim(), num(p.u) * qty));
    (cr.coat || []).filter(Boolean).forEach(n => addNeed(req, String(n).trim(), qty));
    (cr.inlays || []).filter(Boolean).forEach(n => addNeed(req, String(n).trim(), qty));
    req.forEach(({ name, qty: q }) => {
      if (!K.material(name)) { need(false, `неизвестный материал «${name}»`); return; }
      const have = bagHave(v, name);
      need(have >= q, `${name}: нужно ${fmt(q)} ед., в рюкзаке ${fmt(have)}`);
    });
    return { list, ok: list.every(x => x.ok), req };
  }
  // алхимия — пассивный навык, изучаемый в игре: null — не изучен
  function alchLevel(rec) {
    const p = Dev().learnedPassives(rec).find(x => norm(x.name) === 'алхимия');
    return p ? p.lvl : null;
  }
  // кухня, винокурня, алхимический стол: крафтильни, алхимия (для зелий), замечания расчёта и ингредиенты в рюкзаке
  function brewNeeds(v, d, r) {
    const rec = ctx().record, st = stationsOf(rec, v), list = [], req = new Map();
    const need = (ok, text) => list.push({ ok: !!ok, text });
    if (!r.n) return { list: [{ ok: false, text: 'добавьте ингредиенты' }], ok: false, req };
    const qty = Math.max(1, Math.floor(num(d.qty) || 1));
    ((r.req || {}).stations || []).forEach(s => need(st.has(s), `крафтильня «${s}»`));
    if (d.mode === 'potion') {
      const al = alchLevel(rec), lv = (r.req || {}).alch || 0;
      need(al !== null && al >= lv, al === null ? 'навык «алхимия» — ещё не изучен' : `алхимия ${lv} — у персонажа ${al}`);
    }
    r.warnings.forEach(w => need(false, w));
    (d.rows || []).filter(x => x.ing && num(x.qty) > 0).forEach(x => addNeed(req, String(x.ing).trim(), Math.floor(num(x.qty)) * qty));
    if (d.base && String(d.base).trim()) addNeed(req, String(d.base).trim(), qty);
    req.forEach(({ name, qty: q }) => { const have = bagHave(v, name); need(have >= q, `${name}: нужно ${fmt(q)}, в рюкзаке ${fmt(have)}`); });
    return { list, ok: list.every(x => x.ok), req };
  }
  // ингредиенты в рюкзаке со своими свойствами (записаны в предмет при выдаче; у ГМ — из таблицы)
  function bagIngs(v) {
    const seen = new Set(), out = [];
    v.inv.items.forEach(it => {
      const i = it.ing || (unlocked() ? ingData(it.name) : null);
      if (!i || !i.n || seen.has(norm(i.n))) return;
      seen.add(norm(i.n));
      out.push(i);
    });
    return out;
  }
  // слитки и камни в рюкзаке — подсказки для строк материала
  function bagMatOptions(v) {
    const seen = new Set(), list = [];
    v.inv.items.forEach(it => { const m = !isGear(it) && K.material(it.name); if (m && !seen.has(norm(m.name))) { seen.add(norm(m.name)); list.push(m); } });
    return `<datalist id="invMats">${list.map(m => `<option value="${esc(m.name)}">в рюкзаке ${fmt(bagHave(v, m.name))} ед. · урон ${m.dmg} · броня ${m.arm}</option>`).join('')}</datalist>`;
  }

  // ГМ: где персонаж может работать сам (своя мастерская или крафтильня рядом)
  function stationsCard(rec, v) {
    const st = stationsOf(rec, v), own = new Set(st.own.map(norm)), bag = new Set(st.bag.map(norm));
    const names = [...new Set(MK.STATIONS.concat(st.own))];
    return `<details class="dev-card stations-card"${App.ui.invStations ? ' open' : ''}><summary data-act="invStationsToggle"><h2>Крафтильни персонажа</h2> <span class="muted small">${st.all.length ? esc(st.all.join(', ')) : 'нет ни одной'}</span></summary>
      <p class="muted small">Отметьте, где персонаж может работать сам — тогда игрок создаёт предметы, блюда и зелья из сырья в рюкзаке (если хватает навыка). Крафтильня, лежащая в рюкзаке предметом с тем же названием, считается сама.</p>
      <div class="station-list">${names.map(n => `<label class="check"><input type="checkbox" data-change="invStation" data-v="${esc(n)}" ${own.has(norm(n)) || bag.has(norm(n)) ? 'checked' : ''} ${bag.has(norm(n)) && !own.has(norm(n)) ? 'disabled' : ''}> ${esc(n)}${bag.has(norm(n)) ? ' <span class="muted small">(в рюкзаке)</span>' : ''}</label>`).join('')}</div></details>`;
  }
  // игрок: создать самому
  function makeCard(v, rec) {
    const st = stationsOf(rec, v), al = alchLevel(rec);
    const mode = App.ui.invMake || 'forge';
    const tabs = [['forge', 'Кузница'], ['brew', 'Кухня и зелья']];
    const body = mode === 'forge' ? craftForm(v, 'make')
      : window.Brew.form({ host: 'dev', issueAct: 'invMakeBrew', issueLabel: 'Приготовить', ings: bagIngs(v), noHerbs: true, noCuts: true, autoRoll: true,
        check: (d, r) => needsHtml(brewNeeds(v, d, r).list), empty: 'В рюкзаке нет ингредиентов — их выдаёт ГМ: травы, добыча, покупки.' });
    return `<section class="dev-card add-card make-card" id="invMake"><h2>Создать самому</h2>
      <p class="small">Крафтильни: ${st.all.length ? st.all.map(n => `<span class="tag">${esc(n)}</span>`).join(' ') : '<span class="muted">пока нет — их отмечает ГМ (своя мастерская или крафтильня рядом)</span>'}
        · ремесло <b>${fmt(v.ctx.craft)}</b>${al !== null ? ` · алхимия <b>${fmt(al)}</b>` : ''}</p>
      <p class="muted small">Сырьё берётся из рюкзака и списывается сразу, созданное появляется в рюкзаке; ГМ видит это в журнале.</p>
      <div class="seg" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === mode}" class="${k === mode ? 'is-on' : ''}" data-act="invMakeMode" data-v="${k}">${t}</button>`).join('')}</div>
      ${body}</section>`;
  }
  // предмет из черновика кузницы (общий для «Выдать» у ГМ и «Создать» у игрока); без материала — null
  function draftItem(d) {
    const cr = clone(d.craft);
    cr.parts = (cr.parts || []).filter(p => p.mat && num(p.u) > 0).map(p => ({ mat: p.mat.trim(), u: num(p.u), role: roleKind(d.kind) ? p.role : (d.kind === 'ammo' ? 'dmg' : 'non') }));
    if (cr.gun) cr.gun.barrels = (cr.gun.barrels || []).filter(b => b.name && num(b.n) > 0);
    else delete cr.gun;
    ['coat', 'inlays'].forEach(k => { cr[k] = (cr[k] || []).map(x => String(x).trim()).filter(Boolean); });
    cr.glyphs = (cr.glyphs || []).filter(g => g.sym && String(g.sym).trim());
    if (!cr.soul || !cr.soul.mode || !cr.soul.creature) delete cr.soul;
    if (!cr.parts.length) return null;
    const it = { id: d.editId || newId(), kind: d.kind, base: d.base, size: d.size || 'н', qty: Math.max(1, Math.floor(num(d.qty) || 1)), note: d.note || '', craft: cr };
    it.name = (d.name || '').trim() || K.autoName(it);
    return it;
  }

  // ------------------------------------------------------------ ячейки заклинаний
  // «на старте игроку доступно 5 ячеек заклинаний», «персонаж может запомнить до пяти 100% заклинаний (ячеек заклинаний)»:
  // запомненное заклинание срабатывает без броска на успех. Записывают игрок и ГМ (поле spells: [{ name, formula, note }])
  const spellsOf = rec => (Array.isArray(rec.spells) ? rec.spells : []).filter(x => x && x.name);
  const knownSymbols = (rec, v) => [...new Set((v.res.symbols || []).map(s => s.name)
    .concat(((rec.gm || {}).learned || []).filter(x => x.kind === 'symbol').map(x => x.name)))];
  function spellCard(rec, v, canEdit) {
    const d = v.res.der, n = d.spellSlots || 0;
    const list = spellsOf(rec);
    const edit = App.ui.spEdit === undefined || App.ui.spEdit === null ? -1 : +App.ui.spEdit;
    const ui = k => esc(App.ui[k] || '');
    const form = i => `<div class="sp-form">
        <label>Заклинание <input type="text" data-ui="spName" data-ui-target="none" value="${ui('spName')}" maxlength="80" placeholder="например, огненный шар"></label>
        <label>Формула <input type="text" data-ui="spFormula" data-ui-target="none" value="${ui('spFormula')}" maxlength="300" placeholder="символы, из которых собрано"></label>
        <label>Заметка <input type="text" data-ui="spNote" data-ui-target="none" value="${ui('spNote')}" maxlength="300" placeholder="расход, урон, эффект (необязательно)"></label>
        <div class="row-actions"><button type="button" class="btn primary small" data-act="spSave" data-v="${i}">Запомнить</button>
          <button type="button" class="btn ghost small" data-act="spCancel">Отмена</button></div></div>`;
    const cells = [];
    for (let i = 0; i < Math.max(n, list.length, edit + 1); i++) {
      const s = list[i], over = i >= n;
      let body;
      if (i === edit) body = form(i);
      else if (s) {
        body = `<div class="sp-text"><b>${esc(s.name)}</b>${s.formula ? `<span class="sp-f">${esc(s.formula)}</span>` : ''}${s.note ? `<span class="muted small">${esc(s.note)}</span>` : ''}
          ${over ? '<span class="bad-text small">Не хватает ячеек: заклинание не помещается.</span>' : ''}</div>
          ${canEdit ? `<div class="sp-ops"><button type="button" class="linklike small" data-act="spEdit" data-v="${i}">изменить</button>
            <button type="button" class="linklike small danger" data-act="spDel" data-v="${i}">забыть</button></div>` : ''}`;
      } else body = canEdit && i === list.length && edit < 0 ? `<button type="button" class="linklike sp-add" data-act="spEdit" data-v="${i}">записать заклинание</button>` : '<span class="muted small">свободна</span>';
      cells.push(`<li class="sp-cell${s ? ' full' : ''}${over ? ' over' : ''}${i === edit ? ' is-edit' : ''}"><span class="sp-n">${i + 1}</span>${body}</li>`);
    }
    const syms = knownSymbols(rec, v);
    return `<section class="dev-card spell-card"><div class="sec-head"><h2>Ячейки заклинаний</h2><span class="muted small">занято ${fmt(Math.min(list.length, n))} из ${fmt(n)}${(d.spellSlotsSrc || []).length ? ` (${esc(d.spellSlotsSrc.join(', '))})` : ''}</span></div>
      ${n || list.length || edit >= 0 ? `<ol class="sp-cells">${cells.join('')}</ol>` : '<p class="muted small">Ячеек нет — запомнить заклинание нельзя.</p>'}
      <p class="muted small">Запомненное заклинание срабатывает наверняка — бросок на успех не нужен.${syms.length ? ` Символы персонажа: ${esc(syms.join(', '))}.` : ''}</p>
    </section>`;
  }
  function spellCommit(mutate, text) {
    const list = spellsOf(ctx().record).map(x => Object.assign({}, x));
    if (mutate(list) === false) return;
    App.ui.spEdit = null;
    Dev().commit({ spells: list }, text);
  }

  // артефакт, «своё» и предмет из таблиц ГМ может надеть в любой слот: «авто» — по названию (артефакт) или не надевается
  const WEARABLE_ANY = ['artifact', 'custom', 'item'];
  function catOptions(it) {
    const auto = K.slotCat(Object.assign({}, it, { cat: undefined }));
    const cur = it.cat === undefined || it.cat === '' ? '' : it.cat === null ? 'none' : it.cat;
    return opt('', `авто: ${auto ? K.CATS[auto].toLowerCase() : 'не надевается'}`, cur) + opt('none', 'не надевается', cur)
      + Object.entries(K.CATS).map(([k, t]) => opt(k, t.toLowerCase(), cur)).join('');
  }

  // карточка выбранного предмета
  // уровень ремесла, нужный игроку, чтобы изготовить предмет самому (число после дроби в таблице)
  const skillText = c => (c.skill === null || c.skill === undefined ? '' : `<span class="${c.skillOk === false ? 'req-bad' : c.skillOk ? 'req-ok' : ''}">ремесло ур. ${c.skill}</span>${c.craftHave !== null && c.craftHave !== undefined ? ` <span class="muted small">(у персонажа ${fmt(c.craftHave)})</span>` : ''}`);
  // цена за штуку: записанная при выдаче, иначе — по материалам (изготовленное) или по таблицам (по названию)
  function priceOf(it) {
    if (typeof it.price === 'number') return { cu: it.price, own: !!it.priceOwn, mat: !it.priceOwn && K.CRAFTABLE.includes(it.kind) };
    if (K.CRAFTABLE.includes(it.kind)) { const p = K.craftPrice(it); return p.lines.length && !p.unknown.length ? { cu: p.total, mat: true } : null; }
    const cu = K.tablePrice(it.name, unlocked());
    return cu !== null ? { cu } : null;
  }
  function priceText(it) {
    const p = priceOf(it), qty = +it.qty || 1;
    if (!p) return '';
    return `<strong>${esc(K.money(p.cu))}</strong>${qty > 1 ? ` за шт. · всего ${esc(K.money(p.cu * qty))}` : ''}${p.own ? ' <span class="muted small">— назначил ГМ</span>' : p.mat ? ' <span class="muted small">— по материалам</span>' : ''}`;
  }
  // у торговца: купить — с наценкой, которую снижает харизма; продать — дороже по харизме (C.TRADE)
  function tradeHtml(cu, cha) {
    const t = K.trade(cu, cha);
    return `купить <strong>${esc(K.money(t.buy))}</strong> <span class="muted small">(наценка ${fmt(t.markup)}%)</span> · продать <strong>${esc(K.money(t.sell))}</strong>${t.sellPct ? ` <span class="muted small">(${signed(t.sellPct)}%)</span>` : ''} <span class="muted small">— харизма ${fmt(cha)}</span>`;
  }
  // своя цена, вписанная ГМ: «5(се)», «2 з 50 се», «350»; пусто или непонятно — null
  const ownPrice = s => (String(s || '').trim() ? K.priceCopper(s) : null);

  function itemCard(it, c, perms, isWorn, cha) {
    const canEquip = perms.gm || perms.owner;
    const parts = ((it.craft || {}).parts || []).filter(p => p.mat);
    const kv = (t, x) => (x === '' || x === null || x === undefined ? '' : `<div><dt>${t}</dt><dd>${x}</dd></div>`);
    const reqs = (c.req || []).map(r => `<span class="${r.ok ? 'req-ok' : 'req-bad'}">${R.STAT_SHORT[r.stat]} ${r.need}</span>`).join(', ');
    return `<section class="dev-card item-card"><div class="sec-head"><h2>${esc(it.name)}${(+it.qty || 1) > 1 ? ` ×${+it.qty}` : ''}</h2><span class="tag">${esc(K.KIND_NAMES[it.kind] || it.kind)}${it.base && it.base !== it.name ? ': ' + esc(it.base) : ''}</span></div>
      <dl class="kv-list compact item-kv">
        ${kv('Урон', c.damage !== null && c.damage !== undefined ? `<strong>${fmt(c.damage)}</strong>${c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : ''}${gunDmgParts(c)}` : '')}
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
        ${kv('Цена', priceText(it))}
        ${kv('У торговца', priceOf(it) && priceOf(it).cu > 0 ? tradeHtml(priceOf(it).cu, cha || 0) : '')}
        ${perms.gm && WEARABLE_ANY.includes(it.kind) ? kv('Где носить', `<select data-change="invCat" data-v="${esc(it.id)}" aria-label="Где носить">${catOptions(it)}</select>`) : kv('Где надевать', c.cat ? K.CATS[c.cat] : '')}
        ${kv('Откуда', it.src ? esc(it.src) : '')}
      </dl>
      ${c.effects.length ? `<ul class="fx-list">${c.effects.map(e => `<li><b>${esc(e.src)}:</b> ${esc(e.text)}${e.scale && e.scale !== 'за предмет' ? ` <span class="tag sc">${esc(e.scale)}</span>` : ''}${e.applied ? ` <span class="muted small">— учтено в ${e.applied === 'dmg' ? 'уроне' : 'броне'}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${boostHtml(c)}
      ${it.note ? `<p class="small pre">${esc(it.note)}</p>` : ''}
      ${K.isTome(it) && perms.gm ? `<div class="dev-row tome-row"><label>Прочитать: какой параметр повысить
          <select data-ui="invTome" data-ui-target="none">${R.STATS.map(k => opt(k, R.STAT_NAMES[k].toLowerCase(), App.ui.invTome || 's')).join('')}</select></label>
          <label>на сколько <input type="number" min="1" step="1" class="mini-num" data-ui="invTomeN" data-ui-target="none" value="${esc(App.ui.invTomeN || K.tomeBonus(it))}"></label>
          <button type="button" class="btn primary small" data-act="invTome" data-v="${esc(it.id)}">Прочитать</button></div>
        <p class="muted small">Прибавка навсегда, уровень не меняется: попадёт во вкладку «Состояния» и сразу в характеристики; прочитанный ${/^свиток/.test(norm(it.name)) ? 'свиток' : 'трактат'} удаляется из рюкзака.</p>` : ''}
      ${c.warnings.length || c.notes.length ? `<ul class="small item-warn">${c.warnings.map(w => `<li class="bad-text">${esc(w)}</li>`).join('')}${c.notes.map(w => `<li class="muted">${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="row-actions">
        ${canEquip && c.cat ? (isWorn ? `<button type="button" class="btn" data-act="invUnequip" data-v="${esc(it.id)}">Снять</button>` : `<button type="button" class="btn primary" data-act="invEquip" data-v="${esc(it.id)}">Надеть</button>`) : ''}
        ${perms.gm ? `<button type="button" class="btn" data-act="invEdit" data-v="${esc(it.id)}">Изменить</button>
          <button type="button" class="btn ghost" data-act="invQty" data-v="${esc(it.id)}" data-d="1">+1</button>
          <button type="button" class="btn ghost" data-act="invQty" data-v="${esc(it.id)}" data-d="-1" ${(+it.qty || 1) > 1 ? '' : 'disabled'}>−1</button>
          <button type="button" class="btn ghost danger" data-act="invDel" data-v="${esc(it.id)}">Убрать</button>` : ''}
        <button type="button" class="linklike small" data-act="invSel" data-v="">закрыть</button>
      </div>${giveRow(it, perms)}</section>`;
  }

  // ------------------------------------------------------------ кошелёк
  // валюту выдаёт ГМ, а тратит и разменивает игрок: сдача считается сама (1 се, заплатить 24 м → 76 м)
  const otherOf = w => (w.other || []).filter(x => x && x.name);
  function walletCard(w, perms) {
    const coins = C.CURRENCIES;
    const total = K.walletCopper(w);
    const other = otherOf(w);
    const ui = k => esc(App.ui[k] || '');
    let html = `<section class="dev-card wallet-card"><div class="sec-head"><h2>Кошелёк</h2><span class="muted small">всего ≈ ${esc(K.money(total))}</span></div>
      <div class="coins">${coins.map(c => `<div class="coin ${num(w[c.id]) ? '' : 'zero'}"><b>${fmt(num(w[c.id]))}</b><span>${esc(c.id)}</span><small>${esc(c.name)}</small></div>`).join('')}</div>
      ${other.length ? `<ul class="dev-list">${other.map((x, i) => `<li><span>${esc(x.name)}: <b>${fmt(num(x.qty))}</b></span>${perms.owner && num(x.qty) > 0 ? `<input type="number" min="1" step="1" class="mini-num" data-ui="invSo_${i}" data-ui-target="none" value="${ui('invSo_' + i)}" placeholder="потратить" aria-label="Потратить: ${esc(x.name)}">` : ''}</li>`).join('')}</ul>
        ${perms.owner && other.some(x => num(x.qty) > 0) ? '<div class="dev-row"><button type="button" class="btn small" data-act="invSpendOther">Потратить особую валюту</button></div>' : ''}` : ''}`;
    // игрок: заплатить со сдачей, разменять, собрать мелочь
    if (perms.owner) {
      const coinSel = (k, skipLow) => `<select data-ui="${k}" data-ui-target="none" aria-label="Монета">${coins.filter(c => !skipLow || c.rate > 1).map(c => opt(c.id, `${c.id} — ${c.name}`, App.ui[k] || (skipLow ? 'се' : 'м'))).join('')}</select>`;
      html += `<div class="wallet-ops">
        <div class="dev-row"><input type="number" min="1" step="1" class="mini-num" data-ui="invPayN" data-ui-target="none" value="${ui('invPayN')}" placeholder="сколько" aria-label="Сколько заплатить">
          ${coinSel('invPayCoin')}
          <input type="text" data-ui="invPayWhy" data-ui-target="none" value="${ui('invPayWhy')}" maxlength="120" placeholder="за что (необязательно)" aria-label="За что">
          <button type="button" class="btn primary small" data-act="invPay">Заплатить</button></div>
        <div class="dev-row">${coinSel('invBreakCoin', true)}<button type="button" class="btn small" data-act="invBreak">Разменять 1 монету на 100 мельче</button>
          <button type="button" class="btn ghost small" data-act="invGather">Собрать мелочь</button></div>
      </div>
      <p class="muted small">Сдача считается сама: заплатить 24 м из 1 се — останется 76 м. Получить деньги можно только от ГМ.</p>`;
    }
    // ГМ: выдать или забрать
    if (perms.gm) {
      html += `<div class="wallet-gm"><h3>Выдать или забрать ${perms.owner ? '' : '<span class="muted small">(ГМ)</span>'}</h3>
        <div class="coins edit">${coins.map(c => `<label class="coin-in"><span>${esc(c.id)}</span><input type="number" step="1" data-ui="invW_${esc(c.id)}" data-ui-target="none" value="${ui('invW_' + c.id)}" placeholder="±" aria-label="Выдать или забрать: ${esc(c.name)}"></label>`).join('')}</div>
        ${other.length ? `<ul class="dev-list">${other.map((x, i) => `<li><span>${esc(x.name)}</span><input type="number" step="1" class="mini-num" data-ui="invWo_${i}" data-ui-target="none" value="${ui('invWo_' + i)}" placeholder="±" aria-label="Выдать или забрать: ${esc(x.name)}"></li>`).join('')}</ul>` : ''}
        <div class="dev-row"><button type="button" class="btn small" data-act="invWallet">Применить</button></div>
        <div class="dev-row"><input type="text" list="invCoins" data-ui="invWnName" data-ui-target="none" value="${ui('invWnName')}" placeholder="особая валюта (честь, кровавая монета…)">
          <input type="number" class="mini-num" step="1" data-ui="invWnQty" data-ui-target="none" value="${ui('invWnQty')}" placeholder="кол-во" aria-label="Количество">
          <button type="button" class="btn small" data-act="invWalletNew">Выдать</button></div>
        <datalist id="invCoins">${C.SPECIAL_CURRENCIES.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>`;
    }
    return html + '<p class="muted small">1 мд = 100 пл, 1 пл = 100 з, 1 з = 100 се, 1 се = 100 м. Цены в таблицах без пометки — в медных.</p></section>';
  }

  // поправку пишет игрок в своё поле purse (выданное ГМ не трогает)
  const coinDiff = (a, b) => C.CURRENCIES.map(c => [c.id, num(b[c.id]) - num(a[c.id])]).filter(([, d]) => d)
    .map(([id, d]) => `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${id}`).join(', ');
  function purseCommit(before, after, text) {
    Dev().commit({ purse: K.purseDelta(ctx().record.purse, before, after) }, text);
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
    else if (mode === 'brew') body = window.Brew.form({ host: 'dev', issueAct: 'invBrewSave', herbsAct: 'invHerbsTake' });
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

  // mode 'make' — игрок создаёт сам из рюкзака: без усиленного ремесла, души и особых свойств (это решает ГМ), без своей цены,
  // с проверкой «что нужно» и кнопкой «Создать»
  let craftMode = '';
  function craftForm(v, mode) {
    const make = mode === 'make';
    craftMode = mode || '';
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
    html += make ? bagMatOptions(v) : matOptions();
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
        ${make ? '' : `<label>Усиленное ремесло <select data-change="invField" data-k="craft.quality">${C.CRAFT.QUALITY.map(qv => opt(qv, qv === 1 ? 'нет' : `${qv}Х`, cr.quality || 1)).join('')}</select> <span class="muted small">2Х — 40%, 3Х — 20%, если предмет создан с нуля из своего материала</span></label>`}
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
      ${make ? '' : `<h3>Существо в предмете</h3>
      <div class="form-grid"><label>Как <select data-change="invField" data-k="craft.soul.mode"><option value="">— нет —</option>${opt('soul', 'заточённая душа (алтарь демонов, камень душ)', cr.soul.mode)}${opt('monster', 'предмет из монстра (алтарь крови)', cr.soul.mode)}</select></label>
        ${cr.soul.mode ? `<label>Существо <input type="text" list="invCreatures" data-change="invField" data-k="craft.soul.creature" value="${esc(cr.soul.creature || '')}" placeholder="из бестиария"></label>` : ''}</div>
      ${cr.soul.mode ? creaturesList() + (unlocked() ? '' : '<p class="muted small">Статы существ — в бестиарии: откройте закрытые разделы паролем ГМ.</p>') + soulAbilities(cr) : ''}
      <label>Особые свойства <textarea rows="2" data-change="invField" data-k="craft.extra" placeholder="наполнение кровью, маной, силой демона; уникальные свойства">${esc(cr.extra || '')}</textarea></label>`}
    </details>
    <div class="form-grid">
      <label>Название <input type="text" data-change="invField" data-k="name" value="${esc(d.name)}" placeholder="${esc(K.autoName(d))}"></label>
      <label>Количество <input type="number" min="1" step="1" data-change="invField" data-k="qty" value="${esc(d.qty || 1)}"></label>
      <label>Заметка <input type="text" data-change="invField" data-k="note" value="${esc(d.note)}" placeholder="кто выковал, откуда"></label>
      ${make ? '' : `<label>Своя цена <input type="text" data-change="invField" data-k="priceIn" value="${esc(d.priceIn || '')}" placeholder="по материалам" maxlength="60">
        <span class="muted small">за штуку: «5(се)», «2 з 50 се», «350» (медные); пусто — по материалам</span></label>`}
    </div>`;
    html += `<div id="invPreview">${previewCard(item, c)}${craftPriceHtml(d, item, v, make)}</div>`;
    if (make) {
      html += `<div id="invMakeCheck">${needsHtml(forgeNeeds(v, d).list)}</div>
        <div class="row-actions"><button type="button" class="btn primary" data-act="invMake">Создать</button>
        <button type="button" class="btn ghost" data-act="invReset">Очистить</button></div>`;
      return html;
    }
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
      <p class="muted small">Урон = урон металла пушки, затем модель (пневматика — 50%, магнитно-электронное — ×1,5) и топливо («урон 2х» у пороха). Эффект металла — как у любого оружия, ниже в списке эффектов. Патроны урона не добавляют — дают свой эффект и эффект своего материала. Стволов за раз — столько выстрелов.</p>`;
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
  const gunDmgParts = c => (c.gun && c.mult.length ? ` <span class="muted small">(металл ${fmt(c.gun.metal)})</span>` : '');

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
    set('invPreview', previewCard(item, c) + craftPriceHtml(d, item, v, craftMode === 'make'));
    if (craftMode === 'make') set('invMakeCheck', needsHtml(forgeNeeds(v, d).list));
    ['dmg', 'non', 'all'].forEach(r => set('invSum_' + r, sumText(d, c, r)));
    set('invGlyphHead', glyphHead(c, ['armor', 'shield', 'prosthesis'].includes(d.kind)));
    set('invGunHead', gunHead(c));
    const nm = document.querySelector('[data-k="name"]');
    if (nm) nm.placeholder = K.autoName(d);
  }

  // цена изготовленного предмета: по материалам с расшифровкой или своя, если ГМ её вписал; за штуку и за всё количество
  function craftPriceHtml(d, item, v, make) {
    const p = K.craftPrice(item), qty = Math.max(1, Math.floor(num(d.qty) || 1));
    const typed = make ? '' : String(d.priceIn || '').trim(), own = ownPrice(typed);
    const cha = num(v.res.der.charisma);
    if (!p.lines.length && !p.unknown.length && own === null) return '';
    const each = own !== null ? own : p.total;
    const how = l => (l.how === 'coat' ? `напыление: ${l.name}` : l.how === 'inlay' ? `камень: ${l.name}${l.u > 1 ? ' ×' + fmt(l.u) : ''}` : `${l.name} ${fmt(l.u)} ед.`) + ` × ${K.money(l.each)}`;
    return `<div class="item-price">
      <p><b>Цена${own !== null ? '' : ' по материалам'}:</b> <strong>${esc(K.money(each))}</strong>${qty > 1 ? ` за шт. · всего за ${qty} шт. — <strong>${esc(K.money(each * qty))}</strong>` : ''}
        ${own !== null ? `<span class="muted small">— своя цена; по материалам ${esc(K.money(p.total))}</span>` : ''}</p>
      ${typed && own === null ? '<p class="bad-text small">Не понял свою цену — впишите числом с монетой: «5(се)», «2 з 50 се» или просто медные.</p>' : ''}
      ${p.lines.length ? `<p class="muted small">${esc(p.lines.map(how).join(' + '))}</p>` : ''}
      ${each > 0 ? `<p class="small">У торговца за штуку: ${tradeHtml(each, cha)}</p>` : ''}
      ${p.unknown.length ? `<p class="muted small">Без цены в таблице: ${esc(p.unknown.join(', '))} — не посчитано.</p>` : ''}
      ${own === null && p.lines.length && !make ? '<p class="muted small">Только материал: заточка, глифы, модель, усиленное ремесло и существо в предмете в таблице не оценены — добавьте их своей ценой.</p>' : ''}
    </div>`;
  }

  // что дают усиления: материал → каждое усиление со своей прибавкой → итог; у глифов — мощь каждого
  function boostHtml(c) {
    const line = (what, base, total, title) => {
      const st = (c.steps || []).filter(x => x.what === what);
      if (!st.length) return '';
      return `<li><b>${title}:</b> ${c.gun && what === 'dmg' ? 'металл' : 'материал'} ${fmt(base || 0)}${st.map(x => ` · ${esc(x.src)}${x.how ? ' ' + x.how : ''} <span class="${x.d >= 0 ? 'good-text' : 'bad-text'}">${signed(x.d)}</span>`).join('')} = <b>${fmt(total)}</b></li>`;
    };
    const glyphs = (c.glyphs || []).map((g, i) => `<li><b>Глиф «${esc(g.sym)}»${g.temp ? ' (временный)' : ''}:</b> мощь ${fmt(g.power)} — ${C.CRAFT.GLYPH_POWER}% ${c.glyphOf} ${fmt(c.glyphBase)}${c.glyphMul > 1 ? ` ×${c.glyphMul}` : ''}${g.over ? ` <span class="bad-text">— ${i + 1}-й при пределе ${c.glyphMax}: риск разрушить предмет</span>` : ''}</li>`);
    const list = [line('dmg', c.dmgBase, c.damage, 'Урон'), line('arm', c.armBase, c.armor, 'Броня')].filter(Boolean).concat(glyphs);
    return list.length ? `<ul class="boost-list small">${list.join('')}</ul>` : '';
  }
  // то же коротко — для листа персонажа
  function boostShort(c) {
    const parts = (c.steps || []).map(x => `${x.src} ${signed(x.d)}`).concat((c.glyphs || []).map(g => `глиф «${g.sym}» ${fmt(g.power)}`));
    return parts.length ? ` <span class="muted">(${esc(parts.join(', '))})</span>` : '';
  }

  function previewCard(item, c) {
    if (!c) return '';
    const kv = (t, x) => `<span><b>${App.cap(t)}:</b> ${x}</span>`;
    return `<div class="craft-preview">
      ${[c.damage !== null && c.damage !== undefined ? kv('урон', fmt(c.damage) + (c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : '') + gunDmgParts(c)) : '',
        c.gun ? kv('огнестрел', esc(gunStats(c))) : '', c.armor !== null && c.armor !== undefined ? kv('броня', fmt(c.armor) + (c.magicArmor ? ` + маг ${fmt(c.magicArmor)}` : '')) : '', c.pen ? kv('штраф ловк.', c.pen) : '',
        c.req.length ? kv('требования', c.req.map(r => `<span class="${r.ok ? 'req-ok' : 'req-bad'}">${R.STAT_SHORT[r.stat]} ${r.need}</span>`).join(', ')) : '', kv('гнёзда для камней', c.sockets), c.skill !== null && c.skill !== undefined ? kv('изготовить самому', skillText(c)) : '', c.cat ? kv('надевается', K.CATS[c.cat]) : ''].filter(Boolean).join(' · ')}
      ${boostHtml(c)}
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
      <div id="invTHit">${tableHit(hit, name, num(view().res.der.charisma))}</div>`
      + `<p class="muted small">Слитки и камни выдаются как материал (количество — в единицах); из них потом можно собрать предмет во вкладке «Изготовить».${unlocked() ? '' : ' Алхимические ингредиенты и полный список артефактов — после пароля ГМ.'}</p>`;
  }
  function tableHit(hit, name, cha) {
    const cu = hit ? K.priceCopper(hit.price) : null;
    return `${hit ? `<p class="small"><span class="tag">${esc(K.KIND_NAMES[hit.kind])}</span> ${esc(hit.effect || '')}${hit.price ? ` <span class="muted">цена: ${esc(hit.price)}${cu !== null ? ` (${esc(K.money(cu))})` : ''}</span>` : ''}</p>
      ${cu ? `<p class="small">У торговца: ${tradeHtml(cu, cha)}</p>` : ''}` : name ? '<p class="muted small">В таблицах такого нет — выдайте через «Своё».</p>' : ''}`;
  }

  function dropForm() {
    const st = App.ui.invDrop || {};
    if (!unlocked()) return '<p class="muted small">Добыча записана в бестиарии — откройте закрытые разделы паролем ГМ. Без пароля добычу можно выдать через «Из таблиц» или «Своё».</p>';
    const c = st.creature ? creatureList().find(x => norm(x.n) === norm(st.creature)) : null;
    return `${creaturesList()}<div class="dev-row"><input type="text" list="invCreatures" data-change="invDropPick" value="${esc(st.creature || '')}" placeholder="существо" aria-label="Существо">
        <label>Разделочный стол <select data-change="invDropMult">${[1, 2, 3, 4].map(m => opt(m, m === 1 ? 'нет' : `×${m}`, st.mult || 1)).join('')}</select></label></div>
      ${c ? (st.rows || []).length ? `<ul class="dev-list">${st.rows.map((r, i) => { const cu = K.tablePrice(r.name, true); return `<li><span>${esc(r.name)}${cu !== null ? ` <span class="muted small">— ${esc(K.money(cu))} за шт.</span>` : ''}</span><input type="number" class="mini-num" min="0" step="1" data-change="invDropQty" data-v="${i}" value="${esc(r.qty)}" aria-label="Количество: ${esc(r.name)}"></li>`; }).join('')}</ul>
        ${dropTotal(st.rows)}
        <div class="dev-row"><button type="button" class="btn small" data-act="invDropTake">Забрать в рюкзак</button></div>` : '<p class="muted small">У этого существа в бестиарии нет добычи.</p>' : st.creature ? '<p class="muted small">Такого существа нет в бестиарии.</p>' : ''}
      <p class="muted small">Опыт за победу начисляется во вкладке «Развитие».</p>`;
  }

  // добыча: сколько стоит всё по таблицам; что без цены — перечислено
  function dropTotal(rows) {
    let total = 0;
    const none = [];
    rows.filter(r => r.qty > 0).forEach(r => { const cu = K.tablePrice(r.name, true); if (cu === null) none.push(r.name); else total += cu * r.qty; });
    return `<p class="item-price"><b>Цена добычи:</b> <strong>${esc(K.money(total))}</strong>${none.length ? ` <span class="muted small">— без цены в таблицах: ${esc(none.join(', '))}</span>` : ''}</p>`;
  }

  function customForm() {
    const d = App.ui.invCustom || {};
    const cats = Object.entries(K.CATS);
    return `<div class="form-grid">
      <label>Название <input type="text" data-ui="invCName" data-ui-target="none" value="${esc(App.ui.invCName || '')}" maxlength="120"></label>
      <label>Где надевать <select data-ui="invCCat" data-ui-target="none"><option value="">— не надевается —</option>${cats.map(([k, t]) => opt(k, t, App.ui.invCCat || '')).join('')}</select></label>
      <label>Количество <input type="number" min="1" step="1" data-ui="invCQty" data-ui-target="none" value="${esc(App.ui.invCQty || 1)}"></label>
      <label>Цена за штуку <input type="text" data-ui="invCPrice" data-ui-target="none" value="${esc(App.ui.invCPrice || '')}" maxlength="60" placeholder="5(се), 2 з 50 се или медные"></label>
      <label class="wide">Описание и эффект <textarea rows="3" data-ui="invCText" data-ui-target="none" placeholder="что делает предмет">${esc(App.ui.invCText || '')}</textarea></label>
    </div>
    <div class="dev-row"><button type="button" class="btn small" data-act="invCAdd">Выдать</button></div>
    <p class="muted small">Для «отсебятины»: предметы, которых нет в таблицах. Урон и броню такого предмета считайте по эффекту; чтобы урон считался сам — изготовьте предмет из материала.</p>`;
  }

  // ------------------------------------------------------------ вкладка «Состояния»
  function effectsTab(o, v) {
    const perms = o.perms || {};
    const list = (o.record.gm && o.record.gm.effects) || [];
    const modsText = mods => (mods || []).map(m => `${modLabel(m.stat)} ${m.op === 'mul' ? '×' + fmt(m.v) : signed(m.v)}`).join(', ');
    const start = [];
    const b = v.res0.boon;
    if (b) start.push(`${{ gift: 'тёмный дар', buff: 'благословение', disease: 'болезнь' }[b.kind]} «${b.src.name}»`);
    const tr = (v.res0.traits || {});
    if ((tr.pos || []).length || (tr.neg || []).length) start.push(`черты: ${[...(tr.pos || []), ...(tr.neg || [])].join(', ')}`);
    let html = `<section class="dev-card"><h2>Состояния и эффекты</h2>
      ${list.length ? `<ul class="fx-cards">${list.map(e => `<li class="fx-${esc(e.kind)}"><div class="sec-head"><b>${esc(e.name)}</b><span class="tag">${esc(K.EFFECT_KINDS[e.kind] || e.kind)}</span></div>
        ${e.text ? `<p class="small">${esc(e.text)}</p>` : ''}
        ${statMods(e).length ? `<p class="small"><b>К статам:</b> ${esc(modsText(statMods(e)))} <span class="muted">— учтено в характеристиках</span></p>` : ''}
        ${paramMods(e).length ? `<p class="small"><b>К параметрам:</b> ${esc(modsText(paramMods(e)))} <span class="muted">— учтено на листе</span></p>` : ''}
        ${e.note ? `<p class="small muted">${esc(e.note)}</p>` : ''}
        ${perms.gm ? `<div class="row-actions"><button type="button" class="linklike small" data-act="fxEdit" data-v="${esc(e.id)}">изменить</button><button type="button" class="linklike small danger" data-act="fxDel" data-v="${esc(e.id)}">снять</button></div>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Сейчас на персонаже нет проклятий, болезней и других эффектов от ГМ.</p>'}
      ${start.length ? `<p class="small muted">С создания: ${esc(start.join('; '))} — это часть листа создания.</p>` : ''}
    </section>`;
    if (perms.gm) html += fxForm();
    return html;
  }

  // кроме пяти характеристик эффект меняет параметры (привлекательность, ХП, реген, ОД, таланты…): у старых записей — из описания
  const modLabel = k => R.STAT_SHORT[k] || (K.PARAMS.find(p => p.k === k) || {}).t || k;
  const MOD_KEYS = () => R.STATS.concat(K.PARAMS.map(p => p.k));
  const allMods = e => (e.pm ? (e.mods || []) : (e.mods || []).concat(K.parseParamMods(e.text).filter(m => !(e.mods || []).some(x => x.stat === m.stat))));
  const statMods = e => allMods(e).filter(m => R.STATS.includes(m.stat));
  const paramMods = e => allMods(e).filter(m => !R.STATS.includes(m.stat));
  const parseAll = text => K.parseStatMods(text).concat(K.parseParamMods(text));

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
      <details class="fx-params"${K.PARAMS.some(p => (d.mods || {})[p.k]) ? ' open' : ''}><summary>Влияние на параметры и таланты <span class="muted small">— привлекательность, ХП, реген, ОД, уворот…; тоже из описания</span></summary>
        <table class="fx-mods"><thead><tr><th></th><th>прибавка</th><th>множитель</th></tr></thead><tbody>${K.PARAMS.map(p => `<tr><th>${esc(p.t)}</th>
          <td><input type="number" step="1" data-change="fxField" data-k="mods.${esc(p.k)}.add" value="${esc(((d.mods || {})[p.k] || {}).add || '')}" aria-label="${esc(p.t)}: прибавка"></td>
          <td><input type="number" step="0.1" min="0" data-change="fxField" data-k="mods.${esc(p.k)}.mul" value="${esc(((d.mods || {})[p.k] || {}).mul || '')}" aria-label="${esc(p.t)}: множитель"></td></tr>`).join('')}</tbody></table></details>
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
    MOD_KEYS().forEach(k => ['add', 'mul'].forEach(f => {
      const el = document.querySelector(`[data-k="mods.${CSS.escape(k)}.${f}"]`);
      if (el) el.value = ((d.mods || {})[k] || {})[f] || '';
    }));
  }
  const fxModsFromDraft = d => {
    const out = [];
    MOD_KEYS().forEach(k => {
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
  function sheetGear(v, rec) {
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
      worn.push(`<li><b>${esc(s.t.replace(/ \d+$/, ''))}:</b> ${esc(it.name)}${nums ? ` — ${nums}${boostShort(c)}` : ''}${c.effects.filter(e => e.src !== 'свойство' && !e.applied).length ? ` <span class="muted">(${esc(c.effects.filter(e => e.src !== 'свойство' && !e.applied).map(e => e.text).join('; '))})</span>` : ''}</li>`);
    });
    const bag = v.inv.items.filter(x => !seen.has(x.id));
    const w = v.inv.wallet;
    return `${worn.length ? `<ul class="small">${worn.join('')}</ul>` : '<p class="muted">Ничего не надето.</p>'}
      <p><b>Броня:</b> ${rec && rec.vit && v.eq.armor && rec.vit.arm !== undefined && rec.vit.arm !== null && +rec.vit.arm < v.eq.armor ? `${fmt(Math.max(0, +rec.vit.arm))} / ` : ''}${fmt(v.eq.armor)}${v.eq.magicArmor ? ` (+ маг ${fmt(v.eq.magicArmor)})` : ''}; <b>уворот:</b> ${fmt(v.res.der.dodge)}; <b>слоты:</b> ${fmt(v.res.der.slotsUsed)} / ${fmt(v.res.der.slots)}</p>
      ${bag.length ? `<p><b>Рюкзак:</b> ${bag.map(x => esc(x.name) + ((+x.qty || 1) > 1 ? ' ×' + x.qty : '')).join(', ')}</p>` : ''}
      ${rec && spellsOf(rec).length ? `<p><b>Запомненные заклинания</b> (${fmt(spellsOf(rec).length)} из ${fmt(v.res.der.spellSlots || 0)}): ${spellsOf(rec).map(x => esc(x.name) + (x.formula ? ` <span class="muted">(${esc(x.formula)})</span>` : '')).join(', ')}</p>` : ''}
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
    spEdit(b) {
      const i = +b.dataset.v, s = spellsOf(ctx().record)[i] || {};
      App.ui.spEdit = i;
      App.ui.spName = s.name || ''; App.ui.spFormula = s.formula || ''; App.ui.spNote = s.note || '';
      rerender();
      setTimeout(() => { const f = document.querySelector('.sp-form input'); if (f) f.focus(); }, 30);
    },
    spCancel() { App.ui.spEdit = null; rerender(); },
    spSave(b) {
      const i = +b.dataset.v;
      const s = { name: String(App.ui.spName || '').trim().slice(0, 80), formula: String(App.ui.spFormula || '').trim().slice(0, 300), note: String(App.ui.spNote || '').trim().slice(0, 300) };
      if (!s.name) { App.toast('Впишите название заклинания'); return; }
      const old = spellsOf(ctx().record)[i];
      spellCommit(list => { list[Math.min(i, list.length)] = s; }, old ? (old.name === s.name ? `Меняет заклинание «${s.name}»` : `Вместо «${old.name}» запоминает «${s.name}»`) : `Запоминает заклинание «${s.name}»`);
    },
    spDel(b) {
      const i = +b.dataset.v, s = spellsOf(ctx().record)[i];
      if (!s || !confirm(`Забыть заклинание «${s.name}»?`)) return;
      spellCommit(list => { list.splice(i, 1); }, `Забывает заклинание «${s.name}»`);
    },
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
    // отдать предмет (или часть стопки) другому персонажу: у себя он пропадает сразу, у получателя — появится, когда тот примет
    invGive(b) {
      const c = ctx(), P = party();
      const it = view().inv.items.find(x => x.id === b.dataset.v);
      const to = P && P.find(ch => ch.id === App.ui.invGiveTo && ch.status === 'active');
      if (!it) return;
      if (!to) { App.toast('Выберите, кому передать'); return; }
      const have = +it.qty || 1, n = have > 1 ? Math.floor(num(App.ui.invGiveN) || have) : 1;
      if (n < 1 || n > have) { App.toast(`Можно передать от 1 до ${have}`); return; }
      const item = Object.assign(clone(it), { qty: n, src: `от ${heroName(c.record)}` });
      const g = { t: newId(), iid: it.id, to: to.id, toName: heroName(to), item, ms: Date.now() };
      if (!confirm(`Передать ${giveLabel(g)} персонажу «${heroName(to)}»? У вас вещь пропадёт сразу, у получателя появится, когда он примет.`)) return;
      App.ui.invGiveTo = App.ui.invGiveN = undefined;
      if (n === have) App.ui.invSel = null;
      Dev().commit({ give: gives(c.record).concat(g) }, `Передаёт ${giveLabel(g)} → «${heroName(to)}»`);
    },
    invGiveBack(b) {
      const c = ctx();
      const g = gives(c.record).find(x => x.t === b.dataset.v);
      if (!g) return;
      const to = (party() || []).find(ch => ch.id === g.to);
      if (to && taken(to, g.t)) { App.toast('Уже принято — отменить нельзя'); return; }
      Dev().commit({ give: gives(c.record).filter(x => x.t !== g.t) }, `Отменяет передачу ${giveLabel(g)} → «${to ? heroName(to) : g.toName}»`);
    },
    invTake(b) {
      const c = ctx();
      const from = (party() || []).find(ch => ch.id === b.dataset.from);
      const g = from && gives(from).find(x => x.t === b.dataset.v && x.to === c.chid);
      if (!g) { App.toast('Передачу уже отменили'); return; }
      if (taken(c.record, g.t)) return;
      const item = Object.assign(clone(g.item), { id: newId() });
      Dev().commit({ got: gots(c.record).concat({ t: g.t, from: from.id, fromName: heroName(from), item, ms: Date.now() }) }, `Принимает ${giveLabel(g)} от «${heroName(from)}»`);
    },
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
    // ГМ выбирает, куда носится предмет; надетый на старое место снимается
    invCat(t) {
      const id = t.dataset.v, val = t.value;
      const it = view().inv.items.find(x => x.id === id);
      if (!it) return;
      gmChange((gm, v, equip) => {
        const x = gm.items.find(y => y.id === id);
        if (!x) return false;
        if (val === '') delete x.cat; else x.cat = val === 'none' ? null : val;
        Object.keys(equip).forEach(k => { if (equip[k] === id) delete equip[k]; });
      }, `«${it.name}»: ${val === '' ? 'место по названию' : val === 'none' ? 'не надевается' : 'носится — ' + K.CATS[val].toLowerCase()}`);
    },
    invEdit(b) {
      const it = view().inv.items.find(x => x.id === b.dataset.v);
      if (!it) return;
      if (!K.CRAFTABLE.includes(it.kind)) {
        const name = prompt('Название', it.name); if (name === null) return;
        const effect = prompt('Описание и эффект', it.effect || ''); if (effect === null) return;
        const was = priceOf(it);
        const priceIn = prompt('Цена за штуку: «5(се)», «2 з 50 се» или медные; пусто — как в таблице', was ? K.money(was.cu) : ''); if (priceIn === null) return;
        const cu = ownPrice(priceIn);
        if (priceIn.trim() && cu === null) { App.toast('Не понял цену — например «5(се)» или «2 з 50 се»'); return; }
        gmChange(gm => {
          const x = gm.items.find(y => y.id === it.id);
          if (!x) return false;
          x.name = name.trim() || x.name; x.effect = effect;
          if (cu === null) { delete x.price; delete x.priceOwn; } else if (!was || cu !== was.cu) { x.price = cu; x.priceOwn = true; }
        }, `Изменён предмет «${name.trim() || it.name}»`);
        return;
      }
      const d = blankDraft(it.kind);
      Object.assign(d, clone(it), { editId: it.id });
      d.craft = Object.assign(blankDraft(it.kind).craft, clone(it.craft || {}));
      if (!d.craft.soul) d.craft.soul = { creature: '', mode: '', abilities: [] };
      if (d.name === K.autoName(it)) d.name = '';
      if (!d.size) d.size = 'н';
      d.priceIn = it.priceOwn && typeof it.price === 'number' ? K.money(it.price) : '';
      App.ui.invDraft = d; App.ui.invAdd = 'craft';
      rerender();
      setTimeout(() => { const c = document.getElementById('invAdd'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 30);
    },
    invMode(b) { App.ui.invAdd = b.dataset.v; rerender(); },
    invMakeMode(b) { App.ui.invMake = b.dataset.v; rerender(); },
    invStationsToggle() { App.ui.invStations = !App.ui.invStations; rerender(); },
    // ГМ отмечает, где персонаж может работать сам
    invStation(t) {
      const name = t.dataset.v, on = t.checked;
      gmChange(gm => {
        const list = (gm.stations || []).filter(x => norm(x) !== norm(name));
        if (on) list.push(name);
        gm.stations = list;
      }, `${on ? 'Доступна крафтильня' : 'Больше нет крафтильни'} «${name}»`);
    },
    // игрок создаёт предмет в кузнице из сырья в рюкзаке
    invMake() {
      const d = App.ui.invDraft, c = ctx();
      if (!d || !d.base) { App.toast('Выберите основу предмета'); return; }
      const v = view(), chk = forgeNeeds(v, d);
      if (!chk.ok) { App.toast('Не хватает: ' + chk.list.filter(x => !x.ok).map(x => x.text).join('; ')); return; }
      const it = draftItem(Object.assign({}, d, { editId: null }));
      if (!it) { App.toast('Укажите материал'); return; }
      delete it.craft.soul; it.craft.extra = ''; it.craft.quality = 1;
      it.src = 'сделал сам';
      const byMat = K.craftPrice(it);
      if (byMat.lines.length && !byMat.unknown.length) it.price = byMat.total;
      const usedText = needText(chk.req);
      if (!confirm(`Создать «${it.name}»${it.qty > 1 ? ' ×' + it.qty : ''}? Из рюкзака уйдёт: ${usedText}.`)) return;
      const used = takeFromBag(v, chk.req);
      App.ui.invDraft = blankDraft(d.kind);
      App.ui.invSel = it.id;
      Dev().commit({ made: mades(c.record).concat({ t: newId(), ms: Date.now(), what: 'forge', item: it, used }) }, `Создаёт «${it.name}»${it.qty > 1 ? ' ×' + it.qty : ''} из: ${usedText}`);
    },
    // игрок готовит блюдо, напиток или зелье из ингредиентов в рюкзаке; бросок готовки сайт делает сам — после подтверждения
    invMakeBrew() {
      const c = ctx(), v = view(), B = window.Brew, d = B.draft();
      const chk = brewNeeds(v, d, B.compute(d));
      if (!chk.ok) { App.toast('Не хватает: ' + chk.list.filter(x => !x.ok).map(x => x.text).join('; ')); return; }
      const qty = Math.max(1, Math.floor(num(d.qty) || 1));
      const usedText = needText(chk.req);
      const name0 = String(d.name || '').trim();
      if (!confirm(`Приготовить${name0 ? ` «${name0}»` : ''}${qty > 1 ? ' ×' + qty : ''}? Из рюкзака уйдёт: ${usedText}.${d.mode !== 'potion' ? ' Бросок d100 сделает сайт.' : ''}`)) return;
      const roll = d.mode === 'potion' ? '' : d100();
      const r = B.compute(Object.assign({}, d, { roll }));
      const name = name0 || r.name;
      const it = { id: newId(), kind: r.kind, name, effect: r.summary, note: r.recipe + (roll ? `; бросок ${roll}` : ''), qty, src: 'приготовил сам' };
      if (r.cost && !r.cost.unknown.length) it.price = r.cost.total;
      const used = takeFromBag(v, chk.req);
      App.ui.brew = B.blank(d.mode);
      App.ui.invSel = it.id;
      Dev().commit({ made: mades(c.record).concat({ t: newId(), ms: Date.now(), what: 'brew', item: it, used }) },
        `Готовит «${name}»${qty > 1 ? ' ×' + qty : ''} из: ${usedText}${roll ? ` — бросок d100: ${roll}${r.spoiled ? ', испорчено' : ''}` : ''}`);
    },
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
      const it = draftItem(d);
      if (!it) { App.toast('Укажите материал'); return; }
      // цена за штуку: своя, если ГМ вписал, иначе — по материалам (если у всех материалов есть цена)
      const own = ownPrice(d.priceIn), byMat = K.craftPrice(it);
      if (String(d.priceIn || '').trim() && own === null) { App.toast('Не понял свою цену — например «5(се)» или «2 з 50 се»'); return; }
      if (own !== null) { it.price = own; it.priceOwn = true; } else if (byMat.lines.length && !byMat.unknown.length) it.price = byMat.total;
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
      if (el) el.innerHTML = tableHit(hit, t.value, num(view().res.der.charisma));
    },
    invTAdd() {
      const name = String(App.ui.invTName || '').trim();
      if (!name) { App.toast('Выберите предмет'); return; }
      const hit = K.catalog(unlocked()).find(x => norm(x.name) === norm(name));
      if (!hit) { App.toast('В таблицах такого нет — выдайте через «Своё»'); return; }
      const qty = Math.max(1, num(App.ui.invTQty) || 1);
      const it = { id: newId(), kind: hit.kind, name: hit.name, effect: hit.effect, qty, src: 'выдал ГМ' };
      const cu = K.priceCopper(hit.price), ing = ingData(hit.name);
      if (cu !== null) it.price = cu;
      if (ing) it.ing = ing;
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
    invDropQty(t) { const st = App.ui.invDrop; if (st && st.rows[+t.dataset.v]) { st.rows[+t.dataset.v].qty = Math.max(0, Math.floor(num(t.value))); rerender(); } },
    invDropTake() {
      const st = App.ui.invDrop;
      const rows = st ? st.rows.filter(r => r.qty > 0) : [];
      if (!rows.length) { App.toast('Нечего забирать'); return; }
      const cat = K.catalog(unlocked());
      gmChange(gm => {
        rows.forEach(r => {
          const hit = cat.find(x => norm(x.name) === norm(r.name)), cu = hit ? K.priceCopper(hit.price) : null;
          const it = { id: newId(), kind: hit ? hit.kind : 'item', name: hit ? hit.name : r.name, effect: hit ? hit.effect : '', qty: r.qty, src: `добыча: ${st.creature}` };
          if (cu !== null) it.price = cu;
          if (ingData(it.name)) it.ing = ingData(it.name);
          addStack(gm.items, it);
        });
      }, `Добыча с «${st.creature}»: ${rows.map(r => `${r.name}${r.qty > 1 ? ' ' + r.qty : ''}`).join(', ')}`);
      App.ui.invDrop = null;
    },
    // трактат и свиток параметра: прибавка к выбранному параметру навсегда (уровень не меняется), прочитанный удаляется;
    // прибавки от нескольких трактатов (свитков) к одному параметру собираются в одну запись
    invTome(b) {
      const it = view().inv.items.find(x => x.id === b.dataset.v);
      if (!it) return;
      const stat = R.STATS.includes(App.ui.invTome) ? App.ui.invTome : 's';
      const n = Math.floor(num(App.ui.invTomeN) || K.tomeBonus(it)), sn = R.STAT_NAMES[stat].toLowerCase();
      if (n <= 0) { App.toast('Укажите, на сколько повысить'); return; }
      const what = /^свиток/.test(norm(it.name)) ? 'Свиток' : 'Трактат';
      if (!confirm(`Прочитать «${it.name}»: ${sn} +${n} навсегда?`)) return;
      let gone = false;
      gmChange((gm, v, equip) => {
        const x = gm.items.find(y => y.id === it.id);
        if (!x) return false;
        if ((+x.qty || 1) > 1) x.qty = (+x.qty) - 1;
        else { gm.items = gm.items.filter(y => y.id !== it.id); Object.keys(equip).forEach(k => { if (equip[k] === it.id) delete equip[k]; }); gone = true; }
        gm.effects = gm.effects || [];
        const name = `${what} параметра: ${sn}`;
        const e = gm.effects.find(y => y.kind === 'tome' && y.name === name);
        if (e) {
          const m = e.mods.find(y => y.stat === stat && y.op === 'add');
          m.v += n;
          e.count = (e.count || 1) + 1;
          e.text = `${sn} +${m.v} навсегда`;
          e.note = `прочитано: ${e.count}`;
        } else gm.effects.push({ id: newId(), kind: 'tome', name, text: `${sn} +${n} навсегда`, note: 'прочитано: 1', count: 1, mods: [{ stat, op: 'add', v: n }], at: Date.now() });
      }, `Прочитан «${it.name}»: ${sn} +${n} навсегда`);
      if (gone) App.ui.invSel = null;
      App.ui.invTomeN = undefined;
    },
    // сбор трав из калькулятора — ингредиенты сразу в рюкзак
    invHerbsTake() {
      const list = (App.ui.brewHerbs || []).filter(x => x.qty > 0);
      if (!list.length) return;
      gmChange(gm => {
        list.forEach(x => {
          const i = window.Brew.ing(x.n), cu = i ? K.priceCopper(i.price) : null;
          const it = { id: newId(), kind: 'item', name: x.n, effect: i ? i.e.map(e => e[0]).filter(Boolean).join(', ') : '', qty: x.qty, src: 'сбор трав' };
          if (cu !== null) it.price = cu;
          if (ingData(x.n)) it.ing = ingData(x.n);
          addStack(gm.items, it);
        });
      }, `Сбор трав: ${list.map(x => `${x.n}${x.qty > 1 ? ' ×' + x.qty : ''}`).join(', ')}`);
      App.ui.brewHerbs = null;
    },
    // блюдо, напиток или зелье из калькулятора (js/brew.js)
    invBrewSave() {
      const d = window.Brew.draft(), r = window.Brew.compute(d);
      if (!r.n) { App.toast('Добавьте ингредиенты'); return; }
      if (r.warnings.length && !confirm(`Есть замечания:\n${r.warnings.join('\n')}\n\nВсё равно выдать?`)) return;
      const name = String(d.name || '').trim() || r.name;
      const qty = Math.max(1, Math.floor(num(d.qty) || 1));
      const it = { id: newId(), kind: r.kind, name, effect: r.summary, note: r.recipe, qty, src: 'выдал ГМ' };
      if (r.cost && !r.cost.unknown.length) it.price = r.cost.total;      // цена ингредиентов за штуку
      gmChange(gm => { addStack(gm.items, it); }, `Получено: «${name}»${qty > 1 ? ' ×' + qty : ''} (${r.summary})`);
      App.ui.brew = window.Brew.blank(d.mode);
    },
    invCAdd() {
      const name = String(App.ui.invCName || '').trim();
      if (!name) { App.toast('Впишите название'); return; }
      const it = { id: newId(), kind: 'custom', name, effect: String(App.ui.invCText || ''), cat: App.ui.invCCat || '', qty: Math.max(1, Math.floor(num(App.ui.invCQty) || 1)), src: 'выдал ГМ' };
      const cu = ownPrice(App.ui.invCPrice);
      if (String(App.ui.invCPrice || '').trim() && cu === null) { App.toast('Не понял цену — например «5(се)» или «2 з 50 се»'); return; }
      if (cu !== null) { it.price = cu; it.priceOwn = true; }
      gmChange(gm => { gm.items.push(it); }, `Получен предмет «${name}»`);
      ['invCName', 'invCText', 'invCCat', 'invCQty', 'invCPrice'].forEach(k => { App.ui[k] = undefined; });
    },
    // ГМ выдаёт (+) или забирает (−); проверка — по тому, что сейчас в кошельке, с учётом трат игрока
    invWallet() {
      const changes = [];
      gmChange((gm, v) => {
        const w = v.inv.wallet;
        C.CURRENCIES.forEach(c => {
          const dv = Math.round(num(App.ui['invW_' + c.id]));
          if (!dv) return;
          if (num(w[c.id]) + dv < 0) { App.toast(`Не хватает: ${c.name} (есть ${fmt(num(w[c.id]))})`); return; }
          gm.wallet[c.id] = num(gm.wallet[c.id]) + dv;
          changes.push(`${dv > 0 ? '+' : '−'}${Math.abs(dv)} ${c.id}`);
        });
        gm.wallet.other = gm.wallet.other || [];
        otherOf(w).forEach((x, i) => {
          const dv = Math.round(num(App.ui['invWo_' + i]));
          if (!dv) return;
          if (num(x.qty) + dv < 0) { App.toast(`Не хватает: ${x.name} (есть ${fmt(num(x.qty))})`); return; }
          const g = gm.wallet.other.find(y => y && norm(y.name) === norm(x.name));
          if (g) g.qty = num(g.qty) + dv; else gm.wallet.other.push({ name: x.name, qty: dv });
          changes.push(`${dv > 0 ? '+' : '−'}${Math.abs(dv)} ${x.name}`);
        });
        if (!changes.length) return false;
      }, () => `ГМ: кошелёк ${changes.join(', ')}`);
      C.CURRENCIES.forEach(c => { App.ui['invW_' + c.id] = ''; });
      Object.keys(App.ui).filter(k => k.startsWith('invWo_')).forEach(k => { App.ui[k] = ''; });
    },
    invWalletNew() {
      const name = String(App.ui.invWnName || '').trim(), qty = Math.round(num(App.ui.invWnQty));
      if (!name || !qty) { App.toast('Впишите валюту и количество'); return; }
      const have = num((otherOf(view().inv.wallet).find(y => norm(y.name) === norm(name)) || {}).qty);
      if (have + qty < 0) { App.toast(`Не хватает: ${name} (есть ${fmt(have)})`); return; }
      gmChange(gm => {
        gm.wallet.other = gm.wallet.other || [];
        const x = gm.wallet.other.find(y => norm(y.name) === norm(name));
        if (x) x.qty = num(x.qty) + qty; else gm.wallet.other.push({ name, qty });
      }, `ГМ: кошелёк ${qty > 0 ? '+' : '−'}${Math.abs(qty)} ${name}`);
      App.ui.invWnName = ''; App.ui.invWnQty = '';
    },
    // игрок: заплатить со сдачей
    invPay() {
      const v = view(), w = v.inv.wallet;
      const coin = C.CURRENCIES.find(c => c.id === (App.ui.invPayCoin || 'м')) || C.CURRENCIES[C.CURRENCIES.length - 1];
      const n = Math.round(num(App.ui.invPayN));
      if (n <= 0) { App.toast('Впишите, сколько заплатить'); return; }
      const after = K.pay(w, n * coin.rate);
      if (!after) { App.toast(`Не хватает денег: в кошельке ${K.money(K.walletCopper(w))}`); return; }
      const why = String(App.ui.invPayWhy || '').trim();
      purseCommit(w, after, `Платит ${fmt(n)} ${coin.id}${why ? ` — ${why}` : ''} (${coinDiff(w, after)})`);
      App.ui.invPayN = ''; App.ui.invPayWhy = '';
    },
    invBreak() {
      const w = view().inv.wallet, id = App.ui.invBreakCoin || 'се';
      const after = K.breakCoin(w, id);
      if (!after) { App.toast(`Нет монеты «${id}», чтобы разменять`); return; }
      purseCommit(w, after, `Разменивает монету: ${coinDiff(w, after)}`);
    },
    invGather() {
      const w = view().inv.wallet, after = K.gatherCoins(w);
      const d = coinDiff(w, after);
      if (!d) { App.toast('Собирать нечего: мелких монет меньше сотни'); return; }
      purseCommit(w, after, `Собирает мелочь: ${d}`);
    },
    invSpendOther() {
      const w = view().inv.wallet;
      const purse = JSON.parse(JSON.stringify(ctx().record.purse || {}));
      purse.other = purse.other || {};
      const done = [];
      for (const [i, x] of otherOf(w).entries()) {
        const n = Math.round(num(App.ui['invSo_' + i]));
        if (n <= 0) continue;
        if (n > num(x.qty)) { App.toast(`Не хватает: ${x.name} (есть ${fmt(num(x.qty))})`); return; }
        purse.other[x.name] = num(purse.other[x.name]) - n;
        done.push(`${fmt(n)} ${x.name}`);
      }
      if (!done.length) { App.toast('Впишите, сколько потратить'); return; }
      Dev().commit({ purse }, `Тратит ${done.join(', ')}`);
      Object.keys(App.ui).filter(k => k.startsWith('invSo_')).forEach(k => { App.ui[k] = ''; });
    },

    // состояния
    fxKind(t) { App.ui.fxDraft = Object.assign(blankFx(), { kind: t.value, editId: (App.ui.fxDraft || {}).editId }); rerender(); },
    fxPick(t) {
      const d = App.ui.fxDraft || (App.ui.fxDraft = blankFx());
      d.name = t.value;
      const hit = K.effectSources(unlocked()).find(x => x.kind === d.kind && norm(x.name) === norm(t.value));
      if (hit) { d.text = hit.text; d.mods = fxDraftMods(parseAll(hit.text)); fxFillDom(d); }
    },
    fxField(t) {
      const d = App.ui.fxDraft || (App.ui.fxDraft = blankFx());
      setPath(d, t.dataset.k, t.value);
      if (t.dataset.k === 'text' && !Object.values(d.mods || {}).some(m => num(m.add) || num(m.mul))) { d.mods = fxDraftMods(parseAll(t.value)); fxFillDom(d); }
    },
    fxSave() {
      const d = App.ui.fxDraft;
      if (!d || !String(d.name || '').trim()) { App.toast('Впишите название эффекта'); return; }
      // pm: прибавки к параметрам задал ГМ в форме — описание больше не разбирается
      const e = { id: d.editId || newId(), kind: d.kind, name: d.name.trim(), text: d.text || '', note: d.note || '', mods: fxModsFromDraft(d), pm: true, at: Date.now() };
      const m = e.mods.map(x => `${modLabel(x.stat)} ${x.op === 'mul' ? '×' + fmt(x.v) : signed(x.v)}`).join(', ');
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
      App.ui.fxDraft = { kind: e.kind, name: e.name, text: e.text, note: e.note, mods: fxDraftMods(allMods(e)), editId: e.id };
      rerender();
    },
    fxCancel() { App.ui.fxDraft = blankFx(); rerender(); },
    fxDel(b) {
      const e = ((ctx().record.gm || {}).effects || []).find(x => x.id === b.dataset.v);
      if (!e || !confirm(`Снять «${e.name}»?`)) return;
      gmChange(gm => { gm.effects = (gm.effects || []).filter(x => x.id !== e.id); }, `Снято: ${(K.EFFECT_KINDS[e.kind] || '').toLowerCase()} «${e.name}»`);
    }
  });

  window.Inv = { gearTab, effectsTab, sheetGear, sheetExtra, equipInto, incoming };
})();
