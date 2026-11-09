import { HeroScreen } from '../hero/HeroScreen';
import { Icon } from '../../ui/Icon';
import { charView, run, setTarget, STATUS, useWatch, type Any } from './cloud';
import { Dice } from './Dice';
import { PrivateNotes } from './Campaign';

/*
 * Персонаж кампании (#game/<кампания>/<персонаж>): тот же экран героя, что в «Моих героях», но с правами ГМ / игрока,
 * записью в облако (C.updateCharacter — с журналом кампании), утверждением листа, броском за персонажа и заметками ГМ.
 */
export function CharPage({ cid, chid }: { cid: string; chid: string }) {
  const C = window.Cloud, App = window.App, Dev = window.Dev;
  const camp = useWatch(cid, (ok, bad) => C.watchCampaign(cid, ok, bad));
  const ch = useWatch(cid + '/' + chid, (ok, bad) => C.watchCharacter(cid, chid, ok, bad));
  const chars = useWatch<Any[]>(cid, (ok, bad) => C.watchCharacters(cid, ok, bad));   // кому передать вещь и что передают
  const events = useWatch<Any[]>(cid + '/' + chid, (ok, bad) => C.watchEvents(cid, ok, bad, { chid }));
  const gm = !!camp.data && camp.data.gm === C.uid();
  const priv = useWatch(gm ? cid + '|' + chid : null, ok => C.watchPrivate(cid, chid, ok, () => { /* заметки не обязательны */ }));
  const back = (name?: string) => <a className="crumb" href={`#game/${encodeURIComponent(cid)}`}><span aria-hidden="true">←</span> {name || 'Кампания'}</a>;

  if ((camp.err && !camp.data) || (ch.err && !ch.data)) return (
    <div className="page">{back()}<div className="card wstack"><h2>Персонаж недоступен</h2><p>{camp.err || ch.err}</p><p className="muted small">Кампанию могли удалить или вас исключили.</p></div></div>
  );
  if (!camp.data || ch.data === undefined) return <div className="page"><div className="card empty"><Icon name="user" /><p>Загружаю персонажа…</p></div></div>;
  if (!ch.data) return <div className="page">{back(camp.data.name)}<div className="card empty"><p>Персонаж удалён.</p></div></div>;

  const c = camp.data, x = ch.data, owner = x.owner === C.uid(), st = x.status;
  const v = charView(x);
  const tw = window.Battle ? window.Battle.heroExtra(x, chars.data || []) : { twinUp: false, twinName: '' };
  const save = (patch: Any, text: string) => {
    const p = JSON.parse(JSON.stringify(patch));
    const lvl = Dev.compute(Object.assign(JSON.parse(JSON.stringify(x)), p)).res.level;
    ch.set(cur => ({ ...cur, ...p }));   // сразу показать, не дожидаясь сервера
    return C.updateCharacter(cid, chid, { ...p, level: lvl }, text, x.name);
  };
  const status = (to: string) => {
    const texts: Record<string, string> = {
      review: 'отправляет лист ГМ на проверку', draft: 'забирает лист на доработку',
      active: st === 'review' || st === 'draft' ? 'ГМ утверждает персонажа — он в игре' : 'ГМ возвращает персонажа в игру',
      dead: 'ГМ отмечает: персонаж погиб', retired: 'ГМ отправляет персонажа на покой',
    };
    if (to === 'active' && (st === 'review' || st === 'draft') && v.res0.errors.length && !confirm(`В листе ${v.res0.errors.length} ошибок. Всё равно утвердить?`)) return;
    if (to === 'dead' && !confirm(`«${x.name}» погиб?`)) return;
    const who = gm ? '' : C.name() + ' ';
    run(() => C.updateCharacter(cid, chid, { status: to }, (to === 'review' || to === 'draft') ? who + texts[to] : texts[to], x.name), STATUS[to] ? 'Статус: ' + STATUS[to] : '');
  };
  const giveBack = () => {
    const why = prompt('Что поправить? Игрок увидит это в журнале.', '');
    if (why === null) return;
    run(() => C.updateCharacter(cid, chid, { status: 'draft' }, `ГМ возвращает лист на доработку${why.trim() ? ': ' + why.trim() : ''}`, x.name), 'Возвращено игроку');
  };
  // лист создания — в мастер; развитие едет вместе с ним (в мастере лист показывается с ним, меняется только лист создания)
  const toWizard = () => {
    const t = window.Game ? window.Game.target() : null;
    if (App.state && App.state.raceId && !(t && t.chid === x.id) && !confirm(`Черновик в мастере будет заменён листом «${x.name}». Продолжить?`)) return;
    App.state = App.migrate(JSON.parse(JSON.stringify(x.state)));
    App.editingId = null; App.save(); App.recompute();
    setTarget({ cid, chid: x.id, cname: c.name, status: st,
      rec: JSON.parse(JSON.stringify({ prog: x.prog, gm: x.gm, equip: x.equip, spells: x.spells, vit: x.vit, purse: x.purse, notes: x.notes, give: x.give, got: x.got, made: x.made })) });
    location.hash = '#create/summary';
  };
  const copyLocal = () => {
    const l = App.store.get('hero-workshop:heroes', []) || [];
    const copy = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: Date.now(), state: JSON.parse(JSON.stringify(x.state)), prog: x.prog, gm: x.gm, notes: x.notes || '', pic: x.pic || '',
      log: [{ at: Date.now(), text: `Копия из кампании «${c.name}»` }].concat((events.data || []).map(e => ({ at: e.ms, text: e.text, byName: e.byName, session: e.session }))) };
    l.push(JSON.parse(JSON.stringify(copy)));
    App.toast(App.store.set('hero-workshop:heroes', l) ? 'Копия сохранена в «Мои герои»' : 'Не удалось сохранить в браузере');
    window.dispatchEvent(new Event('mh-heroes'));
  };
  const remove = () => {
    if (!confirm(`Удалить «${x.name}» из кампании? Это нельзя отменить.`)) return;
    run(async () => { await C.deleteCharacter(cid, chid, x.name); location.hash = '#game/' + cid; }, 'Персонаж удалён');
  };

  const draftish = st === 'draft' || st === 'review';
  const errs: Any[] = v.res0.errors;
  const actions = <>
    {(owner || gm) && draftish && <button type="button" className="btn small" onClick={toWizard}><Icon name="spark" />Править лист в мастере</button>}
    {owner && st === 'draft' && <button type="button" className="btn small primary" onClick={() => status('review')}>Отправить ГМ на проверку</button>}
    {owner && !gm && st === 'review' && <button type="button" className="btn ghost small" onClick={() => status('draft')}>Забрать на доработку</button>}
    {gm && draftish && <><button type="button" className="btn small primary" onClick={() => status('active')}>Утвердить — в игру</button><button type="button" className="btn ghost small" onClick={giveBack}>Вернуть на доработку</button></>}
    {gm && st === 'active' && <><button type="button" className="btn ghost small" onClick={toWizard}>Изменить лист создания</button><button type="button" className="btn ghost small" onClick={() => status('dead')}>Погиб</button><button type="button" className="btn ghost small" onClick={() => status('retired')}>На покой</button></>}
    {gm && (st === 'dead' || st === 'retired') && <button type="button" className="btn small" onClick={() => status('active')}>Вернуть в игру</button>}
    <button type="button" className="btn ghost small" onClick={copyLocal}><Icon name="copy" />Копия в «Мои герои»</button>
    {(gm || (owner && draftish)) && <button type="button" className="btn ghost small danger" onClick={remove}>Удалить</button>}
  </>;
  const notice = <>
    {(camp.err || ch.err) && <p className="issue err">{camp.err || ch.err}</p>}
    {st === 'review' && <p className="note small">{gm ? 'Игрок отправил лист на проверку. Проверьте вкладку «Лист» и утвердите или верните на доработку.' : 'Лист у ГМ на проверке. Пока он не утверждён, его ещё можно поправить.'}</p>}
    {st === 'draft' && <p className="note small">Черновик. {owner ? 'Когда лист готов — отправьте его ГМ.' : 'Игрок ещё собирает персонажа.'}</p>}
    {gm && draftish && <div className={'cs-checks ' + (errs.length ? 'bad' : 'good')}>
      <h2><Icon name={errs.length ? 'alert' : 'check'} />{errs.length ? `Лист не проходит проверку: ${errs.length}` : 'Лист собран по правилам'}</h2>
      {errs.length > 0 && <ul>{errs.map((e, i) => <li key={i} className="err">{e.msg}</li>)}</ul>}
      {v.res0.notes.length > 0 && <><h3>Для ГМ</h3><ul>{v.res0.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></>}
    </div>}
    <Twin cid={cid} x={x} race={v.res.race} gm={gm} list={chars.data || []} />
    {(gm || owner) && st === 'active' && <Dice cid={cid} chid={chid} chName={x.name || 'Безымянный герой'} twin={tw.twinUp ? tw.twinName : ''} />}
  </>;

  return (
    <HeroScreen key={chid} id={'c:' + chid} rec={x} perms={{ gm, owner }} save={save} chid={chid}
      party={chars.data ? chars.data.filter(y => y.id !== chid) : null}
      log={(events.data || []).map(e => ({ at: e.ms, text: e.text, byName: e.byName, session: e.session }))}
      crumb={back(c.name)}
      sub={<> · игрок: {x.ownerName || '—'}{owner ? ' (вы)' : ''} · <span className={'chip st-' + st}>{STATUS[st] || st}</span></>}
      actions={actions} notice={notice}
      devLocked={draftish ? 'Развитие начнётся, когда ГМ утвердит персонажа: тогда появятся опыт, уровни, фракции, предметы и заметки.' : ''}
      privateBox={gm ? <PrivateNotes key={String(!!priv.data)} title="Заметки ГМ о персонаже" text={(priv.data || {}).text || ''} placeholder="тайны персонажа, планы на него"
        save={text => run(() => C.savePrivate(cid, chid, text), 'Заметки сохранены')} /> : null} />
  );
}

// Хенра (раса): брат-близнец — отдельный персонаж со своим листом (уточнение ГМ). ГМ связывает двоих — у обоих gm.twin.
// Связь даёт: двойной бросок, пока брат жив; 75% резиста к пси, когда брат погиб; «узы боли» на поле боя (25% урона — брату)
function Twin({ cid, x, race, gm, list }: { cid: string; x: Any; race: Any; gm: boolean; list: Any[] }) {
  const C = window.Cloud;
  const henra = !!race && (race.id === 'хенра' || (race.parents || []).some((p: Any) => p && p.id === 'хенра'));
  const cur = (x.gm || {}).twin || '', tw = list.find(y => y.id === cur);
  if (!henra && !tw) return null;
  const others = list.filter(y => y.id !== x.id);
  const link = (id: string) => run(async () => {
    const ops: [string, Any][] = [];
    if (cur && cur !== id) ops.push([cur, { 'gm.twin': '' }]);
    const other = list.find(y => y.id === id);
    if (other && (other.gm || {}).twin && other.gm.twin !== x.id) ops.push([other.gm.twin, { 'gm.twin': '' }]);
    ops.push([x.id, { 'gm.twin': id }]);
    if (id) ops.push([id, { 'gm.twin': x.id }]);
    for (const [chid, p] of ops) await C.updateCharacter(cid, chid, p);
  }, id ? 'Близнецы связаны' : 'Связь снята');
  return <div className="card wstack tight">
    <h2 className="h-sec">Брат-близнец</h2>
    {tw ? <p><a href={`#game/${encodeURIComponent(cid)}/${encodeURIComponent(tw.id)}`}><b>{tw.name || 'Безымянный герой'}</b></a>{tw.status === 'dead' ? ' — погиб: 75% резиста к пси' : ' — жив: бросок d100 двойной (берётся лучший)'}; узы боли — 25% урона по ХП одного уходит другому.</p>
      : <p className="muted small">Хенра: у вас есть второй подконтрольный персонаж — брат со своим листом. Создайте его отдельным героем, а ГМ свяжет их здесь.</p>}
    {gm && <label className="small">Связать с <select className="sel" value={tw ? tw.id : ''} onChange={e => link(e.target.value)} aria-label="Брат-близнец">
      <option value="">— нет —</option>{others.map(y => <option key={y.id} value={y.id}>{y.name || 'Безымянный герой'}{y.ownerName ? ` (${y.ownerName})` : ''}</option>)}</select></label>}
  </div>;
}
