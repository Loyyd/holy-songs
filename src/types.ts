export interface SongLineToken {
  chord: string | null;
  lyric: string;
}

export interface SongLine {
  tokens: SongLineToken[];
  raw: string;
}

export interface SongSection {
  name: string;
  lines: SongLine[];
}

export interface SongData {
  id: string;
  title: string;
  key?: string;
  sections: SongSection[];
  sourcePath: string;
}

export interface SongIndexEntry {
  id: string;
  title: string;
  key?: string;
  sections: string[];
}
