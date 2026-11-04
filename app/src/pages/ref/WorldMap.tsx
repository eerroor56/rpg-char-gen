import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cap } from '../../lib/legacy';
import type { Any } from '../create/kit';

/*
 * Карта мира во вкладке «Мир»: картинка (tools/build_map.py → window.WORLD_MAP) + подписи и области для клика.
 * Клик по земле, морю или месту — карточка с описанием из листа «миростроение» (строки — WorldMap.landRow и т. д. из js/map.js).
 * Масштаб: кнопки, двойной клик, щипок, колёсико с Ctrl (или просто колёсико во весь экран); сдвиг — перетаскиванием.
 * Состояние (масштаб, сдвиг, выбор, места, во весь экран) — App.ui.wmap, как у прежнего сайта (Esc закрывает полный экран там же).
 */
type Sel = { kind: 'land' | 'sea' | 'place'; v: string } | null;

export function WorldMap() {
  const WM = window.WorldMap, m: Any = window.WORLD_MAP;
  const s = WM.state();
  const [, tick] = useState(0);
  const re = () => tick(t => t + 1);
  const view = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ apply: () => void; zoom: (f: number) => void; dragged: boolean }>({ apply: () => {}, zoom: () => {}, dragged: false });
  // Esc и «во весь экран» прежнего кода просят перерисовать «Мир»
  useEffect(() => { window.addEventListener('mh-ref', re); return () => window.removeEventListener('mh-ref', re); }, []);

  // масштаб и сдвиг: трансформация без перерисовки React
  useLayoutEffect(() => {
    const v = view.current, inn = inner.current;
    if (!v || !inn) return;
    const img = inn.querySelector('img')!;
    let hi = false;
    const fitOf = (w: number, h: number) => Math.min(w / m.w, h / m.h);
    const apply = () => {
      const w = v.clientWidth, h = v.clientHeight;
      if (!w) return;
      const sc = fitOf(w, h) * s.k;
      const cw = m.w * sc, ch = m.h * sc;
      s.x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, s.x));     // меньше окна — по центру
      s.y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, s.y));
      inn.style.transform = `translate(${s.x}px, ${s.y}px) scale(${sc})`;
      v.style.setProperty('--s', String(sc));
      v.classList.toggle('is-zoomed', s.k > 1.01);
      v.classList.toggle('is-tiny', sc < 0.3);
      if (sc > 0.6 && !hi) { hi = true; img.src = m.img; img.removeAttribute('srcset'); }
    };
    const zoomAt = (cx: number, cy: number, f: number) => {
      const k2 = Math.min(WM.MAX_K, Math.max(1, s.k * f)), r = k2 / s.k;
      s.x = cx - (cx - s.x) * r; s.y = cy - (cy - s.y) * r; s.k = k2;
      apply();
    };
    ctl.current.apply = apply;
    ctl.current.zoom = f => zoomAt(v.clientWidth / 2, v.clientHeight / 2, f);
    const pts = new Map<number, [number, number]>();
    let last: [number, number] | null = null, pinch: { d: number; k: number } | null = null, moved = 0;
    const local = (e: PointerEvent | MouseEvent): [number, number] => { const b = v.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, local(e));
      moved = 0; ctl.current.dragged = false;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: s.k }; }
      last = local(e);
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d) / s.k);
        ctl.current.dragged = true; e.preventDefault();
        return;
      }
      if (!last) return;
      const dx = p[0] - last[0], dy = p[1] - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      const sc = fitOf(v.clientWidth, v.clientHeight) * s.k;
      const big = m.w * sc > v.clientWidth + 1 || m.h * sc > v.clientHeight + 1;
      if (big && moved > 4) { s.x += dx; s.y += dy; apply(); ctl.current.dragged = true; e.preventDefault(); }
      last = p;
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) last = null; };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || s.full)) return;
      e.preventDefault();
      const [cx, cy] = local(e);
      zoomAt(cx, cy, Math.exp(-e.deltaY * 0.0022));
    };
    const dbl = (e: MouseEvent) => { const [cx, cy] = local(e); zoomAt(cx, cy, 2); };
    v.addEventListener('pointerdown', down);
    v.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    v.addEventListener('wheel', wheel, { passive: false });
    v.addEventListener('dblclick', dbl);
    const ro = window.ResizeObserver ? new ResizeObserver(apply) : null;
    if (ro) ro.observe(v);
    img.addEventListener('load', apply);
    apply();
    return () => {
      v.removeEventListener('pointerdown', down); v.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      v.removeEventListener('wheel', wheel); v.removeEventListener('dblclick', dbl);
      if (ro) ro.disconnect();
      img.removeEventListener('load', apply);
    };
  }, [s.full]);   // во весь экран — другой размер окна: подписки те же, но размер пересчитать
  useLayoutEffect(() => { ctl.current.apply(); });

  if (!m) return null;
  const sel: Sel = s.sel || null;
  // нажатие после перетаскивания — не выбор
  const pick = (kind: 'land' | 'sea' | 'place', v: string) => {
    if (ctl.current.dragged) { ctl.current.dragged = false; return; }
    s.sel = sel && sel.kind === kind && sel.v === v ? null : { kind, v };
    re();
  };
  const choose = (kind: 'land' | 'sea' | 'place', v: string) => { s.sel = { kind, v }; re(); };
  const on = (kind: string, v: string) => (sel && sel.kind === kind && sel.v === v ? ' is-sel' : '');
  const at = (x: number, y: number) => ({ '--x': x, '--y': y } as CSSProperties);
  const zoom = (how: 'in' | 'out' | 'reset') => {
    if (how === 'reset') { s.k = 1; s.x = 0; s.y = 0; ctl.current.apply(); return; }
    ctl.current.zoom(how === 'in' ? 1.6 : 1 / 1.6);
  };
  const toggleFull = () => {
    s.full = !s.full; s.k = 1; s.x = 0; s.y = 0;
    document.body.classList.toggle('wmap-open', s.full);
    re();
  };

  return (
    <section className="rf-block wm-block">
      <div className="rf-bhead"><h2>Карта мира</h2></div>
      <p className="muted small">Нажмите на землю, море или место — появится описание из листа «миростроение». Масштаб — кнопки, двойной клик, щипок или колёсико с Ctrl; сдвиг — перетаскиванием.</p>
      <div className={'wmap' + (s.full ? ' is-full' : '')}>
        <div className="wmap-view" ref={view}>
          <div className="wmap-inner" ref={inner}>
            <img src={m.img1200} srcSet={`${m.img1200} 1200w, ${m.img} 2400w`} sizes="(max-width: 1300px) 100vw, 1100px" width={m.w} height={m.h} alt="Карта мира: материки, острова и моря" draggable={false} />
            <svg className="wm-svg" viewBox={`0 0 ${m.w} ${m.h}`} aria-label="Карта мира">
              <g className="wm-hit">
                {m.seas.map((x: Any) => <path key={'s' + x.name} className={'wm-sea' + on('sea', x.name)} d={x.path} onClick={() => pick('sea', x.name)}><title>{x.name} — {x.sub}</title></path>)}
                {m.lands.map((x: Any) => <path key={'l' + x.name} className={'wm-land' + on('land', x.name)} d={x.path} onClick={() => pick('land', x.name)}><title>{x.name}</title></path>)}
              </g>
              <g className="wm-compass" transform="translate(150 150)"><circle r="78" /><circle r="62" className="thin" />
                <path d="M0-92 13-13 0 0-13-13Z" className="n" /><path d="M0 92 13 13 0 0-13 13Z" /><path d="M-92 0-13-13 0 0-13 13Z" /><path d="M92 0 13-13 0 0 13 13Z" />
                <text y="-100" textAnchor="middle">С</text></g>
              <g className="wm-labels">
                {m.seas.map((x: Any) => <g key={'ls' + x.name} className="wl wl-sea" style={at(x.label[0], x.label[1])}><text>{x.name}</text><text className="sub" y="1.25em">{x.sub}</text></g>)}
                {m.lands.map((x: Any) => <g key={'ll' + x.name} className={'wl wl-land' + (x.kind === 'материк' ? '' : ' small')} style={at(x.label[0], x.label[1])}><text>{x.name.toUpperCase()}</text></g>)}
              </g>
              <g className={'wm-places' + (s.places ? '' : ' is-off')}>
                {m.places.map((p: Any) => (
                  <g key={p.name} className={'wl wl-place' + on('place', p.name)} style={at(p.at[0], p.at[1])} role="button" tabIndex={0} aria-label={p.name}
                    onClick={() => pick('place', p.name)} onKeyDown={e => { if (e.key === 'Enter') pick('place', p.name); }}>
                    <g className={'ic ic-' + p.icon} dangerouslySetInnerHTML={{ __html: WM.ICONS[p.icon] || WM.ICONS._ }} />
                    {p.side === 'left' ? <text x="-9" y="4" textAnchor="end">{p.name}</text> : <text x="9" y="4">{p.name}</text>}
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </div>
        <div className="wmap-ctl" role="toolbar" aria-label="Карта">
          <button type="button" className="btn small wm-ic" onClick={() => zoom('in')} aria-label="Приблизить">+</button>
          <button type="button" className="btn small wm-ic" onClick={() => zoom('out')} aria-label="Отдалить">−</button>
          <button type="button" className="btn small wm-ic" onClick={() => zoom('reset')} aria-label="Показать всю карту">⤢</button>
          <button type="button" className="btn small" aria-pressed={!!s.places} onClick={() => { s.places = !s.places; re(); }}>{s.places ? 'Места: вкл' : 'Места: выкл'}</button>
          <button type="button" className="btn small" onClick={toggleFull}>{s.full ? 'Свернуть' : 'Во весь экран'}</button>
        </div>
        <div className="wmap-info"><Info sel={sel} choose={choose} close={() => { s.sel = null; re(); }} /></div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ карточка: земля, море или место
function Info({ sel, choose, close }: { sel: Sel; choose: (k: 'land' | 'sea' | 'place', v: string) => void; close: () => void }) {
  const WM = window.WorldMap, m: Any = window.WORLD_MAP;
  if (!sel) return <p className="muted small">Земли: {m.lands.length} · моря: {m.seas.length} · отмечено мест: {m.places.length}. Выберите что-нибудь на карте.</p>;
  const chip = (kind: 'land' | 'sea' | 'place', v: string) => <button key={kind + v} type="button" className="wm-chip" onClick={() => choose(kind, v)}>{v}</button>;
  const rows: [string, ReactNode][] = [];
  const kv = (t: string, v: ReactNode) => { if (v && !(Array.isArray(v) && !v.length)) rows.push([t, v]); };
  const text = (x: unknown) => cap(String(x || ''));
  const effects = (mon: unknown, pl: unknown) => { kv('Существам', text(mon)); kv('Игрокам', text(pl)); };
  let title: ReactNode = null;
  if (sel.kind === 'land') {
    const L = m.lands.find((x: Any) => x.name === sel.v);
    if (!L) return null;
    const r = WM.landRow(L.name) || [];
    title = <>{L.name} <span className="chip">{L.kind}</span></>;
    kv('География', text(r[1])); kv('Владения', text(r[2]));
    kv('Омывают', m.seas.filter((x: Any) => x.borders.includes(L.name)).map((x: Any) => chip('sea', x.name)));
    kv('Места', m.places.filter((p: Any) => p.region === L.name).map((p: Any) => chip('place', p.name)));
  } else if (sel.kind === 'sea') {
    const x = m.seas.find((q: Any) => q.name === sel.v);
    if (!x) return null;
    const r = WM.seaRow(x.name) || [];
    title = <>{x.name} <span className="chip">{x.sub}</span></>;
    kv('Особенность', text(r[2]));
    kv('Омывает', x.borders.map((b: string) => chip('land', b)));
  } else {
    const p = m.places.find((q: Any) => q.name === sel.v);
    if (!p) return null;
    title = p.name;
    kv('Где', chip('land', p.region));
    const pr = WM.placeRow(p.name), sr = WM.sightRow(p.name);
    if (pr) effects(pr.monsters, pr.players);
    else if (sr) { effects(sr[1], sr[2]); kv('Описание', text(sr[4])); }
    else if (/золот/i.test(p.name)) {
      const g = WM.sightRow('Золотые врата') || [];
      kv('Саанктария', text((WM.landRow('Саанктария') || [])[2])); kv('Золотые врата', text(g[4])); effects(g[1], g[2]);
    }
  }
  return <>
    <button type="button" className="wmap-x" onClick={close} aria-label="Закрыть описание">×</button>
    <h3>{title}</h3>
    <dl className="kvs">{rows.map(([t, v]) => <div key={t} className="kv"><dt>{t}</dt><dd>{v}</dd></div>)}</dl>
  </>;
}
