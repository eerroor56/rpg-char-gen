import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import { BrewForm } from '../brew/BrewForm';
import { WorldMap } from './WorldMap';

/*
 * Справочник (#ref/<раздел>) и Мир (#world): таблицы листов игры с поиском, сортировкой по колонке и группами.
 * Данные разделов — js/reference.js (Reference.SECTIONS, Reference.WORLD: build() → блоки { title, note, cols, rows, order,
 * grid, custom }); здесь только показ. Калькулятор зелий — ../brew/BrewForm.tsx, карта мира — ./WorldMap.tsx.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Row = { cells: string[]; g?: string; text: string };
type Block = { title?: string; note?: string; cols?: string[] | null; rows: Row[]; order?: string[]; grid?: string[][]; custom?: () => string; brew?: boolean };
const PAGE = 150;

/** разделы ГМ открылись или закрылись (пароль) — перерисовать */
function useGmTick() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(t => t + 1); window.addEventListener('mh-gm', f); return () => window.removeEventListener('mh-gm', f); }, []);
  return !!(window.GMLock && window.GMLock.unlocked);
}

export function Reference({ section }: { section: string }) {
  const Ref = window.Reference;
  const gm = useGmTick();
  const list: Any[] = Ref.SECTIONS;
  const cur = list.find(s => s.id === section) || list[0];
  const closed = cur.locked && !gm;
  const hasLocked = !!(window.GAME_DATA.meta && window.GAME_DATA.meta.locked);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { navRef.current?.querySelector('.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [cur.id]);
  return (
    <div className="page rf-page">
      <div className="rf">
        <nav className="rf-nav" aria-label="Разделы справочника" ref={navRef}>
          {list.map(s => (
            <a key={s.id} href={'#ref/' + s.id} className={s.id === cur.id ? 'is-on' : ''} aria-current={s.id === cur.id ? 'page' : undefined}>
              <span>{s.title}</span>{s.locked && !gm && <Icon name="lock" />}
            </a>
          ))}
          {hasLocked && gm && <p className="rf-gm">Режим ГМ включён <button type="button" className="link" onClick={() => window.GMLock.lock()}>выйти</button></p>}
        </nav>
        <div className="rf-body">
          {closed ? <><h1>{cur.title}</h1><GmForm title={`${cur.title}: раздел для ГМ`} /></>
            : <Tables key={cur.id + (gm ? ':gm' : '')} sec={cur} title={cur.title} placeholder="Поиск в разделе" />}
        </div>
      </div>
    </div>
  );
}

export function World() {
  const gm = useGmTick();
  useEffect(() => () => {   // большая карта во весь экран — закрыть, уходя из «Мира»
    const ui = window.App.ui;
    if (ui.wmap && ui.wmap.full) { ui.wmap.full = false; document.body.classList.remove('wmap-open'); }
  }, []);
  return <div className="page rf-page"><Tables key={gm ? 'gm' : ''} sec={window.Reference.WORLD} title="Мир" placeholder="Поиск по миру" world /></div>;
}

// ------------------------------------------------------------ таблицы раздела
function Tables({ sec, title, placeholder, world }: { sec: Any; title: string; placeholder: string; world?: boolean }) {
  const [q, setQ] = useState('');
  const blocks: Block[] = useMemo(() => sec.build(), [sec]);
  const nq = window.Rules.norm(q);
  const shown = blocks.map((b, i) => ({ b, i, rows: nq && !b.custom && !b.grid ? b.rows.filter(r => r.text.includes(nq)) : b.rows }))
    .filter(x => !nq || (!x.b.custom && (x.b.grid ? false : x.rows.length)));
  return (
    <div className="wstack">
      <header className="rf-head">
        <h1>{title}</h1>
        <label className="search rf-search"><Icon name="search" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
          {q && <button type="button" className="link" onClick={() => setQ('')} aria-label="Очистить">✕</button>}
        </label>
      </header>
      {!world && blocks.length > 1 && !nq && (
        <nav className="rf-toc" aria-label="Таблицы раздела">
          {blocks.map((b, i) => b.title && <a key={i} href={'#'} onClick={e => { e.preventDefault(); document.getElementById('rfb-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{b.title}</a>)}
        </nav>
      )}
      {shown.length ? shown.map(({ b, i, rows }) => b.brew ? <section key={i} className="card wstack"><h2 className="h-sec">Калькулятор: блюдо, напиток, зелье</h2><BrewForm opts={{ host: 'ref' }} /></section>
        : b.custom ? <WorldMap key={i} />
        : b.grid ? <GridBlock key={i} b={b} />
          : <TableBlock key={i} id={'rfb-' + i} b={b} rows={rows} q={nq} />)
        : <div className="card empty"><Icon name="search" /><p>По запросу «{q}» {world ? 'ничего' : 'в разделе ничего'} нет.</p></div>}
    </div>
  );
}

const capHtml = (s: unknown) => window.App.capHtml(s === undefined || s === null ? '' : String(s));
const plain = (s: unknown) => String(s === undefined || s === null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cellNum = (t: string) => (/^[−-]?\d[\d\s]*([.,]\d+)?\s*%?$/.test(t) ? parseFloat(t.replace(/[\s%]/g, '').replace('−', '-').replace(',', '.')) : null);
const numCol = (rows: Row[], i: number) => { const xs = rows.slice(0, 40).map(r => plain(r.cells[i])).filter(t => t && t !== '—'); return xs.length > 0 && xs.filter(t => cellNum(t) !== null).length >= xs.length / 2; };
// число — только если вся ячейка число; числа выше текста и прочерков, пустые — в конце
function sortRows(rows: Row[], st: { col: number; dir: number } | null) {
  if (!st) return rows;
  const empty = (t: string) => !t || t === '—' || t === '-';
  return rows.map(r => { const t = plain(r.cells[st.col]); return [r, t, cellNum(t)] as const; }).sort((a, b) => {
    if (a[2] !== null && b[2] !== null) return (a[2] - b[2]) * st.dir;
    if (a[2] !== null) return -1;
    if (b[2] !== null) return 1;
    if (empty(a[1]) || empty(b[1])) return +empty(a[1]) - +empty(b[1]);
    return a[1].localeCompare(b[1], 'ru') * st.dir;
  }).map(x => x[0]);
}

function TableBlock({ id, b, rows, q }: { id: string; b: Block; rows: Row[]; q: string }) {
  const [sort, setSort] = useState<{ col: number; dir: number } | null>(null);
  const [group, setGroup] = useState('');
  const sorted = useMemo(() => sortRows(rows, b.cols ? sort : null), [rows, sort, b.cols]);
  const grouped = b.rows.some(r => r.g);
  const names = useMemo(() => {
    if (!grouped) return [];
    const all = [...new Set(b.rows.map(r => r.g || 'Другое'))];
    return (b.order || []).filter(n => all.includes(n)).concat(all.filter(n => !(b.order || []).includes(n)));
  }, [b, grouped]);
  const by = (n: string) => sorted.filter(r => (r.g || 'Другое') === n);
  const sel = group && names.includes(group) ? group : '';
  // в листах ГМ у шапки бывает меньше колонок, чем в строках (колонка без заголовка), а у строки — меньше ячеек, чем
  // в шапке: дополняем пустыми, иначе фон строки обрывается, а шапка короче таблицы
  const ncol = Math.max(b.cols ? b.cols.length : 0, ...b.rows.map(r => r.cells.length));
  const cols = b.cols ? b.cols.concat(Array(Math.max(0, ncol - b.cols.length)).fill('')) : null;
  const head = !cols ? null : (
    <tr>{cols.map((c, i) => {
      if (!c) return <th key={i} />;
      const on = sort && sort.col === i;
      return <th key={i}><button type="button" className={'rf-th' + (on ? ' is-on' : '')} title={`Сортировать по «${c}»`}
        onClick={() => setSort(on ? { col: i, dir: -sort!.dir } : { col: i, dir: numCol(rows, i) ? -1 : 1 })}>{c}{on && <span aria-hidden="true">{sort!.dir > 0 ? ' ▲' : ' ▼'}</span>}</button></th>;
    })}</tr>
  );
  return (
    <section className="rf-block" id={id}>
      <div className="rf-bhead">
        <h2>{b.title} <small>{rows.length}</small></h2>
        {sort && <button type="button" className="link small" onClick={() => setSort(null)}>сбросить сортировку</button>}
      </div>
      {b.note && <p className="muted small">{window.App.sentCap(b.note)}</p>}
      {grouped && names.length > 1 && (
        <div className="rf-chips" role="tablist">
          <button type="button" role="tab" aria-selected={!sel} className={!sel ? 'is-on' : ''} onClick={() => setGroup('')}>Все <small>{rows.length}</small></button>
          {names.map(n => { const c = by(n).length; return <button key={n} type="button" role="tab" aria-selected={sel === n} className={sel === n ? 'is-on' : ''} disabled={!c} onClick={() => setGroup(n)}>{n} <small>{c}</small></button>; })}
        </div>
      )}
      {grouped ? (sel ? <Table key={sel + q} b={b} rows={by(sel)} head={head} ncol={ncol} />
        : names.map(n => { const rr = by(n); return rr.length ? <div key={n}><h3 className="rf-g">{n} <small>{rr.length}</small></h3><Table key={n + q} b={b} rows={rr} head={head} ncol={ncol} /></div> : null; }))
        : <Table key={q} b={b} rows={sorted} head={head} ncol={ncol} />}
    </section>
  );
}

function Table({ b, rows, head, ncol }: { b: Block; rows: Row[]; head: ReactNode; ncol: number }) {
  const [lim, setLim] = useState(PAGE);
  return <>
    <HScroll>
      <table className="rf-tbl">
        {b.cols && <thead>{head}</thead>}
        <tbody>{rows.slice(0, lim).map((r, i) => (
          <tr key={i}>{r.cells.map((c, j) => { const len = plain(c).length; return <td key={j} className={len > 70 ? 'long' : len > 25 ? 'mid' : undefined} dangerouslySetInnerHTML={{ __html: capHtml(c) }} />; })}
            {r.cells.length < ncol && Array.from({ length: ncol - r.cells.length }, (_, j) => <td key={'e' + j} />)}</tr>
        ))}</tbody>
      </table>
    </HScroll>
    {rows.length > lim && <button type="button" className="btn ghost small rf-more" onClick={() => setLim(l => l + PAGE * 2)}>Показать ещё ({rows.length - lim})</button>}
  </>;
}

/**
 * широкая таблица: стрелки «влево / вправо» листают её, не уходя к полосе прокрутки внизу. Стрелки держатся посередине
 * экрана, пока таблица видна (липкая полоса нулевой высоты), и появляются, только если в ту сторону есть что листать.
 */
// стрелки — посередине видимой части таблицы (между шапкой сайта и нижним меню на телефоне), но не выходят за таблицу
const ARROW = 44, HEAD_ROW = 44;
function coveredEdges() {
  let top = 0, bottom = window.innerHeight;
  ['.mtop', '.rf-nav'].forEach(s => {
    const el = document.querySelector(s);
    // только полосы во всю ширину (на телефоне); колонка разделов слева на компьютере таблицу не закрывает
    if (el && getComputedStyle(el).position === 'sticky') { const b = el.getBoundingClientRect(); if (b.height && b.top < 140 && b.width > window.innerWidth * 0.6) top = Math.max(top, b.bottom); }
  });
  const bar = document.querySelector('.mbar');
  if (bar && getComputedStyle(bar).display !== 'none') bottom = Math.min(bottom, bar.getBoundingClientRect().top);
  return { top, bottom };
}

function HScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const arrows = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const any = edge.l || edge.r;
  useEffect(() => {
    if (!any) return;
    // пересчёт лёгкий (два прямоугольника) — прямо на прокрутку, без requestAnimationFrame
    const place = () => {
      const b = box.current, a = arrows.current;
      if (!b || !a) return;
      const r = b.getBoundingClientRect(), v = coveredEdges();
      const from = Math.max(r.top + HEAD_ROW, v.top + 8), to = Math.min(r.bottom - 8, v.bottom - 8);
      if (to - from < ARROW) { a.style.visibility = 'hidden'; return; }
      a.style.visibility = '';
      a.style.transform = `translateY(${Math.round((from + to) / 2 - ARROW / 2 - r.top)}px)`;
    };
    place();
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [any]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', upd); ro.disconnect(); };
  }, []);
  const go = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' }); };
  return (
    <div className="rf-scroll" ref={box}>
      {any && (
        <div className="rf-arrows" ref={arrows}>
          {edge.l && <button type="button" className="rf-arrow l" onClick={() => go(-1)} aria-label="Прокрутить таблицу влево" title="Влево">‹</button>}
          {edge.r && <button type="button" className="rf-arrow r" onClick={() => go(1)} aria-label="Прокрутить таблицу вправо" title="Вправо">›</button>}
        </div>
      )}
      <div ref={ref} className="rf-wrap">{children}</div>
    </div>
  );
}

function GridBlock({ b }: { b: Block }) {
  return (
    <section className="rf-block">
      <div className="rf-bhead"><h2>{b.title}</h2></div>
      {b.note && <p className="muted small">{window.App.sentCap(b.note)}</p>}
      <HScroll><table className="rf-tbl grid"><tbody>{b.grid!.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></HScroll>
    </section>
  );
}

// ------------------------------------------------------------ пароль ГМ
export function GmForm({ title }: { title: string }) {
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('Проверяю…');
    try {
      await window.GMLock.unlock(pw, remember);
      setPw('');
      toast('Разделы ГМ открыты');
      window.App.render();
    } catch (err) { setMsg((err as Error).message); setBusy(false); }
  };
  return (
    <form className="card wstack rf-lock" onSubmit={submit}>
      <h2><Icon name="lock" />{title}</h2>
      <p className="muted">Бестиарий, навыки, социум, алхимия, артефакты и механики закрыты паролем ГМ. Данные зашифрованы — без пароля их не прочитать даже из файлов сайта.</p>
      <div className="hp-row">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" placeholder="Пароль ГМ" aria-label="Пароль ГМ" required />
        <button type="submit" className="btn primary" disabled={busy}>Открыть</button>
      </div>
      <label className="winline"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} /> Запомнить на этом устройстве</label>
      {msg && <p className={busy ? 'muted small' : 'issue err'} role="alert">{msg}</p>}
    </form>
  );
}
