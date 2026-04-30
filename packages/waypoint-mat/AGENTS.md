This package parses html and extracts waypoint information in JSON format.

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

## Coding Style

- Opt for readable code and avoid convoluted code
- Insert newlines to break up logical segments

### Examples

**Bad**

```ts
const trimmed = line.trim();
if (!trimmed || trimmed.startsWith('{|')) continue;
if (trimmed.startsWith('|}')) {
    finalizeRow();
    continue;
}
if (trimmed.startsWith('|+') || trimmed.startsWith('!')) continue;
if (trimmed.startsWith('|-')) {
    finalizeRow();
    continue;
}
if (trimmed.startsWith('|')) {
    pendingCells.push(parseCell(trimmed.slice(1)));
}
```

**Good**

```ts
const trimmed = line.trim();

if (!trimmed || trimmed.startsWith('{|')) continue;

if (trimmed.startsWith('|}')) {
    finalizeRow();
    continue;
}

if (trimmed.startsWith('|+') || trimmed.startsWith('!')) continue;

if (trimmed.startsWith('|-')) {
    finalizeRow();
    continue;
}

if (trimmed.startsWith('|')) {
    pendingCells.push(parseCell(trimmed.slice(1)));
}
```

**Bad**

```ts
const files = await readdir(dataDir);
for (const file of files.filter((f) => f.endsWith('.txt'))) {
	const stem = file.slice(0, -4);
	const icon = iconMap[stem];
	if (icon === undefined) continue;

	const content = await readFile(resolve(dataDir, file), 'utf-8');
	const { complete, incomplete } = parseFile(content, icon);
	allComplete.push(...complete);
	allIncomplete.push(...incomplete);
}
```

**Good**

```ts
const files = await readdir(dataDir);

for (const file of files.filter((f) => f.endsWith('.txt'))) {
	const stem = file.slice(0, -4);
	const icon = iconMap[stem];

	if (icon === undefined) continue;

	const content = await readFile(resolve(dataDir, file), 'utf-8');
	const { complete, incomplete } = parseFile(content, icon);

	allComplete.push(...complete);
	allIncomplete.push(...incomplete);
}
```

**Bad**

```ts
const entry: WaypointIncomplete = {
    name,
    color: '#ffffffff',
    icon,
    visibility: 'default',
    territory: territoryStripped,
};
if (notesStripped) entry.notes = notesStripped;
result.incomplete.push(entry);
```

**Good**

```ts
const entry: WaypointIncomplete = {
    name,
    color: '#ffffffff',
    icon,
    visibility: 'default',
    territory: territoryStripped,
};

if (notesStripped) entry.notes = notesStripped;

result.incomplete.push(entry);
```

**Bad**

```ts
const itemName = parseItemName($, tab);

if (!itemName) return;

const contentBlock = contentBlocks.eq(index);

if (contentBlock.length === 0) return;

const table = contentBlock.find('table.wikitable').first();

if (table.length === 0) return;

parseTable($, table, itemName, icon, result);
```

**Good**

```ts
const itemName = parseItemName($, tab);
if (!itemName) return;

const contentBlock = contentBlocks.eq(index);
if (contentBlock.length === 0) return;

const table = contentBlock.find('table.wikitable').first();
if (table.length === 0) return;

parseTable($, table, itemName, icon, result);
```
