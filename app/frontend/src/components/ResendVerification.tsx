import { useState } from 'react';
import { errorMessage } from '@project-graphite/ui';
import { apiRequest } from '../api';

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function resend() {
    setState('sending');
    setError('');
    try {
      await apiRequest('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setState('sent');
    } catch (reason) {
      setError(errorMessage(reason, 'Could not send the link'));
      setState('idle');
    }
  }

  return (
    <div className="mt-6 text-sm text-muted">
      {state === 'sent' ? (
        <p className="m-0">A new link is on its way. It works for 24 hours.</p>
      ) : (
        <p className="m-0">
          Nothing arrived?{' '}
          <button
            className="text-button"
            disabled={state === 'sending'}
            onClick={() => void resend()}
            type="button"
          >
            Send the link again
          </button>
        </p>
      )}
      {error && <p className="error-message mt-2 mb-0">{error}</p>}
    </div>
  );
}
