import { promises as fs } from 'fs';
import path from 'path';
import { parseChordPro } from '../src/lib/parseChordPro';
import { SongData, SongIndexEntry } from '../src/types';

const OUTPUT_BASE = process.env.SONGS_OUTPUT_DIR || 'public/data';
const OUTPUT_DIR = path.resolve(OUTPUT_BASE, 'songs');
const INDEX_PATH = path.resolve(OUTPUT_BASE, 'songs.index.json');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function hasChordProFiles(dir: string) {
  try {
    const entries = await fs.readdir(dir);
    return entries.some((entry) => entry.endsWith('.pro'));
  } catch {
    return false;
  }
}

function assertUniqueSongIds(songs: SongData[]) {
  const songsById = new Map<string, SongData[]>();

  for (const song of songs) {
    const existing = songsById.get(song.id) || [];
    existing.push(song);
    songsById.set(song.id, existing);
  }

  const duplicates = [...songsById.entries()].filter(([, songsForId]) => songsForId.length > 1);
  if (duplicates.length === 0) return;

  const details = duplicates
    .map(([id, songsForId]) => {
      const sources = songsForId
        .map((song) => `${song.title} (${song.sourcePath || 'unknown source'})`)
        .join(', ');
      return `- ${id}: ${sources}`;
    })
    .join('\n');

  throw new Error(`Duplicate song id(s) detected. Rename the title or source before building:\n${details}`);
}

async function build() {
  const localDir = path.resolve('songs');
  const siblingDir = path.resolve('..', 'holy-songs-content', 'songs');
  const songsDir =
    process.env.SONGS_DIR ||
    ((await hasChordProFiles(localDir)) ? localDir : siblingDir);
  try {
    await fs.access(songsDir);
  } catch {
    throw new Error(
      `Songs directory not found: ${songsDir}. Set SONGS_DIR or clone holy-songs-content beside this repo.`
    );
  }

  const entries = await fs.readdir(songsDir);
  const songs: SongData[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.pro')) continue;
    const fullPath = path.join(songsDir, entry);
    const raw = await fs.readFile(fullPath, 'utf8');
    const song = parseChordPro(raw, path.relative(process.cwd(), fullPath));
    songs.push(song);
  }

  assertUniqueSongIds(songs);

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await ensureDir(OUTPUT_DIR);

  const index: SongIndexEntry[] = [];

  for (const song of songs) {
    const outPath = path.join(OUTPUT_DIR, `${song.id}.json`);
    await fs.writeFile(outPath, JSON.stringify(song, null, 2), 'utf8');

    index.push({
      id: song.id,
      title: song.title,
      key: song.key,
      interpret: song.interpret,
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
