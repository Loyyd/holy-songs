/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseChordPro, parseTokens } from './parseChordPro';

describe('parseTokens', () => {
  it('splits lyrics and chords in order', () => {
    assert.deepEqual(parseTokens('Amazing [G]grace how [D/F#]sweet'), [
      { chord: null, lyric: 'Amazing ' },
      { chord: 'G', lyric: 'grace how ' },
      { chord: 'D/F#', lyric: 'sweet' }
    ]);
  });

  it('keeps adjacent chords at the same lyric position', () => {
    assert.deepEqual(parseTokens('[G][D]Hello'), [
      { chord: 'G', lyric: '' },
      { chord: 'D', lyric: 'Hello' }
    ]);
  });

  it('returns an empty lyric token for an empty line', () => {
    assert.deepEqual(parseTokens(''), [{ chord: null, lyric: '' }]);
  });
});

describe('parseChordPro', () => {
  it('parses metadata, sections, and chorded lines', () => {
    const song = parseChordPro(
      [
        '{title: Amazing Grace}',
        '{key: Bb}',
        '{artist: John Newton}',
        '{section: Verse}',
        '[Bb]Amazing [Eb]grace',
        '{section: Chorus}',
        '[F]Praise'
      ].join('\n'),
      'songs/amazing-grace.pro'
    );

    assert.equal(song.id, 'amazing-grace');
    assert.equal(song.title, 'Amazing Grace');
    assert.equal(song.key, 'Bb');
    assert.equal(song.interpret, 'John Newton');
    assert.equal(song.sourcePath, 'songs/amazing-grace.pro');
    assert.equal(song.sections.length, 2);
    assert.equal(song.sections[0].name, 'Verse');
    assert.deepEqual(song.sections[0].lines[0].tokens, [
      { chord: 'Bb', lyric: 'Amazing ' },
      { chord: 'Eb', lyric: 'grace' }
    ]);
  });

  it('uses the last duplicate title directive', () => {
    const song = parseChordPro(['{title: First Title}', '{title: Second Title}', '[C]Line'].join('\n'));

    assert.equal(song.title, 'Second Title');
    assert.equal(song.id, 'second-title');
  });

  it('skips unusual directives and omits immediately empty sections', () => {
    const song = parseChordPro(
      [
        '{title: Directive Test}',
        '{comment: not rendered}',
        '{section: Empty}',
        '{section: Verse}',
        '[C]Sing',
        '{time: 3/4}',
        '{section: Chorus}',
        '[G]Amen'
      ].join('\n')
    );

    assert.deepEqual(
      song.sections.map((section) => section.name),
      ['Verse', 'Chorus']
    );
    assert.deepEqual(
      song.sections.flatMap((section) => section.lines.map((line) => line.raw)),
      ['[C]Sing', '[G]Amen']
    );
  });

  it('preserves explicit blank lines inside a section', () => {
    const song = parseChordPro(['{title: Blank Lines}', '{section: Verse}', '', '[C]After blank'].join('\n'));

    assert.equal(song.sections.length, 1);
    assert.deepEqual(song.sections[0].lines.map((line) => line.raw), ['', '[C]After blank']);
  });
});
