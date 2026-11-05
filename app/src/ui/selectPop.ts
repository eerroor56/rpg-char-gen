/*
 * Выпадающие списки в стиле сайта вместо системного списка у <select> (компьютер, мышь).
 * Системный список браузер рисует сам — прямоугольным и вплотную к полю со скруглёнными углами, отсюда «зазоры» по углам;
 * стилями это не исправить. Здесь — свой список той же ширины, пристыкованный к полю: поле и список выглядят цельными.
 * Выбор отдаётся полю как обычное изменение (value + события input и change), поэтому React (onChange) и прежний код
 * (data-change) ничего не замечают — как у подсказок в полях (js/combo.js).
 * На телефоне и планшете (палец) остаётся системный выбор: там это удобное нижнее меню, без зазоров.
 * Клавиши: Enter, пробел, Alt+↓ — открыть; ↑ ↓ Home End — выбрать; Enter — подтвердить; Esc, Tab — закрыть.
 */
type Item = { el: HTMLElement; value: string; disabled: boolean };

let pop: HTMLDivElement | null = null;
let sel: HTMLSelectElement | null = null;
let items: Item[] = [];
let active = -1;
let typed = '', typedAt = 0;

const fine = () => window.matchMedia('(pointer: fine)').matches;
const usable = (s: Element | null): s is HTMLSelectElement =>
  !!s && s instanceof HTMLSelectElement && !s.multiple && !s.disabled && (s.size || 1) <= 1 && !s.closest('[data-native-select]');

function setValue(s: HTMLSelectElement, v: string) {
  if (s.value === v) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, v);
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
}

function close(refocus = false) {
  if (!pop || !sel) return;
  const s = sel;
  pop.remove(); pop = null; sel = null; items = []; active = -1;
  s.classList.remove('sel-open', 'sel-open-up');
  s.removeAttribute('aria-expanded');
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  if (refocus) s.focus({ preventScroll: true });
}

function mark(i: number, scroll = true) {
  if (active >= 0 && items[active]) items[active].el.classList.remove('is-active');
  active = i;
  if (i >= 0 && items[i]) { items[i].el.classList.add('is-active'); if (scroll) items[i].el.scrollIntoView({ block: 'nearest' }); }
}
function step(d: number) {
  if (!items.length) return;
  let i = active;
  for (let k = 0; k < items.length; k++) {
    i = Math.min(items.length - 1, Math.max(0, i + d));
    if (!items[i].disabled) break;
    if (i === 0 || i === items.length - 1) break;
  }
  if (!items[i].disabled) mark(i);
}
function choose(i: number) {
  const s = sel, it = items[i];
  if (!s || !it || it.disabled) return;
  close(true);
  setValue(s, it.value);
}

// место: под полем, а если снизу мало места — над ним; ширина — как у поля
function place() {
  if (!pop || !sel) return;
  const r = sel.getBoundingClientRect(), vh = window.innerHeight;
  const below = vh - r.bottom - 8, above = r.top - 8;
  // сначала ширина (от неё зависит перенос строк), потом — сколько нужно по высоте
  Object.assign(pop.style, { left: r.left + 'px', width: r.width + 'px', maxHeight: 'none' });
  const want = Math.min(pop.scrollHeight + 2, 340);
  const up = below < Math.min(want, 200) && above > below;
  const h = Math.max(120, Math.min(want, up ? above : below));
  const cs = getComputedStyle(sel);
  const rad = cs.borderBottomLeftRadius;
  Object.assign(pop.style, { left: r.left + 'px', width: r.width + 'px', maxHeight: h + 'px', top: up ? '' : r.bottom - 1 + 'px', bottom: up ? vh - r.top - 1 + 'px' : '',
    borderRadius: up ? `${rad} ${rad} 0 0` : `0 0 ${rad} ${rad}`, fontSize: cs.fontSize });
  pop.classList.toggle('is-up', up);
  sel.classList.toggle('sel-open-up', up);
}
// прокрутка самого списка его не закрывает; прокрутка страницы — двигает вслед за полем, а если поле ушло с экрана — закрывает
function onScroll(e: Event) {
  if (!pop || !sel || (e.target instanceof Node && pop.contains(e.target))) return;
  const r = sel.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) close(); else place();
}
function onResize() { close(); }

function open(s: HTMLSelectElement) {
  close();
  sel = s;
  pop = document.createElement('div');
  pop.className = 'sel-pop';
  pop.setAttribute('role', 'listbox');
  const list: Item[] = [];
  const add = (o: HTMLOptionElement, parent: HTMLElement) => {
    if (o.hidden) return;
    const el = document.createElement('div');
    el.className = 'sel-opt' + (o.disabled ? ' is-off' : '') + (o.selected ? ' is-cur' : '');
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(o.selected));
    el.textContent = o.textContent || o.value;
    const i = list.length;
    el.addEventListener('mousedown', e => e.preventDefault());       // фокус остаётся на поле
    el.addEventListener('click', () => choose(i));
    el.addEventListener('mousemove', () => { if (active !== i && !o.disabled) mark(i, false); });
    parent.appendChild(el);
    list.push({ el, value: o.value, disabled: o.disabled });
  };
  [...s.children].forEach(ch => {
    if (ch instanceof HTMLOptGroupElement) {
      const h = document.createElement('div');
      h.className = 'sel-group';
      h.textContent = ch.label;
      pop!.appendChild(h);
      [...ch.children].forEach(o => { if (o instanceof HTMLOptionElement) add(o, pop!); });
    } else if (ch instanceof HTMLOptionElement) add(ch, pop!);
  });
  items = list;
  pop.addEventListener('mousedown', e => e.preventDefault());
  document.body.appendChild(pop);
  s.classList.add('sel-open');
  s.setAttribute('aria-expanded', 'true');
  place();
  mark(Math.max(0, s.selectedIndex >= 0 ? items.findIndex(x => x.value === s.value) : 0));
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
}

export function initSelectPop() {
  // мышь: вместо системного списка — свой (только у «тонкого» указателя)
  document.addEventListener('mousedown', e => {
    if (pop && e.target instanceof Node && pop.contains(e.target)) return;
    const s = e.target instanceof Element ? e.target.closest('select') : null;
    if (e.button !== 0 || !usable(s) || !fine()) { if (pop) close(); return; }
    e.preventDefault();
    if (sel === s) { close(true); return; }
    s.focus({ preventScroll: true });
    open(s);
  }, true);
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (pop && sel && t === sel) {
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); mark(items.findIndex(x => !x.disabled)); }
      else if (e.key === 'End') { e.preventDefault(); for (let i = items.length - 1; i >= 0; i--) if (!items[i].disabled) { mark(i); break; } }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close();
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // набор первых букв — к подходящему варианту
        const now = Date.now();
        typed = (now - typedAt > 700 ? '' : typed) + e.key.toLowerCase(); typedAt = now;
        const i = items.findIndex(x => !x.disabled && (x.el.textContent || '').toLowerCase().startsWith(typed));
        if (i >= 0) mark(i);
      }
      return;
    }
    // клавиатура на закрытом поле: открыть своим списком (стрелки без Alt меняют выбор как обычно)
    if (usable(t instanceof Element ? t : null) && fine() && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) {
      e.preventDefault();
      open(t as HTMLSelectElement);
    }
  }, true);
  // поле убрали со страницы (перерисовка) или ушли со страницы — список закрывается
  document.addEventListener('focusout', e => { if (pop && e.target === sel) setTimeout(() => { if (sel && document.activeElement !== sel) close(); }, 0); });
  window.addEventListener('hashchange', () => close());
}
