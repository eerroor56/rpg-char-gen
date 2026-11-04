import { useState, type ReactNode } from 'react';
import { act } from '../../lib/legacy';
import { fmt, norm, signed, type Any } from '../create/kit';
import { LegacyHtml, Needs } from './gearKit';

/*
 * «Изготовить» (ГМ выдаёт предмет, собранный из материалов): вид и основа, материал на урон и на остальное, огнестрел
 * (стволы, ресивер, прицел, обойма, модель, патроны, топливо), улучшения (заточка, усиленное ремесло, модель, обогатитель,
 * напыление, модули, глифы, камни, существо в предмете), название, цена. Черновик — App.ui.invDraft; его меняют и выдают
 * действия js/inventory.js (invField, invPartAdd, invSave…: они же пересчитывают нужный материал); расчёт — Craft.compute.
 */
const ARMORISH = ['armor', 'shield', 'prosthesis'];
const roleKind = (kind: string) => kind === 'weapon' || kind === 'gun';

// make — игрок создаёт сам из рюкзака: без усиленного ремесла, существа в предмете, особых свойств и своей цены (это решает ГМ),
// материал — из рюкзака, «что нужно» и кнопка «Создать» (invMake)
export function CraftForm({ v, make }: { v: Any; make?: boolean }) {
  const App = window.App, K = window.Craft, C = (window as Any).GM_CONFIG, Rr = window.Rules, I = window.Inv;
  const [, tick] = useState(0);
  const re = () => tick(t => t + 1);
  if (!App.ui.invDraft) act('invReset');
  const d = App.ui.invDraft, cr = d.craft;
  // поле черновика: действие прежнего сайта сохраняет его и, если надо, пересобирает строки материала
  const field = (k: string, value: unknown, type?: 'number' | 'checkbox') => {
    App.actions.invField.call(App, { dataset: { k }, value: String(value ?? ''), checked: !!value, type });
    re();
  };
  const run = (name: string, ds: Record<string, string> = {}, value?: string, checked?: boolean) => { act(name, ds, value, checked); re(); };

  const bases: Any[] = K.BASES[d.kind]();
  const item = Object.assign({}, d, { name: d.name || K.autoName(d) });
  const c = d.base ? K.compute(item, v.ctx) : null;
  const isW = roleKind(d.kind), isA = ARMORISH.includes(d.kind), isG = d.kind === 'gun';
  const u2 = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const num = (x: unknown) => { const y = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(y) ? y : 0; };

  const head = (
    <div className="fgrid">
      <label className="fld"><span className="fld-l">Вид</span>
        <select className="sel" value={d.kind} onChange={e => run('invKind', {}, e.target.value)}>{K.CRAFTABLE.map((k: string) => <option key={k} value={k}>{K.KIND_NAMES[k]}</option>)}</select></label>
      <label className="fld"><span className="fld-l">{isG ? 'Корпус' : 'Основа'}</span>
        <select className="sel" value={d.base} onChange={e => field('base', e.target.value)}>
          <option value="">— выберите —</option>
          {bases.map(b => <option key={b.name} value={b.name}>{b.name}{typeof b.u === 'number' ? ` (${u2(b.u)}${typeof b.un === 'number' && b.un ? '+' + u2(b.un) : ''} ед.)` : ''}</option>)}
        </select></label>
      <label className="fld"><span className="fld-l">Размер предмета <span className="muted">— под какой рост сделан</span></span>
        <select className="sel" value={d.size || 'н'} onChange={e => field('size', e.target.value)}>{Rr.SIZES.map((z: Any) => <option key={z.id} value={z.id}>{z.name} (сырьё {z.mat})</option>)}</select></label>
    </div>
  );
  if (!d.base || !c) return <div className="wstack">{head}<p className="muted small">{isG
    ? 'Выберите корпус — он задаёт, сколько стволов поместится. Детали огнестрела — из таблицы «оружие и броня», дальше пушка собирается из любых слитков по единицам.'
    : 'Выберите основу — из таблицы «оружие и броня». Дальше её можно собрать из любых слитков по единицам.'}</p></div>;

  // сколько материала нужно и сколько распределено
  const sum = (role: 'dmg' | 'non' | 'all') => {
    const have = cr.parts.filter((p: Any) => role === 'all' || p.role === role).reduce((a: number, p: Any) => a + num(p.u), 0);
    const need = role === 'dmg' ? c.needDmg : role === 'non' ? c.needNon : c.need;
    return <span className="muted small">нужно {fmt(need)} ед., распределено <b className={Math.abs(have - need) > 0.01 ? 'gr-bad' : 'bw-ok'}>{fmt(Math.round(have * 100) / 100)}</b></span>;
  };
  const parts = (role?: string) => cr.parts.map((p: Any, i: number) => ({ p, i })).filter((x: Any) => (isW ? x.p.role === role : true)).map(({ p, i }: Any) => (
    <div key={i} className="bw-row">
      <input type="text" list="crMats" value={p.mat || ''} onChange={e => field(`craft.parts.${i}.mat`, e.target.value)} placeholder="материал или камень" aria-label="Материал" />
      <input type="number" min={0} step={0.1} className="gr-num" value={p.u} onChange={e => field(`craft.parts.${i}.u`, e.target.value, 'number')} aria-label="Единиц" />
      <span className="muted small">ед.</span>
      <button type="button" className="link small" onClick={() => run('invPartDel', { v: String(i) })}>убрать</button>
    </div>
  ));
  const syms: string[] = (window.GAME_DATA.skills.symbols || []).map((x: Any) => x.name);
  const creatures: Any[] = window.GMLock && window.GMLock.unlocked && window.GAME_DATA.creatures ? window.GAME_DATA.creatures : [];
  const soulC = cr.soul && cr.soul.mode === 'monster' && cr.soul.creature ? creatures.find(x => norm(x.n) === norm(cr.soul.creature)) : null;
  const anyBoost = cr.coat.length || cr.sharpen || cr.modules.length || cr.model || cr.glyphs.length || cr.inlays.length || +cr.quality > 1 || cr.enrich || (cr.soul && cr.soul.mode) || cr.extra;

  return (
    <div className="wstack cr">
      {head}
      {make ? <datalist id="crMats">{I.bagMats(v).map(({ m, have }: Any) => <option key={m.name} value={m.name}>в рюкзаке {fmt(have)} ед. · урон {m.dmg} · броня {m.arm}</option>)}</datalist>
        : <datalist id="crMats">{K.allMaterials().map((m: Any) => <option key={m.name} value={m.name}>урон {m.dmg} · броня {m.arm}{K.isCrystal(m.name) ? ' · камень' : ''}</option>)}</datalist>}
      {isG && <Gun d={d} c={c} field={field} run={run} />}
      {isW ? <>
        <h3>Материал на урон{isG && <span className="muted small"> (стволы, ресивер, корпус)</span>} {sum('dmg')}</h3>
        <div className="bw-rows">{parts('dmg')}</div>
        <div><button type="button" className="link" onClick={() => run('invPartAdd', { v: 'dmg' })}>+ материал</button></div>
        <h3>Остальное{isG && <span className="muted small"> (прицел, обойма — урон не добавляют)</span>} {sum('non')}</h3>
        <div className="bw-rows">{parts('non')}</div>
        <div><button type="button" className="link" onClick={() => run('invPartAdd', { v: 'non' })}>+ материал</button></div>
      </> : <>
        <h3>Материал {sum('all')}</h3>
        <div className="bw-rows">{parts()}</div>
        <div><button type="button" className="link" onClick={() => run('invPartAdd', { v: 'non' })}>+ материал</button></div>
      </>}
      <p className="muted small">Эффект материала действует, если его не меньше {fmt(c.need <= 0.5 ? C.CRAFT.EFFECT_MIN_SMALL : C.CRAFT.EFFECT_MIN_UNITS)} ед. Урон и броня — сумма по единицам.</p>

      <details className="more cr-more" open={!!anyBoost}>
        <summary>Улучшения: напыление, заточка, глифы, камни…</summary>
        <div className="wstack">
          <div className="fgrid">
            <label className="fld"><span className="fld-l">{isA ? 'Улучшение на броневом верстаке' : 'Заточка на точильном станке'} <span className="muted">— +{C.CRAFT.SHARPEN_STEP}% {isA ? 'защиты' : 'урона'} за раз, до {C.CRAFT.SHARPEN_MAX}; поломка — от {C.CRAFT.SHARPEN_BREAK_FROM}%</span></span>
              <input type="number" min={0} max={C.CRAFT.SHARPEN_MAX} step={1} value={cr.sharpen || 0} onChange={e => field('craft.sharpen', e.target.value, 'number')} /></label>
            {!make && <label className="fld"><span className="fld-l">Усиленное ремесло <span className="muted">— 2Х — 40%, 3Х — 20%, если с нуля из своего материала</span></span>
              <select className="sel" value={String(cr.quality || 1)} onChange={e => field('craft.quality', e.target.value)}>{C.CRAFT.QUALITY.map((q: number) => <option key={q} value={q}>{q === 1 ? 'нет' : `${q}Х`}</option>)}</select></label>}
            <label className="fld"><span className="fld-l">Модель <span className="muted">— с 100 ур. ремесла</span></span>
              <select className="sel" value={cr.model || ''} onChange={e => field('craft.model', e.target.value)}><option value="">— нет —</option>{K.models().map((m: Any) => <option key={m.id} value={m.id}>{m.name}: {m.fx}</option>)}</select></label>
            <label className="gr-check"><input type="checkbox" checked={!!cr.enrich} onChange={e => field('craft.enrich', e.target.checked, 'checkbox')} /><span>Обогатитель: эффект материала 2Х</span></label>
          </div>

          <ListBlock title={<>Напыление <span className="muted small">даёт эффект металла, тратит целый слиток; на 1 оружие — 1</span></>} items={cr.coat} add="+ напыление"
            onAdd={() => run('invListAdd', { k: 'coat' })} onDel={i => run('invListDel', { k: 'coat', v: String(i) })}
            render={(m, i) => <input type="text" list="crMats" value={m} onChange={e => field(`craft.coat.${i}`, e.target.value)} aria-label="Напыление" />} />

          {isW && !isG && <>
            <h3>Доп. модули</h3>
            <div className="gr-st-list">{K.modules().map((m: Any) => (
              <label key={m.name} className={'gr-check' + (cr.modules.includes(m.name) ? ' is-on' : '')}>
                <input type="checkbox" checked={cr.modules.includes(m.name)} onChange={e => run('invModule', { v: m.name }, undefined, e.target.checked)} />
                <span>{m.name} <span className="muted small">({fmt(m.u)} ед.) {m.fx}</span></span>
              </label>
            ))}</div>
          </>}

          <datalist id="crSyms">{syms.map(s => <option key={s} value={s} />)}</datalist>
          <ListBlock title={<>Зачарование глифами <span className="muted small">до {c.glyphMax}; мощь — {C.CRAFT.GLYPH_POWER}% от {isA ? 'брони' : 'атаки'} = {fmt(c.glyphPower)}{c.glyphMul > 1 ? ` (×${c.glyphMul} от таумия / рунного кристалла)` : ''}</span></>}
            items={cr.glyphs} add="+ глиф" onAdd={() => run('invListAdd', { k: 'glyphs' })} onDel={i => run('invListDel', { k: 'glyphs', v: String(i) })}
            render={(g, i) => <>
              <input type="text" list="crSyms" value={g.sym || ''} onChange={e => field(`craft.glyphs.${i}.sym`, e.target.value)} placeholder="символ" aria-label="Символ глифа" />
              <label className="winline"><input type="checkbox" checked={!!g.temp} onChange={e => field(`craft.glyphs.${i}.temp`, e.target.checked, 'checkbox')} style={{ width: 'auto', minHeight: 0 }} /> временный</label>
            </>} />

          <ListBlock title={<>Инкрустация и украшение <span className="muted small">камни и металлы дают свой «эффект украшения»</span></>} items={cr.inlays} add="+ камень"
            onAdd={() => run('invListAdd', { k: 'inlays' })} onDel={i => run('invListDel', { k: 'inlays', v: String(i) })}
            render={(m, i) => <input type="text" list="crMats" value={m} onChange={e => field(`craft.inlays.${i}`, e.target.value)} aria-label="Камень" />} />

          {!make && <>
          <h3>Существо в предмете</h3>
          <div className="fgrid">
            <label className="fld"><span className="fld-l">Как</span>
              <select className="sel" value={cr.soul.mode || ''} onChange={e => field('craft.soul.mode', e.target.value)}>
                <option value="">— нет —</option><option value="soul">заточённая душа (алтарь демонов, камень душ)</option><option value="monster">предмет из монстра (алтарь крови)</option>
              </select></label>
            {cr.soul.mode && <label className="fld"><span className="fld-l">Существо</span>
              <input type="text" list="crCreatures" value={cr.soul.creature || ''} onChange={e => field('craft.soul.creature', e.target.value)} placeholder="из бестиария" /></label>}
          </div>
          {cr.soul.mode && <>
            <datalist id="crCreatures">{creatures.map(x => <option key={x.n} value={x.n}>ур. {fmt(Rr.roundLevel(x.lvl))}</option>)}</datalist>
            {!creatures.length && <p className="muted small">Статы существ — в бестиарии: откройте закрытые разделы паролем ГМ.</p>}
            {soulC && (soulC.ab || []).length > 0 && <>
              <p className="small">Способности (1 пассивная и 1 активная):</p>
              <div className="gr-st-list">{soulC.ab.map((a: Any) => { const t = a[1] || a[0]; const on = (cr.soul.abilities || []).includes(t); return (
                <label key={t} className={'gr-check' + (on ? ' is-on' : '')}><input type="checkbox" checked={on} onChange={e => run('invAbility', { v: t }, undefined, e.target.checked)} /><span>{t}</span></label>
              ); })}</div>
            </>}
          </>}
          <label className="fld"><span className="fld-l">Особые свойства</span>
            <textarea rows={2} value={cr.extra || ''} onChange={e => field('craft.extra', e.target.value)} placeholder="наполнение кровью, маной, силой демона; уникальные свойства" /></label>
          </>}
        </div>
      </details>

      <div className="fgrid">
        <label className="fld"><span className="fld-l">Название</span><input type="text" value={d.name || ''} onChange={e => field('name', e.target.value)} placeholder={K.autoName(d)} /></label>
        <label className="fld"><span className="fld-l">Количество</span><input type="number" min={1} step={1} value={d.qty || 1} onChange={e => field('qty', e.target.value, 'number')} /></label>
        <label className="fld"><span className="fld-l">Заметка</span><input type="text" value={d.note || ''} onChange={e => field('note', e.target.value)} placeholder="кто выковал, откуда" /></label>
        {!make && <label className="fld"><span className="fld-l">Своя цена <span className="muted">— за штуку: «5(се)», «2 з 50 се»; пусто — по материалам</span></span>
          <input type="text" value={d.priceIn || ''} onChange={e => field('priceIn', e.target.value)} placeholder="по материалам" maxLength={60} /></label>}
      </div>

      <Preview item={item} c={c} />
      <Price d={d} item={item} v={v} make={make} />
      {make ? <>
        <Needs list={I.forgeNeeds(v, d).list} />
        <div className="row">
          <button type="button" className="btn primary" onClick={() => run('invMake')}>Создать</button>
          <button type="button" className="btn ghost" onClick={() => run('invReset')}>Очистить</button>
        </div>
      </> : <div className="row">
        <button type="button" className="btn primary" onClick={() => run('invSave')}>{d.editId ? 'Сохранить изменения' : 'Выдать'}</button>
        <button type="button" className="btn ghost" onClick={() => run('invReset')}>{d.editId ? 'Отмена' : 'Очистить'}</button>
      </div>}
    </div>
  );
}

function ListBlock({ title, items, add, onAdd, onDel, render }: { title: ReactNode; items: Any[]; add: string; onAdd: () => void; onDel: (i: number) => void; render: (x: Any, i: number) => ReactNode }) {
  return <>
    <h3>{title}</h3>
    {items.length > 0 && <div className="bw-rows">{items.map((x, i) => <div key={i} className="bw-row">{render(x, i)}<button type="button" className="link small" onClick={() => onDel(i)}>убрать</button></div>)}</div>}
    <div><button type="button" className="link" onClick={onAdd}>{add}</button></div>
  </>;
}

// детали огнестрела: стволы, ресивер, прицел, обойма, модель, патроны, топливо
function Gun({ d, c, field, run }: { d: Any; c: Any; field: (k: string, v: unknown, t?: 'number' | 'checkbox') => void; run: (n: string, ds?: Record<string, string>) => void }) {
  const K = window.Craft, C = (window as Any).GM_CONFIG, Rr = window.Rules;
  const G = K.guns(), g = d.craft.gun, fuels: Any[] = K.fuels();
  if (!g) return null;
  const u2 = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const u = (p: Any) => `${u2(p.u)} ед.${p.reqRaw ? ', ' + p.reqRaw : ''}`;
  const body = K.baseOf('gun', d.base) || {};
  const gc = c && c.gun;
  return <>
    <h3>Стволы {gc && <span className="muted small">ячеек <b className={gc.cells > gc.cap ? 'gr-bad' : 'bw-ok'}>{gc.cells}</b> из {gc.cap} · выстрелов за раз: {gc.shots}</span>}</h3>
    <div className="bw-rows">{g.barrels.map((b: Any, i: number) => (
      <div key={i} className="bw-row">
        <select className="sel" value={b.name} onChange={e => field(`craft.gun.barrels.${i}.name`, e.target.value)} aria-label="Ствол">{G.barrels.map((p: Any) => <option key={p.name} value={p.name}>{p.name} ({u(p)}){p.fx ? ' — ' + p.fx : ''}</option>)}</select>
        <input type="number" min={1} step={1} className="gr-num" value={b.n} onChange={e => field(`craft.gun.barrels.${i}.n`, e.target.value, 'number')} aria-label="Сколько таких стволов" />
        <span className="muted small">шт.</span>
        {g.barrels.length > 1 && <button type="button" className="link small" onClick={() => run('invGunDel', { v: String(i) })}>убрать</button>}
      </div>
    ))}</div>
    <div><button type="button" className="link" onClick={() => run('invGunAdd')}>+ ствол другого вида</button></div>
    <div className="fgrid">
      <label className="fld"><span className="fld-l">Ресивер</span><select className="sel" value={g.receiver || ''} onChange={e => field('craft.gun.receiver', e.target.value)}><option value="">— нет —</option>{G.receivers.map((p: Any) => <option key={p.name} value={p.name}>{p.name} ({u(p)}){p.fx ? ' — ' + p.fx : ''}</option>)}</select></label>
      <label className="fld"><span className="fld-l">Прицел</span><select className="sel" value={g.scope || ''} onChange={e => field('craft.gun.scope', e.target.value)}><option value="">— нет —</option>{G.scopes.map((p: Any) => <option key={p.name} value={p.name}>{p.name} ({u2(p.u)} ед.) — {p.fx}</option>)}</select></label>
      {G.clip && <label className="fld"><span className="fld-l">Обойма, патронов <span className="muted">— {u2(G.clip.u)} ед. на патрон, до {G.clip.max}; 0 — без обоймы</span></span>
        <input type="number" min={0} max={G.clip.max} step={1} value={g.clip || 0} onChange={e => field('craft.gun.clip', e.target.value, 'number')} /></label>}
      <label className="fld"><span className="fld-l">Модель огнестрела</span><select className="sel" value={g.model || ''} onChange={e => field('craft.gun.model', e.target.value)}>{G.models.map((p: Any) => <option key={p.name} value={p.name}>{p.name} — {p.fx}</option>)}</select></label>
      <label className="fld"><span className="fld-l">Патроны</span><select className="sel" value={(g.ammo || {}).type || ''} onChange={e => field('craft.gun.ammo.type', e.target.value)}><option value="">— не заряжено —</option>{G.ammo.map((p: Any) => <option key={p.name} value={p.name}>{p.name} ({u2(p.u)} ед.){p.fx ? ' — ' + p.fx : ''}</option>)}</select></label>
      <label className="fld"><span className="fld-l">Материал патронов</span><input type="text" list="crMats" value={(g.ammo || {}).mat || ''} onChange={e => field('craft.gun.ammo.mat', e.target.value)} placeholder="сталь, свинец, серебро…" /></label>
      <label className="fld"><span className="fld-l">Топливо</span><input type="text" list="crFuels" value={g.fuel || ''} onChange={e => field('craft.gun.fuel', e.target.value)} placeholder={fuels.length ? 'порох, огненная соль…' : 'название; список — после пароля ГМ'} /></label>
      <label className="fld"><span className="fld-l">Руки</span><select className="sel" value={String(g.hands || '')} onChange={e => field('craft.gun.hands', e.target.value)}>
        <option value="">по корпусу: {C.GUNS.HANDS[Rr.norm(body.name || '')] || C.GUNS.DEFAULT_HANDS}</option><option value="1">одна</option><option value="2">две</option></select></label>
    </div>
    <datalist id="crFuels">{fuels.map(f => <option key={f.name} value={f.name}>{f.fx}</option>)}</datalist>
    <p className="muted small">Урон = урон металла пушки, затем модель (пневматика — 50%, магнитно-электронное — ×1,5) и топливо («урон 2х» у пороха). Эффект металла — как у любого оружия, ниже в списке эффектов. Патроны урона не добавляют — дают свой эффект и эффект своего материала. Стволов за раз — столько выстрелов.</p>
  </>;
}

// что получится: урон, броня, требования, гнёзда, эффекты, предупреждения
function Preview({ item, c }: { item: Any; c: Any }) {
  const K = window.Craft, I = window.Inv, Rr = window.Rules;
  const bits: [string, ReactNode][] = [];
  if (c.damage !== null && c.damage !== undefined) bits.push(['Урон', <>{fmt(c.damage)}{c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : ''}{c.gun && c.mult.length ? <span className="muted small"> (металл {fmt(c.gun.metal)})</span> : null}</>]);
  if (c.gun) bits.push(['Огнестрел', I.gunStats(c)]);
  if (c.armor !== null && c.armor !== undefined) bits.push(['Броня', <>{fmt(c.armor)}{c.magicArmor ? ` + маг ${fmt(c.magicArmor)}` : ''}</>]);
  if (c.pen) bits.push(['Штраф ловк.', c.pen]);
  if (c.req.length) bits.push(['Требования', <>{c.req.map((r: Any, i: number) => <span key={i} className={r.ok ? 'req-ok' : 'req-bad'}>{i ? ', ' : ''}{Rr.STAT_SHORT[r.stat]} {r.need}</span>)}</>]);
  bits.push(['Гнёзда для камней', c.sockets]);
  if (c.skill !== null && c.skill !== undefined) bits.push(['Изготовить самому', <span className={c.skillOk === false ? 'req-bad' : c.skillOk ? 'req-ok' : ''}>ремесло ур. {c.skill}</span>]);
  if (c.cat) bits.push(['Надевается', K.CATS[c.cat]]);
  const boost = I.boostHtml(c);
  return (
    <div className="cr-preview">
      <p className="cr-name"><b>{item.name}</b></p>
      <dl className="cr-bits">{bits.map(([t, x]) => <div key={t}><dt>{t}</dt><dd>{x}</dd></div>)}</dl>
      {boost && <LegacyHtml html={boost} />}
      {c.effects.length > 0 && <ul className="wfx small">{c.effects.map((e: Any, i: number) => <li key={i}><b>{e.src}:</b> {e.text}</li>)}</ul>}
      {c.warnings.length > 0 && <ul className="small gr-warn">{c.warnings.map((w: string, i: number) => <li key={i} className="gr-bad">{w}</li>)}</ul>}
      {c.notes.length > 0 && <ul className="small gr-warn">{c.notes.map((w: string, i: number) => <li key={i} className="muted">{w}</li>)}</ul>}
    </div>
  );
}

// цена изготовленного: по материалам с расшифровкой или своя, если ГМ её вписал; за штуку и за всё количество
function Price({ d, item, v, make }: { d: Any; item: Any; v: Any; make?: boolean }) {
  const K = window.Craft;
  const p = K.craftPrice(item), qty = Math.max(1, Math.floor(+d.qty || 1));
  const typed = make ? '' : String(d.priceIn || '').trim(), own = typed ? K.priceCopper(typed) : null;
  if (!p.lines.length && !p.unknown.length && own === null) return null;
  const each = own !== null ? own : p.total;
  const cha = +v.res.der.charisma || 0, t = each > 0 ? K.trade(each, cha) : null;
  const how = (l: Any) => (l.how === 'coat' ? `напыление: ${l.name}` : l.how === 'inlay' ? `камень: ${l.name}${l.u > 1 ? ' ×' + fmt(l.u) : ''}` : `${l.name} ${fmt(l.u)} ед.`) + ` × ${K.money(l.each)}`;
  return (
    <div className="gr-hit">
      <p><b>Цена{own !== null ? '' : ' по материалам'}:</b> <b>{K.money(each)}</b>{qty > 1 ? <> за шт. · всего за {qty} шт. — <b>{K.money(each * qty)}</b></> : null}
        {own !== null && <span className="muted small"> — своя цена; по материалам {K.money(p.total)}</span>}</p>
      {typed && own === null && <p className="gr-bad small">Не понял свою цену — впишите числом с монетой: «5(се)», «2 з 50 се» или просто медные.</p>}
      {p.lines.length > 0 && <p className="muted small">{p.lines.map(how).join(' + ')}</p>}
      {t && <p className="small">У торговца за штуку: купить <b>{K.money(t.buy)}</b> <span className="muted small">(наценка {fmt(t.markup)}%)</span> · продать <b>{K.money(t.sell)}</b>{t.sellPct ? <span className="muted small"> ({signed(t.sellPct)}%)</span> : null}</p>}
      {p.unknown.length > 0 && <p className="muted small">Без цены в таблице: {p.unknown.join(', ')} — не посчитано.</p>}
      {own === null && p.lines.length > 0 && !make && <p className="muted small">Только материал: заточка, глифы, модель, усиленное ремесло и существо в предмете в таблице не оценены — добавьте их своей ценой.</p>}
    </div>
  );
}
