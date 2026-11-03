import { useEffect, useState, type ReactNode } from 'react';
import { initLegacy, useAuth, useRoute } from './lib/legacy';
import { Icon, type IconName } from './ui/Icon';
import Home from './pages/Home';
import Heroes from './pages/Heroes';
import Support from './pages/Support';
import Moving from './pages/Moving';
import Create from './pages/Create';
import Game from './pages/game/Game';
import HeroPage from './pages/hero/HeroPage';

// разделы: что уже в новой версии, а что пока открывается в прежней (old)
export const SECTIONS: { id: string; title: string; short: string; icon: IconName; old?: boolean; lead: string }[] = [
  { id: 'home', title: 'Главная', short: 'Главная', icon: 'home', lead: 'С чего начать' },
  { id: 'create', title: 'Создание персонажа', short: 'Создание', icon: 'spark', lead: 'Мастер по шагам: раса, возраст, черты, навыки, снаряжение' },
  { id: 'heroes', title: 'Мои герои', short: 'Герои', icon: 'users', lead: 'Ваши персонажи — в облаке, на любом устройстве' },
  { id: 'game', title: 'Игра', short: 'Игра', icon: 'dice', lead: 'Кампании с ГМ: сессии, журнал, поле боя' },
  { id: 'world', title: 'Мир', short: 'Мир', icon: 'globe', old: true, lead: 'Карта, уровни мира, места' },
  { id: 'ref', title: 'Справочник', short: 'Справочник', icon: 'book', old: true, lead: 'Расы, бестиарий, магия, предметы — все таблицы' },
  { id: 'rules', title: 'Как считается', short: 'Правила', icon: 'scale', old: true, lead: 'Формулы и решения по спорным местам' },
  { id: 'support', title: 'Поддержать', short: 'Поддержать', icon: 'heart', lead: 'СБП, USDT и TON, Telegram' },
];
const MOBILE_MAIN = ['home', 'create', 'heroes', 'game'];

export default function App() {
  initLegacy();
  const { tab, rest } = useRoute();
  const auth = useAuth();
  const [more, setMore] = useState(false);
  const cur = SECTIONS.find(s => s.id === tab) || SECTIONS[0];
  window.App.tab = cur.id;   // прежний сайт перерисовывает «Игру», только пока открыта она
  const heroId = cur.id === 'heroes' && rest[0] ? decodeURIComponent(rest[0]) : '';
  const gameAt = cur.id === 'game' ? rest.slice(0, 2).join('/') : '';
  useEffect(() => { setMore(false); window.scrollTo({ top: 0 }); if (!heroId) document.title = cur.id === 'home' ? 'Мастерская героя' : `${cur.title} — Мастерская героя`; }, [cur.id, cur.title, heroId, gameAt]);

  let page: ReactNode;
  if (cur.id === 'home') page = <Home auth={auth} />;
  else if (heroId) page = <HeroPage id={heroId} />;
  else if (cur.id === 'heroes') page = <Heroes auth={auth} />;
  else if (cur.id === 'support') page = <Support />;
  else if (cur.id === 'create') page = <Create />;
  else if (cur.id === 'game') page = <Game auth={auth} path={rest.map(decodeURIComponent)} />;
  else page = <Moving section={cur} />;

  return (
    <div className="shell">
      <aside className="side" aria-label="Разделы">
        <a className="app-brand" href="#home"><Mark /><span>Мастерская героя</span></a>
        <nav className="side-nav">
          {SECTIONS.map(s => (
            <a key={s.id} href={'#' + s.id} className={`side-link${s.id === cur.id ? ' is-on' : ''}${s.id === 'support' ? ' is-love' : ''}`} aria-current={s.id === cur.id ? 'page' : undefined}>
              <Icon name={s.icon} /><span>{s.id === 'create' ? 'Создание' : s.title}</span>
              {s.old && <em className="side-old" title="Пока открывается в прежней версии">скоро</em>}
            </a>
          ))}
        </nav>
        <Account auth={auth} />
      </aside>

      <header className="mtop">
        <a className="app-brand" href="#home"><Mark /><span>Мастерская героя</span></a>
        <a className="mtop-acc" href="#heroes" aria-label="Аккаунт и мои герои"><Icon name="user" />{auth.user ? <span>{auth.user.name}</span> : <span>Войти</span>}</a>
      </header>

      <main className="main" id="main">{page}</main>

      <nav className="mbar" aria-label="Разделы">
        {SECTIONS.filter(s => MOBILE_MAIN.includes(s.id)).map(s => (
          <a key={s.id} href={'#' + s.id} className={s.id === cur.id ? 'is-on' : ''} aria-current={s.id === cur.id ? 'page' : undefined}><Icon name={s.icon} /><span>{s.short}</span></a>
        ))}
        <button type="button" className={!MOBILE_MAIN.includes(cur.id) ? 'is-on' : ''} onClick={() => setMore(m => !m)} aria-expanded={more}><Icon name="more" /><span>Ещё</span></button>
      </nav>
      {more && (
        <div className="msheet" role="dialog" aria-label="Ещё разделы" onClick={() => setMore(false)}>
          <div className="msheet-box" onClick={e => e.stopPropagation()}>
            {SECTIONS.filter(s => !MOBILE_MAIN.includes(s.id)).map(s => (
              <a key={s.id} href={'#' + s.id} className="msheet-link"><Icon name={s.icon} /><span><b>{s.title}</b><small>{s.lead}</small></span></a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Mark() {
  return <svg className="mark" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,4 59,24 49,58 15,58 5,24" /><polygon className="inner" points="32,16 47,27 41,48 23,48 17,27" /></svg>;
}

function Account({ auth }: { auth: ReturnType<typeof useAuth> }) {
  if (!auth.configured) return null;
  return (
    <a className="side-acc" href="#heroes">
      <span className="side-acc-ic"><Icon name="user" /></span>
      {auth.user ? <span><b>{auth.user.name}</b><small>в облаке</small></span> : <span><b>Войти</b><small>герои — на любом устройстве</small></span>}
    </a>
  );
}
