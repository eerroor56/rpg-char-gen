/*
 * «Мастерская героя» как приложение: service worker (sw.js — работа без интернета) и кнопка «Установить» в шапке.
 * Chrome, Edge, Android сами предлагают установку (beforeinstallprompt) — кнопка её вызывает; на iPhone и iPad такой
 * команды у Safari нет — кнопка показывает, как добавить сайт на экран «Домой». В установленном приложении кнопки нет.
 * На старом адресе (GitHub Pages) приложение не ставится — там плашка о переезде (js/moved.js).
 */
(function () {
  'use strict';
  const App = window.App;
  const oldHost = /\.github\.io$/i.test(location.hostname);
  // открыто как приложение: окно приложения (любой режим) или запуск с иконки (start_url — ./?app=1; запоминается до закрытия)
  if (/[?&]app=1(&|$)/.test(location.search)) { try { sessionStorage.setItem('mh-app', '1'); } catch (e) { /* noop */ } }
  const standalone = () => ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(m => window.matchMedia(`(display-mode: ${m})`).matches)
    || navigator.standalone === true || (() => { try { return sessionStorage.getItem('mh-app') === '1'; } catch (e) { return false; } })();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt = null;

  if ('serviceWorker' in navigator && !oldHost && location.protocol !== 'file:') {
    const v = ((document.querySelector('script[src*="js/pwa.js"]') || {}).src || '').split('v=')[1] || '0';
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(v)).catch(() => { /* без приложения сайт работает как обычно */ }); });
  }

  const btn = () => document.getElementById('installApp');
  function show(on) { const b = btn(); if (b) b.hidden = !on || standalone() || oldHost; }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; show(true); });
  window.addEventListener('appinstalled', () => { prompt = null; show(false); App.toast('«Мастерская героя» установлена — ищите иконку на экране или в меню приложений'); });

  App.actions.installApp = async function () {
    if (prompt) {
      prompt.prompt();
      const r = await prompt.userChoice.catch(() => null);
      if (r && r.outcome === 'accepted') show(false);
      prompt = null;
      return;
    }
    const d = document.getElementById('installHelp');
    if (d && d.showModal) d.showModal();
  };
  App.actions.installHelpClose = () => { const d = document.getElementById('installHelp'); if (d) d.close(); };

  document.addEventListener('DOMContentLoaded', () => { if (ios) show(true); });
  if (document.readyState !== 'loading' && ios) show(true);
})();
