# Life Dashboard — V1.2.0

A local-first personal PWA for tasks, lists, trips/plans and locally stored files.

## V1.2.0 highlights

- Context-sensitive floating + button (Schedule adds schedule items directly).
- Smarter trip Schedule with automatic date/time sorting and optional anytime entries.
- Type-specific schedule fields for flights, trains, ferries, hotels, activities, food and transport.
- Hotels use check-in/check-out once and automatically appear across the relevant itinerary days.
- Next Up is tappable and jumps to the matching schedule booking.
- Friendly file names on upload plus Rename later; one rename updates every linked view.
- Backup age is visible on Home and in Settings.
- Android PWA share-target support: where the installed browser supports it, files/photos can be shared into Life Dashboard from another app such as Gallery.
- Trip end-date validation remains enforced.

## Data compatibility

V1.2.0 keeps the same `LifeDashboardDB` database name, database version (`1`) and object stores as V1.0/V1.1. Existing records remain compatible. New schedule/file properties are optional fields on existing records.

**Before every release update, make an encrypted backup from Settings.** Updating app files is designed not to clear IndexedDB, but the backup is your rollback protection.

## Privacy

GitHub contains application code only. Tasks, lists, plans and attachments are stored locally in IndexedDB in the browser profile.
