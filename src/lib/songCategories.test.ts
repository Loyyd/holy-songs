/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addSongCategoryToSource,
  getSongCategoriesFromSource,
  removeSongCategoryFromSource,
} from './songCategories';

describe('songCategories', () => {
  it('reads repeated and comma-separated category directives', () => {
    const source = [
      '{title: Categories}',
      '{category: Holy Songs}',
      '{categories: Worship, BC Originals, worship}',
      '[C]Sing',
    ].join('\n');

    assert.deepEqual(getSongCategoriesFromSource(source), [
      'Holy Songs',
      'Worship',
      'BC Originals',
    ]);
  });

  it('adds new categories near other leading metadata', () => {
    const source = ['{title: Add Category}', '{key: C}', '', '{section: Verse}', '[C]Sing'].join('\n');

    assert.equal(
      addSongCategoryToSource(source, 'Worship'),
      ['{title: Add Category}', '{key: C}', '{category: Worship}', '', '{section: Verse}', '[C]Sing'].join('\n')
    );
  });

  it('does not add duplicate categories case-insensitively', () => {
    const source = ['{title: Add Category}', '{category: Worship}', '[C]Sing'].join('\n');

    assert.equal(addSongCategoryToSource(source, 'worship'), source);
  });

  it('removes categories while preserving remaining categories', () => {
    const source = ['{title: Remove Category}', '{categories: Worship, BC Originals}', '[C]Sing'].join('\n');

    assert.equal(
      removeSongCategoryFromSource(source, 'worship'),
      ['{title: Remove Category}', '{category: BC Originals}', '[C]Sing'].join('\n')
    );
  });
});
