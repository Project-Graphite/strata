# Google OAuth verification for two-way Google Calendar sync

Calendar sync is **read-only** for now. Strata reads the Google calendars a user picks, and changes made in Strata
stay in Strata. Making it two-way needs `calendar.events`, a sensitive scope that Google reviews with a written
justification and a demo video. This document covers that review.

| Scope | Feature | Requested now |
| --- | --- | --- |
| `openid`, `email`, `profile` | Sign in with Google | Yes |
| `https://www.googleapis.com/auth/drive.file` | Drive import (Picker) | Yes |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Choosing calendars to sync | Yes |
| `https://www.googleapis.com/auth/calendar.events.readonly` | Reading synced calendars | Yes |
| `https://www.googleapis.com/auth/calendar.events` | Sending Strata events to Google | No, needs this review |

## Turning on two-way sync

All the push code is already in place. It runs only for accounts that granted `calendar.events`.

1. In `app/server/src/google/google-client.ts`, replace `calendar.events.readonly` with `calendar.events` in
   `googleScopes.calendar`.
2. Add `calendar.events` to the consent screen's **Data access** list, then submit it for verification. The rest of
   this document covers that.
3. Users who already connected reconnect from **Agenda → Calendars** to grant the new scope.
   - Until they do, their sync stays read-only.
   - Once they do, new Strata events go to the Google calendar marked as the default.

Until `calendar.events` is verified, anyone granting it sees "Google hasn't verified this app" and continues
through **Advanced → Go to Strata**. At most 100 Google accounts can grant it.

## Before submitting

1. **Domain.** `project-graphite.com` is verified in Search Console by an Owner of the Cloud project, and it is
   listed under Authorized domains.
2. **Branding.** Branding is already verified.
3. **Homepage.** `https://strata.project-graphite.com/` loads for a signed-out visitor, names Strata, says what it
   does and links to the privacy policy.
4. **Privacy policy.** `https://strata.project-graphite.com/privacy` must state how Google user data is used. Add a
   Google section to `PrivacyPage` in `app/frontend/src/pages/LegalPages.tsx` that says:
   - Strata reads events from the Google calendars the user chooses, writes the events they create, change or
     delete in Strata back to their chosen Google calendar, and lists their calendars so they can pick which to
     sync;
   - this data is used only to show and keep the user's own agenda in sync, and is not shared, sold, used for
     advertising, or read by people except for security, legal compliance, or with the user's consent;
   - disconnecting Google in Settings → Security, or deleting the account, removes synced Google events and
     revokes access;
   - this sentence, word for word: "Strata's use and transfer of information received from Google APIs will adhere
     to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
     including the Limited Use requirements."
5. **Data access.** Add `calendar.events` to the **Data access** list, then open
   **Verification Center → Prepare for verification**.

## Scope justification

Paste into the justification box. Google asks for one per scope.

**`calendar.events`**

> Strata is a personal planner with a two-way Google Calendar sync. The user chooses which of their Google
> calendars to sync. Strata reads the events in those calendars so they appear in the user's Strata agenda, and
> writes the events the user creates, edits or deletes in Strata to the Google calendar they picked for new
> events, so both stay in step. A read-only scope is not enough, because the feature writes the user's own Strata
> events to Google Calendar. Calendar data is used only to show the user their own agenda. It is never shared,
> sold or used for advertising. Disconnecting Google removes the synced events and revokes access.

**`calendar.calendarlist.readonly`**

> Used only to list the calendars in the user's Google account, so they can choose which calendars Strata syncs
> and which one receives new Strata events. Strata does not change the user's calendar list.

## Demo video

The video is an unlisted YouTube link. Record it in English, on the live site (`https://strata.project-graphite.com`),
with the browser address bar visible throughout.

1. **Sign in.** Open the homepage, sign in, and go to **Agenda → Calendars**.
2. **Consent screen.** Click **Connect Google Calendar**. On Google's consent screen:
   - zoom in on the address bar until the `client_id` matches the OAuth client under review;
   - show the app name "Strata";
   - show the calendar permissions, including the one to see, edit, share and delete events, then grant them.
3. **Choose calendars.** Back in Strata, sync a calendar (the plus button) and make it the calendar that receives
   new Strata events. This shows `calendarlist.readonly`.
4. **Read.** Open the Agenda and show that calendar's Google events there.
5. **Write.**
   - Create an event in Strata and show it appear in Google Calendar.
   - Edit it in Strata and show the change in Google.
   - Delete it in Strata and show it disappear from Google.
6. **Two-way.** Edit an event in Google Calendar and show the change reach Strata. Use **Sync now** on the
   Calendars page to skip the 5-minute wait.
7. **Disconnect.** Go to **Settings → Security → Google → Unlink Google**. Show that the synced events leave the
   Agenda.

Keep it short; three to five minutes is plenty. Google rejects videos that don't show the consent screen with
the client ID, or don't show every scope in use.

## After submitting

Google replies by email to the project's support and developer contacts, often asking follow-up questions.
Approval usually takes from a few days to a few weeks. Once approved, the "unverified app" screen and the
100-user cap go away.
