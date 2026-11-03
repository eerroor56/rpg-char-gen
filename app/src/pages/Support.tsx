import { toast } from '../lib/legacy';
import { Icon } from '../ui/Icon';

// реквизиты те же, что в js/support.js прежней версии (QR — img/support/*.svg, проверены обратным чтением)
const SBP = 'https://www.sberbank.ru/ru/choise_bank?requisiteNumber=79877917443&bankCode=100000000111';
const TG = 'whiskast';
const WAYS = [
  { id: 'usdt', title: 'USDT', net: 'в сети TON', coin: '₮', addr: 'UQDE2EriTwBEZx7My2KHyuvEDBamY-pS-Up37d1iyXNPXi7M', warn: 'Отправляйте только USDT в сети TON — монеты из других сетей потеряются.' },
  { id: 'ton', title: 'TON', net: 'Toncoin', coin: '◇', addr: 'UQB95yjgUybC80QalqnRFTYmaoH1tymfeFBexjCgwptfsjtB', warn: 'Только TON и токены в сети TON — иначе средства могут потеряться.' },
];

function copy(text: string) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Адрес скопирован'), () => prompt('Скопируйте адрес:', text));
  else prompt('Скопируйте адрес:', text);
}

export default function Support() {
  return (
    <div className="page support">
      <section className="sup-hero">
        <Icon name="heart" className="sup-heart" />
        <h1>Поддержать мастерскую</h1>
        <p className="lead">«Мастерская героя» делается для нашей игры — без рекламы и подписок. Если сайт пригодился, можно поддержать автора: любая сумма помогает развивать его дальше.</p>
      </section>
      <div className="sup-grid">
        <article className="sup-card sup-sbp">
          <header><span className="sup-coin">₽</span><h2>СБП <small>из любого банка</small></h2></header>
          <div className="sup-qr"><img src="img/support/sbp.svg" width={240} height={240} alt="QR-код: перевод через СБП" /></div>
          <a className="btn primary" href={SBP} target="_blank" rel="noopener">Перевести через СБП</a>
          <p className="sup-link"><a href={SBP} target="_blank" rel="noopener">{SBP}</a></p>
        </article>
        {WAYS.map(w => (
          <article key={w.id} className={`sup-card sup-${w.id}`}>
            <header><span className="sup-coin">{w.coin}</span><h2>{w.title} <small>{w.net}</small></h2></header>
            <div className="sup-qr"><img src={`img/support/${w.id}.svg`} width={240} height={240} alt={`QR-код: адрес ${w.title} в сети TON`} /></div>
            <code className="sup-addr">{w.addr}</code>
            <button type="button" className="btn small" onClick={() => copy(w.addr)}><Icon name="copy" />Скопировать адрес</button>
            <p className="sup-warn">{w.warn}</p>
          </article>
        ))}
      </div>
      <section className="sup-tg card">
        <div><h2>Telegram</h2><p>Вопросы, идеи и найденные ошибки — пишите: <a href={`https://t.me/${TG}`} target="_blank" rel="noopener">@{TG}</a></p></div>
        <a className="btn" href={`https://t.me/${TG}`} target="_blank" rel="noopener">Написать</a>
      </section>
    </div>
  );
}
