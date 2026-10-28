import type { ReactNode } from 'react';
import { TextLink } from '@project-graphite/ui';
import { Page, Section } from '../components/Page';

const repository = 'https://github.com/Project-Graphite/strata';
const security = 'https://github.com/Project-Graphite/.github/blob/main/SECURITY.md';

function LegalPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Page title={title}>
      <div className="grid max-w-3xl gap-8">{children}</div>
    </Page>
  );
}

function External({ children, href }: { children: ReactNode; href: string }) {
  return (
    <TextLink external href={href}>
      {children}
    </TextLink>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <Section title="What is stored">
        <p className="m-0 text-muted">
          Your account details: email address, handle, display name, time zone and a salted, slow
          hash of your password. Each signed-in device holds a sign-in cookie that scripts cannot
          read. The server keeps only a hash of it, and it stops working after 30 days.
        </p>
        <p className="m-0 text-muted">
          Your email address receives verification links, password resets and security notices.
          Those links expire, and the server keeps only a hash of each.
        </p>
        <p className="m-0 text-muted">
          Everything you add, such as tasks, events, pages, boards, bookmarks and spending, and the
          files you upload.
        </p>
        <p className="m-0 text-muted">
          A security log of sign-ins, password changes and other account events, which you can see
          in Settings.
        </p>
      </Section>
      <Section title="Who can see it">
        <p className="m-0 text-muted">
          You, and the members of the spaces you share it with. Anyone you give a share link can see
          the item it links to. Administrators can see account names, handles and email addresses to
          deal with abuse, but they cannot read your private content. One system manager, appointed
          on the server itself, chooses the administrators.
        </p>
      </Section>
      <Section title="Other services">
        <p className="m-0 text-muted">
          There are no ads, no analytics, no tracking cookies and no third-party scripts. Email is
          sent through an SMTP provider. When you connect a service such as Google Calendar, Strata
          asks only for the access that feature needs, uses that data only for it, and you can
          disconnect it at any time.
        </p>
      </Section>
      <Section title="Your control">
        <p className="m-0 text-muted">
          You can export everything Strata holds about you, and deleting your account removes it
          from the database straight away and from backups as they rotate out.
        </p>
      </Section>
      <Section title="Contact">
        <p className="m-0 text-muted">
          Strata is open source at <External href={repository}>GitHub</External>. Report a security
          problem through the <External href={security}>Project Graphite security policy</External>.
        </p>
      </Section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <Section title="The service">
        <p className="m-0 text-muted">
          Strata is a free personal workspace built by Project Graphite. It is provided as is, without
          any warranty, and may change, pause or stop. Keep your own copy of anything important by
          exporting it.
        </p>
      </Section>
      <Section title="Your account">
        <p className="m-0 text-muted">
          You need a verified email address to use Strata. Keep your password to yourself. You are
          responsible for what happens in your account and in the spaces you share.
        </p>
      </Section>
      <Section title="Fair use">
        <p className="m-0 text-muted">
          Do not use Strata to break the law, harass people, send spam, store material you have no
          right to, or overload or probe the service. Accounts that do may be suspended or removed.
          Storage and usage limits keep the service fast for everyone.
        </p>
      </Section>
      <Section title="Your content">
        <p className="m-0 text-muted">
          What you put in Strata stays yours. Strata only stores and shows it so the service works for
          you and the people you share it with.
        </p>
      </Section>
      <Section title="The code">
        <p className="m-0 text-muted">
          The source is MIT-licensed at <External href={repository}>GitHub</External>.
        </p>
      </Section>
    </LegalPage>
  );
}
