# Sonder Building Plan

**Status:** Living product and implementation plan  
**Product:** Sonder Book Club  
**Current baseline:** v0.1.0 single-club MVP  
**Primary direction:** Transform Sonder from a club administration dashboard into the digital place where the book club lives.

---

## 1. Product Vision

Sonder should feel like a warm, active, member-led community rather than a collection of administrative screens.

The core experience should answer this question every time a member signs in:

> What is the Sonder community reading, discussing, recommending, listening to, attending, and supporting today?

Sonder should combine:

- social reading and discussion
- member identity and belonging
- book-club operations
- events and shared memories
- subscriptions, donations, and financial accountability
- a protected digital library where legally permitted

The product principle is:

> Sonder should not merely help manage the book club. It should become the online place where the book club lives.

---

## 2. Product Principles

### 2.1 Community first

Faces, conversations, books, events, and member activity should be more prominent than statistics and administrative controls.

### 2.2 One shared club

Sonder remains a single-club platform. The experience should deepen one community rather than introduce multi-club switching and complexity.

### 2.3 Thoughtful participation

The design should encourage meaningful reviews, reflections, recommendations, and discussions rather than popularity contests or low-quality posting.

### 2.4 Safe and moderated

Posts, comments, uploads, events, payments, and member applications need appropriate permissions, reporting, moderation, privacy, and audit history.

### 2.5 Mobile-first

Most community interactions should work comfortably from a phone, including posting, commenting, event registration, reading progress, notifications, and payments.

### 2.6 Progressive delivery

Community foundations should be built before advanced payments, accounting, full music integrations, and complex digital-reader functionality.

---

## 3. Existing Foundation

The current application already includes:

- email and password authentication
- roles for admin, moderator, member, and guest
- dashboard
- current book and book library
- reading plans, targets, and progress
- meetings, RSVPs, attendance, and notes
- nominations, polls, and voting
- announcements
- member directory
- club settings and membership administration
- a membership-payment database model

These features should be retained and repositioned inside a more community-oriented experience.

---

## 4. Owner Feedback and Required Additions

The following requirements came directly from the book-club owner and are part of the approved product direction.

### 4.1 Digital copies of books

Allow authorised administrators to upload a protected digital copy of each book so members can read within Sonder and have their progress recorded.

Planned capabilities:

- PDF and EPUB upload
- protected object storage
- in-app reader
- continue-reading position
- bookmarks
- page or chapter tracking
- automatic reading percentage
- admin-controlled access
- optional download permission
- audit log for uploads and access

Legal requirement:

Only public-domain, owned, or properly licensed material may be distributed through Sonder.

### 4.2 Community news feed

Add a tweet-style but Sonder-branded community feed.

Members should be able to share:

- short reflections
- book quotes
- photos
- reviews
- questions
- book recommendations
- currently reading updates
- currently listening updates
- event updates and memories

Interactions:

- appreciation reactions
- comments
- threaded replies
- mentions
- bookmarks
- reports
- moderator removal
- admin pinning

The feature should be called the **Community Feed** or **Club Feed**, not tweets.

### 4.3 Subscription payments

Add membership subscription plans and online payment collection.

Capabilities:

- monthly, quarterly, and annual plans
- plan pricing and currency
- checkout
- card and mobile-money support where available
- payment confirmation
- receipts
- provider webhook processing
- failed-payment handling
- renewal dates
- grace periods
- automatic membership status updates
- admin reconciliation

The payment layer must be provider-independent so Sonder is not tightly coupled to one gateway.

Implementation note after v0.3 Change Set 7:

- money is stored as integer minor units with ISO currency codes
- manual/offline membership payments are operational
- Flutterwave sandbox Standard checkout has a server-only adapter and remains
  disabled unless explicit test-mode environment variables are configured
- live online payments are not enabled; production webhook promotion remains
  deferred
- online provider activity is stored in provider-neutral `OnlinePaymentAttempt`
  and `ProviderWebhookEvent` records instead of overloading invoices or settled
  `MembershipPayment` rows
- Sonder's server-generated trusted reference maps to Flutterwave `tx_ref`;
  provider transaction IDs and processor references remain separate from Sonder
  invoice/payment identifiers
- member checkout creates or reuses one active provider attempt, calls
  Flutterwave outside database transactions, and redirects only to an allowlisted
  hosted checkout URL
- return-page query parameters are never proof of payment; they only trigger a
  bounded server-side status check after membership ownership is verified
- the webhook route verifies Flutterwave's documented `verif-hash` secret hash,
  stores idempotency records, and still requires server-side transaction
  verification before giving value
- an invoice may only be settled after trusted server-side verification confirms
  successful provider status, matching Sonder transaction reference, matching
  invoice, matching amount, matching currency, a transaction not previously
  processed, and a payment not already allocated
- Flutterwave webhooks can be delivered more than once, webhook processing must
  be idempotent, mobile-money payments can complete asynchronously, and payment
  confirmation must happen inside the serializable billing transaction helper
- if manual payment changes the invoice before provider settlement, verified
  funds are preserved and routed to admin review rather than silently discarded,
  partially allocated, or marked successful from the browser return
- Flutterwave credentials must never be exposed to the browser; Sonder must not
  store card details, mobile-money PINs, provider access tokens, secret keys, or
  raw sensitive provider payloads, and provider errors/payloads must be sanitised
  before logging
- email jobs can be queued for billing events, but delivery remains provider-disabled
- invoice generation exists as explicit service logic and is not scheduled
- scheduled reconciliation and refund execution are still deferred
- full accounting remains separate from membership billing

### 4.4 Book-club accounting

Add a finance module suitable for the club's day-to-day financial management.

First release:

- income
- expenses
- subscriptions
- ticket revenue
- donations
- charity disbursements
- cash and bank accounts
- categories
- receipt attachments
- budgets
- approvals
- outstanding balances
- monthly income-and-expense report
- cash-flow report
- event and donation reports
- CSV or spreadsheet export
- audit history

Later accounting expansion:

- chart of accounts
- journal entries
- debits and credits
- general ledger
- trial balance

The first version should be a practical club-finance module, not a full enterprise accounting package.

### 4.5 Remove ISBN

Remove ISBN from:

- book forms
- book displays
- validation schemas
- seed data
- Prisma data model through a migration

### 4.6 Email notifications

Members should receive configurable email notifications for important activity.

Notification events:

- registration confirmation
- application approval, rejection, or waitlisting
- new-member welcome
- new announcements
- important feed activity
- mentions and replies
- reading-plan deadlines
- meetings and event reminders
- RSVP confirmation
- poll opening and closing reminders
- subscription due dates
- successful and failed payments
- receipts
- ticket purchases
- donations
- cancellations or refunds

Notification controls:

- immediate essential messages
- optional activity notifications
- weekly digest
- unsubscribe controls
- delivery log
- failed-delivery tracking

### 4.7 Registration and membership applications

The existing signup flow should become a proper membership application process.

Suggested application fields:

- full name
- email
- phone number
- location
- occupation, optional
- profile photo, optional
- reading interests
- favourite genres
- favourite books
- reason for joining
- how the applicant heard about Sonder
- acceptance of club rules
- privacy consent

Application statuses:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- APPROVED
- REJECTED
- WAITLISTED

Approval should create or activate a membership and trigger an onboarding email and community welcome post.

### 4.8 Member recommendations and listening activity

Book recommendations must be separate from formal book nominations.

Recommendation capabilities:

- title and author
- cover image
- genre
- member commentary
- reason for recommendation
- likes and comments
- save to personal shelf
- promote to formal nomination

Listening activity should initially support manual sharing of:

- songs
- albums
- playlists
- podcasts
- audiobooks
- artist or creator
- Spotify link
- Apple Music link
- optional commentary

Later integrations may allow members to authorise Spotify or Apple Music access. The first release should use links and embeds rather than streaming media directly through Sonder.

### 4.9 Events, tickets, donations, and charities

Create a public-facing and member-facing Events module separate from internal meetings.

Capabilities:

- event title and description
- banner or poster
- physical or online venue
- date and time
- organiser information
- ticket categories
- free and paid tickets
- capacity limits
- checkout
- unique ticket codes
- QR-code check-in
- attendee list
- cancellation and refund status
- donation option during checkout
- supported charity or campaign
- fundraising target
- amount raised
- receipts
- post-event finance report
- event photo gallery
- post-event reflections

Core entities may include:

- Event
- TicketType
- TicketOrder
- Ticket
- EventAttendee
- Charity
- FundraisingCampaign
- Donation
- PaymentTransaction
- Refund

Subscriptions, tickets, and donations should share one payment engine.

---

## 5. Community Experience

### 5.1 Community-first homepage

Replace the statistics-heavy dashboard emphasis with a **Community Home**.

Suggested structure:

1. Welcome and member identity
2. Quick actions
3. Community feed
4. Current book and reading progress
5. Upcoming meeting or event
6. Weekly prompt
7. New-member welcome
8. Member spotlight
9. Recommendations
10. Currently listening activity
11. Announcements
12. Administrative summaries for authorised roles

Example opening message:

> Welcome back. Here is what the Sonder community is talking about.

Quick actions:

- Create post
- Recommend a book
- Share what you are listening to
- Update reading progress
- RSVP to an event

### 5.2 Recommended navigation

Member navigation:

- Home
- Community
- Books
- Discussions
- Events
- Members
- Notifications
- My Profile

Admin-only additions:

- Finance
- Administration

Existing reading plans, polls, meetings, and announcements should remain accessible but feel like activities inside the community rather than isolated management modules.

### 5.3 Member profiles

Each member profile should include:

- profile photograph
- short biography
- location, optional
- favourite genres
- favourite books
- current book
- personal bookshelves
- reading history
- recommendations
- currently listening
- posts and comments
- reviews
- events attended
- reading circles joined
- contribution badges
- join date
- optional social links
- notification and privacy preferences

### 5.4 Personal bookshelves

Default shelves:

- Currently Reading
- Want to Read
- Finished
- Did Not Finish
- Favourite Books
- Recommended by Sonder

Members may create custom shelves such as:

- African Authors
- Poetry
- Business Books
- Audiobooks
- Books That Changed Me

### 5.5 Social interactions

Required social features:

- comments
- threaded replies
- mentions
- post and comment notifications
- bookmarks
- reporting
- moderation
- pinned posts

Recommended appreciation reactions:

- Insightful
- Beautifully Said
- Adding to My List
- I Agree
- Made Me Think
- Applause

Avoid follower counts and popularity-focused metrics in the first community release.

---

## 6. Reading Community Features

### 6.1 Spoiler-safe chapter discussions

Create discussion spaces based on:

- chapter
- page range
- reading-plan milestone
- characters
- themes

Content beyond a member's recorded progress can be hidden behind spoiler controls.

### 6.2 Reading circles and buddy reads

Allow small temporary groups around a book, genre, challenge, or audiobook.

Each circle may include:

- title and purpose
- members
- shared book
- shared target
- discussion thread
- progress overview
- private event or meeting

Examples:

- African Literature Circle
- Nonfiction Circle
- New Members Circle
- Audiobook Circle

### 6.3 Reviews and ratings

After finishing a book, members may submit:

- rating
- short review
- favourite quote
- memorable character
- recommendation decision
- optional spoiler section

Book pages may show:

- Sonder community rating
- number of members reading
- number finished
- recommendation count
- reviews
- related discussions

### 6.4 Reading challenges

Examples:

- Read 12 books this year
- Read five African authors
- Read one book from each selected genre
- Attend four discussions
- Recommend three books

Challenges should motivate participation without creating unhealthy competition.

### 6.5 Weekly community prompts

Moderators should be able to schedule prompts such as:

- What passage stayed with you this week?
- Which character would you invite to dinner?
- What are you currently listening to?
- Which African author should more people know?

Members can answer directly from the homepage.

### 6.6 Book lending and exchange

Members may indicate:

- own a physical copy
- willing to lend
- want to borrow
- want to exchange
- want to donate
- returned status

Private addresses must not be exposed. Handover can occur at meetings or approved venues.

---

## 7. Community Identity and Belonging

### 7.1 New-member welcomes

When an application is approved:

- publish a welcome post
- invite an introduction
- show reading interests
- recommend upcoming events
- suggest relevant community spaces
- optionally display a temporary New to Sonder badge

### 7.2 Member spotlight

Allow moderators to feature a member with:

- short profile
- favourite book
- current read
- current listening selection
- personal recommendation
- reason for joining
- community contribution

### 7.3 Community spaces

Suggested spaces:

- General Conversation
- Current Book
- African Literature
- Book Recommendations
- Audiobooks and Podcasts
- Music
- Writers' Corner
- Events
- Charity and Volunteering

The main feed can surface selected activity from each space.

### 7.4 Contribution badges

Suggested badges:

- Founding Member
- Thoughtful Reviewer
- Community Welcomer
- Event Volunteer
- Consistent Reader
- Book Recommender
- Charity Supporter
- Discussion Leader

Badges should reward meaningful contribution rather than posting volume.

### 7.5 Community archive

Create a historical archive containing:

- every club book
- reading period
- final community rating
- discussion highlights
- meeting and event photos
- poll results
- member reviews
- charity and fundraising outcomes

### 7.6 Sonder Year in Reading

Generate an annual digital summary containing:

- books read
- popular recommendations
- events held
- member milestones
- favourite quotations
- funds raised
- charity activities
- new members
- community photographs

A future version may support PDF export.

---

## 8. Events and Shared Memories

In addition to ticketing and donations, the Events module should support:

- event-planning polls
- date and venue voting
- guest-speaker voting
- attendee profiles
- event reminders
- event photo albums
- member tagging
- captions
- reflections
- highlights posts
- attendance memories on member profiles

Internal book discussions may remain Meetings, while public or ticketed activities belong under Events.

---

## 9. Notifications

Sonder should include both in-app and email notifications.

In-app notification triggers:

- mentions
- replies
- reactions
- recommendation comments
- reading-circle updates
- event reminders
- poll reminders
- membership decisions
- payment status
- ticket and donation confirmation

Email strategy:

- immediate email for essential transactional events
- configurable email for community activity
- weekly digest for general activity

Weekly digest may contain:

- popular discussions
- current reading target
- upcoming meeting or event
- recommendations
- new-member introductions
- subscription status

---

## 10. Digital Library Architecture

Digital book files should not be stored in GitHub or directly inside PostgreSQL.

Recommended architecture:

- secure object storage
- signed, expiring access URLs
- database record for file metadata
- access-control checks before every read
- protected reader route
- progress events stored separately
- file virus scanning
- file type and size restrictions
- upload audit trail

Potential entities:

- DigitalBookAsset
- BookAccessPolicy
- ReadingSession
- Bookmark
- ReaderProgress
- BookAnnotation

---

## 11. Payments and Finance Architecture

### 11.1 Shared payment engine

All money flows should use a common transaction layer:

- membership subscriptions
- event tickets
- donations
- refunds

Suggested entities:

- PaymentProvider
- PaymentTransaction
- PaymentAttempt
- PaymentWebhookEvent
- Refund
- Receipt

### 11.2 Finance module

Suggested entities:

- FinancialAccount
- IncomeCategory
- ExpenseCategory
- FinanceTransaction
- Budget
- ReceiptAttachment
- Approval
- CharityDisbursement
- Reconciliation

Every successful subscription, ticket sale, or donation should automatically create a finance transaction.

### 11.3 Financial controls

Required controls:

- role-based access
- immutable payment references
- audit trail
- attachment support
- approval status
- void and reversal rather than silent deletion
- exportable reports
- clear separation between donations and general income

---

## 12. Proposed Data-Model Additions

Likely new or expanded entities:

### Community

- CommunityPost
- PostAttachment
- PostReaction
- PostComment
- CommentReaction
- PostBookmark
- ContentReport
- CommunitySpace
- SpaceMembership

### Profiles and discovery

- MemberProfile
- MemberInterest
- Bookshelf
- BookshelfItem
- BookReview
- BookRecommendation
- ListeningActivity
- ContributionBadge
- MemberBadge

### Reading community

- BookDiscussion
- DiscussionThread
- ReadingCircle
- ReadingCircleMember
- ReadingChallenge
- ChallengeParticipation
- WeeklyPrompt
- PromptResponse
- BookLoan

### Membership

- MembershipApplication
- ApplicationReview
- MembershipPlan
- Subscription

### Notifications

- Notification
- NotificationPreference
- EmailDelivery
- DigestSubscription

### Events and fundraising

- Event
- TicketType
- TicketOrder
- Ticket
- EventAttendee
- EventMedia
- Charity
- FundraisingCampaign
- Donation

### Digital library

- DigitalBookAsset
- BookAccessPolicy
- ReadingSession
- Bookmark
- ReaderProgress

### Finance

- PaymentProvider
- PaymentTransaction
- PaymentAttempt
- PaymentWebhookEvent
- Refund
- Receipt
- FinancialAccount
- FinanceTransaction
- Budget
- ReceiptAttachment
- Reconciliation

These names are provisional and should be refined during schema design.

---

## 13. Recommended Delivery Roadmap

### Phase 0 — Foundation and product cleanup

Goals:

- protect the current MVP
- remove obsolete fields
- prepare for modular growth

Scope:

- remove ISBN
- create migration strategy
- review authentication and role permissions
- establish media-upload abstraction
- establish notification abstraction
- establish payment-provider abstraction
- add audit-log foundation
- define community moderation rules
- update navigation architecture

### Phase 1 — Sonder v0.2: Community Foundation

Primary objective:

Make Sonder feel alive and member-led.

Scope:

- redesigned community homepage
- member profiles and profile photographs
- Community Feed
- posts and media
- comments and threaded replies
- appreciation reactions
- bookmarks
- reporting and moderation
- mentions
- in-app notifications
- book recommendations
- manual currently listening posts
- personal bookshelves
- book reviews and ratings
- weekly prompts
- new-member welcome posts
- member spotlight
- event preview cards

### Phase 2 — Membership and Engagement

Scope:

- membership application workflow
- review and approval screens
- onboarding emails
- notification preferences
- weekly email digest
- community spaces
- spoiler-safe discussions
- reading circles
- reading challenges
- book lending and exchange
- improved member directory and discovery

### Phase 3 — Sonder v0.3: Payments and Events

Scope:

- membership plans
- subscription checkout
- payment transactions and webhooks
- receipts
- payment-status-driven membership access
- public events
- ticket types
- ticket checkout
- QR-code tickets
- check-in
- donations
- charity campaigns
- refunds
- event photo albums and reflections

### Phase 4 — Sonder v0.4: Finance and Digital Library

Scope:

- income and expense ledger
- cash and bank accounts
- budgets
- receipt uploads
- approvals
- reporting
- reconciliation
- charity disbursement tracking
- digital book uploads
- protected PDF and EPUB reader
- bookmarks
- continue reading
- automatic progress tracking

### Phase 5 — Advanced Integrations and Heritage

Scope:

- Spotify account integration
- Apple Music integration
- advanced recommendations
- annual reading archive
- Sonder Year in Reading
- PDF yearbook export
- deeper accounting if required

---

## 14. Priority Classification

### Must have for the community transformation

- community homepage
- member profiles
- feed
- posts
- comments
- reactions
- recommendations
- listening posts
- notifications
- membership applications
- events preview

### Must have before collecting money

- payment-provider abstraction
- secure webhook verification
- transaction ledger
- receipts
- reconciliation process
- clear refund handling
- audit logging
- privacy and terms documentation

### Must have before distributing digital books

- legal-rights confirmation
- protected storage
- access control
- signed URLs
- upload validation
- reader progress model
- audit log

### Valuable after the foundation

- spoiler-safe discussions
- reading circles
- challenges
- lending exchange
- member spotlight
- community spaces
- event albums
- annual archive

---

## 15. Features to Delay

The following should not be prioritised in the early community release:

- private direct messaging
- built-in video calling
- follower systems
- public follower counts
- competitive leaderboards
- automatic AI-generated social posts
- direct music streaming
- full Spotify and Apple Music account access
- enterprise-grade accounting

Reasons:

- moderation burden
- safeguarding and privacy concerns
- high complexity relative to immediate member value
- risk of distracting from the shared-club experience

Zoom, Google Meet, or Microsoft Teams links can support virtual meetings without building video infrastructure.

---

## 16. Safety, Privacy, Legal, and Governance Requirements

### Community safety

- member reporting
- moderator review queue
- content removal history
- blocked upload types
- role-based posting controls
- rate limits
- clear community standards

### Privacy

- configurable profile visibility
- no public exposure of private contact details
- consent for photographs and member tagging
- account and data deletion process
- privacy notice

### Payments

- do not store raw card data
- verify provider webhooks
- protect transaction references
- maintain refund and reversal records
- preserve audit history

### Digital books

- confirm distribution rights
- restrict access to authorised members
- use secure storage
- prevent public permanent file URLs
- document takedown process

### Finance

- separate duties where possible
- preserve original records
- avoid hard deletion of financial activity
- retain receipts and approvals
- distinguish donations from subscriptions and ticket revenue

---

## 17. UX and Visual Direction

The interface should become warmer, more editorial, and more human.

Use:

- member photography
- book covers
- event imagery
- generous spacing
- reading-focused typography
- journal-like post cards
- soft backgrounds
- clear mobile interactions

Reduce homepage emphasis on:

- summary statistics
- dense administrative cards
- system terminology

The user should see conversations and people before management metrics.

---

## 18. Definition of Success

The community transformation is successful when:

- members have a reason to return several times per week
- the homepage regularly shows member-created activity
- new members are visibly welcomed
- books generate discussion beyond formal meetings
- recommendations lead to saved books or nominations
- events create activity before and after the event date
- notification volume is useful rather than overwhelming
- administrators can moderate without technical support
- payments and financial records reconcile reliably
- digital-book access remains controlled and lawful

Suggested product metrics:

- weekly active members
- posts per active member
- comments and reactions per post
- percentage of members with complete profiles
- weekly prompt participation
- recommendation saves
- reading progress updates
- event RSVP conversion
- subscription payment success rate
- digest open rate
- approved applicant activation rate

---

## 19. Immediate Implementation Order

The recommended first development package is:

1. Remove ISBN
2. Redesign navigation and homepage structure
3. Add member profiles and profile photographs
4. Build the Community Feed
5. Add comments, replies, and appreciation reactions
6. Add book recommendations
7. Add manual currently listening activity
8. Add in-app notification foundation
9. Add membership application workflow
10. Add weekly prompts, welcome posts, and member spotlight
11. Add events preview to the homepage
12. Add moderation and reporting controls

This package creates the community feel before introducing the financial and digital-library complexity.

---

## 20. Open Decisions

The following decisions must be made before their relevant implementation phase:

- payment provider for Zambia and target markets
- supported currencies
- membership plan structure and prices
- whether guests can post or only browse
- whether membership approval is always manual
- maximum upload sizes and supported media types
- whether digital books can be downloaded or only read in-app
- legal ownership or licensing process for uploaded books
- finance approval roles
- charity payout and verification process
- event refund policy
- which notifications are mandatory
- whether profiles are visible to guests
- Spotify and Apple Music integration depth

---

## 21. Change-Control Rule

This file is the authoritative high-level building plan for Sonder.

Before implementing a major feature:

1. Confirm that it appears in this plan.
2. Define the user story and acceptance criteria.
3. Identify schema, permissions, notifications, moderation, and audit implications.
4. Implement on a feature branch where possible.
5. Validate linting, type checking, build, migrations, and critical user flows.
6. Update this plan and the changelog when scope changes.

---

## 22. Current Product Statement

> Sonder is a private digital home for a real book-club community: a place to read together, share ideas, discover books and music, attend events, welcome members, support charities, and manage the club responsibly.
