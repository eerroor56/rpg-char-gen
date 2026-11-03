/*
 * Мост к логике прежнего сайта (window.*): правила и расчёт персонажа (Rules, Dev), облако и вход (Cloud),
 * «Мои герои» в облаке (HeroSync). Новая версия — только интерфейс поверх неё; переносим по разделам.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
declare global {
  interface Window {
    App: Any; Rules: Any; Dev: Any; Cloud: Any; HeroSync: Any; GMLock: Any;
    GAME_DATA: Any; RACE_IMAGES: Record<string, { src: string; w: number; h: number }>;
  }
}

export const HEROES_KEY = 'hero-workshop:heroes';
/** Адрес прежней версии — для разделов, которые ещё не перенесены */
export const OLD_SITE = 'https://rpg-char-gen.web.app/';

let ready = false;
/** правила и данные таблицы — как App.start() прежнего сайта; пароль ГМ, если запомнен */
export function initLegacy() {
  if (ready) return;
  ready = true;
  window.Rules.init(window.GAME_DATA);
  if (window.GMLock) window.GMLock.auto();
}

export const toast = (text: string) => window.App.toast(text);

// ------------------------------------------------------------ вход в аккаунт
export type User = { uid: string; name: string; email?: string } | null;

export function useAuth() {
  const C = window.Cloud;
  const [state, setState] = useState<{ ready: boolean; user: User; configured: boolean; error: string }>(
    { ready: !!C.ready, user: C.user || null, configured: C.configured(), error: '' });
  useEffect(() => {
    if (!C.configured()) return;
    let alive = true;
    const off = C.onAuth((u: User) => alive && setState(s => ({ ...s, ready: true, user: u })));
    C.init().then((ok: boolean) => alive && setState(s => ({ ...s, ready: true, user: C.user || null, error: ok ? '' : C.errorText(C.error) })));
    return () => { alive = false; off(); };
  }, [C]);
  return state;
}

/** вызвать облако с понятной ошибкой в уведомлении */
export async function cloudCall(fn: () => Promise<unknown>, ok?: string) {
  try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(window.Cloud.errorText(e)); return false; }
}

// ------------------------------------------------------------ «Мои герои»
export type Hero = { id: string; savedAt?: number; state: Any; prog?: Any; gm?: Any; pic?: string; log?: Any[] };

// список в браузере держит в порядке HeroSync (облако ⇄ браузер); здесь — чтение со своевременным обновлением
let heroesJson = '';
let heroesSnap: Hero[] = [];
function readHeroes() {
  const raw = localStorage.getItem(HEROES_KEY) || '[]';
  if (raw !== heroesJson) { heroesJson = raw; try { heroesSnap = JSON.parse(raw) || []; } catch { heroesSnap = []; } }
  return heroesSnap;
}
function subscribeHeroes(cb: () => void) {
  const t = window.setInterval(cb, 1200);
  window.addEventListener('storage', cb);
  return () => { window.clearInterval(t); window.removeEventListener('storage', cb); };
}
export const useHeroes = () => useSyncExternalStore(subscribeHeroes, readHeroes);

export type SyncStatus = { configured: boolean; signedIn: boolean; on: boolean; loading: boolean; err: string; n: number; name: string };
let syncJson = '';
let syncSnap: SyncStatus = { configured: false, signedIn: false, on: false, loading: false, err: '', n: 0, name: '' };
function readSync() {
  const s = window.HeroSync ? window.HeroSync.status() : syncSnap;
  const j = JSON.stringify(s);
  if (j !== syncJson) { syncJson = j; syncSnap = s; }
  return syncSnap;
}
export const useSync = () => useSyncExternalStore(subscribeHeroes, readSync);

/** что показать о герое: раса, уровень, возраст, портрет, собран ли по правилам */
export function heroView(h: Hero) {
  const v = window.Dev.compute(JSON.parse(JSON.stringify(h)));
  const res = v.res, race = res.race;
  const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
  const img = base && window.RACE_IMAGES[base.id];
  const pic = h.pic && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(h.pic) ? h.pic : img ? img.src : '';
  return {
    name: h.state?.name || 'Безымянный герой',
    race: race ? cap(race.name) : 'раса не выбрана',
    level: res.level as number,
    age: res.age ? String(res.age.title).toLowerCase() : '',
    ok: !!res.ok,
    errors: (res.errors || []).length as number,
    xp: +(h.gm?.xp || 0),
    pic,
    custom: pic === h.pic,
  };
}
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------ маршрут (хэш — как у прежнего сайта: #heroes, #game/…)
function readHash() { return location.hash.replace(/^#/, ''); }
function subscribeHash(cb: () => void) { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); }
export function useRoute() {
  const h = useSyncExternalStore(subscribeHash, readHash);
  const [tab = 'home', ...rest] = h.split('/');
  return { tab: tab || 'home', rest, hash: h };
}
