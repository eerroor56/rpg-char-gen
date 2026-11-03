import { useMemo, useState } from 'react';
import { cloudCall, heroView, openInWizard, useHeroes, useSync, type useAuth } from '../lib/legacy';
import { Icon } from '../ui/Icon';
import { SignIn } from '../ui/SignIn';

export default function Heroes({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const heroes = useHeroes();
  const sync = useSync();
  const [q, setQ] = useState('');
  const rows = useMemo(() => heroes
    .map(h => ({ h, v: heroView(h) }))
    .filter(({ v }) => !q || `${v.name} ${v.race}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.h.savedAt || 0) - (a.h.savedAt || 0)), [heroes, q]);

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Мои герои</h1><p className="lead">Ваши персонажи вне кампаний: собранные в мастере, скопированные из игры или загруженные из файла.</p></div>
        <a className="btn primary" href="#create"><Icon name="spark" />Новый персонаж</a>
      </header>

      <AccountCard auth={auth} sync={sync} count={heroes.length} />

      {heroes.length > 4 && (
        <label className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени или расе" /></label>
      )}

      {rows.length ? (
        <ul className="hero-grid">
          {rows.map(({ h, v }) => (
            <li key={h.id} className="hero-card">
              <a className={`hero-pic${v.custom ? ' custom' : ''}`} href={'#heroes/' + encodeURIComponent(h.id)} aria-hidden="true" tabIndex={-1}>{v.pic ? <img src={v.pic} alt="" loading="lazy" /> : <Icon name="user" />}</a>
              <div className="hero-body">
                <h2><a href={'#heroes/' + encodeURIComponent(h.id)}>{v.name}</a></h2>
                <p>{v.race} · ур. {v.level}{v.age ? ` · ${v.age}` : ''}</p>
                <p className={`chip ${v.ok ? 'ok' : 'bad'}`}><Icon name={v.ok ? 'check' : 'alert'} />{v.ok ? 'собран по правилам' : `ошибок в листе: ${v.errors}`}</p>
                {v.xp > 0 && <p className="muted small">опыт: {v.xp.toLocaleString('ru-RU')}</p>}
              </div>
              <div className="hero-act">
                <a className="btn small primary" href={'#heroes/' + encodeURIComponent(h.id)}>Открыть</a>
                <button type="button" className="btn small ghost" onClick={() => openInWizard(h)}>В мастере</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty card">
          <Icon name="users" />
          <p>{heroes.length ? 'Никого не нашлось.' : sync.loading ? 'Загружаю героев из облака…' : 'Героев пока нет.'}</p>
          {!heroes.length && <a className="btn primary" href="#create">Собрать первого персонажа</a>}
        </div>
      )}
    </div>
  );
}

// вход и где хранятся герои: Google, почта; без входа — только в этом браузере
function AccountCard({ auth, sync, count }: { auth: ReturnType<typeof useAuth>; sync: ReturnType<typeof useSync>; count: number }) {
  const C = window.Cloud;
  if (!auth.configured) return null;
  if (auth.user) {
    return (
      <section className={`acc card ${sync.err ? 'bad' : 'ok'}`}>
        <span className="acc-ic"><Icon name="cloud" /></span>
        <div className="acc-body">
          <b>{auth.user.name}</b>
          <span>{sync.err ? `Облако недоступно: ${sync.err}. Герои пока в этом браузере.` : sync.loading ? 'Сверяю героев с облаком…' : `В облаке: ${count}. Изменения сохраняются сами и видны на любом устройстве.`}</span>
        </div>
        <button type="button" className="btn ghost small" onClick={() => cloudCall(() => C.signOut(), 'Вы вышли из аккаунта')}><Icon name="out" />Выйти</button>
      </section>
    );
  }
  return (
    <section className="acc card">
      <span className="acc-ic"><Icon name="cloud" /></span>
      <div className="acc-body">
        <b>Войдите, чтобы герои были в облаке</b>
        <span>Сейчас они хранятся только в этом браузере{count ? ` (${count})` : ''}. После входа перенесутся сами и появятся на любом устройстве.</span>
        <SignIn />
      </div>
    </section>
  );
}
