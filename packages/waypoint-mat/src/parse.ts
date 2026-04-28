import type { Waypoint, WaypointIcon, WaypointIncomplete } from './types.js';

export interface ParseResult {
	complete: Waypoint[];
	incomplete: WaypointIncomplete[];
}

interface CellParseResult {
	value: string;
	rowspan: number;
}

interface RowspanSlot {
	value: string;
	remaining: number;
}

// Strip {{...}} templates iteratively to handle adjacent (not nested) templates
function stripTemplates(s: string): string {
	let prev = '';
	let current = s;
	while (current !== prev) {
		prev = current;
		current = current.replace(/\{\{[^{}]*\}\}/g, '');
	}
	return current;
}

function stripWikitext(text: string): string {
	let s = stripTemplates(text);
	// [[link|display]] → display
	s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
	// [[link]] → link
	s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');
	// '''bold'''
	s = s.replace(/'''(.*?)'''/g, '$1');
	// ''italic''
	s = s.replace(/''(.*?)''/g, '$1');
	// <big>text</big>
	s = s.replace(/<big>(.*?)<\/big>/gi, '$1');
	// <br> variants → space
	s = s.replace(/<br\s*\/?>/gi, ' ');
	// Collapse whitespace
	return s.replace(/\s+/g, ' ').trim();
}

// Attribute strings look like: rowspan="2" align="center" data-sort-value="7" data-sort-type=number
// They must not contain template or link markers.
function isAttrString(s: string): boolean {
	return /^([\w-]+(=["']?[^\s"'|{}[\]]*["']?)?\s*)*$/.test(s.trim());
}

// Split a table cell's raw content into optional attrs and value,
// respecting {{ }} and [[ ]] nesting so inner | pipes are not treated as separators.
function parseCell(cellContent: string): CellParseResult {
	let braceDepth = 0;
	let bracketDepth = 0;

	for (let i = 0; i < cellContent.length; i++) {
		const ch = cellContent[i];
		const next = cellContent[i + 1];

		if (ch === '{' && next === '{') {
			braceDepth++;
			i++;
		} else if (ch === '}' && next === '}') {
			if (braceDepth > 0) braceDepth--;
			i++;
		} else if (ch === '[' && next === '[') {
			bracketDepth++;
			i++;
		} else if (ch === ']' && next === ']') {
			if (bracketDepth > 0) bracketDepth--;
			i++;
		} else if (ch === '|' && braceDepth === 0 && bracketDepth === 0) {
			const before = cellContent.slice(0, i).trim();
			if (isAttrString(before)) {
				const value = cellContent.slice(i + 1).trim();
				const rowspanMatch = /rowspan="(\d+)"/.exec(before);
				const rowspan =
					rowspanMatch !== null && rowspanMatch[1] !== undefined ? Number.parseInt(rowspanMatch[1], 10) : 1;
				return { value, rowspan };
			}
			break;
		}
	}

	return { value: cellContent.trim(), rowspan: 1 };
}

function parseCoordinates(cell: string): { x: number; y: number; z: number } | null {
	const trimmed = cell.trim();
	if (!trimmed) return null;
	// Multiple coordinate sets joined by <br> → treat as missing
	if (/<br/i.test(trimmed)) return null;
	// Uncertain coordinates marked with ? → treat as missing
	if (trimmed.includes('?')) return null;

	const s = trimmed.replace(/[()]/g, '').replace(/,/g, ' ');
	const tokens = s.split(/\s+/).filter((t) => t !== '');
	if (tokens.length !== 3) return null;

	const nums = tokens.map(Number);
	if (nums.some((n) => Number.isNaN(n) || !Number.isFinite(n))) return null;

	// Length already verified as 3; indexed access is number (no noUncheckedIndexedAccess)
	return { x: nums[0], y: nums[1], z: nums[2] };
}

function parseItemNumber(cell: string): number | null {
	let s = stripTemplates(cell);
	s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
	s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');

	const m = /(\d+)(\+)?/.exec(s);
	if (m === null) return null;
	// Indeterminate count like "60+" → no number
	if (m[2] === '+') return null;
	const digits = m[1];
	if (digits === undefined) return null;
	return Number.parseInt(digits, 10);
}

function processRow(
	cells: CellParseResult[],
	rowspanState: RowspanSlot[],
	itemName: string,
	icon: WaypointIcon,
	result: ParseResult,
): void {
	// Detect overflow: a row supplies more explicit cells than the available free columns.
	// This happens when wikitext has an incorrect rowspan count and the "spanned" cell
	// appears explicitly in a row that should have been covered. In that case, explicit
	// cells take priority and active rowspans are cleared.
	const activeRowspanCount = rowspanState.filter((s) => s.remaining > 0).length;
	const isOverflowRow = cells.length > 5 - activeRowspanCount;

	const columns: string[] = [];
	let cellIdx = 0;

	for (let col = 0; col < 5; col++) {
		const slot = rowspanState[col];
		const rowspanAvailable = slot !== undefined && slot.remaining > 0;

		if (rowspanAvailable && !isOverflowRow) {
			// Normal rowspan: consume from state
			columns.push(slot.value);
			slot.remaining--;
		} else {
			if (rowspanAvailable && isOverflowRow && slot !== undefined) {
				// Explicit cell overrides the rowspan; clear the stale rowspan state
				slot.remaining = 0;
			}
			const cell = cells[cellIdx];
			if (cell !== undefined) {
				cellIdx++;
				columns.push(cell.value);
				if (cell.rowspan > 1 && slot !== undefined && !isOverflowRow) {
					slot.value = cell.value;
					slot.remaining = cell.rowspan - 1;
				}
			} else {
				columns.push('');
			}
		}
	}

	// Skip artifact rows from double |-
	if (columns.every((c) => !c)) return;

	const territory = columns[0] ?? '';
	const numberCell = columns[1] ?? '';
	const coordsCell = columns[3] ?? '';
	const notesCell = columns[4] ?? '';

	const notesStripped = stripWikitext(notesCell);
	if (/no longer available/i.test(notesStripped)) return;

	const num = parseItemNumber(numberCell);
	const name = num !== null ? `${itemName} ${num}` : itemName;

	const coords = parseCoordinates(coordsCell);
	if (coords !== null) {
		result.complete.push({
			name,
			color: '#ffffffff',
			icon,
			visibility: 'default',
			location: coords,
		});
		return;
	}

	// No valid coordinates → incomplete waypoint
	const territoryStripped = stripWikitext(territory).trim();
	// Skip rows where territory is empty or a bare hyphen (placeholder)
	if (!territoryStripped || territoryStripped === '-') return;

	const entry: WaypointIncomplete = {
		name,
		color: '#ffffffff',
		icon,
		visibility: 'default',
		territory: territoryStripped,
	};
	if (notesStripped) entry.notes = notesStripped;
	result.incomplete.push(entry);
}

function parseTable(tableContent: string, itemName: string, icon: WaypointIcon, result: ParseResult): void {
	const rowspanState: RowspanSlot[] = Array.from({ length: 5 }, () => ({ value: '', remaining: 0 }));
	let pendingCells: CellParseResult[] = [];

	const finalizeRow = (): void => {
		processRow(pendingCells, rowspanState, itemName, icon, result);
		pendingCells = [];
	};

	for (const line of tableContent.split('\n')) {
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
	}
}

export function parseFile(content: string, icon: WaypointIcon): ParseResult {
	const result: ParseResult = { complete: [], incomplete: [] };

	const tabberStart = content.indexOf('<tabber>');
	if (tabberStart === -1) return result;

	const tabberEnd = content.indexOf('</tabber>');
	const rawTabber =
		tabberEnd !== -1
			? content.slice(tabberStart + '<tabber>'.length, tabberEnd)
			: content.slice(tabberStart + '<tabber>'.length);

	// Sections are delimited by |-| (MediaWiki tabber syntax)
	for (const section of rawTabber.split(/^\s*\|-\|\s*$/m)) {
		// Section header: first line matching "ItemName="
		const nameMatch = /^([^=\n]+?)=\s*$/m.exec(section);
		if (nameMatch === null) continue;
		const rawName = nameMatch[1];
		if (rawName === undefined) continue;
		const itemName = rawName.trim().toLowerCase();

		const tableStart = section.indexOf('{|');
		const tableEnd = section.lastIndexOf('|}');
		if (tableStart === -1 || tableEnd === -1) continue;

		parseTable(section.slice(tableStart, tableEnd + 2), itemName, icon, result);
	}

	return result;
}
