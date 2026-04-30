import { describe, expect, it } from 'vitest';
import { parseFile } from '../src/parse.js';

interface TabDefinition {
	label?: string;
	hash?: string;
}

interface CellDefinition {
	text?: string;
	rowspan?: number | string;
}

function createCell({ text = '', rowspan }: CellDefinition = {}): string {
	const rowspanAttr = rowspan === undefined ? '' : ` rowspan="${rowspan}"`;

	return `<td${rowspanAttr}>${text}</td>`;
}

function createRow(cells: CellDefinition[]): string {
	return `<tr>${cells.map((cell) => createCell(cell)).join('')}</tr>`;
}

function createTable(rows: CellDefinition[][]): string {
	return `<table class="wikitable">${rows.map((row) => createRow(row)).join('')}</table>`;
}

function createTab({ label, hash }: TabDefinition = {}): string {
	const hashAttr = hash === undefined ? '' : ` data-hash="${hash}"`;
	const labelHtml = label === undefined ? '' : `<div class="wds-tabs__tab-label"><a href="#">${label}</a></div>`;

	return `<li class="wds-tabs__tab"${hashAttr}>${labelHtml}</li>`;
}

function createTabber(tabs: TabDefinition[], contentBlocks: string[]): string {
	const tabsHtml = tabs.map((tab) => createTab(tab)).join('');
	const contentHtml = contentBlocks.map((content) => `<div class="wds-tab__content">${content}</div>`).join('');

	return `<div class="tabber wds-tabber"><div class="wds-tabs__wrapper"><ul class="wds-tabs">${tabsHtml}</ul></div>${contentHtml}</div>`;
}

describe('parseFile coverage', () => {
	it('returns empty results when no tabbers are present', () => {
		expect(parseFile('<div>plain html</div>', 'farming')).toEqual({ complete: [], incomplete: [] });
	});

	it('parses complete and incomplete rows and skips invalid ones', () => {
		const html = createTabber(
			[{ label: 'Wheat' }],
			[
				createTable([
					[{ text: 'Ragni Plains' }, { text: '4' }, { text: '' }, { text: ' ( 1 , 2 , 3 ) ' }, { text: '' }],
					[{ text: 'Lake Gylia' }, { text: '60+' }, { text: '' }, { text: '(?, 2, 3)' }, { text: '  cluster note  ' }],
					[{ text: 'Cinfras' }, { text: 'not numbered' }, { text: '' }, { text: '(1, 2)' }, { text: '' }],
					[{ text: '-' }, { text: '5' }, { text: '' }, { text: '(1, nope, 3)' }, { text: '' }],
					[
						{ text: 'Detlas' },
						{ text: '6' },
						{ text: '' },
						{ text: '(1, Infinity, 3)' },
						{ text: '  around the gate  ' },
					],
					[{ text: 'Nesaak' }, { text: '7' }, { text: '' }, { text: '' }, { text: 'No longer available' }],
					[{ text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }],
				]),
			],
		);

		expect(parseFile(html, 'farming')).toEqual({
			complete: [
				{
					name: 'wheat 4',
					color: '#ffffffff',
					icon: 'farming',
					visibility: 'default',
					location: { x: 1, y: 2, z: 3 },
				},
			],
			incomplete: [
				{
					name: 'wheat',
					color: '#ffffffff',
					icon: 'farming',
					visibility: 'default',
					territory: 'Lake Gylia',
					notes: 'cluster note',
				},
				{
					name: 'wheat',
					color: '#ffffffff',
					icon: 'farming',
					visibility: 'default',
					territory: 'Cinfras',
				},
				{
					name: 'wheat 6',
					color: '#ffffffff',
					icon: 'farming',
					visibility: 'default',
					territory: 'Detlas',
					notes: 'around the gate',
				},
			],
		});
	});

	it('falls back to data-hash and skips tabs without names, content blocks, or tables', () => {
		const html = createTabber(
			[{ hash: 'Sky_Island' }, {}, { label: 'No Table' }, { label: 'Missing Content' }],
			[
				createTable([[{ text: 'Aldorei Valley' }, { text: '' }, { text: '' }, { text: '(10, 20, 30)' }, { text: '' }]]),
				createTable([
					[{ text: 'Should Be Ignored' }, { text: '1' }, { text: '' }, { text: '(1, 1, 1)' }, { text: '' }],
				]),
				'<div>not a table</div>',
			],
		);

		expect(parseFile(html, 'woodcutting')).toEqual({
			complete: [
				{
					name: 'sky island',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					location: { x: 10, y: 20, z: 30 },
				},
			],
			incomplete: [],
		});
	});

	it('ignores table rows without td cells', () => {
		const html = createTabber(
			[{ label: 'Header Only' }],
			['<table class="wikitable"><tr><th>Territory</th></tr></table>'],
		);

		expect(parseFile(html, 'mining')).toEqual({ complete: [], incomplete: [] });
	});

	it('reuses rowspans across rows when no conflict exists', () => {
		const html = createTabber(
			[{ label: 'Birch' }],
			[
				createTable([
					[{ text: 'Nivla Woods', rowspan: 2 }, { text: '1' }, { text: '' }, { text: '(10, 20, 30)' }, { text: '' }],
					[{ text: '2' }, { text: '' }, { text: '(11, 21, 31)' }, { text: '' }],
				]),
			],
		);

		expect(parseFile(html, 'woodcutting')).toEqual({
			complete: [
				{
					name: 'birch 1',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					location: { x: 10, y: 20, z: 30 },
				},
				{
					name: 'birch 2',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					location: { x: 11, y: 21, z: 31 },
				},
			],
			incomplete: [],
		});
	});

	it('prefers explicit cells over stale rowspans and treats invalid rowspans as 1', () => {
		const html = createTabber(
			[{ label: 'Spruce' }],
			[
				createTable([
					[{ text: 'Old Territory', rowspan: 2 }, { text: '1' }, { text: '' }, { text: '(1, 1, 1)' }, { text: '' }],
					[{ text: 'New Territory' }, { text: '2' }, { text: '' }, { text: '' }, { text: 'fresh cluster' }],
					[{ text: 'Single Use', rowspan: 'oops' }, { text: '9' }, { text: '' }, { text: '(9, 9, 9)' }, { text: '' }],
					[{ text: '10' }, { text: '' }, { text: '(10, 10, 10)' }, { text: '' }],
				]),
			],
		);

		expect(parseFile(html, 'woodcutting')).toEqual({
			complete: [
				{
					name: 'spruce 1',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					location: { x: 1, y: 1, z: 1 },
				},
				{
					name: 'spruce 9',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					location: { x: 9, y: 9, z: 9 },
				},
			],
			incomplete: [
				{
					name: 'spruce 2',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					territory: 'New Territory',
					notes: 'fresh cluster',
				},
				{
					name: 'spruce',
					color: '#ffffffff',
					icon: 'woodcutting',
					visibility: 'default',
					territory: '10',
				},
			],
		});
	});
});
