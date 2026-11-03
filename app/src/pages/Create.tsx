import { useEffect, useLayoutEffect } from 'react';
import { act, cap, stepStatus, useCreate, useRoute } from '../lib/legacy';
import { Icon } from '../ui/Icon';

/*
 * Мастер создания персонажа. Новая оболочка: шаги с отметками, шаг с пояснением, живая сводка героя, «Назад / Далее»
 * внизу. Содержимое шагов пока рисует прежний мастер (App.steps, js/steps.js) в #work — со всеми правилами;
 * шаги будут переписываться на React по одному.
 */
const WHY: Record<string, string> = {
  race: 'Раса — основа героя: характеристики, средний уровень, размер, бонусы и особенности.',
  age: 'Возраст задаёт уровень: моложе — меньше очков, старше — больше, но и свои эффекты.',
  boon: 'Необязательно: дар, благословение или болезнь — сильный бонус с ценой.',
  traits: 'Положительные черты уравновешиваются отрицательными — так задаётся характер героя.',
  stats: 'Распределите очки характеристик: тело, дух, сила, интеллект, ловкость.',
  talents: 'Очки талантов — 1 за каждые 5 уровней: ремесло, харизма, кулинария и другие.',
  gear: 'Стартовое оружие, броня и вещи — материал влияет на урон и броню.',
  story: 'Имя, внешность и предыстория — для листа и для ГМ.',
  summary: 'Проверьте лист и сохраните героя — в «Мои герои» или в кампанию.',
};

export default function Create() {
  const { rest } = useRoute();
  const { state, res, step, steps } = useCreate();
  const App = window.App;
  const want = rest[0] && steps.some(s => s.id === rest[0]) ? rest[0] : step || 'race';

  // стили шагов прежнего мастера — только пока открыт мастер
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'legacy/css/style.css'; link.dataset.legacy = '1';
    document.head.appendChild(link);
    document.body.classList.add('wiz-on');
    return () => { link.remove(); document.body.classList.remove('wiz-on'); };
  }, []);
  // шаг из адреса (#create/age) → прежний мастер рисует его содержимое
  useLayoutEffect(() => { App.step = want; App.renderCreate(); }, [want, App]);
  // текущий шаг — в видимой части ленты шагов (на телефоне она прокручивается)
  useEffect(() => { document.querySelector('.wiz-step.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [want]);

  const ix = Math.max(0, steps.findIndex(s => s.id === want));
  const cur = steps[ix], prev = steps[ix - 1], next = steps[ix + 1];
  const errs = res.errors || [];
  const race = res.race;
  const left = race && res.ageStart ? res.agePoints - res.allocSum : null;
  const canRoll = window.RandomHero && window.RandomHero.steps.includes(want);
  const goto = (id: string) => { location.hash = '#create/' + id; };

  return (
    <div className="wiz">
      <nav className="wiz-steps" aria-label="Шаги создания">
        {steps.map((s, i) => {
          const st = stepStatus(res, s.id);
          return (
            <a key={s.id} href={'#create/' + s.id} className={`wiz-step${s.id === want ? ' is-on' : ''}${st.errs ? ' is-bad' : ''}`} aria-current={s.id === want ? 'step' : undefined}>
              <span className="wiz-num">{st.errs ? '!' : i + 1}</span><span>{s.short || s.title}</span>
            </a>
          );
        })}
      </nav>

      <div className="wiz-grid">
        <section className="wiz-main">
          <header className="wiz-head">
            <p className="eyebrow">Шаг {ix + 1} из {steps.length}</p>
            <h1>{cur?.title}</h1>
            <p className="lead">{WHY[want] || ''}{cur?.lead ? <><br /><span className="muted small">{stripTags(cur.lead)}</span></> : null}</p>
            <div className="row">
              {canRoll && <button type="button" className="btn small" onClick={() => act('randomStep', { step: want })}><Icon name="dice" />Случайно этот шаг</button>}
              <button type="button" className="btn ghost small" onClick={() => act('randomFull')}><Icon name="spark" />Случайный герой</button>
              {App.prevState && <button type="button" className="link" onClick={() => act('randomUndo')}>отменить случайный выбор</button>}
            </div>
          </header>
          <div id="work" className="wiz-work" tabIndex={-1} />
          <div hidden><div id="rail" /><div id="ledger" /></div>
        </section>

        <aside className="wiz-sum" aria-label="Сводка героя">
          <div className="wiz-sum-head">
            <b>{state.name || 'Безымянный герой'}</b>
            <span>{race ? `${cap(race.name)} · ур. ${res.level}` : 'раса не выбрана'}{res.age ? ` · ${String(res.age.title).toLowerCase()}` : ''}</span>
          </div>
          {res.stats && race && (
            <dl className="wiz-stats">
              {(['t', 'd', 's', 'i', 'l'] as const).map(k => <div key={k}><dt>{window.Rules.STAT_SHORT[k]}</dt><dd>{res.stats[k]}</dd></div>)}
            </dl>
          )}
          <ul className="wiz-facts">
            {left !== null && <li className={left ? 'attn' : ''}>Очки характеристик: <b>{left ? `ещё ${left > 0 ? '+' : ''}${left}` : 'распределены'}</b></li>}
            {race && res.ageStart && <li>Очки талантов: <b>{res.talentSpent} из {res.talentPoints}</b></li>}
            {res.der && race && <li>ХП <b>{res.der.hp}</b> · МП <b>{res.der.mp}</b> · ОД в ход <b>{3 + (res.der.od || 0)}</b></li>}
          </ul>
          {errs.length ? (
            <div className="wiz-issues">
              <p><Icon name="alert" /> Что исправить: {errs.length}</p>
              <ul>{errs.slice(0, 6).map((e: { step: string; msg: string }, i: number) => <li key={i}><button type="button" className="link" onClick={() => goto(e.step)}>{e.msg}</button></li>)}</ul>
            </div>
          ) : race ? <p className="chip ok"><Icon name="check" />Собран по правилам</p> : null}
          <div className="wiz-sum-act">
            <button type="button" className="btn primary" onClick={() => act('saveHero')}>{App.editingId ? 'Сохранить изменения' : 'Сохранить в «Мои герои»'}</button>
            <button type="button" className="btn ghost small" onClick={() => act('newHero')}>Начать заново</button>
          </div>
        </aside>
      </div>

      <div className="wiz-nav">
        {prev ? <a className="btn ghost" href={'#create/' + prev.id}><span aria-hidden="true">←</span> {prev.short || prev.title}</a> : <span />}
        {next ? <a className="btn primary" href={'#create/' + next.id}>Далее: {next.short || next.title} <span aria-hidden="true">→</span></a>
          : <button type="button" className="btn primary" onClick={() => act('saveHero')}>Сохранить героя</button>}
      </div>
    </div>
  );
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
