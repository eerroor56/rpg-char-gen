import { heroView, useHeroes, useSync, type useAuth } from '../lib/legacy';
import { Icon } from '../ui/Icon';
import { Sigil } from '../ui/Sigil';
import { SECTIONS } from '../App';

export default function Home({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const heroes = useHeroes();
  const sync = useSync();
  const last = [...heroes].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  const lv = last ? heroView(last) : null;
  return (
    <div className="page home">
      <section className="hello has-sigil">
        <Sigil />
        <p className="eyebrow">Конструктор · справочник · онлайн-игра</p>
        <h1>{auth.user ? `Здравствуйте, ${auth.user.name}` : 'Мастерская героя'}</h1>
        <p className="lead">Соберите персонажа по правилам игры, держите его в облаке и играйте с ГМ — на компьютере и на телефоне.</p>
        <div className="hello-act">
          <a className="btn primary big" href="#create"><Icon name="spark" />Создать персонажа</a>
          <a className="btn big" href="#game"><Icon name="dice" />Играть с ГМ</a>
        </div>
      </section>

      {lv && last && (
        <a className="card resume" href="#heroes">
          {lv.pic ? <img src={lv.pic} alt="" /> : <span className="resume-ph"><Icon name="user" /></span>}
          <span className="resume-body"><small>Продолжить</small><b>{lv.name}</b><span>{lv.race} · ур. {lv.level}{lv.age ? ` · ${lv.age}` : ''}</span></span>
          <Icon name="arrow" />
        </a>
      )}

      <div className="tiles">
        {SECTIONS.filter(s => s.id !== 'home').map(s => (
          <a key={s.id} href={'#' + s.id} className={`tile${s.id === 'support' ? ' tile-love' : ''}`}>
            <Icon name={s.icon} />
            <b>{s.title}</b>
            <small>{s.lead}</small>
            {s.old && <em>пока в прежней версии</em>}
          </a>
        ))}
      </div>

      {sync.configured && !sync.on && (
        <p className="note"><Icon name="cloud" /> Войдите в аккаунт в разделе <a href="#heroes">«Мои герои»</a> — герои сохранятся в облаке и будут видны на любом устройстве.</p>
      )}
    </div>
  );
}
