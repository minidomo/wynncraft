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

function parseCoordinates(cell: string): { x: number; y: number; z: number } | null {
	const trimmed = cell.trim();

	if (!trimmed) return null;

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
	const m = /(\d+)(\+)?/.exec(cell);

	if (m === null) return null;

	// Indeterminate count like "60+" → no number
	if (m[2] === '+') return null;

	return Number.parseInt(m[1], 10);
}

function processRow(
	cells: CellParseResult[],
	rowspanState: RowspanSlot[],
	itemName: string,
	icon: WaypointIcon,
	result: ParseResult,
): void {
	// Some checked-in HTML rows keep a rowspan active one row too long and then emit
	// a new explicit cell in the same column. When that happens, prefer the explicit
	// cells and clear the stale rowspan state for the conflicting row.
	const freeColumnCount = 5 - rowspanState.filter((slot) => slot.remaining > 0).length;
	const hasRowspanConflict = cells.length > freeColumnCount;

	const columns: [string, string, string, string, string] = ['', '', '', '', ''];
	let cellIdx = 0;

	for (let col = 0; col < 5; col++) {
		const slot = rowspanState[col];

		if (slot !== undefined && slot.remaining > 0 && !hasRowspanConflict) {
			columns[col] = slot.value;
			slot.remaining--;
			continue;
		}

		if (slot !== undefined && slot.remaining > 0 && hasRowspanConflict) {
			slot.remaining = 0;
		}

		const cell = cells[cellIdx];

		if (cell !== undefined) {
			cellIdx++;
			columns[col] = cell.value;

			if (cell.rowspan > 1 && slot !== undefined && !hasRowspanConflict) {
				slot.value = cell.value;
				slot.remaining = cell.rowspan - 1;
			}
		} else {
			columns[col] = '';
		}
	}

	// Skip empty rows.
	if (columns.every((c) => !c)) return;

	const [territory, numberCell, , coordsCell, notesCell] = columns;

	const notes = notesCell.trim();

	if (/no longer available/i.test(notes)) return;

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
	const territoryText = territory.trim();

	// Skip rows where territory is empty or a bare hyphen (placeholder)
	if (!territoryText || territoryText === '-') return;

	const entry: WaypointIncomplete = {
		name,
		color: '#ffffffff',
		icon,
		visibility: 'default',
		territory: territoryText,
	};

	if (notes) entry.notes = notes;

	result.incomplete.push(entry);
}

function extractCellText($: CheerioAPI, cell: NodeLike): string {
	return $(cell).text().replace(/\s+/g, ' ').trim();
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
