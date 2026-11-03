import { useState } from 'react';
import { cap, D, Field, fmt, norm, R, Sel, signed, Stepper, type Any, type Opt } from '../create/kit';

/*
 * «Развитие» сохранённого героя: уровень и опыт, карма, очки за новые уровни, общины, изученное, заметки.
 * Правила и запись — js/progress.js (Dev.compute, Dev.commit); здесь только интерфейс. У своего героя игрок сам себе ГМ.
 */
type Draft = { alloc: Record<string, number>; talents: Record<string, number>; passives: Record<string, number> };
const zero = () => ({ t: 0, d: 0, s: 0, i: 0, l: 0 });
const newDraft = (): Draft => ({ alloc: zero(), talents: {}, passives: {} });
const sum = (o: Record<string, number>) => Object.values(o || {}).reduce((a, x) => a + (+x || 0), 0);
const C = () => (window as Any).GM_CONFIG;

const LEARN_KINDS: Record<string, { t: string; list: () => string[] }> = {
  skill: { t: 'Физический навык', list: () => (D().skills.actives || D().skills.startActives || []).map((x: Any) => x.name) },
  stance: { t: 'Стойка', list: () => (D().skills.stances || D().skills.startStances || []).map((x: Any) => x.name) },
  symbol: { t: 'Магический символ', list: () => D().skills.symbols.map((x: Any) => x.name) },
  passive: { t: 'Пассивный навык', list: () => (D().skills.passives || []).filter((x: Any) => !x.base).map((x: Any) => x.name) },
  other: { t: 'Другое', list: () => [] },
};
const passiveInfo = (name: string) => (D().skills.passives || []).find((p: Any) => !p.base && norm(p.name) === norm(name)) || null;
const joinable = (): Any[] => ((D().society && D().society.groups) || []).filter((g: Any) => !['болезнь', 'проклятие', 'событие'].includes(g.type) && g.join !== 'нельзя вступить');

// эффект навыка на нынешнем уровне; «добавляет шанс …» без числа — процент за уровень, как при крафте
function chanceNow(eff: string, lvl: number) {
  const segs = String(eff || '').split('/').map(x => x.trim()).filter(x => /шанс/i.test(x) && !/%/.test(x));
  return segs.length ? `${fmt(Math.min(100, lvl * ((C().MAKE || {}).CHANCE_PER_LVL || 1)))}% — ${segs.join('; ')}` : '';
}

export default function DevTab({ rec, v }: { rec: Any; v: Any }) {
  const Dev = window.Dev, Rr = R();
  const { res, res0, lv } = v;
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [f, setF] = useState({ xp: '', creature: '', karma: '', why: '', group: '', learnKind: 'skill', learnName: '' });
  const [notes, setNotes] = useState<string | null>(null);
  const commit = (patch: Any, text: string) => Dev.commit(patch, text);
  const gm = () => JSON.parse(JSON.stringify(rec.gm));
  const p = res.prog || { statPoints: 0, statSpent: 0, talentPoints: 0, talentSpent: 0 };
  const d = res.der;
  const pct = Math.min(100, Math.round(100 * lv.xpInto / lv.need));
  const creatures: Any[] = Dev.creatures();
  const pas: Any[] = Dev.learnedPassives(rec);
  const statLeft = p.statPoints - p.statSpent - sum(draft.alloc);
  const talLeft = (p.talentPoints || 0) - (p.talentSpent || 0) - sum(draft.talents) - sum(draft.passives);
  const errs = res.errors.filter((e: Any) => e.step === 'progress'), warns = res.warnings.filter((e: Any) => e.step === 'progress');

  const addXp = (n: number, text: string) => {
    const g = gm(); g.xp = (g.xp || 0) + n;
    const after = Dev.levelsFromXp(res0.level, g.xp).level;
    commit({ gm: g }, text + (after > res.level ? `, новый уровень: ${after}` : ''));
  };
  const xpGive = () => {
    const n = Math.floor(+f.xp || 0);
    if (n <= 0) { window.App.toast('Укажите, сколько опыта начислить'); return; }
    setF({ ...f, xp: '' }); addXp(n, `Начислено ${n} опыта`);
  };
  const xpCreature = () => {
    const c = creatures.find(x => norm(x.n) === norm(f.creature.trim()));
    if (!c) { window.App.toast('Существо не найдено — выберите из подсказок'); return; }
    const n = Dev.xpFor(Rr.roundLevel(c.lvl), res);
    setF({ ...f, creature: '' }); addXp(n, `Победа над «${c.n}» (ур. ${Rr.roundLevel(c.lvl)}): +${n} опыта`);
  };
  const karma = () => {
    const n = Math.round(parseFloat(f.karma.replace(',', '.').replace('−', '-')) || 0);
    if (!n) { window.App.toast('Укажите, на сколько изменить карму'); return; }
    const total = Math.max(-C().KARMA_LIMIT, Math.min(C().KARMA_LIMIT, d.karma + n));
    if (total === d.karma) { window.App.toast(`Карма уже на пределе: ${signed(total)}`); return; }
    const g = gm(); g.karma = total - d.karmaBase;
    const why = f.why.trim();
    setF({ ...f, karma: '', why: '' });
    commit({ gm: g }, `Карма ${signed(total - d.karma)}${why ? ` (${why})` : ''}: теперь ${signed(total)}`);
  };
  const savePoints = () => {
    const prog = JSON.parse(JSON.stringify(rec.prog));
    const txt: string[] = [];
    Rr.STATS.forEach((k: string) => { const n = draft.alloc[k] || 0; if (n) { prog.alloc[k] = (prog.alloc[k] || 0) + n; txt.push(`${Rr.STAT_SHORT[k]} +${n}`); } });
    Object.entries(draft.talents).forEach(([k, n]) => { if (n) { prog.talents[k] = (prog.talents[k] || 0) + n; const t = Rr.TALENTS.find((x: Any) => x.id === k); txt.push(`${t ? t.name : k} +${n}`); } });
    Object.entries(draft.passives).forEach(([k, n]) => { if (n) { prog.passives = prog.passives || {}; prog.passives[k] = (prog.passives[k] || 0) + n; txt.push(`${cap(k)} +${n} (ур. ${prog.passives[k]})`); } });
    setDraft(newDraft());
    if (txt.length) commit({ prog }, `Распределены очки за новые уровни: ${txt.join(', ')}`);
  };
  const setBox = (box: keyof Draft, key: string, n: number) => setDraft(dr => ({ ...dr, [box]: { ...dr[box], [key]: Math.max(0, n) } }));
  const join = () => {
    const g = joinable().find(x => String(x.row) === f.group);
    if (!g) { window.App.toast('Выберите общину'); return; }
    const m = gm();
    if (m.groups.some((x: Any) => x.name === g.name)) { window.App.toast('Персонаж уже в этой общине'); return; }
    m.groups.push({ name: g.name, kind: g.type, row: g.row, st: g.st, bonus: g.bonus, quests: 0 });
    setF({ ...f, group: '' });
    commit({ gm: m }, `Вступил: ${g.type} «${g.name}»`);
  };
  const quest = (i: number, dq: number) => {
    const m = gm(), g = m.groups[i];
    if (!g) return;
    g.quests = Math.max(0, (g.quests || 0) + dq);
    const opened = dq > 0 && Math.floor(g.quests / 10) > Math.floor((g.quests - dq) / 10);
    commit({ gm: m }, `«${g.name}»: заданий ${g.quests}${opened ? ' — открыт новый дар общины' : ''}`);
  };
  const leave = (i: number) => {
    const m = gm(), g = m.groups[i];
    if (!g || !confirm(`Персонаж выходит из «${g.name}»? Бонус к статам пропадёт.`)) return;
    m.groups.splice(i, 1);
    commit({ gm: m }, `Покинул «${g.name}»`);
  };
  const learn = () => {
    const name = f.learnName.trim();
    if (!name) { window.App.toast('Впишите название'); return; }
    const m = gm(), info = f.learnKind === 'passive' ? passiveInfo(name) : null;
    // предел и эффекты пассивки — в запись: игрок увидит их без пароля ГМ
    m.learned.push(info ? { kind: f.learnKind, name: info.name, max: info.max || 0, eff: info.effect || '', top: info.top || '' } : { kind: f.learnKind, name });
    setF({ ...f, learnName: '' });
    commit({ gm: m }, `Изучено: ${LEARN_KINDS[f.learnKind].t.toLowerCase()} «${name}»`);
  };
  const unlearn = (i: number) => { const m = gm(); const x = m.learned.splice(i, 1)[0]; if (x) commit({ gm: m }, `Убрано из изученного: «${x.name}»`); };
  const saveNotes = () => { if (notes !== null && notes !== (rec.notes || '')) commit({ notes }, 'Обновлены заметки'); setNotes(null); };

  const groups: Any[] = rec.gm.groups || [];
  const learned: Any[] = rec.gm.learned || [];
  const talentsNow = Rr.TALENTS.map((t: Any) => {
    const tv = res.talents[t.id], info = (D().skills.talentInfo || []).find((x: Any) => norm(x.name) === norm(t.id));
    if (!tv || !tv.total || !info || !info.effect) return null;
    const max = info.max || t.max, now = Rr.skillAt(info.effect, tv.total), ch = chanceNow(info.effect, tv.total);
    return (
      <li key={t.id}><div>
        <b>{t.name}</b> <span className="chip">{fmt(tv.total)}{max ? ` / ${fmt(max)}` : ''}</span>
        <p className="small">{now !== info.effect ? now : info.effect}</p>
        {ch && <p className="small hp-now">сейчас: {ch}</p>}
        {info.top && <p className={'small' + (max && tv.total >= max ? '' : ' muted')}>на максимальном уровне: {info.top}</p>}
      </div></li>
    );
  }).filter(Boolean);
  const list = joinable();

  return (
    <div className="wstack hp-dev">
      {(errs.length > 0 || warns.length > 0) && <div className="hp-wide wstack tight">
        {errs.map((e: Any, i: number) => <p key={'e' + i} className="issue err">{e.msg}</p>)}
        {warns.map((e: Any, i: number) => <p key={'w' + i} className="issue warn">{e.msg}</p>)}
      </div>}

      {(p.statPoints > 0 || p.talentPoints > 0) && (
        <section className="card wstack">
          <h2>Очки за новые уровни</h2>
          <p className="small">Характеристики: <b>{p.statSpent + sum(draft.alloc)} / {p.statPoints}</b> · таланты и пассивные навыки: <b>{(p.talentSpent || 0) + sum(draft.talents) + sum(draft.passives)} / {p.talentPoints || 0}</b></p>
          <div className="hp-alloc">
            {(statLeft > 0 || sum(draft.alloc) > 0) && <div className="hp-alloc-col">
              <h3>Характеристики <span className="muted small">— осталось {Math.max(0, statLeft)}</span></h3>
              {Rr.STATS.map((k: string) => <div key={k} className="hp-arow"><span>{Rr.STAT_NAMES[k]} <span className="muted">{fmt(res.stats[k])}</span></span>
                <Stepper value={draft.alloc[k] || 0} min={0} max={(draft.alloc[k] || 0) + Math.max(0, statLeft)} label={Rr.STAT_NAMES[k]} onChange={n => setBox('alloc', k, n)} /></div>)}
            </div>}
            {(talLeft > 0 || sum(draft.talents) > 0) && <div className="hp-alloc-col">
              <h3>Таланты <span className="muted small">— осталось {Math.max(0, talLeft)}</span></h3>
              {Rr.TALENTS.map((t: Any) => {
                const tv = res.talents[t.id], dv = draft.talents[t.id] || 0;
                const room = tv.blocked ? 0 : tv.maxInv - tv.inv - dv;
                return <div key={t.id} className="hp-arow"><span>{t.name} <span className="muted">{fmt(tv.total)}</span></span>
                  <Stepper value={dv} min={0} max={dv + Math.max(0, Math.min(talLeft, room))} label={t.name} onChange={n => setBox('talents', t.id, n)} /></div>;
              })}
            </div>}
            {pas.length > 0 && (talLeft > 0 || sum(draft.passives) > 0) && <div className="hp-alloc-col">
              <h3>Пассивные навыки <span className="muted small">— те же очки талантов</span></h3>
              {pas.map(x => {
                const dv = draft.passives[x.name] || 0, room = x.max ? x.max - x.lvl - dv : 0;
                return <div key={x.name} className="hp-arow"><span>{cap(x.name)} <span className="muted">{fmt(x.lvl + dv)}{x.max ? ` / ${fmt(x.max)}` : ' · не прокачивается'}</span></span>
                  {x.max ? <Stepper value={dv} min={0} max={dv + Math.max(0, Math.min(talLeft, room))} label={x.name} onChange={n => setBox('passives', x.name, n)} /> : null}</div>;
              })}
            </div>}
          </div>
          {sum(draft.alloc) + sum(draft.talents) + sum(draft.passives) > 0
            ? <div className="row"><button type="button" className="btn primary small" onClick={savePoints}>Сохранить распределение</button><button type="button" className="btn ghost small" onClick={() => setDraft(newDraft())}>Сбросить</button></div>
            : statLeft <= 0 && talLeft <= 0 && <p className="muted small">Все очки распределены.</p>}
        </section>
      )}

      <div className="hp-cols">
      <section className="card wstack">
        <h2>Уровень и опыт</h2>
        <div className="hp-level">
          <div className="hp-lvl"><span className="muted small">Уровень</span><b>{fmt(res.level)}</b>{lv.levels > 0 && <span className="muted small">при создании {fmt(res0.level)}, +{lv.levels}</span>}</div>
          <div className="hp-xp">
            <span className="muted small">До уровня {fmt(lv.level + 1)}: {fmt(lv.xpInto)} / {fmt(lv.need)}</span>
            <div className="bar"><span style={{ width: pct + '%' }} /></div>
            <span className="muted small">Всего опыта: {fmt(rec.gm.xp || 0)}{d.expPct || d.expMul !== 1 ? ` · бонус: ${d.expPct ? signed(d.expPct) + '%' : ''}${d.expMul !== 1 ? ' ×' + d.expMul : ''}` : ''}</span>
          </div>
        </div>
        {res.age && <p className="small"><b>Возраст: {res.age.title.toLowerCase()}</b> <span className="muted">({signed(res.agePctNow)}% от среднего уровня расы {fmt(res.lvl0)})</span>
          {res.ageStart && res.ageStart !== res.age && <> — с ур. {fmt(res.ageAtLevel)}, при создании {res.ageStart.title.toLowerCase()}</>}
          <br /><span className="muted">{res.age.buff}</span>
          {res.ageNext && <><br /><span className="muted">Следующий — {res.ageNext.age.title.toLowerCase()}: с ур. {fmt(res.ageNext.level)}.</span></>}</p>}
        <div className="hp-row">
          <input type="number" min={0} inputMode="numeric" value={f.xp} onChange={e => setF({ ...f, xp: e.target.value })} placeholder="сколько опыта" aria-label="Сколько опыта начислить" onKeyDown={e => e.key === 'Enter' && xpGive()} />
          <button type="button" className="btn small" onClick={xpGive}>Начислить</button>
        </div>
        <div className="hp-row">
          <input type="text" list="hpCreatures" value={f.creature} onChange={e => setF({ ...f, creature: e.target.value })} placeholder="за победу над существом" aria-label="Существо" />
          <button type="button" className="btn small" onClick={xpCreature}>Начислить</button>
        </div>
        <datalist id="hpCreatures">{creatures.map(c => <option key={c.n} value={c.n}>ур. {fmt(Rr.roundLevel(c.lvl))}</option>)}</datalist>
        <p className="muted small">Опыт за существо = его уровню{d.expPct || d.expMul !== 1 ? ' с бонусами героя к опыту' : ''}. До следующего уровня нужно опыта в 100 раз больше текущего уровня.</p>
      </section>

      <section className="card wstack">
        <h2>Карма</h2>
        <p><b className="hp-karma">{signed(d.karma)}</b> <span className="muted small">характер{d.align ? ` «${d.align}»` : ''}: {signed(d.karmaBase)}{d.karmaGm ? `; изменения в игре: ${signed(d.karmaGm)}` : ''}; предел ±{C().KARMA_LIMIT}</span></p>
        <p className="muted small">Плюс — очки света, минус — очки тьмы.</p>
        <div className="hp-row">
          <input type="text" inputMode="numeric" value={f.karma} onChange={e => setF({ ...f, karma: e.target.value })} placeholder="+10 или −5" aria-label="На сколько изменить карму" />
          <input type="text" value={f.why} onChange={e => setF({ ...f, why: e.target.value })} maxLength={200} placeholder="за что (необязательно)" aria-label="За что" />
          <button type="button" className="btn small" onClick={karma}>Изменить</button>
        </div>
      </section>

      <section className="card wstack">
        <h2>Фракции, гильдии, религия</h2>
        {groups.length ? groups.map((g, i) => {
          const gifts = String(g.bonus || '').split('/').map(x => x.trim()).filter(Boolean);
          const open = Math.floor((g.quests || 0) / 10);
          const st = (g.st || []).map((raw: string, j: number) => {
            const pp = Rr.parseGroupStat(raw); if (!pp) return null;
            const k = Rr.STAT_SHORT[Rr.STATS[j]];
            return pp.op === 'add' ? `${k} ${signed(pp.v)}` : pp.op === 'mul' ? `${k} ×${fmt(pp.v)}` : `${k}: ${pp.raw}`;
          }).filter(Boolean);
          return (
            <div key={g.name} className="hp-group">
              <p><b>{g.name}</b> <span className="chip">{g.kind || g.type || 'община'}</span></p>
              <p className="small">Бонус к статам: {st.length ? st.join(', ') : 'нет'}</p>
              {gifts.length > 0 && <ol className="small hp-gifts">{gifts.map((x, j) => <li key={j} className={j < open ? '' : 'locked'}>{x}{j >= open && <span className="muted"> — откроется после {10 * (j + 1)} заданий</span>}</li>)}</ol>}
              <div className="hp-row small">Заданий выполнено:
                <span className="stp mini"><button type="button" onClick={() => quest(i, -1)} disabled={!g.quests} aria-label="Минус задание">−</button><output>{g.quests || 0}</output><button type="button" onClick={() => quest(i, 1)} aria-label="Плюс задание">+</button></span>
                <button type="button" className="link small" onClick={() => leave(i)}>выйти</button>
              </div>
            </div>
          );
        }) : <p className="muted small">Пока ни в одной общине. Фракцию и религию герой получает в игре.</p>}
        {list.length ? (
          <div className="hp-row">
            <Sel value={f.group} onChange={g => setF({ ...f, group: g })} label="Община" options={[{ v: '', t: '— вступить в общину —' } as Opt].concat(list.map(g => ({ v: String(g.row), t: g.name + (g.join ? ` (${g.join})` : ''), group: cap(g.type) })).sort((a, b) => String(a.group).localeCompare(String(b.group))))} />
            <button type="button" className="btn small" onClick={join}>Вступить</button>
          </div>
        ) : <p className="muted small">Список общин — в закрытом разделе «Социум» (пароль ГМ).</p>}
      </section>

      <section className="card wstack">
        <h2>Изученные навыки и символы</h2>
        {learned.length ? <ul className="hp-list">{learned.map((x, i) => {
          const ps = x.kind === 'passive' ? pas.find(y => norm(y.name) === norm(x.name)) : null;
          const now = ps && ps.lvl > 0 ? (chanceNow(ps.eff, ps.lvl) || (Rr.skillAt(ps.eff, ps.lvl) !== ps.eff ? Rr.skillAt(ps.eff, ps.lvl) : '')) : '';
          return (
            <li key={i}>
              <div><b>{x.name}</b> <span className="muted small">{(LEARN_KINDS[x.kind] || LEARN_KINDS.other).t.toLowerCase()}</span>
                {ps && <span className="chip">{ps.max ? `ур. ${fmt(ps.lvl)} / ${fmt(ps.max)}` : 'не прокачивается'}</span>}
                {ps && ps.eff && <p className="small">{ps.eff}</p>}
                {now && <p className="small hp-now">сейчас (ур. {fmt(ps.lvl)}): {now}</p>}
                {ps && ps.top && <p className={'small' + (ps.max && ps.lvl >= ps.max ? '' : ' muted')}>на максимальном уровне: {ps.top}</p>}
              </div>
              <button type="button" className="link small" onClick={() => unlearn(i)}>убрать</button>
            </li>
          );
        })}</ul> : <p className="muted small">Пока ничего не изучено после создания.</p>}
        <div className="hp-row">
          <Sel value={f.learnKind} onChange={k => setF({ ...f, learnKind: k })} label="Что изучено" options={Object.entries(LEARN_KINDS).map(([k, x]) => ({ v: k, t: x.t }))} />
          <input type="text" list="hpLearn" value={f.learnName} onChange={e => setF({ ...f, learnName: e.target.value })} placeholder="название" aria-label="Название" />
          <button type="button" className="btn small" onClick={learn}>Добавить</button>
        </div>
        <datalist id="hpLearn">{LEARN_KINDS[f.learnKind].list().map(n => <option key={n} value={n} />)}</datalist>
        {talentsNow.length > 0 && <><h3>Таланты сейчас</h3><ul className="hp-list">{talentsNow}</ul></>}
        {pas.some(x => x.max) && <p className="muted small">Пассивные навыки прокачиваются очками талантов (за каждые 5 уровней) — в «Очках за новые уровни».</p>}
      </section>

      <section className="card wstack">
        <h2>Заметки</h2>
        <Field label="Что важно помнить о герое: клятвы, долги, знакомые">
          <textarea rows={5} value={notes !== null ? notes : rec.notes || ''} onChange={e => setNotes(e.target.value)} />
        </Field>
        {notes !== null && notes !== (rec.notes || '') && <div className="row"><button type="button" className="btn small primary" onClick={saveNotes}>Сохранить заметки</button><button type="button" className="btn ghost small" onClick={() => setNotes(null)}>Отменить</button></div>}
      </section>
      </div>
    </div>
  );
}
