---
name: Mention notification delivery
description: Durable recipient and deduplication rules for chat mention alerts.
---

Each unique mentioned conversation member receives one mention-specific notification, even if referenced repeatedly in the same message. A mentioned recipient must not also receive the ordinary conversation-message notification. The sender is never notified.

**Why:** The user approved distinct mention alerts while explicitly requiring that existing conversation notifications continue without double-notifying mentioned recipients.

**How to apply:** When changing chat delivery, partition recipients by stored mention user IDs, deduplicate by user, retain the conversation/message deep link, and preserve ordinary notifications for all other recipients.