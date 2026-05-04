# Demo Script

Use this script for a concise, page-by-page Sonder Book Club walkthrough.

## Demo Goal

Show that Sonder Book Club gives one reading club a single shared workspace for reading coordination, meetings, voting, announcements, and admin control.

## Demo Accounts

- `admin@bookclub.dev` / `Password123!`
- `moderator@bookclub.dev` / `Password123!`
- `member@bookclub.dev` / `Password123!`
- `guest@bookclub.dev` / `Password123!`

## Demo Setup

1. Start the app locally and confirm the database is seeded.
2. Sign in once as `admin@bookclub.dev` to warm the key routes.
3. Keep a private window ready if you want to show the guest or member view live.

## Opening Narrative

"Sonder Book Club is built for one club, not many clubs. Instead of switching between club spaces, invites, and duplicate settings, everything happens in one shared reading workspace."

## Page-by-Page Flow

### 1. Login

1. Open `/login`.
2. Mention that the MVP uses simple email and password sign-in.
3. Sign in as `admin@bookclub.dev`.

Talking points:

- The app has a clean entry point for the whole club.
- Seeded accounts make the demo fast and repeatable.

### 2. Dashboard

1. Land on `/dashboard`.
2. Point out the club identity, current book, reading momentum, next meeting, and recent announcements.

Talking points:

- The dashboard is the club snapshot.
- Members can quickly see what is current, what is next, and what needs attention.

### 3. Books

1. Open `/books`.
2. Show the current read, nominated or backlog titles, and archived books.
3. Optionally add a demo book as an admin.

Talking points:

- Admins and moderators can manage the reading pipeline.
- The book list powers the rest of the club workflow.

### 4. Reading Plan

1. Open `/reading-plan`.
2. Show the active plan and targets.
3. Explain that members log progress against those targets.
4. Optionally create a simple plan if you want a live save example.

Talking points:

- The plan turns one book into a manageable schedule.
- Progress logging supports better discussion pacing.

### 5. Meetings

1. Open `/meetings`.
2. Show the next discussion, RSVP state, and any saved notes or attendance.
3. Optionally create a meeting or update an RSVP.

Talking points:

- Meetings bring scheduling, RSVPs, and notes together.
- This keeps club operations in one place instead of scattered tools.

### 6. Voting

1. Open `/voting`.
2. Show nominations and the current or recent poll.
3. Explain how the club chooses the next read.

Talking points:

- Members nominate titles.
- Moderators convert nominations into a poll.
- Votes stay visible and easy to explain during a live demo.

### 7. Announcements

1. Open `/announcements`.
2. Show recent updates.
3. Optionally publish a short announcement.

Talking points:

- Announcements act as the club notice board.
- This keeps reminders and logistics easy to find.

### 8. Members

1. Open `/members`.
2. Show the roster, membership status, and role visibility.

Talking points:

- Each person has one membership record in one club.
- The single-club model is easier to explain and manage.

### 9. Admin

1. Open `/admin`.
2. Show the club profile form and membership controls.
3. Optionally update one safe field like the description.

Talking points:

- Admin is the single settings surface for the club.
- No club switching or duplicated setup flows remain.

## Optional Permissions Demo

1. Log out.
2. Sign in as `guest@bookclub.dev`.
3. Revisit `/dashboard`, `/books`, and `/meetings`.

Talking points:

- Guests can browse the workspace.
- Restricted actions stay protected until an admin changes the role.

## Closing Summary

"The MVP already covers the core club loop: choose a book, pace the reading, schedule the conversation, vote on what comes next, and keep everyone aligned in one place."
