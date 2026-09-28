import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, ActivityKind, NotifyChannel, Period, TimeBlock, TimeMode, WeekdayBlocks } from '../api/types';
import { KIND_LABEL, PERIOD_LABEL, WEEKDAY_SHORT } from '../lib/labels';
import { toHHmm, windowFor } from '../lib/schedule';
import { ChannelChecks } from './ChannelChecks';
import { useConfirm } from './ConfirmProvider';
import { Icon } from './Icon';
import { ErrorText, Field, Modal } from './ui';

type BlockRow = { startTime: string; endTime: string };
const NEW_BLOCK: BlockRow = { startTime: '08:00', endTime: '' };

interface Form {
  name: string; kind: ActivityKind; timeMode: TimeMode; period: Period;
  blocks: BlockRow[]; perDay: boolean; dayBlocks: Record<number, BlockRow[]>;
  purpose: string; principle: string; minDesc: string; idealDesc: string; maxDesc: string; weekdays: number[]; active: boolean;
  remindTime: string; remindChannels: NotifyChannel[];
  notBefore: string; notAfter: string; durationMin: number;
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120, 180];
const toRow = (b: TimeBlock): BlockRow => ({ startTime: b.startTime, endTime: b.endTime ?? '' });

function initial(a?: Activity): Form {
  return {
    name: a?.name ?? '', kind: a?.kind ?? 'goal', timeMode: a?.timeMode ?? 'free', period: a?.period ?? 'morning',
    blocks: a?.blocks.length ? a.blocks.map(toRow) : [NEW_BLOCK],
    perDay: (a?.weekdayBlocks.length ?? 0) > 0,
    dayBlocks: Object.fromEntries((a?.weekdayBlocks ?? []).map((w) => [w.weekday, w.blocks.map(toRow)])),
    purpose: a?.purpose ?? '', principle: a?.principle ?? '',
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
  const toBlocks = (rows: BlockRow[]): TimeBlock[] => rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime || null }));
  const weekdayBlocks: WeekdayBlocks[] = f.timeMode === 'fixed' && f.perDay
    ? f.weekdays.map((d) => ({ weekday: d, blocks: toBlocks(f.dayBlocks[d] ?? f.blocks) }))
    : [];
  const payload = () => ({
    name: f.name.trim(), kind: f.kind, timeMode: f.timeMode,
    period: f.timeMode === 'period' ? f.period : null,
    blocks: f.timeMode === 'fixed' ? toBlocks(f.blocks) : [],
    weekdayBlocks,
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

  const setBlock = (i: number, patch: Partial<BlockRow>) => setF((prev) => ({ ...prev, blocks: prev.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const addBlock = () => setF((prev) => ({ ...prev, blocks: [...prev.blocks, NEW_BLOCK] }));
  const removeBlock = (i: number) => setF((prev) => ({ ...prev, blocks: prev.blocks.filter((_, j) => j !== i) }));

  const dayBlocksFor = (d: number) => f.dayBlocks[d] ?? f.blocks;
  const setDayBlock = (d: number, i: number, patch: Partial<BlockRow>) =>
    setF((prev) => ({ ...prev, dayBlocks: { ...prev.dayBlocks, [d]: (prev.dayBlocks[d] ?? prev.blocks).map((b, j) => (j === i ? { ...b, ...patch } : b)) } }));
  const addDayBlock = (d: number) => setF((prev) => ({ ...prev, dayBlocks: { ...prev.dayBlocks, [d]: [...(prev.dayBlocks[d] ?? prev.blocks), NEW_BLOCK] } }));
  const removeDayBlock = (d: number, i: number) =>
    setF((prev) => ({ ...prev, dayBlocks: { ...prev.dayBlocks, [d]: (prev.dayBlocks[d] ?? prev.blocks).filter((_, j) => j !== i) } }));

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
        <>
          <fieldset className="field">
            <legend className="field-label">{f.perDay ? 'Horário padrão' : 'Horário'}</legend>
            <ul className="study-lesson-edit-list">
              {f.blocks.map((b, i) => (
                <li key={i}>
                  <input type="time" value={b.startTime} onChange={(e) => setBlock(i, { startTime: e.target.value })} required />
                  <input type="time" value={b.endTime} onChange={(e) => setBlock(i, { endTime: e.target.value })} title="Fim (opcional)" />
                  <button type="button" className="icon-btn" aria-label="Remover bloco" disabled={f.blocks.length === 1} onClick={() => removeBlock(i)}><Icon name="trash" size={14} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn small" onClick={addBlock}><Icon name="plus" size={14} /> Adicionar bloco (ex.: manhã e tarde)</button>
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={f.perDay} onChange={(e) => set('perDay', e.target.checked)} />
            Horário diferente em algum dia (ex.: academia só de manhã no fim de semana)
          </label>
          {f.perDay && (
            <fieldset className="field">
              <legend className="field-label">Horário de cada dia</legend>
              {f.weekdays.map((d) => (
                <div key={d} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="muted small" style={{ minWidth: 34, paddingTop: 10 }}>{WEEKDAY_SHORT[d]}</span>
                  <div style={{ flex: 1 }}>
                    <ul className="study-lesson-edit-list">
                      {dayBlocksFor(d).map((b, i) => (
                        <li key={i}>
                          <input type="time" value={b.startTime} onChange={(e) => setDayBlock(d, i, { startTime: e.target.value })} required />
                          <input type="time" value={b.endTime} onChange={(e) => setDayBlock(d, i, { endTime: e.target.value })} title="Fim (opcional)" />
                          <button type="button" className="icon-btn" aria-label="Remover bloco" disabled={dayBlocksFor(d).length === 1} onClick={() => removeDayBlock(d, i)}><Icon name="trash" size={14} /></button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="btn small" onClick={() => addDayBlock(d)}><Icon name="plus" size={14} /> Bloco</button>
                  </div>
                </div>
              ))}
              <p className="hint">Cada dia selecionado abaixo tem seus próprios blocos; mude os dias ali que a lista se ajusta.</p>
            </fieldset>
          )}
        </>
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
