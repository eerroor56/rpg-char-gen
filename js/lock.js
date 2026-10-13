/*
 * Закрытые разделы справочника (бестиарий, навыки, социум, алхимия, артефакты, механики).
 * Данные лежат в data/locked.js в зашифрованном виде (AES-256-GCM, ключ из пароля ГМ
 * через PBKDF2-SHA256). Без пароля их нельзя прочитать даже из исходного кода сайта.
 */
(function () {
  'use strict';
  const KEY = 'hero-workshop:gm';
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function loadScript() {
    if (window.GAME_LOCKED) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'data/locked.js?v=' + encodeURIComponent((window.GAME_DATA.meta || {}).built || '1');
      s.onload = () => ok();
      s.onerror = () => fail(new Error('нет файла data/locked.js'));
      document.head.appendChild(s);
    });
  }

  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function decrypt(password) {
    const L = window.GAME_LOCKED;
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(L.salt), iterations: L.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(L.iv) }, key, b64(L.ct));
    const text = L.gz ? await gunzip(new Uint8Array(plain)) : new TextDecoder().decode(plain);
    return JSON.parse(text);
  }

  function merge(x) {
    const D = window.GAME_DATA;
    D.creatures = x.creatures;
    D.creatureUpgrades = x.creatureUpgrades;
    D.creatureLegend = x.creatureLegend;
    D.society = x.society;
    Object.assign(D.skills, x.skills);
    Object.assign(D.alchemy, x.alchemy);
    D.artifacts = x.artifacts;
    D.mechanics = x.mechanics;
    window.Rules.init(D);
  }

  const GMLock = {
    unlocked: !(window.GAME_DATA.meta || {}).locked,   // при сборке с --no-lock всё открыто
    busy: false,

    available() { return !!(window.crypto && crypto.subtle && window.DecompressionStream); },

    async unlock(password, remember) {
      if (this.unlocked) return true;
      if (!this.available()) throw new Error('Браузер не поддерживает расшифровку (нужен современный браузер и сайт по https).');
      this.busy = true;
      try {
        await loadScript();
        let data;
        try { data = await decrypt(password); } catch (e) { throw new Error('Неверный пароль.'); }
        merge(data);
        this.unlocked = true;
        try {
          sessionStorage.setItem(KEY, password);
          if (remember) localStorage.setItem(KEY, password); else localStorage.removeItem(KEY);
        } catch (e) { /* хранилище недоступно — просто не запоминаем */ }
        return true;
      } finally { this.busy = false; }
    },

    async auto() {
      if (this.unlocked) return false;
      let pw = null;
      try { pw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { pw = null; }
      if (!pw) return false;
      try { await this.unlock(pw, !!localStorage.getItem(KEY)); return true; } catch (e) {
        try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (er) { /* noop */ }
        return false;
      }
    },

    lock() {
      try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* noop */ }
      location.reload();
    },

    // форма ввода пароля (вставляется в любой контейнер)
    form(title, note) {
      const esc = window.App.esc;
      return `<form class="lock-form card" data-lock-form>
        <h2>${esc(title || 'Раздел для ГМ')}</h2>
        <p class="muted">${esc(note || 'Этот раздел закрыт паролем ГМ. Данные зашифрованы и без пароля не читаются.')}</p>
        <div class="lock-row">
          <input type="password" name="pw" autocomplete="current-password" placeholder="Пароль ГМ" aria-label="Пароль ГМ" required>
          <button type="submit" class="btn primary">Открыть</button>
        </div>
        <label class="check"><input type="checkbox" name="remember"> Запомнить на этом устройстве</label>
        <p class="lock-msg" role="alert"></p>
      </form>`;
    }
  };

  // отправка формы пароля в любом месте сайта
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-lock-form]');
    if (!f) return;
    e.preventDefault();
    const msg = f.querySelector('.lock-msg');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; msg.classList.add('wait'); msg.textContent = 'Проверяю…';
    try {
      await GMLock.unlock(f.pw.value, f.remember.checked);
      window.App.toast('Разделы ГМ открыты');
      window.App.render();
    } catch (err) {
      msg.classList.remove('wait'); msg.textContent = err.message;
      btn.disabled = false;
      f.pw.select();
    }
  });

  window.GMLock = GMLock;
})();
