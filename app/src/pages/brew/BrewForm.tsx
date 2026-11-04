import { useEffect, useState } from 'react';
import { act } from '../../lib/legacy';
import { norm, type Any } from '../create/kit';

/*
 * Калькулятор кухни, винокурни и алхимического стола. Правила и расчёт — js/brew.js (Brew.compute и константы), черновик —
 * App.ui.brew (его же читают действия «Выдать» / «Забрать в рюкзак» в js/inventory.js). Здесь — только форма.
 * opts: { host: 'ref' | 'dev', issueAct, herbsAct, issueLabel } — как у Brew.form прежнего сайта.
 */
export type BrewOpts = { host: 'ref' | 'dev'; issueAct?: string; herbsAct?: string; issueLabel?: string };

const setPath = (o: Any, path: string, val: unknown) => {
  const ps = path.split('.');
  let x = o;
  for (let i = 0; i < ps.length - 1; i++) { if (x[ps[i]] === undefined || x[ps[i]] === null) x[ps[i]] = /^\d+$/.test(ps[i + 1]) ? [] : {}; x = x[ps[i]]; }
  x[ps[ps.length - 1]] = val;
};

export function BrewForm({ opts }: { opts: BrewOpts }) {
  const B = window.Brew as Any, App = window.App, Rr = window.Rules;
  const [, tick] = useState(0);
  const re = () => tick(t => t + 1);
  // прежний код просит перерисовать справочник (Reference.refresh → mh-ref): например, после пароля ГМ
  useEffect(() => { window.addEventListener('mh-ref', re); return () => window.removeEventListener('mh-ref', re); }, []);
  B.configure(opts);
  if (!B.ings().length) return (
    <p className="muted small">Ингредиенты записаны в закрытом разделе «Алхимия и кухня» — <a href="#ref/alchemy">откройте его паролем ГМ</a>, и калькулятор заработает.</p>
  );
  const d = B.draft(), r = B.compute(d);
  const set = (k: string, val: unknown) => { setPath(d, k, val); re(); };
  const isCook = d.mode === 'cook', isAlco = d.mode === 'alco', isPot = d.mode === 'potion';
  const m = B.COOK.find((x: Any) => x.id === d.method) || B.COOK[0];
  const herbs: Any[] | null = App.ui.brewHerbs;
  const creatures: Any[] = B.creatures();
  const ings: Any[] = B.ings();
  const effLabel = (x: Any) => B.effStr(x, r.dur);
  const over = r.n > r.cap;

  const roll = () => { d.roll = B.d100(); App.toast(`d100: ${d.roll}${d.roll < B.SPOIL ? ' — испорчено' : ''}`); re(); };
  const gather = () => {
    App.ui.brewHerbs = B.gather();
    const n = App.ui.brewHerbs.reduce((a: number, x: Any) => a + x.qty, 0);
    App.toast(n ? `Собрано: ${n} ${App.plural(n, 'растение', 'растения', 'растений')}` : 'Растений в таблице нет');
    re();
  };
  const useHerbs = () => {
    d.rows = d.rows.filter((x: Any) => x.ing);
    (herbs || []).forEach(x => {
      const row = d.rows.find((y: Any) => norm(y.ing) === norm(x.n) && (d.mode !== 'potion' || +y.eff === 1));
      if (row) row.qty = (+row.qty || 1) + x.qty; else d.rows.push({ ing: x.n, qty: x.qty, eff: 1 });
    });
    if (!d.rows.length) d.rows.push({ ing: '', qty: 1, eff: 1 });
    App.ui.brewHerbs = null; re();
  };

  return (
    <div className="wstack bw">
      <div className="bw-herbs">
        <div className="hp-row"><button type="button" className="btn small" onClick={gather}>Сбор трав</button><span className="muted small">{B.HERBS[0]}–{B.HERBS[1]} случайных растений из таблицы ингредиентов</span></div>
        {herbs && herbs.length > 0 && <>
          <ul className="bw-list">{herbs.map(x => { const i = B.ing(x.n); return <li key={x.n}><b>{x.n}</b>{x.qty > 1 ? ` ×${x.qty}` : ''} <span className="muted small">— {i ? i.e.map((e: Any) => e[0]).join(', ') : ''}</span></li>; })}</ul>
          <div className="row">
            <button type="button" className="btn small" onClick={useHerbs}>Добавить в рецепт</button>
            {opts.herbsAct && <button type="button" className="btn small primary" onClick={() => act(opts.herbsAct!)}>Забрать в рюкзак</button>}
            <button type="button" className="link small" onClick={() => { App.ui.brewHerbs = null; re(); }}>убрать</button>
          </div>
        </>}
      </div>

      <div className="gr-modes" role="tablist">
        {B.MODES.map(([k, t]: [string, string]) => <button key={k} type="button" role="tab" aria-selected={k === d.mode} className={k === d.mode ? 'is-on' : ''} onClick={() => set('mode', k)}>{t}</button>)}
      </div>

      <div className="fgrid">
        {isCook && <>
          <label className="fld"><span className="fld-l">Способ</span>
            <select className="sel" value={d.method} onChange={e => set('method', e.target.value)}>{B.COOK.map((x: Any) => <option key={x.id} value={x.id}>{x.id} — {x.eff}-й эффект{x.plus ? ' ' + x.plus : ''}</option>)}</select></label>
          {m.base && <label className="fld"><span className="fld-l">Основа <span className="muted">— {m.base}</span></span>
            <input type="text" list="bwBases" value={d.base || ''} onChange={e => set('base', e.target.value)} placeholder={m.eff === 1 ? 'вода, молоко, кровь…' : 'рост.масло, слив.масло, жир…'} /></label>}
        </>}
        {isAlco && <label className="fld"><span className="fld-l">Способ</span>
          <select className="sel" value={d.alco} onChange={e => set('alco', e.target.value)}>{B.ALCO.map((x: Any) => <option key={x.id} value={x.id}>{x.id} — {x.eff}-й эффект, +{x.drunk} опьянения</option>)}</select></label>}
        {isPot && <>
          <label className="fld"><span className="fld-l">Вид</span>
            <select className="sel" value={norm(d.potion)} onChange={e => set('potion', e.target.value)}>{B.potionTypes().map((x: Any) => <option key={x.id} value={x.id}>{x.id} — {x.slots} {App.plural(x.slots, 'слот', 'слота', 'слотов')}, с {x.lvl} ур. алхимии</option>)}</select></label>
          <label className="fld"><span className="fld-l">Основа <span className="muted">(необязательно)</span></span>
            <input type="text" list="bwBases" value={d.base || ''} onChange={e => set('base', e.target.value)} placeholder="мёд, слизь, вода…" /></label>
        </>}
      </div>

      <h3>Ингредиенты <span className="muted small">{isPot ? 'слотов занято' : 'ингредиентов'} <b className={over ? 'gr-bad' : 'bw-ok'}>{r.n}</b> из {r.cap}</span></h3>
      <div className="bw-rows">
        {d.rows.map((x: Any, i: number) => {
          const ing = B.ing(x.ing);
          return (
            <div key={i} className="bw-row">
              <input type="text" list="bwIngs" value={x.ing || ''} onChange={e => set(`rows.${i}.ing`, e.target.value)} placeholder="ингредиент" aria-label="Ингредиент" />
              {isPot && <select className="sel gr-sel" value={String(x.eff || 1)} onChange={e => set(`rows.${i}.eff`, e.target.value)} aria-label="Какой эффект выделить">
                {ing ? [1, 2, 3, 4].filter(k => ing.e[k - 1]).map(k => <option key={k} value={k}>{k}: {B.hidIdx(k) ? '???' : ing.e[k - 1][0]} — {B.STATIONS[k - 1]}</option>) : <option value="1">— выберите ингредиент —</option>}
              </select>}
              <input type="number" min={1} step={1} className="gr-num" value={x.qty} onChange={e => set(`rows.${i}.qty`, e.target.value)} aria-label="Сколько" />
              <button type="button" className="link small" onClick={() => { d.rows.splice(i, 1); re(); }}>убрать</button>
            </div>
          );
        })}
      </div>
      <div><button type="button" className="link" onClick={() => { d.rows.push({ ing: '', qty: 1, eff: 1 }); re(); }}>+ ингредиент</button></div>

      {isCook && <>
        <h3>Вырезки и выжимки <span className="muted small">разделочный стол; живость — 10% тела существа, стихия — 10% духа</span></h3>
        {creatures.length ? <>
          <div className="bw-rows">
            {(d.cuts || []).map((x: Any, i: number) => {
              const c = creatures.find(y => norm(y.n) === norm(x.cr));
              return (
                <div key={i} className="bw-row">
                  <input type="text" list="bwCreatures" value={x.cr || ''} onChange={e => set(`cuts.${i}.cr`, e.target.value)} placeholder="существо" aria-label="Существо" />
                  <input type="number" min={1} step={1} className="gr-num" value={x.qty} onChange={e => set(`cuts.${i}.qty`, e.target.value)} aria-label="Сколько вырезок" />
                  {c && c.cat === 'босс' && <select className="sel gr-sel" value={x.stat || 's'} onChange={e => set(`cuts.${i}.stat`, e.target.value)} aria-label="Постоянный бонус">
                    {B.BOSS_STATS.map((s: string) => <option key={s} value={s}>навсегда: {Rr.STAT_NAMES[s].toLowerCase()} +{Rr.ri(c[s] * B.CUT.boss)}</option>)}
                  </select>}
                  <button type="button" className="link small" onClick={() => { d.cuts.splice(i, 1); re(); }}>убрать</button>
                </div>
              );
            })}
          </div>
          <div><button type="button" className="link" onClick={() => { d.cuts = (d.cuts || []).concat([{ cr: '', qty: 1, stat: 's' }]); re(); }}>+ вырезка</button></div>
          <datalist id="bwCreatures">{creatures.map(c => <option key={c.n} value={c.n}>{(c.cat === 'босс' ? 'босс · ' : '') + (c.ch || '')}</option>)}</datalist>
        </> : <p className="muted small">Существа — в бестиарии: он открывается паролем ГМ.</p>}
      </>}

      <div className="fgrid">
        {isPot ? <label className="gr-check"><input type="checkbox" checked={!!d.conc} onChange={e => set('conc', e.target.checked)} /><span>Концентратор: эффект зелья 2Х</span></label> : <>
          <label className="fld"><span className="fld-l">Бросок {isCook ? 'готовки' : 'варки'} <span className="muted">— ниже {B.SPOIL} все эффекты негативные</span></span>
            <span className="hp-row"><input type="number" min={1} max={100} step={1} className="gr-num" value={d.roll || ''} onChange={e => set('roll', e.target.value)} aria-label="Результат броска d100" />
              <button type="button" className="btn small" onClick={roll}>d100</button></span></label>
          <label className="gr-check"><input type="checkbox" checked={!!d.canned} onChange={e => set('canned', e.target.checked)} /><span>Консервы / долгое хранение: показатели −50%</span></label>
        </>}
      </div>
      <datalist id="bwIngs">{ings.map(i => <option key={i.n} value={i.n}>{i.e.map((e: Any, k: number) => (B.hidIdx(k + 1) ? '???' : e[0])).join(', ')}</option>)}</datalist>
      <datalist id="bwBases">{B.bases().map((i: Any) => <option key={i.n} value={i.n}>{B.baseText(i)}</option>)}</datalist>

      <div className={'bw-out' + (r.spoiled ? ' spoiled' : '')}>
        <p className="bw-name"><b>{r.shownName || r.name}</b> <span className="chip">{r.kind === 'potion' ? 'зелье' : r.mode === 'alco' ? 'напиток' : 'блюдо'}</span>{r.spoiled && <span className="chip bad">испорчено</span>}</p>
        {r.main && <p>{r.main.hid ? <><span className="bw-eff unknown">{r.main.label} ???</span> <span className="muted small">— часть живости — из неизвестных свойств</span></>
          : <span className={'bw-eff ' + (r.main.mark === '-' ? 'minus' : 'plus')}>{effLabel(r.main)}</span>}</p>}
        {r.effects.length > 0 && <ul className="bw-list">{r.effects.map((x: Any, i: number) => x.hid
          ? <li key={i}><span className="bw-eff unknown">???</span> <span className="muted small">— неизвестное свойство: {x.src.join(', ')}</span></li>
          : <li key={i}><span className={'bw-eff ' + (x.mark === '+' ? 'plus' : x.mark === '-' ? 'minus' : '')}>{effLabel(x)}</span>{x.src.length > 0 && <span className="muted small"> — {x.src.join(', ')}</span>}</li>)}</ul>}
        {r.cost && <p className="small"><b>Цена ингредиентов:</b> {window.Craft.money(r.cost.total)}{r.cost.unknown.length > 0 && <span className="muted small"> — без цены в таблице: {r.cost.unknown.join(', ')}</span>}{r.cost.cuts ? <span className="muted small"> — вырезки с существ не оценены</span> : null}</p>}
        {r.warnings.length > 0 && <ul className="small gr-warn">{r.warnings.map((w: string, i: number) => <li key={i} className="gr-bad">{w}</li>)}</ul>}
        {r.notes.length > 0 && <ul className="small gr-warn">{r.notes.map((w: string, i: number) => <li key={i} className="muted">{w}</li>)}</ul>}
      </div>

      {opts.issueAct ? <>
        <div className="fgrid">
          <label className="fld"><span className="fld-l">Название</span><input type="text" value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder={r.shownName || r.name} maxLength={120} /></label>
          <label className="fld"><span className="fld-l">Количество</span><input type="number" min={1} step={1} value={d.qty || 1} onChange={e => set('qty', e.target.value)} /></label>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => act(opts.issueAct!)}>{opts.issueLabel || 'Выдать'}</button>
          <button type="button" className="btn ghost" onClick={() => { App.ui.brew = B.blank(d.mode); re(); }}>Очистить</button>
        </div>
      </> : <div className="row"><button type="button" className="btn ghost small" onClick={() => { App.ui.brew = B.blank(d.mode); re(); }}>Очистить</button></div>}

      <details className="more">
        <summary>Как считается</summary>
        <ul className="small bw-help">
          <li><b>Кухня.</b> За каждый ингредиент +1 живости и вся живость, что есть в самих ингредиентах; способ выделяет эффект: варка — 1-й (+ свойства жидкой основы), жарка — 2-й, тушение — 3-й, запекание — 4-й (+ свойства масла). Если выделена живость — она удваивается. Не больше {B.MAX_ING} ингредиентов.</li>
          <li><b>Вырезки и выжимки</b> (разделочный стол): живость — 10% тела существа, эффект его стихии — 10% духа; характер: агрессивный — урон +20%, нейтральный — ОД +2, мирный — пси +20%; метки ♦ сила +25, ♣ тело +25, ♥ дух +25, ♠ интеллект +25, ◘ ловкость +5. Бонусы от нескольких вырезок складываются. С босса — одна вырезка: постоянный бонус к одной из 4 характеристик, 25% от его показателя.</li>
          <li><b>Винокурня.</b> Каждый ингредиент +{B.ALCO_PER} опьянения; ферментация выделяет 1-й эффект (+1), дистилляция — 2-й (+2), мацерация — 3-й (+3), перколяция — 4-й (+4){B.BC.ALCO_METHOD_ONCE ? ' — один раз на напиток' : ' — за каждый ингредиент'}. Не больше {B.MAX_ING} ингредиентов.</li>
          <li>Бросок ниже {B.SPOIL} портит блюдо или напиток: все эффекты становятся негативными. Консервы и долгое хранение — показатели хуже на 50%.</li>
          <li><b>Алхимический стол.</b> Вид зелья задаёт число слотов (отвар 2 … краут 50) и нужный уровень алхимии. Каждый выделенный эффект занимает слот: ступка и пестик — 1-й эффект ингредиента, реторта — 2-й, перегонный куб — 3-й, кальцатор — 4-й. Одинаковые эффекты складываются и продлевают длительность на 1х. Разные эффекты объединяет алхимический смешиватель, концентратор удваивает эффект.</li>
          <li>Зелёным — бафф, красным — дебафф (как в листе «алхимия»): у стихий минус при баффе — резист, при дебаффе — урон. Бафф и дебафф одной характеристики (сила +1 и сила −1) гасят друг друга.</li>
        </ul>
      </details>
    </div>
  );
}
