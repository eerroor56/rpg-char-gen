import { useState, type FormEvent } from 'react';
import { cloudCall } from '../lib/legacy';

/** вход: Google или почта (вход, регистрация, сброс пароля) — общий для «Моих героев» и «Игры» */
export function SignIn({ big }: { big?: boolean }) {
  const [mode, setMode] = useState<'' | 'in' | 'up'>('');
  const [f, setF] = useState({ name: '', email: '', pw: '' });
  const C = window.Cloud;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'up') cloudCall(() => C.signUp(f.name.trim() || 'Игрок', f.email.trim(), f.pw), 'Аккаунт создан');
    else cloudCall(() => C.signIn(f.email.trim(), f.pw));
  };
  if (!mode) return (
    <div className="row">
      <button className={'btn primary' + (big ? ' big' : '')} type="button" onClick={() => cloudCall(() => C.google())}>Войти через Google</button>
      <button className={'btn' + (big ? ' big' : '')} type="button" onClick={() => setMode('in')}>Войти по почте</button>
    </div>
  );
  return (
    <form className="acc-form" onSubmit={submit}>
      {mode === 'up' && <input required placeholder="Имя в игре — его увидят ГМ и игроки" maxLength={40} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="nickname" />}
      <input required type="email" placeholder="Почта" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" />
      <input required type="password" minLength={6} placeholder="Пароль" value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
      <div className="row">
        <button className="btn primary" type="submit">{mode === 'up' ? 'Создать аккаунт' : 'Войти'}</button>
        <button className="btn ghost" type="button" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? 'У меня есть аккаунт' : 'Создать аккаунт'}</button>
        {mode === 'in' && <button className="link" type="button" onClick={() => f.email ? cloudCall(() => C.reset(f.email.trim()), 'Письмо для смены пароля отправлено') : window.App.toast('Впишите почту')}>забыли пароль?</button>}
      </div>
      {C.mode === 'local' && <p className="muted small">Тестовый режим (?cloud=local): всё хранится в этом браузере, вход — по любому имени.</p>}
    </form>
  );
}
