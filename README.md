# Life Dashboard — V1.1.1

A mobile-first, local-first personal PWA for tasks, lists, plans/trips, an Inbox and locally stored files.

## Privacy model

The GitHub repository contains application code only. Personal data is stored in the browser's IndexedDB on the device that is using the app. A visitor opening the public GitHub Pages URL on another device receives a fresh empty dashboard.

Files such as PDFs, screenshots and tickets are stored as blobs in IndexedDB. They are not embedded into this repository.

Important: browser/site data can still be deleted by the operating system, browser settings, a factory reset or a phone replacement. Use the encrypted backup feature regularly.

## V1.1 features

- Home dashboard with visible running version number
- Tasks with Today / Upcoming / Waiting / All views
- Tasks can be linked to a Plan and remain one shared record
- Lists including shopping/checklists
- Plans for trips, events, days out and projects
- Plan itinerary, linked tasks, checklist, notes and attachments
- Vault for local PDFs/images/files
- Inbox for quick capture
- AES-GCM encrypted full backup/restore including attachments
- Local storage information and persistence request
- PWA manifest and service worker for install/offline app shell
- Update/version check and cache controls
- Mobile safe-area and dynamic viewport handling

## Deployment

Publish the repository root from the `main` branch using GitHub Pages. No build step is required.


## V1.1.1 changes

- Added an in-app attachment chooser: Take photo, Choose from gallery, or Browse files.
- Applied the same attachment flow to Vault, Plans, schedule items and Quick Add.
- No database/schema changes; existing local data remains compatible.

## V1.1.0 changes

- Trip end dates can no longer be earlier than start dates.
- Schedule items can be edited.
- Files can be attached directly to a schedule item while remaining visible in the Plan Files area and global Vault.
- Trips have a richer travel-companion design with countdowns, progress state, next-up card, quick-access tiles and a visual timeline.
- Existing V1.0 IndexedDB data is preserved; no database reset is required.
