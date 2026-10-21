/*
 * Снаряжение в игре: кастомные предметы, слоты экипировки, валюта, состояния.
 * Только расчёты, без интерфейса (интерфейс — js/inventory.js).
 *
 * Лист игрока: на старте оружие и броня «монолитные из одного вида материала».
 * Лист «механики» (крафтильня, ковка): в игре предмет собирается из любых слитков по единицам,
 * «для получения эффекта металла нужно добавить не менее половины слитка»; напыление (1 на оружие),
 * точильный станок и броневой верстак (+25% за раз, до 10 раз), зачарование глифами (до 3, мощь — 50%
 * от атаки или брони), инкрустация камнями, модули, модели (с 100 ур. ремесла), камень душ,
 * предмет из монстра (алтарь крови), усиленное ремесло (2Х / 3Х), обогатитель (2Х эффект материала).
 *
 * Предмет:
 *   { id, kind: weapon|ammo|armor|shield|jewelry|instrument|prosthesis|item|material|crystal|artifact|food|potion|custom,
 *     name, base, qty, note, effect, slots, cat, src,
 *     craft: { parts: [{ mat, u, role: 'dmg'|'non' }], coat: [mat], sharpen, modules: [name], model,
 *              glyphs: [{ sym, temp }], inlays: [mat], quality, enrich, soul: { creature, mode, abilities }, extra } }
 */
(function () {
  'use strict';
  const R = window.Rules, C = window.GM_CONFIG, D = () => window.GAME_DATA;
  const norm = R.norm, fmt = R.fmt, ri = R.ri;
  const CR = C.CRAFT;
  const r2 = x => Math.round(x * 100) / 100;
  const num = v => { const x = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };

  // ------------------------------------------------------------ материалы и основы
  let crystalIx = null;
  function crystal(name) {
    if (!crystalIx) crystalIx = new Map((D().crystals || []).map(c => [norm(c.name), c]));
    return crystalIx.get(norm(name));
  }
  const material = name => (name ? R.index.material.get(norm(name)) || crystal(name) || null : null);
  const isCrystal = name => !!crystal(name) && !R.index.material.get(norm(name));
  const allMaterials = () => (D().materials || []).concat(D().crystals || []);

  const table = id => ((D().gear.tables || {})[id] || { rows: [] }).rows.map(r => r.c);
  const BASES = {
    weapon: () => D().gear.weapons.filter(w => !R.NOT_WEAPON.includes(w.name)),
    ammo: () => D().gear.weapons.filter(w => R.NOT_WEAPON.includes(w.name)),
    armor: () => D().gear.armor,
    shield: () => D().gear.shields,
    jewelry: () => table('jewelry').map(c => ({ name: c[0], u: num(c[1]), slots: num(c[2]), count: c[3] })),
    instrument: () => table('instruments').map(c => ({ name: c[0], u: num(c[1]), bonus: num(c[2]), skill: num(c[3]) })),
    prosthesis: () => table('prosthetics').map(c => ({ name: c[0], u: num(c[1]), slots: num(c[3]), pen: num(c[4]), limb: c[5] || '', skill: num(c[6]) }))
  };
  const KIND_NAMES = {
    weapon: 'Оружие', ammo: 'Боеприпасы', armor: 'Броня', shield: 'Щит', jewelry: 'Украшение', instrument: 'Инструмент',
    prosthesis: 'Протез', item: 'Предмет', material: 'Слиток / материал', crystal: 'Камень', artifact: 'Артефакт',
    food: 'Еда', potion: 'Зелье', drop: 'Добыча', custom: 'Своё'
  };
  const CRAFTABLE = ['weapon', 'ammo', 'armor', 'shield', 'jewelry', 'instrument', 'prosthesis'];
  const baseOf = (kind, name) => (BASES[kind] ? BASES[kind]().find(b => norm(b.name) === norm(name)) : null) || null;
  const modules = () => table('modules').map(c => ({ name: c[0], u: num(c[1]), fx: c[2] }));
  const models = () => table('modern').map(c => ({ id: (c[0].match(/модель\s+(\S+)/i) || [])[1] || c[0], name: c[0], fx: c[1] }));

  // ------------------------------------------------------------ слоты экипировки
  // куда надевается: категория слота по виду и названию основы
  function slotCat(item) {
    if (!item) return null;
    if (item.cat !== undefined && item.cat !== '') return item.cat || null;
    const n = norm(item.base || item.name);
    switch (item.kind) {
      case 'weapon': case 'shield': case 'instrument': return 'hand';
      case 'ammo': return Object.keys(R.AMMO).map(norm).includes(n) ? 'ammo' : null;
      case 'prosthesis': return 'prosth';
      case 'armor':
        if (/шлем|капюшон/.test(n)) return 'head';
        if (/маска/.test(n)) return 'face';
        if (/кирса|мантия/.test(n)) return 'body';
        if (/плащ/.test(n)) return 'cloak';
        if (/перчат|перчи/.test(n)) return 'gloves';
        if (/поножи/.test(n)) return 'legs';
        if (/ботин/.test(n)) return 'feet';
        return 'body';
      case 'jewelry':
        if (/кольц/.test(n)) return 'ring';
        if (/амулет/.test(n)) return 'neck';
        if (/браслет/.test(n)) return 'bracelet';
        if (/брош/.test(n)) return 'brooch';
        if (/пояс/.test(n)) return 'belt';
        if (/серьг/.test(n)) return 'earring';
        if (/нос/.test(n)) return 'nose';
        if (/бров/.test(n)) return 'brow';
        return 'neck';
      default: return null;
    }
  }
  const CATS = {
    head: 'Голова', face: 'Лицо', neck: 'Амулет', cloak: 'Плащ', body: 'Тело', gloves: 'Перчатки', belt: 'Пояс',
    legs: 'Поножи', feet: 'Ботинки', brooch: 'Брошь', hand: 'Рука', ammo: 'Боеприпасы', ring: 'Кольцо',
    bracelet: 'Браслет', earring: 'Серьга', nose: 'Нос', brow: 'Бровь', prosth: 'Протез'
  };
  // все слоты персонажа; рук — сколько у расы, браслетов «2 / +2 если есть доп руки»
  function slotsFor(hands) {
    const h = Math.max(1, hands || 2);
    const one = id => [{ id, cat: id, t: CATS[id] }];
    const many = (cat, n) => Array.from({ length: n }, (_, i) => ({ id: cat + (i + 1), cat, t: `${CATS[cat]} ${i + 1}` }));
    return [].concat(one('head'), one('face'), one('neck'), one('cloak'), one('body'), one('gloves'), one('belt'),
      one('legs'), one('feet'), one('brooch'), many('hand', h), one('ammo'), many('ring', 10), many('bracelet', h > 2 ? 4 : 2),
      many('earring', 6), one('nose'), many('brow', 2), many('prosth', 4));
  }

  // ------------------------------------------------------------ расчёт кастомного предмета
  // ctx: { sizeId (рост персонажа), stats, halfReq, race, oniClan, creatures }
  // У предмета свой размер (item.size): ГМ может выдать гигантскому дракону копьё мышиного размера —
  // под рост персонажа предмет сам не подстраивается. По умолчанию — нормальный.
  const sizeOf = id => R.SIZES.find(x => x.id === id) || R.SIZES.find(x => x.id === 'н');
  const isBag = it => /сумка/i.test(it.name || '');
  // «1 предмет занимает 1 слот» (стопка одинаковых — тоже 1, см. INVENTORY в config.js); сумки места не занимают
  const slotsOf = it => (isBag(it) || it.slots === 0 ? 0 : 1);
  function compute(item, ctx) {
    ctx = ctx || {};
    const size = sizeOf(item.size);
    const k = size.k;
    const kind = item.kind;
    const cr = item.craft || {};
    const base = baseOf(kind, item.base || item.name);
    const out = { item, kind, base, cat: slotCat(item), effects: [], warnings: [], notes: [], glyphs: [],
      damage: null, armor: null, pen: 0, req: [], statFx: { l: 0, hpRegen: 0 }, hands: 0, slots: slotsOf(item), sockets: 0, mult: [], bonus: [], size };
    if (!CRAFTABLE.includes(kind)) {
      if (item.effect) out.effects.push({ src: KIND_NAMES[kind] || 'эффект', text: item.effect });
      return out;
    }
    if (ctx.sizeId && size.id !== ctx.sizeId) out.notes.push(`Сделан под рост «${size.name.toLowerCase()}», а персонаж — «${sizeOf(ctx.sizeId).name.toLowerCase()}».`);
    if (!base) { out.warnings.push('Неизвестная основа предмета.'); return out; }
    const isWeapon = kind === 'weapon' || kind === 'ammo';
    const isArmor = kind === 'armor' || kind === 'shield' || kind === 'prosthesis';
    const parts = (cr.parts || []).filter(p => p && p.mat && num(p.u) > 0).map(p => ({ mat: material(p.mat), name: p.mat, u: r2(num(p.u)), role: p.role === 'non' ? 'non' : 'dmg' }));
    parts.filter(p => !p.mat).forEach(p => out.warnings.push(`Неизвестный материал «${p.name}».`));
    const mods = (cr.modules || []).map(n => modules().find(m => norm(m.name) === norm(n))).filter(Boolean);
    const modU = r2(mods.reduce((a, m) => a + (m.u || 0), 0));

    // сколько единиц нужно
    if (kind === 'weapon') { out.needDmg = R.sizeUnits(base.u, k); out.needNon = r2(base.un + modU); }
    else if (kind === 'ammo') { out.needDmg = R.sizeUnits(base.u, k); out.needNon = 0; }
    else if (isArmor) { out.needDmg = 0; out.needNon = r2(R.sizeUnits(base.u || 0, k) + modU); }
    else { out.needDmg = 0; out.needNon = r2((base.u || 0) + modU); }
    out.need = r2(out.needDmg + out.needNon);
    const haveDmg = r2(parts.filter(p => p.role === 'dmg').reduce((a, p) => a + p.u, 0));
    const haveAll = r2(parts.reduce((a, p) => a + p.u, 0));
    out.have = haveAll; out.haveDmg = isWeapon ? haveDmg : 0;
    if (!parts.length) out.warnings.push('Добавьте материал — из чего сделан предмет.');
    else if (isWeapon && kind === 'weapon' && Math.abs(haveDmg - out.needDmg) > 0.01) out.warnings.push(`На урон нужно ${fmt(out.needDmg)} ед., распределено ${fmt(haveDmg)}.`);
    if (parts.length && Math.abs(haveAll - out.need) > 0.01) out.warnings.push(`Всего нужно ${fmt(out.need)} ед. материала, распределено ${fmt(haveAll)}.`);

    // урон и броня
    const model = String(cr.model || '').toUpperCase();
    const dmgParts = isWeapon ? (model === 'A' || kind === 'ammo' ? parts : parts.filter(p => p.role === 'dmg')) : (model === 'A' ? parts : []);
    const armParts = isArmor || model === 'D' ? parts : [];
    let damage = dmgParts.length ? dmgParts.reduce((a, p) => a + (p.mat ? p.mat.dmg * p.u : 0), 0) : null;
    let armor = armParts.length ? armParts.reduce((a, p) => a + (p.mat ? p.mat.arm * p.u : 0), 0) : null;
    if (damage !== null) damage = ri(damage);
    if (armor !== null) armor = ri(armor);
    if (kind === 'weapon' && norm(base.name) === 'катар') { const non = parts.filter(p => p.role === 'non'); if (non.length) armor = ri(non.reduce((a, p) => a + (p.mat ? p.mat.dmg * p.u : 0), 0)); }
    const mult = [];
    const applyMul = (m, src, onDmg, onArm) => {
      if (onDmg && damage !== null) damage = ri(damage * m);
      if (onArm && armor !== null) armor = ri(armor * m);
      mult.push(`${src} ×${fmt(m)}`);
    };
    if (model === 'A' && damage !== null) applyMul(1.5, 'модель A', true, false);
    if (model === 'D' && armor !== null) applyMul(1.5, 'модель D', false, true);
    if (model === 'T') applyMul(2, 'модель T', true, true);
    const sharpen = Math.max(0, Math.min(CR.SHARPEN_MAX, Math.floor(num(cr.sharpen))));
    if (num(cr.sharpen) > CR.SHARPEN_MAX) out.warnings.push(`Заточка / улучшение — не больше ${CR.SHARPEN_MAX} раз.`);
    if (sharpen) {
      const m = 1 + CR.SHARPEN_STEP * sharpen / 100;
      if (isWeapon) applyMul(m, `заточка ${sharpen}`, true, false); else if (isArmor) applyMul(m, `улучшение ${sharpen}`, false, true);
    }
    const q = [1, 2, 3].includes(+cr.quality) ? +cr.quality : 1;
    if (q > 1) applyMul(q, `усиленное ремесло`, true, true);
    // раса: бонусы к оружию, клан они, баситины
    out.bonus = [];
    if (kind === 'weapon' && damage !== null) {
      const race = ctx.race;
      if (race && race.id === 'баситины' && base.hands === 1 && /(^|\s)меч(\s|$)/.test(norm(base.name))) applyMul(2, 'баситины: одноручный меч', true, false);
      (race ? race.fx : []).forEach(f => {
        if ((f.k === 'weapon' || f.k === 'weaponAcc') && f.types.map(norm).includes(norm(base.name)) && !f.cond) out.bonus.push({ kind: f.k === 'weapon' ? 'урон' : 'точность', v: f.v, src: f.half ? 'раса (½)' : 'раса' });
      });
      if (race && race.id === 'они' && ctx.oniClan) {
        const cl = R.ONI_CLANS.find(c => c.id === ctx.oniClan);
        if (cl && norm(cl.weapon) === norm(base.name)) out.bonus.push({ kind: 'урон', v: 50, src: `оружие клана (${cl.id})` });
      }
      damage += out.bonus.filter(b => b.kind === 'урон').reduce((a, b) => a + b.v, 0);
    }
    // существо в предмете
    const soul = cr.soul && cr.soul.creature ? cr.soul : null;
    if (soul) {
      const c = (ctx.creatures || []).find(x => norm(x.n) === norm(soul.creature));
      if (!c) out.warnings.push(`Существо «${soul.creature}» не найдено (бестиарий открывается паролем ГМ).`);
      else if (soul.mode === 'monster') {
        // «предмет из монстра»: с — физ урон, и — маг урон, т — физ броня, д — маг броня
        if (isWeapon) { damage = (damage || 0) + ri(c.s); out.magicDamage = ri(c.i); }
        if (isArmor) { armor = (armor || 0) + ri(c.t); out.magicArmor = ri(c.d); }
        out.effects.push({ src: 'предмет из монстра', text: `«${c.n}»: гибридный ${isWeapon ? 'урон (физ + маг)' : 'доспех (физ + маг)'}; 1 пассивная и 1 активная способность существа${(soul.abilities || []).length ? ': ' + soul.abilities.join('; ') : ''}` });
      } else {
        // «предмет с заточённой душой» / камень душ: сумма статов существа
        const sum = ri(c.t + c.d + c.s + c.i + c.l);
        if (isWeapon) damage = (damage || 0) + sum; else armor = (armor || 0) + sum;
        out.effects.push({ src: 'заточённая душа', text: `«${c.n}»: +${sum} ${isWeapon ? 'урона' : 'брони'} (сумма статов); 50% урона наносится стихией существа (символ ${c.sym || '—'}); можно призвать заточённое существо` });
      }
    }
    out.damage = damage; out.armor = armor; out.mult = mult; out.quality = q; out.sharpen = sharpen;

    // эффекты материалов: не меньше половины слитка (для мелких предметов — 0,1)
    const field = kind === 'jewelry' ? 'ej' : isArmor ? 'ea' : 'ew';
    const small = out.need <= 0.5;
    const minU = small ? CR.EFFECT_MIN_SMALL : CR.EFFECT_MIN_UNITS;
    const byMat = new Map();
    parts.forEach(p => { if (p.mat) { const x = byMat.get(p.mat.name) || { m: p.mat, u: 0 }; x.u = r2(x.u + p.u); byMat.set(p.mat.name, x); } });
    const present = name => [...byMat.values()].some(x => norm(x.m.name) === norm(name) && x.u >= minU)
      || (cr.coat || []).some(n => norm(n) === norm(name)) || (cr.inlays || []).some(n => norm(n) === norm(name));
    const enrich = !!cr.enrich;
    const effText = (eff, units) => {
      if (!eff || !eff.t) return null;
      let t = eff.t, scale = eff.sc || 'за предмет';
      if (eff.sc === 'за единицу') { const x = R.multiplyEffect(eff.t, units); t = x || `${eff.t} (× ${fmt(units)} ед.)`; }
      if (enrich) { const x = R.multiplyEffect(t, 2); t = x || `${t} (×2, обогатитель)`; }
      return { t, scale };
    };
    if (out.need > 0 && out.need <= CR.EFFECT_MIN_SMALL + 1e-9) out.notes.push('Для предмета в 0,1 ед. эффект металла даёт только напыление.');
    else byMat.forEach(x => {
      if (x.u < minU) { out.notes.push(`${x.m.name}: ${fmt(x.u)} ед. — меньше ${fmt(minU)}, эффект материала не действует.`); return; }
      const e = effText(x.m[field], x.u);
      if (e) out.effects.push({ src: `${x.m.name}${byMat.size > 1 ? `, ${fmt(x.u)} ед.` : ''}`, text: e.t, scale: e.scale });
    });
    // напыление
    const coat = (cr.coat || []).filter(Boolean);
    if (coat.length > CR.COAT_MAX) out.warnings.push(`Напылений ${coat.length}: обычно доступно ${CR.COAT_MAX} (больше — только с особыми бонусами).`);
    coat.forEach(n => { const m = material(n); if (!m) { out.warnings.push(`Неизвестный материал напыления «${n}».`); return; } const e = effText(m[field === 'ej' ? 'ew' : field], 1); if (e) out.effects.push({ src: `напыление: ${m.name}`, text: e.t }); });
    // инкрустация и украшения: «слоты» в таблице оружия и брони — гнёзда для драгоценных камней
    out.sockets = num(base.slots);
    const inl = (cr.inlays || []).filter(Boolean);
    if (inl.length > out.sockets) out.warnings.push(`Камней ${inl.length}, а гнёзд у предмета ${out.sockets}.`);
    (cr.inlays || []).filter(Boolean).forEach(n => { const m = material(n); if (!m) { out.warnings.push(`Неизвестный камень «${n}».`); return; } if (m.ej && m.ej.t) out.effects.push({ src: `инкрустация: ${m.name}`, text: enrich ? (R.multiplyEffect(m.ej.t, 2) || m.ej.t + ' (×2)') : m.ej.t }); });
    // модули и модель
    const crystalItem = parts.length > 0 && parts.every(p => p.mat && isCrystal(p.mat.name));
    out.crystal = crystalItem;
    if (crystalItem && mods.length) out.warnings.push('Кристальное оружие не имеет гнёзд для модификаторов — модули не встанут.');
    mods.forEach(m => out.effects.push({ src: `модуль: ${m.name}`, text: m.fx }));
    if (model) { const md = models().find(x => x.id.toUpperCase() === model); if (md) out.effects.push({ src: md.name, text: md.fx }); }
    if (base.fx) out.effects.unshift({ src: 'свойство', text: base.fx });
    if (kind === 'instrument') out.effects.push({ src: 'инструмент', text: `+${base.bonus}% к аккорду; к единичному аккорду добавляется только 25% мощности материала` });
    if (cr.extra) out.effects.push({ src: 'особое', text: cr.extra });

    // зачарование глифами: до 3 (сфалерит +2), мощь 50% атаки / брони; таумий 2Х, рунный кристалл 4Х
    const gl = (cr.glyphs || []).filter(g => g && g.sym);
    out.glyphMax = CR.GLYPH_MAX + (present('сфалерит') ? 2 : 0);
    let gmul = 1;
    if (present('таумий')) gmul *= 2;
    if (present('рунный кристалл')) gmul *= 4;
    const basePower = isWeapon ? (damage || 0) : (armor || damage || 0);
    out.glyphPower = ri(basePower * CR.GLYPH_POWER / 100 * gmul);
    out.glyphMul = gmul;
    gl.forEach((g, i) => out.glyphs.push({ sym: g.sym, temp: !!g.temp, power: out.glyphPower, over: i >= out.glyphMax }));
    const over = Math.max(0, gl.length - out.glyphMax);
    if (over) out.warnings.push(`Глифов ${gl.length} при пределе ${out.glyphMax}: каждый лишний — ${CR.GLYPH_RISK}% шанс разрушить предмет, шанс складывается (сейчас ${Math.min(100, over * CR.GLYPH_RISK)}%).`);

    // требования, штраф, слоты, руки
    out.req = base.req ? R.reqCheck(base.req, k, ctx.stats || { t: 0, d: 0, s: 0, i: 0, l: 0 }, ctx.halfReq) : [];
    // число после дроби в требованиях («2л, 25с / 13») — уровень ремесла, чтобы игрок изготовил предмет сам;
    // выданный ГМ предмет от этого не зависит, поэтому только сравниваем с навыком персонажа
    out.skill = typeof base.skill === 'number' ? base.skill : null;
    out.craftHave = typeof ctx.craft === 'number' ? ctx.craft : null;
    out.skillOk = out.skill === null || out.craftHave === null ? null : out.craftHave >= out.skill;
    out.pen = isArmor ? (model === 'L' ? 0 : (base.pen || 0)) : 0;
    if (out.pen && ctx.flags && ctx.flags.noMediumArmorPenalty && base.cls === 'средняя') { out.pen = 0; out.notes.push('Средние доспехи не дают штраф (раса).'); }
    // мифрил в броне: «сокращает штраф ловкости брони в 2 раза»
    if (out.pen && isArmor && [...byMat.values()].some(x => x.u >= minU && /штраф ловкости брони в 2 раза/.test((x.m.ea || {}).t || ''))) { out.pen = ri(out.pen / 2); out.notes.push('Штраф ловкости уменьшен вдвое материалом.'); }
    if (isWeapon && model === 'L') out.notes.push('Модель L: штраф ловкости атаки −5.');
    out.statFx = isArmor ? [...byMat.values()].filter(x => x.u >= minU).reduce((a, x) => {
      const se = R.armorStatEffects((x.m.ea || {}).t, (x.m.ea || {}).sc === 'за единицу', x.u);
      return { l: a.l + se.l, hpRegen: a.hpRegen + se.hpRegen };
    }, { l: 0, hpRegen: 0 }) : { l: 0, hpRegen: 0 };
    out.hands = kind === 'weapon' ? (base.hands || 1) : kind === 'shield' || kind === 'instrument' ? 1 : 0;
    out.skill = base.skill;
    return out;
  }

  // название по составу: «длинный меч (сталь, мифрил)»
  function autoName(item) {
    const mats = [...new Set(((item.craft || {}).parts || []).map(p => p.mat).filter(Boolean))];
    return `${item.base || KIND_NAMES[item.kind] || 'предмет'}${mats.length ? ` (${mats.join(', ')})` : ''}`;
  }

  // ------------------------------------------------------------ стартовое снаряжение → инвентарь
  function startInventory(state, res0) {
    const items = [], equip = {};
    const g = res0.gear || {};
    const size = res0.size ? res0.size.id : 'н';   // стартовое снаряжение сделано под рост персонажа
    if (g.weapon && g.weapon.m) {
      const w = g.weapon;
      const parts = [{ mat: w.m.name, u: w.units, role: 'dmg' }];
      if (w.unitsNon) parts.push({ mat: w.m.name, u: w.unitsNon, role: 'non' });
      items.push({ id: 'start-weapon', kind: 'weapon', base: w.w.name, name: `${w.w.name} (${w.m.name})`, qty: 1, size, src: 'старт', craft: { parts } });
      equip.hand1 = 'start-weapon';
      if ((w.w.hands || 1) > 1) for (let i = 2; i <= w.w.hands; i++) equip['hand' + i] = 'start-weapon';
    }
    if (g.ammo && g.ammo.m) {
      items.push({ id: 'start-ammo', kind: 'ammo', base: g.ammo.a.name, name: `${g.ammo.a.name} (${g.ammo.m.name})`, qty: 1, size, src: 'старт', craft: { parts: [{ mat: g.ammo.m.name, u: g.ammo.units, role: 'dmg' }] } });
      equip.ammo = 'start-ammo';
    }
    if (g.armor && g.armor.m) {
      const a = g.armor;
      const it = { id: 'start-armor', kind: a.isShield ? 'shield' : 'armor', base: a.a.name, name: `${a.a.name} (${a.m.name})`, qty: 1, size, src: 'старт', craft: { parts: [{ mat: a.m.name, u: a.units, role: 'non' }] } };
      items.push(it);
      if (a.isShield) { const free = Object.keys(equip).filter(k => k.startsWith('hand')).length + 1; equip['hand' + free] = 'start-armor'; }
      else equip[slotCat(it)] = 'start-armor';
    }
    (state.items || []).forEach((x, i) => {
      if (!x || !x.kind) return;
      if (x.kind === 'bag') { const b = R.index.bags.find(y => norm(y.name) === norm(x.name)); if (b) items.push({ id: 'start-item-' + i, kind: 'item', name: b.name, effect: b.effect, qty: 1, src: 'старт' }); }
      else if (x.kind === 'food') { const f = (D().alchemy.food || []).find(y => norm(y.name) === norm(x.name)); if (f) items.push({ id: 'start-item-' + i, kind: 'food', name: f.name, effect: f.e.join(', '), qty: 1, src: 'старт' }); }
      else if (x.kind === 'potion' && x.effect) items.push({ id: 'start-item-' + i, kind: 'potion', name: `Зелье: ${x.effect}${x.note ? ' — ' + x.note : ''}`, effect: `${+x.power || 0}е`, qty: 1, src: 'старт' });
    });
    if (state.misc) items.push({ id: 'start-misc', kind: 'item', name: 'Прочие мелочи', effect: state.misc, qty: 1, src: 'старт', slots: 0 });
    return { items, equip };
  }

  // инвентарь записи персонажа: пока ГМ ничего не менял — стартовое снаряжение из листа создания
  function inventoryOf(rec, state, res0) {
    const gm = rec.gm || {};
    const start = startInventory(state, res0);
    const items = gm.invInit ? (gm.items || []).filter(Boolean)
      : start.items.concat((gm.items || []).filter(x => x && x.name).map((x, i) => Object.assign({ id: 'legacy-' + i, kind: 'item', qty: 1 }, x)));
    const ids = new Set(items.map(x => x.id));
    const raw = rec.equip && typeof rec.equip === 'object' ? rec.equip : start.equip;
    const equip = {};
    Object.entries(raw).forEach(([k, id]) => { if (ids.has(id)) equip[k] = id; });
    const wallet = gm.wallet ? JSON.parse(JSON.stringify(gm.wallet)) : { з: num((res0.der || {}).gold) + num(gm.gold) };
    if (!Array.isArray(wallet.other)) wallet.other = [];
    return { items, equip, wallet, started: !gm.invInit };
  }

  // ------------------------------------------------------------ экипировка персонажа
  // что надето и что из этого следует: урон оружия, броня, штраф ловкости, слоты
  function equipStats(items, equip, ctx, hands) {
    const byId = new Map(items.map(x => [x.id, x]));
    const slots = slotsFor(hands);
    const worn = new Map();          // id предмета → расчёт
    const out = { slots, worn: [], weapons: [], armor: 0, magicArmor: 0, pen: 0, statFx: { l: 0, hpRegen: 0 }, slotsUsed: 0, bagSlots: 0, warnings: [] };
    slots.forEach(s => {
      const id = (equip || {})[s.id];
      if (!id) return;
      const it = byId.get(id);
      if (!it) return;
      if (!worn.has(id)) worn.set(id, compute(it, ctx));
    });
    worn.forEach((calc, id) => {
      out.worn.push(calc);
      if (calc.kind === 'weapon' || calc.kind === 'ammo') out.weapons.push(calc);
      if (calc.armor && calc.kind !== 'weapon') out.armor += calc.armor;
      if (calc.magicArmor) out.magicArmor += calc.magicArmor;
      out.pen += calc.pen || 0;
      out.statFx.l += calc.statFx.l; out.statFx.hpRegen += calc.statFx.hpRegen;
      (calc.req || []).filter(r => !r.ok).forEach(r => out.warnings.push(`«${calc.item.name}»: не хватает ${R.STAT_NAMES[r.stat].toLowerCase()} (${fmt(r.have)} из ${r.need}) — ${R.REQ_PENALTY[r.stat]}.`));
    });
    // слоты рюкзака: снаряжение — по таблице, остальное — сколько указал ГМ; сумки добавляют места
    const perPiece = !(C.INVENTORY && C.INVENTORY.STACK_ONE_SLOT);
    items.forEach(it => {
      const qty = Math.max(1, Math.floor(num(it.qty) || 1));
      out.slotsUsed += slotsOf(it) * (perPiece ? qty : 1);
      if (isBag(it)) out.bagSlots += (parseInt(String(it.effect || '').replace(/\D/g, ''), 10) || 0) * qty;
    });
    // занятость рук
    const handIds = slots.filter(s => s.cat === 'hand').map(s => (equip || {})[s.id]).filter(Boolean);
    out.handsUsed = handIds.length;
    return out;
  }

  // ------------------------------------------------------------ валюта
  const COINS = C.CURRENCIES;
  function walletCopper(w) { return COINS.reduce((a, c) => a + (num((w || {})[c.id]) * c.rate), 0); }
  function money(copper) {
    let x = Math.round(copper);
    if (!x) return '0';
    const neg = x < 0; x = Math.abs(x);
    const parts = [];
    COINS.forEach(c => { const n = Math.floor(x / c.rate); if (n) { parts.push(`${n} ${c.id}`); x -= n * c.rate; } });
    return (neg ? '−' : '') + parts.join(' ');
  }
  // «1(з),50(се)» → в медных; «5» — медные; «договорная» → null
  function priceCopper(p) {
    const s = String(p || '').trim();
    if (!s) return null;
    let total = 0, found = false;
    const re = /(\d+(?:[.,]\d+)?)\s*(?:\(\s*(мд|пл|з|се|м)\s*\))?/g;
    let m;
    while ((m = re.exec(s))) {
      found = true;
      const c = COINS.find(x => x.id === (m[2] || 'м'));
      total += parseFloat(m[1].replace(',', '.')) * (c ? c.rate : 1);
    }
    return found ? Math.round(total) : null;
  }

  // ------------------------------------------------------------ дроп и модификаторы статов
  // «перо 10, мясо гуманоида 2, серебро» → [{ name, qty }]
  function parseDrop(text) {
    return String(text || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^(.*?)\s*(\d+)\s*[хx]?$/i);
      return m && m[1] ? { name: m[1].trim(), qty: +m[2] } : { name: s.replace(/\s+/g, ' '), qty: 1 };
    }).filter(x => x.name && !/^[-—]$/.test(x.name));
  }

  const STAT_WORDS = [['t', 'тел'], ['d', 'дух'], ['s', 'сил'], ['i', 'инт'], ['l', 'ловк']];
  const statOf = w => { const x = STAT_WORDS.find(([, p]) => norm(w).startsWith(p)); return x ? x[0] : null; };
  // прибавки и множители к статам из текста эффекта:
  // «ловкость +20 / -40 тело», «+10 тело и сила», «сила/ловкость-20», «сила 3Х», «дух -2Х» (= ÷2), «ко всем статам +5»
  function parseStatMods(text) {
    const out = [];
    const s = String(text || '').toLowerCase().replace(/−/g, '-').replace(/ё/g, 'е');
    const W = '(?:тел[оау]?|дух[ау]?|сил[аеуы]?|инт(?:ел+ект[ау]?)?|ловкост[ьи])(?![а-я])';
    const L = W + '(?:(?:\\s*[/,]\\s*|\\s+и\\s+)' + W + ')*';
    const words = g => (g.match(new RegExp(W, 'g')) || []).map(statOf).filter(Boolean);
    const N = '(\\d+(?:[.,]\\d+)?)';
    const push = (ks, op, v) => ks.forEach(k => { if (!out.some(x => x.stat === k && x.op === op)) out.push({ stat: k, op, v }); });
    let m;
    // множители: «сила 3Х», «сила ×3», «3Х сила», «дух -2Х» (делится на 2)
    let re = new RegExp('(' + L + ')\\s*(-)?\\s*[×*]?\\s*' + N + '\\s*[xх×](?![а-яa-z])|(' + L + ')\\s*[×*]\\s*' + N + '|' + N + '\\s*[xх×]\\s*(' + L + ')', 'g');
    while ((m = re.exec(s))) {
      const g = m[1] || m[4] || m[7], v = parseFloat((m[3] || m[5] || m[6]).replace(',', '.'));
      if (v > 0) push(words(g), 'mul', m[2] ? 1 / v : v);
    }
    // прибавки: «ловкость +20», «сила/ловкость -20», «+10 тело и сила», «+10 к силе»
    re = new RegExp('(' + L + ')\\s*([+-])\\s*(\\d+)(?![\\d.,]|\\s*%|\\s*[xх×](?![а-я]))', 'g');
    while ((m = re.exec(s))) push(words(m[1]), 'add', (m[2] === '-' ? -1 : 1) * +m[3]);
    re = new RegExp('([+-])\\s*(\\d+)(?![\\d.,]|\\s*%|\\s*[xх×](?![а-я]))\\s*(?:к\\s+|ед\\.?\\s+)?(' + L + ')', 'g');
    while ((m = re.exec(s))) push(words(m[3]), 'add', (m[1] === '-' ? -1 : 1) * +m[2]);
    if ((m = s.match(/(?:все|ко всем)\s+(?:стат[а-я]*|характеристик[а-я]*)\s*([+-])\s*(\d+)/))) push(R.STATS, 'add', (m[1] === '-' ? -1 : 1) * +m[2]);
    return out.filter(x => x.stat);
  }

  // ------------------------------------------------------------ каталог: что можно выдать из таблиц
  function catalog(unlocked) {
    const d = D(), list = [];
    const add = (kind, name, effect, price, extra) => list.push(Object.assign({ kind, name, effect: effect || '', price: price || '' }, extra || {}));
    (d.items || []).forEach(i => add('item', i.name, [i.effect, i.craft].filter(Boolean).join(' / '), i.price));
    (d.alchemy.food || []).forEach(f => add('food', f.name, (f.e || []).join(', '), f.price));
    (unlocked && d.artifacts ? d.artifacts : d.artifactPool || []).forEach(a => add('artifact', a.name, a.effect + (a.cursed || a.g === 'проклятые' ? ' (проклятый)' : ''), ''));
    (d.materials || []).forEach(m => add('material', m.name, `урон ${m.dmg} / броня ${m.arm} за ед.`, m.price));
    (d.crystals || []).forEach(m => add('crystal', m.name, `урон ${m.dmg} / броня ${m.arm} за слиток; украшение: ${(m.ej || {}).t || '—'}`, m.price));
    if (unlocked && d.alchemy.ingredients) d.alchemy.ingredients.forEach(x => add('item', x.n, (x.e || []).map(e => e[0]).filter(Boolean).join(', '), x.price));
    if (unlocked && d.alchemy.alcohol) d.alchemy.alcohol.forEach(x => add('food', x.name, (x.e || []).join(', '), x.price));
    if (unlocked && d.alchemy.essences) d.alchemy.essences.forEach(x => add('item', 'эссенция ' + x.name, x.effect, x.price));
    const seen = new Set();
    return list.filter(x => { const k = x.kind + ':' + norm(x.name); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // состояния, которые может наложить ГМ
  function effectSources(unlocked) {
    const s = D().skills, out = [];
    (s.gifts || []).forEach(g => out.push({ kind: 'gift', name: g.name, text: `${g.bonus} / цена: ${g.debuff}` }));
    (s.curses || []).forEach(c => out.push({ kind: 'curse', name: c.name, text: c.effect }));
    (s.cursesSpecial || []).forEach(c => out.push({ kind: 'curse', name: c.name, text: c.effect }));
    (s.diseases || []).forEach(c => out.push({ kind: 'disease', name: c.name, text: [c.e1, c.e2].filter(Boolean).join(' / ') }));
    (s.buffs || []).forEach(c => out.push({ kind: 'buff', name: c.name, text: c.effect + (c.dur ? ` (${c.dur})` : '') }));
    (s.mods || []).forEach(c => out.push({ kind: 'mod', name: c[0], text: [c[1], c[2] && c[2] !== 'инф' ? c[2] : ''].filter(Boolean).join(' / ') }));
    (s.traitsPos || []).forEach(c => out.push({ kind: 'trait', name: c.name, text: c.effect }));
    (s.traitsNeg || []).forEach(c => out.push({ kind: 'trait', name: c.name, text: c.effect }));
    (s.traitsAcq || []).forEach(c => out.push({ kind: 'trait', name: c.name, text: c.effect }));
    const st = unlocked && D().mechanics ? (D().mechanics.main || []).find(x => /статус/.test(x.title)) : null;
    if (st) st.rows.forEach(r => { if (r[0]) out.push({ kind: 'status', name: r[0], text: r.slice(1).filter(Boolean).join(' / ') }); });
    return out;
  }
  const EFFECT_KINDS = { gift: 'Тёмный дар', curse: 'Проклятие', disease: 'Болезнь', buff: 'Благословение', mod: 'Модификация', trait: 'Черта', status: 'Статус-эффект', custom: 'Своё' };

  window.Craft = {
    KIND_NAMES, CRAFTABLE, CATS, EFFECT_KINDS, BASES, baseOf, modules, models, material, allMaterials, isCrystal,
    slotCat, slotsFor, compute, autoName, startInventory, inventoryOf, equipStats,
    walletCopper, money, priceCopper, parseDrop, parseStatMods, catalog, effectSources, num
  };
})();
