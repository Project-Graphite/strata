import { useEffect, useState } from 'react';
import { errorMessage, Icon, isAbortError, ListRow, Placeholder, TextLink } from '@project-graphite/ui';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { RowsSkeleton } from '../../components/Skeletons';
import { newIssueUrl, repositoryUrl, securityPolicyUrl } from '../../project-links';
import { Privacy, Terms } from '../LegalPages';
import { legalPages, SettingsRow, SettingsRows } from './SettingsLayout';

interface OpenSourcePackage {
  name: string;
  version?: string;
  license: string | null;
  url: string | null;
}

function PackageRow({ license, name, url, version }: OpenSourcePackage) {
  return (
    <ListRow
      meta={[version, license ?? 'License not stated'].filter(Boolean).join(' · ')}
      title={url ? <TextLink external href={url}>{name}</TextLink> : name}
    />
  );
}

function Licenses() {
  const [attempt, setAttempt] = useState(0);
  const [licenses, setLicenses] = useState<{ packages?: OpenSourcePackage[]; error: string }>({ error: '' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/licenses.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the licenses.');
        setLicenses({ packages: (await response.json()) as OpenSourcePackage[], error: '' });
      })
      .catch((reason: unknown) => {
        if (!isAbortError(reason)) setLicenses({ error: errorMessage(reason, 'Could not load the licenses.') });
      });
    return () => controller.abort();
  }, [attempt]);

  if (licenses.error) {
    return (
      <LoadError
        error={licenses.error}
        onRetry={() => {
          setLicenses({ error: '' });
          setAttempt((current) => current + 1);
        }}
      />
    );
  }
  if (!licenses.packages) {
    return (
      <Placeholder label="Loading the licenses">
        <RowsSkeleton rows={8} />
      </Placeholder>
    );
  }
  return (
    <SettingsRows>
      <PackageRow license="MIT" name="Strata" url={`${repositoryUrl}/blob/main/LICENSE`} />
      {licenses.packages.map((item) => (
        <PackageRow key={`${item.name}@${item.version}`} {...item} />
      ))}
    </SettingsRows>
  );
}

function Support() {
  return (
    <SettingsRows>
      <SettingsRow label={<TextLink external href={newIssueUrl}>Report a problem</TextLink>}>
        Open an issue on GitHub. Say what you were doing and what happened.
      </SettingsRow>
      <SettingsRow label={<TextLink external href={securityPolicyUrl}>Report a security problem</TextLink>}>
        Report it privately, as the Project Graphite security policy explains, not in a public issue.
      </SettingsRow>
      <SettingsRow label={<TextLink external href={repositoryUrl}>Source code</TextLink>}>
        Strata is open source on GitHub.
      </SettingsRow>
    </SettingsRows>
  );
}

const pages = {
  terms: { title: legalPages.terms, summary: 'The rules for using Strata.', body: <div className="grid gap-8"><Terms level={3} /></div> },
  privacy: { title: legalPages.privacy, summary: 'What is stored, who can see it and how long it is kept.', body: <div className="grid gap-8"><Privacy level={3} /></div> },
  licenses: { title: legalPages.licenses, summary: 'Strata and the open-source packages it ships with.', body: <Licenses /> },
  support: { title: legalPages.support, summary: 'Report a problem or a security issue, or read the source.', body: <Support /> },
};

export function LegalSettings({ page }: { page?: keyof typeof pages }) {
  if (!page) {
    return (
      <Section title="Legal">
        <SettingsRows>
          {Object.entries(pages).map(([path, { summary, title }]) => (
            <ListRow href={`/settings/legal/${path}`} key={path} meta={summary} title={title} trail={<Icon name="chevron-right" size={16} />} />
          ))}
        </SettingsRows>
      </Section>
    );
  }
  return <Section title={pages[page].title}>{pages[page].body}</Section>;
}
