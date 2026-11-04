import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { act, cap, toast } from '../../lib/legacy';
import { Icon } from '../../ui/Icon';
import { fmt, signed, type Any } from '../create/kit';
import DevTab from './DevTab';
import FxTab from './FxTab';
import GearTab from './GearTab';
import { Sheet } from '../sheet/Sheet';
import { sheetOpts } from '../create/Summary';

/*
 * Экран героя: картинка, главное, вкладки «Развитие · Снаряжение · Состояния · Лист · Журнал». Общий для «Моих героев»
 * (#heroes/<id>) и персонажа в кампании (#game/<кампания>/<персонаж>): разница — в правах, в том, куда сохранять, и в
 * кнопках над вкладками. Кнопки прежнего сайта (инвентарь, Dev.commit) работают через App.devCtx — его задаёт этот экран.
 */
type Tab = 'dev' | 'gear' | 'fx' | 'sheet' | 'log';
export type Perms = { gm?: boolean; owner?: boolean };

export function HeroScreen(o: {
  id: string;                       // для «своих» черновиков: Dev.own (развитие, инвентарь)
  rec: Any;                         // запись героя (state, prog, gm, equip, pic…)
  perms: Perms;
  save: (patch: Any, text: string) => Promise<unknown>;
  log: Any[];                       // журнал: { at, text, byName, session }, новые сверху
  crumb: ReactNode;
  sub?: ReactNode;                  // дополнение к строке «раса · уровень» (игрок, статус)
  actions?: ReactNode;              // кнопки под именем
  notice?: ReactNode;               // плашка над вкладками
  devLocked?: string;               // развития ещё нет (персонаж не утверждён)
  party?: Any[] | null;             // другие персонажи кампании — кому передать вещи
  chid?: string;
  privateBox?: ReactNode;           // заметки ГМ о персонаже
}) {
  const [tab, setTab] = useState<Tab>('dev');
  const [, setTick] = useState(0);
  const App = window.App, Dev = window.Dev;
  // запись — копия на каждую перерисовку: расчёт (Dev.compute) дописывает в неё недостающие поля
  const rec: Any = JSON.parse(JSON.stringify(o.rec));
  const v = Dev.compute(rec);
  const res = v.res, race = res.race, d = res.der;
  const canEdit = !!(o.perms.gm || o.perms.owner);

  useEffect(() => { Dev.own(o.id); }, [Dev, o.id]);
  // текущий герой для кнопок прежнего сайта и для Dev.commit
  useLayoutEffect(() => {
    App.devCtx = {
      record: rec, perms: o.perms, chid: o.chid, party: o.party || null, save: o.save,
      render: () => App.keepFocus(document.activeElement || document.body, () => flushSync(() => setTick(t => t + 1))),
    };
  });
  useEffect(() => () => { if (App.devCtx && App.devCtx.record && App.devCtx.record.id === o.rec.id) App.devCtx = null; }, [App, o.rec.id]);
  useEffect(() => { document.title = `${o.rec.state?.name || 'Безымянный герой'} — Мастерская героя`; }, [o.rec.state?.name]);

  const nfx = (rec.gm.effects || []).length;
  const imgs = window.RACE_IMAGES || {};
  const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
  const custom = rec.pic && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(rec.pic) ? rec.pic : '';
  const pic = custom || (base && imgs[base.id] ? imgs[base.id].src : '');
  const setPic = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Нужна картинка: png, jpg или webp'); return; }
    try { await Dev.commit({ pic: await App.shrinkPic(file) }, 'Новая картинка персонажа'); } catch (e) { toast('Не получилось: ' + ((e as Error)?.message || e)); }
  };
  const dropPic = () => { if (confirm('Убрать свою картинку и вернуть портрет расы?')) Dev.commit({ pic: '' }, 'Картинка персонажа — снова портрет расы'); };

  const locked = (t: Tab) => o.devLocked && (t === 'dev' || t === 'gear' || t === 'fx');
  let body;
  if (locked(tab)) body = <div className="card note small">{o.devLocked}</div>;
  else if (tab === 'dev') body = <DevTab key={o.id} rec={rec} v={v} perms={o.perms} />;
  else if (tab === 'log') body = <Journal log={o.log} />;
  else if (tab === 'fx') body = <FxTab rec={rec} v={v} gm={!!o.perms.gm} />;
  else if (tab === 'sheet') body = <div className="wstack">
    <div className="cs-tools no-print">
      <button type="button" className="btn small" onClick={() => window.print()}>Печать / PDF</button>
      <button type="button" className="btn small" onClick={() => act('exportImage')}>Скачать картинку</button>
    </div>
    <Sheet st={v.state} res={v.res0} opts={sheetOpts(rec, v)} />
  </div>;
  else body = <GearTab rec={rec} v={v} perms={o.perms} />;

  return (
    <div className="page hp">
      {o.crumb}
      <header className="hp-head">
        <div className={'hp-pic' + (custom ? ' custom' : '')}>
          {pic ? <img src={pic} alt="" /> : <Icon name="user" />}
          {canEdit && <label className="hp-pic-btn" title={custom ? 'Сменить картинку' : 'Своя картинка героя'}>
            <Icon name="camera" /><span>{custom ? 'Сменить' : 'Своя картинка'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; setPic(f); }} />
          </label>}
        </div>
        <div className="hp-title">
          <h1>{rec.state?.name || 'Безымянный герой'}</h1>
          <p className="muted">{race ? cap(race.isHalf && race.parents && race.parents[0] && race.parents[1] ? `полукровка (${race.parents[0].name} и ${race.parents[1].name})` : race.name) : 'раса не выбрана'} · ур. {fmt(res.level)}{v.lv.levels ? ` (при создании ${fmt(v.res0.level)})` : ''}{res.age ? ` · ${res.age.title.toLowerCase()}` : ''}{o.sub}</p>
          {race && <dl className="hp-vitals">
            <div><dt>ХП</dt><dd>{fmt(d.hp)}</dd></div>
            <div><dt>МП</dt><dd>{fmt(d.mp)}</dd></div>
            <div><dt>ОД</dt><dd>{window.Rules.odText(d)}</dd></div>
            <div><dt>Броня</dt><dd>{fmt(d.armor || 0)}</dd></div>
            <div><dt>Уворот</dt><dd>{fmt(d.dodge)}</dd></div>
            <div><dt>Карма</dt><dd>{signed(d.karma)}</dd></div>
          </dl>}
          <div className="row">
            {o.actions}
            {custom && canEdit && <button type="button" className="btn ghost small" onClick={dropPic}>Вернуть портрет расы</button>}
          </div>
        </div>
      </header>
      {o.notice}

      <div className="hp-tabs" role="tablist" aria-label="Разделы героя">
        {([['dev', 'Развитие', 0], ['gear', 'Снаряжение', 0], ['fx', 'Состояния', nfx], ['sheet', 'Лист', 0], ['log', 'Журнал', o.log.length]] as [Tab, string, number][]).map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{t}{n ? <small> {n}</small> : null}</button>
        ))}
      </div>
      <div className="hp-body">{body}</div>
      {tab === 'dev' && o.privateBox}
    </div>
  );
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
