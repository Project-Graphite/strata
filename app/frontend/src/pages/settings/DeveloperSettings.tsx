import { ApiSettings } from './ApiSettings';
import { TokensSettings } from './TokensSettings';

export function DeveloperSettings() {
  return (
    <>
      <TokensSettings />
      <ApiSettings />
    </>
  );
}
