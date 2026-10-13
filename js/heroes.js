/* «Мои герои»: сохранения в браузере, импорт и экспорт */
(function () {
  'use strict';
  const App = window.App, R = window.Rules;
  const esc = App.esc, cap = App.cap, fmt = R.fmt;
  const KEY = 'hero-workshop:heroes';

  const list = () => App.store.get(KEY, []);
  const write = l => { if (!App.store.set(KEY, l)) App.toast('Не удалось сохранить: хранилище браузера недоступно'); };

  function render(el) {
    const heroes = list();
    const q = R.norm(App.ui.heroQ || '');
    const rows = heroes.filter(h => !q || R.norm(h.state.name).includes(q) || R.norm(h.state.raceId).includes(q))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    el.innerHTML = `<div class="page">
      <div class="page-head"><h1>Мои герои</h1>
        <div class="row-actions">
          <button type="button" class="btn primary" data-act="newHero">Создать персонажа</button>
          <button type="button" class="btn" data-act="importHero">Загрузить файл</button>
          ${heroes.length ? '<button type="button" class="btn" data-act="exportAll">Скачать всех</button>' : ''}
        </div></div>
      <p class="muted">Персонажи хранятся только в этом браузере. Чтобы перенести их или показать ГМ, скачайте файл или отправьте ссылку с листа персонажа.</p>
      ${heroes.length > 4 ? `<input type="search" data-ui="heroQ" data-ui-target="heroes" value="${esc(App.ui.heroQ || '')}" placeholder="Поиск по имени или расе" aria-label="Поиск героя">` : ''}
      ${rows.length ? `<ul class="hero-list">${rows.map(h => {
        const res = R.compute(App.migrate(h.state));
        const race = res.race;
        return `<li class="hero ${res.ok ? 'ok' : 'bad'}">
          <div class="hero-main"><h2>${esc(h.state.name || 'Безымянный герой')}</h2>
            <p>${race ? esc(cap(race.name)) : 'раса не выбрана'}${res.age ? ', ' + esc(res.age.title.toLowerCase()) : ''}${race ? `, ур. ${fmt(res.level)}` : ''}</p>
            <p class="small ${res.ok ? 'good-text' : 'bad-text'}">${res.ok ? 'собран по правилам' : `ошибок: ${res.errors.length}`}${h.savedAt ? `, сохранён ${new Date(h.savedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</p></div>
          <div class="hero-act">
            <button type="button" class="btn" data-act="openHero" data-id="${h.id}">Открыть</button>
            <button type="button" class="btn ghost" data-act="copyHero" data-id="${h.id}">Копия</button>
            <button type="button" class="btn ghost danger" data-act="deleteHero" data-id="${h.id}">Удалить</button>
          </div></li>`;
      }).join('')}</ul>` : `<div class="card empty">${heroes.length ? 'Никого не найдено.' : 'Сохранённых персонажей пока нет. Соберите героя в мастере и нажмите «Сохранить» на последнем шаге.'}</div>`}
      ${heroes.length >= 2 ? compare(heroes) : ''}
    </div>`;
  }

  function compare(heroes) {
    const a = heroes.find(h => h.id === App.ui.cmpA) || heroes[0];
    const b = heroes.find(h => h.id === App.ui.cmpB) || heroes[1];
    const opt = sel => heroes.map(h => `<option value="${h.id}" ${h.id === sel.id ? 'selected' : ''}>${esc(h.state.name || 'Безымянный герой')}</option>`).join('');
    const ra = R.compute(App.migrate(a.state)), rb = R.compute(App.migrate(b.state));
    const rows = [
      ['Раса', x => x.race ? cap(x.race.name) : '—', null],
      ['Уровень', x => x.level, 1],
      ...R.STATS.map(k => [R.STAT_NAMES[k], x => x.stats[k], 1]),
      ['ХП', x => x.der.hp, 1], ['МП', x => x.der.mp, 1], ['Пси', x => x.der.psi, 1],
      ['Реген ХП', x => x.der.hpRegen, 1], ['Реген МП', x => x.der.mpRegen, 1],
      ['ОД', x => x.der.od, 1, true], ['Уворот', x => x.der.dodge, 1], ['Зоркость', x => x.der.zor, 1],
      ['Харизма', x => x.der.charisma, 1], ['Привлекательность', x => x.der.attr, 1, true],
      ['Урон оружия', x => x.gear.weapon ? x.gear.weapon.damageTotal : 0, 1],
      ['Броня', x => x.gear.armor && x.gear.armor.armor !== undefined ? x.gear.armor.armor : 0, 1]
    ];
    const cell = (v, o, num, sg) => {
      if (!num || typeof v !== 'number') return `<td>${esc(v)}</td>`;
      const cls = v > o ? 'cmp-win' : v < o ? 'cmp-lose' : '';
      return `<td class="${cls}">${sg ? R.signed(v) : fmt(v)}</td>`;
    };
    return `<section class="compare"><h2>Сравнение</h2>
      <div class="form-grid"><label>Первый <select data-ui="cmpA" data-ui-target="heroes">${opt(a)}</select></label><label>Второй <select data-ui="cmpB" data-ui-target="heroes">${opt(b)}</select></label></div>
      <div class="tbl-wrap"><table class="tbl cmp"><thead><tr><th>Параметр</th><th>${esc(a.state.name || 'Безымянный герой')}</th><th>${esc(b.state.name || 'Безымянный герой')}</th></tr></thead>
      <tbody>${rows.map(([t, f, num, sg]) => { const va = f(ra), vb = f(rb); return `<tr><th>${t}</th>${cell(va, vb, num, sg)}${cell(vb, va, num, sg)}</tr>`; }).join('')}</tbody></table></div></section>`;
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data.heroes) ? data.heroes.map(h => h.state || h) : data.hero ? [data.hero] : data.raceId !== undefined ? [data] : [];
        if (!arr.length) throw new Error('empty');
        const l = list();
        arr.forEach(s => l.push({ id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: Date.now(), state: App.migrate(s) }));
        write(l);
        App.toast(`Загружено персонажей: ${arr.length}`);
        if (App.tab === 'heroes') render(document.getElementById('tab-heroes'));
        else location.hash = '#heroes';
      } catch (e) {
        App.toast('Файл не похож на сохранение персонажа');
      }
      document.getElementById('importFile').value = '';
    };
    reader.readAsText(file);
  }

  Object.assign(App.actions, {
    saveHero() {
      const l = list();
      const now = Date.now();
      if (App.editingId && l.some(h => h.id === App.editingId)) {
        const h = l.find(x => x.id === App.editingId);
        h.state = JSON.parse(JSON.stringify(App.state)); h.savedAt = now;
      } else {
        App.editingId = 'h' + now.toString(36) + Math.random().toString(36).slice(2, 6);
        l.push({ id: App.editingId, savedAt: now, state: JSON.parse(JSON.stringify(App.state)) });
      }
      write(l);
      App.save();
      App.toast(`«${App.state.name || 'Безымянный герой'}» сохранён`);
      App.renderCreate();
    },
    newHero() { if (confirm('Начать нового персонажа? Несохранённый черновик будет очищен.')) { App.state = R.newState(); App.editingId = null; App.save(); location.hash = '#create/race'; } },
    importHero() { document.getElementById('importFile').click(); },
    exportAll() { App.download('мои-герои.json', JSON.stringify({ format: 'hero-workshop', version: 2, heroes: list() }, null, 2)); },
    openHero(b) {
      const h = list().find(x => x.id === b.dataset.id);
      if (!h) return;
      App.state = App.migrate(JSON.parse(JSON.stringify(h.state)));
      App.editingId = h.id;
      App.save();
      location.hash = '#create/summary';
    },
    copyHero(b) {
      const l = list();
      const h = l.find(x => x.id === b.dataset.id);
      if (!h) return;
      const copy = JSON.parse(JSON.stringify(h));
      copy.id = 'h' + Date.now().toString(36);
      copy.savedAt = Date.now();
      copy.state.name = (copy.state.name || 'Герой') + ' (копия)';
      l.push(copy);
      write(l);
      render(document.getElementById('tab-heroes'));
    },
    deleteHero(b) {
      const l = list();
      const h = l.find(x => x.id === b.dataset.id);
      if (!h || !confirm(`Удалить «${h.state.name || 'Безымянный герой'}»? Это нельзя отменить.`)) return;
      write(l.filter(x => x.id !== h.id));
      if (App.editingId === h.id) { App.editingId = null; App.save(); }
      render(document.getElementById('tab-heroes'));
    }
  });

  window.Heroes = { render, importFile };
})();
