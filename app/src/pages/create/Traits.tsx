import { useState, type ReactNode } from 'react';
import { act, CalcMark, cap, D, DmgList, Empty, Field, norm, R, RollBox, Search, Seg, Sel, set, Stepper, Warn, type Any, type Opt, type StepProps } from './kit';
import { Icon } from '../../ui/Icon';

/* Шаг 4 — черты: счётчики лимитов и баланса, положительные и отрицательные (на телефоне — вкладками), параметры выбранных */
export default function Traits({ st, res }: StepProps) {
  const [side, setSide] = useState<'pos' | 'neg'>('pos');
  const [q, setQ] = useState('');
  const ti = res.traits, age = res.ageStart, Rr = R(), S = D().skills;
  if (!age) return <Empty>Сначала выберите возраст: от него зависит, сколько черт можно взять.</Empty>;
  const all: string[] = ti.pos.concat(ti.neg);
  const chosen = new Set(all);
  const count = (k: string) => all.filter(x => x === k).length;
  const nq = norm(q);

  const col = (list: Any[], kind: 'pos' | 'neg') => list.filter(t => !nq || norm(`${t.name} ${t.effect}`).includes(nq)).map(t => {
    const k = norm(t.name);
    const n = count(k), on = n > 0;
    const fx = Rr.TRAIT_FX[k] || {};
    const full = (kind === 'pos' && ti.pos.length >= ti.limitPos) || (kind === 'neg' && ti.neg.length >= ti.limitNeg);
    let reason = '';
    if (!on) {
      if (age.traits === 0) reason = 'недоступно ребёнку';
      else if (full) reason = kind === 'pos' ? 'лимит положительных' : 'лимит отрицательных';
      else if (fx.opp && chosen.has(norm(fx.opp))) reason = `противоположна «${fx.opp}»`;
      else if (Object.entries(Rr.TRAIT_FX).some(([kk, f]: [string, Any]) => f.opp && norm(f.opp) === k && chosen.has(kk))) reason = 'противоположна выбранной';
      if (k === 'проклят' && res.race && res.race.id === 'гомункулы') reason = 'гомункулам нельзя';
    }
    const w = fx.weight ? <CalcMark>×{fx.weight}</CalcMark> : k === 'калека' ? <CalcMark>×2 за конечность</CalcMark> : null;
    const rep = on && Rr.traitRepeatable(k);
    return (
      <div key={t.name} className={'trait ' + kind + (on ? ' is-on' : '') + (reason ? ' is-off' : '')}>
        <button type="button" className="tr-main" disabled={!!reason} aria-pressed={on} title={on ? 'Убрать черту' : 'Взять черту'} onClick={() => act('toggleTrait', { name: t.name })}>
          <span className="tr-box" aria-hidden="true">{on && <Icon name="check" />}</span>
          <span className="tr-body">
            <span className="tr-name">{cap(t.name.trim())} {w}{n > 1 && <span className="tr-n">×{n}</span>}</span>
            <span className="tr-fx">{t.effect}</span>
            {reason && <span className="tr-why">{reason}</span>}
          </span>
        </button>
        {rep && (
          <span className="stp mini" role="group" aria-label={`Сколько раз взять «${t.name.trim()}»`}>
            <button type="button" onClick={() => act('traitCount', { name: t.name, d: '-1' })} aria-label="Взять на раз меньше">−</button>
            <output>{n}</output>
            <button type="button" onClick={() => act('traitCount', { name: t.name, d: '1' })} disabled={full} aria-label="Взять ещё раз">+</button>
          </span>
        )}
      </div>
    );
  });

  const balance = ti.pos.length > ti.balanceCap ? 'bad' : ti.pos.length === ti.balanceCap ? 'good' : '';
  return (
    <div className="wstack">
      {age.traits === 0 && <Warn err>Ребёнок не может брать положительные и отрицательные черты на старте.</Warn>}
      <div className="meter">
        <div className={ti.pos.length > ti.limitPos ? 'bad' : ''}><span>Положительные</span><b>{ti.pos.length} / {ti.limitPos}</b></div>
        <div className={ti.neg.length > ti.limitNeg ? 'bad' : ''}><span>Отрицательные</span><b>{ti.neg.length} / {ti.limitNeg}</b></div>
        <div className={balance}><span>Баланс: положит. / уравновешено</span><b>{ti.pos.length} : {ti.balanceCap}</b></div>
      </div>
      <details className="more">
        <summary>Как работает баланс черт</summary>
        <p className="muted small">Возраст «{age.title.toLowerCase()}»: до {age.traits} каждого типа. Каждая положительная черта уравновешивается отрицательной; «немота» и «обычный» уравновешивают 2 положительных, «проклят» — 3, «калека» — 2 за каждую конечность (и на столько же расширяют лимит положительных).{ti.freeSrc.length ? ' Свободные положительные: ' + ti.freeSrc.join(', ') + '.' : ''} Противоположные черты (сильный / слабый и т.п.) взять вместе нельзя. Большинство черт можно взять несколько раз — «−» и «+» у выбранной черты, эффекты складываются.</p>
      </details>
      <Search value={q} onChange={setQ} placeholder="Поиск черты по названию и эффекту" />
      <div className="only-narrow">
        <Seg value={side} onChange={setSide} label="Какие черты" items={[
          { id: 'pos', t: <>Положительные <small>{ti.pos.length}/{ti.limitPos}</small></> },
          { id: 'neg', t: <>Отрицательные <small>{ti.neg.length}/{ti.limitNeg}</small></> },
        ]} />
      </div>
      <div className="traits2" data-side={side}>
        <section className="t-pos"><h2 className="h-sec">Положительные</h2><div className="trait-list">{col(S.traitsPos, 'pos')}</div></section>
        <section className="t-neg"><h2 className="h-sec">Отрицательные</h2><div className="trait-list">{col(S.traitsNeg, 'neg')}</div></section>
      </div>
      <TraitOptions st={st} res={res} chosen={chosen} count={count} />
    </div>
  );
}

function TraitOptions({ st, res, chosen, count }: StepProps & { chosen: Set<string>; count: (k: string) => number }) {
  const Rr = R(), to = st.traitOpt || {};
  // у черты, взятой несколько раз, параметр на каждый экземпляр (resist, resist2…)
  const times = (k: string, f: (key: (b: string, i: number) => string, i: number, nn: string) => ReactNode) =>
    Array.from({ length: count(k) }, (_, i) => <div key={i}>{f(Rr.optKey, i, count(k) > 1 ? ` №${i + 1}` : '')}</div>);
  const opts: ReactNode[] = [];
  if (chosen.has('калека')) opts.push(
    <div className="opt" key="cripple"><h3>Калека</h3>
      <p className="muted small">За каждую убранную конечность — +2 очка положительных черт. Убранные руки уменьшают число рук для оружия (сейчас рук: {res.hands} из {res.handsBase}).</p>
      <div className="fgrid">
        <Field label="Убрать рук"><Stepper value={to.arms || 0} min={0} max={res.handsBase} label="Убрать рук" onChange={v => set('traitOpt.arms', v)} /></Field>
        <Field label="Убрать ног"><Stepper value={to.legs || 0} min={0} max={2} label="Убрать ног" onChange={v => set('traitOpt.legs', v)} /></Field>
      </div>
    </div>);
  const textOpt = (k: string, base: string, title: string) => chosen.has(k) && opts.push(
    <div className="opt" key={k}><h3>{title}{count(k) > 1 ? ' (за каждую черту; одинаковые складываются)' : ''}</h3>
      {times(k, (key, i, nn) => <input type="text" list="dmgTypes" value={to[key(base, i)] || ''} onChange={e => set('traitOpt.' + key(base, i), e.target.value, true)} placeholder={'эффект или тип урона' + nn} aria-label={title + nn} />)}
    </div>);
  textOpt('резистентный', 'resist', 'Резистентный: +10% сопротивления');
  textOpt('уязвимый', 'vuln', 'Уязвимый: −10% сопротивления');
  if (chosen.has('тайное знание')) {
    const syms: Opt[] = [{ v: '', t: '— символ —' }, ...D().skills.symbols.map((s: Any) => ({ v: s.name, t: `${s.name} (${s.req})`, group: cap(s.cat) })).sort((a: Opt, b: Opt) => String(a.group).localeCompare(String(b.group)))];
    opts.push(<div className="opt" key="secret"><h3>Тайное знание: любой магический символ со старта</h3>
      {times('тайное знание', (key, i) => <Sel value={to[key('secretSymbol', i)]} options={syms} onChange={v => set('traitOpt.' + key('secretSymbol', i), v)} label="Символ" />)}</div>);
  }
  if (chosen.has('проклят')) opts.push(
    <div className="opt" key="curse"><h3>Проклят: неснимаемое проклятие</h3>
      <p className="muted small">Бросок 50/50: верхний блок (тёмные дары как проклятие) или нижний (проклятия).</p>
      {times('проклят', (key, i, nn) => <RollBox kind={key('curse', i)} label={'проклятие' + nn} st={st} />)}</div>);
  if (!opts.length) return null;
  return <div className="card wstack"><h2>Параметры выбранных черт</h2>{opts}<DmgList /></div>;
}
