import type { Any } from '../create/kit';

/*
 * Сопротивления и слабости (js/resist.js): плашки по типам урона — зелёные защищают, красные — слабости;
 * при наведении — откуда. Что зависит от условия или действует несколько ходов, — отдельной строкой, само не считается.
 * Порядок расчёта урона (ГМ): единицы («50е») → проценты (складываются) → множители слабостей → броня → ХП;
 * сквозь броню — без брони, чистый урон — мимо всего.
 */
export const Rz = (): Any => (window as Any).Resist;

export function ResistChips({ entries, empty = 'нет', paper }: { entries: Any[]; empty?: string; paper?: boolean }) {
  const Z = Rz();
  if (!Z) return null;
  const rows = Z.summary(entries) as Any[];
  if (!rows.length) return <span className={paper ? 'cs-muted' : 'muted'}>{empty}</span>;
  return <span className="rz-chips">{rows.map(x => {
    const s = Z.sign(x);
    return <span key={x.key} className={'eff' + (s > 0 ? ' plus' : s < 0 ? ' minus' : '')} title={x.src.join('\n')}>
      {x.name}: {Z.chip(x)}
    </span>;
  })}</span>;
}

/** условные и непонятные строки: показать ГМ текст из таблицы */
export function ResistConds({ entries, paper }: { entries: Any[]; paper?: boolean }) {
  const Z = Rz();
  if (!Z) return null;
  const list = Z.conds(entries) as Any[];
  if (!list.length) return null;
  const seen = new Set<string>(), uniq = list.filter(e => { const k = e.src + '|' + e.txt; if (seen.has(k)) return false; seen.add(k); return true; });
  return <p className={paper ? 'cs-muted cs-small' : 'muted small'}>При условии (само не считается): {uniq.map((e, i) => <span key={i}>{i ? '; ' : ''}{e.src} — «{e.txt}»</span>)}</p>;
}

/** блок листа персонажа */
export function ResistBlock({ entries }: { entries: Any[] }) {
  return (
    <section className="cs-block wide">
      <h3>Сопротивления и слабости</h3>
      <p><ResistChips entries={entries} paper empty="нет — урон проходит полностью" /></p>
      <ResistConds entries={entries} paper />
      <p className="cs-muted cs-small">Урон считается так: сначала сопротивление в единицах, затем проценты (складываются; 100% — урона нет), затем слабости-множители, затем броня. Физ — оружие и «разделение»; маг — урон символов, кроме пси и воли; чистый урон игнорирует всё.</p>
    </section>
  );
}
