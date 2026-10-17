import { FormSkeleton } from '@project-graphite/ui';
import { LoadError } from '../../components/LoadError';
import { useResource } from '../../useResource';
import { ApiSettings, type ApiReference, type Webhook } from './ApiSettings';
import type { TwoStepStatus } from './SettingsLayout';
import { TokensSettings, type AccessToken } from './TokensSettings';

export function DeveloperSettings() {
  const tokens = useResource<AccessToken[]>('/me/tokens', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const reference = useResource<ApiReference>('/me/api-reference', true);
  const webhooks = useResource<Webhook[]>('/me/webhooks', true);

  const failed = [tokens, twoStep, reference, webhooks].find((resource) => resource.error);
  if (failed) return <LoadError error={failed.error} onRetry={failed.reload} />;
  if (!tokens.data || !twoStep.data || !reference.data || !webhooks.data) return <FormSkeleton fields={3} />;

  return (
    <>
      <TokensSettings tokens={tokens} twoStep={twoStep.data} />
      <ApiSettings reference={reference.data} webhooks={webhooks} />
    </>
  );
}
