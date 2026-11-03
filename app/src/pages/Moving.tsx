import { OLD_SITE } from '../lib/legacy';
import { Icon, type IconName } from '../ui/Icon';

// раздел ещё не перенесён в новую версию — открывается в прежней (данные общие: облако и тот же аккаунт)
export default function Moving({ section }: { section: { id: string; title: string; icon: IconName; lead: string } }) {
  const href = OLD_SITE + location.hash;
  return (
    <div className="page">
      <div className="moving card">
        <span className="moving-ic"><Icon name={section.icon} /></span>
        <h1>{section.title}</h1>
        <p className="lead">{section.lead}.</p>
        <p>Этот раздел переносится в новую версию. Пока он работает в прежней — данные там те же: кампании и герои в облаке, вход тот же.</p>
        <a className="btn primary big" href={href} target="_blank" rel="noopener">Открыть «{section.title}» <Icon name="external" /></a>
      </div>
    </div>
  );
}
