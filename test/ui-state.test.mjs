import test from 'node:test';
import assert from 'node:assert/strict';

import { DETAIL_SECTIONS, clampPage, normalizeDetailSection, paginateItems } from '../ui/view-state.mjs';

test('paginateItems clamps page values and returns the correct window', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const page = paginateItems(items, 3, 3);

  assert.equal(page.page, 3);
  assert.equal(page.totalPages, 3);
  assert.deepEqual(page.items, ['g']);
  assert.equal(page.startIndex, 6);
  assert.equal(page.endIndex, 7);
});

test('paginateItems normalizes invalid page sizes and page numbers', () => {
  const items = ['a', 'b'];
  const page = paginateItems(items, 99, 0);

  assert.equal(page.page, 1);
  assert.equal(page.pageSize, 6);
  assert.deepEqual(page.items, ['a', 'b']);
});

test('detail section helpers only allow known sections', () => {
  assert.equal(normalizeDetailSection('merge'), 'merge');
  assert.equal(normalizeDetailSection('not-real'), DETAIL_SECTIONS[0].id);
  assert.equal(clampPage(-10, 4), 1);
  assert.equal(clampPage(10, 4), 4);
});
