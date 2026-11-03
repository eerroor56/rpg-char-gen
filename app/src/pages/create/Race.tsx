import { useEffect, useMemo, useState } from 'react';
import { Applied, act, C, CalcMark, cap, D, EntityPic, Field, fmt, KV, norm, R, RacePic, Search, Sel, set, signed, sizeName, StatMini, Warn, type Any, type Opt, type StepProps } from './kit';
import { Icon } from '../../ui/Icon';

/* Шаг 1 — раса: выбранная раса крупно (параметры, бонусы и штрафы, предок), ниже — все игровые расы картинками */
export default function Race({ st, res }: StepProps) {
  const race = res.race;
  const [open, setOpen] = useState(!race);
  useEffect(() => { if (!st.raceId) setOpen(true); }, [st.raceId]);
  const pick = (id: string) => { act('pickRace', { id }); setOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <div className="wstack">
      {race ? <RaceCard st={st} res={res} /> : (
        <div className="card wz-hello">
          <p>Выберите расу из списка ниже — здесь появятся её характеристики, бонусы и штрафы.</p>
          {window.RandomHero && <>
            <button type="button" className="btn" onClick={() => act('randomFull')}><Icon name="dice" />Собрать случайного героя</button>
            <p className="muted small">Персонаж соберётся по всем правилам. Потом любой шаг можно поправить вручную или перебросить отдельно.</p>
          </>}
        </div>
      )}
      {race && !open
        ? <button type="button" className="btn ghost wide-btn" onClick={() => setOpen(true)}><Icon name="search" />Выбрать другую расу</button>
        : <RacePicker st={st} onPick={pick} onClose={race ? () => setOpen(false) : undefined} />}
    </div>
  );
}

function RacePicker({ st, onPick, onClose }: { st: Any; onPick: (id: string) => void; onClose?: () => void }) {
  const [q, setQ] = useState('');
  const [al, setAl] = useState('');
  const [sz, setSz] = useState('');
  const all = useMemo(() => D().races.filter((r: Any) => r.playable), []);
  const aligns = useMemo(() => [...new Set<string>(all.map((r: Any) => r.align))].filter(Boolean), [all]);
  const nq = norm(q);
  const list = all.filter((r: Any) => (!nq || norm(r.name).includes(nq) || norm(r.bonus).includes(nq)) && (!al || r.align === al) && (!sz || r.size === sz));
  const imgs = window.RACE_IMAGES || {};
  return (
    <section className="wstack" aria-label="Выбор расы">
      <div className="wtools">
        <Search value={q} onChange={setQ} placeholder="Поиск по названию или бонусу" />
        <Sel value={al} onChange={setAl} label="Характер" options={[{ v: '', t: 'любой характер' }, ...aligns.map(a => ({ v: a, t: cap(a) }))]} />
        <Sel value={sz} onChange={setSz} label="Размер" options={[{ v: '', t: 'любой размер' }, ...R().SIZES.map((s: Any) => ({ v: s.id, t: s.name }))]} />
        {onClose && <button type="button" className="btn ghost small" onClick={onClose}>Свернуть</button>}
      </div>
      <p className="muted small">{list.length} из {all.length} игровых рас. Расы эволюции (♥) и не игровые (♠) — в справочнике.</p>
      {list.length ? (
        <div className="race-grid" role="listbox" aria-label="Расы">
          {list.map((r: Any) => {
            const on = r.id === st.raceId, im = imgs[r.id];
            return (
              <button key={r.id} type="button" role="option" aria-selected={on} className={'race-tile' + (on ? ' is-on' : '')} onClick={() => onPick(r.id)}>
                <span className="rt-pic">{im ? <img src={im.src} alt="" loading="lazy" decoding="async" /> : <Icon name="user" />}</span>
                <span className="rt-name">{cap(r.name)}</span>
                <span className="rt-meta">ур. {fmt(R().roundLevel(r.lvl))} · {sizeName(r.size).toLowerCase()} · {r.align}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="muted">Ничего не найдено — измените поиск или фильтры.</p>}
    </section>
  );
}

function RaceCard({ st, res }: StepProps) {
  const race = res.race, r = race.base, Rr = R();
  const playable = D().races.filter((x: Any) => x.playable && x.id !== 'полукровка');
  const raceOpts: Opt[] = [{ v: '', t: '— раса —' }, ...playable.map((x: Any) => ({ v: x.id, t: cap(x.name) }))];
  const sz = Rr.SIZES.find((s: Any) => s.id === race.size);
  const fxs: string[] = race.fx.concat(race.pfx).map(fxLine).filter(Boolean);
  const gm = !race.isHalf && window.GMLock && window.GMLock.unlocked;
  return (
    <article className="card race-card">
      <header className="rc-head">
        <RacePic races={race.isHalf && race.parents ? race.parents : [r]} className="rc-pic" />
        <div className="rc-title">
          <h2>{cap(race.name)}</h2>
          <p className="muted">{race.align || 'характер не выбран'} · {sz ? sz.name.toLowerCase() : sizeName(r.size).toLowerCase()} · средний ур. {fmt(race.lvl)}</p>
          {r.bonusFreq && <span className="chip">{r.bonusFreq}</span>}
          <StatMini o={{ ...race.stats, lvl: race.lvl }} />
          <p className="muted small">Уровень = (сумма характеристик − 25) / 3. За каждый уровень — 3 очка характеристик.</p>
        </div>
      </header>

      {race.isHalf && <>
        <p className="note small">Полукровка складывает характеристики двух рас и делит пополам, получает половину бонусов и штрафов обеих, привлекательность −20. Характер и размер выбираются.</p>
        <div className="fgrid">
          <Field label="Первая родительская раса"><Sel value={st.parentA} options={raceOpts} onChange={v => set('parentA', v)} /></Field>
          <Field label="Вторая родительская раса"><Sel value={st.parentB} options={raceOpts} onChange={v => set('parentB', v)} /></Field>
          <Field label="Характер"><Sel value={st.hbAlign} options={[{ v: '', t: '— выбрать —' }, ...['добро', 'нейтрал', 'зло'].map(x => ({ v: x, t: x }))]} onChange={v => set('hbAlign', v)} /></Field>
          <Field label="Размер"><Sel value={st.hbSize} options={[{ v: '', t: '— выбрать —' }, ...(race.sizeOptions || []).map((z: string) => ({ v: z, t: sizeName(z) }))]} onChange={v => set('hbSize', v)} /></Field>
        </div>
      </>}

      <div className="bp">
        {race.bonuses.map((b: Any, i: number) => <div key={'b' + i} className="bp-item plus"><h3>Бонус{race.bonuses.length > 1 ? ': ' + b.src : ''}</h3><p>{b.text || '—'}</p></div>)}
        {race.penalties.map((b: Any, i: number) => <div key={'p' + i} className="bp-item minus"><h3>Штраф{race.penalties.length > 1 ? ': ' + b.src : ''}</h3><p>{b.text || '—'}</p></div>)}
      </div>
      <Applied items={fxs} />

      <details className="more">
        <summary>Подробнее: характер, размер, где обитает</summary>
        <dl className="kvs">
          <KV k="Характер">{race.align || '—'}{race.align && <span className="muted"> (карма {signed(C().KARMA[race.align] || 0)})</span>}</KV>
          <KV k="Размер">{sz ? <>{sz.name} <span className="muted">— сырьё для оружия и брони {sz.mat}, {sz.fx}</span></> : <>{r.size || '—'}{race.ancestorRule && <span className="muted"> — определится по предку</span>}</>}</KV>
          <KV k="Уровень обитания">{Rr.habitatNames(race.habitat, true).join(', ') || '—'}</KV>
          {gm && <KV k={<>Фракция расы <span className="muted">(ГМ)</span></>}>{cellRefs(r.faction)} <span className="muted">— в игре, не на старте</span></KV>}
          {gm && <KV k={<>Религия расы <span className="muted">(ГМ)</span></>}>{cellRefs(r.religion)} <span className="muted">— в игре, не на старте</span></KV>}
          {r.evo && <KV k="Эволюция">в «{r.evo}» <span className="muted">(нужны плоть древних и осколок легенды)</span></KV>}
        </dl>
      </details>

      {race.ancestorRule && <Ancestor st={st} res={res} />}
      {race.id === 'они' && (
        <div className="sub">
          <h3>Клан Они</h3>
          <p className="muted small">Символ по принадлежности и бонус +50 к оружию клана. Клан подсказывает и демона-покровителя.</p>
          <Sel value={st.oniClan} onChange={v => set('oniClan', v)} label="Клан"
            options={[{ v: '', t: '— выбрать клан —' }, ...Rr.ONI_CLANS.map((c: Any) => ({ v: c.id, t: `${c.id} — ${c.weapon.replace(' ( веер)', ' (веер)')}` }))]} />
        </div>
      )}
    </article>
  );
}

function Ancestor({ st, res }: StepProps) {
  const race = res.race, rule = race.ancestorRule, Rr = R();
  const A: Any[] = D().ancestors || [];   // открытый список возможных предков (без боссов и легенд)
  let opts: Opt[] = [{ v: '', t: '— выбрать —' }];
  if (rule.kind === 'dragon') opts = opts.concat(A.filter(c => c.sec === 'Драконы').map(c => ({ v: c.n, t: `${c.n} (ур. ${fmt(Rr.roundLevel(c.lvl))}, ${sizeName(c.sz).toLowerCase()})` })));
  else if (rule.kind === 'insect') {
    opts = opts.concat(A.filter(c => c.ins === 'spider').map(c => ({ v: c.n, t: c.n, group: 'Пауки и насекомые' })));
    opts = opts.concat(A.filter(c => c.ins === 'other').map(c => ({ v: c.n, t: c.n, group: 'Другие существа с хитином / инсекто-мясом' })));
  } else if (rule.kind === 'beastRace') {
    opts = opts.concat(D().races.filter((x: Any) => x.playable && x.faction === '30').map((x: Any) => ({ v: x.id, t: cap(x.name), group: 'Звериные расы' })));
  }
  if (rule.kind === 'demon' || rule.kind === 'god') {
    opts = opts.concat(Rr.patronList(rule.kind).map((d: Any) => ({ v: d.name, t: `${d.name} — символ: ${Rr.patronSymbol(d.name) || 'не задан'}` })));
  }
  const maxLvl = res.ageStart ? res.level : race.lvl;
  const fit = rule.kind === 'ghost' ? A.filter(c => Rr.roundLevel(c.lvl) <= maxLvl).sort((x, y) => y.lvl - x.lvl) : A;
  const a = race.ancestor;
  return (
    <div className="sub">
      <h3>{rule.title}</h3>
      <p className="muted small">«{rule.text}»</p>
      {rule.kind === 'monster' || rule.kind === 'ghost' ? <>
        <input type="text" list="ancList" value={st.ancestor || ''} onChange={e => set('ancestor', e.target.value, true)} placeholder="Начните вводить название существа" aria-label={rule.title} />
        <datalist id="ancList">{fit.map(c => <option key={c.n} value={c.n}>{rule.kind === 'ghost' ? `ур. ${fmt(Rr.roundLevel(c.lvl))}` : ''}</option>)}</datalist>
        <p className="muted small">{rule.kind === 'ghost'
          ? <>Существа не выше уровня персонажа (сейчас {fmt(maxLvl)}{res.ageStart ? '' : ' — средний уровень расы; уточнится после выбора возраста'}): {fit.length} из {A.length}. Боссы и легенды исключены.</>
          : <>Боссы и легенды исключены. В списке {A.length} существ.</>}</p>
      </> : <Sel value={st.ancestor} options={opts} onChange={v => set('ancestor', v)} label={rule.title} />}

      {a && a.demon ? (
        <div className="anc">
          <EntityPic name={a.name} className="anc-pic" />
          <div>
            <p><b>{cap(a.name)}</b> — стартовый магический символ: <b>{a.element || 'ещё не задан ГМ'}</b></p>
            <p className="muted small">О {rule.kind === 'god' ? 'боге' : 'демоне'}: {a.demon.bonus}. При создании берётся только символ; остальное — дары веры, их получают в игре.</p>
          </div>
        </div>
      ) : a && a.creature ? <Creature st={st} a={a} rule={rule} race={race} />
        : a && a.race ? (
          <div className="anc"><RacePic races={[a.race]} className="anc-pic" /><p>Половина бонуса расы «{cap(a.race.name)}»: {a.race.bonus}</p></div>
        ) : st.ancestor ? <Warn>Существо с таким названием не найдено среди возможных предков — выберите из подсказок.</Warn> : null}
    </div>
  );
}

function Creature({ st, a, rule, race }: { st: Any; a: Any; rule: Any; race: Any }) {
  const c = a.creature, Rr = R();
  const mark = (x: Any) => (Object.keys(x.fx).length ? <> <CalcMark /></> : null);
  return (
    <div className="anc">
      <EntityPic name={c.n} className="anc-pic" />
      <div className="wstack tight">
        <p><b>{cap(c.n)}</b> {c.m.map((m: string) => <span key={m} className="chip">{m}</span>)} — ур. {fmt(Rr.roundLevel(c.lvl))}, {sizeName(c.sz).toLowerCase()}, {c.ch}</p>
        <StatMini o={{ ...c, lvl: Rr.roundLevel(c.lvl) }} />
        {a.companion && <p className="muted small">Призрак — отдельный персонаж: его характеристики и навыки не прибавляются к вашим.</p>}
        {a.add && <p>Прибавка +{rule.pct}%: {Rr.STATS.map((k: string) => `${Rr.STAT_SHORT[k]} ${signed(a.add[k])}`).join(', ')}</p>}
        {a.symbol && <p>Знак дракона рода: <b>{a.symbol}</b></p>}
        {rule.kind === 'dragon' && <p>Размер драконида: {sizeName(race.size)} (предок {sizeName(c.sz).toLowerCase()} − 1)</p>}
        {a.abilities && a.abilities.length ? (rule.kind === 'monster' ? <>
          <Field label="Умение монстра (одно, полной силы)">
            <Sel value={st.ancestorAbility} onChange={v => set('ancestorAbility', v)}
              options={[{ v: '', t: '— выбрать —' }, ...a.abilities.map((x: Any) => ({ v: String(x.i), t: x.text.replace(/\s+/g, ' ').slice(0, 120) }))]} />
          </Field>
          {a.picked && <p className="small">{a.picked.text}{mark(a.picked)}</p>}
        </> : <>
          <p className="muted small">{a.companion ? 'Навыки призрака' : 'Навыки предка'}{rule.kind === 'dragon' ? ' — у драконида 50% мощности, числа уже поделены пополам' : ''}:</p>
          <ul className="abil">{a.abilities.map((x: Any, i: number) => <li key={i}>{x.text}{mark(x)}</li>)}</ul>
        </>) : <p className="muted small">Особых навыков у {a.companion ? 'этого существа' : 'предка'} в таблице нет.</p>}
      </div>
    </div>
  );
}

// что из бонусов расы программа учитывает сама
function fxLine(f: Any): string | null {
  const half = (f.half ? ' (½)' : '') + (f.repl ? ' (репликант)' : '');
  const cond = f.cond ? ' — условно, не учитывается в расчёте' : '';
  const talentName = (id: string) => { const t = R().TALENTS.find((x: Any) => x.id === id); return t ? t.name.toLowerCase() : id; };
  switch (f.k) {
    case 'talent': return `${talentName(f.id)} ${signed(f.v)}${half}${cond}`;
    case 'attr': return `привлекательность ${signed(f.v)}${half}${cond}`;
    case 'zor': return `зоркость ${signed(f.v)}${half}${cond}`;
    case 'od': return `ОД ${signed(f.v)}${half}${cond}`;
    case 'hpRegen': return `реген ХП +${f.v}${half}${cond}`;
    case 'mpRegen': return `реген МП +${f.v}${half}${cond}`;
    case 'mpRegenMul': return `реген МП ×${f.v}${cond}`;
    case 'weapon': return `оружие «${f.group}»: урон +${f.v}${half}${cond}`;
    case 'weaponAcc': return `оружие «${f.group}»: точность +${f.v}${half}${cond}`;
    case 'prayers': return `молитвы +${f.v}`;
    case 'extraPos': return `доп. положительные черты +${f.v}${half}`;
    case 'passive': return `${f.id} +${f.v}${half} (пассивный навык)`;
    case 'symbol': return `магический символ: ${f.id === 'дракон' ? 'символ дракона' : f.id}${half}`;
    case 'symbolByAffiliation': return 'символ по принадлежности (клан / покровитель)';
    case 'ability': return `умение: ${f.id}${half}`;
    case 'hands': return `рук: ${f.v}`;
    case 'noWeapon': return 'оружие на старте взять нельзя (проверяется)';
    case 'noArmor': return 'другие доспехи носить нельзя (проверяется)';
    case 'noStartGear': return 'без стартовой экипировки, благословений, болезней и проклятия (проверяется)';
    case 'noSizeDebuff': return 'нет дебафа от роста: +10% получаемого урона от размера не действует';
    case 'noMediumArmorPenalty': return 'средние доспехи без штрафа ловкости';
    default: return null;
  }
}

// ячейка «фракция / религия» таблицы рас: номера общин → названия
function cellRefs(cell: unknown) {
  const s = String(cell || '').trim();
  if (!s || s === 'н') return 'нет';
  if (/^(демоны|боги)$/i.test(s)) return s;
  const name = (n: string) => { const g = R().index.society.get(+n); return g ? g.name : n; };
  return s.replace(/\d+/g, n => name(n)).replace(/\/н\b/, ' / без веры').replace(/\./g, ' / ');
}
