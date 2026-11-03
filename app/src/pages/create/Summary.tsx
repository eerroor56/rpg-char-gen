import { useEffect } from 'react';
import { act, type StepProps } from './kit';
import { Icon } from '../../ui/Icon';

/*
 * Шаг 9 — лист персонажа. Сам лист пока рисует прежний сайт (js/sheet.js: проверки, лист, печать, ссылка для ГМ)
 * со своими стилями — они подключаются, только пока открыт этот шаг.
 */
const PARTS: [string, string][] = [['race', 'Раса'], ['age', 'Возраст'], ['boon', 'Дар'], ['traits', 'Черты'], ['stats', 'Характеристики'], ['talents', 'Таланты'], ['gear', 'Снаряжение'], ['story', 'Имя и история']];

export default function Summary({ st, res }: StepProps) {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'legacy/css/style.css'; link.dataset.legacy = '1';
    document.head.appendChild(link);
    document.body.classList.add('sheet-on');
    return () => { link.remove(); document.body.classList.remove('sheet-on'); };
  }, []);
  const step = window.App.steps.find((s: { id: string }) => s.id === 'summary');
  // панель переброса прежнего листа заменена своей (ниже), остальное — как было
  const html = step ? step.render(st, res).replace(/^<div class="random-bar[\s\S]*?<\/div>\s*<\/div>/, '') : '';
  return (
    <div className="wstack">
      {window.RandomHero && st.raceId && (
        <div className="card reroll">
          <p><b>Перебросить случайно</b> <span className="muted small">— меняется только выбранная часть; что от неё зависит и сломалось — пересоберётся само</span></p>
          <div className="row">
            {PARTS.map(([id, t]) => <button key={id} type="button" className="btn ghost small" onClick={() => act('randomStep', { step: id })}><Icon name="dice" />{t}</button>)}
            <button type="button" className="btn small" onClick={() => act('randomFull')}><Icon name="dice" />Всё заново</button>
          </div>
        </div>
      )}
      <div id="tab-create" className="legacy-sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
