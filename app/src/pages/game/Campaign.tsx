import { useState } from 'react';
import { cap } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import { fmt } from '../create/kit';
import { Allies, BattleCard, type BattleCtx } from './Battle';
import { DungeonCard } from './Dungeon';
import { charView, copyText, joinLink, run, setTarget, STATUS, useWatch, when, type Any } from './cloud';
import { Dice } from './Dice';

/*
 * Страница кампании (#game/<кампания>): поле боя, персонажи, союзники, сессия, журнал, бросок d100, участники и приглашение (ГМ),
 * казна, итоги сессий, заметки ГМ, настройки. Данные — живые подписки js/cloud.js.
 * Поле боя и союзники — ./Battle.tsx (расчёт — js/battle.js); при поле боя бросок и журнал — в панели рядом с картой.
 * Генератор подземелий (только ГМ) — ./Dungeon.tsx (генерация — js/dungeon.js). Стили прежнего сайта здесь больше не нужны.
 */
const FEED_SHUT = 'hero-workshop:feed-shut';
const ORDER: Record<string, number> = { review: 0, active: 1, draft: 2, dead: 3, retired: 4 };

export function Campaign({ cid }: { cid: string }) {
  const C = window.Cloud, App = window.App;
  const camp = useWatch(cid, (ok, bad) => C.watchCampaign(cid, (c: Any) => { ok(c); if (c) C.syncName(c); }, bad));
  const chars = useWatch<Any[]>(cid, (ok, bad) => C.watchCharacters(cid, ok, bad));
  const sessions = useWatch<Any[]>(cid, (ok, bad) => C.watchSessions(cid, ok, bad));
  const [feed, setFeed] = useState(String(App.ui.gFeed || 'all'));
  const events = useWatch<Any[]>(cid + '|' + feed, (ok, bad) => C.watchEvents(cid, ok, bad, feed !== 'all' ? { session: +feed } : { limit: 60 }));
  const me = C.uid();
  const gm = !!camp.data && camp.data.gm === me;
  const priv = useWatch(gm ? cid + '|priv' : null, (ok) => C.watchPrivate(cid, '_campaign', ok, () => { /* заметки не обязательны */ }));
  const [, tick] = useState(0);

  if (camp.err && !camp.data) return (
    <div className="page"><a className="crumb" href="#game"><span aria-hidden="true">←</span> Все кампании</a>
      <div className="card wstack"><h2>Кампания недоступна</h2><p>{camp.err}</p><p className="muted small">Её могли удалить или вас исключили. Попросите у ГМ новый код приглашения.</p></div></div>
  );
  if (!camp.data) return <div className="page"><div className="card empty"><Icon name="dice" /><p>Загружаю кампанию…</p></div></div>;
  const c = camp.data, s = c.session || {};
  const list: Any[] = (chars.data || []).slice().sort((x, y) => (gm ? 0 : (x.owner === me ? -1 : 0) - (y.owner === me ? -1 : 0)) || (ORDER[x.status] - ORDER[y.status]) || (x.createdMs - y.createdMs));
  const inGame = list.filter(x => x.status === 'active');
  const partyLevel = inGame.length ? inGame.reduce((a, ch) => a + (charView(ch).res.level || 0), 0) / inGame.length : 1;
  const arena = !!(window.Battle && c.board);
  const myHero = gm ? null : inGame.find(ch => ch.owner === me);

  // запись в кампанию сразу показывается, не дожидаясь сервера
  const patchCamp = (patch: Any) => { camp.set(x => ({ ...x, ...patch })); return C.updateCampaign(cid, patch).catch((e: unknown) => App.toast(C.errorText(e))); };
  const patchChar = (chid: string, patch: Any) => { chars.set(l => (l || []).map(x => (x.id === chid ? { ...x, ...patch } : x))); return C.updateCharacter(cid, chid, patch).catch((e: unknown) => App.toast(C.errorText(e))); };
  const rerender = () => tick(t => t + 1);
  const heroes = inGame.map(ch => { const v = charView(ch); return { id: ch.id, name: ch.name || 'Безымянный герой', owner: ch.owner, ownerName: ch.ownerName, pos: ch.pos, apos: ch.apos, vit: ch.vit, der: v.res.der, race: v.res.race, pic: ch.pic || '', rz: window.Resist ? (v.rz || (v.rz = window.Resist.ofHero(v, ch))) : [] }; });
  const party = inGame.map(ch => ({ id: ch.id, name: ch.name || 'Безымянный герой' }));
  const saveAllies = (allies: Any[]) => patchCamp({ allies });

  const bctx: BattleCtx = {
    cid, camp: c, gm, me, level: partyLevel, rerender, heroes, saveAllies, allies: c.allies || [],
    saveBoard: (board: Any) => patchCamp({ board }),
    savePos: (chid: string, pos: Any) => patchChar(chid, { pos }),
    // ХП, МП, броня и зоркость героя в бою — в его персонаже (vit): меняет только ГМ
    saveVit: (chid: string, vit: Any) => patchChar(chid, { vit }),
    saveAllyPos: (chid: string, aid: string, p: Any) => { const ch = list.find(x => x.id === chid); return patchChar(chid, { apos: { ...((ch && ch.apos) || {}), [aid]: p } }); },
  };
  // подземелье текстом — в конец заметок ГМ
  const addNotes = (text: string) => {
    const was = String((priv.data || {}).text || '').trim();
    run(() => C.savePrivate(cid, '_campaign', (was ? was + '\n\n' : '') + text), 'Подземелье добавлено в заметки ГМ');
  };

  const dice = <Dice cid={cid} chid={myHero?.id} chName={myHero ? myHero.name || 'Безымянный герой' : undefined} side={arena} />;
  const journal = <Journal cid={cid} gm={gm} events={events.data} chars={list} sessions={sessions.data || []} feed={feed} setFeed={f => { App.ui.gFeed = f; setFeed(f); }} side={arena} />;

  return (
    <div className="page cp">
      <a className="crumb" href="#game"><span aria-hidden="true">←</span> Все кампании</a>
      <header className="cp-head">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">{gm ? 'Вы ГМ этой кампании.' : `ГМ: ${c.gmName || '—'}.`} {s.active && <b className="g-live">Идёт сессия {s.n}.</b>}</p>
        </div>
        <div className="cp-user muted small">Вы: <b>{C.name()}</b>
          <button type="button" className="btn ghost small" onClick={() => window.App.actions.gameHelp && window.App.actions.gameHelp()}>? Справка</button></div>
      </header>
      {(camp.err || chars.err) && <p className="issue err">{camp.err || chars.err}</p>}

      {window.Battle && <BattleCard o={bctx} side={arena ? <>{dice}{journal}</> : null} />}

      <div className="cp-grid">
        <div className="wstack cp-main">
          <Characters cid={cid} camp={c} gm={gm} me={me} list={chars.data ? list : null} />
          {window.Battle && chars.data && <Allies gm={gm} heroes={party} allies={c.allies || []} save={saveAllies} />}
          <NewChar cid={cid} camp={c} />
          {!arena && dice}
          {!arena && journal}
          {(sessions.data || []).length > 0 && <SessionNotes cid={cid} gm={gm} sessions={sessions.data!} current={s.n} />}
          {gm && <PrivateNotes key={String(!!priv.data)} save={text => run(() => C.savePrivate(cid, '_campaign', text), 'Заметки сохранены')} text={(priv.data || {}).text || ''} title="Заметки ГМ" placeholder="сюжетные зацепки, секреты, планы" />}
        </div>
        <aside className="wstack cp-side-col">
          <Session cid={cid} gm={gm} s={s} />
          {gm && chars.data && <Treasury cid={cid} list={inGame} />}
          {gm && <Invite cid={cid} code={c.code} />}
          <Members cid={cid} camp={c} gm={gm} me={me} list={list} />
          {gm && <Settings cid={cid} camp={c} />}
        </aside>
      </div>
      {gm && window.Dungeon && <DungeonCard cid={cid} level={partyLevel} rerender={rerender} addNotes={addNotes} />}
    </div>
  );
}

// ------------------------------------------------------------ персонажи
function Characters({ cid, gm, me, list }: { cid: string; camp: Any; gm: boolean; me: string; list: Any[] | null }) {
  const review = (list || []).filter(x => x.status === 'review').length;
  return (
    <section className="wstack">
      <div className="cp-sec"><h2 className="h-sec">Персонажи</h2>{gm && review > 0 && <span className="chip is-gm">на проверке: {review}</span>}</div>
      {!list ? <div className="card empty"><p>Загружаю…</p></div> : list.length ? (
        <ul className="cp-chars">
          {list.map(ch => {
            const v = charView(ch), race = v.res.race;
            const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
            const custom = ch.pic && /^data:image\/(webp|jpeg|png);base64,/.test(ch.pic) ? ch.pic : '';
            const pic = custom || (base && window.RACE_IMAGES[base.id] ? window.RACE_IMAGES[base.id].src : '');
            const incoming = window.Inv ? window.Inv.incoming(ch, ch.id, list).length : 0;
            return (
              <li key={ch.id}>
                <a className={'cp-char' + (ch.owner === me ? ' mine' : '')} href={`#game/${encodeURIComponent(cid)}/${encodeURIComponent(ch.id)}`}>
                  <span className="cp-pic">{pic ? <img src={pic} alt="" loading="lazy" /> : <Icon name="user" />}</span>
                  <span className="cp-cbody">
                    <b>{ch.name || 'Безымянный герой'}</b>
                    <span className="small">{race ? `${cap(race.name)}, ур. ${fmt(v.res.level)}` : 'раса не выбрана'}</span>
                    <span className="small muted">игрок: {ch.ownerName || '—'}{ch.owner === me ? ' (вы)' : ''}</span>
                    <span className="row"><span className={'chip st-' + ch.status}>{STATUS[ch.status] || ch.status}</span>{incoming > 0 && <span className="chip is-gm" title="Другой персонаж передаёт вещи — принять во вкладке «Снаряжение»">передают вещи: {incoming}</span>}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : <div className="card empty"><Icon name="users" /><p>Персонажей пока нет.</p></div>}
    </section>
  );
}

function NewChar({ cid, camp }: { cid: string; camp: Any }) {
  const App = window.App, R = window.Rules, C = window.Cloud;
  const [pick, setPick] = useState('');
  const t = window.Game ? window.Game.target() : null;
  const local: Any[] = App.store.get('hero-workshop:heroes', []) || [];
  const fresh = () => {
    if (App.state && App.state.raceId && !confirm('В мастере есть черновик. Начать нового персонажа с нуля? (Черновик можно сначала сохранить в «Мои герои».)')) return;
    App.state = R.newState(); App.editingId = null; App.prevState = null; App.save(); App.recompute();
    setTarget({ cid, chid: null, cname: camp.name });
    location.hash = '#create/race';
  };
  const useDraft = () => { setTarget({ cid, chid: null, cname: camp.name }); location.hash = '#create/summary'; };
  const [busy, setBusy] = useState(false);
  const fromLocal = async () => {
    const h = local.find(x => x.id === pick);
    if (!h) { App.toast('Выберите героя'); return; }
    if (busy) return;   // повторное нажатие, пока идёт запись, не создаёт второго такого же персонажа
    const res = R.compute(App.migrate(JSON.parse(JSON.stringify(h.state))));
    setBusy(true);
    const ok = await run(async () => {
      const chid = await C.createCharacter(cid, App.migrate(h.state), res.ok ? 'review' : 'draft', h.pic ? { pic: h.pic } : null);
      location.hash = `#game/${cid}/${chid}`;
    }, res.ok ? 'Персонаж отправлен ГМ на проверку' : 'Добавлен как черновик: в листе есть ошибки');
    if (!ok) setBusy(false);
  };
  return (
    <section className="card wstack">
      <h3>Новый персонаж в кампанию</h3>
      <div className="row">
        <button type="button" className="btn primary" onClick={fresh}><Icon name="spark" />Собрать в мастере</button>
        {App.state && App.state.raceId && !(t && t.chid) && <button type="button" className="btn" onClick={useDraft}>Взять черновик из мастера{App.state.name ? ` («${App.state.name}»)` : ''}</button>}
      </div>
      {local.length > 0 && <div className="hp-row">
        <select className="sel" value={pick} onChange={e => setPick(e.target.value)} aria-label="Герой из «Моих героев»">
          <option value="">— из «Моих героев» —</option>
          {local.map(h => <option key={h.id} value={h.id}>{h.state.name || 'Безымянный герой'}</option>)}
        </select>
        <button type="button" className="btn" onClick={fromLocal} disabled={busy}>Добавить</button>
      </div>}
      <p className="muted small">Персонаж уходит ГМ на проверку; после утверждения лист создания фиксируется, а дальше идёт развитие: опыт, уровни, фракции, предметы.</p>
    </section>
  );
}

// ------------------------------------------------------------ журнал кампании
function Journal({ cid, gm, events, chars, sessions, feed, setFeed, side }: { cid: string; gm: boolean; events?: Any[]; chars: Any[]; sessions: Any[]; feed: string; setFeed: (f: string) => void; side?: boolean }) {
  const App = window.App, C = window.Cloud;
  const [shut, setShut] = useState(!!App.store.get(FEED_SHUT, false));
  const [note, setNote] = useState('');
  const alive = new Set(chars.map(x => x.id));
  const write = () => { const text = note.trim(); if (text) run(async () => { await C.note(cid, text); setNote(''); }); };
  const toggle = () => { App.store.set(FEED_SHUT, !shut); setShut(!shut); };
  return (
    <section className={'card wstack cp-feed' + (side ? ' side' : '') + (shut ? ' is-shut' : '')}>
      <div className="cp-sec">
        <h2><button type="button" className="cp-feed-t" onClick={toggle} aria-expanded={!shut}>{shut ? '▸' : '▾'} Журнал{shut && events && events.length ? <span className="chip">{events.length}</span> : null}</button></h2>
        {!shut && sessions.length > 0 && <select className="sel gr-sel" value={feed} onChange={e => setFeed(e.target.value)} aria-label="Что показать">
          <option value="all">последние события</option>{sessions.map(x => <option key={x.n} value={x.n}>сессия {x.n}</option>)}</select>}
      </div>
      {!shut && <>
        <div className="hp-row">
          <input type="text" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && write()} maxLength={2000} placeholder={gm ? 'что произошло в игре — увидят все' : 'запись в журнал — увидят все'} aria-label="Запись в журнал" />
          <button type="button" className="btn small" onClick={write}>Записать</button>
        </div>
        {!events ? <p className="muted small">Загружаю…</p> : !events.length ? <p className="muted small">Записей пока нет.</p> : (
          <ol className="cp-ev" data-keep="feed">
            {events.map(e => (
              <li key={e.id || e.ms} className={'ev-' + (e.kind || 'note')}>
                <span className="muted small">{when(e.ms)}{e.session ? <> · <span className="chip">сессия {e.session}</span></> : null}</span>
                <span>
                  {e.chid && e.chName ? (alive.has(e.chid) ? <a href={`#game/${encodeURIComponent(cid)}/${encodeURIComponent(e.chid)}`}><b>{e.chName}</b></a> : <b>{e.chName}</b>) : null}{e.chid && e.chName ? ': ' : ''}
                  {e.kind === 'roll' && typeof e.roll === 'number'
                    ? <span className="cp-roll"><Icon name="dice" />d100: <b className={e.roll === 1 || e.roll === 100 ? 'edge' : ''}>{e.roll}</b>{e.why ? ` — ${e.why}` : ''}</span>
                    : e.text}
                  {['note', 'dev', 'roll'].includes(e.kind) && <span className="muted small"> — {e.byName || ''}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </>}
    </section>
  );
}

// ------------------------------------------------------------ боковая колонка
function Session({ cid, gm, s }: { cid: string; gm: boolean; s: Any }) {
  const C = window.Cloud;
  return (
    <section className="card wstack">
      <h2 className="h-sec">Сессия</h2>
      {s.active ? <p><b className="g-live">Идёт сессия {s.n}</b> <span className="muted small">с {when(s.startedMs)}</span></p> : s.n ? <p>Сессия {s.n} завершена.</p> : <p className="muted">Сессий ещё не было.</p>}
      {gm && <>
        <div className="row">
          {s.active ? <button type="button" className="btn" onClick={() => run(() => C.endSession(cid), `Сессия ${s.n} завершена. Итоги можно дописать в блоке «Итоги сессий».`)}>Завершить сессию {s.n}</button> : <>
            <button type="button" className="btn primary" onClick={() => run(() => C.startSession(cid), 'Сессия началась')}>{s.n ? `Начать сессию ${s.n + 1}` : 'Начать первую сессию'}</button>
            {s.n ? <button type="button" className="btn ghost" onClick={() => run(() => C.resumeSession(cid), 'Сессия продолжается')}>Продолжить сессию {s.n}</button> : null}
          </>}
        </div>
        <p className="muted small">Всё, что происходит во время сессии, помечается её номером в журнале.</p>
      </>}
    </section>
  );
}

// казна отряда (видит ГМ): сколько денег у всех персонажей в игре вместе и у каждого
function Treasury({ cid, list }: { cid: string; list: Any[] }) {
  const K = window.Craft, coins: Any[] = (window as Any).GM_CONFIG.CURRENCIES;
  const sum: Record<string, number> = {}, other = new Map<string, { name: string; qty: number }>();
  const rows = list.map(ch => {
    const w = (charView(ch).inv || {}).wallet || {};
    coins.forEach(c => { sum[c.id] = (sum[c.id] || 0) + K.num(w[c.id]); });
    (w.other || []).filter((x: Any) => x && x.name && K.num(x.qty)).forEach((x: Any) => {
      const k = window.Rules.norm(x.name);
      other.set(k, { name: x.name, qty: ((other.get(k) || {}).qty || 0) + K.num(x.qty) });
    });
    return { ch, copper: K.walletCopper(w) };
  }).sort((a, b) => b.copper - a.copper);
  return (
    <section className="card wstack">
      <h2 className="h-sec">Казна отряда</h2>
      {list.length ? <>
        <p>Всего у персонажей в игре: <b>{K.money(K.walletCopper(sum))}</b></p>
        {coins.some(c => sum[c.id]) ? <div className="gr-coins">{coins.filter(c => sum[c.id]).map(c => <div key={c.id} className="gr-coin"><b>{fmt(sum[c.id])}</b><span>{c.id}</span><small>{c.name}</small></div>)}</div> : <p className="muted small">Денег пока нет.</p>}
        {other.size > 0 && <p className="small">Особая валюта: {[...other.values()].map(x => `${x.name} ${fmt(x.qty)}`).join(', ')}</p>}
        <ul className="hp-list">{rows.map(r => <li key={r.ch.id}><a href={`#game/${encodeURIComponent(cid)}/${encodeURIComponent(r.ch.id)}`}>{r.ch.name || 'Безымянный герой'}</a><span className="muted small">{K.money(r.copper)}</span></li>)}</ul>
      </> : <p className="muted small">Персонажей в игре пока нет.</p>}
      <p className="muted small">Валюту выдаёте вы на странице персонажа (Снаряжение → Кошелёк), тратят и разменивают игроки.</p>
    </section>
  );
}

function Invite({ cid, code }: { cid: string; code: string }) {
  return (
    <section className="card wstack">
      <h2 className="h-sec">Приглашение</h2>
      <p>Код: <code className="cp-code">{code}</code></p>
      <div className="row">
        <button type="button" className="btn small" onClick={() => copyText(code)}><Icon name="copy" />Скопировать код</button>
        <button type="button" className="btn small" onClick={() => copyText(joinLink(code))}><Icon name="copy" />Скопировать ссылку</button>
        <button type="button" className="link small" onClick={() => { if (confirm('Старый код перестанет работать. Сменить?')) run(() => window.Cloud.newCode(cid), 'Новый код готов'); }}>сменить код</button>
      </div>
      <p className="muted small">Игрок вводит код во вкладке «Игра» → «Присоединиться» или просто открывает ссылку.</p>
    </section>
  );
}

function Members({ cid, camp, gm, me, list }: { cid: string; camp: Any; gm: boolean; me: string; list: Any[] }) {
  const C = window.Cloud;
  const counts: Record<string, number> = {};
  list.forEach(ch => { counts[ch.owner] = (counts[ch.owner] || 0) + 1; });
  const name = (u: string) => (camp.memberNames || {})[u] || 'игрок';
  return (
    <section className="card wstack">
      <h2 className="h-sec">Участники</h2>
      <ul className="hp-list">{(camp.members || []).map((u: string) => (
        <li key={u}><span>{name(u)}{u === camp.gm && <span className="chip is-gm">ГМ</span>}{u === me && <span className="muted small"> (вы)</span>}{counts[u] ? <span className="muted small"> — персонажей: {counts[u]}</span> : null}</span>
          {gm && u !== me && <button type="button" className="link small" onClick={() => { if (confirm(`Исключить ${name(u)} из кампании? Его персонажи останутся, код приглашения сменится — остальным игрокам он больше не нужен.`)) run(() => C.removeMember(cid, u), 'Исключён, код приглашения сменился'); }}>исключить</button>}</li>
      ))}</ul>
      {!gm && <div><button type="button" className="link small fx-del" onClick={() => {
        if (confirm('Покинуть кампанию? Ваши персонажи останутся у ГМ; вернуться можно по коду.')) run(async () => { await C.leaveCampaign(cid); location.hash = '#game'; }, 'Вы покинули кампанию');
      }}>покинуть кампанию</button></div>}
    </section>
  );
}

function SessionNotes({ cid, gm, sessions, current }: { cid: string; gm: boolean; sessions: Any[]; current?: number }) {
  return (
    <section className="card wstack">
      <h2 className="h-sec">Итоги сессий</h2>
      {sessions.map(x => (
        <details key={x.n} className="more" open={x.n === current}>
          <summary>Сессия {x.n} <span className="muted small">{when(x.startedMs)}{x.endedMs ? ' – ' + when(x.endedMs) : ' · идёт'}</span></summary>
          {gm ? <PrivateNotes save={text => run(() => window.Cloud.saveSessionNotes(cid, x.n, text), 'Итоги сохранены')} text={x.notes || ''} placeholder="итоги: куда пришли, что нашли, кого победили" button="Сохранить итоги" />
            : <p className="small cs-pre">{x.notes || 'итогов пока нет'}</p>}
        </details>
      ))}
    </section>
  );
}

/** текст, который сохраняется кнопкой (заметки ГМ, итоги сессии) */
export function PrivateNotes({ text, save, title, placeholder, button = 'Сохранить' }: { text: string; save: (t: string) => Promise<unknown>; title?: string; placeholder: string; button?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const body = <>
    <textarea rows={4} value={draft !== null ? draft : text} onChange={e => setDraft(e.target.value)} placeholder={placeholder} />
    {draft !== null && draft !== text && <div className="row"><button type="button" className="btn small primary" disabled={busy} onClick={async () => {
      // не сохранилось (нет доступа, ошибка сети) — текст остаётся в поле, а не пропадает
      setBusy(true);
      const ok = await save(draft).catch(() => false);
      setBusy(false);
      if (ok !== false) setDraft(null);
    }}>{button}</button><button type="button" className="btn ghost small" onClick={() => setDraft(null)}>Отменить</button></div>}
  </>;
  if (!title) return <div className="wstack tight">{body}</div>;
  return <section className="card wstack"><h2 className="h-sec">{title}</h2><p className="muted small">Видите только вы.</p>{body}</section>;
}

function Settings({ cid, camp }: { cid: string; camp: Any }) {
  const C = window.Cloud;
  const [name, setName] = useState(camp.name);
  return (
    <details className="card more cp-settings">
      <summary>Настройки кампании</summary>
      <div className="wstack">
        <div className="hp-row">
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={120} aria-label="Название кампании" />
          <button type="button" className="btn small" onClick={() => { const n = name.trim(); if (n) run(() => C.updateCampaign(cid, { name: n }), 'Кампания переименована'); }}>Переименовать</button>
        </div>
        <div><button type="button" className="btn ghost small danger" onClick={() => {
          if (prompt(`Удалить кампанию «${camp.name}» со всеми персонажами и журналом? Это нельзя отменить. Чтобы подтвердить, впишите её название:`) !== camp.name) return;
          run(async () => { await C.deleteCampaign(cid); location.hash = '#game'; }, 'Кампания удалена');
        }}>Удалить кампанию</button></div>
        <p className="muted small">Удаляются все персонажи, журнал и сессии этой кампании.</p>
      </div>
    </details>
  );
}
