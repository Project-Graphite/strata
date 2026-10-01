import { useState } from 'react';
import { errorMessage } from '@project-graphite/ui';

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function run(action: () => Promise<string>, fallback: string) {
    setBusy(true);
    setError('');
    setDone('');
    try {
      setDone(await action());
      return true;
    } catch (reason) {
      setError(errorMessage(reason, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const status = (error || done) && (
    <p className={error ? 'error-message m-0' : 'mono-sm m-0 text-faint'} role={error ? 'alert' : 'status'}>
      {error || done}
    </p>
  );
  return { busy, run, status };
}
