import type { Cheerio, CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { Waypoint, WaypointIcon, WaypointIncomplete } from './types.js';

type NodeLike = Parameters<CheerioAPI>[0];

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

function extractCellText($: CheerioAPI, cell: NodeLike): string {
	const clone = $(cell).clone();

	clone.find('br').replaceWith('<br>');

	return clone.text().replace(/\s+/g, ' ').trim();
}

function parseTableRow($: CheerioAPI, row: NodeLike): CellParseResult[] {
	const cells: CellParseResult[] = [];

	$(row)
		.children('td')
		.each((_, cell) => {
			const rawRowspan = $(cell).attr('rowspan');
			const parsedRowspan = rawRowspan === undefined ? Number.NaN : Number.parseInt(rawRowspan, 10);

			cells.push({
				value: extractCellText($, cell),
				rowspan: Number.isNaN(parsedRowspan) || parsedRowspan < 1 ? 1 : parsedRowspan,
			});
		});

	return cells;
}

function parseTable<T extends AnyNode>(
	$: CheerioAPI,
	table: Cheerio<T>,
	itemName: string,
	icon: WaypointIcon,
	result: ParseResult,
): void {
	const rowspanState: RowspanSlot[] = Array.from({ length: 5 }, () => ({ value: '', remaining: 0 }));

	table.find('tr').each((_, row) => {
		const cells = parseTableRow($, row);

		if (cells.length === 0) return;

		processRow(cells, rowspanState, itemName, icon, result);
	});
}

function parseItemName($: CheerioAPI, tab: NodeLike): string {
	const label = $(tab).find('.wds-tabs__tab-label').first().text().replace(/\s+/g, ' ').trim();

	if (label) return label.toLowerCase();

	const hash = $(tab).attr('data-hash') ?? '';

	return hash.replaceAll('_', ' ').trim().toLowerCase();
}

export function parseFile(content: string, icon: WaypointIcon): ParseResult {
	const result: ParseResult = { complete: [], incomplete: [] };
	const $ = load(content);

	$('.tabber.wds-tabber').each((_, tabber) => {
		const tabs = $(tabber).children('.wds-tabs__wrapper').find('.wds-tabs__tab');
		const contentBlocks = $(tabber).children('.wds-tab__content');

		tabs.each((index, tab) => {
			const itemName = parseItemName($, tab);

			if (!itemName) return;

			const contentBlock = contentBlocks.eq(index);

			if (contentBlock.length === 0) return;

			const table = contentBlock.find('table.wikitable').first();

			if (table.length === 0) return;

			parseTable($, table, itemName, icon, result);
		});
	});

	return result;
}
