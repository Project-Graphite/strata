import type { ReactNode } from 'react';

const repository = 'https://github.com/Project-Graphite/strata';
const security = 'https://github.com/Project-Graphite/.github/blob/main/SECURITY.md';

function LegalPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="page-enter max-w-3xl">
      <p className="eyebrow">Strata</p>
      <h1 className="page-title">{title}</h1>
      <div className="mt-8 grid gap-8 text-muted [&_h2]:m-0 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-ink [&_p]:m-0 [&_section]:grid [&_section]:gap-3">
        {children}
      </div>
    </article>
  );
}

function External({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a className="rule-link" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <section>
        <h2>What is stored</h2>
        <p>
          Your email address, handle, display name, time zone and a salted, slow hash of your
          password. Each signed-in device holds a sign-in cookie that scripts cannot read. The server
          keeps only a hash of it, and it stops working after 30 days.
        </p>
        <p>
          Your email address receives verification links, password resets and security notices.
          Those links expire, and the server keeps only a hash of each.
        </p>
        <p>
          As new parts of Strata arrive, this page lists what each of them stores before it goes
          live.
        </p>
      </section>
      <section>
        <h2>Who can see it</h2>
        <p>
          Only you. Administrators can see account names, handles and email addresses to deal with
          abuse, but they cannot read your private content. One system manager, appointed on the
          server itself, chooses the administrators.
        </p>
      </section>
      <section>
        <h2>Other services</h2>
        <p>
          There are no ads, no analytics, no tracking cookies and no third-party scripts. Email is
          sent through an SMTP provider. When you connect a service such as Google Calendar, Strata
          asks only for the access that feature needs, uses that data only for it, and you can
          disconnect it at any time.
        </p>
      </section>
      <section>
        <h2>Your control</h2>
        <p>
          You can export everything Strata holds about you, and deleting your account removes it
          from the database straight away and from backups as they rotate out.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Strata is open source at <External href={repository}>GitHub</External>. Report a security
          problem through the <External href={security}>Project Graphite security policy</External>.
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <section>
        <h2>The service</h2>
        <p>
          Strata is a free personal workspace built by Project Graphite. It is provided as is, without
          any warranty, and may change, pause or stop. Keep your own copy of anything important by
          exporting it.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          You need a verified email address to use Strata. Keep your password to yourself. You are
          responsible for what happens in your account and in the spaces you share.
        </p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>
          Do not use Strata to break the law, harass people, send spam, store material you have no
          right to, or overload or probe the service. Accounts that do may be suspended or removed.
          Storage and usage limits keep the service fast for everyone.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          What you put in Strata stays yours. Strata only stores and shows it so the service works for
          you and the people you share it with.
        </p>
      </section>
      <section>
        <h2>The code</h2>
        <p>
          The source is MIT-licensed at <External href={repository}>GitHub</External>.
        </p>
      </section>
    </LegalPage>
  );
}
