# Life Dashboard — V1.0.0

A mobile-first, local-first personal PWA for tasks, lists, plans/trips, an Inbox and locally stored files.

## Privacy model

The GitHub repository contains application code only. Personal data is stored in the browser's IndexedDB on the device that is using the app. A visitor opening the public GitHub Pages URL on another device receives a fresh empty dashboard.

Files such as PDFs, screenshots and tickets are stored as blobs in IndexedDB. They are not embedded into this repository.

Important: browser/site data can still be deleted by the operating system, browser settings, a factory reset or a phone replacement. Use the encrypted backup feature regularly.

## V1.0 features

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
