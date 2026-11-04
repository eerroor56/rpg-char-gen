import { useState } from 'react';
import { act } from '../../lib/legacy';
import { fmt, norm, signed, type Any } from '../create/kit';
import { LegacyHtml, useUi } from './gearKit';

/*
 * «Снаряжение», второй заход: ячейки заклинаний, крафтильни, «Выдать предмет» (из таблиц, добыча с существа, своё).
 * Запись — действия js/inventory.js (invStation, invTAdd, invDropTake, invCAdd…) или прямо Dev.commit (заклинания).
 * «Изготовить» и «Кухня и зелья» пока рисует прежний код (Inv.craftForm, Brew.form).
 */
const n = (x: unknown) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };

// ------------------------------------------------------------ ячейки заклинаний
// запомненное заклинание срабатывает без броска на успех; записывают игрок и ГМ (поле spells: [{ name, formula, note }])
export function Spells({ rec, v, canEdit }: { rec: Any; v: Any; canEdit: boolean }) {
  const d = v.res.der, slots = d.spellSlots || 0;
  const list: Any[] = (Array.isArray(rec.spells) ? rec.spells : []).filter((x: Any) => x && x.name);
  const [edit, setEdit] = useState(-1);
  const [f, setF] = useState({ name: '', formula: '', note: '' });
  const syms = [...new Set<string>((v.res.symbols || []).map((s: Any) => s.name).concat(((rec.gm || {}).learned || []).filter((x: Any) => x.kind === 'symbol').map((x: Any) => x.name)))];
  const open = (i: number) => { const s = list[i] || {}; setF({ name: s.name || '', formula: s.formula || '', note: s.note || '' }); setEdit(i); };
  const commit = (next: Any[], text: string) => { setEdit(-1); window.Dev.commit({ spells: next }, text); };
  const save = (i: number) => {
    const s = { name: f.name.trim().slice(0, 80), formula: f.formula.trim().slice(0, 300), note: f.note.trim().slice(0, 300) };
    if (!s.name) { window.App.toast('Впишите название заклинания'); return; }
    const next = list.map(x => ({ ...x })), old = list[i];
    next[Math.min(i, next.length)] = s;
    commit(next, old ? (old.name === s.name ? `Меняет заклинание «${s.name}»` : `Вместо «${old.name}» запоминает «${s.name}»`) : `Запоминает заклинание «${s.name}»`);
  };
  const forget = (i: number) => { const s = list[i]; if (s && confirm(`Забыть заклинание «${s.name}»?`)) commit(list.filter((_, j) => j !== i), `Забывает заклинание «${s.name}»`); };
  const count = Math.max(slots, list.length, edit + 1);
  return (
    <section className="card wstack">
      <div className="gr-head"><h2>Ячейки заклинаний</h2><span className="muted small">занято {fmt(Math.min(list.length, slots))} из {fmt(slots)}{(d.spellSlotsSrc || []).length ? ` (${d.spellSlotsSrc.join(', ')})` : ''}</span></div>
      {count ? (
        <ol className="gr-spells">
          {Array.from({ length: count }, (_, i) => {
            const s = list[i], over = i >= slots;
            return (
              <li key={i} className={(s ? 'full' : '') + (over ? ' over' : '') + (i === edit ? ' is-edit' : '')}>
                <span className="gr-sp-n">{i + 1}</span>
                {i === edit ? (
                  <div className="wstack tight gr-sp-form">
                    <input type="text" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={80} placeholder="заклинание, например «огненный шар»" aria-label="Заклинание" autoFocus />
                    <input type="text" value={f.formula} onChange={e => setF({ ...f, formula: e.target.value })} maxLength={300} placeholder="формула: символы, из которых собрано" aria-label="Формула" />
                    <input type="text" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={300} placeholder="расход, урон, эффект (необязательно)" aria-label="Заметка" />
                    <div className="row"><button type="button" className="btn primary small" onClick={() => save(i)}>Запомнить</button><button type="button" className="btn ghost small" onClick={() => setEdit(-1)}>Отмена</button></div>
                  </div>
                ) : s ? <>
                  <div className="gr-sp-text"><b>{s.name}</b>{s.formula && <span className="gr-sp-f">{s.formula}</span>}{s.note && <span className="muted small">{s.note}</span>}
                    {over && <span className="gr-bad small">Не хватает ячеек: заклинание не помещается.</span>}</div>
                  {canEdit && <div className="gr-sp-ops"><button type="button" className="link small" onClick={() => open(i)}>изменить</button><button type="button" className="link small fx-del" onClick={() => forget(i)}>забыть</button></div>}
                </> : canEdit && i === list.length && edit < 0
                  ? <button type="button" className="link" onClick={() => open(i)}>записать заклинание</button>
                  : <span className="muted small">свободна</span>}
              </li>
            );
          })}
        </ol>
      ) : <p className="muted small">Ячеек нет — запомнить заклинание нельзя.</p>}
      <p className="muted small">Запомненное заклинание срабатывает наверняка — бросок на успех не нужен.{syms.length ? ` Символы героя: ${syms.join(', ')}.` : ''}</p>
    </section>
  );
}

// ------------------------------------------------------------ крафтильни (ГМ отмечает, где герой может работать сам)
export function Stations({ rec, v }: { rec: Any; v: Any }) {
  const ui = useUi();
  const st = window.Inv.stationsOf(rec, v);
  const own = new Set((st.own as string[]).map(norm)), bag = new Set((st.bag as string[]).map(norm));
  const names = [...new Set<string>(((window as Any).GM_CONFIG.MAKE.STATIONS as string[]).concat(st.own))];
  return (
    <details className="card gr-stations" open={!!window.App.ui.invStations} onToggle={e => ui.set('invStations', (e.target as HTMLDetailsElement).open)}>
      <summary><h2>Крафтильни героя</h2><span className="muted small">{st.all.length ? st.all.join(', ') : 'нет ни одной'}</span></summary>
      <p className="muted small">Отметьте, где герой может работать сам — тогда игрок создаёт предметы, блюда и зелья из сырья в рюкзаке (если хватает навыка). Крафтильня, лежащая в рюкзаке предметом, отмечается сама.</p>
      <div className="gr-st-list">
        {names.map(nm => {
          const inBag = bag.has(norm(nm)), on = own.has(norm(nm)) || inBag;
          return (
            <label key={nm} className={'gr-check' + (on ? ' is-on' : '')}>
              <input type="checkbox" checked={on} disabled={inBag && !own.has(norm(nm))} onChange={e => act('invStation', { v: nm }, undefined, e.target.checked)} />
              <span>{nm}{inBag && <span className="muted small"> — в рюкзаке</span>}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

// ------------------------------------------------------------ «Выдать предмет»
const MODES: [string, string][] = [['craft', 'Изготовить'], ['brew', 'Кухня и зелья'], ['table', 'Из таблиц'], ['drop', 'Добыча с существа'], ['custom', 'Своё']];

export function AddItem({ v }: { v: Any }) {
  const ui = useUi();
  const mode = ui.get('invAdd') || 'craft';
  const editing = !!(window.App.ui.invDraft && window.App.ui.invDraft.editId);
  let body;
  if (mode === 'craft') body = <LegacyHtml html={window.Inv.craftForm(v)} />;
  else if (mode === 'brew') body = <LegacyHtml html={(window as Any).Brew.form({ host: 'dev', issueAct: 'invBrewSave', herbsAct: 'invHerbsTake' })} />;
  else if (mode === 'table') body = <TableForm v={v} />;
  else if (mode === 'drop') body = <DropForm v={v} />;
  else body = <CustomForm />;
  return (
    <section className="card wstack" id="invAdd">
      <h2>{editing ? 'Изменить предмет' : 'Выдать предмет'}</h2>
      <div className="gr-modes" role="tablist">
        {MODES.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={k === mode} className={k === mode ? 'is-on' : ''} onClick={() => ui.set('invAdd', k)}>{t}</button>)}
      </div>
      {body}
    </section>
  );
}

const unlocked = () => !!(window.GMLock && window.GMLock.unlocked);

/** купить / продать у торговца: наценка падает с харизмой */
function Trade({ cu, cha }: { cu: number; cha: number }) {
  const K = window.Craft, t = K.trade(cu, cha), top = window.Inv.tInfo('харизма');
  return <>купить <b>{K.money(t.buy)}</b> <span className="muted small">(наценка {fmt(t.markup)}%)</span> · продать <b>{K.money(t.sell)}</b>{t.sellPct ? <span className="muted small"> ({signed(t.sellPct)}%)</span> : null}<span className="muted small"> — харизма {fmt(cha)}{cha >= (+top.max || 100) && top.top ? `; ${top.top}` : ''}</span></>;
}

function TableForm({ v }: { v: Any }) {
  const ui = useUi();
  const K = window.Craft;
  const list: Any[] = K.catalog(unlocked());
  const name = ui.get('invTName');
  const hit = name ? list.find(x => norm(x.name) === norm(name)) : null;
  const cu = hit ? K.priceCopper(hit.price) : null;
  if (!ui.get('invTQty')) window.App.ui.invTQty = 1;
  return <>
    <datalist id="grCatalog">{list.map(x => <option key={x.kind + x.name} value={x.name}>{(K.KIND_NAMES[x.kind] || '') + (x.price ? ' · ' + x.price : '')}</option>)}</datalist>
    <div className="hp-row">
      <input type="text" list="grCatalog" value={name} onChange={e => ui.set('invTName', e.target.value)} placeholder={`название из таблиц: предмет, слиток, камень, артефакт, еда${unlocked() ? ', ингредиент' : ''}`} aria-label="Предмет" />
      <input type="number" min={1} step={1} className="gr-num" value={ui.get('invTQty')} onChange={e => ui.set('invTQty', e.target.value)} aria-label="Количество" />
      <button type="button" className="btn small primary" onClick={() => act('invTAdd')}>Выдать</button>
    </div>
    {hit ? <div className="gr-hit">
      <p className="small"><span className="chip">{K.KIND_NAMES[hit.kind]}</span> {hit.effect || ''}{hit.price && <span className="muted"> · цена: {hit.price}{cu !== null ? ` (${K.money(cu)})` : ''}</span>}</p>
      {cu ? <p className="small">У торговца: <Trade cu={cu} cha={n(v.res.der.charisma)} /></p> : null}
    </div> : name ? <p className="muted small">В таблицах такого нет — выдайте через «Своё».</p> : null}
    <p className="muted small">Слитки и камни выдаются как материал (количество — в единицах); из них потом можно собрать предмет во вкладке «Изготовить».{unlocked() ? '' : ' Алхимические ингредиенты и полный список артефактов — после пароля ГМ.'}</p>
  </>;
}

function DropForm({ v }: { v: Any }) {
  const K = window.Craft, Rr = window.Rules;
  if (!unlocked()) return <p className="muted small">Добыча записана в бестиарии — откройте закрытые разделы паролем ГМ. Без пароля добычу можно выдать через «Из таблиц» или «Своё».</p>;
  const creatures: Any[] = window.GAME_DATA.creatures || [];
  const st = window.App.ui.invDrop || {};
  const c = st.creature ? creatures.find(x => norm(x.n) === norm(st.creature)) : null;
  const rows: Any[] = st.rows || [];
  const skin = n(((v.res.talents || {})['свежевание'] || {}).total), skinTop = window.Inv.tInfo('свежевание');
  let total = 0; const none: string[] = [];
  rows.filter(r => r.qty > 0).forEach(r => { const cu = K.tablePrice(r.name, true); if (cu === null) none.push(r.name); else total += cu * r.qty; });
  return <>
    <datalist id="grCreatures">{creatures.map(x => <option key={x.n} value={x.n}>ур. {fmt(Rr.roundLevel(x.lvl))}</option>)}</datalist>
    <div className="hp-row">
      <input type="text" list="grCreatures" value={st.creature || ''} onChange={e => act('invDropPick', {}, e.target.value)} placeholder="существо" aria-label="Существо" />
      <label className="winline">Разделочный стол
        <select className="sel gr-sel" value={String(st.mult || 1)} onChange={e => act('invDropMult', {}, e.target.value)}>{[1, 2, 3, 4].map(m => <option key={m} value={m}>{m === 1 ? 'нет' : `×${m}`}</option>)}</select>
      </label>
    </div>
    {c ? rows.length ? <>
      <ul className="hp-list">{rows.map((r, i) => { const cu = K.tablePrice(r.name, true); return (
        <li key={i}><span>{r.name}{cu !== null && <span className="muted small"> — {K.money(cu)} за шт.</span>}</span>
          <input type="number" min={0} step={1} className="gr-num" value={r.qty} onChange={e => act('invDropQty', { v: String(i) }, e.target.value)} aria-label={`Количество: ${r.name}`} /></li>
      ); })}</ul>
      <p className="small"><b>Цена добычи:</b> <b>{K.money(total)}</b>{none.length > 0 && <span className="muted small"> — без цены в таблицах: {none.join(', ')}</span>}</p>
      <div className="row"><button type="button" className="btn small primary" onClick={() => act('invDropTake')}>Забрать в рюкзак</button></div>
    </> : <p className="muted small">У этого существа в бестиарии нет добычи.</p>
      : st.creature ? <p className="muted small">Такого существа нет в бестиарии.</p> : null}
    {skin > 0 && <p className="small">Свежевание {fmt(skin)}: {skin >= 10 ? `+${Math.floor(skin / 10)} к каждой добыче — уже прибавлено` : 'прибавка — с 10 ур.'}{skin >= (n(skinTop.max) || 100) && skinTop.top ? `; на максимуме: ${skinTop.top} — решает ГМ` : ''}.</p>}
    <p className="muted small">Опыт за победу начисляется во вкладке «Развитие».</p>
  </>;
}

function CustomForm() {
  const ui = useUi();
  const K = window.Craft;
  if (!ui.get('invCQty')) window.App.ui.invCQty = 1;
  return <>
    <div className="fgrid">
      <label className="fld"><span className="fld-l">Название</span><input type="text" value={ui.get('invCName')} onChange={e => ui.set('invCName', e.target.value)} maxLength={120} /></label>
      <label className="fld"><span className="fld-l">Где надевать</span>
        <select className="sel" value={ui.get('invCCat')} onChange={e => ui.set('invCCat', e.target.value)}>
          <option value="">— не надевается —</option>
          {Object.entries(K.CATS as Record<string, string>).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select></label>
      <label className="fld"><span className="fld-l">Количество</span><input type="number" min={1} step={1} value={ui.get('invCQty')} onChange={e => ui.set('invCQty', e.target.value)} /></label>
      <label className="fld"><span className="fld-l">Цена за штуку</span><input type="text" value={ui.get('invCPrice')} onChange={e => ui.set('invCPrice', e.target.value)} maxLength={60} placeholder="5(се), 2 з 50 се или медные" /></label>
      <label className="fld wide"><span className="fld-l">Описание и эффект</span><textarea rows={3} value={ui.get('invCText')} onChange={e => ui.set('invCText', e.target.value)} placeholder="что делает предмет" /></label>
    </div>
    <div className="row"><button type="button" className="btn small primary" onClick={() => act('invCAdd')}>Выдать</button></div>
    <p className="muted small">Для «отсебятины»: предметы, которых нет в таблицах. Урон и броню такого предмета считайте по эффекту; чтобы урон считался сам — изготовьте предмет из материала.</p>
  </>;
}
