import { useLayoutEffect, useRef, useState } from 'react';

/* общее для вкладки «Снаряжение»: поля, которые читают действия js/inventory.js (App.ui), и разметка прежнего сайта */

/** поле, которое читает действие прежнего сайта (App.ui[key]) */
export function useUi() {
  const [, tick] = useState(0);
  const ui = window.App.ui;
  return {
    get: (k: string) => (ui[k] === undefined || ui[k] === null ? '' : String(ui[k])),
    set: (k: string, v: unknown) => { ui[k] = v; tick(t => t + 1); },
  };
}

/** «Что нужно» — игрок создаёт сам: крафтильни, навык, сырьё в рюкзаке (✓ есть, ✗ нет) */
export function Needs({ list }: { list: { ok: boolean; text: string }[] }) {
  if (!list.length) return null;
  return (
    <div className="gr-needs">
      <h3>Что нужно</h3>
      <ul>{list.map((x, i) => <li key={i} className={x.ok ? 'ok' : 'no'}><span aria-hidden="true">{x.ok ? '✓' : '✗'}</span> {x.text}</li>)}</ul>
    </div>
  );
}

/** разметка прежнего сайта (что дают усиления предмета): обновляется, только когда изменилась */
export function LegacyHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useLayoutEffect(() => { if (ref.current && html !== last.current) { ref.current.innerHTML = html; last.current = html; } });
  return <div ref={ref} className="legacy-pane" />;
}
