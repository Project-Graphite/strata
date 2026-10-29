# Strata

Strata is a free personal workspace for your dashboard, agenda, notes, whiteboards, subscriptions
and files, built by Project Graphite.

## Features

- **Home**: dashboards of widgets (agenda, tasks, pages, weather, news feeds, countdown, focus timer,
  app status and more), picked by time of day and device, and a wall display.
- **Tasks**: grouped task lists and a board view, with status, descriptions, comments,
  attachments, repeating tasks, assignment and reminders, and a quick-add box that reads dates,
  tags and priority. Ticking off a task can be undone.
- **Agenda**: Day, Week, Month and List views with drag to create, move and resize, events with
  guest RSVPs and date polls, followed outside calendars and a private calendar link.
- **Pages**: notes with live co-editing, offline drafts, version history, templates, mentions,
  comments and database views. Pages and boards can be moved to the trash.
- **Boards**: full-screen whiteboards drawn with Excalidraw, with templates, sticky notes and
  following a collaborator, embeddable in pages and events and editable by guests through a share
  link.
- **Bookmarks**: saved links with a read-later list and a reader view.
- **Journal**: a daily journal with a mood, and a one-click weekly review page.
- **Recurring**: subscriptions with renewals, price history, reminders, home-currency totals at ECB
  rates, bank statement suggestions and shared splits; habits with check-ins and streaks.
- **Spending**, private to each user: accounts and cards with balance history, budgets,
  installment plans, insights, net worth with assets and savings goals, statement import and CSV
  export. The Android app captures bank texts and payment app notifications from allow-listed
  senders; confident ones are recorded, the rest wait for review.
- **Files**: uploads, previews and downloads, with metadata stripped.
- **Spaces**: shared spaces with members, invitations, tags, share links, activity and trash.
- **Trash and undo**: anything moved to the trash can be undone from the notice that follows, and
  restored from the Trash for 30 days.
- **Confirmations**: deleting for good, discarding edits and cutting off someone's access ask first.
  One-time secrets, such as tokens and recovery codes, stay on screen until you confirm you saved
  them.
- **Optional features**, turned on in Settings: Goals, People, Recipes and meals, Tidy and Trips.
  Tidy suggests stale items to clear, with bulk actions, undo and tagging rules.
- **Inbox**: notices in the app and as push notifications to chosen devices.
- **Search** and a command palette, an installable app, personal access tokens and webhooks.
- **Accounts**:
  - registration with email verification and resendable links;
  - sign-in with rotating refresh sessions and reuse detection, rate-limited per session, so people
    sharing a network address don't lock each other out;
  - password reset by email.

  Registration never reveals whether an email address already has an account. The owner gets a
  notice instead. Failed sign-ins take the same time whether or not the account exists.
- **Two-step sign-in**:
  - authenticator-app codes (TOTP), set up from a QR code;
  - ten recovery codes, each usable once and stored only as hashes;
  - sign-in asks for a code after the password, with five attempts per sign-in;
  - each code works only once.
- **Sensitive changes** need your password and, with two-step sign-in on, a code. That covers the
  password, email, two-step settings and account deletion.
- **Devices and sessions**:
  - every signed-in device is listed, and any or all of them can be signed out;
  - a signed-out device stops working straight away;
  - a sign-in from a new device sends an email.
- **Security emails**: new-device sign-ins, password changes and two-step changes.
- **Passwords**: passwords found in data breaches are refused. The check sends only the first five
  characters of the password's SHA-1 hash to Have I Been Pwned.
- **Encryption**: authenticator secrets are stored encrypted with AES-256-GCM, under a key that lives
  outside the database.
- **Settings**: profile and time zone, email change, password, two-step sign-in, devices, data
  export and account deletion.
- **Security**:
  - a strict content security policy and isolation headers on every response;
  - settings checked at start-up, so a missing secret stops the server instead of failing later;
  - a request log with no query strings, bodies or email addresses;
  - errors that never expose internals;
  - scrypt password hashes that store their own cost settings.
- **Layout**: the shared [`@project-graphite/ui`](https://github.com/Project-Graphite/graphite-ui)
  shell, with a sidebar on desktop and a tab bar on phones, and browser tabs named after the page.
- **Errors** say what went wrong and what to do next: inline on forms, with Try again on anything
  that failed to load, and in plain words when a followed calendar can't be read.
- Privacy and terms pages.

## Stack

- React 19, Vite, Tailwind CSS 4 and `@project-graphite/ui`.
- NestJS 12, Prisma 7 and PostgreSQL 18.
- Redis 8 for rate limits, widget caching and the health check; required in production.
- One container serves the built frontend and the `/api/v1` API, and runs migrations when it
  starts.

## Running it

```sh
docker compose up -d --build
```

| Address | What it is |
| :--- | :--- |
| http://localhost:4104 | the app, through Vite |
| http://localhost:4102 | the server directly |
| http://localhost:4125 | Mailpit, which catches every email sent locally |

Vite does not see edits through a Windows bind mount, so restart the container after editing:

```sh
docker compose restart app frontend
```

`node_modules` lives in anonymous volumes filled from the image, so after a dependency change
rebuild and renew them:

```sh
docker compose up -d --build -V app frontend
```

Checks run from `app/`. The last one keeps the frontend inside its bundle budget:

```sh
npm ci && npm run lint && npm test && npm run build
npm run check:bundle --workspace frontend
```

Give an account the system manager role from inside the running container. Add `--transfer` to
hand the role over:

```sh
docker compose exec app npm run system-manager:grant --workspace server -- you@example.com
```

In production, open the `app` container's Terminal in the
[Graphite Console](https://console.project-graphite.com), or `docker exec` into it on the VPS, and run:

```sh
npm run system-manager:grant --workspace server -- you@example.com
```

## Layout

| Folder | What it is |
| :--- | :--- |
| `app/server` | NestJS API, Prisma schema and hand-written migrations |
| `app/frontend` | React app and Capacitor Android project (`app/frontend/android`) |
| `app/Dockerfile` | development, build and production stages; the image is `ghcr.io/project-graphite/strata/app` |

### Android app

Build the frontend and sync the Capacitor Android project from `app/`:

```sh
npm run android:build --workspace frontend
```

There are two flavours, built from `app/frontend/android` with `./gradlew assemblePlayRelease` or
`./gradlew assembleSideloadRelease`. Both read notifications from allow-listed finance apps and
SMS senders; only `sideload` asks for `READ_SMS` to read the last 90 days of texts, and CI fails if
`play` does. Tagged releases (`v*`) attach the `sideload` build as `strata.apk` to the GitHub
release via `.github/workflows/release.yml`, linked from the Strata home page and phone setup
dialog.

## Production

Production runs at `strata.project-graphite.com` from
[`deploy/strata/values.yaml`](https://github.com/project-graphite/platform/blob/main/deploy/strata/values.yaml) in `platform`. A push to `main` records the
image tag there, which deploys it. Uploaded files live in the `files-data` volume at `/data/files`
(`FILES_ROOT`, default `/data/files`). The `backup` service writes a `pg_dump` and a tar of the files
into the `backups` volume once a day and keeps `BACKUP_KEEP_DAYS` days of them.

These values live only in the organisation's secrets repository:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `AUTH_ACCESS_TOKEN_SECRET`, at least 32 characters
- `DATA_ENCRYPTION_KEY`, 32 random bytes in base64 (`openssl rand -base64 32`). Never change it
  without re-encrypting the stored secrets, or every two-step sign-in breaks.
- `EMAIL_HOST` and `DEFAULT_FROM_EMAIL`

The server refuses to start in production without `REDIS_URL`.

Optional: `EMAIL_PORT` (default `587`), `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `BACKUP_KEEP_DAYS` (default `14`), and:
- `TRUST_PROXY`, the number of proxy hops whose `X-Forwarded-For` is trusted for client addresses
  (`0` to `5`, default `1`);
- `SENTRY_DSN`, which turns on error reports for unexpected 500s, scrubbed of cookies, tokens,
  bodies and query strings;
- `METRICS_TOKEN`, at least 32 characters, which serves Prometheus metrics at `/api/v1/metrics`
  to `Authorization: Bearer <token>`.

## Conventions

Pull request titles follow `type(scope): summary` using one of `feat fix chore refactor docs test ci
perf revert style build`.
