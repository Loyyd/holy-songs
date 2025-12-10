import { promises as fs } from 'fs';
import path from 'path';

interface SongLineToken {
  chord: string | null;
  lyric: string;
}

interface SongLine {
  tokens: SongLineToken[];
  raw: string;
}

interface SongSection {
  name: string;
  lines: SongLine[];
}

interface SongData {
  id: string;
  title: string;
  key?: string;
  sections: SongSection[];
  sourcePath: string;
}

interface SongIndexEntry {
  id: string;
  title: string;
  key?: string;
  sections: string[];
}

const SONGS_DIR = path.resolve('songs');
const OUTPUT_DIR = path.resolve('public/data/songs');
const INDEX_PATH = path.resolve('public/data/songs.index.json');

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTokens(line: string): SongLineToken[] {
  const tokens: SongLineToken[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line))) {
    const chord = match[1].trim();
    const lyricBefore = line.slice(lastIndex, match.index);
    if (lyricBefore) {
      tokens.push({ chord: null, lyric: lyricBefore });
    }
    tokens.push({ chord, lyric: '' });
    lastIndex = regex.lastIndex;
  }

  const trailing = line.slice(lastIndex);
  if (trailing) {
    tokens.push({ chord: null, lyric: trailing });
  }

  if (tokens.length === 0) {
    tokens.push({ chord: null, lyric: '' });
  }

  return tokens;
}

function parseSong(raw: string, sourcePath: string): SongData {
  const lines = raw.split(/\r?\n/);
  let title = 'Untitled';
  let key: string | undefined;
  const sections: SongSection[] = [];
  let currentSection: SongSection = { name: 'Verse', lines: [] };

  const commitSection = () => {
    if (currentSection.lines.length > 0) {
      sections.push(currentSection);
    }
  };

  for (const line of lines) {
    const metaMatch = line.match(/^\{\s*([^:]+):\s*(.+)\s*\}$/);
    if (metaMatch) {
      const [, tag, value] = metaMatch;
      const tagLower = tag.trim().toLowerCase();
      const val = value.trim();
      if (tagLower === 'title') {
        title = val;
      } else if (tagLower === 'key') {
        key = val;
      } else if (tagLower === 'section') {
        commitSection();
        currentSection = { name: val, lines: [] };
      }
      continue;
    }

    if (line.trim() === '') {
      currentSection.lines.push({ tokens: [{ chord: null, lyric: '' }], raw: '' });
      continue;
    }

    currentSection.lines.push({ tokens: parseTokens(line), raw: line });
  }

  commitSection();

  const id = slugify(title);

  return {
    id,
    title,
    key,
    sections,
    sourcePath
  };
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function build() {
  const entries = await fs.readdir(SONGS_DIR);
  const songs: SongData[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.pro')) continue;
    const fullPath = path.join(SONGS_DIR, entry);
    const raw = await fs.readFile(fullPath, 'utf8');
    const song = parseSong(raw, path.relative(process.cwd(), fullPath));
    songs.push(song);
  }

  await ensureDir(OUTPUT_DIR);

  const index: SongIndexEntry[] = [];

  for (const song of songs) {
    const outPath = path.join(OUTPUT_DIR, `${song.id}.json`);
    await fs.writeFile(outPath, JSON.stringify(song, null, 2), 'utf8');

    index.push({
      id: song.id,
      title: song.title,
      key: song.key,
      sections: song.sections.flatMap((section) =>
        section.lines.map((line) => line.raw).filter((line) => line.trim() !== '')
      )
    });
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
  console.log(`Built ${songs.length} song(s).`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
