import { useState } from 'react';
import { errorMessage, useSnackbar } from '@project-graphite/ui';

type Done = string | { message: string; undo: () => Promise<string> };

export function useAction() {
  const show = useSnackbar();
  const [busy, setBusy] = useState(false);

  function report(done: Done) {
    if (typeof done !== 'string') show({ message: done.message, action: { label: 'Undo', onSelect: () => void run(done.undo, 'Could not undo that') } });
    else if (done) show({ message: done });
  }

  async function run(action: () => Promise<Done>, fallback: string) {
    setBusy(true);
    try {
      report(await action());
      return true;
    } catch (reason) {
      show({ message: errorMessage(reason, fallback), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, report, run };
}
