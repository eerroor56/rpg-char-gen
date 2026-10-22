/*
 * Подсказки в полях ввода в стиле сайта вместо системного списка <datalist>
 * (у браузеров он белый, с иконками и выбивается из оформления).
 * Любое поле с list="…" само становится полем с подсказками: варианты берутся из того же <datalist>,
 * фильтруются по набранному тексту, выбираются мышью, пальцем или клавишами (↑ ↓ Enter, Esc — закрыть).
 * После выбора полю отправляются события input и change — как при обычном вводе, поэтому код,
 * который слушает поле, ничего не замечает.
 */
(function () {
  'use strict';
  const MAX = 80;   // сколько вариантов показывать за раз (в бестиарии их больше тысячи)
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let pop = null, input = null, items = [], active = -1, uid = 0;

  // системная подсказка не нужна: list → data-list. Разметка перерисовывается постоянно, поэтому — через наблюдатель
  function adopt(el) {
    el.dataset.list = el.getAttribute('list');
    el.removeAttribute('list');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', 'false');
    el.classList.add('combo-input');
  }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('input[list]')) adopt(root);
    root.querySelectorAll('input[list]').forEach(adopt);
  }
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) scan(document.body);

  // варианты: значение и пояснение из <option value="…">пояснение</option>
  function options(el) {
    const dl = document.getElementById(el.dataset.list);
    if (!dl) return [];
    return [...dl.querySelectorAll('option')].map(o => {
      const v = o.value || o.textContent.trim();
      const hint = o.textContent.trim();
      return { v, hint: hint && hint !== v ? hint : '' };
    }).filter(o => o.v);
  }
  function mark(text, q) {
    if (!q) return esc(text);
    const i = norm(text).indexOf(q);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'combo-pop';
    pop.id = 'combo-pop';
    pop.setAttribute('role', 'listbox');
    pop.hidden = true;
    // нажатие в списке не должно уводить фокус из поля
    pop.addEventListener('pointerdown', e => { e.preventDefault(); const li = e.target.closest('[data-i]'); if (li) choose(+li.dataset.i); });
    document.body.appendChild(pop);
    return pop;
  }

  function render() {
    if (!input || !input.isConnected) { close(); return; }
    const q = norm(input.value);
    const all = options(input);
    let list = q ? all.filter(o => norm(o.v).includes(q) || norm(o.hint).includes(q)) : all;
    if (q) list.sort((a, b) => (norm(a.v).startsWith(q) ? 0 : 1) - (norm(b.v).startsWith(q) ? 0 : 1));
    // точное совпадение с набранным — подсказывать нечего
    if (list.length === 1 && norm(list[0].v) === q) list = [];
    const more = list.length - MAX;
    items = list.slice(0, MAX);
    if (!items.length) { hide(); return; }
    if (active >= items.length) active = items.length - 1;
    const p = ensurePop();
    p.innerHTML = items.map((o, i) => `<div class="combo-opt${i === active ? ' is-active' : ''}" role="option" id="combo-o${i}" data-i="${i}" aria-selected="${i === active}">
        <span class="combo-v">${mark(o.v, q)}</span>${o.hint ? `<span class="combo-h">${mark(o.hint, q)}</span>` : ''}</div>`).join('')
      + (more > 0 ? `<div class="combo-more">ещё ${more} — уточните поиск</div>` : '');
    if (p.hidden) { p.hidden = false; p.classList.remove('is-open'); void p.offsetWidth; p.classList.add('is-open'); }
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'combo-pop');
    place();
  }
  // под полем, а если внизу тесно — над ним
  function place() {
    if (!pop || pop.hidden || !input) return;
    if (!input.isConnected) { close(); return; }
    const r = input.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { hide(); return; }
    const w = Math.max(r.width, 240);
    pop.style.width = Math.min(w, window.innerWidth - 16) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 200 && above > below;
    pop.style.maxHeight = Math.max(140, Math.min(320, up ? above : below)) + 'px';
    pop.classList.toggle('up', up);
    if (up) { pop.style.top = ''; pop.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { pop.style.bottom = ''; pop.style.top = (r.bottom + 4) + 'px'; }
  }
  function hide() {
    if (pop) pop.hidden = true;
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  }
  function close() { hide(); input = null; items = []; active = -1; }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    pop.querySelectorAll('.combo-opt').forEach((el, i) => { el.classList.toggle('is-active', i === active); el.setAttribute('aria-selected', i === active); });
    const el = pop.querySelector('#combo-o' + active);
    if (el) { el.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', el.id); }
  }
  function choose(i) {
    const o = items[i], el = input;
    if (!o || !el) return;
    el.value = o.v;
    close();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function open(el) {
    if (input !== el) { input = el; active = -1; if (!el.id) el.id = 'combo-in' + (++uid); }
    render();
  }

  document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('combo-input')) open(e.target); });
  document.addEventListener('focusout', e => { if (e.target === input) setTimeout(() => { if (document.activeElement !== input) close(); }, 0); });
  // поле могли перерисовать во время ввода (фокус уже в новом) — старое не трогаем
  document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('combo-input') && e.target.isConnected) { active = -1; open(e.target); } });
  // нажатие по уже открытому полю — список снова виден
  document.addEventListener('pointerdown', e => { if (e.target.classList && e.target.classList.contains('combo-input') && e.target === document.activeElement) open(e.target); });
  document.addEventListener('keydown', e => {
    if (!e.target.classList || !e.target.classList.contains('combo-input')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!pop || pop.hidden) { open(e.target); if (e.key === 'ArrowUp') move(-1); else move(1); return; }
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && pop && !pop.hidden && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' && pop && !pop.hidden) {
      e.preventDefault();
      e.stopPropagation();
      hide();
    } else if (e.key === 'Tab') hide();
  }, true);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  window.Combo = { scan, close };
})();
