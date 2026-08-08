import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from './parse.ts';
import type { Waypoint, WaypointIcon, WaypointIncomplete } from './types.ts';

const iconMap: Record<string, WaypointIcon> = {
  farming: 'farming',
  fishing: 'fishing',
  mining: 'mining',
  woodcutting: 'woodcutting',
};

const srcDir = dirname(fileURLToPath(import.meta.url));
const inputDir = resolve(srcDir, '../data/html');
const outputDir = resolve(srcDir, '../data/mat');

const allComplete: Waypoint[] = [];
const allIncomplete: WaypointIncomplete[] = [];

const files = await readdir(inputDir);

for (const file of files.filter((f) => f.endsWith('.html'))) {
  const stem = file.replace(/ - Wynncraft Wiki\.html$/i, '').toLowerCase();
  const icon = iconMap[stem];

  if (icon === undefined) continue;

  const content = await readFile(resolve(inputDir, file), 'utf-8');
  const { complete, incomplete } = parseFile(content, icon);

  allComplete.push(...complete);
  allIncomplete.push(...incomplete);
}

await writeFile(
  resolve(outputDir, 'waypoint.mat.json'),
  `${JSON.stringify(allComplete, null, 4)}\n`,
);
await writeFile(
  resolve(outputDir, 'incomplete.json'),
  `${JSON.stringify(allIncomplete, null, 4)}\n`,
);

console.log(
  `Written ${allComplete.length} complete and ${allIncomplete.length} incomplete waypoints.`,
);
