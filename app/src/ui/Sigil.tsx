/**
 * фон шапки главной и «Игры», как на прежнем сайте: медленно вращающийся знак (два круга и две пентаграммы) и тёплое
 * свечение. Оборот — 2 минуты; поворот считается от часов, поэтому при переходе между страницами знак не «прыгает» в начало.
 */
export function Sigil() {
  return (
    <div className="sigil" aria-hidden="true" style={{ animationDelay: `-${((Date.now() / 1000) % 120).toFixed(1)}s` }}>
      <svg viewBox="0 0 200 200">
        <circle className="ring" cx="100" cy="100" r="92" />
        <circle className="ring thin" cx="100" cy="100" r="80" />
        <polygon points="100,22 174,76 146,162 54,162 26,76" />
        <polygon className="inner" points="100,54 144,86 127,138 73,138 56,86" />
      </svg>
    </div>
  );
}
