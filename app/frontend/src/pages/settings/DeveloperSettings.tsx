import { Placeholder } from '@project-graphite/ui';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { AddButtonSkeleton, ButtonSkeleton, CodeLineSkeleton, IconButtonSkeleton, rowsOf, RowsSkeleton, SkeletonLine, useRememberedShape } from '../../components/Skeletons';
import { useResource } from '../../useResource';
import { ApiSettings, emptyWebhooks, type ApiReference, type Webhook } from './ApiSettings';
import { SettingsRowSkeleton, SettingsRows, type TwoStepStatus } from './SettingsLayout';
import { emptyTokens, TokensSettings, type AccessToken } from './TokensSettings';

export function DeveloperSettings() {
  const tokens = useResource<AccessToken[]>('/me/tokens', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const reference = useResource<ApiReference>('/me/api-reference', true);
  const webhooks = useResource<Webhook[]>('/me/webhooks', true);
  const [tokenRows, scopeRows, webhookRows] = useRememberedShape(
    'settings-developer',
    tokens.data && reference.data && webhooks.data && [tokens.data.length, reference.data.scopes.length, webhooks.data.length],
    [0, 4, 0],
  );

  const failed = [tokens, twoStep, reference, webhooks].find((resource) => resource.error);
  if (failed) return <LoadError error={failed.error} onRetry={failed.reload} />;
  if (!tokens.data || !twoStep.data || !reference.data || !webhooks.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading your developer settings">
        <Section action={<AddButtonSkeleton />} title="Access tokens">
          {tokenRows ? (
            <SettingsRows>
              {rowsOf(tokenRows).map((row) => (
                <SettingsRowSkeleton action={<ButtonSkeleton width="w-18" />} key={row} row={row} />
              ))}
            </SettingsRows>
          ) : (
            <Empty loading title={emptyTokens.title}>
              {emptyTokens.hint}
            </Empty>
          )}
        </Section>
        <Section
          description={
            <>
              <CodeLineSkeleton width="w-full" />
              <SkeletonLine width="w-1/2" />
            </>
          }
          title="Personal API"
        >
          <RowsSkeleton rows={scopeRows} />
        </Section>
        <Section
          action={<AddButtonSkeleton />}
          description={
            <>
              <CodeLineSkeleton width="w-full" />
              <CodeLineSkeleton width="w-2/5" />
            </>
          }
          title="Webhooks"
        >
          {webhookRows ? (
            <SettingsRows>
              {rowsOf(webhookRows).map((row) => (
                <SettingsRowSkeleton action={<IconButtonSkeleton />} key={row} row={row} />
              ))}
            </SettingsRows>
          ) : (
            <Empty loading title={emptyWebhooks.title}>
              {emptyWebhooks.hint}
            </Empty>
          )}
        </Section>
      </Placeholder>
    );
  }

  return (
    <>
      <TokensSettings tokens={tokens} twoStep={twoStep.data} />
      <ApiSettings reference={reference.data} webhooks={webhooks} />
    </>
  );
}
