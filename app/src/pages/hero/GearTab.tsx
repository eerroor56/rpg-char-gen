import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { act } from '../../lib/legacy';
import { fmt, norm, R, signed, type Any } from '../create/kit';
import { Icon } from '../../ui/Icon';

/*
 * «Снаряжение» героя: экипировка (кукла), рюкзак, карточка предмета, кошелёк — на React. Расчёт предметов и кошелька —
 * js/craft.js (Craft.compute, money, trade…), запись — действия js/inventory.js (invEquip, invQty, invPay…: они же
 * проверяют правила и пишут журнал). Поля ввода хранятся в App.ui под теми же ключами, что читают эти действия.
 * Заклинания, крафтильни и «Выдать предмет» (изготовить, кухня и зелья, таблицы, добыча, своё) пока рисует прежний код.
 */
type Perms = { gm?: boolean; owner?: boolean };
const SIDE_L = ['head', 'face', 'neck', 'cloak', 'body'], SIDE_R = ['gloves', 'belt', 'legs', 'feet', 'brooch'];
const JEWEL = ['ring', 'bracelet', 'earring', 'nose', 'brow'];

/** поле, которое читает действие прежнего сайта (App.ui[key]) */
function useUi() {
  const [, tick] = useState(0);
  const ui = window.App.ui;
  return {
    get: (k: string) => (ui[k] === undefined || ui[k] === null ? '' : String(ui[k])),
    set: (k: string, v: string) => { ui[k] = v; tick(t => t + 1); },
  };
}

export default function GearTab({ rec, v, perms }: { rec: Any; v: Any; perms: Perms }) {
  const ui = useUi();
  const K = window.Craft, I = window.Inv;
  if (!v.inv) return <div className="card empty"><Icon name="user" /><p>Сначала выберите расу.</p></div>;
  const canEquip = !!(perms.gm || perms.owner);
  const inv = v.inv, eq = v.eq, d = v.res.der;
  const byId = new Map<string, Any>(inv.items.map((x: Any) => [x.id, x]));
  const selId = window.App.ui.invSel;
  const sel = selId ? byId.get(selId) : null;
  const selCalc = sel ? K.compute(sel, v.ctx) : null;
  const worn = new Set(Object.values(inv.equip));
  const transfer = I.transferCard(perms);
  const legacy = I.spellCard(rec, v, canEquip) + (perms.gm ? I.addCard(v) + I.stationsCard(rec, v) : perms.owner ? I.makeCard(v, rec) : '');

  const slot = (s: Any) => {
    const id = inv.equip[s.id], it = id ? byId.get(id) : null;
    const fits = !it && selCalc && selCalc.cat === s.cat && !worn.has(sel.id);
    return (
      <button key={s.id} type="button" className={'gr-slot' + (it ? ' full' : '') + (it && sel && sel.id === it.id ? ' is-sel' : '') + (fits ? ' fits' : '')}
        disabled={!it && !canEquip} onClick={() => act('invSlot', { v: s.id })}>
        <span className="gr-slot-t">{s.t}</span><span className="gr-slot-i">{it ? it.name : fits ? 'надеть сюда' : '—'}</span>
      </button>
    );
  };
  const group = (cats: string[]) => cats.flatMap(c => eq.slots.filter((s: Any) => s.cat === c).map(slot));
  const anyWorn = (cats: string[]) => eq.slots.some((s: Any) => cats.includes(s.cat) && inv.equip[s.id]);
  const weapons = eq.weapons.filter((w: Any) => I.roleKind(w.kind));
  const race = v.res.race;
  const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
  const custom = rec.pic && /^data:image\/(webp|jpeg|png);base64,/.test(rec.pic) ? rec.pic : '';
  const pic = custom || (base && window.RACE_IMAGES[base.id] ? window.RACE_IMAGES[base.id].src : '');
  const more = (title: string, cats: string[], selCat?: boolean) => {
    const slots = group(cats);
    return slots.length ? <details className="more gr-more" open={anyWorn(cats) || selCat}><summary>{title}</summary><div className="gr-jewel">{slots}</div></details> : null;
  };

  const q = norm(ui.get('invQ'));
  const bag: Any[] = inv.items.filter((x: Any) => !worn.has(x.id) && (!q || norm(x.name).includes(q)));

  return (
    <div className="wstack gr">
      {transfer && <LegacyHtml html={transfer} />}

      <section className="card wstack">
        <h2>Экипировка</h2>
        {eq.warnings.length > 0 && <div className="wstack tight">{eq.warnings.map((w: string, i: number) => <p key={i} className="issue warn">{w}</p>)}</div>}
        <div className="gr-doll">
          <div className="gr-col">{group(SIDE_L)}</div>
          <div className="gr-mid">
            <div className="gr-pic">{pic ? <img src={pic} alt="" /> : <Icon name="user" />}</div>
            <dl className="gr-sum">
              <div><dt>Броня</dt><dd>{fmt(eq.armor)}{eq.magicArmor ? <span className="muted small"> + маг {fmt(eq.magicArmor)}</span> : null}</dd></div>
              <div><dt>Уворот</dt><dd>{fmt(d.dodge)}</dd></div>
              <div><dt>Штраф ловк.</dt><dd>{fmt(eq.pen)}</dd></div>
              <div><dt>Слоты</dt><dd className={d.slotsUsed > d.slots ? 'gr-bad' : ''}>{fmt(d.slotsUsed)} / {fmt(d.slots)}</dd></div>
              {weapons.map((w: Any, i: number) => <div key={i} className="wide"><dt>{w.item.name}</dt><dd>урон {w.damage === null ? '—' : fmt(w.damage)}{w.magicDamage ? ` + маг ${fmt(w.magicDamage)}` : ''}</dd></div>)}
            </dl>
          </div>
          <div className="gr-col">{group(SIDE_R)}</div>
        </div>
        <div className="gr-hands">{group(['hand', 'ammo'])}</div>
        {more('Украшения', JEWEL, selCalc && JEWEL.includes(selCalc.cat))}
        {more('Протезы', ['prosth'], selCalc && selCalc.cat === 'prosth')}
        {more('Артефакты', ['artifact'], selCalc && selCalc.cat === 'artifact')}
        {canEquip && <p className="muted small">Выберите предмет в рюкзаке и нажмите «Надеть» или подсвеченный слот. Нажатие на занятый слот показывает предмет.</p>}
      </section>

      {sel && <ItemCard key={sel.id} it={sel} c={selCalc} perms={perms} isWorn={worn.has(sel.id)} rec={rec} v={v} />}

      <section className="card wstack">
        <div className="gr-head"><h2>Рюкзак</h2><span className="muted small">занято слотов {fmt(d.slotsUsed)} из {fmt(d.slots)} (сила{eq.bagSlots ? ` + сумки ${eq.bagSlots}` : ''}; каждый предмет — 1 слот)</span></div>
        {inv.items.length > 8 && (
          <label className="search wsearch"><Icon name="search" /><input type="search" value={ui.get('invQ')} onChange={e => ui.set('invQ', e.target.value)} placeholder="Поиск в рюкзаке" aria-label="Поиск в рюкзаке" /></label>
        )}
        {bag.length ? (
          <ul className="gr-bag">
            {bag.map(it => {
              const c = K.compute(it, v.ctx);
              const nums = [c.damage !== null && c.damage !== undefined ? `урон ${fmt(c.damage)}` : '', c.armor !== null && c.armor !== undefined ? `броня ${fmt(c.armor)}` : ''].filter(Boolean).join(' · ');
              return (
                <li key={it.id} className={sel && sel.id === it.id ? 'is-sel' : ''}>
                  <button type="button" className="gr-bag-name" onClick={() => act('invSel', { v: sel && sel.id === it.id ? '' : it.id })}>
                    <b>{it.name}</b>{(+it.qty || 1) > 1 && <span className="gr-qty">×{+it.qty}</span>}
                    <span className="chip">{K.KIND_NAMES[it.kind] || it.kind}</span>
                    {nums && <span className="muted small">{nums}</span>}
                    {it.src && <span className="muted small">{it.src}</span>}
                    {c.warnings.length > 0 && <span className="gr-bad small" title="есть замечания">!</span>}
                  </button>
                  {canEquip && c.cat && <button type="button" className="btn small" onClick={() => act('invEquip', { v: it.id })}>Надеть</button>}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted small">{inv.items.length ? (q ? 'Ничего не найдено.' : 'Всё надето.') : 'Рюкзак пуст.'}</p>}
      </section>

      <Wallet w={inv.wallet} perms={perms} />
      {legacy && <LegacyHtml html={legacy} />}
    </div>
  );
}

// ------------------------------------------------------------ карточка предмета
function ItemCard({ it, c, perms, isWorn, rec, v }: { it: Any; c: Any; perms: Perms; isWorn: boolean; rec: Any; v: Any }) {
  const K = window.Craft, I = window.Inv, Rr = R(), C = (window as Any).GM_CONFIG;
  const ui = useUi();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  const canEquip = !!(perms.gm || perms.owner);
  const cha = +v.res.der.charisma || 0;
  // ингредиент у игрока: свойства, которых герой ещё не знает (по алхимии), — «???»; ГМ видит всё
  const effs: Any[] = !perms.gm && it.ing ? I.ingEffects(it, I.knownProps(rec)) : c.effects;
  const parts: Any[] = ((it.craft || {}).parts || []).filter((p: Any) => p.mat);
  const price = I.priceOf(it), qty = +it.qty || 1;
  const trade = price && price.cu > 0 ? K.trade(price.cu, cha) : null;
  const tInfo = I.tInfo('харизма');
  const rows: [string, ReactNode][] = [];
  const add = (t: string, x: ReactNode) => { if (x !== '' && x !== null && x !== undefined && x !== false) rows.push([t, x]); };
  if (c.damage !== null && c.damage !== undefined) add('Урон', <><b>{fmt(c.damage)}</b>{c.magicDamage ? ` + маг ${fmt(c.magicDamage)}` : ''}{c.gun && c.mult.length ? <span className="muted small"> (металл {fmt(c.gun.metal)})</span> : null}</>);
  if (c.armor !== null && c.armor !== undefined) add('Броня', <><b>{fmt(c.armor)}</b>{c.magicArmor ? ` + маг ${fmt(c.magicArmor)}` : ''}</>);
  if (parts.length) add('Материал', <>{parts.map(p => `${p.mat} ${fmt(+p.u || 0)} ед.${p.role === 'non' && I.roleKind(it.kind) ? ' (не на урон)' : ''}`).join(', ')}{c.need ? <span className="muted small"> — нужно {fmt(c.need)} ед.</span> : null}</>);
  if (c.gun) add('Огнестрел', I.gunStats(c));
  if (c.base && c.base.dt) add('Тип урона', c.base.dt);
  if (c.base && c.base.range) add('Дальность', c.base.range);
  if ((c.req || []).length) add('Требования', <>{c.req.map((r: Any, i: number) => <span key={i} className={r.ok ? 'req-ok' : 'req-bad'}>{i ? ', ' : ''}{Rr.STAT_SHORT[r.stat]} {r.need}</span>)}</>);
  if (c.skill !== null && c.skill !== undefined) add('Изготовить самому', <><span className={c.skillOk === false ? 'req-bad' : c.skillOk ? 'req-ok' : ''}>ремесло ур. {c.skill}</span>{c.craftHave !== null && c.craftHave !== undefined ? <span className="muted small"> (у героя {fmt(c.craftHave)})</span> : null}</>);
  if (c.hands) add('Руки', c.hands);
  if (c.pen) add('Штраф ловкости', c.pen);
  if (K.CRAFTABLE.includes(it.kind) && c.base) add('Гнёзда для камней', `${c.sockets}${((it.craft || {}).inlays || []).length ? `, занято ${it.craft.inlays.length}` : ''}`);
  if (K.CRAFTABLE.includes(it.kind)) add('Размер', c.size.name);
  if (c.sharpen) add('Заточка', `${c.sharpen} из ${C.CRAFT.SHARPEN_MAX}`);
  if (price) add('Цена', <><b>{K.money(price.cu)}</b>{qty > 1 ? ` за шт. · всего ${K.money(price.cu * qty)}` : ''}{price.own ? <span className="muted small"> — назначил ГМ</span> : price.mat ? <span className="muted small"> — по материалам</span> : null}</>);
  if (trade) add('У торговца', <>купить <b>{K.money(trade.buy)}</b> <span className="muted small">(наценка {fmt(trade.markup)}%)</span> · продать <b>{K.money(trade.sell)}</b>{trade.sellPct ? <span className="muted small"> ({signed(trade.sellPct)}%)</span> : null}<span className="muted small"> — харизма {fmt(cha)}{cha >= (+tInfo.max || 100) && tInfo.top ? `; ${tInfo.top}` : ''}</span></>);
  if (perms.gm && I.WEARABLE_ANY.includes(it.kind)) {
    const auto = K.slotCat(Object.assign({}, it, { cat: undefined }));
    const cur = it.cat === undefined || it.cat === '' ? '' : it.cat === null ? 'none' : it.cat;
    add('Где носить', <select className="sel gr-sel" value={cur} onChange={e => act('invCat', { v: it.id }, e.target.value)} aria-label="Где носить">
      <option value="">авто: {auto ? K.CATS[auto].toLowerCase() : 'не надевается'}</option>
      <option value="none">не надевается</option>
      {Object.entries(K.CATS as Record<string, string>).map(([k, t]) => <option key={k} value={k}>{t.toLowerCase()}</option>)}
    </select>);
  } else if (c.cat) add('Где надевать', K.CATS[c.cat]);
  if (it.src) add('Откуда', it.src);
  const boost = I.boostHtml(c);
  const give = I.giveRow(it, perms);
  const tome = K.isTome(it) && perms.gm;
  if (tome && !ui.get('invTome')) window.App.ui.invTome = 's';
  if (tome && !ui.get('invTomeN')) window.App.ui.invTomeN = String(K.tomeBonus(it));

  return (
    <section ref={ref} className="card wstack gr-item">
      <div className="gr-head">
        <h2>{it.name}{qty > 1 ? ` ×${qty}` : ''}</h2>
        <span className="chip">{K.KIND_NAMES[it.kind] || it.kind}{it.base && it.base !== it.name ? ': ' + it.base : ''}</span>
        <button type="button" className="gr-x" onClick={() => act('invSel', { v: '' })} aria-label="Закрыть карточку" title="Закрыть">✕</button>
      </div>
      {rows.length > 0 && <dl className="kvs">{rows.map(([t, x]) => <div key={t} className="kv"><dt>{t}</dt><dd>{x}</dd></div>)}</dl>}
      {effs.length > 0 && <ul className="wfx">{effs.map((e, i) => <li key={i}><b>{e.src}:</b> {e.text}{e.scale && e.scale !== 'за предмет' ? <> <span className="chip">{e.scale}</span></> : null}{e.applied ? <span className="muted small"> — учтено в {e.applied === 'dmg' ? 'уроне' : 'броне'}</span> : null}</li>)}</ul>}
      {boost && <div className="gr-boost" dangerouslySetInnerHTML={{ __html: boost }} />}
      {it.note && <p className="small gr-pre">{it.note}</p>}
      {tome && <>
        <div className="hp-row">
          <label className="winline">Прочитать: повысить
            <select className="sel gr-sel" value={ui.get('invTome')} onChange={e => ui.set('invTome', e.target.value)}>{Rr.STATS.map((k: string) => <option key={k} value={k}>{Rr.STAT_NAMES[k].toLowerCase()}</option>)}</select>
          </label>
          <label className="winline">на <input type="number" min={1} step={1} className="gr-num" value={ui.get('invTomeN')} onChange={e => ui.set('invTomeN', e.target.value)} /></label>
          <button type="button" className="btn primary small" onClick={() => act('invTome', { v: it.id })}>Прочитать</button>
        </div>
        <p className="muted small">Прибавка навсегда, уровень не меняется: попадёт в «Состояния» и сразу в характеристики; прочитанный {/^свиток/.test(norm(it.name)) ? 'свиток' : 'трактат'} удаляется из рюкзака.</p>
      </>}
      {(c.warnings.length > 0 || c.notes.length > 0) && <ul className="small gr-warn">{c.warnings.map((w: string, i: number) => <li key={'w' + i} className="gr-bad">{w}</li>)}{c.notes.map((w: string, i: number) => <li key={'n' + i} className="muted">{w}</li>)}</ul>}
      <div className="row">
        {canEquip && c.cat && (isWorn ? <button type="button" className="btn" onClick={() => act('invUnequip', { v: it.id })}>Снять</button>
          : <button type="button" className="btn primary" onClick={() => act('invEquip', { v: it.id })}>Надеть</button>)}
        {perms.gm && <>
          <button type="button" className="btn" onClick={() => act('invEdit', { v: it.id })}>Изменить</button>
          <button type="button" className="btn ghost" onClick={() => act('invQty', { v: it.id, d: '1' })}>+1</button>
          <button type="button" className="btn ghost" disabled={qty <= 1} onClick={() => act('invQty', { v: it.id, d: '-1' })}>−1</button>
          <button type="button" className="btn ghost danger" onClick={() => act('invDel', { v: it.id })}>Убрать</button>
        </>}
      </div>
      {give && <LegacyHtml html={give} />}
    </section>
  );
}

// ------------------------------------------------------------ кошелёк
// валюту выдаёт ГМ, а тратит и разменивает игрок: сдача считается сама (1 се, заплатить 24 м → 76 м)
function Wallet({ w, perms }: { w: Any; perms: Perms }) {
  const K = window.Craft, C = (window as Any).GM_CONFIG;
  const ui = useUi();
  const coins: Any[] = C.CURRENCIES;
  const other: Any[] = (w.other || []).filter((x: Any) => x && x.name);
  const n = (x: unknown) => +x! || 0;
  const coinOpts = (skipLow?: boolean) => coins.filter(c => !skipLow || c.rate > 1).map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>);
  if (!ui.get('invPayCoin')) window.App.ui.invPayCoin = 'м';
  if (!ui.get('invBreakCoin')) window.App.ui.invBreakCoin = 'се';
  return (
    <section className="card wstack">
      <div className="gr-head"><h2>Кошелёк</h2><span className="muted small">всего ≈ {K.money(K.walletCopper(w))}</span></div>
      <div className="gr-coins">
        {coins.map(c => <div key={c.id} className={'gr-coin' + (n(w[c.id]) ? '' : ' zero')}><b>{fmt(n(w[c.id]))}</b><span>{c.id}</span><small>{c.name}</small></div>)}
      </div>
      {other.length > 0 && (
        <ul className="hp-list">{other.map((x, i) => (
          <li key={i}><span>{x.name}: <b>{fmt(n(x.qty))}</b></span>
            {perms.owner && n(x.qty) > 0 && <input type="number" min={1} step={1} className="gr-num" value={ui.get('invSo_' + i)} onChange={e => ui.set('invSo_' + i, e.target.value)} placeholder="потратить" aria-label={`Потратить: ${x.name}`} />}</li>
        ))}</ul>
      )}
      {perms.owner && other.some(x => n(x.qty) > 0) && <div className="row"><button type="button" className="btn small" onClick={() => act('invSpendOther')}>Потратить особую валюту</button></div>}

      {perms.owner && <>
        <div className="hp-row">
          <input type="number" min={1} step={1} className="gr-num" value={ui.get('invPayN')} onChange={e => ui.set('invPayN', e.target.value)} placeholder="сколько" aria-label="Сколько заплатить" />
          <select className="sel gr-sel" value={ui.get('invPayCoin')} onChange={e => ui.set('invPayCoin', e.target.value)} aria-label="Монета">{coinOpts()}</select>
          <input type="text" value={ui.get('invPayWhy')} onChange={e => ui.set('invPayWhy', e.target.value)} maxLength={120} placeholder="за что (необязательно)" aria-label="За что" />
          <button type="button" className="btn primary small" onClick={() => act('invPay')}>Заплатить</button>
        </div>
        <div className="hp-row">
          <select className="sel gr-sel" value={ui.get('invBreakCoin')} onChange={e => ui.set('invBreakCoin', e.target.value)} aria-label="Монета">{coinOpts(true)}</select>
          <button type="button" className="btn small" onClick={() => act('invBreak')}>Разменять 1 монету на 100 мельче</button>
          <button type="button" className="btn ghost small" onClick={() => act('invGather')}>Собрать мелочь</button>
        </div>
        <p className="muted small">Сдача считается сама: заплатить 24 м из 1 се — останется 76 м. Получить деньги можно только от ГМ.</p>
      </>}

      {perms.gm && (
        <div className="wstack tight gr-gm">
          <h3>Выдать или забрать</h3>
          <div className="gr-coins edit">
            {coins.map(c => <label key={c.id} className="gr-coin-in"><span>{c.id}</span><input type="number" step={1} value={ui.get('invW_' + c.id)} onChange={e => ui.set('invW_' + c.id, e.target.value)} placeholder="±" aria-label={`Выдать или забрать: ${c.name}`} /></label>)}
          </div>
          {other.length > 0 && <ul className="hp-list">{other.map((x, i) => <li key={i}><span>{x.name}</span><input type="number" step={1} className="gr-num" value={ui.get('invWo_' + i)} onChange={e => ui.set('invWo_' + i, e.target.value)} placeholder="±" aria-label={`Выдать или забрать: ${x.name}`} /></li>)}</ul>}
          <div className="row"><button type="button" className="btn small" onClick={() => act('invWallet')}>Применить</button></div>
          <div className="hp-row">
            <input type="text" list="grCoins" value={ui.get('invWnName')} onChange={e => ui.set('invWnName', e.target.value)} placeholder="особая валюта (честь, кровавая монета…)" aria-label="Особая валюта" />
            <input type="number" step={1} className="gr-num" value={ui.get('invWnQty')} onChange={e => ui.set('invWnQty', e.target.value)} placeholder="кол-во" aria-label="Количество" />
            <button type="button" className="btn small" onClick={() => act('invWalletNew')}>Выдать</button>
          </div>
          <datalist id="grCoins">{C.SPECIAL_CURRENCIES.map((x: string) => <option key={x} value={x} />)}</datalist>
        </div>
      )}
      <p className="muted small">1 мд = 100 пл, 1 пл = 100 з, 1 з = 100 се, 1 се = 100 м. Цены в таблицах без пометки — в медных.</p>
    </section>
  );
}

/** разметка прежнего сайта (заклинания, «Выдать предмет», крафтильни, передача): обновляется, только когда изменилась */
function LegacyHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useLayoutEffect(() => { if (ref.current && html !== last.current) { ref.current.innerHTML = html; last.current = html; } });
  return <div ref={ref} className="legacy-pane" />;
}
