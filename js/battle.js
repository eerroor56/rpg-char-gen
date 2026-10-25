/*
 * Поле боя на странице кампании — клетчатая доска в духе XCOM.
 *   ГМ создаёт поле: размер, местность (набор предметов), сколько предметов, противники; или берёт комнату подземелья.
 *   Предметы дают укрытие: полное или половинное; декор (трава, кости, ковёр) стоять не мешает.
 *   Фишки двигают перетаскиванием (мышью или пальцем) или стрелками: игрок — только своего героя, ГМ — всё.
 *   Расстояние — в клетках, по диагонали тоже 1.
 * Хранение: поле — в документе кампании (board, меняет ГМ), место героя — в его персонаже (pos, меняет владелец или ГМ),
 * поэтому правила доступа к базе менять не нужно. Обновления видят все участники сразу.
 */
(function () {
  'use strict';
  const App = window.App, R = window.Rules;
  const esc = App.esc, cap = App.cap;
  const D = () => window.GAME_DATA;

  const rnd = n => Math.floor(Math.random() * n);
  const rint = (a, b) => a + rnd(b - a + 1);
  const chance = p => Math.random() < p;
  const newId = p => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
  const SIZE = [6, 40];
  const DENSITY = { low: [0.07, 'мало'], mid: [0.13, 'средне'], high: [0.2, 'много'] };

  // ------------------------------------------------------------ значки предметов (24×24)
  const L = '#1b1712', WO = '#8a5a34', WD = '#5e3b20', WL = '#c08a5a', ST = '#8f8b96', SD = '#615d69', PL = '#4f8f3e', PD = '#2f6a36',
    WA = '#2f78a8', IC = '#c4e6f6', ME = '#7d8794', CL = '#8b3c4a', GO = '#d6a85c', BO = '#e6dfcc';
  const f = (fill, extra) => `fill="${fill}" stroke="${L}" stroke-width="1.1" stroke-linejoin="round"${extra ? ' ' + extra : ''}`;
  const ln = (c, w) => `fill="none" stroke="${c}" stroke-width="${w || 1.6}" stroke-linecap="round"`;
  const G = {
    tree: `<rect x="10.5" y="14" width="3" height="7" ${f(WD)}/><circle cx="12" cy="10" r="7" ${f(PL)}/><circle cx="9.5" cy="7.5" r="2.2" fill="#78b25c"/>`,
    pine: `<rect x="11" y="17" width="2" height="4" ${f(WD)}/><path d="M12 2l6 9h-3l4 6H5l4-6H6z" ${f(PD)}/>`,
    deadtree: `<path d="M12 21V9M12 13 7 9M12 11l4-5M12 15l4-1M7 9 5 9M16 6l1-2" ${ln(WD, 2.4)}/>`,
    bush: `<path d="M5 17a4 4 0 0 1 1-7 5 5 0 0 1 9-2 4 4 0 0 1 4 9z" ${f(PL)}/><circle cx="10" cy="11" r="1.6" fill="#78b25c"/>`,
    rock: `<path d="M4 18l3-8 6-3 6 5 1 6z" ${f(ST)}/><path d="M8 12l4-2" ${ln('#b9b5c0', 1.2)}/>`,
    boulder: `<path d="M3 19l2-9 6-5 8 2 3 8-2 4z" ${f(SD)}/><path d="M7 11l4-4 5 1" ${ln('#8f8b96', 1.3)}/>`,
    log: `<rect x="3" y="9" width="16" height="7" rx="3.5" ${f(WO)}/><ellipse cx="19" cy="12.5" rx="2.6" ry="3.5" ${f(WL)}/>`,
    stump: `<path d="M7 11v8h10v-8" ${f(WO)}/><ellipse cx="12" cy="11" rx="5" ry="2.2" ${f(WL)}/>`,
    reeds: `<path d="M8 21V9M12 21V6M16 21V10" ${ln(PL, 2)}/><ellipse cx="8" cy="8" rx="1.3" ry="2.4" fill="#7a4a2a"/><ellipse cx="12" cy="5" rx="1.3" ry="2.4" fill="#7a4a2a"/><ellipse cx="16" cy="9" rx="1.3" ry="2.4" fill="#7a4a2a"/>`,
    water: `<path d="M3 9q3-3 6 0t6 0 6 0M3 15q3-3 6 0t6 0 6 0" ${ln('#9fd3f0', 1.6)}/>`,
    cactus: `<rect x="10" y="4" width="4" height="17" rx="2" ${f(PL)}/><path d="M10 14H8a2 2 0 0 1-2-2V9M14 11h2a2 2 0 0 0 2-2V7" ${ln(PL, 3)}/>`,
    bones: `<path d="M6 7l12 10M18 7 6 17" ${ln(BO, 2.4)}/><circle cx="5.5" cy="6.5" r="1.6" fill="${BO}"/><circle cx="18.5" cy="17.5" r="1.6" fill="${BO}"/>`,
    snowdrift: `<path d="M2 19c3-6 7-8 10-6 2-3 7-3 10 6z" ${f('#e8f2f8')}/>`,
    ice: `<path d="M12 3l6 5-2 11H8L6 8z" ${f(IC)}/><path d="M12 3v16M6 8l6 3 6-3" ${ln('#8cc3dd', 1)}/>`,
    stalagmite: `<path d="M7 21l4-17h1l4 17z" ${f(SD)}/><path d="M15 21l2-8 2 8z" ${f(ST)}/>`,
    crystal: `<path d="M11 3l4 6-4 12-4-12z" ${f('#9b7fe0')}/><path d="M16 9l3 4-3 7-2-6z" ${f('#c3b0f2')}/>`,
    mushroom: `<path d="M4 12a8 6.5 0 0 1 16 0z" ${f('#a0466a')}/><rect x="10.5" y="12" width="3" height="8" ${f(BO)}/><circle cx="9" cy="9" r="1.2" fill="${BO}"/><circle cx="14.5" cy="8" r="1" fill="${BO}"/>`,
    wall: `<rect x="2" y="3" width="20" height="18" ${f(SD)}/><path d="M2 9h20M2 15h20M8 3v6M16 3v6M5 9v6M12 9v6M19 9v6M8 15v6M16 15v6" ${ln(L, 0.8)}/>`,
    column: `<rect x="8" y="5" width="8" height="14" ${f(ST)}/><rect x="6" y="3" width="12" height="3" ${f(ST)}/><rect x="6" y="18" width="12" height="3" ${f(ST)}/><path d="M10.5 6v12M13.5 6v12" ${ln(SD, 1)}/>`,
    statue: `<circle cx="12" cy="6" r="3" ${f(ST)}/><path d="M8 18l1-8h6l1 8z" ${f(ST)}/><rect x="6" y="18" width="12" height="3" ${f(SD)}/>`,
    table: `<rect x="3" y="6" width="18" height="12" rx="1.5" ${f(WO)}/><path d="M3 10h18M3 14h18" ${ln(WD, 0.8)}/>`,
    chair: `<rect x="7" y="9" width="10" height="10" rx="1" ${f(WO)}/><rect x="7" y="4" width="10" height="4" rx="1" ${f(WD)}/>`,
    shelf: `<rect x="4" y="3" width="16" height="18" ${f(WD)}/><path d="M4 9h16M4 15h16" ${ln(L, 1)}/><rect x="6" y="5" width="3" height="4" fill="#7fd1c4"/><rect x="11" y="11" width="3" height="4" fill="${GO}"/><rect x="15" y="16.5" width="3" height="4" fill="#c77ddb"/>`,
    bookcase: `<rect x="4" y="3" width="16" height="18" ${f(WD)}/><path d="M4 9h16M4 15h16" ${ln(L, 1)}/><path d="M6.5 4v5M8.5 4v5M11 4v5M15 10v5M17 10v5M7 16v5M10 16v5M13 16v5" ${ln(CL, 1.6)}/><path d="M13 4v5M9 10v5M16 16v5" ${ln('#3c6a8b', 1.6)}/>`,
    bed: `<rect x="5" y="3" width="14" height="18" rx="2" ${f(CL)}/><rect x="7" y="4.5" width="10" height="4" rx="1.5" ${f(BO)}/><path d="M5 12h14" ${ln('#6d2c38', 1)}/>`,
    barrel: `<circle cx="12" cy="12" r="8" ${f(WO)}/><circle cx="12" cy="12" r="5" ${ln(WD, 1.2)}/><circle cx="12" cy="12" r="1.5" fill="${WD}"/>`,
    crate: `<rect x="4" y="4" width="16" height="16" ${f('#a8743f')}/><path d="M4 4l16 16M20 4 4 20" ${ln(WD, 1.2)}/>`,
    chest: `<path d="M4 11a8 4 0 0 1 16 0v8H4z" ${f(WO)}/><path d="M4 12h16" ${ln(L, 1)}/><rect x="10.5" y="11" width="3" height="4" ${f(GO)}/>`,
    junk: `<rect x="3" y="12" width="7" height="6" transform="rotate(-12 6 15)" ${f(WO)}/><circle cx="16" cy="9" r="3" ${f(ME)}/><path d="M12 19l8-3M14 14l2 5" ${ln(SD, 2)}/>`,
    rubble: `<path d="M3 18l2-4 4 1 1 4zM10 19l1-5 5-1 2 6zM14 11l2-4 4 2-1 4z" ${f(ST)}/>`,
    altar: `<rect x="4" y="10" width="16" height="9" ${f(ST)}/><rect x="3" y="8" width="18" height="3" ${f(BO)}/><circle cx="12" cy="5.5" r="2" ${f(GO)}/>`,
    bench: `<rect x="3" y="9" width="18" height="6" rx="1" ${f(WO)}/><path d="M3 12h18" ${ln(WD, 0.8)}/>`,
    cauldron: `<path d="M5 9h14v4a7 7 0 0 1-14 0z" ${f('#3a3a42')}/><ellipse cx="12" cy="9" rx="7" ry="2" ${f('#5bbf6a')}/>`,
    stove: `<rect x="4" y="4" width="16" height="16" ${f(SD)}/><path d="M8 20v-6a4 4 0 0 1 8 0v6z" fill="#2a1a12"/><path d="M10 19c0-2 2-3 2-5 1 2 2 3 2 5z" fill="#f08a3c"/>`,
    anvil: `<path d="M3 8h13l5-2v4l-5 1v3h-3l2 5H8l2-5H7v-3L3 10z" ${f(ME)}/>`,
    workbench: `<rect x="3" y="7" width="18" height="11" ${f(WO)}/><path d="M7 9l5 5M12 9l-5 5" ${ln(ME, 1.8)}/><rect x="14" y="9" width="5" height="3" ${f(ME)}/>`,
    alchtable: `<rect x="3" y="11" width="18" height="8" ${f(WO)}/><path d="M8 4h2v3l2 4H6l2-4z" ${f('#7fd1c4')}/><circle cx="16" cy="8" r="2.5" ${f('#c77ddb')}/>`,
    planter: `<path d="M7 13h10l-1.5 7h-7z" ${f('#a65c36')}/><circle cx="12" cy="9" r="4.5" ${f(PL)}/>`,
    candle: `<rect x="10.5" y="9" width="3" height="10" ${f(BO)}/><path d="M12 4c1.5 2 1.5 3.5 0 4.5-1.5-1-1.5-2.5 0-4.5z" fill="#f6b44a"/>`,
    fence: `<path d="M5 6v14M12 6v14M19 6v14M3 10h18M3 16h18" ${ln(WO, 2.4)}/>`,
    cart: `<rect x="3" y="6" width="15" height="10" ${f(WO)}/><circle cx="7" cy="18" r="2.5" ${f(WD)}/><circle cx="15" cy="18" r="2.5" ${f(WD)}/><path d="M18 11h4" ${ln(WD, 2)}/>`,
    lamp: `<rect x="11" y="9" width="2" height="12" ${f(ME)}/><rect x="9" y="3" width="6" height="6" rx="1" ${f('#f6c873')}/>`,
    well: `<circle cx="12" cy="12" r="8" ${f(ST)}/><circle cx="12" cy="12" r="5" fill="#1d3f57"/>`,
    haystack: `<path d="M3 19c1-8 5-13 9-13s8 5 9 13z" ${f('#d9b14a')}/><path d="M8 12l2 6M13 10l1 8M17 13l-1 5" ${ln('#a8822c', 1)}/>`,
    grass: `<path d="M6 20c0-4-1-7-3-9M9 20c0-5 0-9 2-12M13 20c0-4 1-7 4-10M17 20c0-3 1-5 3-6" ${ln(PL, 1.6)}/>`,
    rug: `<rect x="3" y="5" width="18" height="14" rx="1" fill="${CL}" opacity=".75"/><rect x="6" y="8" width="12" height="8" ${ln(GO, 1)}/>`,
    puddle: `<ellipse cx="12" cy="13" rx="8" ry="5" fill="#3b7aa8" opacity=".7"/><path d="M8 12q2-1.5 4 0" ${ln('#9fd3f0', 1)}/>`,
    nest: `<ellipse cx="12" cy="15" rx="8" ry="4.5" ${f('#7a5a36')}/><path d="M5 14q7 4 14 0M6 16q6-3 12 1" ${ln('#4a3420', 0.9)}/><ellipse cx="10" cy="12.5" rx="2" ry="2.4" fill="${BO}"/><ellipse cx="14" cy="12.5" rx="2" ry="2.4" fill="#d8d0b8"/>`,
    ore: `<path d="M4 18l2-7 5-4 6 2 3 6-2 4z" ${f(SD)}/><path d="M9 12l2 1M14 11l1 2M11 16l2-1" ${ln('#e3a447', 2)}/>`,
    gravestone: `<path d="M7 20V9a5 5 0 0 1 10 0v11z" ${f(ST)}/><path d="M12 10v6M10 12h4" ${ln(SD, 1.3)}/><rect x="5" y="19" width="14" height="2" ${f(SD)}/>`,
    bonespur: `<path d="M5 21l3-15 3 9 2-12 3 12 3-6-1 12z" ${f(BO)}/>`,
    irontree: `<rect x="10.5" y="14" width="3" height="7" ${f(ME)}/><circle cx="12" cy="10" r="7" ${f('#5f7d6a')}/><path d="M8 9l3 2 4-3" ${ln('#aab4bf', 1.2)}/>`,
    chalicetree: `<path d="M5 6h14l-3 7h-8z" ${f('#3f8a5a')}/><rect x="10.5" y="13" width="3" height="6" ${f(WD)}/><path d="M7 21h10" ${ln(WD, 2)}/><ellipse cx="12" cy="6" rx="7" ry="1.6" fill="#7fc3d9"/>`,
    growth: `<path d="M5 19c0-6 3-10 7-12 4 2 7 6 7 12z" ${f('#a0465c')}/><circle cx="10" cy="13" r="1.6" fill="#f0c9d2"/><circle cx="14.5" cy="11" r="1.2" fill="#f0c9d2"/><circle cx="13" cy="16" r="1" fill="#f0c9d2"/>`
  };

  // предметы: n — название, c — укрытие (2 полное, 1 половинное, 0 нет), walk — декор, на нём можно стоять,
  // edge — ставится у края, near — рядом с другим предметом, clump — тянется к таким же, line — ставится полосой
  const T = {
    tree: { n: 'дерево', c: 2, clump: 0.45 }, pine: { n: 'ель', c: 2, clump: 0.45 }, deadtree: { n: 'сухое дерево', c: 2 },
    bush: { n: 'куст', c: 1, clump: 0.35 }, rock: { n: 'камень', c: 1 }, boulder: { n: 'валун', c: 2 }, log: { n: 'бревно', c: 1 },
    stump: { n: 'пень', c: 1 }, reeds: { n: 'камыш', c: 1, clump: 0.5 }, water: { n: 'вода, топь', c: 0, fill: 'water', clump: 0.75 },
    cactus: { n: 'кактус', c: 1 }, snowdrift: { n: 'сугроб', c: 1, clump: 0.3 }, ice: { n: 'ледяная глыба', c: 2 },
    stalagmite: { n: 'сталагмит', c: 2, clump: 0.3 }, crystal: { n: 'кристалл', c: 2 }, mushroom: { n: 'гигантский гриб', c: 2, clump: 0.3 },
    nest: { n: 'гнездо', c: 0, walk: true }, ore: { n: 'руда', c: 1, clump: 0.4 }, gravestone: { n: 'надгробье', c: 1, clump: 0.3 },
    bonespur: { n: 'костный выступ', c: 2 }, irontree: { n: 'железное дерево', c: 2, clump: 0.45 }, chalicetree: { n: 'чашадрево', c: 2 },
    growth: { n: 'странный нарост', c: 1, clump: 0.35 },
    wall: { n: 'стена', c: 2, line: [2, 4] }, column: { n: 'колонна', c: 2 }, statue: { n: 'статуя', c: 2 },
    table: { n: 'стол', c: 1 }, chair: { n: 'стул', c: 0, near: 'table' }, shelf: { n: 'шкаф, стеллаж', c: 2, edge: true },
    bookcase: { n: 'книжный шкаф', c: 2, edge: true, clump: 0.55 }, bed: { n: 'кровать', c: 1, edge: true }, barrel: { n: 'бочка', c: 1, clump: 0.35 },
    crate: { n: 'ящик', c: 1, clump: 0.35 }, chest: { n: 'сундук', c: 1, edge: true }, junk: { n: 'хлам', c: 1 }, rubble: { n: 'обломки', c: 1 },
    altar: { n: 'алтарь', c: 1 }, bench: { n: 'скамья', c: 1, line: [2, 3] }, cauldron: { n: 'котёл', c: 1 }, stove: { n: 'печь', c: 2, edge: true },
    anvil: { n: 'наковальня', c: 1 }, workbench: { n: 'верстак', c: 1, edge: true }, alchtable: { n: 'стол алхимика', c: 1 },
    planter: { n: 'кадка с растением', c: 1, clump: 0.4 }, candle: { n: 'подсвечник', c: 0 }, fence: { n: 'забор', c: 1, line: [2, 4] },
    cart: { n: 'телега', c: 2 }, lamp: { n: 'фонарь', c: 0 }, well: { n: 'колодец', c: 2 }, haystack: { n: 'стог сена', c: 2 },
    bones: { n: 'останки', c: 0, walk: true }, grass: { n: 'высокая трава', c: 0, walk: true, clump: 0.5 }, rug: { n: 'ковёр', c: 0, walk: true },
    puddle: { n: 'лужа', c: 0, walk: true }
  };
  // местности: набор предметов с весами. Комнаты подземелья — те же, что в генераторе подземелий
  const PRESETS = {
    dungeon: { n: 'Подземелье: зал', set: { column: 3, rubble: 3, crate: 2, barrel: 2, junk: 2, statue: 1, wall: 2, chest: 0.5, bones: 2 } },
    room: { n: 'Комната, таверна', set: { table: 3, chair: 3, barrel: 2, crate: 2, shelf: 2, bed: 1, junk: 1, rug: 1, candle: 1 } },
    library: { n: 'Библиотека', set: { bookcase: 6, table: 2, chair: 2, candle: 1, rug: 1 } },
    alchemy: { n: 'Алхимическая', set: { alchtable: 3, cauldron: 2, shelf: 2, barrel: 2, crate: 1, candle: 1 } },
    kitchen: { n: 'Кухня', set: { stove: 2, cauldron: 2, table: 3, chair: 1, barrel: 3, crate: 2, junk: 1 } },
    workshop: { n: 'Мастерская', set: { workbench: 3, anvil: 2, crate: 3, barrel: 2, junk: 2 } },
    altar: { n: 'Храм, алтарь', set: { column: 4, bench: 3, statue: 2, altar: 0.6, candle: 2, rug: 1 } },
    garden: { n: 'Оранжерея', set: { planter: 5, bush: 3, table: 1, puddle: 1 } },
    forest: { n: 'Лес', set: { tree: 6, bush: 4, rock: 2, log: 2, stump: 1, grass: 3 } },
    swamp: { n: 'Болото', set: { water: 5, deadtree: 3, reeds: 3, log: 1, puddle: 2 } },
    desert: { n: 'Пустыня', set: { rock: 3, boulder: 2, cactus: 3, bones: 2 } },
    cave: { n: 'Пещера', set: { stalagmite: 4, boulder: 2, rock: 3, crystal: 1, mushroom: 1, puddle: 2 } },
    mountain: { n: 'Горы', set: { boulder: 4, rock: 5, pine: 1, snowdrift: 1 } },
    snow: { n: 'Тундра, снег', set: { pine: 4, snowdrift: 3, ice: 2, rock: 2 } },
    town: { n: 'Город, улица', set: { crate: 3, barrel: 3, cart: 1, wall: 2, lamp: 2, fence: 1, well: 0.5 } },
    field: { n: 'Поле, дорога', set: { rock: 2, bush: 3, fence: 3, haystack: 1, tree: 1, grass: 3 } }
  };
  const ROOM_PRESET = { 'алхимическая': 'alchemy', 'комната с алтарём': 'altar', 'оранжерея': 'garden', 'кухня': 'kitchen', 'библиотека': 'library', 'мастерская': 'workshop' };
  const INDOOR = ['dungeon', 'room', 'library', 'alchemy', 'kitchen', 'workshop', 'altar', 'garden'];

  // ------------------------------------------------------------ укрытия и типы поля боя из листа «миростроение»
  // «наименование укрытия | тип укрытия | дроп при разрушении»: название, полное / половинное / объект на полу и что выпадает.
  // Мебель («интерьер — адаптивно») остаётся со своими значениями
  const TAB = {
    grass: 'высокая трава', tree: 'деревья', bush: 'кусты', nest: 'гнездо', boulder: 'валун', snowdrift: 'сугроб', crystal: 'кристалл',
    ore: 'руда', ice: 'ледяная глыба', gravestone: 'надгробье', bonespur: 'костный выступ', mushroom: 'гигантский гриб',
    irontree: 'железное дерево', chalicetree: 'чашадрево', growth: 'странный нарост', bones: 'останки', rubble: 'обломки', column: 'колонна',
    crate: 'ящик', barrel: 'бочка', junk: 'хлам', statue: 'статуя', wall: 'стена', puddle: 'лужа', rug: 'ковёр', rock: 'камень',
    reeds: 'камыш', log: 'бревно', stump: 'пень', water: 'вода, топь', stalagmite: 'сталагмит', haystack: 'стог сена'
  };
  // сравнение с опечатками таблицы: без знаков и двойных букв, с допуском в одну букву («гиганский», «камышь», «ледянная»)
  const loose = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]/g, '').replace(/(.)\1+/g, '$1');
  function near1(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
    let i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++miss > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1;
  }
  let cache = { data: null };
  function tables() {
    const d = D();
    if (cache.data === d) return cache;
    const secs = ((d && d.world) || {}).sections || [];
    const cov = (secs.find(s => /укрыти/i.test(s.title)) || { rows: [] }).rows.filter(r => r[0]);
    const biomes = [];
    secs.filter(s => /биом/i.test(s.title)).forEach(s => {
      const under = /подзем/i.test(s.title), water = /водн/i.test(s.title);
      s.rows.filter(r => r[0]).forEach(r => biomes.push({ name: r[0].replace(/^"|"$/g, ''), foe: r[1] || '', hero: r[2] || '', floor: r[3] || '', group: under ? 'Подземные' : water ? 'Водные' : 'Наземные' }));
    });
    cache = { data: d, cov, biomes, info: {} };
    return cache;
  }
  // всё о предмете: из каталога выше + название, укрытие и добыча из таблицы
  function info(t) {
    const tb = tables();
    if (tb.info[t]) return tb.info[t];
    const base = T[t] || { n: t, c: 0 };
    const out = Object.assign({}, base, { drop: '' });
    const want = TAB[t] && loose(TAB[t]);
    const row = want && tb.cov.find(r => near1(loose(r[0]), want));
    if (row) {
      out.n = String(row[0]).toLowerCase().trim();
      const type = String(row[1] || '').toLowerCase();
      if (/полн/.test(type)) { out.c = 2; out.walk = false; } else if (/половин/.test(type)) { out.c = 1; out.walk = false; } else if (/на полу/.test(type)) { out.c = 0; out.walk = true; }
      if (row[2] && !/адаптив/i.test(row[2])) out.drop = String(row[2]).trim();
    }
    tb.info[t] = out;
    return out;
  }

  // какие предметы в каком типе поля боя: по ключевым словам названия (в таблице предметы к местностям не привязаны)
  const BIOME_SETS = [
    [/железн\S* лес/, 'forest', { irontree: 5, bush: 2, rock: 2, ore: 1 }],
    [/гриб/, 'cave', { mushroom: 5, puddle: 1, grass: 2, rock: 1 }],
    [/кубки великан/, 'forest', { chalicetree: 4, bush: 3, puddle: 2 }],
    [/лес мимик/, 'forest', { tree: 5, bush: 3, chest: 1, stump: 1 }],
    [/кладбищ/, 'field', { gravestone: 6, deadtree: 2, bones: 2, statue: 1 }],
    [/кост/, 'cave', { bonespur: 5, bones: 4, rock: 2 }],
    [/кристал/, 'cave', { crystal: 6, stalagmite: 2, rock: 2 }],
    [/рудн/, 'cave', { ore: 5, boulder: 2, stalagmite: 2, rock: 2 }],
    [/кримзон|мясн|тэинт|искажени/, 'swamp', { growth: 5, bones: 3, rubble: 1 }],
    [/болот/, 'swamp', { water: 5, reeds: 3, deadtree: 2, log: 1, puddle: 2 }],
    [/ледник|ледян|снег|замерз|земерз/, 'snow', { snowdrift: 4, ice: 3, pine: 2, rock: 1 }],
    [/тайга/, 'snow', { pine: 6, snowdrift: 2, log: 1, stump: 1 }],
    [/чащ|лес|глухомань|заросл/, 'forest', { tree: 6, bush: 4, rock: 1, log: 2, stump: 1, grass: 3, nest: 0.3 }],
    [/сад|свят/, 'field', { bush: 4, tree: 2, statue: 1, column: 1, grass: 2 }],
    [/степ|равнин|ровнин|холм|альбион/, 'field', { grass: 5, bush: 2, rock: 2, haystack: 0.5, boulder: 1 }],
    [/пустын|пепел|пепельн|выжжен|выжен/, 'desert', { rock: 3, boulder: 2, cactus: 2, bones: 2 }],
    [/вулкан|жерло/, 'mountain', { boulder: 3, rubble: 3, rock: 3 }],
    [/гор|камен|каньон|песчан/, 'mountain', { boulder: 4, rock: 4, stalagmite: 1 }],
    [/город/, 'town', { crate: 3, barrel: 3, cart: 1, wall: 2, lamp: 2, fence: 1, well: 0.5 }],
    [/река|озер|море|океан|побереж|риф|водоросл|плато|зубы/, 'swamp', { water: 5, rock: 3, reeds: 2, puddle: 1 }],
    [/биолюм/, 'cave', { mushroom: 3, crystal: 2, puddle: 2, stalagmite: 2 }],
    [/эктоплазм|слиз/, 'swamp', { puddle: 4, water: 3, growth: 1, reeds: 1 }],
    [/кров/, 'swamp', { water: 4, bones: 3, growth: 1 }]
  ];
  function biomePreset(b) {
    const n = String(b.name).toLowerCase().replace(/ё/g, 'е');
    const hit = BIOME_SETS.find(([re]) => re.test(n));
    const under = b.group === 'Подземные';
    return { n: cap(b.name), set: hit ? hit[2] : under ? { stalagmite: 3, boulder: 2, rock: 3, puddle: 1 } : { rock: 3, bush: 3, grass: 2, tree: 1 },
      floor: hit ? (under && hit[1] === 'forest' ? 'cave' : hit[1]) : under ? 'cave' : 'field', foe: b.foe, hero: b.hero, layer: b.floor, group: b.group };
  }
  // местность по id: комнаты — свои наборы, «b:название» — тип поля боя из таблицы; старые id (forest…) тоже открываются
  function preset(id) {
    if (String(id).startsWith('b:')) {
      const b = tables().biomes.find(x => x.name === id.slice(2));
      return b ? biomePreset(b) : { n: cap(id.slice(2)), set: PRESETS.forest.set, floor: 'field' };
    }
    return PRESETS[id] || PRESETS.forest;
  }
  function presetList() {
    const out = [['Помещения', INDOOR.map(k => [k, PRESETS[k].n])]];
    const bio = tables().biomes;
    if (bio.length) ['Наземные', 'Подземные', 'Водные'].forEach(g => { const l = bio.filter(b => b.group === g); if (l.length) out.push([`Типы поля боя: ${g.toLowerCase()}`, l.map(b => ['b:' + b.name, cap(b.name)])]); });
    else out.push(['Местность', Object.keys(PRESETS).filter(k => !INDOOR.includes(k)).map(k => [k, PRESETS[k].n])]);
    return out;
  }

  const glyph = t => `<svg viewBox="0 0 24 24" aria-hidden="true">${G[t] || ''}</svg>`;
  const COVER = ['', 'половинное укрытие', 'полное укрытие'];
  const key = (x, y) => x + ',' + y;
  const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const initials = s => String(s || '?').split(/[\s\-—]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

  // ------------------------------------------------------------ генерация
  function weighted(set) {
    const list = Object.entries(set), sum = list.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum;
    for (const [t, w] of list) { r -= w; if (r <= 0) return t; }
    return list[0][0];
  }
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // o: { w, h, preset, density, foes: [{ n, lvl }], heroes: [id] }
  function generate(o) {
    const w = Math.min(SIZE[1], Math.max(SIZE[0], Math.round(o.w) || 15));
    const h = Math.min(SIZE[1], Math.max(SIZE[0], Math.round(o.h) || 15));
    const P = preset(o.preset);
    const busy = new Map();                                     // клетка → предмет
    const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && y > 0 && y < h - 1 && !busy.has(key(x, y));
    const objs = [];
    const put = (t, x, y) => { if (!free(x, y)) return false; const ob = { i: newId('o'), t, x, y }; objs.push(ob); busy.set(key(x, y), ob); return true; };
    const randCell = () => [rnd(w), rint(1, h - 2)];
    const near = pred => {
      const c = objs.filter(pred);
      for (let k = 0; k < 12 && c.length; k++) {
        const b = c[rnd(c.length)], d = N4[rnd(4)];
        if (free(b.x + d[0], b.y + d[1])) return [b.x + d[0], b.y + d[1]];
      }
      return null;
    };
    const target = Math.round((DENSITY[o.density] || DENSITY.mid)[0] * w * (h - 2));
    for (let tries = 0; objs.length < target && tries < target * 12; tries++) {
      const t = weighted(P.set), d = info(t);
      let at = null;
      if (d.near && objs.some(x => x.t === d.near)) at = near(x => x.t === d.near);
      else if (d.clump && chance(d.clump) && objs.some(x => x.t === t)) at = near(x => x.t === t);
      else if (d.edge && chance(0.8)) { const side = rnd(2); at = side ? [chance(0.5) ? 0 : w - 1, rint(1, h - 2)] : [rint(0, w - 1), chance(0.5) ? 1 : h - 2]; }
      if (!at) at = randCell();
      if (d.line) {
        const len = rint(d.line[0], d.line[1]), dir = N4[rnd(4)];
        for (let k = 0; k < len; k++) put(t, at[0] + dir[0] * k, at[1] + dir[1] * k);
      } else put(t, at[0], at[1]);
    }
    // от нижнего края до верхнего должен быть проход: убираем мешающие предметы, пока путь не появится
    const blocks = ob => !info(ob.t).walk;
    for (let guard = 0; guard < objs.length + 5; guard++) {
      const seen = new Set(), q = [];
      for (let x = 0; x < w; x++) { seen.add(key(x, h - 1)); q.push([x, h - 1]); }
      let reached = false;
      const frontier = new Set();
      while (q.length) {
        const [x, y] = q.shift();
        if (y === 0) { reached = true; break; }
        N4.forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(k)) return;
          const ob = busy.get(k);
          if (ob && blocks(ob)) { frontier.add(ob); return; }
          seen.add(k); q.push([nx, ny]);
        });
      }
      if (reached || !frontier.size) break;
      const kill = [...frontier][rnd(frontier.size)];
      objs.splice(objs.indexOf(kill), 1); busy.delete(key(kill.x, kill.y));
    }
    // противники — у верхнего края, герои — у нижнего
    const takenTop = new Set(objs.filter(blocks).map(x => key(x.x, x.y)));
    const spots = (rows, n) => {
      const out = [];
      const cells = [];
      rows.forEach(y => { for (let x = 0; x < w; x++) if (!takenTop.has(key(x, y))) cells.push([x, y]); });
      cells.sort(() => Math.random() - 0.5);
      for (let k = 0; k < n && k < cells.length; k++) { out.push(cells[k]); takenTop.add(key(cells[k][0], cells[k][1])); }
      return out;
    };
    const foes = o.foes || [];
    const foeRows = [0, 1, 2, 3].filter(y => y < h - 2);
    const fs = spots(foeRows, foes.length);
    const board = {
      id: newId('b'), w, h, preset: String(o.preset).startsWith('b:') || o.preset in PRESETS ? o.preset : 'forest', density: o.density || 'mid', at: Date.now(),
      fx: P.foe || P.hero ? { foe: P.foe || '', hero: P.hero || '', layer: P.layer || '' } : null, floor: P.floor || o.preset,
      objs: objs.map(({ i, t, x, y }) => ({ i, t, x, y })),
      foes: foes.slice(0, fs.length).map((fo, k) => ({ i: newId('f'), n: fo.n, lvl: fo.lvl || null, x: fs[k][0], y: fs[k][1] })),
      spawn: {}
    };
    // герои — по центру нижнего ряда, по порядку
    const heroes = (o.heroes || []).concat((o.allies || []).map(i => 'a:' + i));   // союзники встают рядом с героями
    const mid = Math.floor(w / 2);
    const order = Array.from({ length: w }, (_, k) => mid + (k % 2 ? (k + 1) / 2 : -k / 2)).filter(x => x >= 0 && x < w);
    const slots = order.map(x => [x, h - 1]).concat(order.map(x => [x, h - 2]));
    let k = 0;
    heroes.forEach(id => {
      while (k < slots.length) {
        const [x, y] = slots[k++];
        if (!takenTop.has(key(x, y))) { board.spawn[id] = [x, y]; takenTop.add(key(x, y)); return; }
      }
    });
    return board;
  }

  // ------------------------------------------------------------ состояние доски: кто где стоит
  let ctx = null;            // { cid, camp, gm, me, heroes, level, rerender, saveBoard, savePos }
  function layout(board, heroes) {
    const at = new Map();    // клетка → { kind, ... }
    const decor = new Map();
    board.objs.forEach(o => { if (info(o.t).walk) decor.set(key(o.x, o.y), o); else at.set(key(o.x, o.y), { kind: 'o', o }); });
    board.foes.forEach(fo => at.set(key(fo.x, fo.y), { kind: 'f', o: fo }));
    const placed = [];
    const freeNear = (x, y) => {
      const seen = new Set([key(x, y)]), q = [[x, y]];
      while (q.length) {
        const [cx, cy] = q.shift();
        if (!at.has(key(cx, cy))) return [cx, cy];
        N4.forEach(([dx, dy]) => { const nx = cx + dx, ny = cy + dy, kk = key(nx, ny); if (nx >= 0 && ny >= 0 && nx < board.w && ny < board.h && !seen.has(kk)) { seen.add(kk); q.push([nx, ny]); } });
      }
      return null;
    };
    // сначала герои, которые уже ходили, потом стартовые места
    const sorted = heroes.slice().sort((a, b) => (b.pos && b.pos.b === board.id ? 1 : 0) - (a.pos && a.pos.b === board.id ? 1 : 0));
    sorted.forEach(h => {
      const want = h.pos && h.pos.b === board.id ? [h.pos.x, h.pos.y] : (board.spawn || {})[h.id] || [Math.floor(board.w / 2), board.h - 1];
      const p = freeNear(Math.min(board.w - 1, Math.max(0, want[0])), Math.min(board.h - 1, Math.max(0, want[1])));
      if (!p) return;
      const tok = { kind: 'h', o: h, x: p[0], y: p[1] };
      at.set(key(p[0], p[1]), tok); placed.push(tok);
    });
    // союзники: куда их поставили (у героя — в его персонаже, у остальных — в поле), иначе старт или рядом с хозяином
    (ctx && ctx.allies || []).forEach(a => {
      const owner = a.of ? heroes.find(h => h.id === a.of) : null;
      const sp = owner && owner.apos && owner.apos[a.i];
      const bp = (board.apos || {})[a.i];
      const host = owner ? placed.find(t => t.o === owner) : null;
      const want = sp && sp.b === board.id ? [sp.x, sp.y] : !a.of && bp ? bp : (board.spawn || {})['a:' + a.i] || (host ? [host.x, host.y] : [Math.floor(board.w / 2), board.h - 1]);
      const p = freeNear(Math.min(board.w - 1, Math.max(0, want[0])), Math.min(board.h - 1, Math.max(0, want[1])));
      if (!p) return;
      at.set(key(p[0], p[1]), { kind: 'a', o: a, x: p[0], y: p[1], owner });
    });
    return { at, decor };
  }

  // ------------------------------------------------------------ отрисовка
  function heroPic(h) {
    const race = h.race;
    const base = race ? (race.isHalf && race.parents ? race.parents[0] : race.base) : null;
    const im = base && (window.RACE_IMAGES || {})[base.id];
    return im ? im.src : '';
  }
  function foePic(n) {
    const l = App.pics ? App.pics(n) : null;
    if (l && l[0]) return l[0].src;
    const r = raceOf(n), im = r && (window.RACE_IMAGES || {})[r.id];
    return im ? im.src : '';
  }
  // ГМ двигает всё; игрок — своего героя и союзника, привязанного к его герою
  const canMove = t => ctx && (ctx.gm || (t.kind === 'h' && t.o.owner === ctx.me) || (t.kind === 'a' && !!t.owner && t.owner.owner === ctx.me));
  // союзники: питомец, призванное существо, фамильяр (лист «механики») и НПС
  const ALLY_KINDS = {
    pet: ['питомец', 'полноценный член отряда: получает опыт вместе со всеми и может прокачивать характеристики'],
    summon: ['призванное существо', 'опыта не получает и не прокачивается, полностью подчиняется; пока призвано, блокирует ману призывателя — 25% от уровня существа'],
    familiar: ['фамильяр', 'питомец с контрактом: характеристики фамильяра и хозяина общие; если погибнет один, погибнет и второй'],
    npc: ['НПС, наёмник', 'союзник по сюжету']
  };
  const allyKind = a => (ALLY_KINDS[a.kind] || ALLY_KINDS.npc)[0];

  function tokenHtml(t, x, y) {
    const sel = App.ui.btSel === t.kind + ':' + (t.kind === 'h' ? t.o.id : t.o.i);
    const id = t.kind + ':' + (t.kind === 'h' ? t.o.id : t.o.i);
    const mov = canMove(t) ? ' can-move' : '';
    if (t.kind === 'o') {
      const d = info(t.o.t);
      return `<span class="bt-obj${d.fill ? ' fill-' + d.fill : ''}${mov}${sel ? ' is-sel' : ''}" data-tok="${esc(id)}" title="${esc(cap(d.n))}${d.c ? ' — ' + COVER[d.c] : ''}">${glyph(t.o.t)}${d.c ? `<i class="cv cv${d.c}" aria-hidden="true"></i>` : ''}</span>`;
    }
    const name = t.kind === 'h' ? t.o.name : t.o.n;
    const pic = t.kind === 'h' ? heroPic(t.o) : foePic(t.o.src || t.o.n);
    const ring = t.kind === 'h' ? ` style="--hue:${hue(t.o.owner || t.o.id)}"` : '';
    const mine = (t.kind === 'h' && ctx && t.o.owner === ctx.me) || (t.kind === 'a' && t.owner && ctx && t.owner.owner === ctx.me) ? ' mine' : '';
    const title = t.kind === 'h' ? `${name}${t.o.ownerName ? ' — игрок ' + t.o.ownerName : ''}`
      : t.kind === 'a' ? `${name} — ${allyKind(t.o)}${t.owner ? ' ' + t.owner.name : ''}${t.o.lvl ? ', ур. ' + t.o.lvl : ''}`
        : `${name}${t.o.lvl ? ', ур. ' + t.o.lvl : ''}`;
    return `<button type="button" class="bt-tok ${t.kind === 'h' ? 'hero' : t.kind === 'a' ? 'ally' : 'foe'}${mine}${mov}${sel ? ' is-sel' : ''}" data-tok="${esc(id)}"${ring} title="${esc(title)}" aria-label="${esc(title)}, клетка ${x + 1}:${y + 1}">
      ${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<b>${esc(initials(name))}</b>`}</button>`;
  }

  function boardHtml(board) {
    const { at, decor } = layout(board, ctx.heroes);
    let cells = '';
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        const k = key(x, y), t = at.get(k), dc = decor.get(k);
        const fill = (t && t.kind === 'o' && info(t.o.t).fill) || (dc && info(dc.t).fill);
        cells += `<div class="bt-cell${(x + y) % 2 ? ' alt' : ''}${fill ? ' cell-' + fill : ''}" data-act="btCell" data-x="${x}" data-y="${y}">${dc ? `<span class="bt-decor${ctx.gm && !t ? ' can-move' : ''}" data-tok="o:${esc(dc.i)}" title="${esc(cap(info(dc.t).n))} — объект на полу, можно встать">${glyph(dc.t)}</span>` : ''}${t ? tokenHtml(t, x, y) : ''}</div>`;
      }
    }
    return `<div class="bt-wrap"><div class="bt-grid bt-p-${esc(board.floor || board.preset)}" style="--w:${board.w};--h:${board.h}" data-board="${esc(board.id)}">${cells}</div></div>`;
  }

  function selInfo(board) {
    const s = App.ui.btSel;
    if (!s) return '';
    const [kind, id] = [s.slice(0, 1), s.slice(2)];
    const { at } = layout(board, ctx.heroes);
    const t = [...at.values()].find(v => v.kind === kind && (kind === 'h' ? v.o.id === id : v.o.i === id))
      || (kind === 'o' ? (() => { const o = board.objs.find(x => x.i === id); return o ? { kind: 'o', o } : null; })() : null);
    if (!t) return '';
    const pos = t.kind === 'h' || t.kind === 'a' ? [t.x, t.y] : [t.o.x, t.o.y];
    let text = '';
    if (t.kind === 'h') text = `<b>${esc(t.o.name)}</b> — герой${t.o.ownerName ? `, игрок ${esc(t.o.ownerName)}` : ''}`;
    else if (t.kind === 'a') text = `<b>${esc(t.o.n)}</b> — союзник: ${esc(allyKind(t.o))}${t.owner ? ` героя ${esc(t.owner.name)}` : ' отряда'}${t.o.lvl ? `, ур. ${esc(t.o.lvl)}` : ''} <span class="muted small">— ${esc((ALLY_KINDS[t.o.kind] || ALLY_KINDS.npc)[1])}</span>`;
    else if (t.kind === 'f') text = `<b>${esc(t.o.n)}</b> — противник${t.o.lvl ? `, ур. ${esc(t.o.lvl)}` : ''}`;
    else { const d = info(t.o.t); text = `<b>${esc(cap(d.n))}</b>${d.c ? ` — ${COVER[d.c]}` : d.walk ? ' — объект на полу, можно встать' : ' — без укрытия'}${d.drop ? ` · при разрушении: ${esc(d.drop)}` : ''}`; }
    return `<div class="bt-info">${text} <span class="muted small">клетка ${pos[0] + 1}:${pos[1] + 1}</span>
      ${ctx.gm && (t.kind === 'f' || t.kind === 'o') ? `<button type="button" class="linklike small danger" data-act="btRemove" data-v="${esc(s)}">убрать с поля</button>` : ''}
      <button type="button" class="linklike small" data-act="btSel" data-v="">закрыть</button></div>`;
  }

  function toolsHtml(board) {
    const tool = App.ui.btTool || '';
    const P = preset(board.preset);
    const chip = (v, label, ico) => `<button type="button" class="bt-chip${tool === v ? ' is-on' : ''}" data-act="btTool" data-v="${esc(v)}" aria-pressed="${tool === v}">${ico || ''}<span>${esc(label)}</span></button>`;
    const others = Object.keys(T).filter(t => !(t in P.set));
    return `<div class="bt-tools" role="toolbar" aria-label="Инструменты поля">
        ${chip('', 'Двигать', '<span class="bt-ico">✥</span>')}
        ${Object.keys(P.set).map(t => chip(t, cap(info(t).n), glyph(t))).join('')}
        <select data-change="btToolAny" aria-label="Другой предмет"><option value="">другой предмет…</option>${others.map(t => `<option value="${t}" ${tool === t ? 'selected' : ''}>${esc(cap(info(t).n))}</option>`).join('')}</select>
        ${chip('foe', 'Противник', '<span class="bt-ico foe">●</span>')}
        ${chip('erase', 'Ластик', '<span class="bt-ico">⌫</span>')}
      </div>
      ${tool === 'foe' ? `<div class="dev-row"><input type="text" list="btCreatures" data-ui="btFoeName" data-ui-target="none" value="${esc(App.ui.btFoeName || '')}" placeholder="кто (существо, раса или своё)" aria-label="Противник">
        <span class="muted small">нажмите на свободную клетку</span></div>${creatureList()}` : ''}
      ${tool && tool !== 'foe' ? `<p class="muted small">${tool === 'erase' ? 'Нажмите на предмет или противника, чтобы убрать.' : `Нажмите на свободную клетку, чтобы поставить «${esc(T[tool] ? info(tool).n : tool)}».`}</p>` : ''}`;
  }
  // подсказки для противника и союзника: существа из бестиария (после пароля ГМ) и расы
  function creatureList(id) {
    const cr = (D().creatures || []).map(c => [c.n, 'существо']);
    const rc = (D().races || []).map(r => [cap(r.name), 'раса']);
    const all = cr.concat(rc).filter(([n], i, a) => a.findIndex(x => R.norm(x[0]) === R.norm(n)) === i);
    return all.length ? `<datalist id="${id || 'btCreatures'}">${all.slice(0, 2500).map(([n, k]) => `<option value="${esc(n)}">${k}</option>`).join('')}</datalist>` : '';
  }
  // уровень и картинка по имени: сначала существо, потом раса
  const creatureOf = n => (D().creatures || []).find(c => R.norm(c.n) === R.norm(n)) || null;
  const raceOf = n => (D().races || []).find(r => R.norm(r.name) === R.norm(n)) || null;
  function levelOf(n) {
    const c = creatureOf(n);
    if (c) return R.roundLevel(c.lvl);
    const r = raceOf(n);
    return r ? R.roundLevel(r.lvl) : null;
  }

  function genForm(open) {
    const ui = (k, d) => esc(App.ui[k] !== undefined ? App.ui[k] : d);
    const list = presetList();
    const pre = App.ui.btPreset || (list[1] && list[1][1][0] ? list[1][1][0][0] : 'forest');
    const src = App.ui.btFoeSrc || 'bestiary';
    return `<details class="bt-new"${open ? ' open' : ''}><summary>${open ? 'Создать поле боя' : 'Новое поле боя'}</summary>
      <div class="form-grid bt-form">
        <label>Местность <select data-ui="btPreset" data-ui-target="none">${list.map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.map(([k, n]) => `<option value="${esc(k)}" ${pre === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label>Ширина <input type="number" min="${SIZE[0]}" max="${SIZE[1]}" step="1" data-ui="btW" data-ui-target="none" value="${ui('btW', 15)}"></label>
        <label>Высота <input type="number" min="${SIZE[0]}" max="${SIZE[1]}" step="1" data-ui="btH" data-ui-target="none" value="${ui('btH', 15)}"></label>
        <label>Предметов <select data-ui="btDensity" data-ui-target="none">${Object.entries(DENSITY).map(([k, d]) => `<option value="${k}" ${(App.ui.btDensity || 'mid') === k ? 'selected' : ''}>${d[1]}</option>`).join('')}</select></label>
        <label>Противников <input type="number" min="0" max="40" step="1" data-ui="btFoeN" data-ui-target="none" value="${ui('btFoeN', 4)}"></label>
        <label>Случайные — из <select data-ui="btFoeSrc" data-ui-target="none">${[['bestiary', 'бестиария'], ['races', 'рас'], ['mix', 'бестиария и рас']].map(([k, t]) => `<option value="${k}" ${src === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="wide">Кто именно <input type="text" data-ui="btFoeNames" data-ui-target="none" value="${ui('btFoeNames', '')}" placeholder="через запятую: существа, расы или свои имена; пусто — случайные по уровню отряда"></label>
      </div>
      <div class="row-actions"><button type="button" class="btn primary" data-act="btGen">Создать поле</button>
        <span class="muted small">Герои в игре встанут у нижнего края, противники — у верхнего.</span></div></details>`;
  }

  // o: { cid, camp, gm, me, heroes: [{ id, name, owner, ownerName, pos, race }], level, rerender, saveBoard(b), savePos(chid, pos) }
  function card(o) {
    ctx = o;
    const board = o.camp && o.camp.board;
    if (!board && !o.gm) return '';
    let html = `<section class="card battle-box" id="battle"><div class="sec-head"><h2>Поле боя</h2>${board ? `<span class="muted small">${esc(preset(board.preset).n)}, ${board.w}×${board.h}</span>` : ''}</div>`;
    if (!board) return html + '<p class="muted small">Клетчатое поле для боя: местность с укрытиями, герои и противники. Игроки двигают своих героев, вы — всё остальное.</p>' + genForm(true) + '</section>';
    html += `${o.gm ? toolsHtml(board) : '<p class="muted small">Перетащите своего героя (мышью или пальцем) или выберите его и двигайте стрелками.</p>'}
      ${board.fx ? `<p class="small bt-fx"><b>Эффект поля:</b> противникам — ${esc(board.fx.foe || 'нет')}; игрокам — ${esc(board.fx.hero || 'нет')}${board.fx.layer ? ` <span class="muted">(уровни мира: ${esc(board.fx.layer)})</span>` : ''}</p>` : ''}
      ${boardHtml(board)}
      ${selInfo(board)}
      <p class="small bt-legend"><i class="cv cv2"></i> полное укрытие — 40% что дальняя атака придётся в укрытие <i class="cv cv1"></i> половинное — 20% (складывается с уворотом, не больше 100%) · объекты на полу (трава, останки, лужи, ковёр) укрытия не дают, на них можно стоять · расстояние в клетках, по диагонали тоже 1</p>`;
    if (o.gm) html += `${genForm(false)}<div class="row-actions"><button type="button" class="linklike small danger" data-act="btClear">убрать поле боя</button></div>`;
    return html + '</section>';
  }

  // ------------------------------------------------------------ ходы
  function occupied(board, x, y, except) {
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return true;
    const { at } = layout(board, ctx.heroes);
    const t = at.get(key(x, y));
    return !!t && t !== except && !(except && t.kind === except.kind && (t.kind === 'h' ? t.o.id === except.o.id : t.o.i === except.o.i));
  }
  function findTok(board, id) {
    const kind = id.slice(0, 1), rid = id.slice(2);
    const { at, decor } = layout(board, ctx.heroes);
    for (const [k, t] of at) if (t.kind === kind && (kind === 'h' ? t.o.id === rid : t.o.i === rid)) { const [x, y] = k.split(',').map(Number); return { t, x, y }; }
    for (const [k, o] of decor) if (kind === 'o' && o.i === rid) { const [x, y] = k.split(',').map(Number); return { t: { kind: 'o', o }, x, y }; }
    return null;
  }
  function moveTo(id, x, y) {
    const board = ctx.camp.board;
    const hit = findTok(board, id);
    if (!hit || !canMove(hit.t)) return false;
    if (hit.x === x && hit.y === y) return false;
    const walk = hit.t.kind === 'o' && info(hit.t.o.t).walk;
    if (!walk && occupied(board, x, y, hit.t)) { App.toast('Клетка занята'); return false; }
    if (walk && board.objs.some(o => o.x === x && o.y === y && o !== hit.t.o && info(o.t).walk)) { App.toast('Здесь уже лежит декор'); return false; }
    if (hit.t.kind === 'h') { ctx.savePos(hit.t.o.id, { b: board.id, x, y }); return true; }
    // союзник героя — место в персонаже героя (его может менять игрок), союзник отряда — в поле
    if (hit.t.kind === 'a') {
      if (hit.t.o.of && hit.t.owner) { ctx.saveAllyPos(hit.t.o.of, hit.t.o.i, { b: board.id, x, y }); return true; }
      const nb = JSON.parse(JSON.stringify(board));
      nb.apos = Object.assign({}, nb.apos || {}, { [hit.t.o.i]: [x, y] });
      ctx.saveBoard(nb);
      return true;
    }
    const b = JSON.parse(JSON.stringify(board));
    const list = hit.t.kind === 'f' ? b.foes : b.objs;
    const it = list.find(z => z.i === hit.t.o.i);
    if (!it) return false;
    it.x = x; it.y = y;
    ctx.saveBoard(b);
    return true;
  }

  // перетаскивание: мышь и палец (Pointer Events); пока тянем — страница не перерисовывается
  let drag = null, wanted = false, justDragged = 0;
  function cellAt(cx, cy, grid) {
    const el = document.elementFromPoint(cx, cy);
    const c = el && el.closest('.bt-cell');
    return c && grid.contains(c) ? c : null;
  }
  document.addEventListener('pointerdown', e => {
    const tok = e.target.closest && e.target.closest('.bt-grid [data-tok].can-move');
    if (!tok || !ctx || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const grid = tok.closest('.bt-grid'), cell = tok.closest('.bt-cell');
    if (e.pointerType === 'mouse') e.preventDefault();          // без выделения текста; касание так не трогаем — иначе пропадёт нажатие
    drag = { id: tok.dataset.tok, tok, grid, from: [+cell.dataset.x, +cell.dataset.y], sx: e.clientX, sy: e.clientY, ghost: null, over: null, pid: e.pointerId };
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      const r = drag.tok.getBoundingClientRect();
      const g = drag.tok.cloneNode(true);
      g.classList.add('bt-ghost'); g.removeAttribute('data-tok');
      g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      g.insertAdjacentHTML('beforeend', '<span class="bt-dist"></span>');
      document.body.appendChild(g);
      drag.ghost = g; drag.w = r.width; drag.h = r.height;
      drag.tok.classList.add('is-dragging');
      document.body.classList.add('bt-dragging');
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.w / 2}px, ${e.clientY - drag.h / 2}px)`;
    const c = cellAt(e.clientX, e.clientY, drag.grid);
    if (drag.over && drag.over !== c) drag.over.classList.remove('drop-ok', 'drop-bad');
    drag.over = c;
    const lab = drag.ghost.querySelector('.bt-dist');
    if (c) {
      const to = [+c.dataset.x, +c.dataset.y];
      const hit = findTok(ctx.camp.board, drag.id);
      const walk = hit && hit.t.kind === 'o' && info(hit.t.o.t).walk;
      const ok = (to[0] === drag.from[0] && to[1] === drag.from[1]) || walk || !occupied(ctx.camp.board, to[0], to[1], hit && hit.t);
      c.classList.toggle('drop-ok', ok); c.classList.toggle('drop-bad', !ok);
      lab.textContent = dist(drag.from, to) + ' кл.';
    } else lab.textContent = '';
  }, { passive: false });
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag;
    drag = null;
    document.body.classList.remove('bt-dragging');
    if (d.over) d.over.classList.remove('drop-ok', 'drop-bad');
    if (d.ghost) {
      d.ghost.remove();
      d.tok.classList.remove('is-dragging');
      justDragged = Date.now();
      if (!cancel && d.over) {
        const to = [+d.over.dataset.x, +d.over.dataset.y];
        if (moveTo(d.id, to[0], to[1])) { wanted = false; return; }
      }
    }
    if (wanted) { wanted = false; ctx && ctx.rerender(); }
  }
  // браузер не должен начинать своё перетаскивание картинки или значка — оно отменяет наше
  document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.bt-grid')) e.preventDefault(); });
  document.addEventListener('pointerup', e => endDrag(e, false));
  document.addEventListener('pointercancel', e => endDrag(e, true));
  // стрелки: выбранная (в фокусе) фишка на клетку в сторону
  document.addEventListener('keydown', e => {
    const tok = e.target.closest && e.target.closest('.bt-grid [data-tok].can-move');
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!tok || !dir || !ctx) return;
    e.preventDefault();
    const cell = tok.closest('.bt-cell'), id = tok.dataset.tok;
    if (moveTo(id, +cell.dataset.x + dir[0], +cell.dataset.y + dir[1])) {
      App.ui.btSel = id;
      requestAnimationFrame(() => { const t = document.querySelector(`.bt-grid [data-tok="${id}"]`); if (t) t.focus({ preventScroll: true }); });
    }
  });

  // ------------------------------------------------------------ действия
  // случайные противники по уровню отряда: из бестиария (без боссов и легенд), из рас или вперемешку
  function randomFoes(n, src) {
    const cr = src === 'races' ? [] : (D().creatures || []).filter(c => c.cat !== 'босс' && c.cat !== 'легенда' && !/босс|легенд/i.test(c.sec || '')).map(c => ({ n: c.n, lvl: R.roundLevel(c.lvl) }));
    const rc = src === 'bestiary' && cr.length ? [] : (D().races || []).filter(r => r.id !== 'полукровка').map(r => ({ n: cap(r.name), lvl: R.roundLevel(r.lvl) }));
    const all = cr.concat(rc);
    if (!all.length) return Array.from({ length: n }, (_, k) => ({ n: `Противник ${k + 1}` }));
    const lvl = Math.max(1, Math.round(ctx.level || 1));
    const lo = Math.max(0, Math.round(lvl * 0.5)), hi = Math.round(lvl * 1.5) + 2;
    let pool = all.filter(c => c.lvl >= lo && c.lvl <= hi);
    if (!pool.length) pool = all;
    const kinds = Array.from({ length: Math.min(3, n) }, () => pool[rnd(pool.length)]);
    return Array.from({ length: n }, (_, k) => Object.assign({}, kinds[k % kinds.length]));
  }
  function make(pid, foes, size) {
    const w = size ? size[0] : +App.ui.btW || 15, h = size ? size[1] : +App.ui.btH || 15;
    const b = generate({ w, h, preset: pid, density: App.ui.btDensity || 'mid', foes, heroes: ctx.heroes.map(x => x.id), allies: (ctx.allies || []).map(a => a.i) });
    App.ui.btSel = null; App.ui.btTool = '';
    ctx.saveBoard(b);
    App.toast(`Поле боя готово: ${preset(b.preset).n}, ${b.w}×${b.h}`);
    requestAnimationFrame(() => { const el = document.getElementById('battle'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  Object.assign(App.actions, {
    btGen() {
      if (!ctx || !ctx.gm) return;
      if (ctx.camp.board && !confirm('Заменить нынешнее поле боя новым?')) return;
      const raw = App.ui.btFoeN;
      const n = raw === undefined || raw === '' ? 4 : Math.max(0, Math.min(40, Math.round(+raw) || 0));
      const names = String(App.ui.btFoeNames || '').split(',').map(s => s.trim()).filter(Boolean);
      const foes = names.length ? Array.from({ length: Math.max(n, names.length) }, (_, k) => { const nm = names[k % names.length]; return { n: nm, lvl: levelOf(nm) }; }) : randomFoes(n, App.ui.btFoeSrc || 'bestiary');
      make(App.ui.btPreset || 'forest', foes);
    },
    btClear() {
      if (!ctx || !ctx.gm || !confirm('Убрать поле боя у всех участников?')) return;
      App.ui.btSel = null;
      ctx.saveBoard(null);
    },
    btTool(b) { App.ui.btTool = b.dataset.v; App.ui.btSel = null; ctx && ctx.rerender(); },
    btToolAny(t) { App.ui.btTool = t.value; App.ui.btSel = null; ctx && ctx.rerender(); },
    btSel(b) { App.ui.btSel = b.dataset.v || null; ctx && ctx.rerender(); },
    btCell(el) {
      if (!ctx || !ctx.camp.board || Date.now() - justDragged < 250) return;
      const board = ctx.camp.board, x = +el.dataset.x, y = +el.dataset.y;
      const tool = ctx.gm ? (App.ui.btTool || '') : '';
      const { at, decor } = layout(board, ctx.heroes);
      const t = at.get(key(x, y)), dc = decor.get(key(x, y));
      if (!tool) {
        const id = t ? t.kind + ':' + (t.kind === 'h' ? t.o.id : t.o.i) : dc ? 'o:' + dc.i : null;
        App.ui.btSel = App.ui.btSel === id ? null : id;
        ctx.rerender();
        return;
      }
      const b = JSON.parse(JSON.stringify(board));
      if (tool === 'erase') {
        if (t && (t.kind === 'h' || t.kind === 'a')) { App.toast(t.kind === 'h' ? 'Героев с поля не убрать' : 'Союзника убирают из отряда — в списке «Союзники отряда»'); return; }
        const target = t || (dc ? { kind: 'o', o: dc } : null);
        if (!target) return;
        if (target.kind === 'f') b.foes = b.foes.filter(z => z.i !== target.o.i); else b.objs = b.objs.filter(z => z.i !== target.o.i);
        ctx.saveBoard(b);
        return;
      }
      const isWalk = T[tool] && info(tool).walk;
      if (isWalk ? !!dc : !!t) { App.toast('Клетка занята'); return; }
      if (tool === 'foe') {
        const n = String(App.ui.btFoeName || '').trim() || `Противник ${b.foes.length + 1}`;
        b.foes.push({ i: newId('f'), n, lvl: levelOf(n), x, y });
      } else if (T[tool]) b.objs.push({ i: newId('o'), t: tool, x, y });
      else return;
      ctx.saveBoard(b);
    },
    btRemove(b) {
      if (!ctx || !ctx.gm) return;
      const s = b.dataset.v, kind = s.slice(0, 1), id = s.slice(2);
      const nb = JSON.parse(JSON.stringify(ctx.camp.board));
      if (kind === 'f') nb.foes = nb.foes.filter(z => z.i !== id); else nb.objs = nb.objs.filter(z => z.i !== id);
      App.ui.btSel = null;
      ctx.saveBoard(nb);
    }
  });

  // комната подземелья → поле боя: местность по виду комнаты, противники из комнаты
  function fromRoom(r) {
    if (!ctx || !ctx.gm) return;
    if (ctx.camp.board && !confirm('Заменить нынешнее поле боя комнатой подземелья?')) return;
    const pid = r.type === 'special' ? (ROOM_PRESET[r.sub] || 'dungeon') : 'dungeon';
    const foes = [];
    (r.foes || []).forEach(fo => { for (let k = 0; k < (fo.q || 1); k++) foes.push({ n: fo.n, lvl: fo.lvl || null }); });
    App.ui.btPreset = pid;
    make(pid, foes, [12, 12]);
  }

  // пока фишку тянут, перерисовка откладывается (её попросят — сделаем после)
  function busy() { if (drag) wanted = true; return !!drag; }
  const ready = () => !!(ctx && ctx.gm);

  // ------------------------------------------------------------ союзники отряда (страница кампании)
  // o: { gm, heroes: [{ id, name }], allies, save(list) } — список хранится в кампании (allies), меняет ГМ
  let party = null;
  function alliesBlock(o) {
    party = o;
    const list = o.allies || [];
    if (!list.length && !o.gm) return '';
    const heroName = id => (o.heroes.find(h => h.id === id) || {}).name || '';
    let html = `<div class="party-allies"><div class="sec-head"><h3>Союзники отряда</h3>${list.length ? `<span class="tag">${list.length}</span>` : ''}</div>`;
    html += list.length ? `<ul class="char-grid ally-grid">${list.map(a => {
      const pic = foePic(a.src || a.n);
      return `<li><div class="char-card card ally-card">${pic ? `<span class="portrait mini"><span class="pic"><img src="${esc(pic)}" alt="" loading="lazy" decoding="async"></span></span>` : `<span class="ally-ini" aria-hidden="true">${esc(initials(a.n))}</span>`}
        <span class="cc-body"><span class="cc-name">${esc(a.n)}</span>
          <span class="small">${esc(cap(allyKind(a)))}${a.of && heroName(a.of) ? ` героя ${esc(heroName(a.of))}` : ' отряда'}${a.lvl ? `, ур. ${R.fmt(a.lvl)}` : ''}</span>
          ${a.src && R.norm(a.src) !== R.norm(a.n) ? `<span class="small muted">${esc(cap(a.src))}</span>` : ''}
          ${o.gm ? `<button type="button" class="linklike small danger" data-act="alDel" data-v="${esc(a.i)}">убрать из отряда</button>` : ''}</span></div></li>`;
    }).join('')}</ul>` : '<p class="muted small">Союзников пока нет: питомцы, призванные существа, фамильяры и НПС появятся здесь и на поле боя.</p>';
    if (o.gm) {
      const ui = k => esc(App.ui[k] || '');
      html += `<details class="ally-new"><summary>Добавить союзника</summary>
        <div class="form-grid">
          <label>Кто <input type="text" list="alCreatures" data-ui="alName" data-ui-target="none" value="${ui('alName')}" placeholder="существо, раса или своё"></label>
          <label>Имя <input type="text" data-ui="alNick" data-ui-target="none" value="${ui('alNick')}" maxlength="60" placeholder="кличка (необязательно)"></label>
          <label>Вид <select data-ui="alKind" data-ui-target="none">${Object.entries(ALLY_KINDS).map(([k, v]) => `<option value="${k}" ${(App.ui.alKind || 'pet') === k ? 'selected' : ''}>${esc(cap(v[0]))}</option>`).join('')}</select></label>
          <label>Чей <select data-ui="alOf" data-ui-target="none"><option value="">всего отряда</option>${o.heroes.map(h => `<option value="${esc(h.id)}" ${App.ui.alOf === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
          <label>Уровень <input type="number" min="0" step="1" data-ui="alLvl" data-ui-target="none" value="${ui('alLvl')}" placeholder="по таблице"></label>
        </div>
        <div class="row-actions"><button type="button" class="btn small primary" data-act="alAdd">Добавить в отряд</button></div>
        <ul class="small muted ally-rules">${Object.values(ALLY_KINDS).map(([t, d]) => `<li><b>${esc(cap(t))}</b> — ${esc(d)}</li>`).join('')}</ul>
        <p class="muted small">Союзника героя игрок может сам двигать на поле боя.</p></details>${creatureList('alCreatures')}`;
    }
    return html + '</div>';
  }
  Object.assign(App.actions, {
    alAdd() {
      if (!party || !party.gm) return;
      const src = String(App.ui.alName || '').trim(), nick = String(App.ui.alNick || '').trim();
      if (!src && !nick) { App.toast('Впишите, кто это'); return; }
      const lvlIn = Math.round(+App.ui.alLvl || 0);
      const a = { i: newId('a'), n: nick || cap(src), src, kind: App.ui.alKind || 'pet', of: App.ui.alOf || '', lvl: lvlIn > 0 ? lvlIn : levelOf(src || nick) };
      ['alName', 'alNick', 'alLvl'].forEach(k => { App.ui[k] = ''; });
      party.save((party.allies || []).concat(a));
      App.toast(`В отряде новый союзник: ${a.n}`);
    },
    alDel(b) {
      if (!party || !party.gm) return;
      const a = (party.allies || []).find(x => x.i === b.dataset.v);
      if (!a || !confirm(`Убрать «${a.n}» из отряда?`)) return;
      party.save(party.allies.filter(x => x.i !== a.i));
    }
  });

  window.Battle = { card, generate, fromRoom, busy, ready, alliesBlock, PRESETS, TYPES: T };
})();
