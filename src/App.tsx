import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { SongData, SongIndexEntry, SongLineToken } from './types';
import { transposeTokens } from './lib/chords';

function padChordLine(tokens: SongLineToken[]) {
  let chords = '';
  let lyrics = '';
  for (const token of tokens) {
    if (token.chord) {
      chords += token.chord;
      const lyricLength = token.lyric.length;
      const padding = Math.max(lyricLength - token.chord.length + 1, 1);
      chords += ' '.repeat(padding);
    } else {
      chords += ' '.repeat(token.lyric.length);
    }
    lyrics += token.lyric;
  }
  return { chords, lyrics };
}

function SongView({ song, transpose }: { song: SongData; transpose: number }) {
  return (
    <div className="song">
      {song.sections.map((section) => (
        <div key={section.name}>
          <div className="section-title">{section.name}</div>
          {section.lines.map((line, idx) => {
            const transposedTokens = transposeTokens(line.tokens, transpose);
            const { chords, lyrics } = padChordLine(transposedTokens);
            return (
              <div className="line" key={`${section.name}-${idx}`}>
                <div className="chords">{chords}</div>
                <div className="lyrics">{lyrics}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SongIndexEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [song, setSong] = useState<SongData | null>(null);
  const [transpose, setTranspose] = useState(0);

  useEffect(() => {
    fetch('/data/songs.index.json')
      .then((res) => res.json())
      .then((data: SongIndexEntry[]) => {
        setIndex(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/data/songs/${selectedId}.json`)
      .then((res) => res.json())
      .then((data: SongData) => setSong(data))
      .catch((err) => console.error(err));
  }, [selectedId]);

  const fuse = useMemo(() => {
    if (index.length === 0) return null;
    return new Fuse(index, {
      keys: ['title', 'sections'],
      threshold: 0.35,
      includeScore: true
    });
  }, [index]);

  const results = useMemo(() => {
    if (!fuse || query.trim() === '') return index;
    return fuse.search(query).map((hit) => hit.item);
  }, [fuse, index, query]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTranspose(0);
  };

  return (
    <div className="app-shell">
      <div className="card">
        <h1>Holy Songs</h1>
        <p style={{ margin: '0 0 12px' }}>Search, view, and transpose songs.</p>
        <input
          placeholder="Search title or lyrics..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="song-list">
          {results.map((entry) => (
            <li key={entry.id}>
              <button
                className={entry.id === selectedId ? 'active' : ''}
                onClick={() => handleSelect(entry.id)}
              >
                <div style={{ fontWeight: 700 }}>{entry.title}</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Key: {entry.key ?? '—'}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        {song ? (
          <>
            <div className="controls" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{song.title}</h2>
              <span className="chip">Key: {song.key ?? '—'}</span>
              <span className="chip">Transpose: {transpose >= 0 ? `+${transpose}` : transpose}</span>
              <div className="controls">
                <button onClick={() => setTranspose((n) => n - 1)}>-</button>
                <button onClick={() => setTranspose(0)}>Reset</button>
                <button onClick={() => setTranspose((n) => n + 1)}>+</button>
              </div>
            </div>
            <SongView song={song} transpose={transpose} />
          </>
        ) : (
          <p>Loading song...</p>
        )}
      </div>
    </div>
  );
}
