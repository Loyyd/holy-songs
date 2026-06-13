export type AppRoute =
  | { mode: 'browse' }
  | { mode: 'edit'; id: string };

export function parseAppRoute(): AppRoute {
  const editPathMatch = window.location.pathname.match(/^\/edit\/([^/]+)\/?$/);
  if (editPathMatch) {
    return { mode: 'edit', id: decodeURIComponent(editPathMatch[1]) };
  }

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  return editId ? { mode: 'edit', id: editId } : { mode: 'browse' };
}

export function isTemporaryNewSongId(id: string | null | undefined) {
  return id === 'new' || (typeof id === 'string' && /^new-song-\d+$/.test(id));
}

export function songSubtitle(song: { key?: string; interpret?: string }) {
  const pieces = [];
  if (song.interpret) pieces.push(`by ${song.interpret}`);
  if (song.key) pieces.push(`Key: ${song.key}`);
  return pieces.join(' • ');
}

export const CATEGORY_SUGGESTIONS = ['Holy Songs', 'Worship', 'BC Originals'];

export type CategoryColors = {
  background: string;
  border: string;
  color: string;
};

const CATEGORY_COLOR_PRESETS: Record<string, CategoryColors> = {
  'holy songs': {
    background: '#e0f2fe',
    border: '#7dd3fc',
    color: '#075985',
  },
  worship: {
    background: '#fef3c7',
    border: '#fbbf24',
    color: '#92400e',
  },
  'bc originals': {
    background: '#dcfce7',
    border: '#86efac',
    color: '#166534',
  },
};

const CATEGORY_PALETTE: CategoryColors[] = [
  { background: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
  { background: '#ede9fe', border: '#c4b5fd', color: '#5b21b6' },
  { background: '#ccfbf1', border: '#5eead4', color: '#115e59' },
  { background: '#ffedd5', border: '#fdba74', color: '#9a3412' },
  { background: '#fce7f3', border: '#f9a8d4', color: '#9d174d' },
  { background: '#e0e7ff', border: '#a5b4fc', color: '#3730a3' },
];

export function categoryColors(category: string): CategoryColors {
  const normalized = category.trim().toLowerCase();
  const preset = CATEGORY_COLOR_PRESETS[normalized];
  if (preset) return preset;

  const hash = [...normalized].reduce((value, char) => value + char.charCodeAt(0), 0);
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

export const NEW_SONG_TEMPLATE = `{title: Example Song Title}
{key: C}

{section: Verse 1}
[C]Write the first line of your verse
[G]Add another lyric line here
[Am]Let the melody keep moving
[F]And shape the words with care

{section: Chorus}
[F]This is the chorus line
[C]Lift it up and sing
[G]Repeat the words that matter
[C]Then bring the song back home
`;

export const LAST_SELECTED_ID_KEY = 'holy-songs:last-selected-id';
export const LAST_QUERY_KEY = 'holy-songs:last-query';
export const ADMIN_TOKEN_KEY = 'holy-songs:admin-token';
export const STARRED_SONGS_KEY = 'starred-songs';
