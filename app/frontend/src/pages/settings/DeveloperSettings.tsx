import { ApiSettings } from './ApiSettings';
import { TokensSettings } from './TokensSettings';

export function DeveloperSettings() {
  return (
    <div className="grid gap-10">
      <TokensSettings />
      <ApiSettings />
    </div>
  );
}
