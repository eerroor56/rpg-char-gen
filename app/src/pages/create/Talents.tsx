import { D, Empty, fmt, R, set, signed, Stepper, type Any, type StepProps } from './kit';

/* Шаг 6 — таланты: очко за каждые 5 уровней; карточка на талант — вложено, бонусы, итог и предел, что даёт */
export default function Talents({ res }: StepProps) {
  if (!res.race || !res.ageStart) return <Empty>Сначала выберите расу и возраст.</Empty>;
  const left = res.talentPoints - res.talentSpent;
  const info: Any[] = D().skills.talentInfo || [];
  const passives = (res.race.fx || []).filter((f: Any) => f.k === 'passive');
  return (
    <div className="wstack">
      <div className="alloc-head card">
        <p>За каждые 5 уровней — 1 очко таланта: ⌊{fmt(res.level)} / 5⌋ = <b>{res.talentPoints}</b>.</p>
        <p className={'left ' + (left ? 'attn' : 'done')}>{left > 0 ? `Осталось: ${left}` : left < 0 ? `Перерасход: ${-left}` : 'Все очки распределены'}</p>
      </div>
      <div className="tal-list">
        {R().TALENTS.map((t: Any) => {
          const v = res.talents[t.id];
          const p = info.find(x => x.name === t.id);
          const max = Math.min(v.maxInv, v.inv + Math.max(0, left));
          const top = p && (p.top || p.chance) && (p.top || /сотом/i.test(p.chance)) ? p.top || p.chance : '';
          return (
            <div key={t.id} className={'tal' + (v.blocked ? ' is-off' : '') + (v.inv ? ' is-on' : '')}>
              <div className="tal-head">
                <b>{t.name}{t.base ? <span className="muted small"> (база {t.base})</span> : null}</b>
                {/* у таланта с базой (зоркость) предел — у вложенных очков, он показан ниже; «70 / 50» в заголовке путал */}
                <span className="tal-tot">{fmt(v.total)}{!v.sepBase && <span className="muted small"> / {v.cap}</span>}</span>
              </div>
              {p && <p className="small tal-fx">{p.effect}{top && <><br /><span className="muted">{/сотом/i.test(top) ? '' : 'На максимальном уровне: '}{top}</span></>}</p>}
              <div className="tal-ctl">
                {v.blocked ? <span className="muted small">запрещено «Ярким оком»</span>
                  : <Stepper value={v.inv} min={0} max={max} label={t.name} onChange={n => set('talents.' + t.id, n)} />}
                {v.bsrc.length > 0 && <span className="muted small">бонусы: {v.bsrc.join(', ')}</span>}
                {v.sepBase && <span className="muted small">{v.base} база + {fmt(v.inv)} вложено{v.bonus ? ` ${signed(v.bonus)} бонусы` : ''}; вложить до {v.cap}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {passives.length > 0 && <p className="note small">Расовые пассивные навыки вне талантов: {passives.map((f: Any) => `${f.id} +${f.v}${f.half ? ' (½)' : ''}`).join(', ')}.</p>}
      <p className="muted small">Остальные пассивные навыки (алхимия, кузнечество, следопытство…) на старте не выбираются — их изучают уже в игре.</p>
    </div>
  );
}
