import { useState, type ReactNode } from 'react';
import { act, Empty, fmt, R, Sel, set, signed, Stepper, type Any, type StepProps } from './kit';

/* Шаг 5 — характеристики: очки возраста по пяти характеристикам карточками, ниже — что из них выходит (ХП, МП, ОД…) */
export default function Stats({ res }: StepProps) {
  const [step, setStep] = useState(1);
  const Rr = R();
  if (!res.race) return <Empty>Сначала выберите расу.</Empty>;
  if (!res.ageStart) return <Empty>Сначала выберите возраст — от него зависит количество очков.</Empty>;
  const pts = res.agePoints, left = pts - res.allocSum;
  return (
    <div className="wstack">
      <div className="alloc-head card">
        <p>{pts > 0 ? <>Возраст даёт <b>+{pts}</b> очков: распределите их по характеристикам.</>
          : pts < 0 ? <>Юный возраст забирает <b>{-pts}</b> очков: снимите их с характеристик (не ниже 1).</>
            : 'Взрослый: дополнительных очков нет.'}</p>
        {pts !== 0 && <p className={'left ' + (left ? 'attn' : 'done')}>{left ? `Осталось: ${signed(left)}` : 'Все очки распределены'}</p>}
        {pts !== 0 && (
          <div className="row">
            {Math.abs(pts) > 10 && <label className="inline">Шаг <Sel value={step} onChange={v => setStep(+v)} options={[1, 5, 10, 25, 50].map(n => ({ v: n, t: String(n) }))} label="Шаг кнопок" /></label>}
            <button type="button" className="btn ghost small" onClick={() => act('allocEven')}>Поровну</button>
            <button type="button" className="btn ghost small" onClick={() => act('allocReset')}>Сбросить</button>
          </div>
        )}
      </div>
      <div className="stat-cards">
        {Rr.STATS.map((k: string) => {
          const base = res.baseStats[k], a = +res.alloc[k] || 0, fin = res.stats[k];
          const mods = res.statBreak[k].slice(1).filter((x: Any) => x.src !== 'очки возраста');
          const modSum = fin - base - a;
          const min = pts >= 0 ? 0 : Math.min(0, 1 - base);
          const max = pts >= 0 ? a + Math.max(0, left) : 0;
          return (
            <div key={k} className="stat-card">
              <div className="sc-head"><b>{Rr.STAT_NAMES[k]}</b><span className="sc-fin" title="Итог">{fmt(fin)}</span></div>
              <div className="sc-row"><span className="muted">Раса</span><span>{fmt(base)}</span></div>
              {pts !== 0 && <div className="sc-row"><span className="muted">Очки</span><Stepper value={a} min={min} max={max} step={step} label={Rr.STAT_NAMES[k]} onChange={v => set('alloc.' + k, v)} /></div>}
              {mods.length ? (
                <details className="sc-mods"><summary>Модификаторы {signed(modSum)}</summary>
                  <ul>{mods.map((m: Any, i: number) => <li key={i}>{m.src}: {m.op.startsWith('×') || m.op === '⇄' || m.op === '↑' ? m.op + ' ' : ''}{signed(m.v)}</li>)}</ul>
                </details>
              ) : <div className="sc-row"><span className="muted">Модификаторы</span><span className="muted">нет</span></div>}
            </div>
          );
        })}
      </div>
      <Derived res={res} />
    </div>
  );
}

/** производные параметры — всё, что считается из характеристик */
export function Derived({ res }: { res: Any }) {
  const d = res.der, Rr = R();
  const anc = res.race && res.race.ancestor && res.race.ancestor.fx && res.race.ancestor.fx.hp;
  const items: [string, ReactNode, string, string?][] = [
    ['ХП', fmt(d.hp), (res.boon && res.boon.fx.void ? '«пустотный»: ХП = дух' : 'тело × 2') + (anc ? ` + ${anc} (предок)` : '')],
    ['Живость', d.viv === null ? '—' : fmt(d.viv), d.viv === null ? 'не нужно есть и спать' : 'тело × 1 (живость = голод)'],
    ['Реген ХП', fmt(d.hpRegen), d.hpRegenSrc.join(', ')],
    ...(d.vamp ? [['Вампиризм', d.vamp + '%', d.vampSrc] as [string, string, string]] : []),
    ['МП', fmt(d.mp), 'дух × 2'],
    ['Пси', fmt(d.psi), 'дух × 2'],
    ['Реген МП', fmt(d.mpRegen), d.mpRegenSrc.join(', ')],
    ['ОД в ход', <>{Rr.odText(d)}{d.odMod ? <span className="muted small"> = {d.odTotal}</span> : null}</>, `база ${d.odBase}; ` + d.odSrc.join(', '),
      d.odCond.length ? 'Условно: ' + d.odCond.map((f: Any) => signed(f.v)).join(', ') + ' (в воде / на суше и т.п.)' : ''],
    ['Уворот', fmt(d.dodge), 'ловкость − штраф брони ± материал'],
    ['Слоты', `${fmt(d.slotsUsed)} / ${fmt(d.slots)}`, 'сила + сумки; каждый предмет — 1 слот'],
    ['Зоркость', fmt(d.zor), 'база 50 + талант + бонусы'],
    ['Харизма', fmt(d.charisma), 'талант + бонусы; 0,5% скидки за очко'],
    ['Привлекательность', signed(d.attr), d.attrSrc.join(', ') || 'нет модификаторов', '±25 от характера НПС, ±25 за мировоззрение, +15 своя раса, +10 религия, +10 фракция'],
    ['Карма', signed(d.karma), Rr.KARMA_TEXT],
    ['Молитвы в день', d.prayers, d.prayersSrc.join(', ')],
    ['Ячейки заклинаний', d.spellSlots, d.spellSlotsSrc.join(', ')],
    ['Размер', res.size ? res.size.name : '—', res.size ? `${res.size.fx}; сырьё ${res.size.mat}${res.sizeMods.length ? '; ' + res.sizeMods.join(', ') : ''}${res.flags.noSizeDebuff ? '; нет дебафа от роста' : ''}` : ''],
  ];
  return (
    <section className="wstack tight">
      <h2 className="h-sec">Что из этого выходит</h2>
      <dl className="der-grid">
        {items.map(([t, v, src, note]) => (
          <div key={t} className="der"><dt>{t}</dt><dd>{v}</dd>{src && <p className="muted small">{src}</p>}{note && <p className="small">{note}</p>}</div>
        ))}
      </dl>
    </section>
  );
}
