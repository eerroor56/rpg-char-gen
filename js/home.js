/*
 * Главная страница «Мастерская героя» (#home): вступление, быстрый старт для игрока и ГМ и справка по сайту.
 * Цифры берутся из открытых данных (data/data.js), закрытые разделы не раскрываются.
 */
(function () {
  'use strict';
  const App = window.App;
  const esc = App.esc;
  const D = () => window.GAME_DATA;

  // счётчики на главной: только открытые данные
  function stats() {
    const d = D(), g = d.gear || {};
    return [
      [(d.races || []).filter(r => r.playable).length, 'игровых рас'],
      [(d.skills.symbols || []).length, 'символов магии'],
      [(d.materials || []).length + (d.crystals || []).length, 'материалов и камней'],
      [(g.weapons || []).length + (g.armor || []).length, 'видов оружия и брони'],
      [(d.artifactPool || []).length, 'артефактов'],
      [((d.world || {}).layers || []).length, 'уровней мира']
    ].filter(([n]) => n);
  }

  const ICONS = {
    create: '<path d="M14.5 3.5l6 6L9 21H3v-6z"/><path d="M12.5 5.5l6 6"/>',
    heroes: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    game: '<path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z"/><path d="M12 2.5 7.6 13.8h8.8zM7.6 13.8 12 21.5l4.4-7.7"/>',
    ref: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5M8 7h8M8 11h6"/>',
    rules: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M10 20v-5h4v5"/>'
  };
  const ic = k => `<svg class="hm-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

  // разделы сайта: что внутри и чем полезно
  const SECTIONS = [
    { id: 'create', href: '#create', t: 'Создание', lead: 'Мастер из 9 шагов собирает героя строго по таблицам.',
      pts: ['раса → возраст → дар → черты → характеристики → таланты → снаряжение → предыстория → лист',
        'справа — живая сводка и ошибки: сайт сам следит за лимитами и балансом черт',
        '«Случайный герой» собирает персонажа целиком, «Случайно» у шага — перебрасывает только его',
        'на листе: ссылка для ГМ, файл, печать и картинка'] },
    { id: 'heroes', href: '#heroes', t: 'Мои герои', lead: 'Сохранённые персонажи и их развитие без ГМ.',
      pts: ['герои хранятся в этом браузере — для переноса скачайте файл', 'сравнение двух героев',
        '«Развитие»: опыт, уровни, общины, снаряжение, кошелёк, состояния, журнал'] },
    { id: 'game', href: '#game', t: 'Игра', lead: 'Кампании онлайн: ГМ и игроки в одном месте.', hot: true,
      pts: ['ГМ создаёт кампанию и раздаёт код из шести знаков', 'игроки собирают героев и отправляют ГМ на проверку',
        'ГМ утверждает листы, начисляет опыт, выдаёт предметы, ведёт сессии, генерирует подземелья',
        'бросок d100 виден всем в журнале кампании'] },
    { id: 'ref', href: '#ref', t: 'Справочник', lead: 'Все таблицы игры с поиском и группами.',
      pts: ['расы, магия, дары, черты, материалы, оружие и броня, предметы, мир с картой',
        'бестиарий, навыки, социум, алхимия, артефакты и механики — по паролю ГМ',
        'калькулятор блюд, напитков и зелий — в «Алхимии и кухне»'] },
    { id: 'rules', href: '#rules', t: 'Как считается', lead: 'Формулы и решения по спорным местам таблиц.',
      pts: ['как считаются уровень, очки, урон, броня, требования', 'настройки ГМ, которые меняются в js/config.js'] }
  ];

  const FAQ = [
    ['Где хранятся мои герои?', 'В «Моих героях» — только в этом браузере. Чтобы перенести героя на другое устройство или показать ГМ, скачайте файл или отправьте ссылку с листа персонажа. Герои кампаний хранятся онлайн, во вкладке «Игра».'],
    ['Как показать героя ГМ?', 'На последнем шаге или на листе нажмите «Ссылка для ГМ» — персонаж целиком зашит в ссылку. Если вы в кампании, отправьте лист на проверку прямо из мастера.'],
    ['Что даёт пароль ГМ?', 'Открывает закрытые разделы справочника: бестиарий, навыки, социум, алхимию, артефакты и механики. Без пароля эти данные зашифрованы. Для создания героя пароль не нужен.'],
    ['Как работают подсказки в полях?', 'Начните печатать — появится список вариантов из таблиц. Выбирайте мышью, пальцем или клавишами ↑ ↓ и Enter; Esc закрывает список.'],
    ['Можно ли играть без интернета?', 'Создание, «Мои герои», справочник и бросок d100 работают и без входа. Кампаниям нужен интернет: они хранятся в облаке Firebase, чтобы ГМ и игроки видели одно и то же.'],
    ['Как распечатать лист?', 'На листе персонажа — «Печать / PDF» или «Скачать картинку» (JPG).']
  ];

  function render(el) {
    const st = App.state || {};
    const draft = st.raceId ? (st.name ? 'Продолжить «' + st.name + '»' : 'Продолжить героя') : '';
    const heroes = (App.store.get('hero-workshop:heroes', []) || []).length;
    const counters = stats();
    el.innerHTML = `<div class="home">
      <section class="hm-hero">
        <div class="hm-sigil" aria-hidden="true">
          <svg viewBox="0 0 200 200"><circle class="hm-ring" cx="100" cy="100" r="92"/><circle class="hm-ring thin" cx="100" cy="100" r="80"/>
            <polygon class="hm-penta" points="100,22 174,76 146,162 54,162 26,76"/><polygon class="hm-penta inner" points="100,54 144,86 127,138 73,138 56,86"/></svg>
        </div>
        <p class="hm-kicker">конструктор героя · справочник · онлайн-игра</p>
        <h1 class="hm-title">Мастерская героя</h1>
        <p class="hm-tag">Соберите героя по правилам своего мира, ведите его в кампании с друзьями и держите под рукой все таблицы ГМ.</p>
        <div class="hm-cta">
          <a class="btn primary hm-big" href="#create">${draft ? esc(draft) : 'Создать героя'}</a>
          <a class="btn hm-big hm-game" href="#game">${ic('game')}<span>Войти в игру</span></a>
          <a class="btn ghost hm-big" href="#ref">Справочник</a>
        </div>
        ${heroes ? `<p class="hm-note"><a href="#heroes">Мои герои: ${heroes}</a></p>` : ''}
        <dl class="hm-stats">${counters.map(([n, t]) => `<div><dt>${esc(t)}</dt><dd data-count="${n}">${n}</dd></div>`).join('')}</dl>
      </section>

      <section class="hm-paths" aria-label="С чего начать">
        <article class="hm-path"><h2>Я игрок</h2><ol>
          <li>Соберите героя во вкладке <a href="#create">«Создание»</a> — или нажмите «Случайный герой».</li>
          <li>Сохраните его в <a href="#heroes">«Мои герои»</a>.</li>
          <li>Получили код от ГМ? Откройте <a href="#game">«Игру»</a> → «Присоединиться» и отправьте героя на проверку.</li></ol></article>
        <article class="hm-path gm"><h2>Я ГМ</h2><ol>
          <li>Откройте <a href="#game">«Игру»</a> и создайте кампанию — появится код приглашения.</li>
          <li>Утверждайте листы, начисляйте опыт, выдавайте предметы, ведите сессии.</li>
          <li>Закрытые разделы <a href="#ref">справочника</a> открываются паролем ГМ.</li></ol></article>
        <article class="hm-path"><h2>Просто посмотреть</h2><ol>
          <li>Листайте <a href="#ref">справочник</a>: расы, магия, оружие, карта мира.</li>
          <li>Загляните в <a href="#rules">«Как считается»</a> — там все формулы.</li>
          <li>Бросьте d100 во вкладке <a href="#game">«Игра»</a> — для этого даже входить не нужно.</li></ol></article>
      </section>

      <section class="hm-help" aria-labelledby="hmHelp">
        <h2 id="hmHelp">Справка по сайту</h2>
        <div class="hm-cards">${SECTIONS.map(s => `<a class="hm-card${s.hot ? ' hot' : ''}" href="${s.href}">
            <span class="hm-card-head">${ic(s.id)}<b>${esc(s.t)}</b></span>
            <span class="hm-card-lead">${esc(s.lead)}</span>
            <ul>${s.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
            <span class="hm-go">Открыть →</span></a>`).join('')}</div>
        <h3>Полезно знать</h3>
        <div class="hm-faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
      </section>
    </div>`;
    countUp(el);
  }

  // числа на главной набегают от нуля, блоки ниже проявляются при прокрутке — после заставки и если движение не отключено
  function countUp(el) {
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = [...el.querySelectorAll('.hm-path, .hm-card, .hm-faq details, .hm-help h2, .hm-help h3')];
    if (calm || !('IntersectionObserver' in window)) return;
    reveal.forEach((n, i) => { n.classList.add('hm-reveal'); n.style.setProperty('--r', (i % 5) * 70 + 'ms'); });
    let alive = false;
    const io = new IntersectionObserver(es => { alive = true; es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    reveal.forEach(n => io.observe(n));
    // страховка: если наблюдатель так и не ответил (страница в фоне), показать всё сразу
    setTimeout(() => { if (!alive) reveal.forEach(n => n.classList.add('in')); }, 2500);
    if (document.body.classList.contains('intro-open')) document.addEventListener('intro-done', () => run(el), { once: true });
    else run(el);
  }
  function run(el) {
    const nodes = [...el.querySelectorAll('[data-count]')];
    const t0 = performance.now(), dur = 1200;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      nodes.forEach(n => { n.textContent = Math.round(+n.dataset.count * e); });
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  window.Home = { render };
})();
