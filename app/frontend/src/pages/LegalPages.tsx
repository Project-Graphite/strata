import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { TextLink } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Page, Section } from '../components/Page';
import { repositoryUrl, securityPolicyUrl } from '../project-links';

function LegalPage({ children, path, title }: { children: ReactNode; path: string; title: string }) {
  const auth = useAuth();
  if (auth.user) return <Navigate replace to={`/settings/legal/${path}`} />;
  return (
    <Page title={title}>
      <div className="grid max-w-narrow gap-8">{children}</div>
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
    <LegalPage path="privacy" title="Privacy">
      <Privacy />
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage path="terms" title="Terms">
      <Terms />
    </LegalPage>
  );
}

export function Privacy({ level }: { level?: 2 | 3 }) {
  return (
    <>
      <Section level={level} title="What is stored">
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
          A security log of sign-ins, password changes and other account events, including changes
          to share links, page access, webhooks and space roles, which you can see in Settings.
        </p>
        <p className="m-0 text-muted">
          Sign-in and account security events also store the browser family, such as Firefox, and a
          hash of the network address made with a secret salt, never the address itself. The
          server's logs of sign-in requests and refused requests record the same two things.
        </p>
      </Section>
      <Section level={level} title="Who can see it">
        <p className="m-0 text-muted">
          You, and the members of the spaces you share it with. Anyone you give a share link can see
          the item it links to. Administrators can see account names, handles and email addresses to
          deal with abuse, but they cannot read your private content. One system manager, appointed
          on the server itself, chooses the administrators.
        </p>
        <p className="m-0 text-muted">
          Spending is private to you. Accounts, cards, transactions, budgets and captured messages
          live only in your personal space, so members of the spaces you share never see them.
        </p>
      </Section>
      <Section level={level} title="The Android app">
        <p className="m-0 text-muted">
          The app reads transaction messages through Android's notification access. It looks only at
          notifications from the bank, wallet and payment apps you switch on, and at texts from the
          senders you list. Everything else is ignored, and nothing is read until you connect the
          phone and choose at least one app or sender.
        </p>
        <p className="m-0 text-muted">
          For each matching message it sends the sender, the text and the time it arrived. Messages
          waiting for a connection stay in encrypted storage on the phone.
        </p>
        <p className="m-0 text-muted">
          The app from Strata's GitHub releases can also read past texts from your listed senders,
          up to 90 days back, but only after you allow SMS access and ask it to. The Google Play
          edition never asks for SMS access.
        </p>
        <p className="m-0 text-muted">
          Connecting a phone needs your password, and a two-step code if you use one. The phone gets
          a key that can only send messages to your personal space. It lasts 90 days, the server
          keeps only a hash of it, and you can revoke it at any time in Settings, Developer.
        </p>
      </Section>
      <Section level={level} title="Captured messages">
        <p className="m-0 text-muted">
          The text of each message is encrypted before it is stored, with a key kept outside the
          database. The details read from it, such as the amount, the merchant and a card's last four
          digits, are encrypted the same way while the message is kept; messages stored by earlier
          versions with these details in the clear are encrypted by a background task. Once a
          message becomes a transaction, those details are stored with your spending like anything
          you enter yourself. Messages that are
          not transactions, or that come from a sender or merchant you chose to ignore, are dropped
          without being stored.
        </p>
        <p className="m-0 text-muted">
          After 90 days the text is deleted. A message that became a transaction keeps its link to
          that transaction; one that did not is deleted entirely.
        </p>
        <p className="m-0 text-muted">
          When you choose Report parsing, Strata saves a copy of that message with amounts, card
          digits, names, phone numbers, account handles and long numbers replaced by samples, so the
          parser can be improved. Administrators can read these copies. They are deleted with your
          account.
        </p>
      </Section>
      <Section level={level} title="How long it is kept">
        <p className="m-0 text-muted">
          Sign-in cookies last 30 days and phone connections 90 days. The security log keeps sign-in
          and account security events for 365 days and other events for 90 days. When an account
          is deleted, a note of the deletion with the account's internal id, the hashed address and
          the browser family is kept for 365 days. Captured message text is deleted after 90 days,
          and anything in the trash is deleted for good after 30 days. What you add stays until you
          delete it or your account.
        </p>
      </Section>
      <Section level={level} title="Other services">
        <p className="m-0 text-muted">
          There are no ads, no analytics, no tracking cookies and no third-party scripts. Email is
          sent through an SMTP provider. When you connect a service such as Google Calendar, Strata
          asks only for the access that feature needs, uses that data only for it, and you can
          disconnect it at any time.
        </p>
        <p className="m-0 text-muted">
          When error reporting is switched on, an unexpected server error sends a report to Sentry
          with the error, the address that failed without its query string, the request headers
          without cookies or sign-in tokens, a request id and your account's internal id. It never
          includes your email address, what you sent or anything you have written.
        </p>
      </Section>
      <Section level={level} title="Your control">
        <p className="m-0 text-muted">
          You can export everything Strata holds about you, and deleting your account removes it
          from the database straight away, apart from the deletion note above, and from backups as
          they rotate out.
        </p>
      </Section>
      <Section level={level} title="Contact">
        <p className="m-0 text-muted">
          Strata is open source at <External href={repositoryUrl}>GitHub</External>. Report a security
          problem through the <External href={securityPolicyUrl}>Project Graphite security policy</External>.
        </p>
      </Section>
    </>
  );
}

export function Terms({ level }: { level?: 2 | 3 }) {
  return (
    <>
      <Section level={level} title="The service">
        <p className="m-0 text-muted">
          Strata is a free personal workspace built by Project Graphite. It is provided as is, without
          any warranty, and may change, pause or stop. Keep your own copy of anything important by
          exporting it.
        </p>
      </Section>
      <Section level={level} title="Your account">
        <p className="m-0 text-muted">
          You need a verified email address to use Strata. Keep your password to yourself. You are
          responsible for what happens in your account and in the spaces you share.
        </p>
      </Section>
      <Section level={level} title="Fair use">
        <p className="m-0 text-muted">
          Do not use Strata to break the law, harass people, send spam, store material you have no
          right to, or overload or probe the service. Accounts that do may be suspended or removed.
          Storage and usage limits keep the service fast for everyone.
        </p>
      </Section>
      <Section level={level} title="Your content">
        <p className="m-0 text-muted">
          What you put in Strata stays yours. Strata only stores and shows it so the service works for
          you and the people you share it with.
        </p>
      </Section>
      <Section level={level} title="The code">
        <p className="m-0 text-muted">
          The source is MIT-licensed at <External href={repositoryUrl}>GitHub</External>.
        </p>
      </Section>
    </>
  );
}
