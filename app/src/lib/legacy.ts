/*
 * Мост к логике прежнего сайта (window.*): правила и расчёт персонажа (Rules, Dev), облако и вход (Cloud),
 * «Мои герои» в облаке (HeroSync). Новая версия — только интерфейс поверх неё; переносим по разделам.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
declare global {
  interface Window {
    App: Any; Rules: Any; Dev: Any; Cloud: Any; HeroSync: Any; GMLock: Any; RandomHero: Any;
    GAME_DATA: Any; RACE_IMAGES: Record<string, { src: string; w: number; h: number }>;
  }
}

export const HEROES_KEY = 'hero-workshop:heroes';
/** Адрес прежней версии — для разделов, которые ещё не перенесены */
export const OLD_SITE = 'https://rpg-char-gen.web.app/';

let ready = false;
/** правила и данные таблицы, черновик мастера, обработчики шагов — как App.start() прежнего сайта (без его разметки) */
export function initLegacy() {
  if (ready) return;
  ready = true;
  const App = window.App;
  window.Rules.init(window.GAME_DATA);
  App.state = App.migrate(App.store.get(DRAFT_KEY, null)) || window.Rules.newState();
  App.editingId = App.store.get(DRAFT_KEY + ':id', null);
  App.step = App.step || 'race';
  App.recompute();
  App.bind();                 // нажатия и ввод в шагах мастера (data-act, data-bind) — на document.body
  // мастер пересчитал героя — сообщить новой оболочке (шаги, сводка)
  const recompute = App.recompute;
  App.recompute = function (...a: unknown[]) { const r = recompute.apply(this, a); window.dispatchEvent(new Event('mh-create')); return r; };
  if (window.GMLock) window.GMLock.auto().then((ok: boolean) => { if (ok) App.recompute(); });
}
const DRAFT_KEY = 'hero-workshop:draft';

// ------------------------------------------------------------ мастер создания (шаги — App.steps прежнего сайта)
export type Step = { id: string; title: string; short?: string; lead?: string };
let createTick = 0;
function subscribeCreate(cb: () => void) {
  const f = () => { createTick++; cb(); };
  window.addEventListener('mh-create', f);
  return () => window.removeEventListener('mh-create', f);
}
export function useCreate() {
  useSyncExternalStore(subscribeCreate, () => createTick);
  const App = window.App;
  return { state: App.state, res: App.res, step: App.step as string, steps: App.steps as Step[], editingId: App.editingId as string | null };
}
/** ошибки и предупреждения шага: ok — без ошибок (предупреждения не мешают) */
export function stepStatus(res: Any, id: string) {
  const errs = (res.errors || []).filter((e: Any) => e.step === id).length;
  const warns = (res.warnings || []).filter((e: Any) => e.step === id).length;
  return { errs, warns };
}
/** нажать кнопку прежнего мастера (App.actions) без разметки — например «Случайно» */
export function act(name: string, dataset: Record<string, string> = {}) {
  const App = window.App, f = App.actions[name];
  if (f) f.call(App, { dataset, closest: () => null }, {});
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
