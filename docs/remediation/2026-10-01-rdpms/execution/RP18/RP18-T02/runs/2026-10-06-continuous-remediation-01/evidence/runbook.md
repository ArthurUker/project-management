# Proposed first-safe operational runbook

Local selection approved by user delegated authority; this is not evidence of approved/current target §13 or permission to deploy.

1. Verify supplied PREPARED candidate source/config/output/generated-client/migration bindings, actual target release proofs, exact current baseline under kernel deploy lease. Each migration must have exact hash and candidate compatibility entry.
2. Stop all qualified writers using approved hooks; verify DB/files common recovery point via paired backup. Operator target hook proof mandatory, local simulation is not sufficient.
3. Invoke only approved migrations. Record schemaMayHaveChanged BEFORE call, including failure/timeout; never claim pre-DDL rollback if invocation occurred.
4. Reverify hashes/current baseline; publish release manifest, atomic same-filesystem symlink replace. Restart reviewed compiled current only. Missing dist/manifest rejects; never src fallback. Startup literal config schema+prepared fingerprint must match.
5. Three matching build health+ready observations and same-build smoke, then explicitly resume writes. Actual observation time/lag/latency/queue operational thresholds need target owner evidence.
6. Any uncertain stop still attempts independent stopService even if stopWrites fails. Report MAINTENANCE_UNCONFIRMED when containment cannot be proven. With no separately certified safe old artifact, leave service stopped, retain exact current/schema/backup and report MAINTENANCE_REQUIRED.
7. Only exact validated securityFloorSafe and post-migration compatible artifact can be automatically rolled back, with reverified build identity/health/ready/smoke. Failed deployment stays overall FAIL even rollback succeeded. Never delete originals/release/backup or run migrate down.

Actual production/change approval, target §13, safe old artifact, proxy/service hooks and target observations absent. Release NOT_EVALUATED.
