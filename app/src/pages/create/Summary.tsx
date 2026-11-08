import { act, type StepProps } from './kit';
import { Icon } from '../../ui/Icon';
import { Checks, Sheet, SheetTools, type SheetOpts } from '../sheet/Sheet';
import { DevBlock } from '../sheet/DevBlock';

/* Шаг 9 — лист персонажа: проверка правил, переброс частей, лист (с развитием, если герой уже в игре) */
const PARTS: [string, string][] = [['race', 'Раса'], ['age', 'Возраст'], ['boon', 'Дар'], ['traits', 'Черты'], ['stats', 'Характеристики'], ['talents', 'Таланты'], ['gear', 'Снаряжение'], ['story', 'Имя и история']];

export default function Summary({ st, res }: StepProps) {
  const live = liveSheet(st);
  return (
    <div className="wstack">
      {window.RandomHero && st.raceId && (
        <div className="card reroll">
          <p><b>Перебросить случайно</b> <span className="muted small">— меняется только выбранная часть; что от неё зависит и сломалось — пересоберётся само</span></p>
          <div className="row">
            {PARTS.map(([id, t]) => <button key={id} type="button" className="btn ghost small" onClick={() => act('randomStep', { step: id })}><Icon name="dice" />{t}</button>)}
            <button type="button" className="btn small" onClick={() => act('randomFull')}><Icon name="dice" />Всё заново</button>
          </div>
        </div>
      )}
      {res.race && <Checks res={res} />}
      {res.race && <SheetTools />}
      {live.note && <p className="muted small">{live.note}</p>}
      <Sheet st={st} res={res} opts={live} />
    </div>
  );
}

// герой уже в игре (сохранённый с развитием или лист кампании, открытый ГМ): лист показывает и развитие — уровень, очки,
// снаряжение, состояния, ХП после боя. Проверки правил — по листу создания
function liveSheet(st: Any): SheetOpts & { note?: string } {
  const App = window.App, Dev = window.Dev;
  const saved = App.editingId ? (App.store.get('hero-workshop:heroes', []) || []).find((h: Any) => h.id === App.editingId) : null;
  const src = saved || (window.Game && window.Game.targetRecord && window.Game.targetRecord());
  if (!Dev || !src || !Dev.hasProgress(src)) return {};
  const rec = Object.assign(JSON.parse(JSON.stringify(src)), { state: JSON.parse(JSON.stringify(st)) });
  const v = Dev.compute(rec);
  return { ...sheetOpts(rec, v), note: `Лист с развитием в игре (уровень ${v.res.level}${v.lv.levels ? `, при создании ${v.res0.level}` : ''}): опыт, очки, снаряжение и состояния уже учтены. В мастере меняется только лист создания, развитие ведётся на странице героя.` };
}

/** что показать на листе героя с развитием (как Dev.sheetOpts прежнего сайта, но блок «Развитие» — свой) */
export function sheetOpts(rec: Any, v: Any): SheetOpts {
  return {
    res: v.res,
    vit: rec.vit || {},
    symbols: ((rec.gm || {}).learned || []).filter((x: Any) => x.kind === 'symbol').map((x: Any) => x.name),
    pic: rec.pic || '',
    gearHtml: window.Inv && v.inv ? window.Inv.sheetGear(v, rec) : '',
    dev: <DevBlock rec={rec} v={v} />,
    resist: (window as Any).Resist ? (window as Any).Resist.ofHero(v, rec) : undefined,
  };
}
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
