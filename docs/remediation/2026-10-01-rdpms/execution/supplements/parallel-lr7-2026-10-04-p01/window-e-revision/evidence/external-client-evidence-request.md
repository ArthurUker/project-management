# External Client Evidence Request — Window E (S03-OI-09 / T-RP-03)

**Purpose:** enumerate the externally-sourced facts this window could NOT obtain, with a blank fill-in
structure. **No server, SSH, credential, dotenv, or real-client access was used** (prohibited by
authorization). Fill these in from deployment/telemetry/product owner sources, then return to the
integrator so `S03-OI-09` can move from `OPEN` to a certifiable state.

## 1. Deployed client versions (per instance / environment)
Needed to answer: *which supported task client versions send `expectedUpdatedAt`/`baseUpdatedAt`, and are
stale writes rejected across every field/status/assignee entry?*

| # | Instance / environment | Frontend build version | Backend version | Deploy date | Live? | Notes |
|---|------------------------|-----------------------|----------------|------------|-------|-------|
| 1 | ______________________ | _____________________ | ______________ | __________ | ___   |       |
| 2 | ______________________ | _____________________ | ______________ | __________ | ___   |       |
| 3 | ______________________ | _____________________ | ______________ | __________ | ___   |       |

## 2. Legacy / pre-baseline clients still in the field
| # | Client build | Can send baseline? (Y/N) | Count / rough share | Last seen | Owner action |
|---|--------------|--------------------------|---------------------|-----------|--------------|
| 1 | ____________ | ____                     | ___________________ | _________ | ____________ |

## 3. Product-declared supported versions
- [ ] Minimum supported client version: `______________`
- [ ] Supported-client allowlist (if any): `______________`
- [ ] Source document / owner: `______________`, date: `______________`

## 4. Upgrade cutoff / sunset
- [ ] Mandatory baseline enforcement cutoff (tasks): `______________`
- [ ] `allowLegacyCompat` flip-to-false date (reports, then tasks): `______________`
- [ ] Grace period / comms plan: `______________`

## 5. Instance / source inventory
- [ ] Where do clients run (web origin(s), embedded, kiosk, etc.)? `______________`
- [ ] How is the running build version determined (telemetry, header, deploy manifest)? `______________`
- [ ] Contact / system that can answer 1–4: `______________`

## How to use the answers
1. Map each live build to its baseline capability (sends baseline? yes/no per entity).
2. For any live build that CANNOT send a baseline on task writes, that build is in scope of the T-RP-03
   legacy window and must be either (a) forced to upgrade before the cutoff, or (b) explicitly covered by a
   time-boxed legacy-compat path (mirroring reports' `allowLegacyCompat` + `assertLegacyCompatAllowed`).
3. Return the filled table to the integrator; only then can `S03-OI-09` validation move from `NOT_RUN` and
   `T-RP-03` move from `PROPOSED` to approved.

## What this window already established (no external input needed)
- Source-side revision chain is fully traced (see `source-client-matrix.md`/`.csv`).
- The reports online path already enforces a version-gated baseline; tasks do not (the asymmetry to close).
- `package.json` versions (frontend 1.0.0 / backend 2.0.0) are build metadata, not deployment/support proof.
