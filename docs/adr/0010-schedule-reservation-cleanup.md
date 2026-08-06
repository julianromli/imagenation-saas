# Schedule reservation cleanup

Expired reservation cleanup will run from a protected scheduled job instead of public catalog reads. Public reads will remain read-only, while the scheduled job performs the inventory write transaction.
