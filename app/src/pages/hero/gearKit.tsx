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

/** разметка прежнего сайта (изготовление, кухня и зелья, передача): обновляется, только когда изменилась */
export function LegacyHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useLayoutEffect(() => { if (ref.current && html !== last.current) { ref.current.innerHTML = html; last.current = html; } });
  return <div ref={ref} className="legacy-pane" />;
}
