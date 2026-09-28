import { useState } from 'react';
import { Field, Modal } from './ui';

/** Substitui o window.prompt() nativo por um popup do próprio app (nome de pasta, link, etc.). */
export function TextPromptModal({ title, label, initialValue = '', placeholder, submitLabel = 'Salvar', onSubmit, onClose }: {
  title: string; label: string; initialValue?: string; placeholder?: string; submitLabel?: string;
  onSubmit: (value: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = () => { const v = value.trim(); if (v) { onSubmit(v); onClose(); } };

  return (
    <Modal title={title} onClose={onClose} onSubmit={submit}
      footer={<>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={!value.trim()}>{submitLabel}</button>
      </>}>
      <Field label={label}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus required maxLength={200} />
      </Field>
    </Modal>
  );
}
