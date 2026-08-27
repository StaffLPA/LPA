# LPA 200-user capacity check

## Target profile

- Up to 200 active or invited users.
- Up to 200 roster records, a mix of direct and group conversations, and the latest 100 messages per open conversation.
- Mobile clients remain usable while receiving normal calendar, roster, and message updates.

## Code safeguards

- The mobile fallback sync cadence is 30 seconds. App foregrounding and browser focus still refresh immediately.
- The chat list reads one last message and one unread aggregate per conversation rather than all conversation messages.
- The schema includes indexes for message history, memberships, read state, attachment lookups, push devices, user status, and calendar team/date ordering.
- Chat history uses a virtualized list. Rosters initially render 60 people and offer a visible “Show more” control.

## Pre-release validation

1. Apply the development schema, then publish so the platform can apply the matching index diff to production.
2. Seed or invite representative test users up to 200; do not use real family records for load testing.
3. Sign in as an Admin, Staff-Coach, Parent/Guardian, and Athlete. Verify Home, Calendar, Messages, More, and Admin Dashboard loads and role restrictions still work.
4. Open an account with the largest expected conversation list and another with a 100-message history. Verify opening, searching, scrolling, sending, unread counts, and attachment loading remain responsive.
5. Open the largest roster and calendar set on an Android device. Scroll through the initial rows, use search/team filters, and reveal additional roster rows.
6. With several test clients active, confirm refreshes occur after foreground/focus and no duplicate request burst occurs within the normal 30-second fallback window.
7. Review API workflow logs for slow queries or repeated errors before release.

## Limits to monitor

This work removes avoidable application-level load but does not establish a formal production uptime or throughput guarantee. Re-evaluate database and API capacity if usage grows beyond 200 concurrent active clients, message traffic becomes unusually high, or attachments become a major portion of traffic.