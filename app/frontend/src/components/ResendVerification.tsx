import { useState } from 'react';
import { errorMessage, TextLink, useSnackbar } from '@project-graphite/ui';
import { apiRequest } from '../api';

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const show = useSnackbar();

  async function resend() {
    setState('sending');
    try {
      await apiRequest('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setState('sent');
    } catch (reason) {
      show({ message: errorMessage(reason, 'Could not send the link'), tone: 'error' });
      setState('idle');
    }
  }

  return (
    <div className="mt-6 text-small text-muted">
      {state === 'sent' ? (
        <p className="m-0">A new link is on its way. It works for 24 hours.</p>
      ) : (
        <p className="m-0">
          Nothing arrived?{' '}
          <TextLink onClick={() => state === 'idle' && void resend()}>Send the link again</TextLink>
        </p>
      )}
    </div>
  );
}
