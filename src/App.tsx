import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { SongData, SongIndexEntry, SongLineToken } from './types';
import { transposeTokens } from './lib/chords';
import { parseChordPro } from './lib/parseChordPro';
import { SongEditor } from './components/SongEditor';

function SongView({ song, transpose, highlightQuery, isContextSensitive }: { song: SongData; transpose: number; highlightQuery?: string; isContextSensitive?: boolean }) {
  const highlightLyric = (lyric: string) => {
    if (!highlightQuery || !isContextSensitive || lyric.trim() === '') {
      return lyric;
    }

    const regex = new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = lyric.split(regex);

    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} style={{ backgroundColor: '#fbbf24', padding: '2px 0' }}>{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="song">
      {song.sections.map((section, sectionIdx) => (
        <div key={`${song.id}-section-${sectionIdx}`}>
          <div className="section-title">{section.name}</div>
          {section.lines.map((line, idx) => {
            const transposedTokens = transposeTokens(line.tokens, transpose);
            const hasAnyChord = transposedTokens.some(t => t.chord);
            
            // Merge chord tokens with following lyric tokens
            // e.g., [{chord: "E", lyric: ""}, {chord: null, lyric: "Grace"}] 
            //    -> [{chord: "E", lyric: "Grace"}]
            const mergedTokens: { chord: string | null; lyric: string }[] = [];
            let pendingChord: string | null = null;
            
            for (const token of transposedTokens) {
              if (token.chord && !token.lyric) {
                // Chord with no lyric - save it for the next token
                pendingChord = token.chord;
              } else if (pendingChord) {
                // Apply pending chord to this token
                mergedTokens.push({ chord: pendingChord, lyric: token.lyric || '' });
                pendingChord = null;
              } else {
                mergedTokens.push({ chord: token.chord, lyric: token.lyric || '' });
              }
            }
            // Handle trailing chord with no lyric
            if (pendingChord) {
              mergedTokens.push({ chord: pendingChord, lyric: '' });
            }
            
            return (
              <div className={`line ${hasAnyChord ? 'has-chords' : ''}`} key={`${song.id}-${sectionIdx}-line-${idx}`}>
                {mergedTokens.map((token, i) => (
                  <span key={i} className="token">
                    {token.chord && <span className="chord">{token.chord}</span>}
                    <span className="lyric">{highlightLyric(token.lyric)}</span>
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
  const [contextSensitive, setContextSensitive] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('starred-songs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/songs.index.json`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: SongIndexEntry[]) => {
        setIndex(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`${import.meta.env.BASE_URL}data/songs/${selectedId}.json`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: SongData) => {
        setSong(data);
        setEditText(data.source ?? '');
        setIsEditing(false);
        setEditError(null);
      })
      .catch((err) => console.error(err));
  }, [selectedId]);

  // Fetch fresh content from backend when editing starts
  useEffect(() => {
    if (isEditing && song?.sourcePath) {
        const filename = song.sourcePath.split('/').pop();
        if (filename) {
            fetch(`http://localhost:8000/api/songs/${filename}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch from backend');
                })
                .then(data => {
                    if (data.content) {
                        setEditText(data.content);
                    }
                })
                .catch(err => {
                    console.warn("Backend not available or error fetching:", err);
                });
        }
    }
  }, [isEditing, song]);

  const fuse = useMemo(() => {
    if (index.length === 0) return null;
    return new Fuse(index, {
      keys: contextSensitive ? ['title', 'sections'] : ['title'],
      threshold: 0.35,
      includeScore: true
    });
  }, [index, contextSensitive]);

  const results = useMemo(() => {
    if (!fuse || query.trim() === '') return index;
    return fuse.search(query).map((hit) => hit.item);
  }, [fuse, index, query]);

  const sortedResults = useMemo(() => {
    const starredSongs = results.filter(song => starred.has(song.id));
    const unstarredSongs = results.filter(song => !starred.has(song.id));
    return [...starredSongs, ...unstarredSongs];
  }, [results, starred]);

  const toggleStar = (id: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('starred-songs', JSON.stringify([...next]));
      return next;
    });
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTranspose(0);
  };

  const applyEdit = async (source: string = editText) => {
    if (!song) return;
    try {
      const parsed = parseChordPro(source, song.sourcePath ?? 'inline');
      setSong({ ...parsed, id: song.id });
      setEditText(source);
      setEditError(null);
      setIsEditing(false);

      // Save to backend
      if (song.sourcePath) {
        const filename = song.sourcePath.split('/').pop();
        if (filename) {
            try {
                const response = await fetch(`http://localhost:8000/api/songs/${filename}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: source }),
                });
                
                if (!response.ok) {
                    throw new Error('Failed to save song to backend');
                }
                console.log('Song saved to backend');
            } catch (backendErr) {
                console.error('Backend save failed:', backendErr);
                alert('Failed to save to backend. Is the backend server running?');
            }
        }
      }
    } catch (err) {
      setEditError((err as Error).message ?? 'Failed to parse song');
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <h1>Holy Songs</h1>
        <p style={{ margin: '0 0 12px' }}>Search, view, and transpose songs.</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <input
            placeholder="Search title or lyrics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={contextSensitive}
              onChange={(e) => setContextSensitive(e.target.checked)}
              style={{ width: 'auto', padding: 0, border: 'none', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px' }}>Context sensitive</span>
          </label>
        </div>
        <ul className="song-list">
          {sortedResults.map((entry) => (
            <li key={entry.id}>
              <button
                className={entry.id === selectedId ? 'active' : ''}
                onClick={() => handleSelect(entry.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{entry.title}</div>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Key: {entry.key ?? '—'}</div>
                  </div>
                  <span
                    className={`star-icon ${starred.has(entry.id) ? 'filled' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(entry.id);
                    }}
                    title={starred.has(entry.id) ? 'Unstar song' : 'Star song'}
                  >
                    {starred.has(entry.id) ? '★' : '☆'}
                  </span>
                </div>
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
              <div className="editor-container">
                <SongEditor
                  initialSource={editText}
                  onSave={applyEdit}
                  onCancel={() => setIsEditing(false)}
                />
                {editError && <div className="error">{editError}</div>}
                <div className="note" style={{ marginTop: 8 }}>Edits stay local; rerun build to persist to disk.</div>
              </div>
            )}
            <div className="song-container">
              <SongView song={song} transpose={transpose} highlightQuery={query} isContextSensitive={contextSensitive} />
            </div>
          </>
        ) : (
          <p>Loading song...</p>
        )}
      </div>
    </div>
  );
}
