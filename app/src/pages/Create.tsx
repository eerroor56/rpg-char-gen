import { useEffect, useLayoutEffect, type ComponentType } from 'react';
import { act, cap, stepStatus, useCreate, useRoute } from '../lib/legacy';
import { Icon } from '../ui/Icon';
import type { StepProps } from './create/kit';
import Race from './create/Race';
import Age from './create/Age';
import Boon from './create/Boon';
import Traits from './create/Traits';
import Stats from './create/Stats';
import Talents from './create/Talents';
import Gear from './create/Gear';
import Story from './create/Story';
import Summary from './create/Summary';

/*
 * Мастер создания персонажа: шаги с отметками, шаг с пояснением, живая сводка героя, «Назад / Далее» внизу.
 * Герой и расчёт по правилам — у прежнего сайта (App.state, Rules.compute), шаги — в ./create.
 */
const WHY: Record<string, string> = {
  race: 'Раса — основа героя: характеристики, средний уровень, размер, бонусы и особенности. Фракцию и религию герой получает уже в игре.',
  age: 'Возраст задаёт уровень относительно среднего уровня расы: 1 уровень = 3 очка характеристик. От возраста зависят ОД, очки талантов и число черт.',
  boon: 'Необязательно: тёмный дар, благословение или врождённая болезнь — сильный эффект со своей ценой.',
  traits: 'Положительные черты уравновешиваются отрицательными — так задаётся характер героя.',
  stats: 'Распределите очки возраста по характеристикам: тело, дух, сила, интеллект, ловкость.',
  talents: 'Очки талантов — 1 за каждые 5 уровней: ремесло, харизма, кулинария и другие.',
  gear: 'Стартовое оружие, броня и вещи — материал влияет на урон и броню.',
  story: 'Имя, внешность и предыстория — для листа и для ГМ.',
  summary: 'Проверьте лист и сохраните героя — в «Мои герои» или в кампанию.',
};
const STEPS: Record<string, ComponentType<StepProps>> = { race: Race, age: Age, boon: Boon, traits: Traits, stats: Stats, talents: Talents, gear: Gear, story: Story, summary: Summary };

export default function Create() {
  const { rest } = useRoute();
  const { state, res, step, steps } = useCreate();
  const App = window.App;
  const want = rest[0] && steps.some(s => s.id === rest[0]) ? rest[0] : step || 'race';

  useLayoutEffect(() => { App.step = want; }, [want, App]);
  // героя могли подменить снаружи (кампания: «Новый персонаж», «Изменить лист») — пересчитать при входе в мастер
  useLayoutEffect(() => { App.recompute(); }, [App]);
  const camp = window.Game ? window.Game.target() : null;
  // текущий шаг — в видимой части ленты шагов (на телефоне она прокручивается)
  useEffect(() => { document.querySelector('.wiz-step.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [want]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [want]);

  const ix = Math.max(0, steps.findIndex(s => s.id === want));
  const cur = steps[ix], prev = steps[ix - 1], next = steps[ix + 1];
  const errs = res.errors || [];
  const here = { errs: errs.filter((e: { step: string }) => e.step === want), warns: (res.warnings || []).filter((e: { step: string }) => e.step === want) };
  const race = res.race;
  const left = race && res.ageStart ? res.agePoints - res.allocSum : null;
  const canRoll = window.RandomHero && window.RandomHero.steps.includes(want);
  const goto = (id: string) => { location.hash = '#create/' + id; };
  const Step = STEPS[want];
  const fresh = () => {
    if (!confirm('Начать нового персонажа? Несохранённый черновик будет очищен (сохранённые герои останутся).')) return;
    App.state = window.Rules.newState(); App.editingId = null; App.prevState = null; App.save(); App.recompute();
    goto('race');
  };

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

      {camp && (
        <div className="wiz-camp">
          <Icon name="dice" />
          <span>Персонаж для кампании <b>«{camp.cname}»</b>{camp.chid ? ' — правка листа' : ''}. Когда закончите, на шаге «Итог» {camp.chid && !['draft', 'review'].includes(camp.status) ? 'сохраните лист в кампании' : 'отправьте его ГМ на проверку'}.</span>
          <a className="btn ghost small" href={`#game/${camp.cid}${camp.chid ? '/' + camp.chid : ''}`}>К кампании</a>
          <button type="button" className="link small" onClick={() => act('gDetach')}>отвязать</button>
        </div>
      )}

      {/* шапка шага — над сеткой: сводка героя справа начинается вровень с содержимым шага */}
      <header className="wiz-head">
        <p className="eyebrow">Шаг {ix + 1} из {steps.length}</p>
        <h1>{cur?.title}</h1>
        <p className="lead">{WHY[want] || ''}</p>
        <div className="row">
          {canRoll && <button type="button" className="btn small" onClick={() => act('randomStep', { step: want })}><Icon name="dice" />Случайно этот шаг</button>}
          <button type="button" className="btn ghost small" onClick={() => act('randomFull')}><Icon name="spark" />Случайный герой</button>
          {App.prevState && <button type="button" className="link" onClick={() => act('randomUndo')}>отменить случайный выбор</button>}
        </div>
      </header>

      <div className="wiz-grid">
        <section className="wiz-main">
          {(here.errs.length > 0 || here.warns.length > 0) && (
            <div className="step-issues" role="status">
              {here.errs.map((e: { msg: string }, i: number) => <p key={'e' + i} className="issue err">{e.msg}</p>)}
              {here.warns.map((e: { msg: string }, i: number) => <p key={'w' + i} className="issue warn">{e.msg}</p>)}
            </div>
          )}
          <div className="wiz-work">{Step && <Step st={state} res={res} />}</div>
        </section>

        <aside className="wiz-sum" aria-label="Сводка героя">
          <div className="wiz-sum-head">
            <b>{state.name || 'Безымянный герой'}</b>
            <span>{race ? `${cap(race.name)} · ур. ${res.level}` : 'раса не выбрана'}{res.age ? ` · ${String(res.age.title).toLowerCase()}` : ''}</span>
          </div>
          {res.stats && race && (
            <dl className="wiz-stats">
              {(['t', 'd', 's', 'i', 'l'] as const).map(k => <div key={k}><dt>{window.Rules.STAT_SHORT[k]}</dt><dd>{window.Rules.fmt(res.stats[k])}</dd></div>)}
            </dl>
          )}
          <ul className="wiz-facts">
            {left !== null && <li className={left ? 'attn' : ''}>Очки характеристик: <b>{left ? `ещё ${left > 0 ? '+' : ''}${left}` : 'распределены'}</b></li>}
            {race && res.ageStart && <li className={res.talentPoints - res.talentSpent ? 'attn' : ''}>Очки талантов: <b>{res.talentSpent} из {res.talentPoints}</b></li>}
            {res.der && race && <li>ХП <b>{window.Rules.fmt(res.der.hp)}</b> · МП <b>{window.Rules.fmt(res.der.mp)}</b> · ОД в ход <b>{window.Rules.odText(res.der)}</b></li>}
          </ul>
          {errs.length ? (
            <div className="wiz-issues">
              <p><Icon name="alert" /> Что исправить: {errs.length}</p>
              <ul>{errs.slice(0, 6).map((e: { step: string; msg: string }, i: number) => <li key={i}><button type="button" className="link" onClick={() => goto(e.step)}>{e.msg}</button></li>)}</ul>
              {errs.length > 6 && <p className="muted small">и ещё {errs.length - 6}…</p>}
            </div>
          ) : race ? <p className="chip ok"><Icon name="check" />Собран по правилам</p> : null}
          <div className="wiz-sum-act">
            {camp ? <CampSave camp={camp} /> : <button type="button" className="btn primary" onClick={() => act('saveHero')}>{App.editingId ? 'Сохранить изменения' : 'Сохранить в «Мои герои»'}</button>}
            <button type="button" className="btn ghost small" onClick={fresh}>Начать заново</button>
          </div>
        </aside>
      </div>

      <div className="wiz-nav">
        {prev ? <a className="btn ghost" href={'#create/' + prev.id}><span aria-hidden="true">←</span> {prev.short || prev.title}</a> : <span />}
        {next ? <a className="btn primary" href={'#create/' + next.id}>Далее: {next.short || next.title} <span aria-hidden="true">→</span></a>
          : camp ? <CampSave camp={camp} short /> : <button type="button" className="btn primary" onClick={() => act('saveHero')}>Сохранить героя</button>}
      </div>
    </div>
  );
}

/** герой собирается для кампании: отправить ГМ на проверку, сохранить черновик или (уже в игре) сохранить лист */
function CampSave({ camp, short }: { camp: { chid?: string; status?: string }; short?: boolean }) {
  const keep = camp.chid && !['draft', 'review'].includes(camp.status || '');
  if (keep) return <button type="button" className="btn primary" onClick={() => act('gSaveWizard', { status: 'keep' })}>Сохранить лист в кампании</button>;
  return <>
    <button type="button" className="btn primary" onClick={() => act('gSaveWizard', { status: 'review' })}>Отправить ГМ на проверку</button>
    {!short && <button type="button" className="btn" onClick={() => act('gSaveWizard', { status: 'draft' })}>Сохранить черновик в кампании</button>}
  </>;
}
