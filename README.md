# Strata

Strata is a free personal workspace for your dashboard, agenda, notes, whiteboards, subscriptions
and files, built by Project Graphite. It is being built in phases. This first release covers
accounts and the app shell.

## Features

- **Accounts**:
  - registration with email verification and resendable links;
  - sign-in with rotating refresh sessions and reuse detection;
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
  shell, with a sidebar on desktop and a tab bar on phones.
- Privacy and terms pages.

## Stack

- React 19, Vite, Tailwind CSS 4 and `@project-graphite/ui`.
- NestJS 12, Prisma 7 and PostgreSQL 18.
- Redis 8 for rate limits.
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

Checks run from `app/`:

```sh
npm ci && npm run lint && npm test && npm run build
```

Give an account the system manager role from inside the running container. Add `--transfer` to
hand the role over:

```sh
docker compose exec app npm run system-manager:grant --workspace server -- you@example.com
```

## Layout

| Folder | What it is |
| :--- | :--- |
| `app/server` | NestJS API, Prisma schema and hand-written migrations |
| `app/frontend` | React app |
| `app/Dockerfile` | development, build and production stages; the image is `ghcr.io/project-graphite/strata/app` |

## Production

`compose.production.yaml` runs on Coolify at `strata.project-graphite.com`. These secrets live only
in Coolify:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `AUTH_ACCESS_TOKEN_SECRET`, at least 32 characters
- `DATA_ENCRYPTION_KEY`, 32 random bytes in base64 (`openssl rand -base64 32`). Never change it
  without re-encrypting the stored secrets, or every two-step sign-in breaks.
- `EMAIL_HOST_PASSWORD`

It also needs `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER` and `DEFAULT_FROM_EMAIL`.

Pushes to `main` deploy only when the repository variable `GRAPHITE_DEPLOY_ENABLED` is `true` and
the `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN` secrets are set.

## Conventions

Pull request titles follow `type(scope): summary` using one of `feat fix chore refactor docs test ci
perf revert style build`.
