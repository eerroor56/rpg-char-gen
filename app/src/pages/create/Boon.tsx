import { useState } from 'react';
import { act, Applied, CalcMark, cap, D, DmgList, Field, fmt, norm, R, ReqNote, RollBox, Search, Seg, Sel, set, signed, Warn, type Any, type Opt, type StepProps } from './kit';
import { Icon } from '../../ui/Icon';

/* Шаг 3 — что-то одно из тёмных даров, врождённых благословений и болезней (или ничего) */
type Tab = 'gift' | 'buff' | 'disease';
type Item = { name: string; a: string; b: string; la: string; lb: string };

function listOf(tab: Tab): Item[] {
  const S = D().skills;
  if (tab === 'gift') return S.gifts.map((g: Any) => ({ name: g.name, a: g.bonus, b: g.debuff, la: 'Дар', lb: 'Цена' }));
  if (tab === 'buff') return S.buffs.filter((b: Any) => b.birth).map((b: Any) => ({ name: b.name, a: b.effect, b: b.dur ? `длительность: ${b.dur}` : '', la: 'Эффект', lb: '' }));
  return S.diseases.filter((d: Any) => d.birth).map((d: Any) => ({ name: d.name, a: d.e1, b: d.e2, la: 'Эффект', lb: 'Проявление' }));
}

export default function Boon({ st, res }: StepProps) {
  const [tab, setTab] = useState<Tab>((st.boon.kind as Tab) || 'gift');
  const [q, setQ] = useState('');
  const isHom = res.race && res.race.id === 'гомункулы';
  const S = D().skills;
  const list = listOf(tab);
  const nq = norm(q);
  const shown = nq ? list.filter(it => norm(`${it.name} ${it.a} ${it.b}`).includes(nq)) : list;
  const blocked = isHom && tab !== 'gift';
  const pick = (kind: string, name: string) => {
    const fresh = kind && !(st.boon.kind === kind && st.boon.name === name);
    act('pickBoon', { kind, name });
    if (fresh) window.scrollTo({ top: 0, behavior: 'smooth' });   // выбранное и его параметры — вверху шага
  };
  return (
    <div className="wstack">
      <p className="note small">Из тёмных даров, благословений и болезней можно взять что-то одно — или ничего. Доступны только врождённые (♥) благословения и болезни.</p>
      {isHom && <Warn>Гомункулы на старте не берут экипировку, проклятие, благословение и болезнь — доступны только тёмные дары.</Warn>}

      {res.boon ? <BoonOptions st={st} res={res} onDrop={() => pick('', '')} /> : (
        <div className="card wz-none"><Icon name="check" /><span>{st.boon.kind ? 'Выбранное не найдено в таблице — выберите заново.' : 'Сейчас ничего не взято — это тоже допустимо.'}</span></div>
      )}

      <Seg<Tab> value={tab} onChange={t => { setTab(t); setQ(''); }} label="Что выбрать" items={[
        { id: 'gift', t: <>Тёмные дары <small>{S.gifts.length}</small></> },
        { id: 'buff', t: <>Благословения ♥ <small>{S.buffs.filter((b: Any) => b.birth).length}</small></> },
        { id: 'disease', t: <>Болезни ♥ <small>{S.diseases.filter((d: Any) => d.birth).length}</small></> },
      ]} />
      <Search value={q} onChange={setQ} placeholder="Поиск по названию и эффекту" />
      <p className="muted small">{nq ? `Найдено: ${shown.length} из ${list.length}` : `Всего: ${list.length}`}</p>
      {shown.length ? (
        <div className="opt-grid">
          {shown.map(it => {
            const on = st.boon.kind === tab && norm(st.boon.name) === norm(it.name);
            const fx = (R().BOON_FX[tab] || {})[norm(it.name)];
            return (
              <button key={it.name} type="button" className={'opt-card' + (on ? ' is-on' : '')} disabled={blocked} aria-pressed={on} onClick={() => pick(tab, it.name)}>
                <span className="oc-name">{cap(it.name)}{fx && <> <CalcMark /></>}{on && <Icon name="check" />}</span>
                <span className="oc-a"><b>{it.la}:</b> {it.a}</span>
                {it.b && <span className="oc-b">{it.lb && <b>{it.lb}: </b>}{it.b}</span>}
              </button>
            );
          })}
        </div>
      ) : <p className="muted">По запросу «{q}» ничего нет.</p>}
    </div>
  );
}

function BoonOptions({ st, res, onDrop }: StepProps & { onDrop: () => void }) {
  const b = res.boon, fx = b.fx, o = st.boonOpt || {}, Rr = R(), S = D().skills;
  const statOpts: Opt[] = [{ v: '', t: '—' }, ...Rr.STATS.map((k: string) => ({ v: k, t: Rr.STAT_NAMES[k] }))];
  const KIND: Record<string, string> = { gift: 'Тёмный дар', buff: 'Благословение', disease: 'Врождённая болезнь' };
  const applied: string[] = [];
  const list = (m: Record<string, number>, f: (k: string, v: number) => string) => Object.entries(m).map(([k, v]) => f(k, v)).join(', ');
  if (fx.stat) applied.push(list(fx.stat, (k, v) => `${Rr.STAT_NAMES[k]} ${signed(v)}`));
  if (fx.mul) applied.push(list(fx.mul, (k, v) => `${Rr.STAT_NAMES[k]} ×${fmt(v)}`));
  if (fx.pct) applied.push(list(fx.pct, (k, v) => `${Rr.STAT_NAMES[k]} +${v}%`));
  if (fx.allPct) applied.push(`все характеристики +${fx.allPct}%`);
  if (fx.size) applied.push(`размер ${signed(fx.size)}`);
  if (fx.od) applied.push(`ОД ${signed(fx.od)}`);
  if (fx.zor) applied.push(`зоркость ${signed(fx.zor)}`);
  if (fx.prayers) applied.push(`молитвы +${fx.prayers}`);
  if (fx.mpRegenMul) applied.push(`реген МП ×${fx.mpRegenMul}`);
  if (fx.noHpRegen) applied.push('реген ХП отключён');
  if (fx.void) applied.push('нет параметра «тело»: ХП = дух');
  if (fx.noCast) applied.push('ячейки заклинаний: 0');
  if (fx.expMul) applied.push(`опыт ×${fx.expMul}`);
  if (fx.gold) applied.push(`${fx.gold} золотых монет в начале`);
  if (fx.freePos) applied.push(`+${fx.freePos} положительная черта`);
  const ROLLS: Record<string, string> = { artifact: 'случайный артефакт', element: 'случайный символ', parts: 'сколько частей тела (1–3)', beasts: 'сколько существ (2–4)' };
  const src = listOf(st.boon.kind as Tab).find(it => norm(it.name) === norm(b.src.name));

  let extra = null;
  if (fx.option === 'swap') extra = <>
    <p>Итоговые значения двух характеристик меняются местами.</p>
    <div className="fgrid">
      <Field label="Параметр 1"><Sel value={o.swapA} options={statOpts} onChange={v => set('boonOpt.swapA', v)} /></Field>
      <Field label="Параметр 2"><Sel value={o.swapB} options={statOpts} onChange={v => set('boonOpt.swapB', v)} /></Field>
    </div>
  </>;
  if (fx.option === 'otherRace') {
    const other = Rr.index.race.get(o.otherRace);
    const noPen = other && (!other.penalty || /^нет$/i.test(other.penalty.trim()));
    extra = <>
      <Field label="Раса, чьи стартовые бонусы вы берёте">
        <Sel value={o.otherRace} onChange={v => set('boonOpt.otherRace', v)}
          options={[{ v: '', t: '— раса —' }, ...D().races.filter((r: Any) => r.playable && r.id !== 'полукровка').map((r: Any) => ({ v: r.id, t: cap(r.name) }))]} />
      </Field>
      {other && <div className="bp">
        <div className="bp-item plus"><h3>Бонус</h3><p>{other.bonus}</p></div>
        <div className="bp-item minus"><h3>Удвоенный штраф</h3><p>{noPen ? 'у расы нет штрафа — вы получите случайную удвоенную негативную черту' : other.penalty + ' (×2)'}</p></div>
      </div>}
      {noPen && <RollBox kind="replicantTrait" label="случайная негативная черта" st={st} />}
    </>;
  }
  if (fx.option === 'word') extra = <Field label="Слово с отрицанием (напр. «несправедливость», «неподвижность», «неудача»)"><input type="text" value={o.word || ''} onChange={e => set('boonOpt.word', e.target.value, true)} /></Field>;
  if (fx.option === 'immunity') extra = <><Field label="Тип урона для иммунитета"><input type="text" list="dmgTypes" value={o.immunity || ''} onChange={e => set('boonOpt.immunity', e.target.value, true)} /></Field><DmgList /></>;
  if (fx.option === 'prevExp') {
    const syms: Opt[] = [{ v: '', t: '— символ —' }, ...S.symbols.filter((s: Any) => s.cat !== 'запретные знания')
      .map((s: Any) => ({ v: s.name, t: `${s.name} (${s.req})`, group: s.cat === 'порицаемая' ? 'Порицаемые' : 'Обычные' }))
      .sort((a: Opt, z: Opt) => (a.group === z.group ? 0 : a.group === 'Обычные' ? -1 : 1))];
    const actList: Any[] = S.startActives || [], stList: Any[] = S.startStances || [];   // открытые списки для создания
    const sk = actList.find(a => a.name === o.prevSkill), stc = stList.find(a => a.name === o.prevStance);
    extra = <>
      <p>Можно выбрать 1 физический навык, 1 символ (из разрешённых), 1 стойку и 1 дополнительную положительную черту. Доп. черта выбирается на шаге «Черты» — лимит положительных увеличен на 1.</p>
      <div className="fgrid">
        <Field label="Физический навык"><Sel value={o.prevSkill} onChange={v => set('boonOpt.prevSkill', v)} options={[{ v: '', t: '— физ. навык —' }, ...actList.map(a => ({ v: a.name, t: `${a.name} (${a.req || 'без требований'})` }))]} /></Field>
        <Field label="Магический символ (обычный или порицаемый)"><Sel value={o.prevSymbol} options={syms} onChange={v => set('boonOpt.prevSymbol', v)} /></Field>
        <Field label="Стойка"><Sel value={o.prevStance} onChange={v => set('boonOpt.prevStance', v)} options={[{ v: '', t: '— стойка —' }, ...stList.map(s => ({ v: s.name, t: `${s.name} (${s.req})` }))]} /></Field>
      </div>
      <ReqNote req={sk && sk.req} res={res} />
      <ReqNote req={stc && stc.req} res={res} />
      {sk && <p className="small"><b>{sk.name}:</b> {sk.effect}; КД {sk.cd}</p>}
      {stc && <p className="small"><b>{stc.name}:</b> {stc.effect}</p>}
    </>;
  }
  return (
    <article className="card chosen wstack">
      <header className="chosen-head">
        <div>
          <p className="eyebrow">Выбрано · {KIND[st.boon.kind] || ''}</p>
          <h2>{cap(b.src.name)}</h2>
        </div>
        <button type="button" className="btn ghost small" onClick={onDrop}>Ничего не брать</button>
      </header>
      {src && <p className="small"><b>{src.la}:</b> {src.a}{src.b && <><br /><b>{src.lb || 'Ещё'}:</b> {src.b}</>}</p>}
      {extra}
      {fx.roll && <RollBox kind={fx.roll} label={ROLLS[fx.roll]} st={st} />}
      <Applied items={applied} />
    </article>
  );
}
