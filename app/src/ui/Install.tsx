import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/*
 * «Мастерская героя» как приложение: service worker (public/sw.js — работа без интернета) и кнопка «Установить».
 * Chrome, Edge, Android сами предлагают установку (beforeinstallprompt) — кнопка её вызывает; у Safari на iPhone и iPad
 * такой команды нет — кнопка показывает, как добавить сайт на экран «Домой». В установленном приложении кнопки нет.
 */
declare const __LEGACY_V__: string;
type Prompt = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };

// открыто как приложение: окно приложения (любой режим) или запуск с иконки (start_url — ./?app=1, запоминается до закрытия)
if (/[?&]app=1(&|$)/.test(location.search)) { try { sessionStorage.setItem('mh-app', '1'); } catch { /* noop */ } }
const standalone = () => ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(m => window.matchMedia(`(display-mode: ${m})`).matches)
  || (navigator as Navigator & { standalone?: boolean }).standalone === true || (() => { try { return sessionStorage.getItem('mh-app') === '1'; } catch { return false; } })();
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferred: Prompt | null = null;
const subs = new Set<() => void>();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as Prompt; subs.forEach(f => f()); });
window.addEventListener('appinstalled', () => { deferred = null; subs.forEach(f => f()); window.App?.toast('«Мастерская героя» установлена — ищите иконку на экране или в меню приложений'); });

/** service worker: новая сборка — новый кэш (sw.js?v=метка сборки) */
export function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(__LEGACY_V__)).catch(() => { /* без приложения сайт работает как обычно */ }); });
}

/** кнопка «Установить»; className — для места (боковая панель, «Ещё» на телефоне) */
export function InstallButton({ className }: { className?: string }) {
  const [, tick] = useState(0);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { const f = () => tick(t => t + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (standalone() || (!deferred && !ios)) return null;
  const click = async () => {
    if (deferred) {
      const p = deferred;
      p.prompt();
      await p.userChoice.catch(() => null);
      deferred = null; subs.forEach(f => f());
      return;
    }
    dlg.current?.showModal();
  };
  return <>
    <button type="button" className={className} onClick={click} title="Установить сайт как приложение"><Icon name="download" /><span>Установить приложение</span></button>
    {ios && (
      <dialog ref={dlg} className="install-dlg" aria-labelledby="installTitle" onClick={e => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <h2 id="installTitle">Установить на iPhone или iPad</h2>
        <ol>
          <li>Откройте сайт в <b>Safari</b>.</li>
          <li>Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх внизу экрана.</li>
          <li>Выберите <b>«На экран „Домой“»</b> и нажмите <b>«Добавить»</b>.</li>
        </ol>
        <p className="muted small">На экране появится иконка «Мастерская» — сайт будет открываться как приложение, без адресной строки.</p>
        <div className="row"><button type="button" className="btn primary" onClick={() => dlg.current?.close()}>Понятно</button></div>
      </dialog>
    )}
  </>;
}
