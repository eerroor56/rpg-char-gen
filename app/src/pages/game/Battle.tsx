import { useRef, type CSSProperties, type ReactNode } from 'react';
import { act, cap } from '../../lib/legacy';
import { useUi } from '../hero/gearKit';
import { fmt, signed, type Any } from '../create/kit';
import { ResistChips, ResistConds } from '../sheet/Resist';

/*
 * Поле боя кампании — клетчатая доска: местность с укрытиями, герои, союзники и противники, туман войны, очередь ходов и ОД,
 * броня / ХП / МП фишек. Расчёт (генерация, обзор, путь, ОД) и действия (App.actions bt…, al…) — в js/battle.js:
 * Battle.view(ctx) отдаёт, кто где стоит, а здесь всё рисуется. Перетаскивание фишек и стрелки — тоже в js/battle.js:
 * они ищут на странице .bt-grid, .bt-cell[data-x][data-y] и [data-tok].can-move, поэтому эти классы и атрибуты не менять.
 */
export type BattleCtx = {
  cid: string; camp: Any; gm: boolean; me: string; level: number; rerender: () => void;
  heroes: Any[]; allies: Any[]; saveAllies: (l: Any[]) => unknown;
  saveBoard: (b: Any) => unknown; savePos: (chid: string, p: Any) => unknown; saveVit: (chid: string, v: Any) => unknown;
  saveAllyPos: (chid: string, aid: string, p: Any) => unknown;
};
type Tok = Any;

const Glyph = ({ t }: { t: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: window.Battle.GLYPHS[t] || '' }} />;
const kindCls = (t: Tok) => (t.kind === 'h' ? 'hero' : t.kind === 'a' ? 'ally' : 'foe');
const pct = (v: number, m: number) => Math.max(0, Math.min(100, Math.round(100 * v / m)));

/** подсказки «кто»: существа (после пароля ГМ) и расы */
export function Creatures({ id }: { id: string }) {
  const l: [string, string][] = window.Battle.creatures();
  return l.length ? <datalist id={id}>{l.map(([n, k]) => <option key={n} value={n}>{k}</option>)}</datalist> : null;
}

export function BattleCard({ o, side }: { o: BattleCtx; side?: ReactNode }) {
  const B = window.Battle, App = window.App;
  const v = B.view(o);
  // пока фишку тянут, поле не перерисовывается (js/battle.js попросит перерисовать после)
  const frozen = useRef<ReactNode>(null);
  if (B.busy() && frozen.current) return frozen.current;
  const board = v.board;
  if (!board && !o.gm) { frozen.current = null; return null; }
  const P = board ? B.preset(board.preset) : null;
  const head = <div className="cp-sec"><h2>Поле боя</h2>{board && <span className="muted small">{P.n}, {board.w}×{board.h}</span>}</div>;
  let out: ReactNode;
  if (!board) out = (
    <section className="card bf is-gm" id="battle">
      {head}
      <p className="muted small">Клетчатое поле для боя: местность с укрытиями, герои и противники. Игроки двигают своих героев, вы — всё остальное.</p>
      <GenForm open />
    </section>
  );
  else {
    const fz = +board.zor || 0;
    const hidN = o.gm ? [...v.at.values()].filter((t: Tok) => B.hid(t)).length : 0;
    out = (
      <section className={'card bf' + (o.gm ? ' is-gm' : '')} id="battle">
        {head}
        <div className="bt-arena">
          <div className="bt-main">
            {board.fx && <p className="small bt-fx"><b>Эффект поля:</b> противникам — {board.fx.foe || 'нет'}; игрокам — {board.fx.hero || 'нет'}{board.fx.layer ? <span className="muted"> (уровни мира: {board.fx.layer})</span> : null}</p>}
            {fz && !o.gm ? <p className="small bt-fx"><b>Зоркость на поле:</b> {signed(fz)} всем героям и союзникам</p> : null}
            {o.gm && <Tools board={board} />}
            <Grid v={v} gm={o.gm} />
            {o.gm && <div className="row bt-fog">
              <button type="button" className="link small" onClick={() => act('btFog')}>туман войны: {B.fogOn(board) ? 'вкл' : 'выкл'}</button>
              {(B.fogOn(board) || hidN > 0) && <label className="bt-check small"><input type="checkbox" checked={!!App.ui.btAsPlayer} onChange={e => act('btAsPlayer', {}, undefined, e.target.checked)} /> показать как видят игроки</label>}
              {hidN > 0 && <span className="small muted">скрыто от игроков: {hidN}</span>}
              <span className="bt-zor-ctl small" title="Темнота, туман, дым или свет: поправка зоркости всем героям и союзникам на этом поле">зоркость на поле <b>{fz ? signed(fz) : '0'}</b>
                <button type="button" className="btn ghost small" onClick={() => act('btFieldZor', { v: String(-B.ZOR_PER_CELL) })}>−{B.ZOR_PER_CELL}</button>
                <button type="button" className="btn ghost small" onClick={() => act('btFieldZor', { v: String(B.ZOR_PER_CELL) })}>+{B.ZOR_PER_CELL}</button>
                {fz ? <button type="button" className="link small" onClick={() => act('btFieldZor', { v: '0' })}>сбросить</button> : null}</span>
            </div>}
          </div>
          <aside className="bt-side" aria-label="Ход, выбранная фишка, бросок и журнал">
            <Turns v={v} gm={o.gm} />
            <SelInfo v={v} gm={o.gm} />
            {side && <div className="cp-side">{side}</div>}
          </aside>
          <div className="bt-extra">
            <Roster v={v} gm={o.gm} />
            <details className="bt-help"><summary>Подсказки и обозначения</summary>
              {!o.gm && <p className="small">Перетащите своего героя (мышью или пальцем) или выберите его и двигайте стрелками. Видно то, что в обзоре отряда: 1 клетка за каждые 10 зоркости; стены, деревья и другие полные укрытия закрывают обзор.</p>}
              <p className="small bt-legend"><i className="cv cv2" /> полное укрытие — 40% что дальняя атака придётся в укрытие <i className="cv cv1" /> половинное — 20% (складывается с уворотом, не больше 100%) · объекты на полу (трава, останки, лужи, ковёр) укрытия не дают, на них можно стоять · расстояние в клетках, по диагонали тоже 1 · 1 ОД — {B.MOVE_PER_OD} клеток движения · обзор — 1 клетка за {B.ZOR_PER_CELL} зоркости, полные укрытия (стены, деревья, колонны, валуны…) его закрывают</p>
            </details>
            {o.gm && <><GenForm open={false} /><div className="row"><button type="button" className="link small danger" onClick={() => act('btClear')}>убрать поле боя</button></div></>}
          </div>
        </div>
      </section>
    );
  }
  frozen.current = out;
  return out;
}

// ------------------------------------------------------------ клетки
function Grid({ v, gm }: { v: Any; gm: boolean }) {
  const B = window.Battle, board = v.board;
  const fog = v.fog ? v.vis : null;
  const cells: ReactNode[] = [];
  for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) {
    const k = B.key(x, y), dc = v.decor.get(k);
    let t = v.at.get(k);
    const dark = !!fog && !fog.has(k);
    if (t && t.kind === 'f' && dark) t = null;            // противника вне обзора игроки не видят
    if (t && B.hid(t) && B.veil()) t = null;              // скрытого ГМ существа — тоже
    const fill = (t && t.kind === 'o' && B.info(t.o.t).fill) || (dc && B.info(dc.t).fill);
    const turn = !!v.cur && !!t && t.kind !== 'o' && B.tid(t) === B.tid(v.cur);
    const unseen = gm && !fog && !!v.vis && !!t && t.kind === 'f' && !v.vis.has(k);
    cells.push(
      <div key={k} className={'bt-cell' + ((x + y) % 2 ? ' alt' : '') + (fill ? ' cell-' + fill : '') + (dark ? ' fog' : '')} data-x={x} data-y={y}
        onClick={() => act('btCell', { x: String(x), y: String(y) })}>
        {dc && <span className={'bt-decor' + (gm && !t ? ' can-move' : '') + (v.sid === 'o:' + dc.i ? ' is-sel' : '')} data-tok={'o:' + dc.i} title={`${cap(B.info(dc.t).n)} — объект на полу, можно встать`}><Glyph t={dc.t} /></span>}
        {t && <Token t={t} x={x} y={y} sel={v.sid} turn={turn} unseen={unseen} />}
      </div>
    );
  }
  return (
    <div className="bt-wrap">
      <div className={'bt-grid bt-p-' + (board.floor || board.preset)} style={{ '--w': board.w, '--h': board.h } as CSSProperties} data-board={board.id}>{cells}</div>
    </div>
  );
}

function Token({ t, x, y, sel, turn, unseen }: { t: Tok; x: number; y: number; sel: string | null; turn: boolean; unseen: boolean }) {
  const B = window.Battle;
  const id = B.tid(t);
  const isSel = sel === id;
  const mov = B.canMove(t) ? ' can-move' : '';
  if (t.kind === 'o') {
    const d = B.info(t.o.t);
    return (
      <span className={'bt-obj' + (d.fill ? ' fill-' + d.fill : '') + mov + (isSel ? ' is-sel' : '')} data-tok={id} title={cap(d.n) + (d.c ? ' — ' + B.COVER[d.c] : '')}>
        <Glyph t={t.o.t} />{d.c ? <i className={'cv cv' + d.c} aria-hidden="true" /> : null}
      </span>
    );
  }
  const name = B.tname(t);
  const pic = t.kind === 'h' ? B.heroPic(t.o) : B.foePic(t.o.src || t.o.n);
  const me = window.Cloud.uid();
  const mine = (t.kind === 'h' && t.o.owner === me) || (t.kind === 'a' && !!t.owner && t.owner.owner === me);
  const title = t.kind === 'h' ? `${name}${t.o.ownerName ? ' — игрок ' + t.o.ownerName : ''}`
    : t.kind === 'a' ? `${name} — ${B.allyKind(t.o)}${t.owner ? ' ' + t.owner.name : ''}${t.o.lvl ? ', ур. ' + t.o.lvl : ''}`
      : `${name}${t.o.lvl ? ', ур. ' + t.o.lvl : ''}`;
  const v = B.vitals(t), down = B.isDown(t), veiled = B.hid(t);
  const st: Any[] = B.stOf(t), stText = st.length ? ' — ' + st.map((z: Any) => z.n + (B.has(z.x) ? ` (${z.x} х.)` : '')).join(', ') : '';
  return (
    <button type="button" data-tok={id} style={t.kind === 'h' ? { '--hue': B.hue(t.o.owner || t.o.id) } as CSSProperties : undefined}
      className={'bt-tok ' + kindCls(t) + (B.charmed(t) ? ' charmed' : '') + (mine ? ' mine' : '') + mov + (isSel ? ' is-sel' : '') + (turn ? ' is-turn' : '') + (down ? ' down' : '') + (unseen ? ' unseen' : '') + (veiled ? ' hid' : '')}
      title={title + (down ? ' — выбыл' : '') + (veiled ? ' — скрыт от игроков' : unseen ? ' — игроки не видят' : '') + stText}
      aria-label={`${title}${veiled ? ', скрыт от игроков' : ''}, клетка ${x + 1}:${y + 1}`}>
      {pic ? <img src={pic} alt="" loading="lazy" decoding="async" draggable={false} /> : <b>{B.initials(name)}</b>}
      {v.mhp ? <span className="bt-bars" aria-hidden="true">
        {v.marm ? <i className="arm" style={{ width: pct(v.arm, v.marm) + '%' }} /> : null}
        <i className="hp" style={{ width: pct(v.hp, v.mhp) + '%' }} />
        {v.mmp ? <i className="mp" style={{ width: pct(v.mp, v.mmp) + '%' }} /> : null}
      </span> : null}
      {st.length ? <span className="bt-st-dot" aria-hidden="true">{st.length}</span> : null}
    </button>
  );
}

// ------------------------------------------------------------ инструменты ГМ
function Tools({ board }: { board: Any }) {
  const B = window.Battle, App = window.App, ui = useUi();
  const tool = App.ui.btTool || '';
  const P = B.preset(board.preset);
  const T = B.TYPES;
  const chip = (val: string, label: string, ico: ReactNode) => (
    <button key={val || 'move'} type="button" className={'bt-chip' + (tool === val ? ' is-on' : '')} aria-pressed={tool === val} onClick={() => act('btTool', { v: val })}>{ico}<span>{label}</span></button>
  );
  const others = Object.keys(T).filter(t => !(t in P.set));
  return <>
    <div className="bt-tools" role="toolbar" aria-label="Инструменты поля">
      {chip('', 'Двигать', <span className="bt-ico">✥</span>)}
      {Object.keys(P.set).map(t => chip(t, cap(B.info(t).n), <Glyph t={t} />))}
      <select className="sel" value={others.includes(tool) ? tool : ''} onChange={e => act('btToolAny', {}, e.target.value)} aria-label="Другой предмет">
        <option value="">другой предмет…</option>
        {others.map(t => <option key={t} value={t}>{cap(B.info(t).n)}</option>)}
      </select>
      {chip('foe', 'Противник', <span className="bt-ico foe">●</span>)}
      {chip('erase', 'Ластик', <span className="bt-ico">⌫</span>)}
    </div>
    {tool === 'foe' && <div className="row bt-foe-row">
      <input type="text" list="btCreatures" value={ui.get('btFoeName')} onChange={e => ui.set('btFoeName', e.target.value)} placeholder="кто (существо, раса или своё)" aria-label="Противник" />
      <label className="bt-check small" title="Игроки его не увидят, пока вы не покажете (засада, подкрепление)"><input type="checkbox" checked={!!App.ui.btFoeHid} onChange={e => ui.set('btFoeHid', e.target.checked)} /> ставить скрытым</label>
      <span className="muted small">нажмите на свободную клетку</span>
      <Creatures id="btCreatures" />
    </div>}
    {tool && tool !== 'foe' && <p className="muted small bt-hint">{tool === 'erase' ? 'Нажмите на предмет или противника, чтобы убрать.' : `Нажмите на свободную клетку, чтобы поставить «${T[tool] ? B.info(tool).n : tool}».`}</p>}
  </>;
}

function GenForm({ open }: { open: boolean }) {
  const B = window.Battle, ui = useUi();
  const val = (k: string, d: string | number) => (window.App.ui[k] !== undefined ? String(window.App.ui[k]) : String(d));
  const list: [string, [string, string][]][] = B.presetList();
  return (
    <details className="bt-new" open={open}>
      <summary>{open ? 'Создать поле боя' : 'Новое поле боя'}</summary>
      <div className="fgrid bt-form">
        <label className="fld"><span className="fld-l">Местность</span>
          <select className="sel" value={B.pickedPreset()} onChange={e => ui.set('btPreset', e.target.value)}>
            {list.map(([g, opts]) => <optgroup key={g} label={g}>{opts.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</optgroup>)}
          </select></label>
        <label className="fld"><span className="fld-l">Ширина</span><input type="number" min={B.SIZE[0]} max={B.SIZE[1]} step={1} value={val('btW', 15)} onChange={e => ui.set('btW', e.target.value)} /></label>
        <label className="fld"><span className="fld-l">Высота</span><input type="number" min={B.SIZE[0]} max={B.SIZE[1]} step={1} value={val('btH', 15)} onChange={e => ui.set('btH', e.target.value)} /></label>
        <label className="fld"><span className="fld-l">Предметов</span>
          <select className="sel" value={val('btDensity', 'mid')} onChange={e => ui.set('btDensity', e.target.value)}>
            {Object.entries(B.DENSITY as Record<string, [number, string]>).map(([k, d]) => <option key={k} value={k}>{d[1]}</option>)}
          </select></label>
        <label className="fld"><span className="fld-l">Противников</span><input type="number" min={0} max={40} step={1} value={val('btFoeN', 4)} onChange={e => ui.set('btFoeN', e.target.value)} /></label>
        <label className="fld"><span className="fld-l">Случайные — из</span>
          <select className="sel" value={val('btFoeSrc', 'bestiary')} onChange={e => ui.set('btFoeSrc', e.target.value)}>
            <option value="bestiary">бестиария</option><option value="races">рас</option><option value="mix">бестиария и рас</option>
          </select></label>
        <label className="fld bt-wide"><span className="fld-l">Кто именно</span>
          <input type="text" value={val('btFoeNames', '')} onChange={e => ui.set('btFoeNames', e.target.value)} placeholder="через запятую: существа, расы или свои имена; пусто — случайные по уровню отряда" /></label>
      </div>
      <div className="row bt-gen"><button type="button" className="btn primary" onClick={() => act('btGen')}>Создать поле</button>
        <span className="muted small">Герои в игре встанут у нижнего края, противники — у верхнего.</span></div>
    </details>
  );
}

// ------------------------------------------------------------ ход: чей, ОД, кнопки, очередь
function Pips({ left, max }: { left: number; max: number }) {
  const n = Math.max(left, max);
  if (n > 12 || n <= 0) return null;
  return <span className="bt-pips" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < left ? (i >= max ? 'on over' : 'on') : ''} />)}</span>;
}

function Turns({ v, gm }: { v: Any; gm: boolean }) {
  const B = window.Battle, board = v.board;
  if (!B.turnOn(board)) return (
    <div className="bt-turns bt-panel">
      {gm ? <><button type="button" className="btn primary bt-big" onClick={() => act('btFight')}>Начать бой — бросить инициативу</button>
        <p className="muted small">d100 на каждого на поле; ход переходит по порядку. 1 ОД — {B.MOVE_PER_OD} клеток движения.</p></>
        : <p className="small"><b>Бой не начат</b> <span className="muted">— героя можно двигать свободно.</span></p>}
    </div>
  );
  const vis = v.fog ? v.vis : null;
  const tr = board.turn, cur = v.cur;
  const tokById = (id: string) => [...v.at.values()].find((t: Tok) => t.kind !== 'o' && B.tid(t) === id) || null;
  const hidden = (t: Tok) => (B.hid(t) && B.veil()) || (!!vis && t.kind === 'f' && !vis.has(B.key(...B.tpos(t))));
  const sp = cur ? B.spent(board, cur) : null, vt = cur ? B.vitals(cur) : null;
  const curHidden = !!cur && hidden(cur);
  const myTurn = !!cur && !gm && B.canMove(cur);
  const left = cur ? B.odLeft(board, cur) : 0;
  const showOd = !!cur && !curHidden && (gm || cur.kind !== 'f');
  const can = !!cur && (gm || myTurn) && !curHidden;
  return (
    <div className={'bt-turns bt-panel' + (myTurn ? ' my-turn' : '')}>
      <p className="bt-turn-head"><b>Раунд {tr.round}</b> · ход: <b>{curHidden ? 'противник (не виден)' : cur ? B.tname(cur) : '—'}</b>{myTurn && <> <span className="chip ok">ваш ход</span></>}</p>
      {showOd && <div className="bt-od"><span>ОД</span><Pips left={left} max={vt.od} />
        <b className={left < 0 ? 'bad' : left > vt.od ? 'over' : ''} title="осталось в этот ход / положено в ход">{left} / {vt.od}</b>
        <span className="muted small">пройдено {sp.mv} кл.{B.has(vt.rhp) || B.has(vt.rmp) ? ` · реген ХП ${B.has(vt.rhp) ? '+' + fmt(vt.rhp) : '?'}, МП ${B.has(vt.rmp) ? '+' + fmt(vt.rmp) : '?'}` : ''}</span></div>}
      {(can || gm) && <div className="bt-turn-act">
        {can && <button type="button" className="btn" onClick={() => act('btOd')} title="Атака, заклинание, навык — снять 1 ОД">−1 ОД</button>}
        {can && gm && <button type="button" className="btn" onClick={() => act('btOdPlus')} title="Прибавить 1 ОД тому, чей сейчас ход (навыки, умения): как лечение ХП, можно и выше положенного">+1 ОД</button>}
        {myTurn && <button type="button" className="btn primary" onClick={() => act('btEndTurn')}>Закончить ход</button>}
        {gm && <button type="button" className="btn primary" onClick={() => act('btNext')}>Следующий ход ▸</button>}
      </div>}
      <ol className="bt-order" aria-label="Очередь ходов">
        {tr.order.map((e: Any, i: number) => {
          const t = tokById(e.id);
          if (!t || (B.hid(t) && B.veil())) return null;
          const h = hidden(t);
          return <li key={e.id} className={'k-' + t.kind + (i === tr.cur ? ' is-cur' : '') + (B.isDown(t) ? ' down' : '')}>
            <button type="button" className="link" disabled={h} onClick={() => act('btSel', { v: e.id })}><b>{e.ini}</b> {h ? '???' : B.tname(t)}</button></li>;
        })}
      </ol>
      {gm && <div className="row bt-turn-gm">
        <button type="button" className="link small" onClick={() => act('btFight')}>перебросить инициативу</button>
        <button type="button" className="link small danger" onClick={() => act('btEnd')}>закончить бой</button>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------ выбранная фишка
function SelInfo({ v, gm }: { v: Any; gm: boolean }) {
  const B = window.Battle, App = window.App, board = v.board;
  const t = B.selected(board, v.at, v.sid);
  if (!t) return <div className="bt-info bt-panel is-empty"><p className="muted small">{gm ? 'Нажмите на фишку на поле — здесь появятся её броня, ХП, МП и кнопки урона и лечения.' : 'Нажмите на фишку на поле, чтобы посмотреть её.'}</p></div>;
  const pos = B.tpos(t), veiled = B.hid(t);
  let name = '', sub: ReactNode = '';
  if (t.kind === 'h') { name = t.o.name; sub = `герой${t.o.ownerName ? `, игрок ${t.o.ownerName}` : ''}`; }
  else if (t.kind === 'a') { name = t.o.n; sub = <><span title={(B.ALLY_KINDS[t.o.kind] || B.ALLY_KINDS.npc)[1]}>союзник: {B.allyKind(t.o)}{t.owner ? ` героя ${t.owner.name}` : ' отряда'}</span>{t.o.lvl ? `, ур. ${t.o.lvl}` : ''}</>; }
  else if (t.kind === 'f') { name = t.o.n; sub = `противник${t.o.lvl ? `, ур. ${t.o.lvl}` : ''}`; }
  else { const d = B.info(t.o.t); name = cap(d.n); sub = `${d.c ? B.COVER[d.c] : d.walk ? 'объект на полу, можно встать' : 'без укрытия'}${d.drop ? ` · при разрушении: ${d.drop}` : ''}`; }
  const pic = t.kind === 'h' ? B.heroPic(t.o) : t.kind !== 'o' ? B.foePic(t.o.src || t.o.n) : '';
  const s = B.tid(t);
  return (
    <div className={'bt-info bt-panel' + (veiled ? ' is-hid' : '')}>
      <div className="bt-info-head">
        {t.kind === 'o' ? <span className="bt-face obj"><Glyph t={t.o.t} /></span>
          : <span className={'bt-face ' + kindCls(t)} style={t.kind === 'h' ? { '--hue': B.hue(t.o.owner || t.o.id) } as CSSProperties : undefined}>
            {pic ? <img src={pic} alt="" loading="lazy" decoding="async" /> : <b>{B.initials(name)}</b>}</span>}
        <span className="bt-who"><b>{name}</b><span className="muted small">{sub} · клетка {pos[0] + 1}:{pos[1] + 1}</span>{veiled && <span className="chip bad">скрыт от игроков</span>}</span>
        {App.ui.btSel && <button type="button" className="bt-x" onClick={() => act('btSel', { v: '' })} title="Снять выбор" aria-label="Снять выбор">×</button>}
      </div>
      {gm && (B.canHide(t) || t.kind === 'f' || t.kind === 'o') && <div className="bt-info-act">
        {B.canHide(t) && <button type="button" className={'btn small' + (veiled ? ' primary' : ' ghost')} aria-pressed={veiled} onClick={() => act('btHide')}>{veiled ? 'Показать игрокам' : 'Скрыть от игроков'}</button>}
        {(t.kind === 'f' || t.kind === 'o') && <button type="button" className="link small danger" onClick={() => act('btRemove', { v: s })}>убрать с поля</button>}
      </div>}
      {t.kind !== 'o' && <Vitals board={board} t={t} gm={gm} at={v.at} />}
    </div>
  );
}

function Vitals({ board, t, gm, at }: { board: Any; t: Tok; gm: boolean; at: Any }) {
  const B = window.Battle, App = window.App, ui = useUi();
  const v = B.vitals(t), has = B.has as (x: unknown) => boolean;
  const num = gm || t.kind !== 'f';          // игроки видят у противника только полоску
  const ini = B.turnOn(board) ? (board.turn.order.find((e: Any) => e.id === B.tid(t)) || {}).ini : null;
  const reg = (r: number | null) => (num ? <span className="bt-reg" title="реген в ход">{has(r) ? `+${fmt(r)}` : '+?'}</span> : null);
  const row = (label: string, val: number | null, max: number | null, cls: string, tail?: ReactNode) => <>
    <span className="bt-vl">{label}</span>
    <span className={'bt-vbar ' + cls}>{max ? <i style={{ width: pct(val || 0, max) + '%' }} /> : null}</span>
    <span className="bt-vn">{num && <><b>{has(val) ? val : '?'}</b> / {has(max) ? max : '?'}</>}{tail}</span>
  </>;
  const seer = t.kind === 'h' || t.kind === 'a';
  const fz = B.fieldZor();
  const zParts = `${v.zb}${v.zm ? ` ${signed(v.zm)} у фишки` : ''}${fz ? ` ${signed(fz)} на поле` : ''}`;
  const Z = B.ZOR_PER_CELL;
  return <>
    <div className="bt-vit">
      {v.marm ? row('Броня', v.arm, v.marm, 'arm', v.arm <= 0 ? <> <span className="chip bad">разрушена</span></> : null) : null}
      {row('ХП', v.hp, v.mhp, 'hp', reg(v.rhp))}
      {row('МП', v.mp, v.mmp, 'mp', reg(v.rmp))}
    </div>
    <div className="bt-vit-sub small">
      {(t.kind !== 'f' || gm) && <span>ОД в ход <b>{v.od}</b></span>}
      {has(ini) && gm ? <label>инициатива <input key={ini} type="number" className="bt-mini" min={1} max={100} step={1} defaultValue={ini}
        onBlur={e => { if (+e.target.value !== ini) act('btIni', { k: B.tid(t) }, e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
        : has(ini) ? <span>инициатива <b>{ini}</b></span> : null}
      {seer && <span title={`зоркость ${v.zor}${v.zm || fz ? ` (${zParts})` : ''}`}>обзор <b>{B.radius(v)} кл.</b> <span className="muted">— зоркость {v.zor}{v.zm || fz ? ` (${zParts})` : ''}</span></span>}
      {seer && gm && <span className="bt-zor-ctl">
        <button type="button" className="btn ghost small" onClick={() => act('btZor', { v: String(-Z) })} title={`−${Z} зоркости: на 1 клетку меньше`}>−{Z}</button>
        <button type="button" className="btn ghost small" onClick={() => act('btZor', { v: String(Z) })} title={`+${Z} зоркости: на 1 клетку больше`}>+{Z}</button>
        {v.zm ? <button type="button" className="link small" onClick={() => act('btZor', { v: '0' })}>сбросить</button> : null}</span>}
    </div>
    {(gm || t.kind !== 'f') && <Resists t={t} gm={gm} />}
    <Statuses t={t} gm={gm} />
    {t.kind === 'h' && (t.o.twin || t.o.canClone) ? <div className="bt-twin small">
      {t.o.twin ? <p>Брат-близнец: <b>{t.o.twinName}</b>{t.o.twinDead ? ' — погиб (75% резиста к пси)' : t.o.twinUp ? ' — узы боли: 25% урона по ХП уходит ему' : ''}</p> : null}
      {gm && t.o.canClone && <div className="bt-btns"><button type="button" className="btn small ghost" onClick={() => act('btClone')}
        title="Дар «Исчезающий близнец»: раз в день — двойник героя (копия ХП, МП, брони и сопротивлений), встаёт рядом">Создать двойника</button></div>}
    </div> : null}
    {gm && <div className="bt-vit-ctl">
      <DmgKind t={t} at={at} />
      <div className="bt-btns bt-hit">
        <input type="number" min={1} step={1} className="bt-amt" value={ui.get('btAmt')} onChange={e => ui.set('btAmt', e.target.value)} placeholder="сколько" aria-label="Сколько" />
        <button type="button" className="btn small bt-dmg" onClick={() => act('btVit', { v: 'hp:-1' })} title="Урон выбранного типа: сопротивления, слабости, затем броня и ХП">Урон</button>
        <button type="button" className="btn small bt-heal" onClick={() => act('btVit', { v: 'hp:1' })}>Лечение</button>
      </div>
      {v.marm ? <div className="bt-btns">
        <button type="button" className="btn ghost small" onClick={() => act('btVit', { v: 'arm:-1' })} title="Снять прочность брони">−броня</button>
        <button type="button" className="btn ghost small" onClick={() => act('btVit', { v: 'arm:1' })} title="Прибавить прочность брони (не выше полной)">+броня</button>
        {v.arm < v.marm && <button type="button" className="link small" onClick={() => act('btArmFix')} title="Вернуть броне полную прочность">починить</button>}
      </div> : null}
      <div className="bt-btns">
        <button type="button" className="btn ghost small" onClick={() => act('btVit', { v: 'mp:-1' })}>−МП</button>
        <button type="button" className="btn ghost small" onClick={() => act('btVit', { v: 'mp:1' })}>+МП</button>
        {(has(v.rhp) || has(v.rmp)) && <button type="button" className="btn ghost small" onClick={() => act('btRegen')}
          title={`Добавить реген за ход: ХП ${has(v.rhp) ? '+' + fmt(v.rhp) : '—'}, МП ${has(v.rmp) ? '+' + fmt(v.rmp) : '—'} (не выше максимума)`}>+реген</button>}
      </div>
      {t.kind !== 'h' && <details className="bt-more" open={!!App.ui.btMore}>
        <summary onClick={e => { e.preventDefault(); act('btMoreToggle'); }}>задать вручную</summary>
        <div className="bt-btns">
          <button type="button" className="link small" onClick={() => act('btMax', { v: 'arm' })} title="Прочность брони; 0 — убрать броню">броню</button>
          <button type="button" className="link small" onClick={() => act('btMax', { v: 'hp' })}>макс. ХП</button>
          <button type="button" className="link small" onClick={() => act('btMax', { v: 'mp' })}>макс. МП</button>
          <button type="button" className="link small" onClick={() => act('btMax', { v: 'rhp' })}>реген ХП</button>
          <button type="button" className="link small" onClick={() => act('btMax', { v: 'rmp' })}>реген МП</button>
        </div>
        <p className="muted small">Число берётся из поля «сколько».</p>
      </details>}
    </div>}
  </>;
}

// ------------------------------------------------------------ тип и вид урона (js/resist.js)
function DmgKind({ t, at }: { t: Tok; at: Any }) {
  const ui = useUi(), Z = (window as Any).Resist, B = window.Battle;
  if (!Z) return null;
  // отражение (ГМ): уходит тому, кто бьёт — список только когда у цели есть отражение
  const refl = (B.resistOf(t) as Any[]).some(e => e.k === 'refl' && !e.cond);
  const foes: Any[] = refl ? B.attackers(at, B.tid(t)) : [];
  const from = ui.get('btFrom');
  const types: Any[] = Z.typeList();
  const type = ui.get('btDmgType') || 'физ', mode = ui.get('btDmgMode') || 'norm';
  const g = Z.groupOf(type), auto = Z.PIERCE.has(type);
  // подтипы физ урона (лист механик «урон»): несколько сразу — гибридное оружие («режуще-рубящий»)
  const subs = String(ui.get('btSub') || '').split(',').filter(Boolean);
  const togSub = (k: string) => ui.set('btSub', (subs.includes(k) ? subs.filter(x => x !== k) : subs.concat(k)).join(','));
  const grp = (k: string, label: string) => <optgroup label={label}>{types.filter(x => x.group === k).map(x => <option key={x.id} value={x.id}>{x.name}{x.pierce ? ' (сквозь броню)' : ''}</option>)}</optgroup>;
  return <div className="bt-btns bt-kind">
    <select className="sel" value={type} onChange={e => ui.set('btDmgType', e.target.value)} aria-label="Тип урона" title="Тип урона: от него зависят сопротивления и слабости цели">
      {grp('phys', 'Физический')}{grp('mag', 'Магия (символы)')}{grp('own', 'Не магия')}
    </select>
    <select className="sel" value={mode} onChange={e => ui.set('btDmgMode', e.target.value)} aria-label="Вид урона"
      title="Обычный — сопротивления, потом броня; сквозь броню — сопротивления, броня не задевается; чистый — мимо всего">
      <option value="norm">{auto ? 'сквозь броню (символ)' : 'обычный'}</option><option value="pierce">сквозь броню</option><option value="pure">чистый</option>
    </select>
    {g === 'mag' && mode !== 'pure' && <label className="check small" title="Урон этого заклинания не магический: считаются только сопротивления к самому типу, без маг резиста">
      <input type="checkbox" checked={!!ui.get('btNoMag')} onChange={e => ui.set('btNoMag', e.target.checked ? '1' : '')} /> не магия</label>}
    {refl && <select className="sel" value={foes.some(x => x.id === from) ? from : ''} onChange={e => ui.set('btFrom', e.target.value)} aria-label="Кто бьёт"
      title="У цели есть отражение: отражённый урон (от урона до сопротивлений, и при иммунитете тоже) уйдёт тому, кто бьёт">
      <option value="">кто бьёт? (для отражения)</option>
      {foes.map(x => <option key={x.id} value={x.id}>{x.n}{x.kind === 'h' ? ' (герой)' : x.kind === 'a' ? ' (союзник)' : ''}</option>)}
    </select>}
    {type === 'физ' && mode !== 'pure' && <div className="bt-sub" role="group" aria-label="Подтип физического урона">
      {B.physSubs().map((x: Any) => <button key={x.k} type="button" className={'bt-sub-b' + (subs.includes(x.k) ? ' is-on' : '')} aria-pressed={subs.includes(x.k)}
        onClick={() => togSub(x.k)} title={x.d || x.k}>{x.k}</button>)}
    </div>}
  </div>;
}

// состояния фишки (лист механик): плашки — у всех, наложить и снять — ГМ; защита от состояний — ГМ и своим
function Statuses({ t, gm }: { t: Tok; gm: boolean }) {
  const B = window.Battle, ui = useUi(), Z = (window as Any).Resist;
  const st: Any[] = B.stOf(t), list: Any[] = gm ? B.statusList() : [];
  const guard: Any[] = Z && (gm || t.kind !== 'f') ? Z.effSummary(B.resistOf(t)) : [];
  if (!st.length && !gm && !guard.length) return null;
  const k = ui.get('btStK') || (list[0] || {}).k || '', cur = list.find(x => x.k === k);
  const info = (z: Any) => (B.statusList().find((x: Any) => x.k === z.k) || {}).d || '';
  return <div className="bt-st small">
    <div><span className="muted">Состояния:</span> {st.length ? st.map((z: Any) => <span key={z.k} className={'eff' + (z.k === 'иммун к стану' ? ' plus' : ' minus')} title={info(z)}>
      {z.n}{z.v ? ` ${z.v}/ход` : ''}{B.has(z.x) ? ` · ${z.x} х.` : ''}
      {gm && <button type="button" className="bt-st-x" onClick={() => act('btStDel', { v: z.k })} title="Снять" aria-label={'Снять ' + z.n}>×</button>}
    </span>) : <span className="muted">нет</span>}</div>
    {guard.length ? <div><span className="muted">Защита от состояний:</span> {guard.map((x: Any) => <span key={x.key} className="eff plus" title={x.src.join('\n')}>{x.name}: {x.imm ? 'иммунитет' : `${x.pct}% (d100)`}</span>)}</div> : null}
    {gm && list.length ? <div className="bt-btns bt-st-add">
      <select className="sel" value={k} onChange={e => ui.set('btStK', e.target.value)} aria-label="Состояние" title={cur ? cur.d : ''}>
        {list.map(x => <option key={x.k} value={x.k}>{x.n}{x.dot ? ' (урон за ход)' : ''}</option>)}
      </select>
      {cur && cur.dot && <input type="number" min={1} step={1} className="bt-mini" value={ui.get('btStV')} onChange={e => ui.set('btStV', e.target.value)} placeholder="урон/ход" aria-label="Урон за ход" />}
      <input type="number" min={0} step={1} className="bt-mini" value={ui.get('btStX')} onChange={e => ui.set('btStX', e.target.value)} placeholder="ходов" aria-label="Сколько ходов" title="Пусто — пока не снимут" />
      <button type="button" className="btn small" onClick={() => act('btStAdd')} title="Иммунитет — не действует; процент сопротивления — бросок d100">Наложить</button>
    </div> : null}
    {gm && cur && cur.d ? <p className="muted">{cur.n}: {cur.d}</p> : null}
    {B.turnHints(t).map((h: string) => <p key={h} className="bt-st-hint">{h}</p>)}
    {gm && st.some((z: Any) => z.k === 'страх') && <div className="bt-btns"><button type="button" className="btn small ghost" onClick={() => act('btFlee')}
      title="Фишка отбегает к ближайшему краю поля, насколько хватает ОД этого хода">Бежать к краю</button></div>}
  </div>;
}

// сопротивления фишки: плашки (с наведением — откуда) и строка ГМ «в бою» на время (зелье, умение)
function Resists({ t, gm }: { t: Tok; gm: boolean }) {
  const B = window.Battle;
  const rz: Any[] = B.resistOf(t), line: string = B.resistLine(t);
  return <div className="bt-rz small">
    <div><span className="muted">Сопротивления:</span> <ResistChips entries={rz} /></div>
    {gm && <input key={B.tid(t) + ':' + line} type="text" className="bt-rz-in" defaultValue={line} aria-label="Сопротивления в бою"
      placeholder="в бою: огонь 25%, физ 50е, молния 2х, иммун яд, вода в хил"
      title="На время боя (зелье, умение): тип и число через запятую или «/» — % или «е» (единицы), «2х» — слабость, «иммун …», «вода в хил» / «молния в ману» — урон этого типа лечит, «отражение 30% звук» — часть урона уходит тому, кто бьёт"
      onBlur={e => act('btRes', {}, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    {gm && <ResistConds entries={rz} />}
  </div>;
}

// ------------------------------------------------------------ все на поле: броня, ХП, МП, реген, ОД, обзор
function Roster({ v, gm }: { v: Any; gm: boolean }) {
  const B = window.Battle, App = window.App;
  const toks: Tok[] = [...v.at.values()].filter((t: Tok) => (t.kind === 'h' || t.kind === 'a' || (t.kind === 'f' && gm)) && !(B.hid(t) && B.veil()));
  if (!toks.length) return null;
  const rank: Record<string, number> = { h: 0, a: 1, f: 2 };
  toks.sort((p, q) => rank[p.kind] - rank[q.kind] || B.tname(p).localeCompare(B.tname(q), 'ru'));
  const open = !!App.ui.btRoster;
  const n = (val: unknown, max: unknown) => `${B.has(val) ? val : '?'} / ${B.has(max) ? max : '?'}`;
  const r = (x: number | null) => (B.has(x) ? '+' + fmt(x) : '?');
  return (
    <div className="bt-roster">
      <button type="button" className="link small" aria-expanded={open} onClick={() => act('btRoster')}>{open ? '▾' : '▸'} Броня, ХП, МП и реген у всех на поле</button>
      {open && <>
        <div className="bt-roster-wrap"><table className="bt-roster-t">
          <thead><tr><th>Кто</th><th>броня</th><th>ХП</th><th>реген ХП</th><th>МП</th><th>реген МП</th><th>ОД</th><th>обзор</th></tr></thead>
          <tbody>{toks.map(t => {
            const vt = B.vitals(t);
            return <tr key={B.tid(t)} className={'k-' + t.kind + (B.isDown(t) ? ' down' : '') + (B.hid(t) ? ' hid' : '')}>
              <th scope="row"><button type="button" className="link" onClick={() => act('btSel', { v: B.tid(t) })}>{B.tname(t)}</button>{B.hid(t) && <> <span className="chip bad">скрыт</span></>}</th>
              <td>{vt.marm ? n(vt.arm, vt.marm) : '—'}</td><td>{n(vt.hp, vt.mhp)}</td><td>{r(vt.rhp)}</td><td>{n(vt.mp, vt.mmp)}</td><td>{r(vt.rmp)}</td><td>{vt.od}</td>
              <td>{t.kind === 'f' ? '—' : `${B.radius(vt)} кл.`}</td></tr>;
          })}</tbody>
        </table></div>
        <p className="muted small">Реген — сколько восстанавливается за ход: у героя — из его расчёта, у противника и союзника — тело / 5 и дух / 5 (+ реген расы), ГМ может задать сам. Броня — прочность надетой брони героя; противнику и союзнику её задаёт ГМ. Урон сначала идёт в броню, остаток — в ХП.</p>
      </>}
    </div>
  );
}

// ------------------------------------------------------------ союзники отряда (страница кампании)
export function Allies({ gm, heroes, allies, save }: { gm: boolean; heroes: { id: string; name: string }[]; allies: Any[]; save: (l: Any[]) => unknown }) {
  const B = window.Battle, ui = useUi();
  B.setParty({ gm, heroes, allies, save });
  const list = allies.filter(a => gm || !(a.hid && !a.of));       // скрытого ГМ союзника игроки не видят и здесь
  if (!list.length && !gm) return null;
  const heroName = (id: string) => (heroes.find(h => h.id === id) || { name: '' }).name;
  return (
    <section className="card wstack bf-allies">
      <div className="cp-sec"><h2 className="h-sec">Союзники отряда</h2>{list.length > 0 && <span className="chip">{list.length}</span>}</div>
      {list.length ? <ul className="bf-ally-list">{list.map(a => {
        const pic = B.foePic(a.src || a.n);
        return <li key={a.i} className="bf-ally">
          {pic ? <span className="bf-ally-pic"><img src={pic} alt="" loading="lazy" decoding="async" /></span> : <span className="bf-ally-pic ini" aria-hidden="true">{B.initials(a.n)}</span>}
          <span className="bf-ally-body"><b>{a.n}</b>
            <span className="small">{cap(B.allyKind(a))}{a.of && heroName(a.of) ? ` героя ${heroName(a.of)}` : ' отряда'}{a.lvl ? `, ур. ${fmt(a.lvl)}` : ''}</span>
            {a.src && window.Rules.norm(a.src) !== window.Rules.norm(a.n) && <span className="small muted">{cap(a.src)}</span>}
            {a.hid && !a.of && <span className="chip bad">скрыт от игроков</span>}
            {gm && <button type="button" className="link small danger" onClick={() => act('alDel', { v: a.i })}>убрать из отряда</button>}
          </span>
        </li>;
      })}</ul> : <p className="muted small">Союзников пока нет: питомцы, призванные существа, фамильяры и НПС появятся здесь и на поле боя.</p>}
      {gm && <details className="bt-new">
        <summary>Добавить союзника</summary>
        <div className="fgrid bt-form">
          <label className="fld"><span className="fld-l">Кто</span><input type="text" list="alCreatures" value={ui.get('alName')} onChange={e => ui.set('alName', e.target.value)} placeholder="существо, раса или своё" /></label>
          <label className="fld"><span className="fld-l">Имя</span><input type="text" value={ui.get('alNick')} onChange={e => ui.set('alNick', e.target.value)} maxLength={60} placeholder="кличка (необязательно)" /></label>
          <label className="fld"><span className="fld-l">Вид</span>
            <select className="sel" value={ui.get('alKind') || 'pet'} onChange={e => ui.set('alKind', e.target.value)}>
              {Object.entries(B.ALLY_KINDS as Record<string, [string, string]>).filter(([k]) => k !== 'clone').map(([k, d]) => <option key={k} value={k}>{cap(d[0])}</option>)}
            </select></label>
          <label className="fld"><span className="fld-l">Чей</span>
            <select className="sel" value={ui.get('alOf')} onChange={e => ui.set('alOf', e.target.value)}>
              <option value="">всего отряда</option>
              {heroes.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select></label>
          <label className="fld"><span className="fld-l">Уровень</span><input type="number" min={0} step={1} value={ui.get('alLvl')} onChange={e => ui.set('alLvl', e.target.value)} placeholder="по таблице" /></label>
        </div>
        <div className="row bt-gen"><button type="button" className="btn small primary" onClick={() => { act('alAdd'); ui.set('alName', ''); }}>Добавить в отряд</button></div>
        <ul className="small muted bf-ally-rules">{Object.values(B.ALLY_KINDS as Record<string, [string, string]>).map(([t, d]) => <li key={t}><b>{cap(t)}</b> — {d}</li>)}</ul>
        <p className="muted small">Союзника героя игрок может сам двигать на поле боя.</p>
        <Creatures id="alCreatures" />
      </details>}
    </section>
  );
}
