import type { ReactNode } from 'react';
import { act, cap } from '../../lib/legacy';
import { EntityPic, fmt, norm, R, RacePic, signed, type Any } from '../create/kit';
import { Icon } from '../../ui/Icon';

/*
 * Лист персонажа — «бумажный» лист для игры, печати и картинки. Считает всё js/rules.js (res); здесь только показ.
 * opts: { res — расчёт с развитием в игре (проверки правил — по листу создания), vit — ХП, МП и броня сейчас (после боя),
 *         symbols — символы, изученные в игре, pic — своя картинка, gearHtml — снаряжение сейчас (js/inventory.js),
 *         dev — блок «Развитие», note — пометка над листом }
 */
export type SheetOpts = { res?: Any; vit?: Any; symbols?: string[]; pic?: string; gearHtml?: string; dev?: ReactNode; note?: ReactNode };

export function Sheet({ st, res: chk, opts = {} }: { st: Any; res: Any; opts?: SheetOpts }) {
  const res = opts.res || chk;
  const race = res.race, d = res.der, vit = opts.vit || {}, Rr = R();
  if (!race) return <div className="card empty"><Icon name="user" /><p>Лист появится, когда будет выбрана раса.</p></div>;
  const raceTitle = race.isHalf && race.parents && race.parents[0] && race.parents[1] ? `полукровка (${race.parents[0].name} и ${race.parents[1].name})` : race.name;
  const syms: string[] = res.symbols.map((x: Any) => x.name).concat((opts.symbols || []).filter(n => !res.symbols.some((x: Any) => norm(x.name) === norm(n))));
  // «сейчас / максимум» — если после боя значение меньше полного
  const now = (v: unknown, max: number) => (v !== undefined && v !== null && v !== '' && +v! !== max ? <span title="сейчас / максимум">{fmt(+v!)} / </span> : null);
  const custom = opts.pic && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(opts.pic) ? opts.pic : '';
  const talents = Rr.TALENTS.filter((t: Any) => res.talents[t.id].total);
  return (
    <article className="cs-sheet" id="sheet">
      <header className="cs-head">
        {custom ? <span className="cs-pic"><img src={custom} alt="" /></span> : <RacePic races={race.isHalf && race.parents ? race.parents : [race.base]} className="cs-pic" />}
        <div className="cs-title">
          <h2>{st.name || 'Безымянный герой'}</h2>
          <p>{cap(raceTitle)}, {res.age ? res.age.title.toLowerCase() : 'возраст не выбран'}
            {res.ageStart && res.ageStart !== res.age ? ` (с ур. ${fmt(res.ageAtLevel)}; при создании — ${res.ageStart.title.toLowerCase()})` : res.agePct ? ` (${signed(res.agePct)}% от среднего уровня)` : ''}
            {st.player ? `, игрок: ${st.player}` : ''}{st.gender ? `, ${st.gender}` : ''}</p>
        </div>
        <dl className="cs-badges">
          <div><dt>Уровень</dt><dd>{fmt(res.level)}</dd></div>
          <div><dt>ОД в ход</dt><dd>{Rr.odText(d)}</dd></div>
          <div><dt>Карма</dt><dd>{signed(d.karma)}</dd></div>
        </dl>
      </header>

      <div className="cs-grid">
        <section className="cs-block">
          <h3>Характеристики</h3>
          <table className="cs-stats"><thead><tr><th /><th>Раса</th><th>Итог</th></tr></thead>
            <tbody>{Rr.STATS.map((k: string) => <tr key={k}><th>{Rr.STAT_NAMES[k]}</th><td>{fmt(res.baseStats[k])}</td><td><strong>{fmt(res.stats[k])}</strong></td></tr>)}</tbody>
          </table>
          <p className="cs-muted cs-small">Характер: {d.align || '—'}. Размер: {res.size ? res.size.name.toLowerCase() : '—'}{res.size && res.size.fx !== 'без эффектов' ? ` (${res.size.fx})` : ''}. Рук: {res.hands}.</p>
        </section>

        <section className="cs-block">
          <h3>Параметры</h3>
          <dl className="cs-der">
            <Der t="ХП">{now(vit.hp, d.hp)}{fmt(d.hp)}</Der><Der t="Реген ХП">{fmt(d.hpRegen)}</Der>
            <Der t="МП">{now(vit.mp, d.mp)}{fmt(d.mp)}</Der><Der t="Реген МП">{fmt(d.mpRegen)}</Der>
            <Der t="Пси">{fmt(d.psi)}</Der><Der t="Живость">{d.viv === null ? '—' : fmt(d.viv)}</Der>
            {d.vamp ? <Der t="Вампиризм">{d.vamp}%</Der> : null}
            <Der t="Уворот">{fmt(d.dodge)}</Der><Der t="Слоты">{fmt(d.slotsUsed)} / {fmt(d.slots)}</Der>
            <Der t="Зоркость">{fmt(d.zor)}{+vit.zor ? <span className="cs-muted cs-small"> ({signed(+vit.zor)} в бою)</span> : null}</Der><Der t="Харизма">{fmt(d.charisma)}</Der>
            <Der t="Привлекат.">{signed(d.attr)}</Der><Der t="Молитвы">{d.prayers}</Der>
            <Der t="Ячейки закл.">{d.spellSlots}</Der><Der t="Опыт">{d.expPct ? signed(d.expPct) + '%' : '±0%'}{d.expMul !== 1 ? ' ×' + d.expMul : ''}</Der>
            {d.armor !== undefined ? <Der t="Броня">{d.armor ? now(vit.arm === undefined || vit.arm === null ? vit.arm : Math.min(+vit.arm, d.armor), d.armor) : null}{fmt(d.armor)}{d.magicArmor ? <span className="cs-muted cs-small"> + маг {fmt(d.magicArmor)}</span> : null}</Der> : null}
            {d.magPct ? <Der t="Маг. урон">{signed(d.magPct)}%</Der> : null}
            {d.sizeIn || d.sizeOut ? <Der t="Урон от размера">получ. {signed(d.sizeIn)}% / исх. {signed(d.sizeOut)}%</Der> : null}
            {d.gold ? <Der t="Золото">{d.gold}</Der> : null}
            {d.revive ? <Der t="Воскрешения">{d.revive}</Der> : null}
            {d.madness ? <Der t="Безумие">{d.madness}</Der> : null}
          </dl>
        </section>

        <section className="cs-block">
          <h3>Таланты</h3>
          <ul className="cs-list">{talents.length ? talents.map((t: Any) => <li key={t.id}><span>{t.name}</span><b>{fmt(res.talents[t.id].total)}</b></li>) : <li className="cs-muted">нет</li>}</ul>
        </section>

        <section className="cs-block">
          <h3>Обитание и символы</h3>
          <p><b>Уровень обитания:</b> {Rr.habitatNames(race.habitat).join('; ') || '—'}</p>
          <p><b>Символы:</b> {syms.length ? syms.join(', ') : 'нет'}</p>
          <p className="cs-muted cs-small">Фракцию и религию персонаж получает в игре, выйдя в мир.</p>
        </section>

        <section className="cs-block wide">
          <h3>Особенности</h3>
          {res.age && <p><b>Возраст ({res.age.title.toLowerCase()}):</b> {res.age.buff}</p>}
          {race.bonuses.map((b: Any, i: number) => <p key={'b' + i}><b>Бонус{race.bonuses.length > 1 ? ` (${b.src})` : ''}{b.freq ? ', ' + b.freq : ''}:</b> {b.text}</p>)}
          {race.penalties.map((b: Any, i: number) => <p key={'p' + i}><b>Штраф{race.penalties.length > 1 ? ` (${b.src})` : ''}:</b> {b.text}</p>)}
          <Ancestor race={race} />
          {race.id === 'они' && st.oniClan && <p><b>Клан:</b> {st.oniClan}</p>}
        </section>

        <section className="cs-block wide">
          <h3>Дар, черты</h3>
          <Boon st={st} res={res} />
          <Traits st={st} res={res} />
        </section>

        {opts.gearHtml
          ? <section className="cs-block wide"><h3>Снаряжение сейчас</h3><div dangerouslySetInnerHTML={{ __html: opts.gearHtml }} /></section>
          : <section className="cs-block wide"><h3>Снаряжение</h3><Gear st={st} res={res} /></section>}

        {(st.look || st.story || st.motive || st.gmBonus) && (
          <section className="cs-block wide">
            <h3>Предыстория</h3>
            {st.look && <p><b>Внешность:</b> {st.look}</p>}
            {st.story && <p className="cs-pre">{st.story}</p>}
            {st.motive && <p><b>Мотивация:</b> {st.motive}</p>}
            {st.gmBonus && <p><b>Бонусы за предысторию (ГМ):</b> {st.gmBonus}</p>}
          </section>
        )}
        {opts.dev}
      </div>
      <footer className="cs-foot cs-small cs-muted">Собрано в «Мастерской героя». {chk.ok ? 'Проверка правил пройдена.' : `Не пройдено проверок: ${chk.errors.length}.`}</footer>
    </article>
  );
}

const Der = ({ t, children }: { t: string; children: ReactNode }) => <div><dt>{t}</dt><dd>{children}</dd></div>;

function Ancestor({ race }: { race: Any }) {
  const a = race.ancestor, Rr = R();
  if (!a || a.unknown) return null;
  if (a.companion) {
    const c = a.creature;
    return <>
      <EntityPic name={a.name} className="cs-anc" />
      <p><b>Призрак-помощник:</b> {a.name} — ур. {fmt(Rr.roundLevel(c.lvl))}; {Rr.STATS.map((k: string) => `${Rr.STAT_SHORT[k]} ${fmt(c[k])}`).join(', ')}</p>
      {a.abilities && a.abilities.length > 0 && <ul className="cs-small">{a.abilities.map((x: Any, i: number) => <li key={i}>{x.text}</li>)}</ul>}
    </>;
  }
  const kind = race.ancestorRule.kind;
  const list: Any[] = kind === 'monster' ? (a.picked ? [a.picked] : []) : (a.abilities || []);
  return <>
    {!a.race && <EntityPic name={a.name} className="cs-anc" />}
    <p><b>Предок:</b> {a.name}{a.add ? ` (+${race.ancestorRule.pct}% статов)` : ''}{a.symbol ? `, знак рода: ${a.symbol}` : ''}{a.demon ? `, стартовый магический символ: ${a.element || 'не задан'}` : ''}{a.race ? ' (половина бонуса расы)' : ''}</p>
    {list.length > 0 && <>
      <p className="cs-small"><b>{kind === 'dragon' ? 'Навыки предка (50% мощности)' : kind === 'monster' ? 'Умение монстра' : 'Навыки предка'}:</b></p>
      <ul className="cs-small">{list.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
    </>}
  </>;
}

function Boon({ st, res }: { st: Any; res: Any }) {
  const b = res.boon, Rr = R();
  if (!b) return <p><b>Дар / благословение / болезнь:</b> нет</p>;
  const kind = ({ gift: 'Тёмный дар', buff: 'Благословение', disease: 'Врождённая болезнь' } as Record<string, string>)[b.kind];
  const src = b.src, o = st.boonOpt || {};
  const extra: string[] = [];
  if (o.swapA && o.swapB) extra.push(`меняются местами: ${Rr.STAT_NAMES[o.swapA]} и ${Rr.STAT_NAMES[o.swapB]}`);
  if (o.otherRace) { const r = Rr.index.race.get(o.otherRace); if (r) extra.push(`бонусы расы «${r.name}»: ${r.bonus}; удвоенный штраф: ${r.penalty}`); }
  if (o.word) extra.push(`отрицаемое слово: «${o.word}»`);
  if (o.immunity) extra.push(`иммунитет к: ${o.immunity}`);
  if (o.prevSkill) extra.push(`физ. навык: ${o.prevSkill}`);
  if (o.prevSymbol) extra.push(`символ: ${o.prevSymbol}`);
  if (o.prevStance) extra.push(`стойка: ${o.prevStance}`);
  ['artifact', 'element', 'parts', 'beasts', 'replicantTrait'].forEach(k => { const r = Rr.rollView((st.rolls || {})[k]); if (r) extra.push(`бросок: ${r.v}${r.detail ? ' — ' + r.detail : ''}${r.n > 1 ? ` (бросков: ${r.n})` : ''}`); });
  return <>
    <p><b>{kind}: {cap(src.name)}</b> — {b.kind === 'gift' ? `${src.bonus} / цена: ${src.debuff}` : b.kind === 'buff' ? src.effect : `${src.e1} / ${src.e2}`}</p>
    {extra.length > 0 && <ul className="cs-small">{extra.map((x, i) => <li key={i}>{x}</li>)}</ul>}
  </>;
}

function Traits({ st, res }: { st: Any; res: Any }) {
  const ti = res.traits, Rr = R(), to = st.traitOpt || {};
  const info = (k: string) => Rr.index.traitPos.get(k) || Rr.index.traitNeg.get(k) || { name: k, effect: '' };
  const list = (base: string, n: number) => Array.from({ length: n }, (_, i) => to[Rr.optKey(base, i)]).filter(Boolean);
  const extra = (k: string, n: number) => {
    if (k === 'калека') return ` (убрано: рук ${to.arms || 0}, ног ${to.legs || 0})`;
    if (k === 'резистентный' && list('resist', n).length) return ` (${list('resist', n).join(', ')})`;
    if (k === 'уязвимый' && list('vuln', n).length) return ` (${list('vuln', n).join(', ')})`;
    if (k === 'тайное знание' && list('secretSymbol', n).length) return ` (${list('secretSymbol', n).join(', ')})`;
    if (k === 'проклят') {
      const rolls = Array.from({ length: n }, (_, i) => (st.rolls || {})[Rr.optKey('curse', i)]).filter(Boolean);
      if (rolls.length) return ` (${rolls.map((r: Any) => `${r.v}, ${r.block}${r.n > 1 ? `, бросков: ${r.n}` : ''}`).join('; ')})`;
    }
    return '';
  };
  const line = (arr: string[], label: string) => {
    if (!arr.length) return null;
    return <>
      <p><b>{label}:</b></p>
      <ul className="cs-small">{[...new Set(arr)].map(k => {
        const n = arr.filter(x => x === k).length, t = info(k);
        return <li key={k}><b>{cap(t.name.trim())}{n > 1 ? ` ×${n}` : ''}</b>{extra(k, n)} — {t.effect}</li>;
      })}</ul>
    </>;
  };
  if (!ti.pos.length && !ti.neg.length) return <p><b>Черты:</b> нет</p>;
  return <>{line(ti.pos, 'Положительные черты')}{line(ti.neg, 'Отрицательные черты')}</>;
}

function Gear({ st, res }: { st: Any; res: Any }) {
  const g = res.gear;
  const parts: ReactNode[] = [];
  if (g.weapon) {
    const w = g.weapon;
    parts.push(<p key="w"><b>Оружие:</b> {w.w.name} из материала «{w.m ? w.m.name : '—'}» — урон {w.damageTotal !== undefined ? fmt(w.damageTotal) : '—'}, {w.w.dt || ''}{w.w.range ? ', дальность ' + w.w.range : ''}{w.matEffect ? `; материал: ${w.matEffect.total || w.matEffect.text}` : ''}{w.w.fx ? `; ${w.w.fx}` : ''}</p>);
  }
  if (g.ammo) parts.push(<p key="am"><b>Боеприпасы:</b> {g.ammo.a.name}{g.ammo.m ? ` (${g.ammo.m.name}, урон ${fmt(g.ammo.damage)})` : ''}</p>);
  if (g.armor) {
    const a = g.armor;
    parts.push(<p key="a"><b>Броня:</b> {a.a.name} из материала «{a.m ? a.m.name : '—'}» — броня {a.armor !== undefined ? fmt(a.armor) : '—'}, штраф ловкости {a.pen}{a.matEffect ? `; материал: ${a.matEffect.total || a.matEffect.text}` : ''}</p>);
  }
  if (g.items.length) parts.push(<p key="i"><b>Предметы:</b> {g.items.map((i: Any) => i.label).join('; ')}</p>);
  if (st.misc) parts.push(<p key="m"><b>Прочее:</b> {st.misc}</p>);
  return parts.length ? <>{parts}</> : <p className="cs-muted">Без снаряжения.</p>;
}

// ------------------------------------------------------------ проверки и кнопки листа (мастер)

/** итог проверки правил: ошибки — ссылки на нужный шаг мастера */
export function Checks({ res }: { res: Any }) {
  const errs: Any[] = res.errors, warns: Any[] = res.warnings, notes: string[] = res.notes || [];
  const steps: Any[] = window.App.steps;
  const title = (id: string) => { const s = steps.find(x => x.id === id); return s ? s.short || s.title : id; };
  const go = (id: string) => { location.hash = '#create/' + id; };
  return (
    <div className={'cs-checks ' + (errs.length ? 'bad' : 'good')}>
      <h2><Icon name={errs.length ? 'alert' : 'check'} />{errs.length ? `Персонаж не готов: ${errs.length} ${window.App.plural(errs.length, 'ошибка', 'ошибки', 'ошибок')}` : 'Персонаж собран по правилам'}</h2>
      {errs.length > 0 && <ul>{errs.map((e, i) => <li key={i} className="err"><button type="button" className="link" onClick={() => go(e.step)}>{title(e.step)}</button>: {e.msg}</li>)}</ul>}
      {warns.length > 0 && <><h3>Замечания</h3><ul>{warns.map((e, i) => <li key={i} className="warn"><button type="button" className="link" onClick={() => go(e.step)}>{title(e.step)}</button>: {e.msg}</li>)}</ul></>}
      {notes.length > 0 && <><h3>Для ГМ</h3><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
    </div>
  );
}

/** «Ссылка для ГМ», файл, печать, картинка (сохранение — в оболочке мастера) */
export function SheetTools() {
  return (
    <div className="cs-tools no-print">
      <button type="button" className="btn small" onClick={() => act('shareLink')}><Icon name="copy" />Ссылка для ГМ</button>
      <button type="button" className="btn small" onClick={() => act('exportHero')}><Icon name="download" />Скачать файл</button>
      <button type="button" className="btn small" onClick={() => window.print()}>Печать / PDF</button>
      <button type="button" className="btn small" onClick={() => act('exportImage')}>Скачать картинку</button>
    </div>
  );
}
