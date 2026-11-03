import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { cloudCall, toast, useLegacyCss, type useAuth } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import { SignIn } from '../../ui/SignIn';

/*
 * «Игра»: #game — вход, мои кампании, новая кампания, вход по коду, бросок d100 (новое);
 * #game/join/КОД — вход по ссылке-приглашению; #game/<кампания>[/<персонаж>] — страницы кампании и персонажа с полем
 * боя, сессиями и журналом пока рисует прежний сайт (js/game.js, js/battle.js, js/dungeon.js) — с живыми подписками.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Auth = ReturnType<typeof useAuth>;

export default function Game({ auth, path }: { auth: Auth; path: string[] }) {
  const C = window.Cloud;
  if (!auth.configured) return <GameHome auth={auth} />;
  if (!auth.ready) return <div className="page"><div className="card empty"><Icon name="cloud" /><p>Подключаюсь к серверу игры…</p></div></div>;
  if (auth.error && !C.ready) return (
    <div className="page"><div className="card wstack">
      <h2>Не удалось подключиться</h2><p>{auth.error}</p>
      <p className="muted small">Проверьте интернет и обновите страницу. В режиме «инкогнито» или с блокировщиком попробуйте обычное окно.</p>
      <button type="button" className="btn" onClick={() => location.reload()}>Обновить страницу</button>
    </div></div>
  );
  if (path[0] === 'join') return <Join auth={auth} code={path[1] || ''} />;
  if (path[0] && auth.user) return <LegacyGame path={path.slice(0, 2)} />;
  return <GameHome auth={auth} />;
}

// ------------------------------------------------------------ начальный экран
function GameHome({ auth }: { auth: Auth }) {
  const C = window.Cloud;
  const camps = useCampaigns(auth);
  const t = window.Game ? window.Game.target() : null;
  const uid = auth.user?.uid;
  const asGm = (camps || []).filter(c => c.gm === uid).length;
  return (
    <div className="page g-page">
      <header className="g-hero">
        <p className="eyebrow">кампании · сессии · бросок d100</p>
        <h1>Игра</h1>
        <p className="lead">{auth.user
          ? 'Ваши кампании, персонажи, сессии и журнал — в одном месте. Создайте свою кампанию или войдите в чужую по коду от ГМ.'
          : 'Кампании с друзьями: ГМ создаёт кампанию и даёт игрокам код, игроки собирают персонажей, а ГМ утверждает листы, начисляет опыт и ведёт журнал сессий. Всё хранится онлайн — играть можно с любого устройства.'}</p>
      </header>

      {!auth.configured ? (
        <div className="card wstack"><h2>Онлайн-игра ещё не подключена</h2>
          <p>Чтобы ГМ видел персонажей игроков, начислял опыт и вёл кампанию, сайту нужно онлайн-хранилище — его один раз подключает владелец сайта.</p>
          <p className="muted">Пока можно собирать героев и вести их развитие в «Моих героях».</p></div>
      ) : !auth.user ? (
        <section className="card acc g-signin">
          <span className="acc-ic"><Icon name="user" /></span>
          <div className="acc-body"><b>Войдите, чтобы играть в кампаниях</b><span>Через Google или по почте. Ваших героев из «Моих героев» вход тоже перенесёт в облако.</span><SignIn big /></div>
        </section>
      ) : <>
        <div className="g-user">
          <span className="muted">Вы: <b>{auth.user.name}</b></span>
          <button type="button" className="link small" onClick={() => {
            const name = (prompt('Имя в игре (его видят ГМ и игроки):', C.name()) || '').trim().slice(0, 40);
            if (name) cloudCall(() => C.rename(name), 'Имя изменено. В кампаниях оно обновится, когда вы их откроете.');
          }}>сменить имя</button>
          <button type="button" className="link small" onClick={() => cloudCall(() => C.signOut(), 'Вы вышли из аккаунта')}>выйти</button>
        </div>
        <dl className="g-stats">
          <div><dt>кампаний</dt><dd>{camps ? camps.length : '…'}</dd></div>
          <div><dt>вы ГМ</dt><dd>{camps ? asGm : '…'}</dd></div>
          <div><dt>вы игрок</dt><dd>{camps ? camps.length - asGm : '…'}</dd></div>
          <div><dt>идут сессии</dt><dd>{camps ? camps.filter(c => (c.session || {}).active).length : '…'}</dd></div>
        </dl>
        {t && <p className="note small">В мастере открыт персонаж для кампании «{t.cname}». <a href="#create/summary">Вернуться к нему</a></p>}

        <section className="wstack">
          <h2 className="h-sec">Мои кампании</h2>
          {!camps ? <div className="card empty"><p>Загружаю…</p></div> : camps.length ? (
            <ul className="g-camps">
              {camps.map(c => {
                const gm = c.gm === uid, s = c.session || {};
                return (
                  <li key={c.id}><a className={'g-camp' + (s.active ? ' is-live' : '')} href={'#game/' + encodeURIComponent(c.id)}>
                    <b>{c.name}</b>
                    <span className={'chip' + (gm ? ' is-gm' : '')}>{gm ? 'вы ГМ' : 'ГМ: ' + (c.gmName || '—')}</span>
                    <span className="muted small">участников: {(c.members || []).length}{s.n ? <> · {s.active ? <b className="g-live">идёт сессия {s.n}</b> : `сессий: ${s.n}`}</> : null}</span>
                  </a></li>
                );
              })}
            </ul>
          ) : <div className="card empty"><Icon name="dice" /><p>Вы пока не участвуете ни в одной кампании. Создайте свою или войдите по коду от ГМ.</p></div>}
        </section>

        <div className="g-start">
          <CampForm kind="create" />
          <CampForm kind="join" />
        </div>
      </>}

      {!auth.user && <section className="g-paths" aria-label="Как устроена игра">
        <article className="card"><h2>Я ГМ</h2><ol>
          <li>Войдите и создайте кампанию — появится код из шести знаков и ссылка.</li>
          <li>Отправьте код или ссылку игрокам.</li>
          <li>Утверждайте листы, начисляйте опыт, выдавайте предметы, ведите сессии и бои.</li></ol></article>
        <article className="card"><h2>Я игрок</h2><ol>
          <li>Войдите — через Google или по почте.</li>
          <li>«Присоединиться» → код от ГМ (или просто откройте его ссылку).</li>
          <li>Соберите героя в мастере и отправьте ГМ на проверку.</li></ol></article>
        <article className="card"><h2>Без входа</h2><ol>
          <li>Бросок d100 ниже работает и без входа.</li>
          <li>Героев можно собирать и хранить в <a href="#heroes">«Моих героях»</a>.</li>
          <li>Правила и таблицы — в <a href="#ref">справочнике</a>.</li></ol></article>
      </section>}

      <Dice />
    </div>
  );
}

function useCampaigns(auth: Auth) {
  const [camps, setCamps] = useState<Any[] | null>(null);
  const uid = auth.user?.uid;
  useEffect(() => {
    if (!uid) { setCamps(null); return; }
    const off = window.Cloud.watchMyCampaigns((l: Any[]) => setCamps(l || []), (e: unknown) => { toast(window.Cloud.errorText(e)); setCamps([]); });
    return () => { try { off && off(); } catch { /* noop */ } };
  }, [uid]);
  return camps;
}

function CampForm({ kind }: { kind: 'create' | 'join' }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const C = window.Cloud;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = v.trim();
    if (!s) { setMsg(kind === 'create' ? 'Придумайте название.' : 'Впишите код от ГМ.'); return; }
    setBusy(true); setMsg('');
    try {
      const cid = kind === 'create' ? await C.createCampaign(s) : await C.joinCampaign(s);
      toast(kind === 'create' ? 'Кампания создана' : 'Вы в кампании');
      location.hash = '#game/' + cid;
    } catch (err) { setMsg(C.errorText(err)); setBusy(false); }
  };
  return (
    <form className="card wstack" onSubmit={submit}>
      <h2>{kind === 'create' ? 'Новая кампания' : 'Присоединиться'}</h2>
      <p className="muted small">{kind === 'create' ? 'Вы станете ГМ: увидите всех персонажей, будете утверждать листы и начислять опыт.' : 'Код приглашения выдаёт ГМ — шесть букв и цифр.'}</p>
      {kind === 'create'
        ? <input type="text" value={v} onChange={e => setV(e.target.value)} maxLength={120} placeholder="Название, например «Сумеречный тракт»" aria-label="Название кампании" />
        : <input type="text" value={v} onChange={e => setV(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" placeholder="ABC234" aria-label="Код приглашения" className="g-code" />}
      <button type="submit" className="btn primary" disabled={busy}>{kind === 'create' ? 'Создать кампанию' : 'Войти в кампанию'}</button>
      {msg && <p className="issue err" role="alert">{msg}</p>}
    </form>
  );
}

// ------------------------------------------------------------ вход по ссылке-приглашению
function Join({ auth, code }: { auth: Auth; code: string }) {
  const C = window.Cloud;
  const started = useRef(false);
  useEffect(() => {
    if (!auth.user || started.current) return;
    started.current = true;
    C.joinCampaign(code).then((cid: string) => { toast('Вы в кампании'); location.hash = '#game/' + cid; },
      (e: unknown) => { toast(C.errorText(e)); location.hash = '#game'; });
  }, [auth.user, code, C]);
  if (auth.user) return <div className="page"><div className="card empty"><Icon name="dice" /><p>Присоединяюсь к кампании…</p></div></div>;
  return (
    <div className="page g-page">
      <header className="g-hero"><p className="eyebrow">приглашение</p><h1>Вход в кампанию</h1>
        <p className="lead">Войдите — и вы сразу окажетесь в кампании по коду <b>{C.normCode ? C.normCode(code) : code}</b>.</p></header>
      <section className="card acc g-signin"><span className="acc-ic"><Icon name="user" /></span>
        <div className="acc-body"><b>Войдите, чтобы присоединиться</b><SignIn big /></div></section>
    </div>
  );
}

// ------------------------------------------------------------ бросок d100
// честный бросок 1–100: криптографический генератор браузера, без перекоса (лишние значения отбрасываются)
function d100() {
  const cr = window.crypto;
  if (!cr || !cr.getRandomValues) return Math.floor(Math.random() * 100) + 1;
  const a = new Uint32Array(1), lim = 4294967200;
  do { cr.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % 100 + 1;
}
function Dice() {
  const ui = window.App.ui;
  const [why, setWhy] = useState('');
  const [hist, setHist] = useState<{ n: number; why: string }[]>(ui.gDiceHist || []);
  const [fresh, setFresh] = useState(0);
  const roll = () => {
    const n = d100();
    const h = [{ n, why: why.trim().slice(0, 200) }, ...hist].slice(0, 12);
    ui.gDiceHist = h; ui.gDiceLast = { n, ms: Date.now() };   // общая история с бросками в кампании
    setHist(h); setWhy(''); setFresh(f => f + 1);
  };
  const last = hist[0];
  return (
    <section className="card g-dice">
      <h2><Icon name="dice" />Бросок d100</h2>
      <div className="gd-row">
        <div key={fresh} className={'gd-n' + (last ? '' : ' empty') + (fresh ? ' fresh' : '') + (last && (last.n === 1 || last.n === 100) ? ' edge' : '')} aria-live="polite" aria-label="Результат броска">{last ? last.n : '—'}</div>
        <div className="gd-ctl">
          <input type="text" value={why} onChange={e => setWhy(e.target.value)} maxLength={200} placeholder="за что бросок (необязательно)" aria-label="За что бросок" onKeyDown={e => e.key === 'Enter' && roll()} />
          <button type="button" className="btn primary" onClick={roll}>Бросить d100</button>
        </div>
      </div>
      {hist.length > 1 && <p className="small gd-hist">Предыдущие: {hist.slice(1, 9).map((h, i) => <span key={i} title={h.why}>{h.n}</span>)}</p>}
      <p className="muted small">Бросок никуда не записывается. В кампании результат попадает в журнал — его видят ГМ и все игроки.</p>
    </section>
  );
}

// ------------------------------------------------------------ кампания и персонаж — прежний сайт
function LegacyGame({ path }: { path: string[] }) {
  useLegacyCss();
  const ref = useRef<HTMLDivElement>(null);
  const key = path.join('/');
  useLayoutEffect(() => {
    const App = window.App;
    App.ui.gamePath = key.split('/');
    if (ref.current && window.Game) window.Game.render(ref.current);
  }, [key]);
  useEffect(() => () => { if (window.Game) window.Game.leave(); }, []);
  return <div ref={ref} className="legacy-game" />;
}
