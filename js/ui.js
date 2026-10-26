/* Каркас приложения: состояние, маршруты, сводка, утилиты */
(function () {
  'use strict';
  const R = window.Rules;
  const DRAFT_KEY = 'hero-workshop:draft';

  const esc = s => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  // названия из прошлых версий данных (до исправления орфографии) → текущие
  const RENAMED = {
    "бугристая форель": "бугристая макрель",
    "утомлёный": "утомлённый",
    "слабая регенирация": "слабая регенерация",
    "не чувствительность к потоку": "нечувствительность к потоку",
    "не собранный": "несобранный",
    "миротчащий": "мироточащий",
    "блюждающий дух": "блуждающий дух",
    "изчезающий близнец": "исчезающий близнец",
    "добродеятельная боль": "добродетельная боль",
    "предидущий опыт": "предыдущий опыт",
    "повышенная чуствительность": "повышенная чувствительность",
    "бессоница": "бессонница",
    "аллергия на метал": "аллергия на металл",
    "рассеяное внимание": "рассеянное внимание",
    "роговая попилома": "роговая папиллома",
    "нескончаймые кошмары": "нескончаемые кошмары",
    "параноая/ пси болезнь": "паранойя/ пси болезнь",
    "поглащение": "поглощение",
    "потусторонее насыщение": "потустороннее насыщение",
    "кровожаные враги": "кровожадные враги",
    "булова": "булава",
    "дфухклинковая глефа": "двухклинковая глефа",
    "усмириткль полчищ": "усмиритель полчищ",
    "наручный арболет": "наручный арбалет",
    "арболет": "арбалет",
    "кпюшон": "капюшон",
    "домаская сталь": "дамасская сталь",
    "альтмерский метал": "альтмерский металл",
    "слизестый кристалл": "слизистый кристалл",
    "кровавя магическая ткань": "кровавая магическая ткань",
    "белый кристал": "белый кристалл",
    "чёрный кристал": "чёрный кристалл",
    "кристалльный слиток": "кристальный слиток",
    "кристализованное разрушение": "кристаллизованное разрушение",
    "подвижнче детали": "подвижные детали",
    "елемнтельная мазь": "элементальная мазь",
    "фермертсво": "фермерство",
    "свеживание": "свежевание",
    // 2-й проход орфографии
    "табакси (катжиты)": "табакси (каджиты)",
    "спригган мотрона": "спригган матрона",
    "ледянелый спригган": "ледяной спригган",
    "богровый светильник": "багровый светильник",
    "бешенная баракуда": "бешеная баракуда",
    "гротескная мокрель": "гротескная макрель",
    "краторный смотритель": "кратерный смотритель",
    "опухлевый клешневик": "опухолевый клешневик",
    "жаждящий пепла": "жаждущий пепла",
    "шабал (красны)": "шабал (красный)",
    "пирамидаголовый": "пирамидоголовый",
    "свинной король": "Свиной король",
    "великий наставник радомес": "Великий наставник Радамес",
    "лесмес нетленный резничий": "Лесмес нетленный ризничий",
    "джагернаутские перчи": "джаггернаутские перчатки",
    "джагернаутские ботинки": "джаггернаутские ботинки",
    "джагернаутские поножи": "джаггернаутские поножи",
    "джагернаутская кирса": "джаггернаутская кирса",
    "джагернаутский шлем": "джаггернаутский шлем",
    "тааффеит": "таафеит",
    "мазахизм": "мазохизм",
    "лунный ожёг": "Лунный ожог",
    "64 лодони небес": "64 ладони небес",
    "мёртвй глаз": "мёртвый глаз",
    "вентажная улыбка(маска)": "винтажная улыбка(маска)",
    "мантия терни": "мантия терний",
    "брош гримма": "брошь гримма",
    "подвеска терпеливости": "подвеска терпения",
    "непоколебимое тело (брош)": "непоколебимое тело (брошь)",
    "пронзённая бабочка (брош)": "пронзённая бабочка (брошь)",
    "свинная корона": "Свиная корона",
    "бва (биотический вирус абберацит)": "БВА (биотический вирус аберрацит)",
    "брош": "брошь",
    "кастоньеды": "кастаньеты",
    "валынка": "волынка"
  };
  const RENAMED_LC = Object.fromEntries(Object.entries(RENAMED).map(([k, v]) => [k.toLowerCase(), v]));

  const DICE = '<svg class="dice-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/></svg>';

  // портрет расы (картинки — img/races, список — data/images.js); у полукровки — оба родителя
  // plain — без ссылки на картинку (для карточек, которые сами являются ссылками)
  function portrait(races, cls, plain) {
    const imgs = (window.RACE_IMAGES || {});
    const list = races.filter(r => r && imgs[r.id]);
    if (!list.length) return '';
    const tag = plain ? 'span' : 'figure';
    return `<${tag} class="portrait ${cls || ''} ${list.length > 1 ? 'two' : ''}">${list.map(r => {
      const im = imgs[r.id];
      const img = `<img src="${esc(im.src)}" width="${im.w}" height="${im.h}" alt="${plain ? '' : esc(cap(r.name))}" loading="lazy" decoding="async">`;
      return plain ? `<span class="pic">${img}</span>` : `<a href="${esc(im.src)}" target="_blank" rel="noopener" title="${esc(cap(r.name))} — открыть картинку целиком">${img}</a>`;
    }).join('')}</${tag}>`;
  }

  // заглавная первая видимая буква в готовом HTML (теги, пробелы, кавычки и скобки пропускаются)
  const capHtml = html => String(html === undefined || html === null ? '' : html)
    .replace(/^((?:\s|<[^>]*>|&[a-z]+;|&#\d+;|[«"(])*)([a-zа-яё])/, (m, pre, ch) => pre + ch.toUpperCase());

  // картинки существ, НПС, общин, богов и демонов: ключ — код названия (как в tools/build_images.py)
  const fnv = str => {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(str)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  };
  const picNorm = n => String(n || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
  const picKey = name => { const n = picNorm(name); return fnv(n) + fnv(n + '|'); };
  const pics = name => (name ? (window.PORTRAITS || {})[picKey(name)] || null : null);
  function entityPic(name, cls, plain) {
    const list = pics(name);
    if (!list) return '';
    const tag = plain ? 'span' : 'figure';
    return `<${tag} class="portrait ${cls || ''} ${list.length > 1 ? 'two' : ''}">${list.map(im => {
      const img = `<img src="${esc(im.src)}" width="${im.w}" height="${im.h}" alt="${plain ? '' : esc(cap(name))}" loading="lazy" decoding="async">`;
      return plain ? `<span class="pic">${img}</span>` : `<a href="${esc(im.src)}" target="_blank" rel="noopener" title="${esc(cap(name))} — открыть картинку целиком">${img}</a>`;
    }).join('')}</${tag}>`;
  }
  // маленькая картинка для таблиц и списков (открывается целиком по клику)
  function thumb(name) {
    const list = pics(name);
    if (!list) return '';
    const im = list[0];
    return `<a class="thumb" href="${esc(im.src)}" target="_blank" rel="noopener" title="${esc(cap(name))} — открыть картинку"><img src="${esc(im.src)}" alt="" width="${im.w}" height="${im.h}" loading="lazy" decoding="async"></a>`;
  }

  // Названия из таблиц записаны со строчной буквы («орки», «сфера теней»). В начале пункта списка,
  // ячейки таблицы, варианта выбора, заголовка и карточки нужна заглавная — ставим её при отрисовке,
  // не трогая сами данные (по ним считаются правила). Текст после двоеточия не меняется.
  // заглавная буква в начале каждого предложения (точка после сокращения — не конец предложения)
  const ABBR_DOT = new Set(['доп', 'ед', 'ур', 'восст', 'макс', 'мин', 'физ', 'маг', 'ловк', 'сек', 'см', 'др', 'пр', 'кол', 'шт', 'прим', 'стр', 'напр', 'ок']);
  function sentCap(s) {
    return String(s == null ? '' : s).replace(/(^|[.!?…]\s+)((?:<[^>]+>|&quot;|[«"(\s])*)([a-zа-яё])/g, (m, a, q, c, off, str) => {
      if (a) {
        const w = ((str.slice(0, off).match(/([A-Za-zА-Яа-яЁё]+)$/) || [])[1] || '').toLowerCase();
        if (w.length <= 2 || ABBR_DOT.has(w)) return m;
      }
      return a + q + c.toUpperCase();
    });
  }
  const CAP_SEL = 'td, th, li, dd, option, h1, h2, h3, .ro-name, .boon-name, .tr-name, .bag-name, .cc-name, .slot-i, .camp-name, .cap';
  function capEl(el) {
    if (el.closest('.nocap')) return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue, i = (t.match(/^[\s«"(]*/) || [''])[0].length;
      if (i >= t.length) continue;
      if (/[a-zа-яё]/.test(t[i])) n.nodeValue = t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
      return;
    }
  }
  function capDom(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches(CAP_SEL)) capEl(root);
    root.querySelectorAll(CAP_SEL).forEach(capEl);
  }
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(capDom))).observe(document.documentElement, { childList: true, subtree: true });
  }

  const App = {
    esc, cap, capHtml, capDom, sentCap, store, DICE, portrait, picKey, pics, entityPic, thumb,
    state: null,
    res: null,
    step: 'race',
    tab: 'create',
    steps: [],          // заполняется в steps.js
    ui: {},             // временное состояние интерфейса (фильтры и т.п.)
    editingId: null,

    start() {
      R.init(window.GAME_DATA);
      this.state = this.migrate(store.get(DRAFT_KEY, null)) || R.newState();
      this.editingId = store.get(DRAFT_KEY + ':id', null);
      this.bind();
      if (!this.loadFromHash()) this.route();
      window.addEventListener('hashchange', () => { if (!this.loadFromHash()) this.route(); });
      // ГМ, однажды введший пароль, открывает закрытые разделы автоматически
      if (window.GMLock) window.GMLock.auto().then(ok => { if (ok) { this.recompute && this.recompute(); this.render(); } });
    },

    migrate(s) {
      if (!s || typeof s !== 'object') return null;
      const base = R.newState();
      const st = Object.assign(base, s, {
        alloc: Object.assign(base.alloc, s.alloc || {}),
        traitOpt: Object.assign(base.traitOpt, s.traitOpt || {}),
        boon: Object.assign(base.boon, s.boon || {}),
        weapon: Object.assign(base.weapon, s.weapon || {}),
        ammo: Object.assign(base.ammo, s.ammo || {}),
        armor: Object.assign(base.armor, s.armor || {})
      });
      // старые сохранения: названия, в которых исправлена орфография
      const fix = v => (typeof v === 'string' && (RENAMED[v] || RENAMED_LC[v.toLowerCase()])) || v;
      ['raceId', 'parentA', 'parentB'].forEach(k => { if (st[k]) st[k] = String(fix(st[k])).toLowerCase(); });
      if (st.ancestor) st.ancestor = fix(st.ancestor);
      ['prevSkill', 'prevStance'].forEach(k => { if (st.boonOpt && st.boonOpt[k]) st.boonOpt[k] = fix(st.boonOpt[k]); });
      st.traits = (st.traits || []).map(fix);
      st.boon.name = fix(st.boon.name);
      ['prevSymbol', 'otherRace'].forEach(k => { if (st.boonOpt && st.boonOpt[k]) st.boonOpt[k] = fix(st.boonOpt[k]); });
      if (st.traitOpt.secretSymbol) st.traitOpt.secretSymbol = fix(st.traitOpt.secretSymbol);
      ['weapon', 'ammo', 'armor'].forEach(k => { st[k].name = fix(st[k].name); st[k].mat = fix(st[k].mat); });
      st.items = (st.items || []).map(it => (it && it.name ? Object.assign({}, it, { name: fix(it.name) }) : it));
      if (st.talents) st.talents = Object.fromEntries(Object.entries(st.talents).map(([k, v]) => [fix(k), v]));
      Object.values(st.rolls || {}).forEach(r => { if (r && r.v) r.v = fix(r.v); });
      delete st.faction; delete st.religion;   // фракция и религия на старте не выдаются
      return st;
    },

    // ------------------------------------------------------------ маршруты
    route() {
      const h = location.hash.replace(/^#/, '');
      let [tab, sub, sub2] = h.split('/');
      // «Мир» раньше был разделом справочника: старые ссылки #ref/world ведут во вкладку
      if (tab === 'ref' && sub === 'world') { tab = 'world'; sub = ''; history.replaceState(null, '', '#world'); }
      const tabs = ['home', 'create', 'heroes', 'game', 'ref', 'world', 'rules'];
      const first = !this.routed;
      this.routed = true;
      const prevTab = this.tab, prevRef = this.ui.refSection, prevPath = (this.ui.gamePath || []).join('/') + '|' + (this.ui.heroId || '');
      this.tab = tabs.includes(tab) ? tab : 'home';   // главная — «Мастерская героя»
      if (this.tab === 'game') this.ui.gamePath = [sub, sub2].filter(Boolean);
      if (this.tab === 'heroes') this.ui.heroId = sub || null;
      const path = (this.ui.gamePath || []).join('/') + '|' + (this.ui.heroId || '');
      const moved = prevTab !== this.tab || (this.tab === 'ref' && sub && sub !== prevRef) || path !== prevPath;
      if (moved) window.scrollTo({ top: 0 });
      if (this.tab !== 'game' && window.Game) window.Game.leave();
      if (this.tab !== 'world' && this.ui.wmap && this.ui.wmap.full) { this.ui.wmap.full = false; document.body.classList.remove('wmap-open'); }
      if (this.tab === 'create' && sub && this.steps.some(s => s.id === sub)) this.step = sub;
      if (this.tab === 'ref') this.ui.refSection = sub || this.ui.refSection;
      document.querySelectorAll('.tab-pane').forEach(p => { p.hidden = p.id !== 'tab-' + this.tab; });
      document.querySelectorAll('.tabs a, a.brand').forEach(a => a.setAttribute('aria-current', a.dataset.tab === this.tab ? 'page' : 'false'));
      document.body.dataset.tab = this.tab;
      // на телефоне вкладки — лента с прокруткой: текущая должна быть видна
      const onTab = document.querySelector('.tabs a[aria-current="page"]');
      if (onTab) {
        const nav = onTab.parentElement, r = onTab.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (r.left < nr.left || r.right > nr.right) nav.scrollLeft += r.left - nr.left - (nav.clientWidth - onTab.offsetWidth) / 2;
      }
      this.render();
      if (moved || first) this.enter(document.getElementById('tab-' + this.tab));
      // заставки: «вход в мир» при открытии сайта (кроме «Игры»); если сайт открыт или перезагружен прямо в «Игре» —
      // та же сцена с названием «Игра». Справка по «Игре» — после заставки или сразу при переходе во вкладку
      if (window.Intro) {
        if (first && this.tab !== 'game') window.Intro.world();
        if (this.tab === 'game' && first) window.Intro.game().then(() => { if (this.tab === 'game') window.Intro.gameHelp(); });
        else if (this.tab === 'game' && prevTab !== 'game') window.Intro.gameHelp();
      }
    },

    go(stepId) {
      const changed = stepId !== this.step;
      this.step = stepId;
      if (location.hash !== '#create/' + stepId) history.replaceState(null, '', '#create/' + stepId);
      this.renderCreate();
      const w = document.getElementById('work');
      if (w) { w.scrollTop = 0; w.focus({ preventScroll: true }); if (changed) this.enter(w); }
      window.scrollTo({ top: 0 });
    },

    // плавное появление экрана — только при переходе (вкладка, раздел, шаг), а не при каждой перерисовке
    enter(el) {
      if (!el) return;
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
      el.addEventListener('animationend', function done(e) {
        if (!/^(screen-in|reveal)$/.test(e.animationName)) return;
        el.classList.remove('is-entering');
        el.removeEventListener('animationend', done);
      });
    },

    loadFromHash() {
      const m = location.hash.match(/^#hero=([A-Za-z0-9_\-]+)/);
      if (!m) return false;
      try {
        const st = this.decode(m[1]);
        this.state = this.migrate(st);
        this.editingId = null;
        this.save();
        history.replaceState(null, '', '#create/summary');
        this.step = 'summary';
        this.route();
        this.toast('Персонаж загружен из ссылки');
      } catch (e) {
        history.replaceState(null, '', '#create');
        this.route();
        this.toast('Ссылка повреждена — персонаж не загружен');
      }
      return true;
    },

    encode(st) {
      const json = JSON.stringify(st);
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    decode(s) {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    },

    // ------------------------------------------------------------ состояние
    save() { store.set(DRAFT_KEY, this.state); store.set(DRAFT_KEY + ':id', this.editingId); },

    set(path, value, opts = {}) {
      const parts = path.split('.');
      let o = this.state;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] === undefined || o[parts[i]] === null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      o[parts[parts.length - 1]] = value;
      this.changed(opts);
    },

    changed(opts = {}) {
      this.save();
      if (opts.soft) { this.recompute(); this.renderLedger(); this.renderRail(); return; }
      this.renderCreate();
    },

    recompute() { this.res = R.compute(this.state); return this.res; },

    reset() {
      this.state = R.newState();
      this.editingId = null;
      this.save();
      this.go('race');
    },

    // ------------------------------------------------------------ отрисовка
    render() {
      if (this.tab === 'home' && window.Home) window.Home.render(document.getElementById('tab-home'));
      if (this.tab === 'create') this.renderCreate();
      if (this.tab === 'heroes') window.Heroes.render(document.getElementById('tab-heroes'));
      if (this.tab === 'game') window.Game.render(document.getElementById('tab-game'));
      if (this.tab === 'ref') window.Reference.render(document.getElementById('tab-ref'));
      if (this.tab === 'world') window.Reference.renderWorld(document.getElementById('tab-world'));
      if (this.tab === 'rules') window.Sheet.renderRules(document.getElementById('tab-rules'));
    },

    renderCreate() {
      this.recompute();
      this.renderRail();
      const step = this.steps.find(s => s.id === this.step) || this.steps[0];
      const work = document.getElementById('work');
      const scroll = window.scrollY;
      const active = document.activeElement;
      const activeKey = active && active.dataset ? (active.dataset.bind || active.dataset.key) : null;
      const canRoll = window.RandomHero && window.RandomHero.steps.includes(step.id);
      work.innerHTML = (window.Game ? window.Game.banner() : '') + `<div class="step-head"><div class="step-title"><h1>${esc(step.title)}</h1>${canRoll ? `<button type="button" class="btn ghost dice-btn small" data-act="randomStep" data-step="${step.id}" title="Перебросить только этот шаг — остальное останется, если не сломается">${DICE}<span>Случайно</span></button>` : ''}</div>${step.lead ? `<p class="lead">${step.lead}</p>` : ''}</div>`
        + step.render(this.state, this.res)
        + this.stepIssues(step.id)
        + this.stepNav(step.id);
      this.renderLedger();
      if (activeKey) {
        const el = work.querySelector(`[data-bind="${CSS.escape(activeKey)}"],[data-key="${CSS.escape(activeKey)}"]`);
        if (el && el.focus) { el.focus({ preventScroll: true }); if (el.setSelectionRange && typeof el.value === 'string' && el.type !== 'number' && el.type !== 'range') { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* noop */ } } }
      }
      window.scrollTo({ top: scroll });
      if (step.after) step.after(work);
    },

    stepIssues(stepId) {
      const res = this.res;
      const errs = res.errors.filter(e => e.step === stepId);
      const warns = res.warnings.filter(e => e.step === stepId);
      if (!errs.length && !warns.length) return '';
      return `<div class="issues">${errs.map(e => `<p class="issue err">${esc(e.msg)}</p>`).join('')}${warns.map(e => `<p class="issue warn">${esc(e.msg)}</p>`).join('')}</div>`;
    },

    stepNav(stepId) {
      const ix = this.steps.findIndex(s => s.id === stepId);
      const prev = this.steps[ix - 1], next = this.steps[ix + 1];
      return `<div class="step-nav">
        ${prev ? `<button class="btn ghost" data-act="go" data-step="${prev.id}">Назад: ${esc(prev.short || prev.title)}</button>` : '<span></span>'}
        ${next ? `<button class="btn primary" data-act="go" data-step="${next.id}">Далее: ${esc(next.short || next.title)}</button>` : ''}
      </div>`;
    },

    stepStatus(id) {
      const res = this.res;
      if (res.errors.some(e => e.step === id)) return 'err';
      if (res.warnings.some(e => e.step === id)) return 'warn';
      return 'ok';
    },

    renderRail() {
      const rail = document.getElementById('rail');
      if (!rail) return;
      rail.innerHTML = '<ol>' + this.steps.map((s, i) => {
        const st = this.stepStatus(s.id);
        const label = st === 'err' ? 'есть ошибки' : st === 'warn' ? 'есть замечания' : 'в порядке';
        return `<li><button type="button" data-act="go" data-step="${s.id}" class="rail-item ${s.id === this.step ? 'is-current' : ''}" aria-current="${s.id === this.step ? 'step' : 'false'}">
          <span class="rail-num">${i + 1}</span><span class="rail-title">${esc(s.short || s.title)}</span><span class="dot ${st}" title="${label}"><span class="sr">${label}</span></span></button></li>`;
      }).join('') + '</ol>'
        + (window.RandomHero ? `<div class="rail-dice">
          <button type="button" class="btn dice-btn" data-act="randomFull" title="Собрать случайного персонажа по всем правилам">${DICE}<span>Случайный герой</span></button>
          ${this.state.raceId ? `<button type="button" class="btn ghost dice-btn" data-act="randomFill" title="Заполнить случайно только то, что ещё не выбрано">${DICE}<span>Дополнить случайно</span></button>` : ''}
          ${this.prevState ? `<button type="button" class="linklike undo" data-act="randomUndo">Отменить случайный выбор</button>` : ''}
        </div>` : '');
    },

    pentagon(base, fin) {
      // Пентаграмма характеристик: внутренний контур — раса, внешний — итог
      const keys = R.STATS;
      const max = Math.max(1, ...keys.map(k => fin[k] || 0), ...keys.map(k => base[k] || 0));
      const scale = v => 0.12 + 0.88 * Math.sqrt(Math.max(0, v) / max);
      const pt = (i, f) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        return [50 + 42 * f * Math.cos(a), 52 + 42 * f * Math.sin(a)];
      };
      const poly = vals => keys.map((k, i) => pt(i, scale(vals[k] || 0)).map(n => n.toFixed(1)).join(',')).join(' ');
      const grid = [0.33, 0.66, 1].map(f => `<polygon class="pg-grid" points="${keys.map((k, i) => pt(i, f).map(n => n.toFixed(1)).join(',')).join(' ')}"/>`).join('');
      const axes = keys.map((k, i) => { const [x, y] = pt(i, 1); return `<line class="pg-axis" x1="50" y1="52" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
      const labels = keys.map((k, i) => {
        const [x, y] = pt(i, 1.2);
        return `<text x="${x.toFixed(1)}" y="${(y + 2).toFixed(1)}" class="pg-label">${R.STAT_SHORT[k]}</text>`;
      }).join('');
      return `<svg class="pentagon" viewBox="-6 -4 112 112" role="img" aria-label="Характеристики: ${keys.map(k => R.STAT_NAMES[k] + ' ' + R.fmt(fin[k])).join(', ')}">
        ${grid}${axes}<polygon class="pg-base" points="${poly(base)}"/><polygon class="pg-final" points="${poly(fin)}"/>${labels}</svg>`;
    },

    renderLedger() {
      const el = document.getElementById('ledger');
      if (!el) return;
      const st = this.state, res = this.res, d = res.der;
      const race = res.race;
      const title = st.name ? esc(st.name) : '<span class="muted">Безымянный герой</span>';
      const sub = [race ? esc(race.isHalf && race.parents && race.parents[0] && race.parents[1] ? `полукровка (${race.parents[0].name} и ${race.parents[1].name})` : race.name) : null,
        res.age ? esc(res.age.title.toLowerCase()) + (res.agePct ? ` ${R.signed(res.agePct)}%` : '') : null].filter(Boolean).join(', ');
      const stats = R.STATS.map(k => {
        const b = res.baseStats[k], f = res.stats[k];
        const diff = f - b;
        return `<div class="lg-stat"><span class="lg-name">${R.STAT_NAMES[k]}</span><span class="lg-val">${race ? R.fmt(f) : '—'}</span>${race && Math.abs(diff) > 0.05 ? `<span class="lg-diff ${diff > 0 ? 'up' : 'down'}">${R.signed(diff)}</span>` : '<span class="lg-diff"></span>'}</div>`;
      }).join('');
      const nErr = res.errors.length, nWarn = res.warnings.length;
      const pointsLeft = res.agePoints - res.allocSum;
      const talentLeft = res.talentPoints - res.talentSpent;
      el.innerHTML = `
        <div class="lg-head"><h2>${title}</h2><p>${sub || '<span class="muted">раса и возраст не выбраны</span>'}</p></div>
        ${race ? this.pentagon(res.baseStats, res.stats) : this.pentagon({ t: 0, d: 0, s: 0, i: 0, l: 0 }, { t: 0, d: 0, s: 0, i: 0, l: 0 })}
        <div class="lg-stats">${stats}</div>
        <dl class="lg-der">
          <div><dt>Уровень</dt><dd>${race ? R.fmt(res.level) : '—'}</dd></div>
          <div><dt>ОД в ход</dt><dd>${race ? R.odText(d) : '—'}</dd></div>
          <div><dt>ХП</dt><dd>${race ? R.fmt(d.hp) : '—'}</dd></div>
          <div><dt>МП / Пси</dt><dd>${race ? `${R.fmt(d.mp)} / ${R.fmt(d.psi)}` : '—'}</dd></div>
          <div><dt>Очки характеристик</dt><dd class="${pointsLeft ? 'attn' : ''}">${race && res.age ? (pointsLeft ? `ещё ${R.signed(pointsLeft)}` : 'распределены') : '—'}</dd></div>
          <div><dt>Очки талантов</dt><dd class="${talentLeft ? 'attn' : ''}">${race && res.age ? `${res.talentSpent} из ${res.talentPoints}` : '—'}</dd></div>
        </dl>
        <div class="lg-check ${nErr ? 'bad' : nWarn ? 'meh' : 'good'}">
          ${nErr ? `<strong>Не готово: ${nErr} ${this.plural(nErr, 'ошибка', 'ошибки', 'ошибок')}</strong>` : '<strong>Персонаж собран по правилам</strong>'}
          ${nWarn ? `<span>${nWarn} ${this.plural(nWarn, 'замечание', 'замечания', 'замечаний')}</span>` : ''}
          ${nErr ? `<ul>${res.errors.slice(0, 6).map(e => `<li><button type="button" class="linklike" data-act="go" data-step="${e.step}">${esc(e.msg)}</button></li>`).join('')}${nErr > 6 ? `<li class="muted">и ещё ${nErr - 6}…</li>` : ''}</ul>` : ''}
        </div>`;
    },

    plural(n, one, few, many) {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
      return many;
    },

    toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._tt);
      this._tt = setTimeout(() => t.classList.remove('show'), 2600);
    },

    download(name, text, type = 'application/json') {
      const blob = new Blob([text], { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },

    // ------------------------------------------------------------ события
    bind() {
      const root = document.body;
      // если между нажатием и отпусканием кнопку перерисовали (поле ввода потеряло фокус и обновило
      // страницу), нажимаем такую же кнопку в новой разметке — иначе нажатие терялось бы
      root.addEventListener('pointerdown', e => {
        const b = e.target.closest && e.target.closest('[data-act]');
        if (!b) { this._down = null; return; }
        const sel = `[data-act="${CSS.escape(b.dataset.act)}"]` + ['v', 'key', 'id', 'step', 'status', 'd', 'k']
          .filter(k => b.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(b.dataset[k])}"]`).join('');
        this._down = { el: b, sel };
      }, true);
      root.addEventListener('pointerup', () => {
        const d = this._down;
        this._down = null;
        if (!d || d.el.isConnected) return;
        this._lost = { sel: d.sel, done: false };
        const lost = this._lost;
        setTimeout(() => {
          if (this._lost === lost) this._lost = null;
          const n = document.querySelector(lost.sel);
          if (lost.done || !n || n.disabled) return;
          n.click();
        }, 0);
      }, true);
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (b && e.isTrusted && this._lost && b.matches(this._lost.sel)) this._lost.done = true;   // браузер сам дошёл до новой кнопки
        if (!b) return;
        const act = b.dataset.act;
        const handler = this.actions[act];
        if (handler) { e.preventDefault(); handler.call(this, b, e); }
      });
      root.addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.ui) {
          this.ui[t.dataset.ui] = t.value;
          const target = t.dataset.uiTarget;
          if (target === 'ref') window.Reference.refresh();
          else if (target === 'world') window.Reference.refreshWorld();
          else if (target === 'raceList') this.refreshRaceList();
          else if (target === 'boonList') this.refreshBoonList();
          else if (target === 'heroes') this.keepFocus(t, () => window.Heroes.render(document.getElementById('tab-heroes')));
          else if (target === 'live') { const st = this.steps.find(x => x.id === this.step); if (st && st.live) st.live(document.getElementById('work'), this.res); }
          else if (target === 'none') { /* только запомнить значение */ }
          else if (target === 'dev') { if (this.devCtx) this.keepFocus(t, () => this.devCtx.render()); }
          else this.keepFocus(t, () => this.renderCreate());
          return;
        }
        if (!t.dataset.bind || !t.closest('#tab-create')) return;
        if (t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio' || t.type === 'number') return;
        this.set(t.dataset.bind, this.readInput(t), { soft: true });
        const st = this.steps.find(x => x.id === this.step);
        if (st && st.live) st.live(document.getElementById('work'), this.res);
      });
      root.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.change && this.actions[t.dataset.change]) { this.actions[t.dataset.change].call(this, t, e); return; }
        if (!t.dataset.bind || !t.closest('#tab-create')) return;
        if (t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio' || t.type === 'number' || t.type === 'range') {
          this.set(t.dataset.bind, this.readInput(t));
        } else if (t.dataset.rerender !== undefined) {
          this.renderCreate();
        }
      });
      document.getElementById('ledgerToggle').addEventListener('click', () => {
        const open = document.body.classList.toggle('ledger-open');
        document.getElementById('ledgerToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.getElementById('importFile').addEventListener('change', e => window.Heroes.importFile(e.target.files[0]));
      // шапка с тенью, когда страница прокручена; кнопка «наверх» на длинных страницах
      const toTop = document.getElementById('toTop');
      const onScroll = () => {
        const y = window.scrollY || 0;
        document.body.classList.toggle('scrolled', y > 4);
        if (toTop) toTop.hidden = y < 700;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      if (toTop) toTop.addEventListener('click', () => {
        const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
      });
      // раскрывающиеся блоки плавно показывают содержимое — только по нажатию, не при перерисовке
      root.addEventListener('click', e => {
        const s = e.target.closest && e.target.closest('summary');
        const d = s && s.parentElement;
        if (d && d.tagName === 'DETAILS') setTimeout(() => { if (d.open) this.enter(d); }, 0);
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.body.classList.contains('ledger-open')) {
          document.body.classList.remove('ledger-open');
          document.getElementById('ledgerToggle').setAttribute('aria-expanded', 'false');
        }
      });
    },

    // перерисовка с сохранением фокуса и курсора в поле ввода (чтобы можно было печатать подряд)
    keepFocus(el, fn) {
      const key = el.dataset.ui ? `[data-ui="${el.dataset.ui}"]` : el.dataset.bind ? `[data-bind="${el.dataset.bind}"]` : null;
      let a = null, b = null;
      try { a = el.selectionStart; b = el.selectionEnd; } catch (e) { /* select без курсора */ }
      fn();
      if (!key) return;
      const n = document.querySelector(key);
      if (!n || n === document.activeElement) return;
      n.focus({ preventScroll: true });
      try { if (a !== null) n.setSelectionRange(a, b); } catch (e) { /* noop */ }
    },

    readInput(t) {
      if (t.type === 'checkbox') return t.checked;
      if (t.type === 'number' || t.type === 'range' || t.dataset.num !== undefined) {
        const v = parseFloat(String(t.value).replace(',', '.'));
        return Number.isFinite(v) ? v : 0;
      }
      return t.value;
    },

    actions: {
      go(b) { document.body.classList.remove('ledger-open'); this.go(b.dataset.step); },
      setv(b) {
        let v = b.dataset.v;
        if (b.dataset.num !== undefined) v = parseFloat(v);
        if (b.dataset.json !== undefined) v = JSON.parse(v);
        this.set(b.dataset.path, v);
      },
      reset() { if (confirm('Начать нового персонажа? Текущий черновик будет очищен (сохранённые герои останутся).')) this.reset(); }
    }
  };

  window.App = App;
})();
