import { useState } from 'react';
import { Icon } from '../Icon';

/** Chips de tag: digite e aperte Enter/vírgula pra adicionar, clique no x pra remover. */
export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t && !value.includes(t) && value.length < 15) onChange([...value, t]);
    setDraft('');
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const rest = suggestions.filter((s) => !value.includes(s) && s.includes(draft.trim().toLowerCase()) && draft.trim());

  return (
    <div className="tag-input">
      <div className="tag-input-chips">
        {value.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" aria-label={`Remover tag ${t}`} onClick={() => remove(t)}><Icon name="x" size={11} /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); add(draft); }
            else if (e.key === 'Backspace' && !draft && value.length > 0) onChange(value.slice(0, -1));
          }}
          placeholder={value.length === 0 ? 'Adicionar tag…' : ''}
        />
      </div>
      {rest.length > 0 && (
        <div className="tag-input-suggest">
          {rest.slice(0, 6).map((s) => <button key={s} type="button" onClick={() => add(s)}>{s}</button>)}
        </div>
      )}
    </div>
  );
}
