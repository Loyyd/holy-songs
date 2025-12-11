import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { SongData, SongIndexEntry, SongLineToken } from './types';
import { transposeTokens } from './lib/chords';
import { parseChordPro } from './lib/parseChordPro';

function SongView({ song, transpose }: { song: SongData; transpose: number }) {
  return (
    <div className="song">
      {song.sections.map((section) => (
        <div key={section.name}>
          <div className="section-title">{section.name}</div>
          {section.lines.map((line, idx) => {
            const transposedTokens = transposeTokens(line.tokens, transpose);
            
            return (
              <div className="line" key={`${section.name}-${idx}`}>
                {transposedTokens.map((token, i) => (
                  <span key={i} className="token">
                    {token.chord && <span className="chord">{token.chord}</span>}
                    <span className="lyric">{token.lyric || '\u00A0'}</span>
                  </span>
                ))}
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
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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
      .then((data: SongData) => {
        setSong(data);
        setEditText(data.source ?? '');
        setIsEditing(false);
        setEditError(null);
      })
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

  const applyEdit = () => {
    if (!song) return;
    try {
      const parsed = parseChordPro(editText, song.sourcePath ?? 'inline');
      setSong({ ...parsed, id: song.id });
      setEditError(null);
      setIsEditing(false);
    } catch (err) {
      setEditError((err as Error).message ?? 'Failed to parse song');
    }
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
              <button onClick={() => setIsEditing((open) => !open)}>
                {isEditing ? 'Close editor' : 'Edit chords/lyrics'}
              </button>
            </div>
            {isEditing && (
              <div className="editor">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={12}
                  spellCheck={false}
                />
                {editError && <div className="error">{editError}</div>}
                <div className="controls" style={{ marginTop: 8 }}>
                  <button onClick={applyEdit}>Apply to preview</button>
                  <button onClick={() => setIsEditing(false)}>Close</button>
                </div>
                <div className="note">Edits stay local; rerun build to persist to disk.</div>
              </div>
            )}
            <div className="song-container">
              <SongView song={song} transpose={transpose} />
            </div>
          </>
        ) : (
          <p>Loading song...</p>
        )}
      </div>
    </div>
  );
}
