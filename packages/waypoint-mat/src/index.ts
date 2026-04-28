import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from './parse.js';
import type { Waypoint, WaypointIcon, WaypointIncomplete } from './types.js';

const iconMap: Record<string, WaypointIcon> = {
	farming: 'farming',
	fishing: 'fishing',
	mining: 'mining',
	woodcutting: 'woodcutting',
};

const srcDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(srcDir, '../data/mat');

const allComplete: Waypoint[] = [];
const allIncomplete: WaypointIncomplete[] = [];

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

await writeFile(resolve(dataDir, 'waypoint.mat.json'), `${JSON.stringify(allComplete, null, '\t')}\n`);
await writeFile(resolve(dataDir, 'incomplete.json'), `${JSON.stringify(allIncomplete, null, '\t')}\n`);

console.log(`Written ${allComplete.length} complete and ${allIncomplete.length} incomplete waypoints.`);
