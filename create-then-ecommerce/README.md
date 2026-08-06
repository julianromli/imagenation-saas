# create-then-ecommerce

Scaffold a [then. ecommerce](https://github.com/julianromli/then-ecommerce) store.

## Usage

```bash
bun create then-ecommerce
```

Equivalent commands:

```bash
bunx create-then-ecommerce
npm create then-ecommerce
```

The CLI prints a MAYAR banner, clones the template, prompts for env values,
generates `BETTER_AUTH_SECRET`, installs dependencies, and runs `bun setup`.

## Local development (unpublished)

From the monorepo root:

```bash
node ./create-then-ecommerce/bin/cli.js my-store
```

## Publish (maintainers)

Do not publish unless you intend to release a new CLI version.

```bash
cd create-then-ecommerce
npm login
npm publish --access public
```

Notes:

- Package name must remain `create-then-ecommerce` so `bun create then-ecommerce` resolves.
- The CLI clones `https://github.com/julianromli/then-ecommerce` at runtime. Keep that repo public.
- Bump `version` in `package.json` before each publish.
- After publish, verify: `bunx create-then-ecommerce@latest --help`
