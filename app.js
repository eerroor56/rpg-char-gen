// app.js
const app = {
    step: 1,
    char: { name: "", race: "", parent1: "", parent2: "", age: "", faction: "", skill: "", activeSkill: "", gift: "", traits: [], backstory: "" },
    stats: { body: 0, spirit: 0, str: 0, int: 0, agi: 0, lvl: 0, od: 3 },
    savedChars: JSON.parse(localStorage.getItem('rpgChars')) || [],
    isCurrentSaved: false,

    escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    },

    init() {
        this.populateDropdowns();
        this.updateData();
        this.renderSavedList();
        this.renderManual();
        this.checkOnboarding();
        this.renderWizard();
    },

    showToast(msg) {
        const toast = document.getElementById("toast");
        toast.innerText = msg;
        toast.className = "toast show";
        setTimeout(() => { toast.className = toast.className.replace("toast show", "toast"); }, 2800);
    },

    saveCurrentCharacter() {
        if (!this.char.name) { alert("Имя персонажа обязательно!"); return; }
        if (this.isCurrentSaved) return;

        const newChar = { id: Date.now(), data: { ...this.char }, stats: { ...this.stats } };
        this.savedChars.push(newChar);
        localStorage.setItem('rpgChars', JSON.stringify(this.savedChars));
        this.renderSavedList();
        
        const saveBtn = document.getElementById('btn-save-char');
        if (saveBtn) {
            saveBtn.innerHTML = "✓ Сохранено";
            saveBtn.classList.add('saved');
        }
        
        this.isCurrentSaved = true;
        this.showToast(`Персонаж ${this.char.name} успешно сохранён!`);
    },

    resetAndCreateNew() {
        if (confirm("Создать нового героя? Несохраненный прогресс будет потерян.")) {
            this.resetWizard();
            this.switchTab('wizard');
        }
    },

    manualReset() {
        if (confirm("Вы уверены, что хотите сбросить текущего персонажа и начать заново?")) {
            this.resetWizard();
        }
    },

    resetWizard() {
        this.char = { name: "", race: "", parent1: "", parent2: "", age: "", faction: "", skill: "", activeSkill: "", gift: "", traits: [], backstory: "" };
        
        document.getElementById('char-name').value = "";
        document.getElementById('backstory').value = "";
        document.getElementById('race-select').value = "";
        document.getElementById('parent1-select').value = "";
        document.getElementById('parent2-select').value = "";
        document.getElementById('age-select').value = "";
        document.getElementById('faction-select').value = "";
        document.getElementById('skill-select').value = "";
        document.getElementById('active-skill-select').value = "";
        document.getElementById('gift-select').value = "";

        document.querySelectorAll('#traits-container input').forEach(cb => cb.checked = false);
        document.getElementById('halfblood-container').style.display = 'none';

        this.updateInfoCard('race-info', null, "Укажите расу для отображения бонусов");
        this.updateInfoCard('age-info', null, "Укажите возраст");
        this.updateInfoCard('faction-info', null, "Укажите гильдию или церковь");
        this.updateInfoCard('skill-info', null, "Выберите ремесло или талант");
        this.updateInfoCard('active-skill-info', null, "Выберите боевой приём");
        this.updateInfoCard('gift-info', null, "Сделайте выбор, чтобы узнать силу Дара");
        document.getElementById('traits-limit').innerText = "Сначала выберите возраст, затем положительную и отрицательную черту.";

        this.isCurrentSaved = false;
        const saveBtn = document.getElementById('btn-save-char');
        if (saveBtn) {
            saveBtn.innerHTML = "💾 Сохранить";
            saveBtn.classList.remove('saved');
        }

        this.calculateStats();
        this.step = 1;
        this.renderWizard();
    },

    checkOnboarding() {
        if (!localStorage.getItem('rpgOnboardingClosed')) this.openOnboarding();
    },
    openOnboarding() { document.getElementById('onboarding-modal').classList.add('open'); },
    closeOnboarding() {
        if (document.getElementById('dont-show-again').checked) localStorage.setItem('rpgOnboardingClosed', 'true');
        document.getElementById('onboarding-modal').classList.remove('open');
    },

    switchTab(tabId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        if (tabId === 'sheet') this.renderSheet();
        if (tabId === 'compare') this.populateCompareSelectors();
    },
    
    toggleSession() { document.getElementById('session-manager').classList.toggle('open'); },

    goToStep(n) {
        if (n > this.step) {
            for (let i = this.step; i < n; i++) {
                let error = this.validateStep(i);
                if (error !== true) { alert(error); return; }
            }
        }
        this.step = n;
        this.renderWizard();
    },

    nextStep() {
        let error = this.validateStep(this.step);
        if (error !== true) { alert(error); return; }
        if (this.step < 5) { this.step++; this.renderWizard(); } 
        else { this.switchTab('sheet'); }
    },
    prevStep() { if (this.step > 1) { this.step--; this.renderWizard(); } },

    validateStep(s) {
        if (s === 1) {
            if (!this.char.race) return "Пожалуйста, выберите расу!";
            if (this.char.race === 'Полукровка' && (!this.char.parent1 || !this.char.parent2)) return "Укажите обе родительские расы!";
        }
        if (s === 2 && !this.char.age) return "Пожалуйста, выберите возраст персонажа!";
        if (s === 3 && !this.char.name.trim()) return "Укажите имя персонажа!";
        if (s === 4 && (!this.char.gift || !this.char.skill)) return "Выберите Тёмный Дар и Навык!";
        if (s === 5) {
            const counts = this.getTraitCounts();
            const ageData = rpgData.ages.find(a => a.name === this.char.age);
            if (counts.pos > (ageData?.maxTraits ?? 0) || counts.neg > (ageData?.maxTraits ?? 0)) {
                return `Для возраста «${this.char.age || 'не выбран'}» допустимо не более ${ageData?.maxTraits ?? 0} положительных и ${ageData?.maxTraits ?? 0} отрицательных черт.`;
            }
            if (counts.neg > counts.pos) {
                return "У вас осталась отрицательная черта без пары. Снимите её или сначала выберите положительную черту.";
            }
            if (counts.pos > counts.neg + counts.extraPositives) {
                return "Завершите выбор черт: положительные должны быть уравновешены отрицательными. Некоторые отрицательные черты дают дополнительные положительные выборы.";
            }
        }
        return true;
    },

    renderWizard() {
        document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`step-${this.step}`).classList.add('active');
        
        document.querySelectorAll('.step-indicator').forEach((ind, i) => {
            let stepNum = i + 1;
            ind.classList.remove('active', 'completed');
            if (stepNum === this.step) ind.classList.add('active');
            else if (stepNum < this.step) ind.classList.add('completed');
        });

        document.getElementById('prev-btn').disabled = (this.step === 1);
        document.getElementById('next-btn').innerText = this.step === 5 ? "Завершить ➡" : "Далее ➡";
    },

    populateDropdowns() {
        const fill = (id, arr, defaultText) => {
            const select = document.getElementById(id);
            select.innerHTML = `<option value="" disabled selected hidden>-- ${this.escapeHTML(defaultText)} --</option>` +
                arr.map(item => `<option value="${this.escapeHTML(item.name)}">${this.escapeHTML(item.name)}</option>`).join('');
        };
        fill('race-select', rpgData.races, 'Выберите расу');
        fill('parent1-select', rpgData.races.filter(r => r.name !== 'Полукровка'), 'Раса Отца');
        fill('parent2-select', rpgData.races.filter(r => r.name !== 'Полукровка'), 'Раса Матери');
        fill('age-select', rpgData.ages, 'Выберите возраст');
        fill('faction-select', rpgData.factions, 'Принадлежность (Опционально)');
        fill('skill-select', rpgData.skills, 'Выберите пассивный навык');
        fill('active-skill-select', rpgData.active_skills, 'Выберите боевой навык');
        fill('gift-select', rpgData.gifts, 'Выберите Тёмный Дар');

        const traitMarkup = (type, title, description) => {
            const items = rpgData.traits.filter(t => t.type === type);
            const colorClass = type === 'pos' ? 'trait-pos' : 'trait-neg';
            const typeLabel = type === 'pos' ? 'Положительная' : 'Отрицательная';
            const list = items.map(t => `
                <label class="${colorClass}">
                    <input type="checkbox" value="${this.escapeHTML(t.name)}" onchange="app.onTraitChange(this)" aria-label="${this.escapeHTML(t.name)}">
                    <span><strong>${this.escapeHTML(t.name)}</strong><small>${typeLabel}</small><span class="trait-effect">${this.escapeHTML(t.effect || 'Эффект не указан')}</span></span>
                </label>`).join('');
            return `<section class="trait-group ${colorClass}-group"><h3>${title}</h3><p>${description}</p><div class="trait-options">${list}</div></section>`;
        };
        document.getElementById('traits-container').innerHTML =
            traitMarkup('pos', '1. Положительные черты', 'Начните с положительной черты.') +
            traitMarkup('neg', '2. Отрицательные черты', 'После положительной выберите отрицательную черту для баланса.');
        this.updateTraitsGuidance();
    },

    updateInfoCard(id, contentHTML, defaultText = "") {
        const el = document.getElementById(id);
        if (contentHTML) { el.innerHTML = contentHTML; el.classList.remove('empty'); } 
        else { el.innerHTML = defaultText; el.classList.add('empty'); }
    },

    updateRace() {
        const race = document.getElementById('race-select').value;
        const hbCont = document.getElementById('halfblood-container');
        hbCont.style.display = (race === 'Полукровка') ? 'block' : 'none';
        
        const rData = rpgData.races.find(r => r.name === race);
        if(rData) this.updateInfoCard('race-info', `<strong>Бонус:</strong> ${rData.bonus}<br><strong>Штраф:</strong> ${rData.penalty}`);
        this.updateData();
    },

    updateHalfblood() { this.updateData(); },

    updateAge() {
        const age = document.getElementById('age-select').value;
        const aData = rpgData.ages.find(a => a.name === age);
        if (aData) {
            this.updateInfoCard('age-info', `<strong>Бафф:</strong> ${this.escapeHTML(aData.buffs)}<br><strong>Условие:</strong> ${this.escapeHTML(aData.constraints)}`);
        } else {
            this.updateInfoCard('age-info', null, 'Укажите возраст');
        }
        this.updateData();
        this.updateTraitsGuidance();
    },

    updateData() {
        this.char.race = document.getElementById('race-select').value;
        this.char.parent1 = document.getElementById('parent1-select').value;
        this.char.parent2 = document.getElementById('parent2-select').value;
        this.char.age = document.getElementById('age-select').value;
        this.char.faction = document.getElementById('faction-select').value;
        this.char.gift = document.getElementById('gift-select').value;
        this.char.name = document.getElementById('char-name').value;
        this.char.backstory = document.getElementById('backstory').value;
        this.char.skill = document.getElementById('skill-select').value;
        this.char.activeSkill = document.getElementById('active-skill-select').value;
        this.char.traits = Array.from(document.querySelectorAll('#traits-container input[type="checkbox"]:checked')).map(cb => cb.value);

        const fData = rpgData.factions.find(f => f.name === this.char.faction);
        if (fData) this.updateInfoCard('faction-info', `<strong>Тип:</strong> ${this.escapeHTML(fData.type)}<br><strong>Бонус:</strong> ${this.escapeHTML(fData.effect)}`);
        else this.updateInfoCard('faction-info', null, 'Укажите гильдию или церковь');

        const sData = rpgData.skills.find(s => s.name === this.char.skill);
        if (sData) this.updateInfoCard('skill-info', `<strong>Эффект:</strong> ${this.escapeHTML(sData.effect)}<br><strong>Требования:</strong> ${this.escapeHTML(sData.req)}`);
        else this.updateInfoCard('skill-info', null, 'Выберите ремесло или талант');

        const asData = rpgData.active_skills.find(s => s.name === this.char.activeSkill);
        if (asData) this.updateInfoCard('active-skill-info', `<strong>Эффект:</strong> ${this.escapeHTML(asData.effect)}<br><strong>КД:</strong> ${this.escapeHTML(asData.cooldown)} | <strong>Требования:</strong> ${this.escapeHTML(asData.req)}`);
        else this.updateInfoCard('active-skill-info', null, 'Выберите боевой приём');

        const gData = rpgData.gifts.find(g => g.name === this.char.gift);
        if (gData) this.updateInfoCard('gift-info', `<strong>Дар:</strong> ${this.escapeHTML(gData.bonus)}<br><strong>Проклятье:</strong> ${this.escapeHTML(gData.debuff)}`);
        else this.updateInfoCard('gift-info', null, 'Сделайте выбор, чтобы узнать силу Дара');

        const rData = rpgData.races.find(r => r.name === this.char.race);
        if (rData) this.updateInfoCard('race-info', `<strong>Бонус:</strong> ${this.escapeHTML(rData.bonus)}<br><strong>Штраф:</strong> ${this.escapeHTML(rData.penalty)}`);
        else this.updateInfoCard('race-info', null, 'Укажите расу для отображения бонусов');

        this.updateTraitsGuidance();
        this.calculateStats();
    },

    getTraitCounts() {
        const selected = Array.from(document.querySelectorAll('#traits-container input[type="checkbox"]:checked'));
        const counts = { pos: 0, neg: 0, extraPositives: 0 };
        selected.forEach(cb => {
            const trait = rpgData.traits.find(t => t.name === cb.value);
            if (!trait) return;
            if (trait.type === 'neg') {
                counts.neg += 1;
                counts.extraPositives += Number(trait.extraPositives || 0);
            } else {
                counts.pos += 1;
            }
        });
        return counts;
    },

    onTraitChange(checkbox) {
        if (!checkbox) return;
        const ageData = rpgData.ages.find(a => a.name === document.getElementById('age-select').value);
        if (!ageData) {
            checkbox.checked = false;
            this.updateTraitsGuidance();
            this.showToast('Сначала выберите возраст персонажа.');
            return;
        }

        const counts = this.getTraitCounts();
        if (checkbox.checked) {
            if (ageData.maxTraits === 0) {
                checkbox.checked = false;
                this.showToast('Для выбранного возраста черты недоступны.');
            } else if (counts.pos > ageData.maxTraits || counts.neg > ageData.maxTraits) {
                checkbox.checked = false;
                this.showToast(`Лимит возраста: до ${ageData.maxTraits} положительных и ${ageData.maxTraits} отрицательных черт.`);
            } else if (checkbox.closest('.trait-neg-group') && counts.neg > counts.pos) {
                checkbox.checked = false;
                this.showToast('Сначала выберите положительную черту, затем отрицательную.');
            } else if (checkbox.closest('.trait-pos-group') && !(counts.pos <= counts.neg + counts.extraPositives || counts.pos === counts.neg + 1)) {
                checkbox.checked = false;
                this.showToast('Сначала уравновесьте предыдущую положительную черту отрицательной.');
            }
        }

        this.updateData();
    },

    updateTraitsGuidance() {
        const target = document.getElementById('traits-limit');
        if (!target) return;
        const age = document.getElementById('age-select')?.value || '';
        const ageData = rpgData.ages.find(a => a.name === age);
        const counts = this.getTraitCounts();
        if (!ageData) {
            target.innerText = 'Сначала выберите возраст. Затем выберите положительную черту и уравновесьте её отрицательной.';
            return;
        }
        const max = ageData.maxTraits;
        const outstanding = Math.max(0, counts.pos - counts.neg - counts.extraPositives);
        const bonus = counts.extraPositives ? ` Дополнительные положительные выборы от выбранных черт: +${counts.extraPositives}.` : '';
        const balance = counts.neg > counts.pos
            ? ' Снимите лишнюю отрицательную черту или выберите положительную.'
            : outstanding > 0
                ? ` Нужно выбрать ещё ${outstanding} отрицательную(ые) черту(ы).`
                : ' Баланс черт соблюдён.';
        target.innerText = `Лимит возраста: до ${max} положительных и ${max} отрицательных черт. Выбрано: +${counts.pos} / −${counts.neg}.${balance}${bonus}`;
    },

    calculateStats() {
        let baseBody = 0, baseSpirit = 0, baseStr = 0, baseInt = 0, baseAgi = 0, baseLvl = 0;
        
        if (this.char.race === 'Полукровка' && this.char.parent1 && this.char.parent2) {
            const p1 = rpgData.races.find(r => r.name === this.char.parent1);
            const p2 = rpgData.races.find(r => r.name === this.char.parent2);
            if(p1 && p2) {
                baseBody = (p1.body + p2.body) / 2; baseSpirit = (p1.spirit + p2.spirit) / 2;
                baseStr = (p1.strength + p2.strength) / 2; baseInt = (p1.intellect + p2.intellect) / 2;
                baseAgi = (p1.agility + p2.agility) / 2; baseLvl = (p1.baseLvl + p2.baseLvl) / 2;
            }
        } else {
            const rData = rpgData.races.find(r => r.name === this.char.race);
            if(rData) {
                baseBody = rData.body; baseSpirit = rData.spirit; baseStr = rData.strength;
                baseInt = rData.intellect; baseAgi = rData.agility; baseLvl = rData.baseLvl;
            }
        }

        const fData = rpgData.factions.find(f => f.name === this.char.faction);
        if (fData && fData.mods) {
            const applyMod = (base, mod) => {
                if (!mod) return base;
                if (mod.op === 'add') return base + mod.val;
                if (mod.op === 'sub') return base - mod.val;
                if (mod.op === 'mul') return base * mod.val;
                return base;
            };
            baseBody = applyMod(baseBody, fData.mods.body);
            baseSpirit = applyMod(baseSpirit, fData.mods.spirit);
            baseStr = applyMod(baseStr, fData.mods.strength);
            baseInt = applyMod(baseInt, fData.mods.intellect);
            baseAgi = applyMod(baseAgi, fData.mods.agility);
        }

        const aData = rpgData.ages.find(a => a.name === this.char.age);
        let od = this.char.race ? (3 + (aData ? aData.odOffset : 0)) : 0;
        let lvl = baseLvl * (aData ? aData.lvlMod : 1);

        const newStats = { body: baseBody, spirit: baseSpirit, str: baseStr, int: baseInt, agi: baseAgi, lvl: lvl.toFixed(1), od: od };

        this.triggerPulseIfChanged('s-body', this.stats.body, newStats.body);
        this.triggerPulseIfChanged('s-spirit', this.stats.spirit, newStats.spirit);
        this.triggerPulseIfChanged('s-str', this.stats.str, newStats.str);
        this.triggerPulseIfChanged('s-od', this.stats.od, newStats.od);

        this.stats = newStats;
    },

    triggerPulseIfChanged(id, oldVal, newVal) {
        const el = document.getElementById(id);
        el.innerText = newVal;
        if (oldVal !== newVal) {
            el.classList.remove('pulse-anim');
            void el.offsetWidth; 
            el.classList.add('pulse-anim');
        }
    },

    renderManual() {
        const tbody = document.querySelector('#manual-table tbody');
        if (!tbody) return;
        let currentCategory = '';
        const rows = [];
        rpgData.materials.forEach(m => {
            const category = m.category || 'Основные материалы';
            if (category !== currentCategory) {
                currentCategory = category;
                rows.push(`<tr class="material-category-row" data-category-row="${this.escapeHTML(category)}"><th colspan="10">${this.escapeHTML(category)}</th></tr>`);
            }
            const values = [m.name, m.dmg, m.armor, m.weap_effect, m.armor_effect, m.ring_effect, m.source, m.price, m.skill_level, m.notes];
            const searchText = values.join(' ').toLocaleLowerCase('ru-RU');
            rows.push(`<tr data-material-row="true" data-category="${this.escapeHTML(category)}" data-search="${this.escapeHTML(searchText)}">` +
                values.map((value, index) => `<td${index === 0 ? ' class="gold-text material-name"' : ''}>${this.escapeHTML(value || '—')}</td>`).join('') +
                '</tr>');
        });
        tbody.innerHTML = rows.join('');
        const traitsBody = document.querySelector('#traits-table tbody');
        if (traitsBody) {
            const traits = [...rpgData.traits.filter(t => t.type === 'pos'), ...rpgData.traits.filter(t => t.type === 'neg')];
            traitsBody.innerHTML = traits.map(t => `
                <tr>
                    <td class="${t.type === 'pos' ? 'trait-manual-pos' : 'trait-manual-neg'}">${t.type === 'pos' ? 'Положительная' : 'Отрицательная'}</td>
                    <td class="material-name">${this.escapeHTML(t.name)}</td>
                    <td class="manual-effect">${this.escapeHTML(t.effect || 'Эффект не указан')}</td>
                </tr>`).join('');
        }
        const count = document.getElementById('materials-count');
        if (count) count.innerText = `Материалов в справочнике: ${rpgData.materials.length}.`;
    },

    filterManual(query) {
        const normalized = String(query || '').trim().toLocaleLowerCase('ru-RU');
        const body = document.querySelector('#manual-table tbody');
        if (!body) return;
        body.querySelectorAll('[data-material-row="true"]').forEach(row => {
            row.hidden = !!normalized && !(row.dataset.search || row.textContent.toLocaleLowerCase('ru-RU')).includes(normalized);
        });
        body.querySelectorAll('[data-category-row]').forEach(groupRow => {
            const category = groupRow.dataset.categoryRow;
            const visibleInGroup = Array.from(body.querySelectorAll('[data-material-row="true"]')).some(row => row.dataset.category === category && !row.hidden);
            groupRow.hidden = !visibleInGroup;
        });
        const visibleCount = Array.from(body.querySelectorAll('[data-material-row="true"]')).filter(row => !row.hidden).length;
        const count = document.getElementById('materials-count');
        if (count) count.innerText = normalized ? `Найдено материалов: ${visibleCount} из ${rpgData.materials.length}.` : `Материалов в справочнике: ${rpgData.materials.length}.`;
    },

    renderSheet() {
        document.getElementById('sh-name').innerText = this.char.name || "Безымянный Герой";
        document.getElementById('sh-subtitle').innerText = `Раса: ${this.char.race || '-'} | Возраст: ${this.char.age || '-'}`;
        ['body', 'spirit', 'str', 'int', 'agi', 'od', 'lvl'].forEach(key => {
            document.getElementById(`sh-${key}`).innerText = this.stats[key];
        });
        
        const rData = rpgData.races.find(r => r.name === this.char.race) || {};
        const aData = rpgData.ages.find(a => a.name === this.char.age) || {};
        
        document.getElementById('sh-r-bonus').innerText = rData.bonus || "-";
        document.getElementById('sh-r-penalty').innerText = rData.penalty || "-";
        document.getElementById('sh-a-buff').innerText = aData.buffs || "-";
        
        document.getElementById('sh-faction').innerText = this.char.faction || "Одиночка";
        document.getElementById('sh-skill').innerText = this.char.skill || "-";
        document.getElementById('sh-active-skill').innerText = this.char.activeSkill || "-";
        document.getElementById('sh-gift').innerText = this.char.gift || "-";
        document.getElementById('sh-traits').innerText = this.char.traits.length ? this.char.traits.join(', ') : "Нет";
        document.getElementById('sh-backstory').innerText = this.char.backstory || "История не написана...";
    },

    exportJPG() {
        const element = document.getElementById('character-sheet');
        element.classList.add('jpg-export-mode'); 
        
        const btn = document.querySelector('button[onclick="app.exportJPG()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = "⏳ Обработка...";
        btn.disabled = true;

        setTimeout(() => {
            html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#111" })
            .then(canvas => {
                element.classList.remove('jpg-export-mode');
                btn.innerHTML = originalText;
                btn.disabled = false;
                
                const link = document.createElement('a');
                link.download = `Персонаж_${this.char.name || 'Hero'}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.95);
                link.click();
            }).catch(err => {
                console.error("Ошибка JPG: ", err);
                element.classList.remove('jpg-export-mode');
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }, 100);
    },

    renderSavedList() {
        const list = document.getElementById('saved-list');
        list.innerHTML = this.savedChars.map((c, i) => `
            <div class="saved-char">
                <strong>${c.data.name}</strong>
                <small>${c.data.race} | Ур: ${c.stats.lvl}</small>
                <div class="saved-char-actions">
                    <button class="gold-btn" onclick="app.loadChar(${i})">Загрузить</button>
                    <button class="danger-btn" onclick="app.deleteChar(${i})">Удалить</button>
                </div>
            </div>
        `).join('');
    },

    loadChar(index) {
        const c = this.savedChars[index];
        this.char = { ...c.data }; this.stats = { ...c.stats };
        
        document.getElementById('char-name').value = this.char.name;
        document.getElementById('race-select').value = this.char.race;
        this.updateRace();
        document.getElementById('parent1-select').value = this.char.parent1 || "";
        document.getElementById('parent2-select').value = this.char.parent2 || "";
        document.getElementById('age-select').value = this.char.age;
        document.getElementById('faction-select').value = this.char.faction || "";
        document.getElementById('skill-select').value = this.char.skill || "";
        document.getElementById('active-skill-select').value = this.char.activeSkill || "";
        document.getElementById('gift-select').value = this.char.gift;
        document.getElementById('backstory').value = this.char.backstory;

        document.querySelectorAll('#traits-container input').forEach(cb => {
            cb.checked = this.char.traits.includes(cb.value);
        });

        this.updateData();
        this.switchTab('sheet');
        this.toggleSession();
    },

    deleteChar(index) {
        this.savedChars.splice(index, 1);
        localStorage.setItem('rpgChars', JSON.stringify(this.savedChars));
        this.renderSavedList();
    },

    populateCompareSelectors() {
        const options = `<option value="" disabled selected hidden>-- Выберите бойца --</option>` + 
            this.savedChars.map((c, i) => `<option value="${i}">${c.data.name}</option>`).join('');
        document.getElementById('vs-1').innerHTML = options;
        document.getElementById('vs-2').innerHTML = options;
    },

    renderCompare() {
        const i1 = document.getElementById('vs-1').value;
        const i2 = document.getElementById('vs-2').value;
        const tbody = document.getElementById('vs-body');
        if(i1 === "" || i2 === "") { tbody.innerHTML = ""; return; }
        
        const c1 = this.savedChars[i1]; const c2 = this.savedChars[i2];
        document.getElementById('vs-name-1').innerText = c1.data.name;
        document.getElementById('vs-name-2').innerText = c2.data.name;

        const compareRow = (label, key) => {
            const val1 = Number(c1.stats[key]); const val2 = Number(c2.stats[key]);
            const class1 = val1 > val2 ? 'win' : (val1 < val2 ? 'lose' : 'draw');
            const class2 = val2 > val1 ? 'win' : (val2 < val1 ? 'lose' : 'draw');
            return `<tr><td class="${class1}">${val1}</td><td><strong>${label}</strong></td><td class="${class2}">${val2}</td></tr>`;
        };
        tbody.innerHTML = compareRow('Тело', 'body') + compareRow('Дух', 'spirit') + compareRow('Сила', 'str') + compareRow('Интеллект', 'int') + compareRow('Ловкость', 'agi') + compareRow('Уровень', 'lvl');
    }
};

window.onload = () => app.init();
