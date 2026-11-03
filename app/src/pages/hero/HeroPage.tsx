import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { act, cap, heroList, newHeroId, openInWizard, toast, useHeroes, useLegacyCss, useSync, writeHeroes, type Hero } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import { fmt, signed, type Any } from '../create/kit';
import DevTab from './DevTab';
import FxTab from './FxTab';
import { Sheet } from '../sheet/Sheet';
import { sheetOpts } from '../create/Summary';

/*
 * Страница сохранённого героя (#heroes/<id>): картинка, главное о герое, вкладки «Развитие · Снаряжение · Состояния ·
 * Лист · Журнал». «Развитие» и «Журнал» — новые; снаряжение (инвентарь, кукла, крафт, торговля), состояния и лист пока
 * рисует прежний сайт (js/inventory.js, js/sheet.js) — его кнопки работают через App.devCtx, как раньше.
 */
type Tab = 'dev' | 'gear' | 'fx' | 'sheet' | 'log';

export default function HeroPage({ id }: { id: string }) {
  const heroes = useHeroes();
  const h = heroes.find(x => x.id === id);
  return h ? <HeroView key={id} id={id} /> : (
    <div className="page">
      <a className="crumb" href="#heroes"><span aria-hidden="true">←</span> Мои герои</a>
      <div className="card empty"><Icon name="users" /><p>Герой не найден — возможно, удалён или ещё загружается из облака.</p></div>
    </div>
  );
}

function HeroView({ id }: { id: string }) {
  const heroes = useHeroes();
  const sync = useSync();
  const [tab, setTab] = useState<Tab>('dev');
  const [, setTick] = useState(0);
  const App = window.App, Dev = window.Dev;
  const h = heroes.find(x => x.id === id) as Hero;
  // запись — копия на каждую перерисовку: расчёт (Dev.compute) дописывает в неё недостающие поля
  const rec: Any = JSON.parse(JSON.stringify(h));
  const v = Dev.compute(rec);
  const res = v.res, race = res.race;

  useEffect(() => { Dev.own('h:' + id); }, [Dev, id]);
  // текущий герой для кнопок прежнего сайта (инвентарь, крафт, состояния) и для Dev.commit
  useLayoutEffect(() => {
    App.devCtx = {
      record: rec,
      perms: { gm: true, owner: true },
      save(patch: Any, text: string) {
        const all = heroList(), x = all.find(y => y.id === id);
        if (!x) throw new Error('герой удалён');
        Object.assign(x, JSON.parse(JSON.stringify(patch)));
        x.log = (x.log || []).concat({ at: Date.now(), text });
        x.savedAt = Date.now();
        writeHeroes(all);
        return Promise.resolve();
      },
      render: () => App.keepFocus(document.activeElement || document.body, () => flushSync(() => setTick(t => t + 1))),
    };
  });
  useEffect(() => () => { if (App.devCtx && App.devCtx.record && App.devCtx.record.id === id) App.devCtx = null; }, [App, id]);
  useLegacyCss(tab === 'gear');
  useEffect(() => { document.title = `${h.state?.name || 'Безымянный герой'} — Мастерская героя`; }, [h.state?.name]);

  const nfx = (rec.gm.effects || []).length;
  const log = (h.log || []).slice().reverse();
  const imgs = window.RACE_IMAGES || {};
  const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
  const custom = h.pic && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(h.pic) ? h.pic : '';
  const pic = custom || (base && imgs[base.id] ? imgs[base.id].src : '');
  const d = res.der;

  const setPic = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Нужна картинка: png, jpg или webp'); return; }
    try { await Dev.commit({ pic: await App.shrinkPic(file) }, 'Новая картинка персонажа'); } catch (e) { toast('Не получилось: ' + ((e as Error)?.message || e)); }
  };
  const dropPic = () => { if (confirm('Убрать свою картинку и вернуть портрет расы?')) Dev.commit({ pic: '' }, 'Картинка персонажа — снова портрет расы'); };
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

  let body;
  if (tab === 'dev') body = <DevTab key={id} rec={rec} v={v} />;
  else if (tab === 'log') body = <Journal log={log} />;
  else if (tab === 'fx') body = <FxTab rec={rec} v={v} gm />;
  else if (tab === 'sheet') body = <div className="wstack">
    <div className="cs-tools no-print">
      <button type="button" className="btn small" onClick={() => window.print()}>Печать / PDF</button>
      <button type="button" className="btn small" onClick={() => act('exportImage')}>Скачать картинку</button>
    </div>
    <Sheet st={v.state} res={v.res0} opts={sheetOpts(rec, v)} />
  </div>;
  else {
    const o = { record: rec, perms: { gm: true, owner: true } };
    const I = window.Inv;
    const html = !I ? '<div class="card empty">Раздел не загрузился.</div>' : I.gearTab(o, v);
    body = <LegacyPane html={html} />;
  }

  return (
    <div className="page hp">
      <a className="crumb" href="#heroes"><span aria-hidden="true">←</span> Мои герои</a>
      <header className="hp-head">
        <div className={'hp-pic' + (custom ? ' custom' : '')}>
          {pic ? <img src={pic} alt="" /> : <Icon name="user" />}
          <label className="hp-pic-btn" title={custom ? 'Сменить картинку' : 'Своя картинка героя'}>
            <Icon name="camera" /><span>{custom ? 'Сменить' : 'Своя картинка'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; setPic(f); }} />
          </label>
        </div>
        <div className="hp-title">
          <h1>{h.state?.name || 'Безымянный герой'}</h1>
          <p className="muted">{race ? cap(race.isHalf && race.parents && race.parents[0] && race.parents[1] ? `полукровка (${race.parents[0].name} и ${race.parents[1].name})` : race.name) : 'раса не выбрана'} · ур. {fmt(res.level)}{v.lv.levels ? ` (при создании ${fmt(v.res0.level)})` : ''}{res.age ? ` · ${res.age.title.toLowerCase()}` : ''}</p>
          {race && <dl className="hp-vitals">
            <div><dt>ХП</dt><dd>{fmt(d.hp)}</dd></div>
            <div><dt>МП</dt><dd>{fmt(d.mp)}</dd></div>
            <div><dt>ОД</dt><dd>{window.Rules.odText(d)}</dd></div>
            <div><dt>Броня</dt><dd>{fmt(d.armor || 0)}</dd></div>
            <div><dt>Уворот</dt><dd>{fmt(d.dodge)}</dd></div>
            <div><dt>Карма</dt><dd>{signed(d.karma)}</dd></div>
          </dl>}
          <div className="row">
            <button type="button" className="btn small" onClick={() => openInWizard(h)}><Icon name="spark" />Лист создания в мастере</button>
            <button type="button" className="btn ghost small" onClick={copy}><Icon name="copy" />Копия</button>
            {custom && <button type="button" className="btn ghost small" onClick={dropPic}>Вернуть портрет расы</button>}
            <button type="button" className="btn ghost small danger" onClick={remove}>Удалить</button>
          </div>
        </div>
      </header>
      <p className="muted small">Здесь вы сами себе ГМ: опыт, общины и добычу вписываете сами{sync.on ? ', всё сохраняется в облаке' : ', всё хранится в этом браузере (войдите в аккаунт в «Моих героях» — перенесётся в облако)'}. Чтобы развитие вёл ГМ, добавьте героя в кампанию во вкладке «Игра».</p>

      <div className="hp-tabs" role="tablist" aria-label="Разделы героя">
        {([['dev', 'Развитие', 0], ['gear', 'Снаряжение', 0], ['fx', 'Состояния', nfx], ['sheet', 'Лист', 0], ['log', 'Журнал', log.length]] as [Tab, string, number][]).map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{t}{n ? <small> {n}</small> : null}</button>
        ))}
      </div>
      <div className="hp-body">{body}</div>
    </div>
  );
}

/** разметка прежнего сайта; обновляется, только когда изменилась (иначе терялся бы фокус в его полях) */
function LegacyPane({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useLayoutEffect(() => {
    if (ref.current && html !== last.current) { ref.current.innerHTML = html; last.current = html; }
  });
  return <div ref={ref} className="legacy-pane" />;
}

function Journal({ log }: { log: Any[] }) {
  if (!log.length) return <div className="card empty"><Icon name="book" /><p>Записей пока нет. Здесь появится всё, что меняется у героя: опыт, очки, вещи, состояния.</p></div>;
  return (
    <ol className="hp-log card">
      {log.map((e, i) => (
        <li key={i}>
          <span className="muted small">{e.at ? new Date(e.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : ''}{e.session ? ` · сессия ${e.session}` : ''}{e.byName ? ` · ${e.byName}` : ''}</span>
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
