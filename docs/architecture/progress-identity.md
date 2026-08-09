# Progress identity and local storage

Progress is device-local to a WebView storage instance. It is organized per-HASH for Apps-in-Toss: each exact SDK HASH receives its own localStorage namespace. This design does not provide cross-device sync, server persistence, account transfer, or restoration after a reinstall, storage clearing, another device, or another WebView.

## Keys and recovery boundaries

- Browser preview uses `te-ppu.progress.identity.local.local-browser`. If that scoped key is absent, it may copy a valid old unkeyed `te-ppu.progress` value once.
- Canonical browser and Apps-in-Toss keys use `te-ppu.progress.identity.*`; corruption backups use the disjoint `te-ppu.progress.backup.identity.*` namespace. A backup can therefore never overwrite a canonical key.
- Apps-in-Toss uses the exact SDK HASH for its key and never reads, copies, rewrites, backs up, or deletes owner-ambiguous unkeyed progress. Because ownership cannot be proven, unkeyed legacy progress is not assigned to an Apps-in-Toss HASH; automatic adoption risks cross-account disclosure.
- For Apps-in-Toss, raw legacy recovery evidence remains untouched for rollback or manual support inspection. This is not automatic in-game continuity and is not a seamless or no-loss user-visible migration claim.
- This is the first shipped identity-scoped layout. There is no prior identity-scoped migration; the layout begins with the disjoint backup namespace.

## Identity and future scope

SDK identity failures stop before progress repository selection and are never replaced with browser-local identity. Account A and account B sharing one storage instance remain isolated by their per-HASH keys, while the data remains device-local.

Backend storage, authenticated server APIs, cross-device restore, merge or conflict policy, deletion or export, and account transfer are future external scope. None are implemented by this localStorage layout.
