import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { NotifyChannel, PrincipleFolder } from '../../api/types';
import { CHANNEL_LABEL, WEEKDAY_SHORT } from '../../lib/labels';
import { Icon } from '../Icon';
import { ErrorText, Modal } from '../ui';

const ALL_CHANNELS: NotifyChannel[] = ['push', 'whatsapp'];

/** Lembrete de UMA pasta/categoria: cada categoria tem seus próprios dias e horários — a notificação nunca leva o texto do princípio. */
export function ScheduleModal({ folder, onClose }: { folder: PrincipleFolder; onClose: () => void }) {
  const { reminder } = folder;
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [times, setTimes] = useState<string[]>(reminder.times.length ? reminder.times : ['08:00']);
  const [weekdays, setWeekdays] = useState<number[]>(reminder.weekdays);
  const [channels, setChannels] = useState<NotifyChannel[]>(reminder.channels);

  const save = useAction((p: object) => api.put<PrincipleFolder>(`/principles/folders/${folder.id}/reminder`, p), onClose);

  const toggleDay = (d: number) => setWeekdays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  const toggleChannel = (c: NotifyChannel) => setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const setTime = (i: number, v: string) => setTimes((ts) => ts.map((t, j) => (j === i ? v : t)));
  const addTime = () => setTimes((ts) => [...ts, '08:00']);
  const removeTime = (i: number) => setTimes((ts) => ts.filter((_, j) => j !== i));

  const submit = () => save.mutate({ enabled, times: times.filter(Boolean), weekdays, channels });

  return (
    <Modal title={`Lembrete — ${folder.name}`} onClose={onClose} onSubmit={submit}
      footer={<>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={save.isPending}>Salvar</button>
      </>}>
      <p className="hint">A notificação só avisa que é hora de revisitar os princípios desta pasta — o texto nunca aparece nela, só depois de abrir o app e digitar a senha.</p>

      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Ativar lembrete diário desta pasta
      </label>

      <h4 className="gx-h4">Dias da semana</h4>
      <div className="wk" role="group" aria-label="Dias da semana">
        {WEEKDAY_SHORT.map((d, i) => (
          <button key={i} type="button" className={weekdays.includes(i) ? 'on' : ''} aria-pressed={weekdays.includes(i)} onClick={() => toggleDay(i)}>{d[0]}</button>
        ))}
      </div>

      <h4 className="gx-h4">Horários</h4>
      <ul className="study-lesson-edit-list">
        {times.map((t, i) => (
          <li key={i}>
            <input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} />
            <button type="button" className="icon-btn" aria-label="Remover horário" disabled={times.length === 1} onClick={() => removeTime(i)}><Icon name="trash" size={14} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={addTime}><Icon name="plus" size={14} /> Adicionar horário</button>

      <h4 className="gx-h4">Onde avisar (além da caixa de entrada do app)</h4>
      <div className="row-gap">
        {ALL_CHANNELS.map((c) => (
          <label key={c} className="check-line">
            <input type="checkbox" checked={channels.includes(c)} onChange={() => toggleChannel(c)} /> {CHANNEL_LABEL[c]}
          </label>
        ))}
      </div>

      <ErrorText error={save.error} />
    </Modal>
  );
}
