import { useState } from 'react';
import { Icon } from '../../ui/Icon';
import { run } from './cloud';

// честный бросок 1–100: криптографический генератор браузера, без перекоса (лишние значения отбрасываются)
export function d100() {
  const cr = window.crypto;
  if (!cr || !cr.getRandomValues) return Math.floor(Math.random() * 100) + 1;
  const a = new Uint32Array(1), lim = 4294967200;
  do { cr.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % 100 + 1;
}

/**
 * Бросок d100. cid — бросок попадает в журнал кампании (видят ГМ и все игроки); chid / chName — бросок за персонажа.
 * side — компактный, в панели у поля боя. История бросков общая для всех кубиков (App.ui.gDiceHist).
 */
export function Dice({ cid, chid, chName, side }: { cid?: string; chid?: string; chName?: string; side?: boolean }) {
  const ui = window.App.ui;
  const [why, setWhy] = useState('');
  const [hist, setHist] = useState<{ n: number; why: string }[]>(ui.gDiceHist || []);
  const [fresh, setFresh] = useState(0);
  const roll = () => {
    const n = d100(), w = why.trim().slice(0, 200);
    const h = [{ n, why: w }, ...(ui.gDiceHist || hist)].slice(0, 12);
    ui.gDiceHist = h; ui.gDiceLast = { n, ms: Date.now() };
    setHist(h); setWhy(''); setFresh(f => f + 1);
    if (cid && window.Cloud.user) run(() => window.Cloud.roll(cid, n, w, chid, chName));
  };
  const last = hist[0];
  const hint = cid ? (chid ? `Бросок за «${chName || 'персонажа'}» попадёт в журнал кампании — его увидят ГМ и игроки.` : 'Результат попадает в журнал кампании — его видят ГМ и все игроки.')
    : 'Бросок никуда не записывается. В кампании результат попадает в журнал — его видят ГМ и все игроки.';
  return (
    <section className={'card g-dice' + (side ? ' side' : '')} title={side ? hint : undefined}>
      <h2><Icon name="dice" />Бросок d100{chid ? ` за «${chName || 'персонажа'}»` : ''}</h2>
      <div className="gd-row">
        <div key={fresh} className={'gd-n' + (last ? '' : ' empty') + (fresh ? ' fresh' : '') + (last && (last.n === 1 || last.n === 100) ? ' edge' : '')} aria-live="polite" aria-label="Результат броска">{last ? last.n : '—'}</div>
        <div className="gd-ctl">
          <input type="text" value={why} onChange={e => setWhy(e.target.value)} maxLength={200} placeholder="за что бросок (необязательно)" aria-label="За что бросок" onKeyDown={e => e.key === 'Enter' && roll()} />
          <button type="button" className="btn primary" onClick={roll}>Бросить d100</button>
        </div>
      </div>
      {hist.length > 1 && <p className="small gd-hist">Предыдущие: {hist.slice(1, side ? 7 : 9).map((h, i) => <span key={i} title={h.why}>{h.n}</span>)}</p>}
      {!side && <p className="muted small">{hint}</p>}
    </section>
  );
}
