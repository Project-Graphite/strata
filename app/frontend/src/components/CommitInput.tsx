import InputBase from '@mui/material/InputBase';
import { useState } from 'react';
import { TextButton } from './Button';
import { Hint } from './Hint';

export function CommitInput({ autoFocus, className, label, maxLength, onCommit, onEnter, placeholder, readOnly, type = 'text', value }: {
  autoFocus?: boolean;
  className?: string;
  label: string;
  maxLength?: number;
  onCommit: (value: string, expected: string) => Promise<boolean>;
  onEnter?: (input: HTMLInputElement) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: 'text' | 'number' | 'url';
  value: string;
}) {
  const [draft, setDraft] = useState<{ value: string; base: string }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function commit(expected: string) {
    if (!draft || busy || readOnly) return;
    if (draft.value.trim() === value) {
      setDraft(undefined);
      setFailed(false);
      return;
    }
    setBusy(true);
    const saved = await onCommit(draft.value.trim(), expected);
    setBusy(false);
    if (saved) setDraft(undefined);
    setFailed(!saved);
  }

  return (
    <div className="min-w-0 flex-1">
      <InputBase
        autoFocus={autoFocus}
        fullWidth
        onBlur={() => {
          if (draft && draft.base === value) void commit(draft.base);
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft((current) => ({ value: next, base: current?.base ?? value }));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
          onEnter?.(event.target as HTMLInputElement);
        }}
        placeholder={placeholder}
        readOnly={readOnly || busy}
        slotProps={{ input: { 'aria-label': label, className, maxLength, ...(type === 'number' ? { step: 'any' } : {}) } }}
        type={type}
        value={draft?.value ?? value}
      />
      {draft && (failed || draft.base !== value) && (
        <div className="grid gap-1 py-1">
          <Hint>{draft.base !== value ? 'Someone changed this value. Your draft is kept.' : 'Your change has not been saved.'}</Hint>
          <div className="flex gap-3">
            <TextButton disabled={busy || readOnly} label={draft.base !== value ? 'Save my change' : 'Retry'} onClick={() => void commit(value)} />
            <TextButton disabled={busy} label="Use current value" onClick={() => { setDraft(undefined); setFailed(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
