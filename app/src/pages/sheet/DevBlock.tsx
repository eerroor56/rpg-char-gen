import { fmt } from '../create/kit';

/* «Развитие» на листе героя: уровень и опыт, общины, изученное в игре, состояния (js/inventory.js), заметки */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function DevBlock({ rec, v }: { rec: any; v: any }) {
  const g = rec.gm || {};
  const fx = window.Inv && v.inv ? window.Inv.sheetExtra(v, rec) : '';
  return (
    <section className="cs-block wide">
      <h3>Развитие</h3>
      <p><b>Уровень:</b> {fmt(v.res.level)}{v.lv.levels ? ` (при создании ${fmt(v.res0.level)})` : ''}; опыт {fmt(v.lv.xpInto)} / {fmt(v.lv.need)} до следующего</p>
      {(g.groups || []).length > 0 && <p><b>Общины:</b> {g.groups.map((x: any) => x.name + (x.quests ? ` (заданий: ${x.quests})` : '')).join(', ')}</p>}
      {(g.learned || []).length > 0 && <p><b>Изучено в игре:</b> {g.learned.map((x: any) => x.name).join(', ')}</p>}
      {fx && <div dangerouslySetInnerHTML={{ __html: fx }} />}
      {rec.notes && <p className="cs-pre cs-small">{rec.notes}</p>}
    </section>
  );
}
