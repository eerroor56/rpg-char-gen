// app.js
const app = {
    step: 1,
    char: { name: "", race: "", parent1: "", parent2: "", age: "", gift: "", traits: [], weapon: "", armor: "", backstory: "" },
    stats: { body: 0, spirit: 0, str: 0, int: 0, agi: 0, lvl: 0, od: 3 },
    savedChars: JSON.parse(localStorage.getItem('rpgChars')) || [],
    
    // Добавь это свойство в начало объекта app (например, под savedChars)
    isCurrentSaved: false,

    // ...

    // --- НОВАЯ ЛОГИКА СОХРАНЕНИЯ ---
    saveCurrentCharacter() {
        if (!this.char.name) { 
            alert("Имя персонажа обязательно!"); 
            return; 
        }

        // Блокируем дублирование
        if (this.isCurrentSaved) return;

        const newChar = { id: Date.now(), data: { ...this.char }, stats: { ...this.stats } };
        this.savedChars.push(newChar);
        localStorage.setItem('rpgChars', JSON.stringify(this.savedChars));
        this.renderSavedList();
        
        // Меняем внешний вид кнопки на "Сохранено"
        const saveBtn = document.getElementById('btn-save-char');
        if (saveBtn) {
            saveBtn.innerHTML = "✓ Сохранено";
            saveBtn.classList.add('saved');
        }
        
        this.isCurrentSaved = true;

        // Показываем именное уведомление
        this.showToast(`Персонаж ${this.char.name} успешно сохранён!`);
    },

    // --- ЛОГИКА СОЗДАНИЯ НОВОГО ПЕРСОНАЖА ---
    resetAndCreateNew() {
        if (confirm("Создать нового героя? Несохраненный прогресс будет потерян.")) {
            this.resetWizard();
            this.switchTab('wizard');
        }
    },

    // --- ОБНОВЛЕННЫЙ СБРОС МАСТЕРА ---
    resetWizard() {
        // Очистка объекта данных
        this.char = { name: "", race: "", parent1: "", parent2: "", age: "", gift: "", traits: [], weapon: "", armor: "", backstory: "" };
        
        // Очистка DOM (инпуты и селекты)
        document.getElementById('char-name').value = "";
        document.getElementById('backstory').value = "";
        document.getElementById('race-select').value = "";
        document.getElementById('parent1-select').value = "";
        document.getElementById('parent2-select').value = "";
        document.getElementById('age-select').value = "";
        document.getElementById('gift-select').value = "";
        document.getElementById('weapon-select').value = "";
        document.getElementById('armor-select').value = "";

        // Сброс чекбоксов черт
        document.querySelectorAll('#traits-container input').forEach(cb => cb.checked = false);

        // Скрытие блока полукровки
        document.getElementById('halfblood-container').style.display = 'none';

        // Очистка инфо-карточек
        this.updateInfoCard('race-info', null, "Укажите расу для отображения бонусов");
        this.updateInfoCard('age-info', null, "Укажите возраст для отображения модификаторов");
        this.updateInfoCard('gift-info', null, "Сделайте выбор, чтобы узнать силу Дара");
        document.getElementById('traits-limit').innerText = "Количество черт зависит от возраста";

        // Сбрасываем кнопку сохранения, если она была нажата
        this.isCurrentSaved = false;
        const saveBtn = document.getElementById('btn-save-char');
        if (saveBtn) {
            saveBtn.innerHTML = "💾 Сохранить";
            saveBtn.classList.remove('saved');
        }

        // Пересчет пустых статов и возврат на шаг 1
        this.calculateStats();
        this.step = 1;
        this.renderWizard();
    },

    init() {
        this.populateDropdowns();
        this.updateData();
        this.renderSavedList();
        this.checkOnboarding();
        this.renderWizard();
    },

    // --- Тост Уведомление ---
    showToast(msg) {
        const toast = document.getElementById("toast");
        toast.innerText = msg;
        toast.className = "toast show";
        setTimeout(() => { toast.className = toast.className.replace("toast show", "toast"); }, 2800);
    },

    // --- Сброс Мастера (Ручной и Автоматический) ---
    manualReset() {
        if (confirm("Вы уверены, что хотите сбросить текущего персонажа и начать заново?")) {
            this.resetWizard();
        }
    },

    resetWizard() {
        // Очистка объекта данных
        this.char = { name: "", race: "", parent1: "", parent2: "", age: "", gift: "", traits: [], weapon: "", armor: "", backstory: "" };
        
        // Очистка DOM (инпуты и селекты)
        document.getElementById('char-name').value = "";
        document.getElementById('backstory').value = "";
        document.getElementById('race-select').value = "";
        document.getElementById('parent1-select').value = "";
        document.getElementById('parent2-select').value = "";
        document.getElementById('age-select').value = "";
        document.getElementById('gift-select').value = "";
        document.getElementById('weapon-select').value = "";
        document.getElementById('armor-select').value = "";

        // Сброс чекбоксов черт
        document.querySelectorAll('#traits-container input').forEach(cb => cb.checked = false);

        // Скрытие блока полукровки
        document.getElementById('halfblood-container').style.display = 'none';

        // Очистка инфо-карточек
        this.updateInfoCard('race-info', null, "Укажите расу для отображения бонусов");
        this.updateInfoCard('age-info', null, "Укажите возраст для отображения модификаторов");
        this.updateInfoCard('gift-info', null, "Сделайте выбор, чтобы узнать силу Дара");
        document.getElementById('traits-limit').innerText = "Количество черт зависит от возраста";

        // Пересчет пустых статов и возврат на шаг 1
        this.calculateStats();
        this.step = 1;
        this.renderWizard();
    },

    // --- Сохранение ---
    saveCurrentChar() {
        if (!this.char.name) { alert("Укажите имя героя (Шаг 3) перед сохранением!"); return; }
        
        const newChar = { id: Date.now(), data: { ...this.char }, stats: { ...this.stats } };
        this.savedChars.push(newChar);
        localStorage.setItem('rpgChars', JSON.stringify(this.savedChars));
        this.renderSavedList();
        
        // Показываем уведомление об успехе
        this.showToast("Герой успешно сохранён в коллекцию!");
        
        // Сбрасываем мастер
        this.resetWizard();
    },

    // --- Онбординг ---
    checkOnboarding() {
        if (!localStorage.getItem('rpgOnboardingClosed')) this.openOnboarding();
    },
    openOnboarding() { document.getElementById('onboarding-modal').classList.add('open'); },
    closeOnboarding() {
        if (document.getElementById('dont-show-again').checked) localStorage.setItem('rpgOnboardingClosed', 'true');
        document.getElementById('onboarding-modal').classList.remove('open');
    },

    // --- Навигация и Степпер ---
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
        if (s === 3) {
            if (!this.char.weapon || !this.char.armor) return "Выберите материал для снаряжения!";
            if (!this.char.name.trim()) return "Укажите имя персонажа!";
        }
        if (s === 4 && !this.char.gift) return "Обязательно выберите Тёмный Дар!";
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

    // --- Инициализация и обновление UI ---
    populateDropdowns() {
        const fill = (id, arr, defaultText) => {
            const select = document.getElementById(id);
            select.innerHTML = `<option value="" disabled selected hidden>-- ${defaultText} --</option>` + 
                arr.map(item => `<option value="${item.name}">${item.name}</option>`).join('');
        };
        fill('race-select', rpgData.races, 'Выберите расу');
        fill('parent1-select', rpgData.races.filter(r => r.name !== 'Полукровка'), 'Раса Отца');
        fill('parent2-select', rpgData.races.filter(r => r.name !== 'Полукровка'), 'Раса Матери');
        fill('age-select', rpgData.ages, 'Выберите возраст');
        fill('gift-select', rpgData.gifts, 'Выберите Тёмный Дар');
        fill('weapon-select', rpgData.materials, 'Материал Оружия');
        fill('armor-select', rpgData.materials, 'Материал Брони');

        document.getElementById('traits-container').innerHTML = rpgData.traits.map(t => 
            `<label><input type="checkbox" value="${t.name}" onchange="app.updateData()"> <span>${t.name}</span></label>`
        ).join('');
    },

    updateInfoCard(id, contentHTML, defaultText = "") {
        const el = document.getElementById(id);
        if (contentHTML) {
            el.innerHTML = contentHTML;
            el.classList.remove('empty');
        } else {
            el.innerHTML = defaultText;
            el.classList.add('empty');
        }
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
        if(aData) {
            this.updateInfoCard('age-info', `<strong>Бафф:</strong> ${aData.buffs}<br><strong>Условие:</strong> ${aData.constraints}`);
            document.getElementById('traits-limit').innerText = `Доступно черт для выбора: ${aData.maxTraits}`;
        }
        this.updateData();
    },

    updateData() {
        this.char.race = document.getElementById('race-select').value;
        this.char.parent1 = document.getElementById('parent1-select').value;
        this.char.parent2 = document.getElementById('parent2-select').value;
        this.char.age = document.getElementById('age-select').value;
        this.char.gift = document.getElementById('gift-select').value;
        this.char.weapon = document.getElementById('weapon-select').value;
        this.char.armor = document.getElementById('armor-select').value;
        this.char.name = document.getElementById('char-name').value;
        this.char.backstory = document.getElementById('backstory').value;

        const aData = rpgData.ages.find(a => a.name === this.char.age) || { maxTraits: 0 };
        const checkboxes = Array.from(document.querySelectorAll('#traits-container input'));
        const checked = checkboxes.filter(cb => cb.checked);
        
        if (checked.length > aData.maxTraits && this.char.age !== "") {
            alert(`Для этого возраста максимум черт: ${aData.maxTraits}`);
            event.target.checked = false;
            return;
        }
        this.char.traits = checked.map(cb => cb.value);

        const gData = rpgData.gifts.find(g => g.name === this.char.gift);
        if (gData) this.updateInfoCard('gift-info', `<strong>Дар:</strong> ${gData.bonus}<br><strong>Проклятье:</strong> ${gData.debuff}`);

        this.calculateStats();
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

        const aData = rpgData.ages.find(a => a.name === this.char.age);
        // Если раса не выбрана, ОД должно быть 0, а не 3 по умолчанию
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

    // --- Лист Персонажа, Списки и Versus (Остальное без изменений) ---
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
        document.getElementById('sh-gift').innerText = this.char.gift || "-";
        document.getElementById('sh-traits').innerText = this.char.traits.length ? this.char.traits.join(', ') : "Нет";
        document.getElementById('sh-weapon').innerText = this.char.weapon || "-";
        document.getElementById('sh-armor').innerText = this.char.armor || "-";
        document.getElementById('sh-backstory').innerText = this.char.backstory || "История не написана...";
    },

    exportPDF() {
        const element = document.getElementById('character-sheet');
        element.classList.add('pdf-export-mode'); 
        const opt = {
            margin: 10, filename: `Персонаж_${this.char.name || 'Hero'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save().then(() => element.classList.remove('pdf-export-mode'));
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
        document.getElementById('gift-select').value = this.char.gift;
        document.getElementById('weapon-select').value = this.char.weapon;
        document.getElementById('armor-select').value = this.char.armor;
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