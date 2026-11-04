import { act } from '../../lib/legacy';
import { fmt, type Any } from '../create/kit';
import { BrewForm } from '../brew/BrewForm';
import { CraftForm } from './CraftForm';
import { useUi } from './gearKit';

/*
 * Персонаж кампании на «Снаряжении»: передача предметов другим персонажам и «Создать самому» у игрока.
 * Передача — в два шага (отдающий пишет give в своего персонажа, получатель принимает в got); действия — invGive, invGiveBack,
 * invTake из js/inventory.js. Создание — invMake (кузница) и invMakeBrew (кухня и зелья): сырьё списывается из рюкзака.
 */
type Perms = { gm?: boolean; owner?: boolean };

/** «Передача предметов»: что передают этому персонажу и что он отдал, пока не приняли */
export function Transfers({ perms }: { perms: Perms }) {
  const I = window.Inv;
  const t = I.transfers();
  if (!t || (!t.inc.length && !t.out.length)) return null;
  const can = !!(perms.gm || perms.owner);
  return (
    <section className="card wstack gr-give">
      <h2>Передача предметов</h2>
      {t.inc.length > 0 && <>
        <h3>Вам передают</h3>
        <ul className="hp-list">{t.inc.map(({ g, from }: Any) => (
          <li key={g.t}><span>{I.giveLabel(g)} от <b>{I.heroName(from)}</b></span>
            {can && <button type="button" className="btn small primary" onClick={() => act('invTake', { v: g.t, from: from.id })}>Принять</button>}</li>
        ))}</ul>
      </>}
      {t.out.length > 0 && <>
        <h3>Ждут, пока примут</h3>
        <ul className="hp-list">{t.out.map(({ g, to }: Any) => (
          <li key={g.t}><span>{I.giveLabel(g)} → <b>{to ? I.heroName(to) : (g.toName || 'персонаж удалён')}</b></span>
            {can && <button type="button" className="btn small ghost" onClick={() => act('invGiveBack', { v: g.t })}>Отменить</button>}</li>
        ))}</ul>
        <p className="muted small">Пока передачу не приняли, вещи нет ни у кого из двоих; отмена возвращает её обратно.</p>
      </>}
    </section>
  );
}

/** «Передать» в карточке предмета: кому (персонажи кампании в игре) и сколько из стопки */
export function GiveRow({ it, perms }: { it: Any; perms: Perms }) {
  const I = window.Inv, ui = useUi();
  const t = I.transfers();
  if (!t || !(perms.gm || perms.owner) || !t.to.length) return null;
  const n = +it.qty || 1;
  return (
    <div className="hp-row gr-give-row">
      <label className="winline">Передать
        <select className="sel gr-sel" value={ui.get('invGiveTo')} onChange={e => ui.set('invGiveTo', e.target.value)} aria-label="Кому передать">
          <option value="">— кому —</option>
          {t.to.map((ch: Any) => <option key={ch.id} value={ch.id}>{I.heroName(ch)}{ch.ownerName ? ` (игрок ${ch.ownerName})` : ''}</option>)}
        </select></label>
      {n > 1 && <label className="winline">сколько <input type="number" className="gr-num" min={1} max={n} step={1} value={ui.get('invGiveN') || String(n)} onChange={e => ui.set('invGiveN', e.target.value)} /></label>}
      <button type="button" className="btn small" onClick={() => act('invGive', { v: it.id })}>Передать</button>
    </div>
  );
}

/** игрок: «Создать самому» — кузница или кухня и зелья из сырья в рюкзаке, если есть крафтильня и хватает навыка */
export function MakeCard({ rec, v }: { rec: Any; v: Any }) {
  const I = window.Inv, App = window.App, ui = useUi();
  const st = I.stationsOf(rec, v), al = I.alchLevel(rec), ch = I.skillChances(v, rec);
  const mode = App.ui.invMake || 'forge';
  const luck = (mode === 'forge'
    ? [ch.craft.half ? `ремесло ${fmt(ch.craft.lvl)} — ${fmt(ch.craft.half)}% потратить вдвое меньше материала` : '', ch.craft.free ? `${fmt(ch.craft.free)}% — не потратить вовсе` : '']
    : [ch.cook.two ? `кулинария ${fmt(ch.cook.lvl)} — ${fmt(ch.cook.two)}% получить 2 блюда вместо 1` : '', ch.cook.ziv2 ? 'все блюда — с удвоенной живостью' : '', ch.alch.three ? `алхимия ${fmt(ch.alch.lvl)} — ${fmt(ch.alch.three)}% получить 3 зелья вместо 1` : '']).filter(Boolean);
  if (mode !== 'forge') window.Brew.draft().zivX2 = ch.cook.ziv2;      // кулинария на максимуме: в расчёте живость уже удвоена
  return (
    <section className="card wstack gr-make" id="invMake">
      <h2>Создать самому</h2>
      <p className="small">Крафтильни: {st.all.length ? st.all.map((n: string) => <span key={n} className="chip">{n}</span>) : <span className="muted">пока нет — их отмечает ГМ (своя мастерская или крафтильня рядом)</span>}
        {' '}· ремесло <b>{fmt(v.ctx.craft)}</b>{al !== null && <> · алхимия <b>{fmt(al)}</b></>}</p>
      <p className="muted small">Сырьё берётся из рюкзака и списывается сразу, созданное появляется в рюкзаке; ГМ видит это в журнале.</p>
      <div className="gr-modes" role="tablist">
        {[['forge', 'Кузница'], ['brew', 'Кухня и зелья']].map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={k === mode} className={k === mode ? 'is-on' : ''} onClick={() => ui.set('invMake', k)}>{t}</button>)}
      </div>
      {luck.length > 0 && <p className="small gr-luck">Шансы навыков (бросает сайт): {luck.join(' · ')}</p>}
      {mode === 'forge' ? <CraftForm v={v} make />
        : <BrewForm opts={{ host: 'dev', issueAct: 'invMakeBrew', issueLabel: 'Приготовить', ings: I.bagIngs(v), noHerbs: true, noCuts: true, autoRoll: true, known: I.knownProps(rec),
          check: (d, r) => I.brewNeeds(v, d, r), empty: 'В рюкзаке нет ингредиентов — их выдаёт ГМ: травы, добыча, покупки.' }} />}
    </section>
  );
}
