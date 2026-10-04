import { useState } from 'react';
import { errorMessage, useSnackbar } from '@project-graphite/ui';

export function useAction() {
  const show = useSnackbar();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>, fallback: string) {
    setBusy(true);
    try {
      const done = await action();
      if (done) show({ message: done });
      return true;
    } catch (reason) {
      show({ message: errorMessage(reason, fallback), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
