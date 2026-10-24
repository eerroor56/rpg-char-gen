/*
 * Заставки и всплывающая справка.
 *   world()    — «вход в мир» при открытии сайта (кроме «Игры»): звёздное небо, рунический круг рисуется сам,
 *                кубик d20, название по буквам, затем круг раскрывается порталом. Раз за сеанс браузера.
 *   game()     — когда сайт открыт или перезагружен прямо во вкладке «Игра»: та же сцена, но с названием «Игра».
 *   gameHelp() — краткая справка по «Игре»: сама показывается раз за сеанс, пока её не отключили галочкой.
 * Любую заставку можно пропустить щелчком или клавишей. При «уменьшении движения» в системе заставок нет.
 */
(function () {
  'use strict';
  const App = window.App;
  const WORLD_KEY = 'hero-workshop:intro-world';        // sessionStorage: заставка уже была в этом сеансе
  const HELP_OFF = 'hero-workshop:game-help-off';         // localStorage: справку по «Игре» больше не показывать
  const HELP_SEEN = 'hero-workshop:game-help-seen';       // sessionStorage: в этом сеансе уже показывали

  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: k => { try { sessionStorage.setItem(k, '1'); } catch (e) { /* noop */ } } };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, on) => { try { if (on) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };
  const D20 = '<path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z"/><path d="M12 2.5 7.6 13.8h8.8zM3.5 7.4l4.1 6.4M20.5 7.4l-4.1 6.4M7.6 13.8 12 21.5l4.4-7.7M3.5 16.6l4.1-2.8M20.5 16.6l-4.1-2.8"/>';
  const rnd = (a, b) => a + Math.random() * (b - a);

  // общий каркас заставки: слой поверх сайта, пропуск щелчком / клавишей, снятие по таймеру
  function overlay(cls, html, total, fadeAt) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'intro ' + cls;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = html;
      document.body.appendChild(el);
      document.body.classList.add('intro-open');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t1); clearTimeout(t2);
        el.classList.add('is-out');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => {
          el.remove();
          if (!document.querySelector('.intro')) { document.body.classList.remove('intro-open'); document.dispatchEvent(new Event('intro-done')); }
          resolve();
        }, 450);
      };
      const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); } };
      el.addEventListener('click', finish);
      document.addEventListener('keydown', onKey, true);
      const t1 = setTimeout(() => el.classList.add('is-leaving'), fadeAt);
      const t2 = setTimeout(finish, total);
    });
  }

  // ------------------------------------------------------------ сцена-портал (общая для сайта и «Игры»)
  function portal(name, sub, skip) {
    const stars = Array.from({ length: 70 }, () => `<i style="left:${rnd(0, 100).toFixed(1)}%;top:${rnd(0, 100).toFixed(1)}%;--d:${rnd(0, 3).toFixed(2)}s;--s:${rnd(1, 2.6).toFixed(1)}px"></i>`).join('');
    const embers = Array.from({ length: 26 }, () => `<b style="left:${rnd(5, 95).toFixed(1)}%;--d:${rnd(0, 2.4).toFixed(2)}s;--x:${rnd(-40, 40).toFixed(0)}px;--t:${rnd(2.6, 4.2).toFixed(2)}s"></b>`).join('');
    const title = name.split('').map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
    // руны по кругу: короткие черты разной длины
    const ticks = Array.from({ length: 48 }, (_, i) => { const a = i * 7.5, long = i % 4 === 0; return `<line x1="100" y1="${long ? 6 : 9}" x2="100" y2="${long ? 16 : 13}" transform="rotate(${a} 100 100)"/>`; }).join('');
    return overlay('intro-world', `
      <div class="iw-sky">${stars}</div>
      <div class="iw-embers">${embers}</div>
      <div class="iw-core">
        <svg class="iw-sigil" viewBox="0 0 200 200">
          <g class="iw-ticks">${ticks}</g>
          <circle class="iw-c1" cx="100" cy="100" r="88"/><circle class="iw-c2" cx="100" cy="100" r="74"/>
          <polygon class="iw-p1" points="100,30 166,78 141,156 59,156 34,78"/>
          <polygon class="iw-p2" points="100,30 141,156 34,78 166,78 59,156"/>
        </svg>
        <svg class="iw-d20" viewBox="0 0 24 24">${D20}</svg>
      </div>
      <h1 class="iw-title">${title}</h1>
      <p class="iw-sub">${sub}</p>
      <span class="iw-skip">${skip}</span>`, 4400, 3600);
  }

  // вход в мир — раз за сеанс браузера
  function world() {
    if (calm() || ss.get(WORLD_KEY)) return Promise.resolve();
    ss.set(WORLD_KEY);
    return portal('Мастерская героя', 'Каждая история начинается с героя', 'нажмите, чтобы войти');
  }

  // вход в «Игру» — та же сцена; показывается при загрузке сайта во вкладке «Игра» (js/ui.js, route)
  function game() {
    if (calm()) return Promise.resolve();
    return portal('Игра', 'Бросайте кубик — приключение начинается', 'нажмите, чтобы начать');
  }

  // ------------------------------------------------------------ справка по «Игре»
  function gameHelp(force) {
    if (!force && (ls.get(HELP_OFF) || ss.get(HELP_SEEN))) return;
    if (document.querySelector('.modal-back')) return;
    ss.set(HELP_SEEN);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal game-help" role="dialog" aria-modal="true" aria-labelledby="ghTitle">
      <button type="button" class="modal-x" data-close aria-label="Закрыть">×</button>
      <div class="gh-head"><svg class="gh-ic" viewBox="0 0 24 24" aria-hidden="true">${D20}</svg><h2 id="ghTitle">Коротко об «Игре»</h2></div>
      <ol class="gh-steps">
        <li><b>Войдите</b> — через Google или по почте. Без входа работает только бросок d100.</li>
        <li><b>ГМ создаёт кампанию</b> — появляется код из шести знаков и ссылка, их отправляют игрокам.</li>
        <li><b>Игроки присоединяются</b> по коду и собирают героя в мастере — «Отправить ГМ на проверку».</li>
        <li><b>ГМ утверждает лист</b>, дальше — развитие: опыт, общины, предметы, состояния, карма.</li>
        <li><b>Во время игры</b> — сессии и журнал, бросок d100 (его видят все), поле боя (каждый двигает своего героя), у ГМ — генератор подземелий, казна отряда и личные заметки.</li>
      </ol>
      <p class="muted small">Открыть справку снова — кнопка «Справка» вверху раздела.</p>
      <label class="check gh-off"><input type="checkbox" ${ls.get(HELP_OFF) ? 'checked' : ''}> Больше не показывать при входе в «Игру»</label>
      <div class="row-actions"><button type="button" class="btn primary" data-close>Понятно</button></div>
    </div>`;
    const prev = document.activeElement;
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    const close = () => {
      ls.set(HELP_OFF, back.querySelector('.gh-off input').checked);
      back.classList.add('is-out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { back.remove(); document.body.classList.remove('modal-open'); if (prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true }); }, 220);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      // фокус не уходит из окна
      if (e.key === 'Tab') {
        const f = [...back.querySelectorAll('button, input')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { const b = back.querySelector('.btn.primary'); if (b) b.focus({ preventScroll: true }); }, 30);
  }

  Object.assign(App.actions, { gameHelp() { gameHelp(true); } });
  window.Intro = { world, game, gameHelp };
})();
