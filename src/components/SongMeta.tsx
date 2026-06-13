import { songSubtitle } from '../appUtils';
import type { SongData, SongIndexEntry } from '../types';
import { CategoryChips } from './CategoryChips';

interface SongMetaProps {
  song: Pick<SongData | SongIndexEntry, 'key' | 'interpret' | 'categories'>;
}

export function SongMeta({ song }: SongMetaProps) {
  const subtitle = songSubtitle(song);

  return (
    <div className="song-meta">
      <span className="song-subtitle">{subtitle || 'Key: —'}</span>
      <CategoryChips categories={song.categories} />
    </div>
  );
}
