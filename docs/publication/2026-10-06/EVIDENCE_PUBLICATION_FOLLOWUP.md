# Evidence publication follow-up

## Published supplement

27 original screenshots (7 unique contents) visually reviewed: synthetic actor identifiers and test UI only; no visible credentials or real business data. Original bytes retained. The historical before-RP18-T01 backend .env.example equals the original committed 138cf2d version byte for byte; its credential-pattern match is the already-published example configuration, not evidence of a real credential. These 28 files are now published.

## Local archive

20 large snapshots and 23 temporary environment files are retained in their original locations and also archived as content-addressed gzip objects in /Users/renkang/Documents/RDPMS-evidence-archive/2026-10-06-publication-01/. Directory permissions 0700; objects 0600. EVIDENCE_ARCHIVE_INDEX.json records original path/hash, object/hash and sizes. Every object was decompressed and its original SHA256 verified. Snapshot pairs deduplicate to 10 objects. The index contains no environment values.

This is a durable local second copy, not an offsite or independent-device backup. No remote evidence service was configured. A future approved private backup destination can receive this archive without changing source evidence. GitHub still does not contain the complete raw sealed evidence.

## Recovery

Locate the sourcePath entry, decompress its archiveObject from archiveRoot to a new chosen output location, and compare SHA256 to sourceSha256 before use. Do not overwrite frozen evidence.

## Preservation and scope

LOCAL_EVIDENCE_EXCLUSIONS.json remains the historical first-publication decision; this follow-up supersedes exclusion for the 28 published files only. Forty-three local-only files are explicitly ignored via the repository root .gitignore. Original 71 source file hashes checked unchanged. No business code, tests, migrations, sealed manifests, task acceptance or release states changed. No test/build/database/service operation executed.
