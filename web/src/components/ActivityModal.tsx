import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, ActivityKind, NotifyChannel, Period, TimeMode } from '../api/types';
import { KIND_LABEL, PERIOD_LABEL, WEEKDAY_SHORT } from '../lib/labels';
import { toHHmm, windowFor } from '../lib/schedule';
import { ChannelChecks } from './ChannelChecks';
import { useConfirm } from './ConfirmProvider';
import { ErrorText, Field, Modal } from './ui';

interface Form {
  name: string; kind: ActivityKind; timeMode: TimeMode; period: Period; startTime: string; endTime: string;
  purpose: string; principle: string; minDesc: string; idealDesc: string; maxDesc: string; weekdays: number[]; active: boolean;
  remindTime: string; remindChannels: NotifyChannel[];
  notBefore: string; notAfter: string; durationMin: number;
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120, 180];

function initial(a?: Activity): Form {
  return {
    name: a?.name ?? '', kind: a?.kind ?? 'goal', timeMode: a?.timeMode ?? 'free', period: a?.period ?? 'morning',
    startTime: a?.startTime ?? '08:00', endTime: a?.endTime ?? '', purpose: a?.purpose ?? '', principle: a?.principle ?? '',
    minDesc: a?.minDesc ?? '', idealDesc: a?.idealDesc ?? '', maxDesc: a?.maxDesc ?? '',
    weekdays: a?.weekdays ?? [0, 1, 2, 3, 4, 5, 6], active: a?.active ?? true,
    remindTime: a?.remindTime ?? '', remindChannels: a?.remindChannels ?? [],
    notBefore: a?.notBefore ?? '', notAfter: a?.notAfter ?? '', durationMin: a?.durationMin ?? 60,
  };
}

export function ActivityModal({ activity, onClose }: { activity?: Activity; onClose: () => void }) {
  const confirm = useConfirm();
  const [f, setF] = useState<Form>(() => initial(activity));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const save = useAction(
    (payload: Record<string, unknown>) => (activity ? api.patch<Activity>(`/activities/${activity.id}`, payload) : api.post<Activity>('/activities', payload)),
    onClose,
  );
  const remove = useAction(() => api.del(`/activities/${activity!.id}`), onClose);

  const flexible = f.timeMode !== 'fixed';
  const payload = () => ({
    name: f.name.trim(), kind: f.kind, timeMode: f.timeMode,
    period: f.timeMode === 'period' ? f.period : null,
    startTime: f.timeMode === 'fixed' ? f.startTime : null,
    endTime: f.timeMode === 'fixed' && f.endTime ? f.endTime : null,
    purpose: f.purpose, principle: f.principle, minDesc: f.minDesc, idealDesc: f.idealDesc, maxDesc: f.maxDesc,
    weekdays: f.weekdays, active: f.active,
    remindTime: f.remindTime || null, remindChannels: f.remindTime ? f.remindChannels : [],
    notBefore: flexible && f.notBefore ? f.notBefore : null, notAfter: flexible && f.notAfter ? f.notAfter : null, durationMin: f.durationMin,
  });
  const submit = () => save.mutate(payload());

  // Salva o que está na tela e pede o horário à IA, para a sugestão refletir o período e as restrições atuais.
  const [suggestion, setSuggestion] = useState<{ start: string; reason: string } | null>(activity?.suggestedStart ? { start: activity.suggestedStart, reason: activity.suggestedReason } : null);
  const suggest = useAction(
    async () => { await api.patch<Activity>(`/activities/${activity!.id}`, payload()); return api.post<Activity>(`/activities/${activity!.id}/suggest-time`, {}); },
    (a) => setSuggestion(a.suggestedStart ? { start: a.suggestedStart, reason: a.suggestedReason } : null),
  );
  const slot = windowFor({ period: f.timeMode === 'period' ? f.period : null, notBefore: f.notBefore || null, notAfter: f.notAfter || null, durationMin: f.durationMin });

  const toggleDay = (d: number) => set('weekdays', f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort());

  return (
    <Modal
      title={activity ? 'Editar atividade' : 'Nova atividade'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {activity && (
            <button type="button" className="btn danger" disabled={remove.isPending}
              onClick={async () => { if (await confirm(`Apagar "${activity.name}" e todo o seu histórico?`)) remove.mutate(undefined); }}>
              Apagar
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !f.name.trim() || f.weekdays.length === 0}>Salvar</button>
        </>
      }
    >
      <Field label="Nome"><input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus required /></Field>

      <div className="row">
        <Field label="Tipo">
          <select value={f.kind} onChange={(e) => set('kind', e.target.value as ActivityKind)}>
            {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Quando">
          <select value={f.timeMode} onChange={(e) => set('timeMode', e.target.value as TimeMode)}>
            <option value="free">Horário livre</option>
            <option value="period">Período definido</option>
            <option value="fixed">Horário definido</option>
          </select>
        </Field>
      </div>

      {f.timeMode === 'period' && (
        <Field label="Período">
          <select value={f.period} onChange={(e) => set('period', e.target.value as Period)}>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </Field>
      )}
      {f.timeMode === 'fixed' && (
        <div className="row">
          <Field label="Início"><input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} required /></Field>
          <Field label="Fim (opcional)"><input type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
        </div>
      )}

      {flexible && (
        <fieldset className="field remind-box sched-box">
          <legend className="field-label">Horário no calendário</legend>
          <p className="hint">
            {f.timeMode === 'period' ? 'O calendário encaixa este objetivo dentro do período escolhido' : 'O calendário encaixa este objetivo em um horário livre do dia'}, sem sobrepor obrigações e eventos.
            Use "depois das" e "antes das" para limitar mais.
          </p>
          <div className="row three">
            <Field label="Duração">
              <select value={f.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))}>
                {(DURATIONS.includes(f.durationMin) ? DURATIONS : [...DURATIONS, f.durationMin].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
            </Field>
            <Field label="Depois das (opcional)"><input type="time" value={f.notBefore} onChange={(e) => set('notBefore', e.target.value)} /></Field>
            <Field label="Antes das (opcional)"><input type="time" value={f.notAfter} onChange={(e) => set('notAfter', e.target.value)} /></Field>
          </div>
          {!slot && <p className="error" role="alert">Não cabe: confira o período, "depois das" e "antes das".</p>}
          {slot && <p className="hint">Pode começar entre {toHHmm(slot[0])} e {toHHmm(Math.max(slot[0], slot[1] - f.durationMin))}.</p>}
          {suggestion && (
            <div className="sched-suggestion" role="status"><span>✨</span><span>A IA sugere <b>{suggestion.start}</b>{suggestion.reason ? `. ${suggestion.reason}` : ''}</span></div>
          )}
          <div>
            <button type="button" className="btn small" disabled={!activity || !slot || suggest.isPending || save.isPending}
              title={activity ? 'Salva e pede à IA o melhor horário' : 'Salve a atividade primeiro'} onClick={() => suggest.mutate(undefined)}>
              {suggest.isPending ? 'Consultando a IA…' : suggestion ? 'Sugerir outro horário com IA' : 'Sugerir melhor horário com IA'}
            </button>
            {!activity && <span className="hint"> Salve a atividade para usar a IA.</span>}
          </div>
          <ErrorText error={suggest.error} />
        </fieldset>
      )}

      <fieldset className="field">
        <legend className="field-label">Dias da semana</legend>
        <div className="weekdays">
          {WEEKDAY_SHORT.map((label, d) => (
            <button key={d} type="button" className="chip-toggle" aria-pressed={f.weekdays.includes(d)} onClick={() => toggleDay(d)}>{label}</button>
          ))}
        </div>
      </fieldset>

      <Field label="Finalidade"><input value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Para que existe esta atividade?" /></Field>
      <Field label="Princípio comportamental"><input value={f.principle} onChange={(e) => set('principle', e.target.value)} placeholder="Como quero me comportar ao realizá-la?" /></Field>

      <div className="row three">
        <Field label="Mínimo"><input value={f.minDesc} onChange={(e) => set('minDesc', e.target.value)} placeholder="ex.: 5 páginas" /></Field>
        <Field label="Ideal"><input value={f.idealDesc} onChange={(e) => set('idealDesc', e.target.value)} placeholder="ex.: 20 páginas" /></Field>
        <Field label="Máximo"><input value={f.maxDesc} onChange={(e) => set('maxDesc', e.target.value)} placeholder="ex.: 40 páginas" /></Field>
      </div>

      <fieldset className="field remind-box">
        <legend className="field-label">Lembrete diário</legend>
        <div className="row">
          <Field label="Avisar às (opcional)">
            <input type="time" value={f.remindTime} onChange={(e) => set('remindTime', e.target.value)} />
          </Field>
          <p className="hint">Só avisa nos dias em que a atividade se aplica e se você ainda não registrou o dia.</p>
        </div>
        {f.remindTime && <ChannelChecks value={f.remindChannels} onChange={(v) => set('remindChannels', v)} />}
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        Ativa (desmarque para arquivar sem apagar o histórico)
      </label>
      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}
