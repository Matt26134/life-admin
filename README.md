# Life Dashboard V2.0.0

Local-first personal PWA. The GitHub repository contains application code only; personal records and attachments stay in IndexedDB on the device/browser profile.

## V2 highlights
- Connected file linking: one file can link to multiple plans, schedule items and tasks without duplicate storage.
- Global local search across tasks, plans, schedule, lists, files, Inbox and templates.
- Smart Home/Today combines due tasks with itinerary items and switches emphasis when a trip is underway.
- Adaptive trip overview with Today, Next Up and things still to book.
- Reusable checklist templates.
- Recurring tasks (daily, weekly, monthly, yearly).
- Image thumbnails and pinned files in the Vault.
- Task note previews, stricter schedule date validation, improved Next Up handling and list rename/edit.

## Data migration
V2 upgrades the existing `LifeDashboardDB` IndexedDB database from schema version 1 to schema version 2. Existing stores are preserved in place and a new `templates` store is added. Existing V1 task, list, plan, file, Inbox and settings records are not cleared or recreated. Legacy single file links (`planId`, `itineraryItemId`) remain supported alongside V2 multi-link arrays.

Make an encrypted backup before deploying a major update. Do not clear Samsung Internet site data: the dashboard is intentionally local-first.
