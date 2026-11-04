import { useEffect, useState } from 'react';

/* Подписки на данные кампании (js/cloud.js: watchCampaign, watchCharacters…) — живые: что поменяли другие, приходит само */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Any = any;
type Watch = (ok: (v: Any) => void, bad: (e: unknown) => void) => (() => void) | undefined;

/** data: undefined — ещё грузится; err — текст ошибки (нет доступа, кампания удалена…); set — показать сразу, не дожидаясь сервера */
export function useWatch<T = Any>(key: string | null, watch: Watch) {
  const [st, setSt] = useState<{ key: string | null; data: T | undefined; err: string }>({ key, data: undefined, err: '' });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    setSt({ key, data: undefined, err: '' });
    const off = watch(v => alive && setSt({ key, data: v, err: '' }), e => alive && setSt(s => ({ ...s, key, err: window.Cloud.errorText(e) })));
    return () => { alive = false; try { off && off(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const fresh = st.key === key;
  return { data: fresh ? st.data : undefined, err: fresh ? st.err : '', set: (fn: (v: T | undefined) => T) => setSt(s => ({ ...s, data: fn(s.data) })) };
}

/** расчёт персонажа кампании — дорогой, поэтому запоминается до следующего изменения записи */
const cache = new Map<string, { ms: number; v: Any }>();
export function charView(ch: Any) {
  const c = cache.get(ch.id);
  if (c && c.ms === ch.updatedMs) return c.v;
  const v = window.Dev.compute(JSON.parse(JSON.stringify(ch)));
  cache.set(ch.id, { ms: ch.updatedMs, v });
  return v;
}

/** запрос к облаку с понятной ошибкой */
export async function run(fn: () => Promise<unknown>, ok?: string) {
  try { await fn(); if (ok) window.App.toast(ok); return true; } catch (e) { window.App.toast(window.Cloud.errorText(e)); return false; }
}

export const STATUS: Record<string, string> = { draft: 'черновик', review: 'на проверке у ГМ', active: 'в игре', dead: 'погиб', retired: 'на покое' };
export const when = (ms?: number) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
/** мастер собирает героя для кампании («Персонаж для кампании …»): js/game.js читает это же */
export const setTarget = (t: Any) => window.App.store.set('hero-workshop:cloud-target', t);
export const joinLink = (code: string) => location.origin + location.pathname + '#game/join/' + code;
export function copyText(text: string) {
  const done = () => window.App.toast('Скопировано: ' + text);
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => prompt('Скопируйте:', text));
  else prompt('Скопируйте:', text);
}
