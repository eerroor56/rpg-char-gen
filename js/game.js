/*
 * Вкладка «Игра»: кампании с ГМ и игроками.
 *   #game                 вход и список кампаний
 *   #game/join/КОД        присоединиться по ссылке-приглашению
 *   #game/<cid>           кампания: персонажи, сессии, журнал, участники
 *   #game/<cid>/<chid>    персонаж: развитие, лист, журнал
 * Данные — window.Cloud (js/cloud.js), развитие — window.Dev (js/progress.js).
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules, C = window.Cloud, Dev = window.Dev;
  const esc = App.esc, cap = App.cap, fmt = R.fmt;
  const TARGET_KEY = 'hero-workshop:cloud-target';
  const FEED_SHUT = 'hero-workshop:feed-shut';
  const STATUS = { draft: 'черновик', review: 'на проверке у ГМ', active: 'в игре', dead: 'погиб', retired: 'на покое' };
  const when = ms => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

  const G = {
    el: null,
    key: '',          // для какой страницы оформлены подписки
    subs: {},         // имя → отписка
    d: {},            // данные текущей страницы
    cache: new Map(), // расчёт персонажей: chid → { ms, v }
    joining: null,
    hooked: false
  };

  // ------------------------------------------------------------ привязка мастера к кампании
  const target = () => App.store.get(TARGET_KEY, null);
  const setTarget = t => App.store.set(TARGET_KEY, t);
  const clearTarget = () => { try { localStorage.removeItem(TARGET_KEY); } catch (e) { /* noop */ } };

  function banner() {
    const t = target();
    if (!t) return '';
    return `<div class="cloud-banner no-print"><span>Персонаж для кампании <b>«${esc(t.cname)}»</b>${t.chid ? ' — правка сохранённого листа' : ''}. Когда закончите, сохраните его на шаге «Итог».</span>
      <span class="row-actions"><a class="btn ghost small" href="#game/${esc(t.cid)}${t.chid ? '/' + esc(t.chid) : ''}">К кампании</a><button type="button" class="linklike small" data-act="gDetach">отвязать от кампании</button></span></div>`;
  }

  function sheetButtons() {
    const t = target();
    if (!t) return '';
    if (t.chid && !['draft', 'review'].includes(t.status)) {
      return `<button type="button" class="btn primary" data-act="gSaveWizard" data-status="keep">Сохранить лист в кампании</button>`;
    }
    return `<button type="button" class="btn primary" data-act="gSaveWizard" data-status="review">Отправить ГМ на проверку</button>
      <button type="button" class="btn" data-act="gSaveWizard" data-status="draft">Сохранить черновик в кампании</button>`;
  }

  // ------------------------------------------------------------ подписки
  function unsubAll() { Object.values(G.subs).forEach(f => { try { f(); } catch (e) { /* noop */ } }); G.subs = {}; }
  function leave() { unsubAll(); G.key = ''; G.d = {}; }
  function sub(name, fn) {
    if (G.subs[name]) G.subs[name]();
    const key = G.key;
    G.subs[name] = fn(
      (field) => v => { if (G.key !== key) return; G.d[field] = v; G.d.err = null; schedule(); },
      e => { if (G.key !== key) return; G.d.err = C.errorText(e); G.d.errCode = e && e.code; schedule(); }
    );
  }
  function setPage(key, start) {
    if (G.key === key) return;
    unsubAll();
    G.key = key; G.d = {};
    start();
  }
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; repaint(); }); }
  function repaint() {
    if (App.tab !== 'game' || !G.el) return;
    if (window.Battle && window.Battle.busy()) return;      // фишку тянут — перерисуем после того, как отпустят
    // прокрутка журнала и панели у карты не сбрасывается, когда страница перерисовывается
    const kept = [...G.el.querySelectorAll('[data-keep]')].map(x => [x.dataset.keep, x.scrollTop]);
    const draw = () => {
      paint();
      kept.forEach(([k, top]) => { const x = G.el.querySelector(`[data-keep="${k}"]`); if (x) x.scrollTop = top; });
    };
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.ui && G.el.contains(a)) App.keepFocus(a, draw); else draw();
  }

  // ------------------------------------------------------------ бросок d100
  // Честный бросок 1–100: криптографический генератор браузера, без перекоса (лишние значения отбрасываются).
  function d100() {
    const cr = window.crypto || window.msCrypto;
    if (!cr || !cr.getRandomValues) return Math.floor(Math.random() * 100) + 1;
    const a = new Uint32Array(1), lim = 4294967200;   // наибольшее кратное 100, меньшее 2^32
    do { cr.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % 100 + 1;
  }
  // o: { cid } — бросок в журнал кампании; { cid, chid, chName } — за персонажа; {} — без записи;
  // compact — поменьше, side — в панели у карты боя (без подсказки)
  function diceBox(o) {
    o = o || {};
    const last = App.ui.gDiceLast, hist = App.ui.gDiceHist || [];
    const fresh = last && Date.now() - last.ms < 900;
    const hint = o.cid ? (o.chid ? `Бросок за «${esc(o.chName || 'персонажа')}» попадёт в журнал кампании — его увидят ГМ и игроки.` : 'Результат попадает в журнал кампании — его видят ГМ и все игроки.')
      : 'Бросок никуда не записывается — в кампании результат попадает в журнал.';
    return `<section class="card dice-box${o.compact ? ' compact' : ''}${o.side ? ' side' : ''}" data-o="${esc(JSON.stringify(o))}"${o.side ? ` title="${hint}"` : ''}>
      <h2>${App.DICE}<span>Бросок d100${o.chid ? ` за «${esc(o.chName || 'персонажа')}»` : ''}</span></h2>
      <div class="dice-row">
        <div class="dice-face${fresh ? ' fresh' : ''}${last ? '' : ' empty'}${last && (last.n === 1 || last.n === 100) ? ' edge' : ''}" aria-live="polite" aria-label="Результат броска">${last ? last.n : '—'}</div>
        <div class="dice-ctl">
          <input type="text" data-ui="gDiceWhy" data-ui-target="none" value="${esc(App.ui.gDiceWhy || '')}" maxlength="200" placeholder="за что бросок (необязательно)" aria-label="За что бросок">
          <button type="button" class="btn primary" data-act="gRoll">Бросить d100</button>
        </div>
      </div>
      ${hist.length > 1 ? `<p class="small dice-hist">Предыдущие: ${hist.slice(1, o.side ? 7 : 9).map(h => `<span title="${esc(h.why || '')}">${h.n}</span>`).join(' ')}</p>` : ''}
      ${o.side ? '' : `<p class="muted small">${hint}</p>`}</section>`;
  }
  function redrawDice(box) {
    let o = {};
    try { o = JSON.parse(box.dataset.o || '{}'); } catch (e) { /* noop */ }
    const tmp = document.createElement('div');
    tmp.innerHTML = diceBox(o);
    box.replaceWith(tmp.firstElementChild);
  }

  // ------------------------------------------------------------ вход
  function render(el) {
    G.el = el;
    if (!C.configured()) { el.innerHTML = notConfigured(); return; }
    if (!C.ready) {
      el.innerHTML = C.error ? initError() : `<div class="page game"><div class="card empty loading">Подключаюсь к серверу игры…</div></div>`;
      if (!C.error) C.init().then(() => { hook(); if (App.tab === 'game') render(el); });
      return;
    }
    hook();
    paint();
  }

  function hook() {
    if (G.hooked || !C.ready) return;
    G.hooked = true;
    C.onAuth(() => { leave(); if (App.tab === 'game') render(G.el || document.getElementById('tab-game')); });
  }

  function paint() {
    const el = G.el;
    if (!C.user) { leave(); el.innerHTML = signIn(); return; }
    const [a, b] = App.ui.gamePath || [];
    if (a === 'join') { joinByLink(b); el.innerHTML = `<div class="page game"><div class="card empty loading">Присоединяюсь к кампании…</div></div>`; return; }
    if (!a) { listPage(el); return; }
    if (!b) { campaignPage(el, a); return; }
    characterPage(el, a, b);
  }

  // ------------------------------------------------------------ начальный экран — в стиле главной
  // шапка не появляется заново, если экран просто перерисовался (пришли данные, сменился режим входа)
  function hero(o) {
    const calm = !!(G.el && G.el.querySelector('.gm-hero'));
    return window.Home.hero(Object.assign({ cls: 'gm-hero', calm, kicker: 'кампании · сессии · бросок d100', title: 'Игра' }, o));
  }
  const helpBig = () => `<button type="button" class="btn ghost hm-big help-btn" data-act="gameHelp"><span class="help-q" aria-hidden="true">?</span>Справка</button>`;
  const PATHS = `<section class="hm-paths" aria-label="Как устроена игра">
      <article class="hm-path gm"><h2>Я ГМ</h2><ol>
        <li>Войдите и создайте кампанию — появится код из шести знаков и ссылка.</li>
        <li>Отправьте код или ссылку игрокам.</li>
        <li>Утверждайте листы, начисляйте опыт, выдавайте предметы, ведите сессии и генерируйте подземелья.</li></ol></article>
      <article class="hm-path"><h2>Я игрок</h2><ol>
        <li>Войдите — через Google или по почте.</li>
        <li>«Присоединиться» → код от ГМ (или просто откройте его ссылку).</li>
        <li>Соберите героя в мастере и отправьте ГМ на проверку.</li></ol></article>
      <article class="hm-path"><h2>Без входа</h2><ol>
        <li>Бросок d100 ниже работает и без входа.</li>
        <li>Героев можно собирать и хранить в <a href="#heroes">«Моих героях»</a>.</li>
        <li>Правила и таблицы — в <a href="#ref">справочнике</a>.</li></ol></article>
    </section>`;

  function notConfigured() {
    return `<div class="page game game-home">${hero({ tag: 'Кампании с друзьями: персонажи, сессии и журнал в одном месте.', cta: helpBig() })}
      <div class="card"><h2>Онлайн-игра ещё не подключена</h2>
        <p>Чтобы ГМ видел, кто какого персонажа создал, начислял опыт и вёл кампанию, сайту нужно онлайн-хранилище. Его один раз подключает владелец сайта.</p>
        <p class="muted">Пока можно собирать героев и вести их развитие во вкладке «Мои герои» — там всё хранится в этом браузере.</p></div>
      ${diceBox({})}</div>`;
  }

  function initError() {
    return `<div class="page game game-home">${hero({ tag: 'Кампании с друзьями: персонажи, сессии и журнал в одном месте.', cta: helpBig() })}
      <div class="card checks bad"><h2>Не удалось подключиться</h2><p>${esc(C.errorText(C.error))}</p>
      <p class="muted small">Проверьте интернет и обновите страницу. Если сайт открыт в режиме «инкогнито» или с блокировщиком, попробуйте обычное окно.</p>
      <button type="button" class="btn" onclick="location.reload()">Обновить страницу</button></div></div>`;
  }

  function signIn() {
    const mode = App.ui.gAuthMode === 'signup' ? 'signup' : 'signin';
    const join = (App.ui.gamePath || [])[0] === 'join' ? (App.ui.gamePath || [])[1] : null;
    return `<div class="page game game-home">
      ${hero({
        tag: 'Кампании с друзьями: ГМ создаёт кампанию и даёт игрокам код, игроки собирают персонажей, а ГМ утверждает листы, начисляет опыт и ведёт журнал сессий. Всё хранится онлайн — игру можно продолжить с любого устройства.',
        cta: `<button type="button" class="btn primary hm-big" data-act="gGoogle">Войти через Google</button>
          <button type="button" class="btn hm-big" data-act="gFocus" data-v=".signin input">Войти по почте</button>${helpBig()}`
      })}
      ${join ? `<div class="card note">После входа вы присоединитесь к кампании по коду <b>${esc(C.normCode(join))}</b>.</div>` : ''}
      <div class="card signin"><h2>${mode === 'signup' ? 'Регистрация по почте' : 'Вход по почте'}</h2>
        <form data-game-form="${mode}" novalidate>
          ${mode === 'signup' ? '<label>Имя в игре <input type="text" name="name" autocomplete="nickname" maxlength="40" required placeholder="как вас будут видеть ГМ и игроки"></label>' : ''}
          <label>Почта <input name="email" type="email" autocomplete="email" required></label>
          <label>Пароль <input name="pw" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></label>
          <div class="row-actions"><button type="submit" class="btn primary">${mode === 'signup' ? 'Зарегистрироваться' : 'Войти'}</button>
            <button type="button" class="linklike" data-act="gAuthMode">${mode === 'signup' ? 'У меня уже есть вход' : 'Регистрация по почте'}</button>
            ${mode === 'signin' ? '<button type="button" class="linklike" data-act="gReset">Забыли пароль?</button>' : ''}</div>
          <p class="lock-msg" role="alert"></p>
        </form>
      </div>
      ${C.mode === 'local' ? '<p class="muted small">Тестовый режим (?cloud=local): всё хранится в этом браузере, вход — по любому имени.</p>' : ''}
      ${PATHS}
      ${diceBox({})}
    </div>`;
  }

  async function joinByLink(code) {
    if (G.joining === code) return;
    G.joining = code;
    try {
      const cid = await C.joinCampaign(code);
      App.toast('Вы в кампании');
      location.hash = '#game/' + cid;
    } catch (e) {
      App.toast(C.errorText(e));
      location.hash = '#game';
    } finally { setTimeout(() => { G.joining = null; }, 1000); }
  }

  // краткая справка по разделу (js/intro.js) — открывается снова этой кнопкой
  function helpBtn() {
    return `<button type="button" class="btn ghost small help-btn" data-act="gameHelp"><span class="help-q" aria-hidden="true">?</span>Справка</button>`;
  }

  // ------------------------------------------------------------ список кампаний
  function userBar() {
    return `<div class="row-actions user-bar"><span class="muted">Вы: <b>${esc(C.name())}</b></span>
      <button type="button" class="linklike small" data-act="gRename">сменить имя</button>
      <button type="button" class="btn ghost small" data-act="gSignOut">Выйти</button></div>`;
  }

  function listPage(el) {
    setPage('list', () => sub('camps', (ok, bad) => C.watchMyCampaigns(ok('camps'), bad)));
    const camps = G.d.camps;
    const t = target();
    const asGm = (camps || []).filter(c => c.gm === C.uid()).length;
    const stat = (n, label) => `<div><dt>${label}</dt><dd>${camps ? n : '…'}</dd></div>`;
    el.innerHTML = `<div class="page game game-home">
      ${hero({
        tag: 'Ваши кампании, персонажи, сессии и журнал — в одном месте. Создайте свою кампанию или войдите в чужую по коду от ГМ.',
        cta: `<button type="button" class="btn primary hm-big" data-act="gFocus" data-v="[data-game-form=create] input">Новая кампания</button>
          <button type="button" class="btn hm-big hm-game" data-act="gFocus" data-v="[data-game-form=join] input">${window.Home.ic('game')}<span>Присоединиться по коду</span></button>${helpBig()}`,
        after: `<p class="hm-note hm-user">Вы: <b>${esc(C.name())}</b><button type="button" class="linklike small" data-act="gRename">сменить имя</button><button type="button" class="linklike small" data-act="gSignOut">выйти</button></p>
          <dl class="hm-stats">${stat((camps || []).length, 'кампаний')}${stat(asGm, 'вы ГМ')}${stat((camps || []).length - asGm, 'вы игрок')}${stat((camps || []).filter(c => (c.session || {}).active).length, 'идут сессии')}</dl>`
      })}
      ${G.d.err ? `<div class="checks bad"><p>${esc(G.d.err)}</p></div>` : ''}
      ${t ? `<div class="card note">В мастере открыт персонаж для кампании «${esc(t.cname)}». <a href="#create/summary">Вернуться к нему</a></div>` : ''}
      <h2>Мои кампании</h2>
      ${!camps ? '<div class="card empty loading">Загружаю…</div>' : camps.length ? `<ul class="camp-list">${camps.map(c => {
        const gm = c.gm === C.uid();
        const s = c.session || {};
        return `<li><a class="camp-card card" href="#game/${esc(c.id)}">
          <span class="camp-name">${esc(c.name)}</span>
          <span class="tag ${gm ? 'freq' : ''}">${gm ? 'вы ГМ' : 'ГМ: ' + esc(c.gmName || '—')}</span>
          <span class="muted small">участников: ${(c.members || []).length}${s.n ? ` · ${s.active ? `<b class="live">идёт сессия ${s.n}</b>` : `сессий: ${s.n}`}` : ''}</span></a></li>`;
      }).join('')}</ul>` : '<div class="card empty">Вы пока не участвуете ни в одной кампании. Создайте свою или войдите по коду от ГМ.</div>'}
      <div class="two-col game-start">
        <form class="card" data-game-form="create"><h2>Новая кампания</h2>
          <p class="muted small">Вы станете ГМ: увидите всех персонажей, будете утверждать листы и начислять опыт.</p>
          <label>Название <input type="text" name="name" required maxlength="120" placeholder="например, «Сумеречный тракт»"></label>
          <button type="submit" class="btn primary">Создать кампанию</button><p class="lock-msg" role="alert"></p></form>
        <form class="card" data-game-form="join"><h2>Присоединиться</h2>
          <p class="muted small">Код приглашения выдаёт ГМ — шесть букв и цифр.</p>
          <label>Код <input type="text" name="code" required autocomplete="off" maxlength="12" placeholder="ABC234" class="code-input"></label>
          <button type="submit" class="btn primary">Войти в кампанию</button><p class="lock-msg" role="alert"></p></form>
      </div>
      ${diceBox({})}
    </div>`;
  }

  // ------------------------------------------------------------ кампания
  function charView(ch) {
    const c = G.cache.get(ch.id);
    if (c && c.ms === ch.updatedMs) return c.v;
    const v = Dev.compute(JSON.parse(JSON.stringify(ch)));
    G.cache.set(ch.id, { ms: ch.updatedMs, v });
    return v;
  }

  function campaignPage(el, cid) {
    setPage('camp:' + cid, () => {
      sub('camp', (ok, bad) => C.watchCampaign(cid, c => { ok('camp')(c); maybePrivate(cid, '_campaign'); C.syncName(c); }, bad));
      sub('chars', (ok, bad) => C.watchCharacters(cid, ok('chars'), bad));
      sub('sessions', (ok, bad) => C.watchSessions(cid, ok('sessions'), bad));
      feedSub(cid);
    });
    const { camp, chars, events, sessions } = G.d;
    if (G.d.err && !camp) { el.innerHTML = deniedPage(); return; }
    if (!camp) { el.innerHTML = `<div class="page game"><div class="card empty loading">Загружаю кампанию…</div></div>`; return; }
    const gm = camp.gm === C.uid();
    const me = C.uid();
    const order = { review: 0, active: 1, draft: 2, dead: 3, retired: 4 };
    const list = (chars || []).slice().sort((x, y) => (gm ? 0 : (x.owner === me ? -1 : 0) - (y.owner === me ? -1 : 0)) || (order[x.status] - order[y.status]) || (x.createdMs - y.createdMs));
    const review = (chars || []).filter(x => x.status === 'review').length;
    const s = camp.session || {};
    const t = target();
    const localHeroes = App.store.get('hero-workshop:heroes', []);

    // союзники отряда: список в кампании (меняет ГМ), показываются и среди персонажей, и на поле боя
    const party = (chars || []).filter(x => x.status === 'active').map(ch => ({ id: ch.id, name: ch.name || 'Безымянный герой' }));
    const saveAllies = allies => {
      G.d.camp = Object.assign({}, G.d.camp, { allies });
      repaint();
      return C.updateCampaign(cid, { allies }).catch(e => App.toast(C.errorText(e)));
    };
    const alliesHtml = window.Battle && chars ? window.Battle.alliesBlock({ gm, heroes: party, allies: camp.allies || [], save: saveAllies }) : '';
    const charsHtml = `<section class="camp-chars"><div class="sec-head"><h2>Персонажи</h2>${gm && review ? `<span class="tag freq">на проверке: ${review}</span>` : ''}</div>
      ${!chars ? '<div class="card empty loading">Загружаю…</div>' : list.length ? `<ul class="char-grid">${list.map(ch => {
        const v = charView(ch), race = v.res.race;
        const pic = race ? App.portrait(race.isHalf && race.parents ? race.parents : [race.base], 'mini', true) : '';
        return `<li><a class="char-card card ${ch.owner === me ? 'mine' : ''}" href="#game/${esc(cid)}/${esc(ch.id)}">${pic}
          <span class="cc-body"><span class="cc-name">${esc(ch.name || 'Безымянный герой')}</span>
          <span class="small">${race ? esc(cap(race.name)) : 'раса не выбрана'}${race ? `, ур. ${fmt(v.res.level)}` : ''}</span>
          <span class="small muted">игрок: ${esc(ch.ownerName || '—')}${ch.owner === me ? ' (вы)' : ''}</span>
          <span class="tag st-${esc(ch.status)}">${STATUS[ch.status] || esc(ch.status)}</span>${window.Inv && window.Inv.incoming(ch, ch.id, chars).length ? ` <span class="tag freq" title="Другой персонаж передаёт вещи — принять во вкладке «Снаряжение»">передают вещи: ${window.Inv.incoming(ch, ch.id, chars).length}</span>` : ''}</span></a></li>`;
      }).join('')}</ul>` : '<div class="card empty">Персонажей пока нет.</div>'}
      ${alliesHtml}
      <div class="card new-char"><h3>Новый персонаж в кампанию</h3>
        <div class="row-actions">
          <button type="button" class="btn primary" data-act="gNewChar">Собрать в мастере</button>
          ${App.state && App.state.raceId && !(t && t.chid) ? `<button type="button" class="btn" data-act="gUseDraft">Взять черновик из мастера${App.state.name ? ` («${esc(App.state.name)}»)` : ''}</button>` : ''}
        </div>
        ${localHeroes.length ? `<div class="dev-row"><select data-ui="gLocalHero" data-ui-target="none" aria-label="Герой из «Моих героев»"><option value="">— из «Моих героев» —</option>${localHeroes.map(h => `<option value="${esc(h.id)}" ${App.ui.gLocalHero === h.id ? 'selected' : ''}>${esc(h.state.name || 'Безымянный герой')}</option>`).join('')}</select>
          <button type="button" class="btn" data-act="gFromLocal">Добавить</button></div>` : ''}
        <p class="muted small">Персонаж уходит ГМ на проверку; после утверждения лист создания фиксируется, а дальше идёт развитие: опыт, уровни, фракции, предметы.</p>
      </div></section>`;

    const sessionHtml = `<section class="card session-box"><h2>Сессия</h2>
      ${s.active ? `<p><b class="live">Идёт сессия ${s.n}</b> <span class="muted small">с ${when(s.startedMs)}</span></p>` : s.n ? `<p>Сессия ${s.n} завершена.</p>` : '<p class="muted">Сессий ещё не было.</p>'}
      ${gm ? `<div class="row-actions">${s.active ? `<button type="button" class="btn" data-act="gEndSession">Завершить сессию ${s.n}</button>`
        : `<button type="button" class="btn primary" data-act="gStartSession">${s.n ? `Начать сессию ${s.n + 1}` : 'Начать первую сессию'}</button>${s.n ? `<button type="button" class="btn ghost" data-act="gResumeSession">Продолжить сессию ${s.n}</button>` : ''}`}</div>
        <p class="muted small">Всё, что происходит во время сессии, помечается её номером в журнале.</p>` : ''}
    </section>`;

    const inviteHtml = gm ? `<section class="card invite"><h2>Приглашение</h2>
      <p>Код: <code class="join-code">${esc(camp.code)}</code></p>
      <div class="row-actions"><button type="button" class="btn small" data-act="gCopy" data-v="${esc(camp.code)}">Скопировать код</button>
        <button type="button" class="btn small" data-act="gCopy" data-v="${esc(joinLink(camp.code))}">Скопировать ссылку</button>
        <button type="button" class="linklike small" data-act="gNewCode">сменить код</button></div>
      <p class="muted small">Игрок вводит код во вкладке «Игра» → «Присоединиться» или просто открывает ссылку.</p></section>` : '';

    const counts = {};
    (chars || []).forEach(ch => { counts[ch.owner] = (counts[ch.owner] || 0) + 1; });
    const membersHtml = `<section class="card members"><h2>Участники</h2><ul class="dev-list">${(camp.members || []).map(u => `<li><span>${esc((camp.memberNames || {})[u] || 'игрок')}${u === camp.gm ? ' <span class="tag freq">ГМ</span>' : ''}${u === me ? ' <span class="muted small">(вы)</span>' : ''}${counts[u] ? ` <span class="muted small">— персонажей: ${counts[u]}</span>` : ''}</span>
      ${gm && u !== me ? `<button type="button" class="linklike small" data-act="gKick" data-v="${esc(u)}">исключить</button>` : ''}</li>`).join('')}</ul>
      ${!gm ? '<button type="button" class="linklike small danger" data-act="gLeave">покинуть кампанию</button>' : ''}</section>`;

    const feed = App.ui.gFeed || 'all';
    const sessOpts = (sessions || []).map(x => `<option value="${x.n}" ${String(feed) === String(x.n) ? 'selected' : ''}>сессия ${x.n}</option>`).join('');
    // журнал можно свернуть — это запоминается в этом браузере
    const feedShut = !!App.store.get(FEED_SHUT, false);
    const feedHtml = `<section class="camp-feed${feedShut ? ' is-shut' : ''}"><div class="sec-head"><h2><button type="button" class="feed-toggle" data-act="gFeedToggle" aria-expanded="${!feedShut}" title="${feedShut ? 'Развернуть журнал' : 'Свернуть журнал'}"><span class="feed-chev" aria-hidden="true">${feedShut ? '▸' : '▾'}</span>Журнал${feedShut && events && events.length ? ` <span class="tag">${events.length}</span>` : ''}</button></h2>
        ${sessOpts && !feedShut ? `<select data-change="gFeed" aria-label="Что показать"><option value="all">последние события</option>${sessOpts}</select>` : ''}</div>
      ${feedShut ? '' : `<div class="dev-row"><input type="text" data-ui="gNote" data-ui-target="none" value="${esc(App.ui.gNote || '')}" maxlength="2000" placeholder="${gm ? 'что произошло в игре — увидят все' : 'запись в журнал — увидят все'}" aria-label="Запись в журнал">
        <button type="button" class="btn small" data-act="gNote">Записать</button></div>
      ${feedList(events, cid, chars)}`}</section>`;

    const sessionsHtml = (sessions || []).length ? `<section class="card sessions"><h2>Итоги сессий</h2>${sessions.map(x => `<details ${x.n === s.n ? 'open' : ''}><summary>Сессия ${x.n} <span class="muted small">${when(x.startedMs)}${x.endedMs ? ' – ' + when(x.endedMs) : ' · идёт'}</span></summary>
        ${gm ? `<textarea rows="3" data-ui="gSess${x.n}" data-ui-target="none" placeholder="итоги: куда пришли, что нашли, кого победили">${esc(App.ui['gSess' + x.n] !== undefined ? App.ui['gSess' + x.n] : (x.notes || ''))}</textarea>
          <button type="button" class="btn small" data-act="gSessNotes" data-v="${x.n}">Сохранить итоги</button>` : `<p class="pre small">${esc(x.notes || 'итогов пока нет')}</p>`}</details>`).join('')}</section>` : '';

    const privHtml = gm ? `<section class="card private"><h2>Заметки ГМ</h2><p class="muted small">Видите только вы.</p>
      <textarea rows="5" data-ui="gPrivCamp" data-ui-target="none" placeholder="сюжетные зацепки, секреты, планы">${esc(App.ui.gPrivCamp !== undefined ? App.ui.gPrivCamp : ((G.d.priv_campaign || {}).text || ''))}</textarea>
      <button type="button" class="btn small" data-act="gSavePriv" data-v="_campaign">Сохранить</button></section>` : '';

    const settingsHtml = gm ? `<details class="card settings"><summary>Настройки кампании</summary>
      <div class="dev-row"><input type="text" data-ui="gCampName" data-ui-target="none" value="${esc(App.ui.gCampName !== undefined ? App.ui.gCampName : camp.name)}" maxlength="120" aria-label="Название кампании">
        <button type="button" class="btn small" data-act="gRenameCamp">Переименовать</button></div>
      <button type="button" class="btn ghost danger small" data-act="gDeleteCamp">Удалить кампанию</button>
      <p class="muted small">Удаляются все персонажи, журнал и сессии этой кампании.</p></details>` : '';

    // генератор подземелий: уровень противников — от среднего уровня персонажей в игре
    const inGame = (chars || []).filter(x => x.status === 'active');
    const treasuryHtml = gm && chars ? treasury(inGame, cid) : '';
    const partyLevel = inGame.length ? inGame.reduce((a, ch) => a + (charView(ch).res.level || 0), 0) / inGame.length : 1;
    // поле боя: видят все участники; герой двигается записью в своего персонажа (pos), остальное — полем в кампании.
    // Пока поле есть, бросок и журнал — в панели рядом с картой (игрок бросает за своего героя), а не внизу страницы
    const arena = !!(window.Battle && camp.board);
    const myHero = gm ? null : inGame.find(ch => ch.owner === me);
    const sideHtml = arena ? diceBox(myHero ? { cid, chid: myHero.id, chName: myHero.name || 'Безымянный герой', compact: true, side: true } : { cid, compact: true, side: true }) + feedHtml : '';
    const battleHtml = window.Battle ? window.Battle.card({
      cid, camp, gm, me, level: partyLevel, rerender: repaint, side: sideHtml,
      heroes: inGame.map(ch => { const v = charView(ch); return { id: ch.id, name: ch.name || 'Безымянный герой', owner: ch.owner, ownerName: ch.ownerName, pos: ch.pos, apos: ch.apos, vit: ch.vit, der: v.res.der, race: v.res.race }; }),
      saveAllies,
      allies: camp.allies || [],
      saveBoard: board => {
        G.d.camp = Object.assign({}, G.d.camp, { board });        // сразу показать, не дожидаясь сервера
        repaint();
        return C.updateCampaign(cid, { board }).catch(e => App.toast(C.errorText(e)));
      },
      savePos: (chid, pos) => {
        G.d.chars = (G.d.chars || []).map(x => (x.id === chid ? Object.assign({}, x, { pos }) : x));
        repaint();
        return C.updateCharacter(cid, chid, { pos }).catch(e => App.toast(C.errorText(e)));
      },
      // ХП и МП героя в бою — в его персонаже (vit): меняет игрок или ГМ
      saveVit: (chid, vit) => {
        G.d.chars = (G.d.chars || []).map(x => (x.id === chid ? Object.assign({}, x, { vit }) : x));
        repaint();
        return C.updateCharacter(cid, chid, { vit }).catch(e => App.toast(C.errorText(e)));
      },
      // союзник героя стоит там, где его поставили, — это записано в персонаже героя (apos), его меняет игрок или ГМ
      saveAllyPos: (chid, aid, p) => {
        const ch = (G.d.chars || []).find(x => x.id === chid);
        const apos = Object.assign({}, (ch && ch.apos) || {}, { [aid]: p });
        G.d.chars = (G.d.chars || []).map(x => (x.id === chid ? Object.assign({}, x, { apos }) : x));
        repaint();
        return C.updateCharacter(cid, chid, { apos }).catch(e => App.toast(C.errorText(e)));
      }
    }) : '';
    const dungeonHtml = gm && window.Dungeon ? window.Dungeon.card({ cid, level: partyLevel, rerender: repaint }) : '';

    el.innerHTML = `<div class="page game${arena ? ' has-arena' : ''}">
      <p class="crumbs"><a href="#game">Все кампании</a></p>
      <div class="page-head"><h1>${esc(camp.name)}</h1><span class="row-actions">${helpBtn()}${userBar()}</span></div>
      <p class="muted">${gm ? 'Вы ГМ этой кампании.' : `ГМ: ${esc(camp.gmName || '—')}.`} ${s.active ? `<b class="live">Идёт сессия ${s.n}.</b>` : ''}</p>
      ${G.d.err ? `<div class="checks bad"><p>${esc(G.d.err)}</p></div>` : ''}
      ${battleHtml}
      <div class="camp-grid">
        <div class="camp-main">${charsHtml}${arena ? '' : diceBox({ cid })}${dungeonHtml}${arena ? '' : feedHtml}</div>
        <aside class="camp-side">${sessionHtml}${treasuryHtml}${inviteHtml}${membersHtml}${sessionsHtml}${privHtml}${settingsHtml}</aside>
      </div></div>`;
  }

  // казна отряда (видит ГМ): сколько денег у всех персонажей в игре вместе и у каждого
  function treasury(list, cid) {
    const K = window.Craft, coins = window.GM_CONFIG.CURRENCIES;
    const sum = {}, other = new Map();
    const rows = list.map(ch => {
      const w = (charView(ch).inv || {}).wallet || {};
      coins.forEach(c => { sum[c.id] = (sum[c.id] || 0) + K.num(w[c.id]); });
      (w.other || []).filter(x => x && x.name && K.num(x.qty)).forEach(x => {
        const k = R.norm(x.name);
        other.set(k, { name: x.name, qty: ((other.get(k) || {}).qty || 0) + K.num(x.qty) });
      });
      return { ch, copper: K.walletCopper(w) };
    }).sort((a, b) => b.copper - a.copper);
    const total = K.walletCopper(sum);
    return `<section class="card treasury"><h2>Казна отряда</h2>
      ${list.length ? `<p>Всего у персонажей в игре: <b>${esc(K.money(total))}</b></p>
      <div class="coins">${coins.filter(c => sum[c.id]).map(c => `<div class="coin"><b>${fmt(sum[c.id])}</b><span>${esc(c.id)}</span><small>${esc(c.name)}</small></div>`).join('') || '<p class="muted small">Денег пока нет.</p>'}</div>
      ${other.size ? `<p class="small">Особая валюта: ${[...other.values()].map(x => `${esc(x.name)} ${fmt(x.qty)}`).join(', ')}</p>` : ''}
      <ul class="dev-list treasury-list">${rows.map(r => `<li><a href="#game/${esc(cid)}/${esc(r.ch.id)}">${esc(r.ch.name || 'Безымянный герой')}</a><span class="muted small">${esc(K.money(r.copper))}</span></li>`).join('')}</ul>`
        : '<p class="muted small">Персонажей в игре пока нет.</p>'}
      <p class="muted small">Валюту выдаёте вы на странице персонажа (Снаряжение → Кошелёк), тратят и разменивают игроки.</p></section>`;
  }

  function feedSub(cid) {
    const f = App.ui.gFeed && App.ui.gFeed !== 'all' ? { session: +App.ui.gFeed } : { limit: 60 };
    sub('events', (ok, bad) => C.watchEvents(cid, ok('events'), bad, f));
  }

  function maybePrivate(cid, pid) {
    const c = G.d.camp || C.camps[cid];
    const name = 'priv' + pid;
    if (!c || c.gm !== C.uid() || G.subs[name]) return;
    sub(name, (ok, bad) => C.watchPrivate(cid, pid, ok('priv' + pid), () => { /* заметки не обязательны */ }));
  }

  function feedList(events, cid, chars) {
    if (!events) return '<p class="muted small">Загружаю…</p>';
    if (!events.length) return '<p class="muted small">Записей пока нет.</p>';
    const alive = new Set((chars || []).map(x => x.id));
    const body = e => (e.kind === 'roll' && typeof e.roll === 'number'
      ? `<span class="roll-ev">${App.DICE}d100: <b class="roll-num${e.roll === 1 || e.roll === 100 ? ' edge' : ''}">${e.roll}</b>${e.why ? ` — ${esc(e.why)}` : ''}</span>`
      : esc(e.text));
    return `<ol class="feed" data-keep="feed">${events.map(e => `<li class="ev-${esc(e.kind || 'note')}">
      <span class="muted small">${when(e.ms)}${e.session ? ` · <span class="tag">сессия ${e.session}</span>` : ''}</span>
      <span>${e.chid && e.chName ? (alive.has(e.chid) ? `<a href="#game/${esc(cid)}/${esc(e.chid)}"><b>${esc(e.chName)}</b></a>: ` : `<b>${esc(e.chName)}</b>: `) : ''}${body(e)}${['note', 'dev', 'roll'].includes(e.kind) ? ` <span class="muted small">— ${esc(e.byName || '')}</span>` : ''}</span></li>`).join('')}</ol>`;
  }

  function deniedPage() {
    return `<div class="page game"><p class="crumbs"><a href="#game">Все кампании</a></p>
      <div class="card checks bad"><h2>Кампания недоступна</h2><p>${esc(G.d.err)}</p>
      <p class="muted small">Её могли удалить или вас исключили. Попросите у ГМ новый код приглашения.</p></div></div>`;
  }

  function joinLink(code) { return location.origin + location.pathname + '#game/join/' + code; }

  // ------------------------------------------------------------ персонаж
  function characterPage(el, cid, chid) {
    setPage('ch:' + cid + '/' + chid, () => {
      sub('camp', (ok, bad) => C.watchCampaign(cid, c => { ok('camp')(c); maybePrivate(cid, chid); }, bad));
      sub('ch', (ok, bad) => C.watchCharacter(cid, chid, ok('ch'), bad));
      sub('chars', (ok, bad) => C.watchCharacters(cid, ok('chars'), bad));   // кому передать предмет и что передают этому
      sub('events', (ok, bad) => C.watchEvents(cid, ok('events'), bad, { chid }));
    });
    const { camp, ch, events } = G.d;
    if (G.d.err && (!camp || !ch)) { el.innerHTML = deniedPage(); return; }
    if (!camp || ch === undefined) { el.innerHTML = `<div class="page game"><div class="card empty loading">Загружаю персонажа…</div></div>`; return; }
    if (!ch) { el.innerHTML = `<div class="page game"><p class="crumbs"><a href="#game/${esc(cid)}">${esc(camp.name)}</a></p><div class="card empty">Персонаж удалён.</div></div>`; return; }
    const gm = camp.gm === C.uid(), owner = ch.owner === C.uid();
    Dev.own('c:' + chid);
    const rec = JSON.parse(JSON.stringify(ch));
    App.devCtx = {
      record: rec,
      perms: { gm, owner },
      chid,
      party: G.d.chars ? G.d.chars.filter(x => x.id !== chid) : null,
      save: (patch, text) => {
        const p = JSON.parse(JSON.stringify(patch));
        const lvl = Dev.compute(Object.assign({}, rec, p)).res.level;
        const job = C.updateCharacter(cid, chid, Object.assign({}, p, { level: lvl }), text, ch.name);
        if (G.d.ch && G.d.ch.id === chid) G.d.ch = Object.assign({}, G.d.ch, p);   // сразу показать, не дожидаясь сервера
        return job;
      },
      render: repaint
    };
    const v = charView(ch);
    const race = v.res.race;
    const st = ch.status;
    const acts = [];
    if ((owner || gm) && ['draft', 'review'].includes(st)) acts.push('<button type="button" class="btn" data-act="gEditWizard">Править лист в мастере</button>');
    if (owner && st === 'draft') acts.push('<button type="button" class="btn primary" data-act="gStatus" data-v="review">Отправить ГМ на проверку</button>');
    if (owner && !gm && st === 'review') acts.push('<button type="button" class="btn ghost" data-act="gStatus" data-v="draft">Забрать на доработку</button>');
    if (gm && ['draft', 'review'].includes(st)) acts.push('<button type="button" class="btn primary" data-act="gStatus" data-v="active">Утвердить — в игру</button>', '<button type="button" class="btn ghost" data-act="gReturn">Вернуть на доработку</button>');
    if (gm && st === 'active') acts.push('<button type="button" class="btn ghost" data-act="gEditWizard">Изменить лист создания</button>', '<button type="button" class="btn ghost" data-act="gStatus" data-v="dead">Погиб</button>', '<button type="button" class="btn ghost" data-act="gStatus" data-v="retired">На покой</button>');
    if (gm && ['dead', 'retired'].includes(st)) acts.push('<button type="button" class="btn" data-act="gStatus" data-v="active">Вернуть в игру</button>');
    acts.push('<button type="button" class="btn ghost" data-act="gCopyLocal">Копия в «Мои герои»</button>');
    if (gm || (owner && ['draft', 'review'].includes(st))) acts.push('<button type="button" class="btn ghost danger" data-act="gDeleteChar">Удалить</button>');

    const errs = v.res0.errors;
    const checks = gm && ['draft', 'review'].includes(st) ? `<div class="checks ${errs.length ? 'bad' : 'good'}"><h2>${errs.length ? `Лист не проходит проверку: ${errs.length}` : 'Лист собран по правилам'}</h2>
      ${errs.length ? `<ul>${errs.map(e => `<li class="err">${esc(e.msg)}</li>`).join('')}</ul>` : ''}
      ${v.res0.notes.length ? `<h3>Для ГМ</h3><ul>${v.res0.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>` : '';

    const notice = (st === 'review' ? `<div class="card note">${gm ? 'Игрок отправил лист на проверку. Проверьте вкладку «Лист персонажа» и утвердите или верните на доработку.' : 'Лист у ГМ на проверке. Пока он не утверждён, его ещё можно поправить.'}</div>` : '')
      + (st === 'draft' ? `<div class="card note">Черновик. ${owner ? 'Когда лист готов — отправьте его ГМ.' : 'Игрок ещё собирает персонажа.'}</div>` : '')
      + checks;

    el.innerHTML = Dev.page({
      record: rec,
      perms: { gm, owner },
      crumbs: `<a href="#game">Кампании</a> › <a href="#game/${esc(cid)}">${esc(camp.name)}</a>`,
      sub: `${race ? esc(cap(race.name)) + ', ' : ''}ур. ${fmt(v.res.level)} · игрок: ${esc(ch.ownerName || '—')}${owner ? ' (вы)' : ''} · <span class="tag st-${esc(st)}">${STATUS[st] || esc(st)}</span>`,
      notice: (G.d.err ? `<div class="checks bad"><p>${esc(G.d.err)}</p></div>` : '') + notice + ((gm || owner) && st === 'active' ? diceBox({ cid, chid, chName: ch.name || 'Безымянный герой', compact: true }) : ''),
      actions: acts.join(''),
      log: (events || []).map(e => ({ at: e.ms, text: e.text, byName: e.byName, session: e.session })),
      devLocked: ['draft', 'review'].includes(st) ? 'Развитие начнётся, когда ГМ утвердит персонажа: тогда появятся опыт, уровни, фракции, предметы и заметки.' : '',
      privateBox: gm ? `<section class="card private"><h2>Заметки ГМ о персонаже</h2><p class="muted small">Видите только вы.</p>
        <textarea rows="4" data-ui="gPriv" data-ui-target="none" placeholder="тайны персонажа, планы на него">${esc(App.ui.gPriv !== undefined ? App.ui.gPriv : ((G.d['priv' + chid] || {}).text || ''))}</textarea>
        <button type="button" class="btn small" data-act="gSavePriv" data-v="${esc(chid)}">Сохранить</button></section>` : ''
    });
  }

  // ------------------------------------------------------------ действия
  const cur = () => { const [cid, chid] = App.ui.gamePath || []; return { cid, chid }; };
  async function run(fn, okText) {
    try { await fn(); if (okText) App.toast(okText); } catch (e) { App.toast(C.errorText(e)); }
  }

  Object.assign(App.actions, {
    // кнопки в шапке: к нужной форме, курсор — в первое поле
    gFocus(b) {
      const f = G.el && G.el.querySelector(b.dataset.v);
      if (!f) return;
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      f.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      f.focus({ preventScroll: true });
    },
    gRoll(b) {
      const box = b.closest('.dice-box');
      let o = {};
      try { o = JSON.parse((box && box.dataset.o) || '{}'); } catch (e) { /* noop */ }
      const n = d100();
      const why = String(App.ui.gDiceWhy || '').trim().slice(0, 200);
      App.ui.gDiceLast = { n, ms: Date.now() };
      App.ui.gDiceHist = [{ n, why }].concat(App.ui.gDiceHist || []).slice(0, 12);
      App.ui.gDiceWhy = '';
      if (box) redrawDice(box);
      if (o.cid && C.user) run(() => C.roll(o.cid, n, why, o.chid, o.chName));
    },
    gGoogle() { run(() => C.google()); },
    gAuthMode() { App.ui.gAuthMode = App.ui.gAuthMode === 'signup' ? 'signin' : 'signup'; paint(); },
    gReset() {
      const f = G.el.querySelector('[data-game-form]');
      const email = f && f.email.value.trim();
      if (!email) { f.querySelector('.lock-msg').textContent = 'Впишите почту — пришлём ссылку для нового пароля.'; f.email.focus(); return; }
      run(() => C.reset(email), 'Письмо для смены пароля отправлено на ' + email);
    },
    gSignOut() { run(() => C.signOut()); },
    gRename() {
      const name = (prompt('Имя в игре (его видят ГМ и игроки):', C.name()) || '').trim().slice(0, 40);
      if (name) run(() => C.rename(name), 'Имя изменено. В кампаниях оно обновится, когда вы их откроете.');
    },
    gCopy(b) {
      const text = b.dataset.v;
      const done = () => App.toast('Скопировано: ' + text);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Скопируйте:', text));
      else prompt('Скопируйте:', text);
    },
    gNewCode() { if (confirm('Старый код перестанет работать. Сменить?')) run(() => C.newCode(cur().cid), 'Новый код готов'); },
    gKick(b) {
      const c = G.d.camp, name = (c.memberNames || {})[b.dataset.v] || 'игрок';
      if (confirm(`Исключить ${name} из кампании? Его персонажи останутся.`)) run(() => C.removeMember(cur().cid, b.dataset.v), 'Исключён');
    },
    gLeave() {
      if (!confirm('Покинуть кампанию? Ваши персонажи останутся у ГМ; вернуться можно по коду.')) return;
      run(async () => { await C.leaveCampaign(cur().cid); location.hash = '#game'; }, 'Вы покинули кампанию');
    },
    gStartSession() { run(() => C.startSession(cur().cid), 'Сессия началась'); },
    gResumeSession() { run(() => C.resumeSession(cur().cid), 'Сессия продолжается'); },
    gEndSession() {
      const c = G.d.camp, n = c.session.n;
      const notes = App.ui['gSess' + n];
      run(() => C.endSession(cur().cid, notes), `Сессия ${n} завершена. Итоги можно дописать в блоке «Итоги сессий».`);
    },
    gSessNotes(b) {
      const n = +b.dataset.v, notes = String(App.ui['gSess' + n] || '');
      run(async () => { await C.saveSessionNotes(cur().cid, n, notes); App.ui['gSess' + n] = undefined; }, 'Итоги сохранены');
    },
    gSavePriv(b) {
      const pid = b.dataset.v, key = pid === '_campaign' ? 'gPrivCamp' : 'gPriv';
      const text = String(App.ui[key] !== undefined ? App.ui[key] : '');
      run(async () => { await C.savePrivate(cur().cid, pid, text); App.ui[key] = undefined; }, 'Заметки сохранены');
    },
    // подземелье из генератора — в конец личных заметок ГМ по кампании
    gDgNotes() {
      const { cid } = cur();
      const text = window.Dungeon ? window.Dungeon.text(cid) : '';
      if (!text) return;
      const was = App.ui.gPrivCamp !== undefined ? App.ui.gPrivCamp : ((G.d.priv_campaign || {}).text || '');
      const next = (was.trim() ? was.trim() + '\n\n' : '') + text;
      run(async () => { await C.savePrivate(cid, '_campaign', next); App.ui.gPrivCamp = undefined; }, 'Подземелье добавлено в заметки ГМ');
    },
    gNote() {
      const text = String(App.ui.gNote || '').trim();
      if (!text) return;
      run(async () => { await C.note(cur().cid, text); App.ui.gNote = ''; repaint(); });
    },
    gFeed(t) { App.ui.gFeed = t.value; feedSub(cur().cid); repaint(); },
    gFeedToggle() { App.store.set(FEED_SHUT, !App.store.get(FEED_SHUT, false)); repaint(); },
    gRenameCamp() {
      const name = String(App.ui.gCampName || '').trim();
      if (!name) return;
      run(async () => { await C.updateCampaign(cur().cid, { name }); App.ui.gCampName = undefined; }, 'Кампания переименована');
    },
    gDeleteCamp() {
      const c = G.d.camp;
      if (prompt(`Удалить кампанию «${c.name}» со всеми персонажами и журналом? Это нельзя отменить. Чтобы подтвердить, впишите её название:`) !== c.name) return;
      run(async () => { leave(); await C.deleteCampaign(c.id); location.hash = '#game'; }, 'Кампания удалена');
    },

    // персонажи
    gNewChar() {
      const c = G.d.camp;
      if (App.state && App.state.raceId && !confirm('В мастере есть черновик. Начать нового персонажа с нуля? (Черновик можно сначала сохранить в «Мои герои».)')) return;
      App.state = R.newState(); App.editingId = null; App.save();
      setTarget({ cid: c.id, chid: null, cname: c.name });
      location.hash = '#create/race';
    },
    gUseDraft() {
      const c = G.d.camp;
      setTarget({ cid: c.id, chid: null, cname: c.name });
      location.hash = '#create/summary';
    },
    gFromLocal() {
      const h = App.store.get('hero-workshop:heroes', []).find(x => x.id === App.ui.gLocalHero);
      if (!h) { App.toast('Выберите героя'); return; }
      const res = R.compute(App.migrate(JSON.parse(JSON.stringify(h.state))));
      const cid = cur().cid;
      run(async () => {
        const chid = await C.createCharacter(cid, App.migrate(h.state), res.ok ? 'review' : 'draft');
        App.ui.gLocalHero = '';
        location.hash = `#game/${cid}/${chid}`;
      }, res.ok ? 'Персонаж отправлен ГМ на проверку' : 'Добавлен как черновик: в листе есть ошибки');
    },
    gEditWizard() {
      const c = G.d.camp, ch = G.d.ch;
      const t = target();
      if (App.state && App.state.raceId && !(t && t.chid === ch.id) && !confirm(`Черновик в мастере будет заменён листом «${ch.name}». Продолжить?`)) return;
      App.state = App.migrate(JSON.parse(JSON.stringify(ch.state)));
      App.editingId = null; App.save();
      // развитие в игре едет вместе с листом: в мастере лист показывается с ним (меняется только лист создания)
      setTarget({ cid: c.id, chid: ch.id, cname: c.name, status: ch.status,
        rec: JSON.parse(JSON.stringify({ prog: ch.prog, gm: ch.gm, equip: ch.equip, spells: ch.spells, vit: ch.vit, purse: ch.purse, notes: ch.notes, give: ch.give, got: ch.got, made: ch.made })) });
      location.hash = '#create/summary';
    },
    gStatus(b) {
      const ch = G.d.ch, to = b.dataset.v, gm = G.d.camp.gm === C.uid();
      const texts = {
        review: 'отправляет лист ГМ на проверку',
        draft: 'забирает лист на доработку',
        active: ch.status === 'review' || ch.status === 'draft' ? 'ГМ утверждает персонажа — он в игре' : 'ГМ возвращает персонажа в игру',
        dead: 'ГМ отмечает: персонаж погиб',
        retired: 'ГМ отправляет персонажа на покой'
      };
      if (to === 'active' && (ch.status === 'review' || ch.status === 'draft')) {
        const v = charView(ch);
        if (v.res0.errors.length && !confirm(`В листе ${v.res0.errors.length} ошибок. Всё равно утвердить?`)) return;
      }
      if (to === 'dead' && !confirm(`«${ch.name}» погиб?`)) return;
      const who = gm ? '' : C.name() + ' ';
      run(() => C.updateCharacter(cur().cid, ch.id, { status: to }, (to === 'review' || to === 'draft') ? who + texts[to] : texts[to], ch.name), STATUS[to] ? 'Статус: ' + STATUS[to] : '');
    },
    gReturn() {
      const ch = G.d.ch;
      const why = prompt('Что поправить? Игрок увидит это в журнале.', '');
      if (why === null) return;
      run(() => C.updateCharacter(cur().cid, ch.id, { status: 'draft' }, `ГМ возвращает лист на доработку${why.trim() ? ': ' + why.trim() : ''}`, ch.name), 'Возвращено игроку');
    },
    gDeleteChar() {
      const ch = G.d.ch, cid = cur().cid;
      if (!confirm(`Удалить «${ch.name}» из кампании? Это нельзя отменить.`)) return;
      run(async () => { leave(); await C.deleteCharacter(cid, ch.id, ch.name); location.hash = '#game/' + cid; }, 'Персонаж удалён');
    },
    gCopyLocal() {
      const ch = G.d.ch, c = G.d.camp;
      const l = App.store.get('hero-workshop:heroes', []);
      const copy = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: Date.now(), state: JSON.parse(JSON.stringify(ch.state)), prog: ch.prog, gm: ch.gm, notes: ch.notes || '',
        log: [{ at: Date.now(), text: `Копия из кампании «${c.name}»` }].concat((G.d.events || []).map(e => ({ at: e.ms, text: e.text, byName: e.byName, session: e.session }))) };
      l.push(JSON.parse(JSON.stringify(copy)));
      if (App.store.set('hero-workshop:heroes', l)) App.toast('Копия сохранена в «Мои герои»'); else App.toast('Не удалось сохранить в браузере');
    },
    gDetach() { clearTarget(); App.toast('Мастер отвязан от кампании'); App.renderCreate(); },
    async gSaveWizard(b) {
      const t = target();
      if (!t) return;
      const status = b.dataset.status;
      if (!C.configured()) { App.toast('Онлайн-игра не подключена'); return; }
      await C.init();
      if (!C.user) { App.toast('Сначала войдите — вкладка «Игра». Черновик никуда не денется.'); location.hash = '#game'; return; }
      const res = App.recompute();
      if (status === 'review' && res.errors.length && !confirm(`В листе ${res.errors.length} ошибок. Всё равно отправить ГМ?`)) return;
      const state = JSON.parse(JSON.stringify(App.state));
      const s = C.summary(state);
      b.disabled = true;
      try {
        let chid = t.chid;
        if (!chid) chid = await C.createCharacter(t.cid, state, status);
        else {
          const patch = { state, name: s.name, raceId: s.raceId, level: s.level };
          if (status !== 'keep') patch.status = status;
          const text = status === 'keep' ? 'ГМ изменяет лист создания' : status === 'review' ? `${C.name()} обновляет лист и отправляет ГМ на проверку` : `${C.name()} сохраняет черновик листа`;
          await C.updateCharacter(t.cid, chid, patch, text, s.name);
        }
        clearTarget();
        App.toast(status === 'review' ? 'Отправлено ГМ на проверку' : 'Сохранено в кампании');
        location.hash = `#game/${t.cid}/${chid}`;
      } catch (e) {
        b.disabled = false;
        App.toast(C.errorText(e));
      }
    }
  });

  // формы входа и кампаний
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-game-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.gameForm, msg = f.querySelector('.lock-msg'), btn = f.querySelector('button[type=submit]');
    const say = t => { if (msg) msg.textContent = t; };
    btn.disabled = true; say('');
    try {
      if (kind === 'signin' || kind === 'signup') {
        const email = f.email.value.trim(), pw = f.pw.value;
        if (!email || !pw) throw new Error('Впишите почту и пароль.');
        if (kind === 'signup') {
          const name = f.name.value.trim();
          if (!name) throw new Error('Впишите имя — его увидят ГМ и игроки.');
          await C.signUp(name, email, pw);
        } else await C.signIn(email, pw);
      } else if (kind === 'create') {
        const name = f.name.value.trim();
        if (!name) throw new Error('Придумайте название.');
        const cid = await C.createCampaign(name);
        location.hash = '#game/' + cid;
      } else if (kind === 'join') {
        const cid = await C.joinCampaign(f.code.value);
        location.hash = '#game/' + cid;
      }
    } catch (err) {
      say(C.errorText(err));
      btn.disabled = false;
    }
  });

  const targetRecord = () => { const t = target(); return t && t.chid && t.rec ? t.rec : null; };
  window.Game = { render, leave, banner, sheetButtons, target, targetRecord };
})();
