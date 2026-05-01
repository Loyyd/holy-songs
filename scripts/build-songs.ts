import { promises as fs } from 'fs';
import path from 'path';
import { parseChordPro } from '../src/lib/parseChordPro';
import { SongData, SongIndexEntry } from '../src/types';

function resolveSongsDir() {
  const configuredDir = process.env.SONGS_DIR;
  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  const localDir = path.resolve('songs');
  const siblingDir = path.resolve('..', 'holy-songs-content', 'songs');
  return siblingDir;
}

const OUTPUT_BASE = process.env.SONGS_OUTPUT_DIR || 'public/data';
const OUTPUT_DIR = path.resolve(OUTPUT_BASE, 'songs');
const INDEX_PATH = path.resolve(OUTPUT_BASE, 'songs.index.json');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function build() {
  const songsDir = resolveSongsDir();
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

  await ensureDir(OUTPUT_DIR);

  const index: SongIndexEntry[] = [];

  for (const song of songs) {
    const outPath = path.join(OUTPUT_DIR, `${song.id}.json`);
    await fs.writeFile(outPath, JSON.stringify(song, null, 2), 'utf8');

    index.push({
      id: song.id,
      title: song.title,
      key: song.key,
      reviewed: song.reviewed,
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
