import { Component, type ReactNode } from 'react';

/** ошибка в разделе не обрушивает весь сайт: вместо пустого экрана — сообщение и кнопка «Обновить» */
export class Guard extends Component<{ children: ReactNode; at: string }, { err: Error | null; at: string }> {
  state = { err: null as Error | null, at: '' };
  static getDerivedStateFromError(err: Error) { return { err }; }
  static getDerivedStateFromProps(p: { at: string }, s: { err: Error | null; at: string }) {
    return p.at !== s.at ? { err: null, at: p.at } : null;   // перешли в другой раздел — пробуем снова
  }
  componentDidCatch(err: Error) { console.error(err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page"><div className="card wstack">
        <h2>Здесь что-то сломалось</h2>
        <p className="muted">Раздел не открылся из-за ошибки на сайте. Остальные разделы работают. Обновите страницу; если не поможет — напишите, что нажимали.</p>
        <p className="muted small">{String(this.state.err.message || this.state.err)}</p>
        <div className="row"><button type="button" className="btn primary" onClick={() => location.reload()}>Обновить страницу</button><a className="btn ghost" href="#home">На главную</a></div>
      </div></div>
    );
  }
}
