This package parses wikitext data and extracts waypoint information in JSON format.

## Stack

- pnpm - node package manager. also uses workspaces
- Biome - formatter/linter
- Typescript

## Commands

```bash
pnpm start # starts the program
pnpm format # format and lint the code
pnpm typecheck # typescript check
```

## Requirements

- After modifying files
  - `pnpm format` must succeed with no warnings/errors. fix if present and run again
  - `pnpm typecheck` must succeed with no warnings/errors. fix if present and run again
