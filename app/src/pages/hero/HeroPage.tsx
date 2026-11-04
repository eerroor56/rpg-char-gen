import { heroList, newHeroId, openInWizard, toast, useHeroes, useSync, writeHeroes, type Hero } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import type { Any } from '../create/kit';
import { HeroScreen } from './HeroScreen';

/*
 * Страница сохранённого героя (#heroes/<id>): «здесь вы сами себе ГМ» — все права, запись в «Мои герои» (браузер и облако).
 * Сам экран (картинка, вкладки) — ./HeroScreen.tsx, общий с персонажем кампании.
 */
export default function HeroPage({ id }: { id: string }) {
  const heroes = useHeroes();
  const sync = useSync();
  const h = heroes.find(x => x.id === id) as Hero | undefined;
  if (!h) return (
    <div className="page">
      <a className="crumb" href="#heroes"><span aria-hidden="true">←</span> Мои герои</a>
      <div className="card empty"><Icon name="users" /><p>Герой не найден — возможно, удалён или ещё загружается из облака.</p></div>
    </div>
  );
  const App = window.App;
  const save = (patch: Any, text: string) => {
    const all = heroList(), x = all.find(y => y.id === id);
    if (!x) throw new Error('герой удалён');
    Object.assign(x, JSON.parse(JSON.stringify(patch)));
    x.log = (x.log || []).concat({ at: Date.now(), text });
    x.savedAt = Date.now();
    writeHeroes(all);
    return Promise.resolve();
  };
  const copy = () => {
    const all = heroList(), x = all.find(y => y.id === id);
    if (!x) return;
    const c = JSON.parse(JSON.stringify(x));
    c.id = newHeroId(); c.savedAt = Date.now();
    c.state.name = (c.state.name || 'Герой') + ' (копия)';
    all.push(c);
    if (writeHeroes(all)) { toast('Копия сохранена в «Мои герои»'); location.hash = '#heroes/' + c.id; }
  };
  const remove = () => {
    if (!confirm(`Удалить «${h.state?.name || 'Безымянный герой'}»? Это нельзя отменить.`)) return;
    writeHeroes(heroList().filter(x => x.id !== id));
    if (App.editingId === id) { App.editingId = null; App.save(); }
    toast('Герой удалён');
    location.hash = '#heroes';
  };
  return (
    <HeroScreen key={id} id={'h:' + id} rec={h} perms={{ gm: true, owner: true }} save={save}
      log={(h.log || []).slice().reverse()}
      crumb={<a className="crumb" href="#heroes"><span aria-hidden="true">←</span> Мои герои</a>}
      actions={<>
        <button type="button" className="btn small" onClick={() => openInWizard(h)}><Icon name="spark" />Лист создания в мастере</button>
        <button type="button" className="btn ghost small" onClick={copy}><Icon name="copy" />Копия</button>
        <button type="button" className="btn ghost small danger" onClick={remove}>Удалить</button>
      </>}
      notice={<p className="muted small">Здесь вы сами себе ГМ: опыт, общины и добычу вписываете сами{sync.on ? ', всё сохраняется в облаке' : ', всё хранится в этом браузере (войдите в аккаунт в «Моих героях» — перенесётся в облако)'}. Чтобы развитие вёл ГМ, добавьте героя в кампанию во вкладке «Игра».</p>} />
  );
}
