/*
 * Сайт переехал на Firebase Hosting (rpg-char-gen.web.app). На старом адресе (GitHub Pages) — плашка под шапкой:
 * «Мои герои», которые лежат только в этом браузере, на новый адрес сами не попадут (у каждого адреса своё хранилище),
 * поэтому сначала просим войти здесь — герои уйдут в облако (js/herosync.js), — а потом перейти.
 */
(function () {
  'use strict';
  const NEW = 'https://rpg-char-gen.web.app/';
  if (!/\.github\.io$/i.test(location.hostname)) return;
  const App = window.App;
  const bar = document.createElement('div');
  bar.className = 'moved-bar';
  bar.setAttribute('role', 'status');
  let last = '';
  function paint() {
    const s = window.HeroSync ? window.HeroSync.status() : {};
    const n = ((App && App.store.get('hero-workshop:heroes', [])) || []).length;
    const go = `<a class="btn small primary" href="${NEW}${location.hash}">Перейти на новый адрес</a>`;
    const html = s.on
      ? `<span><b>Мастерская переехала</b> на <a href="${NEW}">rpg-char-gen.web.app</a>. ${n ? `Ваши герои (${n}) уже в облаке — там они будут на месте, нужно только войти.` : 'Войдите там в тот же аккаунт — кампании и герои на месте.'}</span>${go}`
      : n
        ? `<span><b>Мастерская переехала</b> на <a href="${NEW}">rpg-char-gen.web.app</a>. Ваши «Мои герои» (${n}) хранятся только в этом браузере — <b>сначала войдите здесь</b> (вкладка «Игра»), они перенесутся в облако, и тогда переходите.</span><a class="btn small" href="#game">Войти</a>${go}`
        : `<span><b>Мастерская переехала</b> на <a href="${NEW}">rpg-char-gen.web.app</a>. Кампании и персонажи — там же, войдите в тот же аккаунт.</span>${go}`;
    if (html !== last) { bar.innerHTML = html; last = html; }
  }
  function mount() {
    const head = document.querySelector('.topbar');
    if (!head) return;
    head.insertAdjacentElement('afterend', bar);
    paint();
    setInterval(paint, 1500);
    window.addEventListener('hashchange', paint);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
