# Keep self-hosted Better Auth

We will keep Better Auth self-hosted with the application and Neon HTTP for the current authentication database access. Neon Managed Auth remains a possible future migration, but it is not a drop-in fix because this application uses local auth tables, custom roles, server-side session checks, and user foreign keys.

**Consequences**

- Better Auth remains responsible for authentication routes and sessions.
- Neon HTTP remains the default database driver for non-transactional auth operations.
- The application must require a production `BETTER_AUTH_SECRET`.
- A future Neon Managed Auth migration must include an explicit identity and authorization migration plan.
