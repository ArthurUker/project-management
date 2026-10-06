# RP13-T01 rollback

No schema or migration. Reverse only this task diff against its recorded start state; do not reset files because RP05/RP07 changes coexist. A compatible rollback must not let clients commit an intermediate page cursor. If reverting the protocol, retain the previous committed cursor and outbox and replay safely. Production rollback rehearsal is NOT_RUN.
