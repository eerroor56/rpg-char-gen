/*
 * Типы урона, сопротивления и слабости (уточнение ГМ).
 *   Типы урона — по символам магии: почти у каждого символа свой урон («огонь Хе», «урон слизью Хе»…),
 *   «разделение» — физический урон; «исцеление» — лечение. Пси и воля — не магия: против них только
 *   сопротивление к пси / воле. Бывают заклинания, урон которых не магический, — тогда считаются только
 *   сопротивления к самому типу (галочка «не магия»).
 *   Виды урона: обычный (по броне), сквозь броню (мимо брони, резисты считаются; гравитация, плоть и кость
 *   сквозь броню всегда), чистый (игнорирует всё: резисты, иммунитеты, слабости и броню).
 * Порядок (ГМ): сопротивление в единицах («50е», чаще всего от зелий) → резисты в процентах (складываются;
 *   100% и больше — урона нет) → множители слабостей («урон от молнии 2Х») → броня → ХП.
 * Откуда берётся у героя: бонусы и штрафы расы (у полукровки — половина), способности предка, черты
 *   «резистентный» / «уязвимый», дар и его иммунитет, наложенные ГМ состояния (проклятия, болезни, модификации,
 *   благословения, свои), надетое снаряжение; в бою — ещё строка ГМ у фишки (зелье, умение на пару ходов).
 * Текст таблицы разбирается по фразам («физ резист 25%», «сопротивление огню 50е», «иммун к физ / тьме / некро»,
 *   «урон от молнии 3Х», «получаешь на 25% больше тёмного урона»). Что зависит от условия («если…», «пока…»)
 *   или действует несколько ходов, — показывается подсказкой и само не считается.
 */
(function () {
  'use strict';
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const r1 = x => Math.round(x * 100) / 100;

  // [id, как называть, начало слова в тексте (ё → е), группа: phys — физический, mag — магия, own — не магия (пси, воля)]
  const TYPES = [
    ['физ', 'физический', /^физ/, 'phys'],
    ['огонь', 'огонь', /^(ог(онь|н)|пламен)/, 'mag'],
    ['вода', 'вода', /^вод(а|ы|е|у|ой|ян|н)/, 'mag'],
    ['земля', 'земля', /^земл/, 'mag'],
    ['воздух', 'воздух', /^возд/, 'mag'],
    ['тьма', 'тьма', /^(тьм|темн|тем(а|ы|е)$)/, 'mag'],
    ['святость', 'святость', /^свят/, 'mag'],
    ['свет', 'свет', /^свет/, 'mag'],
    ['душа', 'душа', /^душ/, 'mag'],
    ['живость', 'живость', /^живост/, 'mag'],
    ['мана', 'мана', /^ман(а|ы|е|ой|у)$/, 'mag'],
    ['кровь', 'кровь', /^(кров(ь|и|ью|ав|ян)|кровь)/, 'mag'],
    ['лёд', 'лёд', /^(лед|льд|холод|мороз)/, 'mag'],
    ['молния', 'молния', /^(молни|электр)/, 'mag'],
    ['лава', 'лава', /^лав/, 'mag'],
    ['яд', 'яд', /^яд/, 'mag'],
    ['слизь', 'слизь', /^слиз/, 'mag'],
    ['ткань', 'ткань', /^ткан/, 'mag'],
    ['природа', 'природа', /^природ/, 'mag'],
    ['пепел', 'пепел', /^пеп(е)?л/, 'mag'],
    ['грязь', 'грязь', /^гряз/, 'mag'],
    ['дерево', 'дерево', /^дерев/, 'mag'],
    ['металл', 'металл', /^метал/, 'mag'],
    ['кристалл', 'кристалл', /^кристал/, 'mag'],
    ['порча', 'порча', /^порч/, 'mag'],
    ['хаос', 'хаос', /^хаос/, 'mag'],
    ['мельдус', 'мельдус', /^мельдус/, 'mag'],
    ['хтон', 'хтон', /^хтон/, 'mag'],
    ['ихор', 'ихор', /^ихор/, 'mag'],
    ['звук', 'звук', /^звук/, 'mag'],
    ['песок', 'песок', /^пес(ок|к)/, 'mag'],
    ['плазма', 'плазма', /^плазм/, 'mag'],
    ['скверна', 'скверна', /^скверн/, 'mag'],
    ['нечистоты', 'нечистоты', /^нечистот/, 'mag'],
    ['дым', 'дым', /^дым/, 'mag'],
    ['кислота', 'кислота', /^кислот/, 'mag'],
    ['пар', 'пар', /^пар(а|у|ом|ы)?$/, 'mag'],
    ['некро', 'некро', /^некр/, 'mag'],
    ['гравитация', 'гравитация', /^гравит/, 'mag'],
    ['плоть', 'плоть', /^плот(ь|и|ью)$/, 'mag'],
    ['кость', 'кость', /^кост(ь|и|ью|ей|ян)?/, 'mag'],
    ['лазер', 'лазер', /^лазер/, 'mag'],
    ['бездна', 'бездна (Аббис)', /^(бездн|абб?ис)/, 'mag'],
    ['космос', 'космос', /^косм/, 'mag'],
    ['исток', 'исток', /^исток/, 'mag'],
    ['пси', 'пси', /^пси/, 'own'],
    ['воля', 'воля', /^вол(я|и|е|ей|ю)$/, 'own'],
  ];
  const BY_ID = new Map(TYPES.map(t => [t[0], t]));
  const GROUPS = { 'физ': 'физический', 'маг': 'магия', 'всё': 'весь урон' };
  const PIERCE = new Set(['гравитация', 'плоть', 'кость']);          // «урон … Хе/сквозь броню» в таблице символов
  const ARMOR_MUL = { 'слизь': 1.5, 'ихор': 2 };                      // «на 50п больше повреждений доспехам», «на 100% больше … доспехам»
  const groupOf = id => (BY_ID.get(id) || [])[3] || '';
  const nameOf = id => GROUPS[id] || (BY_ID.get(id) || [])[1] || id;

  // группы-слова (уточнения ГМ): «элементальный» — четыре стихии; «жидкостная магия»; «запретная» и «порицаемая» —
  // символы этих категорий в таблице символов; «иммун к символам» — к любой магии
  const ELEMENTS = ['огонь', 'вода', 'воздух', 'земля'];
  const LIQUID = ['вода', 'слизь', 'кровь', 'ихор', 'яд', 'кислота'];
  let catCache = null;
  function symbolCat(re) {
    const list = (((window.GAME_DATA || {}).skills || {}).symbols || []);
    if (!catCache || catCache.n !== list.length) catCache = { n: list.length, m: {} };
    const k = String(re);
    if (!catCache.m[k]) catCache.m[k] = [...new Set(list.filter(x => re.test(norm(x.cat))).map(x => wordType(String(x.name).replace(/\s*\(\d+\)/, ''))).filter(t => t && BY_ID.has(t)))];
    return catCache.m[k];
  }
  function groupWord(w) {
    w = norm(w);
    if (/^(элементальн|стихийн)/.test(w)) return ELEMENTS;
    if (/^жидкост/.test(w)) return LIQUID;
    if (/^запретн/.test(w)) return symbolCat(/запрет/);
    if (/^порицаем/.test(w)) return symbolCat(/порица/);
    return null;
  }
  // слово → тип урона (или группа «маг» / «всё»)
  function wordType(w) {
    w = norm(w).replace(/[^a-zа-я0-9-]/g, '');
    if (!w || /^кровотеч/.test(w)) return null;
    if (/^(маг|маги|магия|магии|магию|магией|магическ\S*|заклинан\S*|символам|символов)$/.test(w)) return 'маг';
    if (/^(всему|общ)/.test(w)) return 'всё';
    for (const t of TYPES) if (t[2].test(w)) return t[0];
    return null;
  }
  const words = s => norm(s).replace(/(всего|любому|любого) урон\S*/g, 'всему').split(/[\s,()«»:;.+%]+|-(?=\D)/).filter(Boolean);
  const typesIn = s => {
    const out = [];
    let noun = false;
    words(s).forEach(w => {
      const g = groupWord(w);
      if (g) { if (g.length) noun = true; g.forEach(t => { if (!out.includes(t)) out.push(t); }); return; }
      const t = wordType(w); if (t === 'маг' && /^маги/.test(w)) noun = true; if (t && !out.includes(t)) out.push(t);
    });
    // «магии святости и света», «некротической магии», «запретной магии» — это святость и свет, некро, символы категории, а не вся магия
    return noun && out.length > 1 ? out.filter(t => t !== 'маг') : out;
  };
  // сегмент — только названия типов («тьме», «некро», «физ урону») — продолжение списка иммунитетов
  const bare = s => { const ws = norm(s).split(/[\s,]+|\sи\s/).filter(w => w && w !== 'и' && !/^урон/.test(w)); return ws.length > 0 && ws.length <= 3 && !/^(символ|знак)/.test(ws[0]) && ws.every(w => wordType(w) || groupWord(w)); };
  // первое слово после «иммун к» — тип или группа («всей запретной…», «любой магии» — «всей», «любой» пропустить)
  const leadsType = s => { const ws = words(s).filter(w => !/^(всей|всех|любой|любых)$/.test(w)); return !!ws.length && !!(wordType(ws[0]) || (groupWord(ws[0]) || []).length); };

  const NUM = '(\\d+(?:[.,]\\d+)?)';
  const num = s => +String(s).replace(',', '.');
  const COND = /(^|\s)(если|пока|когда|при |в безлунн|днем|ночью|раз в)/;
  const TEMP = /на\s*\d+\s*(х(?![а-я])|ход)|\d+\s*ход|действует\s*\d/;
  const OUTGOING = /исходящ|наносим|наносит(?!е)|наносите|вы наносите|к урону|урон\S* существам/;

  /** разобрать текст: [{ t, k: pct|flat|imm|mul|conv, v, cond?, txt }]; manual — строка ГМ («огонь 25%», «молния 2х», «иммун яд», «вода в хил») */
  function parse(text, manual) {
    const out = [];
    // строку ГМ можно писать и через запятую («огонь 25%, молния 2х»); «0,5%» — не разделитель
    const segs = String(text || '').split(manual ? /\s*(?:[\/;\n]|,(?!\d))\s*/ : /\s*[\/;\n]\s*|\s+и\s+(?=[+−-]?\d)/).map(s => s.trim()).filter(Boolean);
    let immRun = false;
    segs.forEach((seg, si) => {
      // «Каменное тело: 50% физ резиста» — название способности перед двоеточием не тип урона
      const s = norm(seg).replace(/^[^:]{1,40}:\s*/, '');
      const cond = COND.test(s) || TEMP.test(s);
      const push = (types, k, v, more) => types.forEach(t => out.push(Object.assign({ t, k, v, txt: seg }, cond ? { cond: true } : {}, more || {})));
      // конвертация (ГМ: урон этого типа становится лечением): «конвертирует урон от воды в хил»,
      // «получаемый урон от молнии конвертируется в ману»; «заблокированный урон конвертируется в ману» — то, что сняли резисты;
      // строка ГМ: «вода в хил», «молния в ману»
      const into = w => (/^(ман|мп)/.test(w) ? 'mp' : /^(хил|лечен|здоров|хп|исцел)/.test(w) ? 'hp' : '');
      let m = s.match(/конверт\S*\s+(?:получаем\S*\s+)?урон\S*\s+от\s+(.+?)\s+в\s+(\S+)/) || s.match(/получаем\S*\s+урон\S*\s+от\s+(.+?)\s+конверт\S*\s+в\s+(\S+)/)
        || s.match(/урон\S*\s+от\s+(.+?)\s+(?:конверт\S*|превращ\S*|переходит)\s+в\s+(\S+)/) || (manual && s.match(/^(.+?)\s+в\s+(хил|лечение|ману|мп|хп)$/));
      if (m && into(m[2]) && typesIn(m[1]).length) { push(typesIn(m[1]), 'conv', into(m[2])); return; }
      m = s.match(/заблокированн\S*\s+урон\S*\s+(?:конверт\S*|превращ\S*|переходит)\s+в\s+(\S+)/);
      if (m && into(m[1])) { push(['всё'], 'conv', into(m[1]), { blocked: true }); return; }
      // эссенция в предмете (ГМ: по названию из таблицы алхимии): «эссенция огня» — 100е резиста к своему элементу
      // («все эссенции дают 100е резиста … соответствующего элемента, если это возможно»), плюс её собственное свойство
      m = s.match(/эссенци\S*\s+([а-я]+)/);
      if (m) {
        const ts = typesIn(m[1]).filter(t => BY_ID.has(t));
        const es = (((window.GAME_DATA || {}).alchemy || {}).essences || []).find(x => norm(x.name) === m[1]);
        if (ts.length || es) {
          push(ts, 'flat', 100);
          if (es && es.effect) parse(es.effect).forEach(e => out.push(Object.assign(e, { txt: `${seg}: ${e.txt}` }, cond ? { cond: true } : {})));
          return;
        }
      }
      // иммунитет: «иммун к огню и лаве», «иммунитет к яду,порче,кровотечению», «иммун к физ / тьме / некро»
      m = s.match(/иммун\S*\s+(?:к|ко)\s+(.+)/) || s.match(/^(.+?)\s+иммун\S*(?:\s*\+.*)?$/) || (manual && s.match(/^иммун\S*\s+(.+)/));
      if (m) {
        const ts = leadsType(m[1]) ? typesIn(m[1]) : [];
        if (ts.length) { push(ts, 'imm', 1); immRun = true; return; }
      }
      if (immRun && bare(s)) { push(typesIn(s), 'imm', 1); return; }
      immRun = false;
      if (/неуязвим|игнорир|отключает/.test(s)) return;
      // слабость множителем: «урон от молнии 3Х», «огонь и свет наносят 3Х урон вам», «двойной урон от …»
      m = s.match(new RegExp('урон\\S*\\s+от\\s+(.+?)\\s*[x×х]\\s*' + NUM + '|урон\\S*\\s+от\\s+(.+?)\\s+' + NUM + '\\s*[x×х](?![а-я])'))
        || s.match(new RegExp('^(.+?)\\s+нанос\\S*\\s+' + NUM + '\\s*[x×х]\\s+урон\\S*\\s+(?:вам|вас|по вам)'));
      if (m && !OUTGOING.test(s.replace(/нанос\S*\s+\d+\s*[x×х]\s+урон\S*\s+(вам|вас|по вам)/, ''))) {
        const what = m[1] || m[3], k = num(m[2] || m[4]);
        const ts = typesIn(what);
        if (ts.length && k > 0) { push(ts, 'mul', k); return; }
      }
      m = s.match(/(двойн|тройн|удвоенн|утроенн)\S*\s+урон\S*\s+от\s+(.+)/);
      if (m && !OUTGOING.test(s)) {
        // «двойной урон от этих символов» — типы из предыдущих частей фразы
        const ts = /эт(их|ого)/.test(m[2]) ? [...new Set(segs.slice(Math.max(0, si - 5), si).flatMap(typesIn))] : typesIn(m[2]);
        if (ts.length) { push(ts, 'mul', /тро/.test(m[1]) ? 3 : 2); return; }
      }
      // «получаемый маг урон 3Х», «+10% получаемый урон от огня и святости», «получаемый урон от огня на +20е»
      m = s.match(/получаем\S*\s+(.+?)\s+урон\S*\s+(\d+(?:[.,]\d+)?)\s*[x×х](?![а-я])/);
      if (m && typesIn(m[1]).length) { push(typesIn(m[1]), 'mul', num(m[2])); return; }
      m = s.match(/([+−-])?\s*(\d+(?:[.,]\d+)?)\s*(%|п|е)\s*получаем\S*\s+(?:урон\S*\s+от\s+)?(.+)/);
      if (m && typesIn(m[4]).length && !/отража|возвращ/.test(s)) { const v = num(m[2]) * (m[1] === '-' || m[1] === '−' ? 1 : -1); push(typesIn(m[4]), m[3] === 'е' ? 'flat' : 'pct', v); return; }
      m = s.match(/получаем\S*\s+урон\S*\s+от\s+(.+?)\s+на\s*([+−-])?\s*(\d+(?:[.,]\d+)?)\s*(%|п|е)/);
      if (m && typesIn(m[1]).length) { const v = num(m[3]) * (m[2] === '-' || m[2] === '−' ? 1 : -1); push(typesIn(m[1]), m[4] === 'е' ? 'flat' : 'pct', v); return; }
      // слабость процентом: «получаешь на 25% больше тёмного, святого урона», «больше урона от огня на 25%»
      m = s.match(new RegExp('на\\s*' + NUM + '\\s*(?:%|п)\\s*больше\\s+(.+)')) || s.match(new RegExp('больше\\s+урона\\s+от\\s+(.+?)\\s+на\\s*' + NUM));
      if (m && /урон/.test(s) && !OUTGOING.test(s) && !/доспех|брон|оруж|цель/.test(s)) {
        const pct = num(/^\d/.test(m[1]) ? m[1] : m[2]), rest = /^\d/.test(m[1]) ? m[2] : m[1];
        // «получает на 15п больше урона» — ко всему
        const ts = typesIn(rest).length ? typesIn(rest) : /^урон\S*$/.test(rest.trim()) ? ['всё'] : [];
        if (ts.length && pct) { push(ts, 'pct', -pct); return; }
      }
      // резист: «физ резист 25%», «30% физ и маг резиста», «сопротивление огню 50е», «резист к магии 50%», «общий резист 25п»
      const rez = /резист|сопротивл/.test(s);
      if (!rez && !manual) return;
      // число — ближайшее к слову «резист» (не множитель «2Х»)
      const at = rez ? s.search(/резист|сопротивл/) : 0;
      m = null;
      for (const x of s.matchAll(new RegExp('([+−-])?\\s*' + NUM + '\\s*(%|п(?![а-я])|ед(?![а-я])|е(?![а-я])|[x×х](?![а-я]))?', 'g'))) {
        if (/^[x×х]/.test(x[3] || '') && !manual) continue;
        if (!m || Math.abs(x.index - at) < Math.abs(m.index - at)) m = x;
      }
      if (!m) return;
      if (OUTGOING.test(s) && !rez) return;
      // тип — после числа («20е резиста огню», «30% физ резиста»), иначе — перед ним («резист к холоду 25%»)
      const after = typesIn(s.slice(m.index + m[0].length));
      let ts = after.length ? after : typesIn(s.slice(0, m.index));
      if (!ts.length && /резист\S*\s+(к|ко)\s+урон|ко всему|всему урону/.test(s)) ts = ['всё'];
      if (!ts.length) return;
      const v = num(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1);
      if (!v) return;
      // строка ГМ «молния 2х» — множитель
      if (/^[x×х]/.test(m[3] || '')) { push(ts, 'mul', Math.abs(v)); return; }
      push(ts, /^е/.test(m[3] || '') ? 'flat' : 'pct', v);
    });
    return out;
  }

  // множитель источника: у полукровки половина от каждого родителя, у «Репликанта» штраф другой расы ×2
  function scaled(list, x) {
    if (x === 1) return list;
    return list.map(e => {
      const n = Object.assign({}, e);
      if (e.k === 'conv') return n;
      if (e.k === 'imm') { if (x < 1) Object.assign(n, { k: 'pct', v: 100 * x }); }
      else if (e.k === 'mul') n.v = r1(1 + (e.v - 1) * x);
      else n.v = r1(e.v * x);
      return n;
    });
  }
  const from = (src, text, x, manual) => scaled(parse(text, manual), x === undefined ? 1 : x).map(e => Object.assign(e, { src }));

  // ------------------------------------------------------------ кто: герой, существо, раса
  /** v — расчёт персонажа (Dev.compute), rec — запись; extra — строка ГМ в бою */
  function ofHero(v, rec, extra) {
    const res = v.res || v, st = v.state || {}, out = [];
    const race = res.race;
    if (race) {
      (race.bonuses || []).concat(race.penalties || []).forEach(b => {
        const x = /½/.test(b.src) ? 0.5 : /×\s*2/.test(b.src) ? 2 : 1;
        out.push(...from(`раса: ${b.src}`, b.text, x));
      });
      const an = race.ancestor;
      if (an && an.abilities) {
        const list = an.kind === 'dragon' ? an.abilities : an.picked ? [an.picked] : [];
        list.forEach(a => out.push(...from(`предок: ${an.name}`, a.text)));
      }
    }
    // черты «резистентный» / «уязвимый»: ±10% к выбранному (одинаковые складываются)
    const to = st.traitOpt || {};
    Object.keys(to).forEach(k => {
      const m = k.match(/^(resist|vuln)(\d*)$/);
      if (!m || !String(to[k] || '').trim()) return;
      const ts = typesIn(to[k]), sign = m[1] === 'resist' ? 1 : -1;
      const name = m[1] === 'resist' ? 'черта «резистентный»' : 'черта «уязвимый»';
      if (ts.length) ts.forEach(t => out.push({ t, k: 'pct', v: 10 * sign, src: name, txt: to[k] }));
      else out.push({ t: norm(to[k]), k: 'pct', v: 10 * sign, src: name, txt: to[k], cond: true, other: true });
    });
    // дар, благословение или болезнь с создания
    const b = res.boon;
    if (b && b.src) {
      const label = { gift: 'тёмный дар', buff: 'благословение', disease: 'болезнь' }[b.kind] || 'дар';
      Object.entries(b.src).forEach(([k, t]) => { if (typeof t === 'string' && !/^(name|how|dur|cat)$/.test(k)) out.push(...from(`${label} «${b.src.name}»`, t)); });
      const im = String((st.boonOpt || {}).immunity || '').trim();
      if (b.fx && b.fx.option === 'immunity' && im) {
        const ts = typesIn(im);
        (ts.length ? ts : [norm(im)]).forEach(t => out.push(Object.assign({ t, k: 'imm', v: 1, src: `${label} «${b.src.name}»`, txt: im }, ts.length ? {} : { cond: true, other: true })));
      }
    }
    // состояния от ГМ: проклятия, болезни, модификации, благословения, свои
    const K = window.Craft;
    ((rec && rec.gm && rec.gm.effects) || []).forEach(e => {
      const kind = (K && K.EFFECT_KINDS[e.kind] || 'эффект').toLowerCase();
      out.push(...from(`${kind} «${e.name}»`, [e.text, e.note].filter(Boolean).join(' / ')));
    });
    // надетое снаряжение
    ((v.eq && v.eq.worn) || []).forEach(c => {
      const nm = (c.item && c.item.name) || 'снаряжение';
      (c.effects || []).forEach(e => out.push(...from(`«${nm}»: ${e.src}`, e.text)));
      // заметка предмета: «эссенция огня» (ГМ — 100е резиста к элементу эссенции), «огонь 10%» и т.п.
      if (c.item && c.item.note) out.push(...from(`«${nm}»: заметка`, c.item.note));
    });
    if (extra) out.push(...from('в бою (ГМ)', extra, 1, true));
    return out;
  }
  function ofCreature(cr, extra) {
    const out = [];
    (cr.ab || []).forEach(([, t]) => out.push(...from(`способность: ${String(t).split(':')[0]}`, t)));
    if (cr.note) out.push(...from('примечание', cr.note));
    if (extra) out.push(...from('в бою (ГМ)', extra, 1, true));
    return out;
  }
  function ofRace(r, extra) {
    const out = from(`раса: ${r.name}`, r.bonus).concat(from(`раса: ${r.name}`, r.penalty));
    if (extra) out.push(...from('в бою (ГМ)', extra, 1, true));
    return out;
  }

  // ------------------------------------------------------------ сводка и расчёт урона
  /** по типу и группе: { key, pct, flat, mul, imm, src: [...] } — только то, что считается само (без условий) */
  function summary(entries) {
    const m = new Map();
    entries.filter(e => !e.cond).forEach(e => {
      const x = m.get(e.t) || { key: e.t, name: nameOf(e.t), pct: 0, flat: 0, mul: 1, imm: false, src: [] };
      if (e.k === 'imm') x.imm = true;
      else if (e.k === 'conv') { if (e.blocked) x.convBlocked = e.v; else x.conv = e.v; }
      else if (e.k === 'pct') x.pct = r1(x.pct + e.v);
      else if (e.k === 'flat') x.flat = r1(x.flat + e.v);
      else if (e.k === 'mul') x.mul = r1(x.mul * e.v);
      x.src.push(`${e.src}: ${e.k === 'conv' ? (e.blocked ? 'заблокированное → ' : 'в ') + (e.v === 'mp' ? 'ману' : 'лечение') : e.k === 'imm' ? 'иммунитет' : e.k === 'mul' ? '×' + e.v : (e.v > 0 ? '+' : '') + e.v + (e.k === 'flat' ? ' ед.' : '%')}`);
      m.set(e.t, x);
    });
    const order = ['всё', 'физ', 'маг'].concat(TYPES.map(t => t[0]));
    return [...m.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  const conds = entries => entries.filter(e => e.cond);
  const chip = x => x.conv ? (x.conv === 'mp' ? 'урон → в ману' : 'урон → в лечение') : x.imm ? 'иммунитет' : [x.convBlocked ? `снятое резистами → в ${x.convBlocked === 'mp' ? 'ману' : 'лечение'}` : '', x.flat ? `${x.flat > 0 ? '−' : '+'}${Math.abs(x.flat)} ед. урона` : '', x.pct ? `${x.pct > 0 ? 'резист' : 'слабость'} ${Math.abs(x.pct)}%` : '', x.mul !== 1 ? `урон ×${x.mul}` : ''].filter(Boolean).join(', ');
  // слабость или защита — для цвета плашки
  const sign = x => x.conv || x.convBlocked || x.imm || (x.pct > 0 && x.mul <= 1) || (x.flat > 0 && x.mul <= 1 && x.pct >= 0) ? 1 : x.pct < 0 || x.mul > 1 || x.flat < 0 ? -1 : 0;

  /**
   * урон X типа type: mode — norm | pierce | pure; notMagic — урон заклинания не магический (только сопротивление к самому типу)
   * → { hp: сколько уходит дальше (в броню / ХП), pierce, armorMul, steps: ['…'], blocked, gain: { hp | mp: n } — конвертация в лечение / ману }
   */
  function damage(X, type, mode, entries, notMagic) {
    const steps = [`${nameOf(type)} ${X}`];
    if (mode === 'pure') return { hp: X, pierce: true, armorMul: 1, pure: true, steps: steps.concat('чистый урон: мимо резистов и брони') };
    const g = groupOf(type);
    const keys = [type, 'всё'].concat(g === 'phys' && type !== 'физ' ? ['физ'] : g === 'mag' && !notMagic ? ['маг'] : []);
    const on = entries.filter(e => !e.cond && keys.includes(e.t));
    const pierce = mode === 'pierce' || PIERCE.has(type);
    const res = { pierce, armorMul: ARMOR_MUL[type] || 1, steps };
    // конвертация (ГМ): урон этого типа целиком становится лечением (или маной) — ни резисты, ни броня уже не нужны
    const conv = on.find(e => e.k === 'conv' && !e.blocked && e.t !== 'всё') || on.find(e => e.k === 'conv' && !e.blocked);
    if (conv) return Object.assign(res, { hp: 0, blocked: true, gain: { [conv.v]: X }, steps: steps.concat(`конвертация (${conv.src}) → ${conv.v === 'mp' ? 'МП' : 'ХП'} +${X}`) });
    // «заблокированный урон конвертируется в ману» — то, что сняли иммунитет и резисты
    const cb = on.find(e => e.k === 'conv' && e.blocked);
    const keep = r => { if (cb && r.hp < X) { r.gain = { [cb.v]: X - r.hp }; r.steps.push(`снятое → ${cb.v === 'mp' ? 'МП' : 'ХП'} +${X - r.hp}`); } return r; };
    const imm = on.find(e => e.k === 'imm');
    if (imm) return keep(Object.assign(res, { hp: 0, blocked: true, steps: steps.concat(`иммунитет (${imm.src})`) }));
    let x = X;
    const flat = on.filter(e => e.k === 'flat').reduce((a, e) => a + e.v, 0);
    if (flat) { x = Math.max(0, x - flat); steps.push(`${flat > 0 ? '−' : '+'}${Math.abs(flat)} ед. → ${r1(x)}`); }
    const pct = on.filter(e => e.k === 'pct').reduce((a, e) => a + e.v, 0);
    if (pct >= 100) return keep(Object.assign(res, { hp: 0, blocked: true, steps: steps.concat(`резист ${r1(pct)}% → 0`) }));
    if (pct) { x = x * (1 - pct / 100); steps.push(`${pct > 0 ? 'резист' : 'слабость'} ${Math.abs(r1(pct))}% → ${Math.round(x)}`); }
    const mul = on.filter(e => e.k === 'mul').reduce((a, e) => a * e.v, 1);
    if (mul !== 1) { x = x * mul; steps.push(`×${r1(mul)} → ${Math.round(x)}`); }
    if (pierce) steps.push(mode === 'pierce' ? 'сквозь броню' : `${nameOf(type)} — сквозь броню`);
    return keep(Object.assign(res, { hp: Math.max(0, Math.round(x)) }));
  }

  const typeList = () => TYPES.map(t => ({ id: t[0], name: t[1], group: t[3], pierce: PIERCE.has(t[0]) }));

  window.Resist = { TYPES, GROUPS, PIERCE, ARMOR_MUL, parse, typesIn, wordType, ofHero, ofCreature, ofRace, summary, conds, chip, sign, damage, typeList, nameOf, groupOf };
})();
