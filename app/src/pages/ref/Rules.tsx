import { useLayoutEffect, useRef } from 'react';

/* «Как считается»: формулы и решения по спорным местам — текст собирает js/sheet.js (Sheet.renderRules) из тех же правил */
export default function Rules() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) window.Sheet.renderRules(ref.current); }, []);
  return <div ref={ref} className="rules-doc" />;
}
