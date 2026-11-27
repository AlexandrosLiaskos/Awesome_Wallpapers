// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { layoutTags } from '../../src/scripts/filter-bar.ts';

// happy-dom does no layout, so each element says which row it would sit on (rows 38 px apart).
function rowOf(element: HTMLElement, top: () => number): void {
  Object.defineProperty(element, 'offsetTop', { configurable: true, get: top });
}

function tagRow(rows: number[], toggleTop: (hidden: number) => number) {
  const row = document.createElement('nav');
  const items = rows.map((top, i) => {
    const chip = document.createElement('a');
    chip.className = 'chip';
    if (i < rows.length - 1) chip.dataset.tag = `t${i}`;
    rowOf(chip, () => top);
    row.append(chip);
    return chip;
  });
  const toggle = document.createElement('button');
  row.append(toggle);
  rowOf(toggle, () => toggleTop(items.filter((item) => item.hidden).length));
  document.body.replaceChildren(row);
  return { row, items, toggle };
}

describe('layoutTags', () => {
  it('needs no toggle when every chip fits', () => {
    const { items, toggle } = tagRow([0, 0, 0, 38], () => 38);
    layoutTags(items[0].parentElement!, toggle, false, false);
    expect(items.every((item) => !item.hidden)).toBe(true);
    expect(toggle.hidden).toBe(true);
  });

  it('keeps two rows on small screens and says how many tags are left', () => {
    // Nine chips over three rows; the toggle fits on row two once one more chip makes room.
    const { row, items, toggle } = tagRow([0, 0, 0, 38, 38, 38, 76, 76, 76], (hidden) => (hidden >= 4 ? 38 : 76));
    layoutTags(row, toggle, false, false);
    expect(items.map((item) => item.hidden)).toEqual([false, false, false, false, false, true, true, true, true]);
    expect(toggle.hidden).toBe(false);
    expect(toggle.textContent).toBe('+3 more');
    expect(toggle.getAttribute('aria-label')).toBe('Show 3 more tags');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(row.dataset.state).toBe('closed');
  });

  it('keeps one row on wide screens', () => {
    const { row, items, toggle } = tagRow([0, 0, 0, 38, 38], () => 0);
    layoutTags(row, toggle, false, true);
    expect(items.filter((item) => !item.hidden)).toHaveLength(3);
    expect(toggle.textContent).toBe('+1 more');
  });

  it('shows everything and offers fewer when open', () => {
    const { row, items, toggle } = tagRow([0, 38, 76], () => 76);
    layoutTags(row, toggle, true, false);
    expect(items.every((item) => !item.hidden)).toBe(true);
    expect(toggle.textContent).toBe('Show fewer');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(row.dataset.state).toBe('open');
  });

  it('does not end a row on the divider', () => {
    const { row, items, toggle } = tagRow([0, 0, 38, 38, 76, 76], () => 38);
    items[3].className = 'filters__divider';
    delete items[3].dataset.tag;
    layoutTags(row, toggle, false, false);
    expect(items[3].hidden).toBe(true);
    expect(toggle.textContent).toBe('+1 more');
  });
});
