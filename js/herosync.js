/*
 * «Мои герои» в облаке. Список героев в браузере (hero-workshop:heroes) остаётся рабочей копией — весь остальной код
 * пишет и читает его как раньше, а этот модуль, пока игрок вошёл в аккаунт (вкладка «Игра»), держит его вровень с облаком:
 *   — users/{uid}/heroes/{id}: { id, savedAt, name, deleted, data } — герой целиком строкой JSON (Firestore не хранит
 *     массив внутри массива, а в листе такие бывают), удалённый — пометкой deleted, чтобы не вернулся с другого устройства;
 *   — при первом входе все герои из браузера переносятся в аккаунт; дальше побеждает более новый (savedAt);
 *   — другой аккаунт в этом же браузере: герои прежнего откладываются (hero-workshop:heroes@uid), видны только свои.
 */
(function () {
  'use strict';
  const App = window.App, C = window.Cloud;
  const KEY = 'hero-workshop:heroes', OWNER = 'hero-workshop:heroes-owner', DEL = 'hero-workshop:heroes-deleted';
  // synced — облако уже ответило с сервера. До этого ничего не отправляется: иначе (вход без сети, первые секунды после входа)
  // старая копия из браузера записалась бы поверх более новой, сохранённой с другого устройства
  const st = { on: false, synced: false, uid: null, name: '', loading: false, err: '', n: 0, moved: 0, cloud: new Map() };
  let unsub = null, quiet = false, timer = 0;

  const get = (k, d) => App.store.get(k, d);
  const origSet = App.store.set;
  const put = (k, v) => { quiet = true; try { return origSet(k, v); } finally { quiet = false; } };
  const deleted = () => (get(DEL, []) || []).filter(d => d && d.id);

  // любая запись списка героев: удалённые запоминаются (пометка уйдёт в облако), изменения отправляются чуть позже пачкой
  App.store.set = (k, v) => {
    if (k !== KEY || quiet) return origSet(k, v);
    const before = get(KEY, []) || [];
    const ok = origSet(k, v);
    if (ok) {
      const now = new Set((v || []).map(h => h && h.id));
      const gone = before.filter(h => h && h.id && !now.has(h.id)).map(h => ({ id: h.id, at: Date.now() }));
      if (gone.length) put(DEL, deleted().filter(d => !now.has(d.id)).concat(gone));
      schedule();
    }
    return ok;
  };

  const docOf = h => ({ id: h.id, savedAt: +h.savedAt || 0, name: String((h.state || {}).name || '').slice(0, 120), deleted: false, data: JSON.stringify(h) });
  // hold — последняя отправка не удалась: снова отправляем при следующем изменении героев, а не на каждый снимок облака
  // (иначе при постоянной ошибке, например слишком большом герое, отправка шла бы по кругу)
  function schedule() { if (!st.on) return; st.hold = false; clearTimeout(timer); timer = setTimeout(push, 400); }

  // отправить в облако то, что здесь новее или чего там нет, и пометки об удалении
  function push() {
    if (!st.on || !st.synced) return;
    const list = get(KEY, []) || [], docs = [];
    let bumped = false;
    list.forEach(h => {
      if (!h || !h.id) return;
      const c = st.cloud.get(h.id), data = JSON.stringify(h);
      if (c && !c.deleted && c.data === data) return;
      if (c && (+h.savedAt || 0) <= c.savedAt) { h.savedAt = c.savedAt + 1; bumped = true; }   // поменяли, не отметив время
      docs.push(docOf(h));
    });
    if (bumped) put(KEY, list);
    const del = deleted();
    del.forEach(d => { const c = st.cloud.get(d.id); if (!c || !c.deleted) docs.push({ id: d.id, savedAt: Math.max(d.at, c ? c.savedAt + 1 : 0), name: '', deleted: true, data: '' }); });
    if (!docs.length) { if (del.length) put(DEL, []); return; }
    const was = new Map(docs.map(d => [d.id, st.cloud.get(d.id)]));
    docs.forEach(d => st.cloud.set(d.id, { savedAt: d.savedAt, data: d.data, deleted: d.deleted }));
    const moving = st.moved, uid = st.uid;
    C.putHeroes(docs).then(() => {
      if (del.length) put(DEL, deleted().filter(d => !del.some(x => x.id === d.id)));
      if (moving) { App.toast(`Герои перенесены в облако: ${moving}. Теперь они видны на любом устройстве, где вы вошли.`); st.moved = 0; }
      st.err = '';
    }, e => {
      // не записалось — вернуть, что было известно об облаке: при следующем изменении эти герои отправятся снова
      if (st.uid === uid) was.forEach((c, id) => { if (c) st.cloud.set(id, c); else st.cloud.delete(id); });
      st.hold = true; st.err = C.errorText(e); refresh();
    });
  }

  // пришло из облака: новее — сюда, удалённое там — убрать здесь (если здесь не новее)
  function merge(rows, meta) {
    // снимок из кэша браузера до первого ответа сервера — не правда об облаке: ждём сервер
    if (meta && meta.fromCache && !st.synced) return;
    st.synced = true;
    const list = get(KEY, []) || [], byId = new Map(list.map(h => [h.id, h]));
    const delSet = new Set(deleted().map(d => d.id));
    const order = list.map(h => h.id);
    let changed = false;
    rows.forEach(r => {
      if (!r || !r.id) return;
      const c = { savedAt: +r.savedAt || 0, data: r.data || '', deleted: !!r.deleted };
      st.cloud.set(r.id, c);
      const l = byId.get(r.id);
      if (c.deleted) { if (l && (+l.savedAt || 0) <= c.savedAt) { byId.delete(r.id); changed = true; } return; }
      if (delSet.has(r.id)) return;
      if (!l || c.savedAt > (+l.savedAt || 0)) {
        try { byId.set(r.id, JSON.parse(c.data)); if (!l) order.push(r.id); changed = true; } catch (e) { /* испорченная запись — пропустить */ }
      }
    });
    if (changed) put(KEY, order.filter(id => byId.has(id)).map(id => byId.get(id)));
    st.n = rows.filter(r => r && !r.deleted).length;
    st.loading = false;
    if (!st.hold) push();
    if (changed || App.tab === 'heroes') refresh();
  }

  function refresh() {
    if (App.tab !== 'heroes' || !window.Heroes) return;
    const el = document.getElementById('tab-heroes');
    if (el) App.keepFocus(document.activeElement || el, () => window.Heroes.render(el));
  }

  function onUser(u) {
    if (u && st.uid === u.uid && unsub) { st.name = u.name || ''; return; }
    if (unsub) { unsub(); unsub = null; }
    Object.assign(st, { on: false, synced: false, hold: false, uid: null, name: '', loading: false, err: '', n: 0, moved: 0, cloud: new Map() });
    if (!u) { refresh(); return; }
    const owner = get(OWNER, null);
    if (owner && owner !== u.uid) {        // другой аккаунт в этом браузере: прежние герои — в сторону, свои — сюда
      put(KEY + '@' + owner, get(KEY, []));
      put(KEY, get(KEY + '@' + u.uid, []));
      put(DEL, []);
    } else if (!owner) st.moved = (get(KEY, []) || []).length;   // первый вход: всё из браузера уходит в аккаунт
    put(OWNER, u.uid);
    Object.assign(st, { on: true, uid: u.uid, name: u.name || '', loading: true });
    refresh();
    unsub = C.watchHeroes(merge, e => { Object.assign(st, { on: false, loading: false, err: C.errorText(e) }); refresh(); });
  }

  function start() {
    if (!C || !C.configured()) return;
    setTimeout(() => C.init().then(ok => { if (!ok) return; C.onAuth(onUser); onUser(C.user); }), 600);
  }

  // для «Моих героев»: что показать о хранении
  const status = () => ({ configured: !!(C && C.configured()), signedIn: !!(C && C.user), on: st.on, loading: st.loading, err: st.err, n: st.n, name: st.name });

  window.HeroSync = { start, status, push };
  start();
})();
