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
