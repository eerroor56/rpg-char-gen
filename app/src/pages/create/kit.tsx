/*
 * Общие элементы шагов мастера: поля, счётчики, карточки. Состояние героя — App.state прежнего сайта, расчёт по
 * правилам — App.res (Rules.compute); шаги только показывают их и меняют через App.set / App.actions.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { act, cap } from '../../lib/legacy';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Any = any;
export const R = () => window.Rules;
export const D = () => window.GAME_DATA;
export const C = (): Any => (window as Any).GM_CONFIG;
export const fmt = (v: unknown) => window.Rules.fmt(v);
export const signed = (v: unknown) => window.Rules.signed(v);
export const norm = (s: unknown): string => window.Rules.norm(s);
export { cap, act };

/** изменить поле героя (путь «weapon.mat», «alloc.t»); soft — без полной перерисовки (ввод текста) */
export function set(path: string, value: unknown, soft = false) { window.App.set(path, value, soft ? { soft: true } : {}); }
/** герой изменён напрямую (App.state) — сохранить черновик и пересчитать */
export function changed() { window.App.changed(); }

export type StepProps = { st: Any; res: Any };

export function sizeName(code: string) {
  const s = R().SIZES.find((x: Any) => x.id === code);
  return s ? s.name : code === 'наст' ? 'Настраиваемый' : (code || '—');
}

// ------------------------------------------------------------ поля

export type Opt = { v: string | number; t: string; group?: string; disabled?: boolean };
/** выпадающий список; группы — по полю group подряд идущих вариантов */
export function Sel({ value, options, onChange, label, className }: { value: unknown; options: Opt[]; onChange: (v: string) => void; label?: string; className?: string }) {
  const groups: { g?: string; list: Opt[] }[] = [];
  options.forEach(o => {
    const last = groups[groups.length - 1];
    if (last && last.g === o.group) last.list.push(o); else groups.push({ g: o.group, list: [o] });
  });
  const opt = (o: Opt) => <option key={String(o.v)} value={String(o.v)} disabled={o.disabled}>{o.t}</option>;
  return (
    <select className={'sel' + (className ? ' ' + className : '')} value={value === undefined || value === null ? '' : String(value)} onChange={e => onChange(e.target.value)} aria-label={label}>
      {groups.map((g, i) => g.g === undefined ? g.list.map(opt) : <optgroup key={g.g + i} label={g.g}>{g.list.map(opt)}</optgroup>)}
    </select>
  );
}
/** поле со своей подписью сверху */
export function Field({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  return <label className={'fld' + (wide ? ' wide' : '')}><span className="fld-l">{label}</span>{children}</label>;
}

/** число: «−», поле, «+»; вводимое число применяется сразу, если оно целое и в пределах */
export function Stepper({ value, onChange, min = -Infinity, max = Infinity, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  const [text, setText] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(value)); }, [value, focus]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  return (
    <span className="stp" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label="Уменьшить">−</button>
      <input type="text" inputMode="numeric" value={focus ? text : String(value)} aria-label={label}
        onFocus={e => { setFocus(true); setText(String(value)); e.target.select(); }}
        onChange={e => { setText(e.target.value); if (/^-?\d+([.,]\d+)?$/.test(e.target.value.trim())) commit(e.target.value); }}
        onBlur={() => { setFocus(false); commit(text); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label="Увеличить">+</button>
    </span>
  );
}

// ------------------------------------------------------------ показ

/** пять характеристик строкой (+ уровень) */
export function StatMini({ o }: { o: Any }) {
  const Rr = R();
  return (
    <dl className="smini">
      {Rr.STATS.map((k: string) => <div key={k}><dt title={Rr.STAT_NAMES[k]}>{Rr.STAT_SHORT[k]}</dt><dd>{fmt(o[k])}</dd></div>)}
      {o.lvl !== undefined && <div className="lvl"><dt>Ур.</dt><dd>{fmt(o.lvl)}</dd></div>}
    </dl>
  );
}
export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return <div className="kv"><dt>{k}</dt><dd>{children}</dd></div>;
}
/** «Учтено в расчёте» — что из текста правил программа применила сама */
export function Applied({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="applied"><b>Учтено в расчёте</b><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
}
export const CalcMark = ({ children = 'расчёт' }: { children?: ReactNode }) => <span className="calc" title="Учитывается в расчёте">{children}</span>;
export function Empty({ children }: { children: ReactNode }) { return <div className="card empty">{children}</div>; }
export function Warn({ children, err }: { children: ReactNode; err?: boolean }) { return <p className={'issue ' + (err ? 'err' : 'warn')}>{children}</p>; }

/** картинка расы (у полукровки — обоих родителей) */
export function RacePic({ races, className }: { races: Any[]; className?: string }) {
  const imgs = window.RACE_IMAGES || {};
  const list = races.filter(r => r && imgs[r.id]);
  if (!list.length) return null;
  return (
    <span className={'rpic' + (list.length > 1 ? ' two' : '') + (className ? ' ' + className : '')}>
      {list.map(r => <img key={r.id} src={imgs[r.id].src} width={imgs[r.id].w} height={imgs[r.id].h} alt="" loading="lazy" decoding="async" />)}
    </span>
  );
}
/** картинка существа, бога или демона (data/portraits.js, если загружен) */
export function EntityPic({ name, className }: { name: string; className?: string }) {
  const list = window.App.pics ? window.App.pics(name) : null;
  if (!list || !list.length) return null;
  return <span className={'rpic' + (className ? ' ' + className : '')}><img src={list[0].src} alt="" loading="lazy" decoding="async" /></span>;
}

/** бросок кубика по правилу (артефакт, проклятие, символ…): результат и сколько раз перебрасывали — ГМ это видит */
export function RollBox({ kind, label, st }: { kind: string; label: string; st: Any }) {
  const r = R().rollView((st.rolls || {})[kind]);
  return (
    <div className="rollbox">
      <button type="button" className="btn small" onClick={() => act('roll', { kind })}>{r ? 'Перебросить' : 'Бросить'}: {label}</button>
      {r && <p><b>{r.v}</b>{r.block && <span className="muted"> ({r.block})</span>}{r.detail && <> — {r.detail}</>}
        <br /><span className="muted small">бросков: {r.n}{r.n > 1 ? ' — ГМ видит количество перебросов' : ''}</span></p>}
    </div>
  );
}

/** список типов урона и эффектов для подсказок в полях сопротивлений */
export function DmgList() {
  const items = D().skills.symbols.map((s: Any) => s.name.replace(/\s*\(\d\)/, '')).concat(['физический', 'магический', 'колющий', 'рубящий', 'режущий', 'дробящий', 'рвущий', 'секущий',
    'яд', 'кровотечение', 'горение', 'оглушение', 'страх', 'очарование', 'бешенство', 'проклятие', 'болезнь', 'безмолвие', 'слепота', 'сон', 'удушение']);
  return <datalist id="dmgTypes">{[...new Set<string>(items)].map(x => <option key={x} value={x} />)}</datalist>;
}

/** требования вида «5т 3л» не выполнены — подсказать, каких характеристик не хватает */
export function ReqNote({ req, res }: { req?: string; res: Any }) {
  if (!req) return null;
  const Rr = R();
  const KEY: Record<string, string> = { 'т': 't', 'д': 'd', 'с': 's', 'и': 'i', 'л': 'l' };
  const parts: [number, string][] = [];
  String(req).replace(/(\d+)\s*([тдсилТДСИЛ])/g, (m, n, k) => { parts.push([+n, KEY[k.toLowerCase()]]); return m; });
  const bad = parts.filter(([n, k]) => res.stats[k] < n);
  if (!bad.length) return null;
  return <Warn>Требования «{req}» не выполнены: {bad.map(([n, k]) => `${Rr.STAT_NAMES[k].toLowerCase()} ${fmt(res.stats[k])} из ${n}`).join(', ')}.</Warn>;
}

/** поиск с иконкой */
export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search wsearch">
      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5l-4.5-4.5" /></svg>
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
      {value && <button type="button" className="link" onClick={() => onChange('')} aria-label="Очистить">✕</button>}
    </label>
  );
}

/** переключатель вкладок-«таблеток» */
export function Seg<T extends string>({ value, items, onChange, label }: { value: T; items: { id: T; t: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {items.map(it => <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={value === it.id ? 'is-on' : ''} onClick={() => onChange(it.id)}>{it.t}</button>)}
    </div>
  );
}
