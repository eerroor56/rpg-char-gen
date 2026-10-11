// data.js
const rpgData = {
    // Расы
    races: [
        { name: "Полукровка", body: 0, spirit: 0, strength: 0, intellect: 0, agility: 0, baseLvl: 0, bonus: "Сложение статов двух рас и деление на 2 / половинчатые бонусы обеих рас", penalty: "Половинчатые штрафы обеих рас / привлекательность -20" },
        { name: "Империал", body: 50, spirit: 50, strength: 20, intellect: 35, agility: 30, baseLvl: 53.3, bonus: "Харизма +25 / +10 к статам за союзника", penalty: "Нет" },
        { name: "Норды", body: 75, spirit: 35, strength: 40, intellect: 30, agility: 25, baseLvl: 60.0, bonus: "Резист к холоду 25% / топоры +15", penalty: "Тяга к алкоголю" },
        { name: "Номада", body: 50, spirit: 60, strength: 20, intellect: 35, agility: 40, baseLvl: 60.0, bonus: "Сопротивление огню 25% / символ песка", penalty: "Нет" },
        { name: "Хоббиты", body: 50, spirit: 30, strength: 30, intellect: 35, agility: 35, baseLvl: 51.6, bonus: "Фермерство +3 / скрытность +5", penalty: "Боевые навыки слабее в 2 раза" },
        { name: "Арае (Камаэль)", body: 100, spirit: 110, strength: 30, intellect: 50, agility: 60, baseLvl: 108.3, bonus: "Двойной ход / рапиры +15 / проклятая печать", penalty: "Получаешь на 25% больше тёмного, святого урона" },
        { name: "Архонты", body: 45, spirit: 95, strength: 20, intellect: 40, agility: 25, baseLvl: 66.6, bonus: "Знак святости / +15 к статам за союзника", penalty: "Урон тьмой Х2" },
        { name: "Гадхарвы", body: 100, spirit: 50, strength: 30, intellect: 35, agility: 20, baseLvl: 70.0, bonus: "4 руки / выпивка восполняет 25пси", penalty: "Алкоголизм / -15 всем статам" },
        { name: "Таррэ", body: 300, spirit: 150, strength: 40, intellect: 50, agility: 35, baseLvl: 183.3, bonus: "Умение монстра / +10% от статов предка монстра", penalty: "5% шанса не вернуться из формы монстра" },
        { name: "Шадосы", body: 150, spirit: 200, strength: 30, intellect: 52, agility: 80, baseLvl: 162.3, bonus: "Невидимость / ночью +5 ко всем статам", penalty: "Днём -5 ко всем статам, урон светом +30" }
    ],
    // Возрасты
    ages: [
        { name: "Ребёнок", buffs: "+2 ОД / +20% к хп и мп регену", constraints: "0 черт", maxTraits: 0, odOffset: 2, lvlMod: 0.5 },
        { name: "Юный", buffs: "+1 ОД / 50% резиста потери пси", constraints: "До 2х черт", maxTraits: 2, odOffset: 1, lvlMod: 0.8 },
        { name: "Взрослый", buffs: "Стандарт без особых эффектов", constraints: "До 3х черт", maxTraits: 3, odOffset: 0, lvlMod: 1.0 },
        { name: "Пожилой", buffs: "Навыки +50% эффективности / -20% сопр. болезням", constraints: "До 4х черт", maxTraits: 4, odOffset: 0, lvlMod: 1.5 },
        { name: "Старец", buffs: "Навыки +100% / -40% сопр. болезням / -1 ОД", constraints: "До 5 черт", maxTraits: 5, odOffset: -1, lvlMod: 2.0 }
    ],
    // Тёмные дары (только 1)
    gifts: [
        { name: "Стеклянное оружие", bonus: "Урон 5Х", debuff: "Урон по вам 5Х" },
        { name: "Скала безмятежности", bonus: "-50% всего получаемого урона", debuff: "Точность врагов увеличена на 10" },
        { name: "Обыденность", bonus: "Аим не имеет штрафа ловкости", debuff: "На вас не действуют доп ходы" },
        { name: "Весы", bonus: "Поменять местами параметры", debuff: "Поменять местами параметры" },
        { name: "Мёртвая кровь", bonus: "Иммунитет к яду, порче", debuff: "Огонь и свет наносят 3Х урон вам" },
        { name: "Антимагия", bonus: "Магия на вас не действует", debuff: "Вы не можете применять магию" }
    ],
    // Черты
    traits: [
        { name: "Быстрые рефлексы", effect: "+2 ОД" },
        { name: "Второе дыхание", effect: "+10% урона если хп ниже 50%" },
        { name: "Тепличный боец", effect: "При полном здоровье +20% урона" },
        { name: "Сорвиголова", effect: "Если хп ниже 25%, +15 уклонения" },
        { name: "Быстро обучаемый", effect: "+5% получаемый опыт" },
        { name: "Чистое волшебство", effect: "+10% маг урона" },
        { name: "Слабость (Негативная)", effect: "-10 Силы, +5 Интеллект" }
    ],
    // Экипировка (Материалы)
    materials: [
        { name: "Кожа", weaponEffect: "10% защиты от бессилия", armorEffect: "5% резиста яду" },
        { name: "Мех", weaponEffect: "5% защиты от бессилия", armorEffect: "+1% резиста льду" },
        { name: "Дерево", weaponEffect: "Урон по существам воды 5Х", armorEffect: "Урон от огня +20е / от воды -20е" },
        { name: "Кость", weaponEffect: "Отравить 10п.", armorEffect: "Шанс 10% нанести ответный урон" },
        { name: "Камень", weaponEffect: "2% оглушить", armorEffect: "Шанс 5% оглушить атакующего" }
    ]
};