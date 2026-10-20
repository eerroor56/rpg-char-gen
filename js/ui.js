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
    "свеживание": "свежевание"
  };

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

  const App = {
    esc, cap, store, DICE, portrait,
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
      const fix = v => (typeof v === 'string' && RENAMED[v]) || v;
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
      const [tab, sub, sub2] = h.split('/');
      const tabs = ['create', 'heroes', 'game', 'ref', 'rules'];
      const prevTab = this.tab, prevRef = this.ui.refSection, prevPath = (this.ui.gamePath || []).join('/') + '|' + (this.ui.heroId || '');
      this.tab = tabs.includes(tab) ? tab : 'create';
      if (this.tab === 'game') this.ui.gamePath = [sub, sub2].filter(Boolean);
      if (this.tab === 'heroes') this.ui.heroId = sub || null;
      const path = (this.ui.gamePath || []).join('/') + '|' + (this.ui.heroId || '');
      if (prevTab !== this.tab || (this.tab === 'ref' && sub && sub !== prevRef) || path !== prevPath) window.scrollTo({ top: 0 });
      if (this.tab !== 'game' && window.Game) window.Game.leave();
      if (this.tab === 'create' && sub && this.steps.some(s => s.id === sub)) this.step = sub;
      if (this.tab === 'ref') this.ui.refSection = sub || this.ui.refSection;
      document.querySelectorAll('.tab-pane').forEach(p => { p.hidden = p.id !== 'tab-' + this.tab; });
      document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === this.tab ? 'page' : 'false'));
      document.body.dataset.tab = this.tab;
      this.render();
    },

    go(stepId) {
      this.step = stepId;
      if (location.hash !== '#create/' + stepId) history.replaceState(null, '', '#create/' + stepId);
      this.renderCreate();
      const w = document.getElementById('work');
      if (w) { w.scrollTop = 0; w.focus({ preventScroll: true }); }
      window.scrollTo({ top: 0 });
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
      if (this.tab === 'create') this.renderCreate();
      if (this.tab === 'heroes') window.Heroes.render(document.getElementById('tab-heroes'));
      if (this.tab === 'game') window.Game.render(document.getElementById('tab-game'));
      if (this.tab === 'ref') window.Reference.render(document.getElementById('tab-ref'));
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
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
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
