import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, Commute, CommuteDirection, NotifyChannel } from '../api/types';
import { DIRECTION_LABEL, WEEKDAY_SHORT } from '../lib/labels';
import { commuteBlock } from '../lib/schedule';
import { ChannelChecks } from './ChannelChecks';
import { useConfirm } from './ConfirmProvider';
import { ErrorText, Field, Modal } from './ui';

type RemindMode = 'none' | 'fixed' | 'before';
const REMIND_BEFORE_OPTIONS = [5, 10, 15, 30, 60] as const;

/** Criar ou editar um deslocamento: sempre vinculado a uma atividade de horário definido (o horário não é digitado aqui, é calculado). */
export function CommuteModal({ commute, onClose }: { commute?: Commute; onClose: () => void }) {
  const confirm = useConfirm();
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const fixedActivities = (activities.data ?? []).filter((a) => a.timeMode === 'fixed' && a.active);

  const [name, setName] = useState(commute?.name ?? '');
  const [activityId, setActivityId] = useState(commute?.activityId ?? '');
  const [direction, setDirection] = useState<CommuteDirection>(commute?.direction ?? 'before');
  const [durationMin, setDurationMin] = useState(commute?.durationMin ?? 30);
  const [active, setActive] = useState(commute?.active ?? true);
  const [remindMode, setRemindMode] = useState<RemindMode>(commute?.remindMinutes != null ? 'before' : commute?.remindTime ? 'fixed' : 'none');
  const [remindTime, setRemindTime] = useState(commute?.remindTime ?? '');
  const [remindBeforeMin, setRemindBeforeMin] = useState<(typeof REMIND_BEFORE_OPTIONS)[number]>(commute?.remindMinutes ?? 15);
  const [remindChannels, setRemindChannels] = useState<NotifyChannel[]>(commute?.remindChannels ?? []);

  const activity = (activities.data ?? []).find((a) => a.id === activityId);
  const preview = useMemo(() => {
    if (!activity) return [];
    return activity.weekdays.map((d) => ({ d, block: commuteBlock(activity, d, direction, durationMin) }));
  }, [activity, direction, durationMin]);

  const payload = () => ({
    name: name.trim(), activityId, direction, durationMin, active,
    remindTime: remindMode === 'fixed' ? (remindTime || null) : null,
    remindMinutes: remindMode === 'before' ? remindBeforeMin : null,
    remindChannels: remindMode !== 'none' ? remindChannels : [],
  });
  const save = useAction(
    (p: Record<string, unknown>) => (commute ? api.patch(`/commutes/${commute.id}`, p) : api.post('/commutes', p)),
    onClose,
  );
  const remove = useAction(() => api.del(`/commutes/${commute!.id}`), onClose);

  return (
    <Modal
      title={commute ? 'Editar deslocamento' : 'Novo deslocamento'} onClose={onClose}
      onSubmit={() => save.mutate(payload())}
      footer={
        <>
          {commute && <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar "${commute.name}"?`)) remove.mutate(undefined); }}>Apagar</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !name.trim() || !activityId}>Salvar</button>
        </>
      }
    >
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Ida à academia" autoFocus required /></Field>
      <Field label="Atividade âncora">
        <select value={activityId} onChange={(e) => setActivityId(e.target.value)} required>
          <option value="" disabled>Escolha uma atividade com horário definido…</option>
          {fixedActivities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {fixedActivities.length === 0 && <p className="hint">Nenhuma atividade com horário definido ainda. Crie uma em Atividades primeiro (ex.: "Academia", horário definido) e volte aqui.</p>}
      </Field>
      <div className="row">
        <Field label="Direção">
          <select value={direction} onChange={(e) => setDirection(e.target.value as CommuteDirection)}>
            {(Object.keys(DIRECTION_LABEL) as CommuteDirection[]).map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
          </select>
        </Field>
        <Field label="Duração (min)"><input type="number" min={5} max={240} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} required /></Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo (desmarque para pausar sem apagar)
      </label>

      {preview.length > 0 && (
        <p className="hint">Prévia: {preview.map(({ d, block }) => `${WEEKDAY_SHORT[d]} ${block ? `${block.startTime}–${block.endTime}` : 'sem horário'}`).join(', ')}</p>
      )}

      <fieldset className="field remind-box">
        <legend className="field-label">Lembrete</legend>
        <p className="hint">Só avisa quando o deslocamento se aplica naquele dia (a atividade âncora ativa e nesse dia da semana).</p>
        <div className="btn-group" role="radiogroup" aria-label="Tipo de lembrete">
          <button type="button" className="btn" aria-pressed={remindMode === 'none'} onClick={() => setRemindMode('none')}>Sem lembrete</button>
          <button type="button" className="btn" aria-pressed={remindMode === 'fixed'} onClick={() => setRemindMode('fixed')}>Horário fixo</button>
          <button type="button" className="btn" aria-pressed={remindMode === 'before'} onClick={() => setRemindMode('before')}>Antes do horário</button>
        </div>
        {remindMode === 'fixed' && (
          <Field label="Avisar às"><input type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} required /></Field>
        )}
        {remindMode === 'before' && (
          <Field label="Quanto antes?">
            <select value={remindBeforeMin} onChange={(e) => setRemindBeforeMin(Number(e.target.value) as typeof remindBeforeMin)}>
              {REMIND_BEFORE_OPTIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos antes` : '1 hora antes'}</option>)}
            </select>
          </Field>
        )}
        {remindMode !== 'none' && <ChannelChecks value={remindChannels} onChange={setRemindChannels} />}
      </fieldset>

      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}
