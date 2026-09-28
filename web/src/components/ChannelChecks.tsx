import type { NotifyChannel } from '../api/types';
import { CHANNEL_LABEL } from '../lib/labels';

/** Canais extras do aviso. A caixa de entrada do app (sino) recebe sempre. */
export function ChannelChecks({ value, onChange }: { value: NotifyChannel[]; onChange: (v: NotifyChannel[]) => void }) {
  const toggle = (c: NotifyChannel) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="channel-checks">
      <span className="chip-static">🔔 Sino do app (sempre)</span>
      {(Object.keys(CHANNEL_LABEL) as NotifyChannel[]).map((c) => (
        <button key={c} type="button" className="chip-toggle" aria-pressed={value.includes(c)} onClick={() => toggle(c)}>{CHANNEL_LABEL[c]}</button>
      ))}
    </div>
  );
}
