# Private-Prototype Dependency Audit Exception

- Status: `PENDING_UPSTREAM`
- Owner: `te-ppu prototype maintainers`
- Reviewed: 2026-08-02
- Revisit: 2026-09-02, or before private QR or public release, whichever happens first
- Scope: private prototype builds only

## Decision

The repository keeps the official exact dependency `@apps-in-toss/web-framework` `2.10.8`. Do not add npm overrides, run `npm audit fix --force`, or move to framework 3 under this exception.

The reviewed `npm audit --omit=dev --json` result contains 31 vulnerable package records: 1 critical, 12 high, 3 moderate, and 15 low. npm correctly treats these as production dependencies because framework 2.10.8 declares its CLI, Granite, and React Native build stack as ordinary dependencies. This exception does not call the result clean or relabel those packages as dev dependencies.

The critical record is `@fastify/middie@8.3.0`, including [GHSA-72c6-fx6q-fr5w](https://github.com/advisories/GHSA-72c6-fx6q-fr5w). Reviewed high-severity leaves include `fastify@4.14.0`, `find-my-way@7.7.0`, `fast-uri@2.4.4`, and `ip@1.1.9`. The complete normalized advisory metadata, dependency paths, and locked versions are in [`security/dependency-audit-baseline.json`](../../security/dependency-audit-baseline.json).

## Why the private prototype may proceed

- The framework browser entry re-exports the Apps-in-Toss bridge and analytics packages. A full namespace browser bundle included only those runtime packages and their types/bridge core; it included none of the Fastify, middie, router, URI, IP, Granite CLI, or React Native CLI modules.
- The Apps-in-Toss artifact builder collects compiled runtime bundles plus the built web directory. Its dependency list is artifact metadata, not a path that copies `node_modules` into the executable payload.
- The vulnerable modules remain reachable as trusted local build/CLI tooling. Risk rises if that tooling serves an untrusted network or builds attacker-controlled source, so this is a constrained prototype exception rather than a public-release clearance.

The final `.ait` has not yet been built and inspected under the required Node 24 runtime. Task 9 must verify that artifact directly before private QR.

## Enforced controls

Run:

```powershell
npm run check:dependency-audit
```

The command consumes fresh npm audit JSON and the current `package-lock.json`. It exits successfully only when every current vulnerable package matches the reviewed advisory fields, dependency paths, and exact locked versions. It prints every accepted record as `KNOWN_EXCEPTION` and ends with `status=PENDING_UPSTREAM`; success never means zero vulnerabilities.

Malformed npm audit v2 data or baseline policy metadata is an input error (exit 2), not an empty or unchanged audit. The baseline requires the exact status `PENDING_UPSTREAM`, exact scope `private-prototype-only`, and real calendar dates in `YYYY-MM-DD` form.

The checker fails on:

- a new vulnerable package or advisory;
- changed package severity, advisory severity/range/metadata, transitive effects, node paths, or fix availability;
- any changed or missing locked version for a reviewed vulnerable node; or
- expiration of this exception.

A removed audit record is reported as `RESOLVED_EXCEPTION` and does not fail the private-prototype gate. Review the removal before pruning the baseline. Do not regenerate or edit the baseline merely to make the command pass.

The baseline records npm's synthesized top-level package `range`, but the checker does not gate on that one field. Consecutive audits against the same lock produced different equivalent prerelease range spellings for `react-native`; the underlying advisory/dependency `via` entries and locked versions were identical. Advisory ranges inside `via` remain exact gated metadata.

Build tooling must run from trusted source in ephemeral, least-privileged CI. Untrusted pull-request jobs must not receive release secrets. Keep development servers loopback-only or firewalled; do not use the Apps-mode `0.0.0.0` Vite command on an untrusted network.

## Release gates

Before private QR:

1. Re-run the dependency-audit checker under the supported Node 24 runtime and retain its `PENDING_UPSTREAM` output.
2. Build exactly one `.ait`, list every archive entry, and scan entry names plus textual JavaScript/JSON/source-map payloads for exact package markers including `@fastify/middie`, `fastify`, `find-my-way`, `fast-uri`, `ip`, and the affected `@react-native-community/cli*` packages.
3. Stop if a marker appears in shipped content; record the archive path and matching package rather than waiving it automatically.
4. Keep the build private and attach the checker/archive evidence to the QR checklist.

Public submission is blocked while this exception is active. Prefer an official patched stable 2.x release. A framework 3 migration requires an explicit plan change and complete config, API, browser, `.ait`, sandbox, and real-device revalidation. If neither route is available, public release requires a separate written risk acceptance; this prototype exception is insufficient.
