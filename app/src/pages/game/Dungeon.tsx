import type { ReactNode } from 'react';
import { act, cap } from '../../lib/legacy';
import { fmt, type Any } from '../create/kit';

/*
 * Генератор подземелий для ГМ (страница кампании): комнаты, коридоры, лестницы, противники из бестиария, патрули и свет.
 * Генерация, содержимое комнат и действия (App.actions dg…) — в js/dungeon.js; подземелье хранится в этом браузере.
 * Комната → поле боя — Battle.fromRoom (контекст поля задаёт карточка поля боя).
 */
export function DungeonCard({ cid, level, rerender, addNotes }: { cid: string; level: number; rerender: () => void; addNotes: (text: string) => void }) {
  const Dg = window.Dungeon, App = window.App;
  Dg.setCtx({ cid, rerender });
  const open = Dg.isOpen(cid);
  const dg = Dg.load(cid);
  const head = <div className="cp-sec"><h2 className="h-sec">Генератор подземелий</h2>
    <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => act('dgToggle')}>{open ? 'Свернуть' : 'Открыть'}</button></div>;
  if (!open) return <section className="card wstack dg" id="dungeon">{head}<p className="muted small">Только для ГМ: комнаты, коридоры, ловушки, сундуки и противники из бестиария по правилам листа «механики».</p></section>;

  const opts = Dg.opts(level);
  const setOpt = (k: string, v: unknown) => { opts[k] = v; rerender(); };
  const num = (v: string) => Math.max(0, Math.round(parseFloat(v) || 0));
  const layers: Any[] = window.GAME_DATA.world.layers || [];
  const pl = (n: number, a: string, b: string, c: string) => `${n} ${App.plural(n, a, b, c)}`;
  return (
    <section className="card wstack dg" id="dungeon">
      {head}
      <div className="fgrid dg-opts">
        <label className="fld"><span className="fld-l">Уровень противников от</span><input type="number" min={0} step={1} value={opts.min} onChange={e => setOpt('min', num(e.target.value))} /></label>
        <label className="fld"><span className="fld-l">до</span><input type="number" min={0} step={1} value={opts.max} onChange={e => setOpt('max', num(e.target.value))} /></label>
        <label className="fld"><span className="fld-l">Где подземелье</span>
          <select className="sel" value={opts.hab} onChange={e => setOpt('hab', e.target.value)}>
            <option value="">любые существа</option>
            {layers.map(l => <option key={l.code} value={l.code}>{l.code} — {l.name}</option>)}
          </select></label>
        <label className={'gr-check' + (opts.boss ? ' is-on' : '')}><input type="checkbox" checked={!!opts.boss} onChange={e => setOpt('boss', e.target.checked)} /><span>Босс в финальной комнате</span></label>
      </div>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => act('dgGen')}>{dg ? 'Сгенерировать заново' : 'Сгенерировать'}</button>
        {dg && <>
          <button type="button" className="btn small" onClick={() => act('dgCopy')}>Скопировать текстом</button>
          <button type="button" className="btn small" onClick={() => { const t = Dg.text(cid); if (t) addNotes(t); }}>Добавить в заметки ГМ</button>
          <button type="button" className="link small danger" onClick={() => act('dgClear')}>удалить</button>
        </>}
      </div>
      {!Dg.unlocked() && <p className="muted small">Противники берутся из бестиария — откройте закрытые разделы паролем ГМ (в справочнике), иначе в комнатах будет только их число.</p>}
      {dg && <Body dg={dg} pl={pl} />}
    </section>
  );
}

function Body({ dg, pl }: { dg: Any; pl: (n: number, a: string, b: string, c: string) => string }) {
  const Dg = window.Dungeon;
  const T = Dg.TYPES as Record<string, { code: string; t: string }>;
  const counts: Record<string, number> = {};
  dg.rooms.forEach((r: Any) => { counts[r.type] = (counts[r.type] || 0) + 1; });
  const sel = dg.sel !== null && dg.sel !== undefined ? dg.rooms[dg.sel] : null;
  const stairs = dg.links.filter((l: Any) => l.stairs).length;
  return <>
    <p className="small muted">Создано {new Date(dg.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: {pl(dg.rooms.length, 'комната', 'комнаты', 'комнат')}, лестниц вниз: {stairs}, уровней: {Math.max(...dg.rooms.map((r: Any) => r.depth)) + 1}.{' '}
      {Object.keys(T).filter(k => counts[k]).map(k => `${T[k].code} — ${T[k].t.toLowerCase()} ×${counts[k]}`).join(', ')}.</p>
    <DgMap dg={dg} />
    <p className="small dg-legend">
      <Key t="entrance">0</Key> вход <Key t="empty">1</Key> пустая <Key t="enemies">2</Key> противники <Key t="treasury">3</Key> сокровищница <Key t="trap">4</Key> ловушка{' '}
      <Key t="special">5.x</Key> {(Dg.SPECIAL as string[]).map((s, i) => `5.${i + 1} ${s === 'комната с алтарём' ? 'алтарь' : s}`).join(', ')} <Key t="final">6</Key> финал (босс) <Key t="secret">8</Key> секретная;
      число между комнатами — длина коридора, ↓ — лестница вниз, пунктир — тайный проход. Нажмите на комнату, чтобы увидеть, что в ней.</p>
    {sel && <Room dg={dg} r={sel} />}
    <Tracker dg={dg} pl={pl} />
    <details className="dg-all"><summary>Все комнаты списком</summary>
      {dg.rooms.map((r: Any) => <div key={r.id} className="dg-row"><b>{Dg.roomLabel(r)}</b>{r.depth ? <span className="muted small"> (уровень {r.depth + 1})</span> : null}: {r.info.join(' ')}
        {r.foes.length > 0 && <span className="muted"> {r.foes.map((f: Any) => `${f.n}${f.q > 1 ? ' ×' + f.q : ''} (ур. ${f.lvl})`).join(', ')}</span>}</div>)}
    </details>
  </>;
}

const Key = ({ t, children }: { t: string; children: ReactNode }) => <span className={'dg-key t-' + t}>{children}</span>;

function DgMap({ dg }: { dg: Any }) {
  const Dg = window.Dungeon;
  const { W, H, grid } = Dg.mapGrid(dg);
  const tpl = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 'var(--dg-cor)' : 'var(--dg-room)')).join(' ');
  return (
    <div className="dg-scroll">
      <div className="dg-map" style={{ gridTemplateColumns: tpl(W), gridTemplateRows: tpl(H) }}>
        {(grid as Any[][]).flatMap((row, y) => row.map((c, x) => {
          const k = x + ':' + y;
          if (!c) return <span key={k} className="dg-void" />;
          if (c.r) {
            const r = c.r;
            return <button key={k} type="button" className={'dg-room t-' + r.type + (dg.sel === r.id ? ' is-sel' : '')} onClick={() => act('dgSel', { v: String(r.id) })}
              title={Dg.roomLabel(r) + (r.depth ? ` · уровень ${r.depth + 1}` : '')} aria-label={Dg.roomLabel(r)}>{Dg.codeOf(r)}</button>;
          }
          const l = c.l;
          return <span key={k} className={'dg-cor ' + (c.v ? 'v' : 'h') + (l.stairs ? ' stairs' : '') + (l.secret ? ' secret' : '')}
            title={`коридор, длина ${l.len}${l.stairs ? ', лестница вниз' : ''}${l.secret ? ', тайный проход' : ''}`}>{l.len}{l.stairs ? '↓' : ''}</span>;
        }))}
      </div>
    </div>
  );
}

function Room({ dg, r }: { dg: Any; r: Any }) {
  const Dg = window.Dungeon;
  const near = dg.links.filter((l: Any) => l.a === r.id || l.b === r.id);
  return (
    <div className="dg-room-card">
      <div className="cp-sec"><h3>{Dg.roomLabel(r)}</h3>{r.depth ? <span className="chip warn">уровень подземелья {r.depth + 1}: враги +{r.depth * Dg.STAIR_BONUS}% к статам (кроме ловкости)</span> : null}</div>
      {r.info.map((t: string, i: number) => <p key={i} className="small">{t}</p>)}
      {r.foes.length > 0 && <ul className="dg-foes">{r.foes.map((f: Any) => <li key={f.n}><span><b>{f.n}</b>{f.q > 1 ? ` ×${f.q}` : ''}{f.boss && <> <span className="chip bad">босс</span></>}</span><span className="muted small">ур. {fmt(f.lvl)}</span></li>)}</ul>}
      {near.length > 0 && <p className="small dg-near">Выходы: {near.map((l: Any, i: number) => {
        const o = dg.rooms[l.a === r.id ? l.b : l.a];
        return <span key={i}>{i > 0 && '; '}<button type="button" className="link small" onClick={() => act('dgSel', { v: String(o.id) })}>№{o.id} ({Dg.codeOf(o)})</button> <span className="muted small">— коридор {l.len}{l.stairs ? ', лестница' : ''}{l.secret ? ', тайный' : ''}</span></span>;
      })}</p>}
      <div className="row">
        {r.type !== 'entrance' && <button type="button" className="btn small" onClick={() => act('dgReroll', { v: String(r.id) })}>Перебросить содержимое</button>}
        {window.Battle && window.Battle.ready() && <button type="button" className="btn small" onClick={() => act('dgBattle', { v: String(r.id) })} title={`Поле боя с местностью этой комнаты${r.foes.length ? ' и её противниками' : ''}`}>На поле боя</button>}
        <button type="button" className="link small" onClick={() => act('dgSel', { v: '' })}>закрыть</button>
      </div>
    </div>
  );
}

function Tracker({ dg, pl }: { dg: Any; pl: (n: number, a: string, b: string, c: string) => string }) {
  const Dg = window.Dungeon;
  const L = Dg.lightOf(dg), p = dg.patrol || { rooms: 0, log: [] };
  const path = Dg.pathToFinal(dg);
  const step = Dg.PATROL_STEP, RC = Dg.ROOM_COST, CC = Dg.CORR_COST;
  const now = Math.min(100, p.rooms * step);
  const light = Dg.lightPct(dg);
  const cost = path ? path.rooms * RC + path.cells * CC : 0;
  return (
    <div className="dg-track">
      <div className="dg-track-col">
        <h3>Патрули в коридорах</h3>
        <p>Шанс встретить отряд: <b>{now}%</b> <span className="muted small">(+{step}% за каждую пройденную комнату; на лестнице патрулей нет; после встречи — сброс)</span></p>
        <div className="row">
          <button type="button" className="btn small" onClick={() => act('dgPatrol', { v: 'room' })} title={`+${step}% к шансу патруля и −${RC}% света`}>Комната пройдена</button>
          <button type="button" className="btn small primary" onClick={() => act('dgPatrol', { v: 'roll' })}>Коридор: бросок d100</button>
          <button type="button" className="link small" onClick={() => act('dgPatrol', { v: 'reset' })}>сбросить</button>
        </div>
        {p.log.length > 0 && <ul className="small dg-log">{p.log.slice(-4).reverse().map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}
      </div>
      <div className="dg-track-col">
        <h3>Свет</h3>
        <div className="dg-light">
          <label>Освещение, % <input key={light} type="number" min={0} max={100} step={1} defaultValue={light}
            onBlur={e => { if (+e.target.value !== light) act('dgLight', {}, e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
          <span className={'chip' + (L.min >= 50 ? '' : ' warn')}>{cap(L.id)} ({L.range})</span>
        </div>
        <p className="small">{L.fx}.</p>
        <div className="row">
          <button type="button" className="btn small" onClick={() => act('dgDim', { v: String(CC) })}>Клетка коридора: −{CC}%</button>
          {(Dg.lightSources() as { n: string; v: number }[]).map(s => <button key={s.n} type="button" className="btn small" onClick={() => act('dgDim', { v: String(-s.v) })} title={`${cap(s.n)}: +${s.v} очков свечения`}>{cap(s.n)}: +{s.v}%</button>)}
          <button type="button" className="link small" onClick={() => act('dgDim', { v: 'full' })}>свет 100%</button>
        </div>
        <p className="small">Комната: −{RC * L.psi} пси, −{RC} живости, −{RC}% света; клетка коридора: −{CC * L.psi} пси, −{CC} живости, −{CC}% света.
          {path && <> До финала кратчайшим путём: {pl(path.rooms, 'комната', 'комнаты', 'комнат')} и {pl(path.cells, 'клетка', 'клетки', 'клеток')} коридора — <b>−{cost * L.psi} пси, −{cost} живости, −{cost}% света</b> (пси — при нынешнем свете).</>}</p>
      </div>
    </div>
  );
}
