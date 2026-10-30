/*
 * «Поддержать» (кнопка справа в шапке, #support): перевод автору через СБП и криптовалютой (USDT и TON в сети TON),
 * контакт в Telegram. QR-коды — img/support/*.svg: собраны по данным из QR самих приложений (ссылка СБП, адреса
 * кошельков TON — с проверенной контрольной суммой) и проверены обратным чтением.
 */
(function () {
  'use strict';
  const App = window.App;
  const esc = App.esc;

  const SBP = 'https://www.sberbank.ru/ru/choise_bank?requisiteNumber=79877917443&bankCode=100000000111';
  const TG = 'whiskast';
  const WAYS = [
    { id: 'usdt', title: 'USDT', net: 'в сети TON', addr: 'UQDE2EriTwBEZx7My2KHyuvEDBamY-pS-Up37d1iyXNPXi7M',
      warn: 'Отправляйте только USDT в сети TON — монеты из других сетей потеряются.' },
    { id: 'ton', title: 'TON', net: 'Toncoin', addr: 'UQB95yjgUybC80QalqnRFTYmaoH1tymfeFBexjCgwptfsjtB',
      warn: 'Только TON и токены в сети TON — иначе средства могут потеряться.' }
  ];
  const HEART = '<svg class="sup-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.3 4 7 4c2.1 0 3.6 1.1 5 2.9C13.4 5.1 14.9 4 17 4c3.7 0 5.8 3.7 4.4 7.2-1.9 4.7-9.4 9.3-9.4 9.3z"/></svg>';
  const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const qr = (id, alt) => `<div class="sup-qr"><img src="img/support/${id}.svg" width="240" height="240" alt="${esc(alt)}" loading="lazy" decoding="async"></div>`;

  function render(el) {
    const crypto = WAYS.map(w => `<article class="sup-card sup-${w.id}">
        <header><span class="sup-coin">${w.id === 'usdt' ? '₮' : '◇'}</span><h2>${w.title} <span>${esc(w.net)}</span></h2></header>
        ${qr(w.id, `QR-код: адрес ${w.title} в сети TON`)}
        <p class="sup-label">Адрес кошелька</p>
        <div class="sup-addr"><code>${esc(w.addr)}</code>
          <button type="button" class="btn small" data-act="supCopy" data-v="${esc(w.addr)}">${COPY}<span>Скопировать</span></button></div>
        <p class="sup-warn">${esc(w.warn)}</p>
      </article>`).join('');
    el.innerHTML = `<div class="page support">
      <section class="sup-hero">${HEART}
        <h1>Поддержать мастерскую</h1>
        <p class="lead">«Мастерская героя» делается для нашей игры — без рекламы и подписок. Если сайт пригодился и хочется сказать спасибо, можно поддержать автора: любая сумма помогает развивать его дальше.</p>
      </section>
      <div class="sup-grid">
        <article class="sup-card sup-sbp">
          <header><span class="sup-coin">₽</span><h2>СБП <span>из любого банка</span></h2></header>
          ${qr('sbp', 'QR-код: перевод через СБП')}
          <p class="sup-label">Наведите камеру телефона на QR или откройте ссылку:</p>
          <a class="btn primary sup-go" href="${esc(SBP)}" target="_blank" rel="noopener">Перевести через СБП</a>
          <p class="sup-link"><a href="${esc(SBP)}" target="_blank" rel="noopener">${esc(SBP)}</a></p>
          <p class="sup-warn soft">Откроется страница Сбербанка: выберите свой банк — перевод пройдёт по номеру через СБП.</p>
        </article>
        ${crypto}
      </div>
      <section class="sup-tg">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.7 0 2l4.6 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.6 3.4c.6.4 1.4.1 1.6-.6l3.3-15.4c.2-.9-.6-1.6-1.5-1.3z"/><path d="m7.5 14.9 9.6-6.3-6.9 7.6"/></svg>
        <div><h2>Telegram</h2>
          <p>Вопросы, идеи и найденные ошибки — пишите: <a href="https://t.me/${TG}" target="_blank" rel="noopener">@${TG}</a></p></div>
        <a class="btn" href="https://t.me/${TG}" target="_blank" rel="noopener">Написать</a>
      </section>
      <p class="muted small sup-thanks">Спасибо, что играете с нами!</p>
    </div>`;
  }

  Object.assign(App.actions, {
    supCopy(b) {
      const text = b.dataset.v;
      const done = () => App.toast('Адрес скопирован');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Скопируйте адрес:', text));
      else prompt('Скопируйте адрес:', text);
    }
  });

  window.Support = { render };
})();
