# RP00-T03 — task revision support-chain matrix

- **Task / package:** RP00-T03 / RP00; package remains IN_PROGRESS.
- **Historical finding:** B16, `SUPPORTED / P2`, mapped to RP10. No finding severity/status change and no re-run of the historic probe.
- **Start/end HEAD:** `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`; unchanged.
- **Source changes:** none. The work produced a static matrix from the checked-in frontend/API/offline engine/backend route/command/schema paths.
- **Confirmed current-source split:** Online task PUT/PATCH does not carry a client revision; offline status producers pass optional `baseUpdatedAt`; sync route supports a broader task-field set and optionally checks that timestamp, then uses observed row timestamp CAS during the command transaction. Current frontend assignment/ordinary-field offline enqueue callers were not found.
- **Revision naming gap:** Frontend types declare `version`, while backend Task persists `updatedAt` and has no `version` column. `UpdateTaskDto` does not declare `expectedUpdatedAt`; the server PUT whitelist neither accepts it nor passes `cas`.
- **Historical evidence:** stale PUT with old `expectedUpdatedAt` returned HTTP 200 and overwrote title. Reused from frozen backend results; not rerun.
- **Coverage limit:** only `rdpms-frontend@1.0.0` is identifiable in this checkout. No deployed supported-client list, legacy window, or owner-approved compatibility policy was found. This cannot establish all supported clients, so S03-OI-09 remains OPEN and RP10-T01 stays gated.
- **Acceptance boundary:** static matrix artifact delivered; dynamic B16 ordinary-field/status/assignment/mixed/PATCH acceptance remains NOT_RUN. `PAC-RP00-02` also remains NOT_RUN until the supported-version/gate scope is established.

See `evidence/revision-support-matrix.json` for field and entrypoint rows, source anchors, historical boundary, joint-contract applicability, and unresolved supported-client inventory.
