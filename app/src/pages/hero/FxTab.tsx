import { useState } from 'react';
import { Field, fmt, norm, R, Sel, signed, type Any } from '../create/kit';
import { Icon } from '../../ui/Icon';

/*
 * «Состояния» героя: проклятия, болезни, дары, благословения, статусы от ГМ — с прибавками и множителями к характеристикам
 * и параметрам (они уже учтены в расчёте: js/progress.js → Dev.compute). Источники, разбор описаний и названия —
 * js/craft.js (Craft.effectSources, parseStatMods, parseParamMods, PARAMS, EFFECT_KINDS). Запись — rec.gm.effects.
 */
type Mod = { stat: string; op: 'add' | 'mul'; v: number };
type Draft = { kind: string; name: string; text: string; note: string; mods: Record<string, { add?: string; mul?: string }>; editId?: string };
const blank = (kind = 'curse'): Draft => ({ kind, name: '', text: '', note: '', mods: {} });
const num = (x: unknown) => { const v = parseFloat(String(x ?? '').replace(',', '.').replace('−', '-')); return Number.isFinite(v) ? v : 0; };
const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function FxTab({ rec, v, gm }: { rec: Any; v: Any; gm: boolean }) {
  const K = window.Craft, Rr = R();
  const [d, setD] = useState<Draft>(blank());
  const list: Any[] = (rec.gm && rec.gm.effects) || [];
  const unlocked = !!(window.GMLock && window.GMLock.unlocked);
  const PARAMS: Any[] = K.PARAMS;
  const keys = Rr.STATS.concat(PARAMS.map(p => p.k));
  const label = (k: string) => Rr.STAT_SHORT[k] || (PARAMS.find(p => p.k === k) || {}).t || k;
  // у старых записей прибавки к параметрам не заданы ГМ — берутся из описания
  const allMods = (e: Any): Mod[] => (e.pm ? (e.mods || []) : (e.mods || []).concat(K.parseParamMods(e.text).filter((m: Mod) => !(e.mods || []).some((x: Mod) => x.stat === m.stat))));
  const modsText = (mods: Mod[]) => mods.map(m => `${label(m.stat)} ${m.op === 'mul' ? '×' + fmt(m.v) : signed(m.v)}`).join(', ');
  const parseAll = (text: string): Mod[] => K.parseStatMods(text).concat(K.parseParamMods(text));
  const toDraft = (mods: Mod[]) => {
    const o: Draft['mods'] = {};
    mods.forEach(m => { o[m.stat] = o[m.stat] || {}; if (m.op === 'mul') o[m.stat].mul = String(m.v); else o[m.stat].add = String(num(o[m.stat].add) + m.v); });
    return o;
  };
  const fromDraft = (dr: Draft): Mod[] => {
    const out: Mod[] = [];
    keys.forEach((k: string) => {
      const m = dr.mods[k] || {};
      if (num(m.add)) out.push({ stat: k, op: 'add', v: Math.round(num(m.add)) });
      if (num(m.mul) && num(m.mul) !== 1) out.push({ stat: k, op: 'mul', v: num(m.mul) });
    });
    return out;
  };
  const sources: Any[] = K.effectSources(unlocked).filter((x: Any) => x.kind === d.kind);
  const kinds = Object.entries(K.EFFECT_KINDS as Record<string, string>).filter(([k]) => k !== 'status' || unlocked);
  const hasMods = (dr: Draft) => Object.values(dr.mods).some(m => num(m.add) || num(m.mul));

  const commit = (effects: Any[], text: string) => {
    const g = window.Dev.gmCopy();
    g.effects = effects;
    window.Dev.commit({ gm: g }, text);
  };
  const pickName = (name: string) => {
    const hit = sources.find(x => norm(x.name) === norm(name));
    setD(dr => hit ? { ...dr, name, text: hit.text, mods: toDraft(parseAll(hit.text)) } : { ...dr, name });
  };
  const setText = (text: string) => setD(dr => ({ ...dr, text, mods: hasMods(dr) ? dr.mods : toDraft(parseAll(text)) }));
  const setMod = (k: string, f: 'add' | 'mul', val: string) => setD(dr => ({ ...dr, mods: { ...dr.mods, [k]: { ...dr.mods[k], [f]: val } } }));
  const save = () => {
    const name = d.name.trim();
    if (!name) { window.App.toast('Впишите название эффекта'); return; }
    // pm: прибавки к параметрам задал ГМ в форме — описание больше не разбирается
    const e = { id: d.editId || newId(), kind: d.kind, name, text: d.text, note: d.note, mods: fromDraft(d), pm: true, at: Date.now() };
    const m = modsText(e.mods);
    const cur = list.slice();
    if (d.editId) { const ix = cur.findIndex(x => x.id === d.editId); if (ix < 0) return; e.at = cur[ix].at; cur[ix] = e; } else cur.push(e);
    commit(cur, `${d.editId ? 'Изменено' : 'Наложено'}: ${(K.EFFECT_KINDS[e.kind] || '').toLowerCase()} «${e.name}»${m ? ` (${m})` : ''}`);
    setD(blank(d.kind));
  };
  const edit = (e: Any) => { setD({ kind: e.kind, name: e.name, text: e.text || '', note: e.note || '', mods: toDraft(allMods(e)), editId: e.id }); document.getElementById('fxForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const remove = (e: Any) => { if (confirm(`Снять «${e.name}»?`)) commit(list.filter(x => x.id !== e.id), `Снято: ${(K.EFFECT_KINDS[e.kind] || '').toLowerCase()} «${e.name}»`); };

  const start: string[] = [];
  const b = v.res0.boon, tr = v.res0.traits || {};
  if (b) start.push(`${({ gift: 'тёмный дар', buff: 'благословение', disease: 'болезнь' } as Record<string, string>)[b.kind]} «${b.src.name}»`);
  if ((tr.pos || []).length || (tr.neg || []).length) start.push(`черты: ${[...(tr.pos || []), ...(tr.neg || [])].join(', ')}`);
  const modRows = (ks: { k: string; t: string }[]) => ks.map(({ k, t }) => (
    <tr key={k}><th>{t}</th>
      <td><input type="text" inputMode="decimal" value={d.mods[k]?.add || ''} onChange={e => setMod(k, 'add', e.target.value)} placeholder="±0" aria-label={`${t}: прибавка`} /></td>
      <td><input type="text" inputMode="decimal" value={d.mods[k]?.mul || ''} onChange={e => setMod(k, 'mul', e.target.value)} placeholder="×1" aria-label={`${t}: множитель`} /></td></tr>
  ));

  return (
    <div className="hp-cols fx">
      <section className="card wstack">
        <h2>Состояния и эффекты</h2>
        {list.length ? (
          <ul className="fx-list2">
            {list.map(e => {
              const st = allMods(e).filter(m => Rr.STATS.includes(m.stat)), pr = allMods(e).filter(m => !Rr.STATS.includes(m.stat));
              return (
                <li key={e.id} className={'fx-' + e.kind}>
                  <div className="fx-top"><b>{e.name}</b><span className="chip">{K.EFFECT_KINDS[e.kind] || e.kind}</span></div>
                  {e.text && <p className="small">{e.text}</p>}
                  {st.length > 0 && <p className="small"><b>К характеристикам:</b> {modsText(st)} <span className="muted">— учтено</span></p>}
                  {pr.length > 0 && <p className="small"><b>К параметрам:</b> {modsText(pr)} <span className="muted">— учтено на листе</span></p>}
                  {e.note && <p className="small muted">{e.note}</p>}
                  {gm && <div className="row"><button type="button" className="link small" onClick={() => edit(e)}>изменить</button><button type="button" className="link small fx-del" onClick={() => remove(e)}>снять</button></div>}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted"><Icon name="check" /> Сейчас на герое нет проклятий, болезней и других эффектов от ГМ.</p>}
        {start.length > 0 && <p className="small muted">С создания: {start.join('; ')} — это часть листа создания.</p>}
      </section>

      {gm && (
        <section className="card wstack" id="fxForm">
          <h2>{d.editId ? 'Изменить эффект' : 'Наложить эффект'}</h2>
          <div className="fgrid">
            <Field label="Что"><Sel value={d.kind} onChange={k => setD(dr => ({ ...blank(k), editId: dr.editId }))} options={kinds.map(([k, t]) => ({ v: k, t }))} /></Field>
            <Field label="Название">
              <input type="text" list="fxList" value={d.name} onChange={e => pickName(e.target.value)} placeholder={sources.length ? 'из таблиц или своё' : 'название'} />
            </Field>
          </div>
          <datalist id="fxList">{sources.map(x => <option key={x.name} value={x.name} />)}</datalist>
          <Field label="Описание"><textarea rows={2} value={d.text} onChange={e => setText(e.target.value)} /></Field>
          <p className="small"><b>Влияние на характеристики</b> <span className="muted">— подставляется из описания, можно поправить</span></p>
          <table className="fx-mods2"><thead><tr><th /><th>прибавка</th><th>множитель</th></tr></thead>
            <tbody>{modRows(Rr.STATS.map((k: string) => ({ k, t: Rr.STAT_NAMES[k] })))}</tbody></table>
          <details className="more" open={PARAMS.some(p => d.mods[p.k] && (num(d.mods[p.k].add) || num(d.mods[p.k].mul)))}>
            <summary>Влияние на параметры и таланты <span className="muted small">— привлекательность, ХП, реген, ОД, уворот…</span></summary>
            <table className="fx-mods2"><thead><tr><th /><th>прибавка</th><th>множитель</th></tr></thead>
              <tbody>{modRows(PARAMS.map(p => ({ k: p.k, t: p.t })))}</tbody></table>
          </details>
          <Field label="Срок и заметка"><input type="text" value={d.note} onChange={e => setD(dr => ({ ...dr, note: e.target.value }))} placeholder="например: до исцеления, 3 дня, стак 2 из 3" /></Field>
          <div className="row">
            <button type="button" className="btn primary" onClick={save}>{d.editId ? 'Сохранить' : 'Наложить'}</button>
            {d.editId && <button type="button" className="btn ghost" onClick={() => setD(blank(d.kind))}>Отмена</button>}
          </div>
          <p className="muted small">«Если один и тот же тёмный дар будет получен 3 раза, он превратится в проклятие; любой тёмный дар может быть сразу наложен в виде проклятия».</p>
        </section>
      )}
    </div>
  );
}
