/*
 * Онлайн-игра: вход, кампании, персонажи, журнал и сессии.
 *
 * Хранилище — Firebase (бесплатный тариф Spark): Authentication + Firestore.
 * Настройки проекта — в js/firebase-config.js (см. README, раздел «Игра онлайн»).
 * Правила доступа — firestore.rules; их копия для проверки — в localRules() ниже.
 *
 * Для проверки без интернета: адрес сайта с ?cloud=local — всё то же самое,
 * но «облако» живёт в этом браузере (вход по любому имени). Только для тестов.
 */
(function () {
  'use strict';
  const SDK = '10.14.1';
  const op = { union: v => ({ __op: 'union', v }), remove: v => ({ __op: 'remove', v }) };
  const clean = v => JSON.parse(JSON.stringify(v === undefined ? null : v));
  const now = () => Date.now();
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_ABC[b % CODE_ABC.length]).join('');
  const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ------------------------------------------------------------ Firebase
  function loadScript(src) {
    return new Promise((ok, fail) => {
      if (document.querySelector(`script[src="${src}"]`)) { ok(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => ok();
      s.onerror = () => fail(new Error('не загрузилась библиотека Firebase (' + src.split('/').pop() + '). Проверьте интернет.'));
      document.head.appendChild(s);
    });
  }

  async function firebaseAdapter(cfg) {
    if (!window.firebase || !window.firebase.firestore) {
      for (const n of ['app', 'auth', 'firestore']) await loadScript(`https://www.gstatic.com/firebasejs/${SDK}/firebase-${n}-compat.js`);
    }
    const fb = window.firebase;
    if (!fb.apps.length) fb.initializeApp(cfg);
    const auth = fb.auth();
    auth.languageCode = 'ru';
    const db = fb.firestore();
    try { db.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) { /* уже настроено */ }
    const FV = fb.firestore.FieldValue;
    const conv = data => {
      const out = {};
      Object.entries(data).forEach(([k, v]) => {
        out[k] = v && v.__op === 'union' ? FV.arrayUnion(...v.v) : v && v.__op === 'remove' ? FV.arrayRemove(...v.v) : v;
      });
      return out;
    };
    const snapDoc = s => (s.exists ? Object.assign({ id: s.id }, s.data()) : null);
    const query = (path, o = {}) => {
      let r = db.collection(path);
      if (o.where) r = r.where(o.where[0], o.where[1], o.where[2]);
      if (o.orderBy) r = r.orderBy(o.orderBy[0], o.orderBy[1] || 'asc');
      if (o.limit) r = r.limit(o.limit);
      return r;
    };
    const user = u => (u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Игрок', email: u.email || '' } : null);
    try { await auth.getRedirectResult(); } catch (e) { setTimeout(() => window.App && window.App.toast(Cloud.errorText(e)), 300); }
    return {
      mode: 'firebase',
      newId: coll => db.collection(coll).doc().id,
      get: async p => snapDoc(await db.doc(p).get()),
      query: async (c, o) => (await query(c, o).get()).docs.map(snapDoc),
      batch: async ops => {
        const b = db.batch();
        ops.forEach(x => {
          const r = db.doc(x.path);
          if (x.type === 'set') b.set(r, conv(x.data));
          else if (x.type === 'update') b.update(r, conv(x.data));
          else b.delete(r);
        });
        await b.commit();
      },
      watchDoc: (p, cb, err) => db.doc(p).onSnapshot(s => cb(snapDoc(s)), err),
      watchQuery: (c, o, cb, err) => query(c, o).onSnapshot(qs => cb(qs.docs.map(snapDoc)), err),
      auth: {
        onChange: cb => auth.onAuthStateChanged(u => cb(user(u))),
        current: () => user(auth.currentUser),
        google: async () => {
          const p = new fb.auth.GoogleAuthProvider();
          p.setCustomParameters({ prompt: 'select_account' });
          try { await auth.signInWithPopup(p); } catch (e) {
            if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
            throw e;
          }
        },
        signIn: (email, pw) => auth.signInWithEmailAndPassword(email, pw),
        signUp: async (name, email, pw) => { const c = await auth.createUserWithEmailAndPassword(email, pw); await c.user.updateProfile({ displayName: name }); },
        reset: email => auth.sendPasswordResetEmail(email),
        rename: name => auth.currentUser.updateProfile({ displayName: name }),
        signOut: () => auth.signOut()
      }
    };
  }

  // ------------------------------------------------------------ «облако» в браузере (для проверки)
  function localAdapter() {
    const KEY = 'hero-workshop:cloud-local';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { docs: {}, user: null }; } catch (e) { return { docs: {}, user: null }; } };
    let db = load();
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* noop */ } };
    const watchers = new Set(), authCbs = new Set();
    const uidOf = name => 'u' + Array.from(new TextEncoder().encode(name.trim().toLowerCase())).reduce((h, b) => (h * 31 + b) >>> 0, 7).toString(36);
    const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
    const parent = p => p.split('/').slice(0, -1).join('/');
    const getIn = (o, path) => path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
    const val = p => (db.docs[p] ? Object.assign({ id: p.split('/').pop() }, clean(db.docs[p])) : null);

    function applyUpdate(before, patch) {
      const d = clean(before);
      Object.entries(patch).forEach(([k, v]) => {
        const parts = k.split('.');
        let o = d;
        parts.slice(0, -1).forEach(x => { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; });
        const last = parts[parts.length - 1];
        if (v && v.__op === 'union') { const arr = Array.isArray(o[last]) ? o[last] : []; v.v.forEach(x => { if (!arr.includes(x)) arr.push(x); }); o[last] = arr; }
        else if (v && v.__op === 'remove') o[last] = (Array.isArray(o[last]) ? o[last] : []).filter(x => !v.v.includes(x));
        else o[last] = clean(v);
      });
      return d;
    }

    // копия firestore.rules — чтобы проверка в браузере ловила то же, что запретит настоящий Firebase
    function localRules(kind, path, before, after, uid, docsAfter) {
      const seg = path.split('/');
      const camp = cid => db.docs['campaigns/' + cid];
      const isMember = cid => !!uid && !!camp(cid) && camp(cid).members.includes(uid);
      const isGM = cid => !!uid && !!camp(cid) && camp(cid).gm === uid;
      const keys = () => { const ks = new Set(Object.keys(before || {}).concat(Object.keys(after || {}))); return [...ks].filter(k => JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])); };
      const only = (ks, allowed) => ks.every(k => allowed.includes(k));
      const text = (v, n) => typeof v === 'string' && v.length <= n;
      if (!uid) return false;
      if (seg[0] === 'campaigns' && seg.length === 2) {
        if (kind === 'read') return before.members.includes(uid);
        if (kind === 'create') return after.gm === uid && JSON.stringify(after.members) === JSON.stringify([uid]) && text(after.name, 120);
        if (kind === 'delete') return before.gm === uid;
        const gmEdit = before.gm === uid && after.gm === uid && after.members.includes(uid) && text(after.name, 120);
        const nk = Object.keys(Object.assign({}, before.memberNames, after.memberNames)).filter(k => (before.memberNames || {})[k] !== (after.memberNames || {})[k]);
        const joining = only(keys(), ['members', 'memberNames']) && !before.members.includes(uid) && after.members.includes(uid)
          && after.members.length === before.members.length + 1 && before.members.every(x => after.members.includes(x)) && only(nk, [uid]);
        const renaming = only(keys(), ['memberNames']) && before.members.includes(uid) && only(nk, [uid]);
        const leaving = only(keys(), ['members']) && before.members.includes(uid) && before.gm !== uid
          && JSON.stringify(after.members) === JSON.stringify(before.members.filter(x => x !== uid));
        return gmEdit || joining || renaming || leaving;
      }
      if (seg[0] === 'joinCodes') {
        if (kind === 'read') return true;
        if (kind === 'create') { const c = docsAfter['campaigns/' + after.cid]; return after.gm === uid && !!c && c.gm === uid && c.code === seg[1]; }
        if (kind === 'delete') return before.gm === uid;
        return false;
      }
      const cid = seg[1], sub = seg[2];
      if (sub === 'characters') {
        if (kind === 'read') return isMember(cid);
        if (kind === 'create') return isMember(cid) && after.owner === uid && (isGM(cid) || (['draft', 'review'].includes(after.status) && !('gm' in after)));
        if (kind === 'delete') return isGM(cid) || (before.owner === uid && ['draft', 'review'].includes(before.status));
        const k = keys();
        const ownerEdit = !k.some(x => ['gm', 'owner', 'createdMs'].includes(x))
          && (!k.includes('status') || (['draft', 'review'].includes(before.status) && ['draft', 'review'].includes(after.status)))
          && (!k.includes('state') || ['draft', 'review'].includes(before.status));
        return (isGM(cid) && after.owner === before.owner) || (isMember(cid) && before.owner === uid && ownerEdit);
      }
      if (sub === 'events') {
        if (kind === 'read') return isMember(cid);
        if (kind === 'create') {
          if (!(isMember(cid) && after.by === uid && text(after.text, 2000))) return false;
          if (after.chid === null || after.chid === undefined || isGM(cid)) return true;
          const ch = docsAfter[`campaigns/${cid}/characters/${after.chid}`];
          return !!ch && ch.owner === uid;
        }
        if (kind === 'delete') return isGM(cid);
        return false;
      }
      if (sub === 'sessions') return kind === 'read' ? isMember(cid) : isGM(cid);
      if (sub === 'private') return isGM(cid);
      return false;
    }

    const user = () => db.user;
    function notify() {
      persist();
      setTimeout(() => watchers.forEach(w => { try { w.fire(); } catch (e) { /* noop */ } }), 0);
    }
    function runQuery(c, o = {}) {
      const uid = (user() || {}).uid;
      let rows = Object.keys(db.docs).filter(p => parent(p) === c).map(val);
      if (o.where) {
        const [f, opr, v] = o.where;
        rows = rows.filter(r => { const x = getIn(r, f); return opr === 'array-contains' ? Array.isArray(x) && x.includes(v) : x === v; });
        // запрос по кампаниям разрешён только с фильтром «я участник» — как в Firestore
      }
      rows.forEach(r => { if (!localRules('read', c + '/' + r.id, db.docs[c + '/' + r.id], null, uid, db.docs)) deny(); });
      if (o.orderBy) { const [f, dir] = o.orderBy; rows.sort((a, b) => ((getIn(a, f) > getIn(b, f)) - (getIn(a, f) < getIn(b, f))) * (dir === 'desc' ? -1 : 1)); }
      if (o.limit) rows = rows.slice(0, o.limit);
      return rows;
    }
    function checkRead(p) {
      const uid = (user() || {}).uid;
      const seg = p.split('/');
      // как в Firestore: правило кампании смотрит в сам документ, поэтому нет документа — нет доступа
      if (seg[0] === 'campaigns' && seg.length === 2 && !db.docs[p]) deny();
      if (!localRules('read', p, db.docs[p] || null, null, uid, db.docs)) deny();
    }

    return {
      mode: 'local',
      newId: () => Math.random().toString(36).slice(2, 12) + now().toString(36).slice(-4),
      get: async p => { checkRead(p); return val(p); },
      query: async (c, o) => runQuery(c, o),
      batch: async ops => {
        const uid = (user() || {}).uid;
        const next = Object.assign({}, db.docs);
        const checks = [];
        ops.forEach(x => {
          const before = next[x.path] || null;
          if (x.type === 'set') { next[x.path] = clean(x.data); checks.push([before ? 'update' : 'create', x.path, before, next[x.path]]); }
          else if (x.type === 'update') { if (!before) { const e = new Error('No document to update: ' + x.path); e.code = 'not-found'; throw e; } next[x.path] = applyUpdate(before, x.data); checks.push(['update', x.path, before, next[x.path]]); }
          else { delete next[x.path]; checks.push(['delete', x.path, before, null]); }
        });
        checks.forEach(([kind, p, b, a]) => { if (kind === 'delete' && !b) return; if (!localRules(kind, p, b, a, uid, next)) deny(); });
        db.docs = next;
        notify();
      },
      watchDoc(p, cb, err) {
        const w = { fire: () => { try { checkRead(p); cb(val(p)); } catch (e) { if (err) err(e); } } };
        watchers.add(w); setTimeout(w.fire, 0);
        return () => watchers.delete(w);
      },
      watchQuery(c, o, cb, err) {
        const w = { fire: () => { try { cb(runQuery(c, o)); } catch (e) { if (err) err(e); } } };
        watchers.add(w); setTimeout(w.fire, 0);
        return () => watchers.delete(w);
      },
      auth: {
        onChange: cb => { authCbs.add(cb); setTimeout(() => cb(user()), 0); return () => authCbs.delete(cb); },
        current: () => user(),
        _set(u) { db.user = u; persist(); authCbs.forEach(cb => cb(u)); },
        google() { const name = prompt('Тестовый вход: ваше имя'); if (name) this._set({ uid: uidOf(name), name: name.trim(), email: '' }); return Promise.resolve(); },
        signIn(email) { email = String(email).trim().toLowerCase(); const names = db.names || {}; this._set({ uid: uidOf(email), name: names[email] || email.split('@')[0], email }); return Promise.resolve(); },
        signUp(name, email) { email = String(email).trim().toLowerCase(); db.names = Object.assign(db.names || {}, { [email]: name.trim() }); this._set({ uid: uidOf(email), name: name.trim(), email }); return Promise.resolve(); },
        reset: () => Promise.resolve(),
        rename(name) { db.user.name = name; persist(); return Promise.resolve(); },
        signOut() { this._set(null); return Promise.resolve(); }
      }
    };
  }

  // ------------------------------------------------------------ общая логика
  let A = null;
  const authCbs = new Set();
  const local = /[?&]cloud=local\b/.test(location.search);

  const Cloud = {
    mode: null,
    user: null,
    ready: false,
    error: null,
    camps: {},            // кэш кампаний (для номера текущей сессии в журнале)
    op,

    // настройки из js/firebase-config.js; годится и вставка из Firebase как есть («const firebaseConfig = …»)
    config() {
      let c = window.FIREBASE_CONFIG;
      if (!c) { try { c = typeof firebaseConfig !== 'undefined' ? firebaseConfig : null; } catch (e) { c = null; } }  // eslint-disable-line no-undef
      return c && c.apiKey && c.projectId ? c : null;
    },
    configured() { return local || !!this.config(); },

    init() {
      if (this._init) return this._init;
      this._init = (async () => {
        try {
          if (!this.configured()) return false;
          A = local ? localAdapter() : await firebaseAdapter(this.config());
          this.mode = A.mode;
          await new Promise(ok => {
            let first = true;
            A.auth.onChange(u => {
              this.user = u && this._name ? Object.assign({}, u, { name: this._name }) : u;
              this._name = null;
              if (first) { first = false; ok(); }
              authCbs.forEach(cb => cb(this.user));
            });
          });
          this.ready = true;
          return true;
        } catch (e) {
          this.error = e;
          return false;
        }
      })();
      return this._init;
    },

    onAuth(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
    uid() { return this.user && this.user.uid; },
    name() { return (this.user && this.user.name) || 'Игрок'; },

    // ---- вход
    google() { return A.auth.google(); },
    signIn(email, pw) { return A.auth.signIn(email, pw); },
    async signUp(name, email, pw) { this._name = name; await A.auth.signUp(name, email, pw); this.user = Object.assign({}, A.auth.current() || this.user, { name }); authCbs.forEach(cb => cb(this.user)); },
    reset(email) { return A.auth.reset(email); },
    async rename(name) { await A.auth.rename(name); this.user = Object.assign({}, this.user, { name }); authCbs.forEach(cb => cb(this.user)); },
    signOut() { return A.auth.signOut(); },

    // ---- журнал
    eventOp(cid, chid, chName, text, kind) {
      const c = this.camps[cid];
      return {
        type: 'set', path: `campaigns/${cid}/events/${A.newId(`campaigns/${cid}/events`)}`,
        data: { ms: now(), by: this.uid(), byName: this.name(), chid: chid || null, chName: chName || '', text: String(text).slice(0, 2000), kind: kind || 'note', session: c && c.session && c.session.active ? c.session.n : null }
      };
    },
    note(cid, text, chid, chName) { return A.batch([this.eventOp(cid, chid, chName, text, 'note')]); },

    // ---- кампании
    async myCampaigns() {
      const rows = await A.query('campaigns', { where: ['members', 'array-contains', this.uid()] });
      rows.forEach(c => { this.camps[c.id] = c; });
      return rows.sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
    },
    async createCampaign(name) {
      const cid = A.newId('campaigns'), code = genCode(), uid = this.uid();
      const data = { name: String(name).trim().slice(0, 120), gm: uid, gmName: this.name(), members: [uid], memberNames: { [uid]: this.name() }, code, createdMs: now(), session: { n: 0, active: false }, notes: '' };
      this.camps[cid] = Object.assign({ id: cid }, data);
      await A.batch([
        { type: 'set', path: `campaigns/${cid}`, data },
        { type: 'set', path: `joinCodes/${code}`, data: { cid, gm: uid } }
      ]);
      await A.batch([this.eventOp(cid, null, '', `${this.name()} создаёт кампанию «${data.name}» и становится ГМ`, 'campaign')]);
      return cid;
    },
    async joinCampaign(code) {
      code = normCode(code);
      if (code.length < 4) throw new Error('Введите код приглашения целиком');
      const j = await A.get(`joinCodes/${code}`);
      if (!j) throw new Error('Кампании с таким кодом нет — проверьте код у ГМ');
      try {
        await A.batch([{ type: 'update', path: `campaigns/${j.cid}`, data: { members: op.union([this.uid()]), ['memberNames.' + this.uid()]: this.name() } }]);
      } catch (e) {
        // уже участник? тогда кампания просто откроется
        try { const c = await A.get(`campaigns/${j.cid}`); if (c) return j.cid; } catch (er) { /* нет доступа */ }
        throw e;
      }
      const c = await A.get(`campaigns/${j.cid}`);
      this.camps[j.cid] = c;
      await A.batch([this.eventOp(j.cid, null, '', `${this.name()} присоединяется к кампании`, 'campaign')]);
      return j.cid;
    },
    // имя в игре поменялось — обновить его в списке участников (у ГМ — и подпись ГМ)
    syncName(c) {
      const uid = this.uid(), name = this.name();
      if (!c || !uid || (c.memberNames || {})[uid] === name && (c.gm !== uid || c.gmName === name)) return null;
      const data = { ['memberNames.' + uid]: name };
      if (c.gm === uid) data.gmName = name;
      return A.batch([{ type: 'update', path: `campaigns/${c.id}`, data }]).catch(() => null);
    },
    updateCampaign(cid, patch) { return A.batch([{ type: 'update', path: `campaigns/${cid}`, data: patch }]); },
    async newCode(cid) {
      const c = this.camps[cid], code = genCode();
      await A.batch([
        { type: 'update', path: `campaigns/${cid}`, data: { code } },
        { type: 'set', path: `joinCodes/${code}`, data: { cid, gm: this.uid() } },
        ...(c && c.code ? [{ type: 'delete', path: `joinCodes/${c.code}` }] : [])
      ]);
      if (c) c.code = code;
      return code;
    },
    async removeMember(cid, uid) {
      const c = this.camps[cid];
      await A.batch([{ type: 'update', path: `campaigns/${cid}`, data: { members: op.remove([uid]) } },
        this.eventOp(cid, null, '', `ГМ исключает из кампании: ${(c && c.memberNames && c.memberNames[uid]) || 'игрок'}`, 'campaign')]);
    },
    async leaveCampaign(cid) {
      await A.batch([this.eventOp(cid, null, '', `${this.name()} покидает кампанию`, 'campaign')]);
      await A.batch([{ type: 'update', path: `campaigns/${cid}`, data: { members: op.remove([this.uid()]) } }]);
    },
    async deleteCampaign(cid) {
      const c = (await A.get(`campaigns/${cid}`)) || this.camps[cid];
      for (const sub of ['characters', 'events', 'sessions', 'private']) {
        const rows = await A.query(`campaigns/${cid}/${sub}`, {});
        for (let i = 0; i < rows.length; i += 20) {
          await Promise.all(rows.slice(i, i + 20).map(r => A.batch([{ type: 'delete', path: `campaigns/${cid}/${sub}/${r.id}` }])));
        }
      }
      if (c && c.code) await A.batch([{ type: 'delete', path: `joinCodes/${c.code}` }]);
      await A.batch([{ type: 'delete', path: `campaigns/${cid}` }]);
      delete this.camps[cid];
    },

    // ---- сессии
    async startSession(cid) {
      const c = this.camps[cid], n = ((c && c.session && c.session.n) || 0) + 1;
      if (c) c.session = { n, active: true, startedMs: now() };
      await A.batch([
        { type: 'set', path: `campaigns/${cid}/sessions/${n}`, data: { n, startedMs: now(), endedMs: null, notes: '' } },
        { type: 'update', path: `campaigns/${cid}`, data: { session: { n, active: true, startedMs: now() } } },
        this.eventOp(cid, null, '', `Начинается сессия ${n}`, 'session')
      ]);
    },
    async endSession(cid, notes) {
      const c = this.camps[cid], n = c.session.n;
      const ev = this.eventOp(cid, null, '', `Сессия ${n} завершена`, 'session');
      c.session = Object.assign({}, c.session, { active: false });
      await A.batch([
        ev,
        { type: 'update', path: `campaigns/${cid}/sessions/${n}`, data: Object.assign({ endedMs: now() }, typeof notes === 'string' ? { notes } : {}) },
        { type: 'update', path: `campaigns/${cid}`, data: { session: { n, active: false, endedMs: now() } } }
      ]);
    },
    async resumeSession(cid) {
      const c = this.camps[cid], n = c.session.n;
      c.session = { n, active: true, startedMs: now() };
      await A.batch([
        { type: 'update', path: `campaigns/${cid}/sessions/${n}`, data: { endedMs: null } },
        { type: 'update', path: `campaigns/${cid}`, data: { session: { n, active: true, startedMs: now() } } },
        this.eventOp(cid, null, '', `Сессия ${n} продолжается`, 'session')
      ]);
    },
    saveSessionNotes(cid, n, notes) { return A.batch([{ type: 'update', path: `campaigns/${cid}/sessions/${n}`, data: { notes } }]); },
    savePrivate(cid, pid, text) { return A.batch([{ type: 'set', path: `campaigns/${cid}/private/${pid}`, data: { text, ms: now() } }]); },

    // ---- персонажи
    summary(state) {
      const R = window.Rules, res = R.compute(window.App.migrate(clean(state)));
      return { name: (state.name || '').trim() || 'Безымянный герой', raceId: state.raceId || '', raceName: res.race ? res.race.name : '', level: res.race ? res.level : 0, ok: res.ok };
    },
    async createCharacter(cid, state, status, extra) {
      const chid = A.newId(`campaigns/${cid}/characters`);
      const s = this.summary(state);
      const data = Object.assign({
        owner: this.uid(), ownerName: this.name(), name: s.name, raceId: s.raceId, level: s.level, status,
        state: clean(state), prog: { alloc: { t: 0, d: 0, s: 0, i: 0, l: 0 }, talents: {} }, notes: '',
        createdMs: now(), updatedMs: now(), updatedBy: this.name()
      }, extra || {});
      await A.batch([
        { type: 'set', path: `campaigns/${cid}/characters/${chid}`, data },
        this.eventOp(cid, chid, s.name, `${this.name()} создаёт персонажа «${s.name}»${s.raceName ? ` (${s.raceName}, ур. ${s.level})` : ''}${status === 'review' ? ' и отправляет ГМ на проверку' : ' — черновик'}`, 'create')
      ]);
      return chid;
    },
    async updateCharacter(cid, chid, patch, text, chName) {
      const data = Object.assign({}, clean(patch), { updatedMs: now(), updatedBy: this.name() });
      const ops = [{ type: 'update', path: `campaigns/${cid}/characters/${chid}`, data }];
      if (text) ops.push(this.eventOp(cid, chid, chName || patch.name || '', text, 'dev'));
      await A.batch(ops);
    },
    async deleteCharacter(cid, chid, name) {
      await A.batch([
        { type: 'delete', path: `campaigns/${cid}/characters/${chid}` },
        this.eventOp(cid, null, name, `${this.name()} удаляет персонажа «${name}»`, 'delete')
      ]);
    },

    // ---- подписки (обновления приходят сами)
    watchMyCampaigns(cb, err) {
      return A.watchQuery('campaigns', { where: ['members', 'array-contains', this.uid()] }, rows => {
        rows.forEach(c => { this.camps[c.id] = c; });
        cb(rows.sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0)));
      }, err);
    },
    watchCampaign(cid, cb, err) { return A.watchDoc(`campaigns/${cid}`, c => { if (c) this.camps[cid] = c; cb(c); }, err); },
    watchCharacters(cid, cb, err) { return A.watchQuery(`campaigns/${cid}/characters`, {}, cb, err); },
    watchCharacter(cid, chid, cb, err) { return A.watchDoc(`campaigns/${cid}/characters/${chid}`, cb, err); },
    watchEvents(cid, cb, err, o) {
      const q = o && o.chid ? { where: ['chid', '==', o.chid] } : o && o.session ? { where: ['session', '==', o.session] } : { orderBy: ['ms', 'desc'], limit: (o && o.limit) || 60 };
      return A.watchQuery(`campaigns/${cid}/events`, q, rows => cb(rows.sort((a, b) => (b.ms || 0) - (a.ms || 0))), err);
    },
    watchSessions(cid, cb, err) { return A.watchQuery(`campaigns/${cid}/sessions`, { orderBy: ['n', 'desc'], limit: 50 }, cb, err); },
    watchPrivate(cid, pid, cb, err) { return A.watchDoc(`campaigns/${cid}/private/${pid}`, cb, err); },

    // понятные сообщения вместо кодов Firebase
    errorText(e) {
      const code = (e && e.code) || '';
      const map = {
        'auth/invalid-credential': 'Неверная почта или пароль.',
        'auth/invalid-login-credentials': 'Неверная почта или пароль.',
        'auth/wrong-password': 'Неверный пароль.',
        'auth/user-not-found': 'Такой почты нет — зарегистрируйтесь.',
        'auth/email-already-in-use': 'Эта почта уже зарегистрирована — войдите или восстановите пароль.',
        'auth/weak-password': 'Пароль слишком простой — нужно хотя бы 6 символов.',
        'auth/invalid-email': 'Почта записана с ошибкой.',
        'auth/missing-password': 'Введите пароль.',
        'auth/too-many-requests': 'Слишком много попыток — подождите пару минут.',
        'auth/popup-closed-by-user': 'Окно входа закрыто.',
        'auth/cancelled-popup-request': 'Окно входа закрыто.',
        'auth/popup-blocked': 'Браузер заблокировал окно входа — разрешите всплывающие окна для сайта.',
        'auth/unauthorized-domain': `Этот адрес сайта (${location.hostname}) не добавлен в Firebase: Authentication → Settings → Authorized domains.`,
        'auth/operation-not-allowed': 'Этот способ входа не включён в Firebase: Authentication → Sign-in method.',
        'auth/network-request-failed': 'Нет связи с сервером входа — проверьте интернет.',
        'permission-denied': 'Нет доступа: вы не участник этой кампании или действие доступно только ГМ.',
        'unavailable': 'Сервер недоступен — проверьте интернет; изменения отправятся, когда связь вернётся.',
        'not-found': 'Запись не найдена — возможно, её удалили.',
        'failed-precondition': 'База ещё не готова (проверьте, что Firestore создан).'
      };
      return map[code] || (e && e.message ? e.message.replace(/^Firebase:\s*/, '') : String(e));
    }
  };

  Cloud.genCode = genCode;
  Cloud.normCode = normCode;
  window.Cloud = Cloud;
})();
