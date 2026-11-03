import { act, C, Empty, fmt, R, set, signed, type Any, type StepProps } from './kit';

/* Шаг 2 — возраст: категория карточками, точный процент ползунком, что из этого выходит — крупными числами */
export default function Age({ st, res }: StepProps) {
  const race = res.race;
  return (
    <div className="wstack">
      <div className="age-grid">
        {R().AGES.map((a: Any) => (
          <button key={a.id} type="button" className={'age-card' + (st.ageCat === a.id ? ' is-on' : '')} aria-pressed={st.ageCat === a.id} onClick={() => act('pickAge', { id: a.id })}>
            <b>{a.title}</b>
            <span className="age-range">{a.range}</span>
            <span className="age-fx">{a.buff}</span>
            <span className="age-lim">{a.limit}</span>
          </button>
        ))}
      </div>
      {!race ? <Empty>Сначала выберите расу: возраст считается от её среднего уровня.</Empty> : res.ageStart && <AgeCalc res={res} />}
    </div>
  );
}

function AgeCalc({ res }: { res: Any }) {
  const rg = C().AGE_RANGES[res.ageStart.id];
  const pts = res.agePoints;
  return (
    <div className="card wstack">
      {rg.min !== rg.max ? (
        <label className="range">
          <span>Отклонение от среднего уровня расы: <b>{signed(res.agePct)}%</b></span>
          <input type="range" min={rg.min} max={rg.max} step={1} value={res.agePct} onChange={e => set('agePct', +e.target.value)} aria-label="Процент от среднего уровня" />
          <span className="range-ends"><span>{signed(rg.min)}%</span><span>{signed(rg.max)}%</span></span>
        </label>
      ) : rg.min === 0 ? <p>Взрослый — ровно средний уровень расы, без изменения очков.</p>
        : <p>{res.ageStart.title} — фиксированно <b>{signed(rg.min)}%</b> к среднему уровню расы{res.ageStart.id === 'старец' ? ' (это верхняя граница возраста)' : ''}.</p>}
      <dl className="bignums">
        <div><dt>Средний уровень расы</dt><dd>{fmt(res.lvl0)}</dd></div>
        <div className="hi"><dt>Уровень героя</dt><dd>{fmt(res.level)}</dd></div>
        <div><dt>{pts >= 0 ? 'Очки характеристик' : 'Очки к снятию'}</dt><dd>{pts >= 0 ? '+' : '−'}{fmt(Math.abs(pts))}</dd></div>
        <div><dt>Очки талантов</dt><dd>{res.talentPoints}</dd></div>
      </dl>
      <details className="more">
        <summary>Как это посчитано</summary>
        <p className="muted small">Уровень: {fmt(res.lvl0)} × {signed(res.agePct)}% → {fmt(res.level)} (округляется до целого). Очки: 3 × ({fmt(res.level)} − {fmt(res.lvl0)}) = {signed(pts)}; всего характеристик станет на {fmt(Math.abs(pts))} {pts >= 0 ? 'больше' : 'меньше'} расовых. Таланты: ⌊{fmt(res.level)} / 5⌋ = {res.talentPoints}. ОД от возраста: {signed(res.ageStart.od)}. Черт: до {res.ageStart.traits} положительных и {res.ageStart.traits} отрицательных.</p>
      </details>
    </div>
  );
}
