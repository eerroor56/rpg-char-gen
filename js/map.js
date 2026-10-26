/*
 * Карта мира во вкладке «Мир»: картинка из tools/build_map.py + подписи и области для клика.
 * Клик по земле, морю или месту — карточка с описанием из листа «миростроение».
 * Масштаб: кнопки, двойной клик, щипок, колёсико с Ctrl (или просто колёсико во весь экран); сдвиг — перетаскиванием.
 */
(function () {
  'use strict';
  const App = window.App;
  const esc = App.esc, cap = App.cap;
  const MAP = () => window.WORLD_MAP;
  const W = () => (window.GAME_DATA || {}).world || { sections: [], places: [] };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const S = () => (App.ui.wmap = App.ui.wmap || { k: 1, x: 0, y: 0, sel: null, places: true, full: false });
  const MAX_K = 6;
  let dragged = false;     // последнее нажатие было перетаскиванием — клик не считать выбором

  // ------------------------------------------------------------ данные из таблиц
  const section = title => (W().sections || []).find(s => norm(s.title) === norm(title)) || { rows: [], head: [] };
  const first = r => String(r[0] || '').split('/')[0].trim();
  const landRow = name => section('земли').rows.find(r => norm(first(r)) === norm(name));
  const seaRow = name => section('Океания').rows.find(r => norm(first(r)) === norm(name));
  const placeRow = name => (W().places || []).find(p => norm(p.name) === norm(name));
  const sightRow = name => section('интересные места').rows.find(r => norm(r[0]).replace(/"/g, '') === norm(name));

  // ------------------------------------------------------------ разметка
  const ICONS = {
    city: '<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5"/>',
    temple: '<path d="M0-6 6 0 0 6-6 0Z"/>',
    peak: '<path d="M0-6 6 5H-6Z"/>',
    crater: '<circle r="5" class="hollow"/>',
    gate: '<path d="M-5 5V-1a5 5 0 0 1 10 0v6"/>',
    sun: '<circle r="3.5"/><path d="M0-7v2.5M0 7V4.5M-7 0h2.5M7 0H4.5" class="ray"/>',
    gorge: '<path d="M-5-5 0 5 5-5" class="hollow"/>',
    tower: '<path d="M-3.5 6V-3l3.5-4 3.5 4v9Z"/>',
    _: '<circle r="4.5"/>'
  };
  const at = (x, y, cls, inner, attrs = '') => `<g class="${cls}" style="--x:${x};--y:${y}" ${attrs}>${inner}</g>`;

  function svg() {
    const m = MAP(), s = S();
    const sel = s.sel || {};
    const on = (kind, v) => (sel.kind === kind && sel.v === v ? ' is-sel' : '');
    const seas = m.seas.map(x => `<path class="wm-sea${on('sea', x.name)}" d="${x.path}" data-act="mapPick" data-kind="sea" data-v="${esc(x.name)}"><title>${esc(x.name)} — ${esc(x.sub)}</title></path>`).join('');
    const lands = m.lands.map(x => `<path class="wm-land${on('land', x.name)}" d="${x.path}" data-act="mapPick" data-kind="land" data-v="${esc(x.name)}"><title>${esc(x.name)}</title></path>`).join('');
    const seaLabels = m.seas.map(x => at(x.label[0], x.label[1], 'wl wl-sea', `<text>${esc(x.name)}</text><text class="sub" y="1.25em">${esc(x.sub)}</text>`)).join('');
    const landLabels = m.lands.map(x => at(x.label[0], x.label[1], `wl wl-land${x.kind === 'материк' ? '' : ' small'}`, `<text>${esc(x.name.toUpperCase())}</text>`)).join('');
    const places = m.places.map(p => at(p.at[0], p.at[1], `wl wl-place${on('place', p.name)}`,
      `<g class="ic ic-${esc(p.icon)}">${ICONS[p.icon] || ICONS._}</g>${p.side === 'left' ? `<text x="-9" y="4" text-anchor="end">` : '<text x="9" y="4">'}${esc(p.name)}</text>`,
      `data-act="mapPick" data-kind="place" data-v="${esc(p.name)}" role="button" tabindex="0" aria-label="${esc(p.name)}"`)).join('');
    const compass = `<g class="wm-compass" transform="translate(150 150)"><circle r="78"/><circle r="62" class="thin"/>
      <path d="M0-92 13-13 0 0-13-13Z" class="n"/><path d="M0 92 13 13 0 0-13 13Z"/><path d="M-92 0-13-13 0 0-13 13Z"/><path d="M92 0 13-13 0 0 13 13Z"/>
      <text y="-100" text-anchor="middle">С</text></g>`;
    return `<svg class="wm-svg" viewBox="0 0 ${m.w} ${m.h}" aria-label="Карта мира">
      <g class="wm-hit">${seas}${lands}</g>${compass}<g class="wm-labels">${seaLabels}${landLabels}</g><g class="wm-places${s.places ? '' : ' is-off'}">${places}</g></svg>`;
  }

  function html() {
    const m = MAP();
    if (!m) return '';
    const s = S();
    return `<section class="ref-block wmap-block">
      <div class="rb-head"><h2>Карта мира</h2></div>
      <p class="muted small">Нажмите на землю, море или место — появится описание из листа «миростроение». Масштаб — кнопки, двойной клик, щипок или колёсико с Ctrl; сдвиг — перетаскиванием.</p>
      <div class="wmap${s.full ? ' is-full' : ''}" data-wmap>
        <div class="wmap-view" data-wmap-view>
          <div class="wmap-inner" data-wmap-inner>
            <img src="${esc(m.img1200)}" srcset="${esc(m.img1200)} 1200w, ${esc(m.img)} 2400w" sizes="(max-width: 1300px) 100vw, 1100px" width="${m.w}" height="${m.h}" alt="Карта мира: материки, острова и моря" draggable="false">
            ${svg()}
          </div>
        </div>
        <div class="wmap-ctl" role="toolbar" aria-label="Карта">
          <button type="button" class="btn small" data-act="mapZoom" data-v="in" aria-label="Приблизить">+</button>
          <button type="button" class="btn small" data-act="mapZoom" data-v="out" aria-label="Отдалить">−</button>
          <button type="button" class="btn small" data-act="mapZoom" data-v="reset" aria-label="Показать всю карту">⤢</button>
          <button type="button" class="btn small" data-act="mapPlaces" aria-pressed="${s.places}">${s.places ? 'Места: вкл' : 'Места: выкл'}</button>
          <button type="button" class="btn small" data-act="mapFull">${s.full ? 'Свернуть' : 'Во весь экран'}</button>
        </div>
        <div class="wmap-info" data-wmap-info>${info()}</div>
      </div>
    </section>`;
  }

  // ------------------------------------------------------------ карточка
  const chip = (kind, v) => `<button type="button" class="chip" data-act="mapPick" data-kind="${kind}" data-v="${esc(v)}">${esc(v)}</button>`;
  const kv = (t, v) => (v ? `<div><dt>${t}</dt><dd>${v}</dd></div>` : '');
  const effects = (mon, pl) => kv('Существам', esc(cap(mon || ''))) + kv('Игрокам', esc(cap(pl || '')));

  function info() {
    const m = MAP(), sel = S().sel;
    const close = '<button type="button" class="wmap-x" data-act="mapClose" aria-label="Закрыть описание">×</button>';
    if (!sel) return `<p class="muted small">Земли: ${m.lands.length} · моря: ${m.seas.length} · отмечено мест: ${m.places.length}. Выберите что-нибудь на карте.</p>`;
    if (sel.kind === 'land') {
      const L = m.lands.find(x => x.name === sel.v);
      if (!L) return '';
      const r = landRow(L.name) || [];
      const seas = m.seas.filter(x => x.borders.includes(L.name)).map(x => chip('sea', x.name)).join(' ');
      const pl = m.places.filter(p => p.region === L.name).map(p => chip('place', p.name)).join(' ');
      return `${close}<h3>${esc(L.name)} <span class="tag">${esc(L.kind)}</span></h3><dl class="kv-list compact">
        ${kv('География', esc(cap(r[1] || '')))}${kv('Владения', esc(cap(r[2] || '')))}${kv('Омывают', seas)}${kv('Места', pl)}</dl>`;
    }
    if (sel.kind === 'sea') {
      const x = m.seas.find(q => q.name === sel.v);
      if (!x) return '';
      const r = seaRow(x.name) || [];
      return `${close}<h3>${esc(x.name)} <span class="tag">${esc(x.sub)}</span></h3><dl class="kv-list compact">
        ${kv('Особенность', esc(cap(r[2] || '')))}${kv('Омывает', x.borders.map(b => chip('land', b)).join(' '))}</dl>`;
    }
    const p = m.places.find(q => q.name === sel.v);
    if (!p) return '';
    let body = '';
    const pr = placeRow(p.name);
    const sr = sightRow(p.name);
    if (pr) body = effects(pr.monsters, pr.players);
    else if (sr) body = effects(sr[1], sr[2]) + kv('Описание', esc(cap(sr[4] || '')));
    else if (/золот/i.test(p.name)) {
      const g = sightRow('Золотые врата') || [];
      body = kv('Саанктария', esc(cap((landRow('Саанктария') || [])[2] || ''))) + kv('Золотые врата', esc(cap(g[4] || ''))) + effects(g[1], g[2]);
    }
    return `${close}<h3>${esc(p.name)}</h3><dl class="kv-list compact">${kv('Где', chip('land', p.region))}${body}</dl>`;
  }

  // ------------------------------------------------------------ масштаб и сдвиг
  function mount(root) {
    const view = root && root.querySelector('[data-wmap-view]');
    if (!view || view.dataset.ready) return;
    view.dataset.ready = '1';
    const inner = view.querySelector('[data-wmap-inner]');
    const img = inner.querySelector('img');
    const s = S();
    let hi = false;
    // во весь экран карта вписывается целиком, в справочнике окно того же формата, что и карта
    const fitOf = (w, h) => Math.min(w / MAP().w, h / MAP().h);
    const apply = () => {
      const w = view.clientWidth, h = view.clientHeight;
      if (!w) return;
      const sc = fitOf(w, h) * s.k;
      const cw = MAP().w * sc, ch = MAP().h * sc;
      s.x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, s.x));     // меньше окна — по центру
      s.y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, s.y));
      inner.style.transform = `translate(${s.x}px, ${s.y}px) scale(${sc})`;
      view.style.setProperty('--s', sc);
      view.classList.toggle('is-zoomed', s.k > 1.01);
      view.classList.toggle('is-tiny', sc < 0.3);
      if (sc > 0.6 && !hi) { hi = true; img.src = MAP().img; img.removeAttribute('srcset'); }
    };
    const zoomAt = (cx, cy, f) => {
      const k2 = Math.min(MAX_K, Math.max(1, s.k * f));
      const r = k2 / s.k;
      s.x = cx - (cx - s.x) * r; s.y = cy - (cy - s.y) * r; s.k = k2;
      apply();
    };
    view._zoom = (f) => zoomAt(view.clientWidth / 2, view.clientHeight / 2, f);
    view._apply = apply;
    const pts = new Map();
    let last = null, pinch = null, moved = 0;
    const local = e => { const b = view.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    view.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, local(e));
      moved = 0; dragged = false;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: s.k }; }
      last = local(e);
    });
    const move = e => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.k * d / pinch.d) / s.k);
        dragged = true;
        e.preventDefault();
        return;
      }
      if (!last) return;
      const dx = p[0] - last[0], dy = p[1] - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      const sc = fitOf(view.clientWidth, view.clientHeight) * s.k;
      const big = MAP().w * sc > view.clientWidth + 1 || MAP().h * sc > view.clientHeight + 1;
      if (big && moved > 4) { s.x += dx; s.y += dy; apply(); dragged = true; e.preventDefault(); }
      last = p;
    };
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) last = null; };
    view.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    view.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey || s.full)) return;
      e.preventDefault();
      const [cx, cy] = local(e);
      zoomAt(cx, cy, Math.exp(-e.deltaY * 0.0022));
    }, { passive: false });
    view.addEventListener('dblclick', e => { const [cx, cy] = local(e); zoomAt(cx, cy, 2); });
    view.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-act=mapPick]')) e.target.closest('[data-act=mapPick]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    if (window.ResizeObserver) new ResizeObserver(apply).observe(view);
    img.addEventListener('load', apply);
    apply();
  }

  function redraw() {
    const box = document.querySelector('.wmap-block');
    if (!box) return;
    const inner = box.querySelector('[data-wmap-inner]');
    const old = inner.querySelector('svg');
    const tmp = document.createElement('div');
    tmp.innerHTML = svg();
    old.replaceWith(tmp.firstElementChild);
    box.querySelector('[data-wmap-info]').innerHTML = info();
  }

  Object.assign(App.actions, {
    mapPick(b) {
      if (dragged) { dragged = false; return; }
      const s = S();
      s.sel = s.sel && s.sel.kind === b.dataset.kind && s.sel.v === b.dataset.v ? null : { kind: b.dataset.kind, v: b.dataset.v };
      redraw();
    },
    mapClose() { S().sel = null; redraw(); },
    mapZoom(b) {
      const view = document.querySelector('[data-wmap-view]');
      if (!view) return;
      const s = S();
      if (b.dataset.v === 'reset') { s.k = 1; s.x = 0; s.y = 0; view._apply(); return; }
      view._zoom(b.dataset.v === 'in' ? 1.6 : 1 / 1.6);
    },
    mapPlaces() { const s = S(); s.places = !s.places; window.Reference.refreshWorld(); },
    mapFull() {
      const s = S();
      s.full = !s.full;
      s.k = 1; s.x = 0; s.y = 0;
      document.body.classList.toggle('wmap-open', s.full);
      window.Reference.refreshWorld();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && App.ui.wmap && App.ui.wmap.full) App.actions.mapFull();
  });

  window.WorldMap = { html, mount };
})();
