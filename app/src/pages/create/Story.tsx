import { Field, set, type StepProps } from './kit';

/* Шаг 8 — имя, внешность, предыстория: для листа и для ГМ */
export default function Story({ st }: StepProps) {
  const txt = (k: string) => ({ value: st[k] || '', onChange: (e: { target: { value: string } }) => set(k, e.target.value, true) });
  return (
    <div className="card fgrid story">
      <Field label="Имя персонажа"><input type="text" {...txt('name')} maxLength={80} autoComplete="off" required /></Field>
      <Field label="Игрок"><input type="text" {...txt('player')} maxLength={80} /></Field>
      <Field label="Пол / обращение"><input type="text" {...txt('gender')} maxLength={60} /></Field>
      <Field label="Внешность" wide><textarea rows={3} {...txt('look')} /></Field>
      <Field label="Предыстория" wide><textarea rows={7} {...txt('story')} /></Field>
      <Field label="Мотивация" wide><textarea rows={3} {...txt('motive')} /></Field>
      <Field label={<>Бонусы за предысторию <span className="muted">(необязательно — их назначает ГМ)</span></>} wide>
        <textarea rows={3} {...txt('gmBonus')} placeholder="За предысторию и мотивацию ГМ может дать бонусы и предметы — вплоть до того, что нигде не прописано" />
      </Field>
    </div>
  );
}
