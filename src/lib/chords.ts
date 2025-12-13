const NOTE_SEQUENCE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_MAP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#'
};

function normalizeRoot(root: string): string {
  return FLAT_MAP[root] ?? root;
}

function transposeRoot(root: string, steps: number): string {
  const normalized = normalizeRoot(root);
  const index = NOTE_SEQUENCE.indexOf(normalized);
  if (index === -1) return root;
  const shifted = (index + steps + NOTE_SEQUENCE.length) % NOTE_SEQUENCE.length;
  return NOTE_SEQUENCE[shifted];
}

export function transposeChord(chord: string, steps: number): string {
  if (steps === 0) return chord;
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;
  const [, root, suffix] = match;
  const transposedRoot = transposeRoot(root, steps);
  return `${transposedRoot}${suffix}`;
}

export function transposeTokens(tokens: { chord: string | null; lyric: string }[], steps: number) {
  return tokens.map((token) =>
    token.chord ? { ...token, chord: transposeChord(token.chord, steps) } : token
  );
}

export function transposeDelta(fromKey: string | undefined, toKey: string | undefined): number {
  if (!fromKey || !toKey) return 0;
  const from = NOTE_SEQUENCE.indexOf(normalizeRoot(fromKey));
  const to = NOTE_SEQUENCE.indexOf(normalizeRoot(toKey));
  if (from === -1 || to === -1) return 0;
  return to - from;
}

export function transposeChordProSource(source: string, steps: number): string {
  if (steps === 0) return source;
  
  const lines = source.split(/\r?\n/);
  const transposedLines = lines.map(line => {
    // Handle {key: X} directive
    const keyMatch = line.match(/^(\{\s*key:\s*)([A-G](?:#|b)?)(\s*\})$/i);
    if (keyMatch) {
      const [, prefix, key, suffix] = keyMatch;
      const transposedKey = transposeRoot(key, steps);
      return `${prefix}${transposedKey}${suffix}`;
    }
    
    // Transpose chords in [brackets]
    return line.replace(/\[([A-G](?:#|b)?[^\]]*)\]/g, (match, chord) => {
      return `[${transposeChord(chord, steps)}]`;
    });
  });
  
  return transposedLines.join('\n');
}
