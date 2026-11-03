import { C, changed, D, Empty, Field, fmt, KV, norm, R, Sel, set, signed, Stepper, Warn, type Any, type Opt, type StepProps } from './kit';

/* Шаг 7 — снаряжение: одно оружие и один элемент брони из одного материала, до трёх разных предметов, мелочи */
const units = (x: unknown) => typeof x === 'number' ? x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
const optReq = (x: Any) => { const r = R().reqText(x.req); return (r ? ', ' + r : '') + (typeof x.skill === 'number' ? `, ремесло ${x.skill}` : ''); };

export default function Gear({ st, res }: StepProps) {
  if (!res.race) return <Empty>Сначала выберите расу — размер влияет на количество материала и параметры предметов.</Empty>;
  const flags = res.flags, g = res.gear, Rr = R(), Cc = C(), size = res.size;
  const mats = Cc.START_MATERIALS.map((n: string) => Rr.index.material.get(norm(n))).filter(Boolean);
  const matOpts = (kind: 'w' | 'a'): Opt[] => [{ v: '', t: '— материал —' }, ...mats.map((m: Any) => ({ v: m.name, t: `${m.name} — ${kind === 'w' ? 'урон' : 'броня'} ${m[kind === 'w' ? 'dmg' : 'arm']}/ед.` }))];
  const groups: Record<string, string> = { 'ближний бой': 'Ближний бой', 'стрелковое': 'Стрелковое', 'магическое': 'Магическое (сфера, гримуар, жезл, посох)', 'молитвенное': 'Молитвенное', 'инструмент': 'Инструменты', 'снаряды': 'Метательное (расходник)' };
  const wOpts: Opt[] = [{ v: '', t: '— без оружия —' }, ...D().gear.weapons.filter((w: Any) => !Rr.NOT_WEAPON.includes(w.name))
    .map((w: Any) => ({ v: w.name, t: `${w.name} (${units(w.u)}+${units(w.un)} ед.${optReq(w)})`, group: groups[w.group] || w.group }))];
  const CLS: Record<string, string> = { 'лёгкая': 'Лёгкая', 'средняя': 'Средняя', 'тяжёлая': 'Тяжёлая', 'джаггернаут': 'Джаггернаутская', 'одежда': 'Одежда' };
  const aOpts: Opt[] = [{ v: '', t: '— без брони —' },
    ...D().gear.armor.map((a: Any) => ({ v: a.name, t: `${a.name} (${fmt(a.u)} ед.${optReq(a)}, штраф ловк. ${a.pen})`, group: CLS[a.cls] })),
    ...D().gear.shields.filter((s: Any) => !s.upgrade).map((s: Any) => ({ v: s.name, t: `${s.name} (${fmt(s.u)} ед.${optReq(s)}, штраф ловк. ${s.pen})`, group: 'Щиты' }))];
  const ammo = g.weapon ? Object.keys(Rr.AMMO).filter(a => Rr.AMMO[a].includes(g.weapon.w.name)) : [];
  return (
    <div className="wstack">
      <p className="note small">Можно взять одно оружие и один элемент брони из ограниченного списка, до {Cc.START_ITEMS} разных предметов (сумки, зелья, еда) и мелочи; зелья не сильнее {Cc.POTION_MAX}е. Оружие и броня — только монолитные, из одного материала.</p>
      {flags.noStartGear && <Warn err>{res.race.name}: на старте не могут взять экипировку — шаг пропускается.</Warn>}
      {size && size.k !== 1 && <p className="muted small">Размер «{size.name.toLowerCase()}»: сырья {size.mat} — единицы материала (урон и броня) умножаются на {fmt(size.k)} и округляются; требования предметов меняются на тот же процент (округление вверх).</p>}

      <div className="gear2">
        <section className="card wstack">
          <h2>Оружие</h2>
          {flags.noWeapon && <Warn err>{res.race.name}: не могут держать в руках оружие и инструменты.</Warn>}
          <div className="fgrid">
            <Field label="Тип"><Sel value={st.weapon.name} options={wOpts} onChange={v => set('weapon.name', v)} /></Field>
            <Field label="Материал"><Sel value={st.weapon.mat} options={matOpts('w')} onChange={v => set('weapon.mat', v)} /></Field>
          </div>
          {g.weapon && <WeaponCard w={g.weapon} />}
          {ammo.length > 0 && <>
            <h3>Боеприпасы <span className="muted small">(мелочи)</span></h3>
            <div className="fgrid">
              <Field label="Набор"><Sel value={st.ammo.name} options={[{ v: '', t: '— нет —' }, ...ammo.map(a => ({ v: a, t: a }))]} onChange={v => set('ammo.name', v)} /></Field>
              <Field label="Материал"><Sel value={st.ammo.mat} options={matOpts('w')} onChange={v => set('ammo.mat', v)} /></Field>
            </div>
            {g.ammo && <p className="small">{g.ammo.a.name}: урон {g.ammo.damage === null ? '—' : fmt(g.ammo.damage)}{g.ammo.m && ` (${g.ammo.m.dmg} × ${fmt(g.ammo.units)} ед.)`}, {g.ammo.a.fx}</p>}
          </>}
        </section>
        <section className="card wstack">
          <h2>Элемент брони</h2>
          <div className="fgrid">
            <Field label="Тип"><Sel value={st.armor.name} options={aOpts} onChange={v => set('armor.name', v)} /></Field>
            <Field label="Материал"><Sel value={st.armor.mat} options={matOpts('a')} onChange={v => set('armor.mat', v)} /></Field>
          </div>
          {g.armor && <ArmorCard a={g.armor} />}
        </section>
      </div>

      <section className="card wstack">
        <h2>Предметы: до {Cc.START_ITEMS}, разные</h2>
        <div className="items">{Array.from({ length: Cc.START_ITEMS }, (_, i) => <ItemSlot key={i} st={st} i={i} />)}</div>
        <Field label="Прочие мелочи" wide>
          <textarea rows={2} value={st.misc || ''} onChange={e => set('misc', e.target.value, true)} placeholder="Верёвка, огниво, фляга…" />
        </Field>
      </section>
      <p className="small muted">Слоты инвентаря: занято {fmt(res.der.slotsUsed)} из {fmt(res.der.slots)} (сила {fmt(res.stats.s)}{g.bagSlots ? ` + сумки ${g.bagSlots}` : ''}; каждый предмет — 1 слот, сумки места не занимают). Рук: {res.hands}.</p>
    </div>
  );
}

function Effect({ e, label }: { e: Any; label: string }) {
  if (!e) return null;
  return <li><b>{label}:</b> {e.text} <span className="chip">{e.scale}</span>
    {e.units !== undefined && (e.total ? <> → <b>{e.total}</b> <span className="muted">(× {fmt(e.units)} ед.)</span></> : <span className="muted"> (× {fmt(e.units)} ед.)</span>)}</li>;
}
function Req({ req }: { req: Any[] }) {
  if (!req.length) return <>нет</>;
  const Rr = R();
  return <>{req.map((x, i) => <span key={i} className={x.ok ? 'req-ok' : 'req-bad'}>{i ? ', ' : ''}{Rr.STAT_SHORT[x.stat]} {x.need} (у вас {fmt(x.have)})</span>)}</>;
}

function WeaponCard({ w }: { w: Any }) {
  const k = w.k;
  return <>
    <dl className="kvs">
      <KV k="Урон">{w.damage !== undefined ? <><b className="big">{fmt(w.damageTotal)}</b>
        {w.mul && <span className="muted"> (×{w.mul.v} — {w.mul.src})</span>}
        {w.bonus.length > 0 && <span className="muted"> ({fmt(w.damage)} {w.bonus.filter((b: Any) => b.kind === 'урон').map((b: Any) => `+${b.v} ${b.src}`).join(' ')})</span>}</> : '—'}</KV>
      {w.bonus.filter((b: Any) => b.kind === 'точность').map((b: Any, i: number) => <KV key={i} k="Точность">+{b.v} ({b.src})</KV>)}
      <KV k="Материал">{w.m ? `${w.m.name}: ${w.m.dmg} урона за ед.` : '—'}</KV>
      <KV k="Единиц материала">всего <b>{fmt(w.unitsTotal)}</b>: {fmt(w.units)} влияют на урон{k !== 1 && <span className="muted"> ({units(w.w.u)} × {fmt(k)} = {fmt(Math.round(w.w.u * k * 100) / 100)} → {fmt(w.units)})</span>} + {fmt(w.unitsNon)} не влияют</KV>
      {w.armorFromNon !== undefined && <KV k="Броня катара">{fmt(w.armorFromNon)}</KV>}
      <KV k="Тип урона">{w.w.dt || '—'}</KV>
      <KV k="Дальность">{w.w.range || '—'}</KV>
      <KV k="Требования"><Req req={w.req} /></KV>
      <KV k="Гнёзда / руки">{w.w.slots ?? '—'} / {w.w.hands ?? '—'}</KV>
      <KV k="Изготовить самому">{typeof w.w.skill === 'number' ? `ремесло ${w.w.skill}` : '—'}</KV>
    </dl>
    <ul className="wfx">{w.w.fx && <li><b>Свойство:</b> {w.w.fx}</li>}<Effect e={w.matEffect} label="Материал в оружии" /></ul>
  </>;
}

function ArmorCard({ a }: { a: Any }) {
  return <>
    <dl className="kvs">
      <KV k="Броня">{a.armor !== undefined ? <b className="big">{fmt(a.armor)}</b> : '—'}</KV>
      <KV k="Штраф ловкости">{a.pen}{a.penNote && <span className="muted"> ({a.penNote})</span>}</KV>
      <KV k="Материал">{a.m ? `${a.m.name}: ${a.m.arm} брони за ед.` : '—'}</KV>
      <KV k="Единиц материала">{fmt(a.units)}{a.k !== 1 && <span className="muted"> ({fmt(a.a.u)} × {fmt(a.k)} → {fmt(a.units)})</span>}</KV>
      <KV k="Требования"><Req req={a.req} /></KV>
      <KV k="Гнёзда для камней">{a.a.slots ?? '—'}</KV>
      <KV k="Изготовить самому">{typeof a.a.skill === 'number' ? `ремесло ${a.a.skill}` : '—'}</KV>
    </dl>
    <ul className="wfx">
      {a.a.fx && <li>{a.a.fx}</li>}
      <Effect e={a.matEffect} label="Материал в броне" />
      {a.statFx && (a.statFx.l || a.statFx.hpRegen) ? <li className="muted">Учтено: {a.statFx.l ? `ловкость ${signed(a.statFx.l)} ` : ''}{a.statFx.hpRegen ? `реген ХП ${signed(a.statFx.hpRegen)}` : ''}</li> : null}
    </ul>
  </>;
}

const KINDS: Opt[] = [{ v: '', t: '— пусто —' }, { v: 'bag', t: 'Сумка' }, { v: 'potion', t: 'Зелье' }, { v: 'food', t: 'Еда' }];
function ItemSlot({ st, i }: { st: Any; i: number }) {
  const it = (st.items || [])[i] || {};
  const Rr = R(), Cc = C();
  // смена типа предмета сбрасывает его поля
  const setKind = (kind: string) => {
    st.items = st.items || [];
    st.items[i] = { kind, name: '', effect: '', note: '', power: kind === 'potion' ? Cc.POTION_MAX : 0 };
    changed();
  };
  return (
    <div className="item-slot">
      <span className="item-n">{i + 1}</span>
      <div className="item-body">
        <Sel value={it.kind || ''} options={KINDS} onChange={setKind} label={`Предмет ${i + 1}`} />
        {it.kind === 'bag' && <Sel value={it.name} onChange={v => set(`items.${i}.name`, v)} label="Сумка"
          options={[{ v: '', t: '— сумка —' }, ...Rr.index.bags.map((b: Any) => ({ v: b.name, t: `${b.name} (${b.effect})` }))]} />}
        {it.kind === 'food' && <Sel value={it.name} onChange={v => set(`items.${i}.name`, v)} label="Блюдо"
          options={[{ v: '', t: '— блюдо —' }, ...D().alchemy.food.map((f: Any) => ({ v: f.name, t: `${f.name}: ${f.e.join(', ')}` }))]} />}
        {it.kind === 'potion' && <>
          <Sel value={it.effect} onChange={v => set(`items.${i}.effect`, v)} label="Эффект зелья" options={[{ v: '', t: '— эффект —' }, ...Rr.POTION_TYPES.map((p: string) => ({ v: p, t: p }))]} />
          <input type="text" value={it.note || ''} onChange={e => set(`items.${i}.note`, e.target.value, true)} placeholder="уточнение (напр. «огонь»)" aria-label="Уточнение зелья" />
          <label className="winline">Сила, е <Stepper value={+it.power || 0} min={0} max={Cc.POTION_MAX} step={5} label="Сила зелья" onChange={v => set(`items.${i}.power`, v)} /></label>
        </>}
      </div>
    </div>
  );
}
