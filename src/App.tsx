import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { SongData, SongIndexEntry, SongLineToken } from './types';
import { transposeTokens, transposeChordProSource } from './lib/chords';
import { parseChordPro } from './lib/parseChordPro';
import { SongEditor } from './components/SongEditor';

type SyncStatus = {
  ok: boolean;
  pushed: boolean;
  message?: string;
};

type SaveResponse = {
  id?: string;
  filename?: string;
  message?: string;
  sync?: SyncStatus;
};

type RefreshResponse = {
  ok: boolean;
  changed: boolean;
  message?: string;
};

type SaveToast = {
  visible: boolean;
  kind: 'success' | 'warning';
  message: string;
};

function SongView({ song, transpose, highlightQuery, isContextSensitive }: { song: SongData; transpose: number; highlightQuery?: string; isContextSensitive?: boolean }) {
  if (!song || !song.sections) return <div className="song">No content</div>;

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
            <mark key={i} style={{ backgroundColor: 'rgba(216, 152, 16, 0.28)', color: 'var(--brand-blue)', padding: '2px 0' }}>{part}</mark>
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
                {mergedTokens.map((token, i) => {
                  // Calculate minimum width needed for the chord to prevent overlap
                  const chordLength = token.chord ? token.chord.length : 0;
                  const lyricLength = token.lyric.length;
                  // Add padding if chord is longer than lyric to prevent overlap
                  const needsPadding = chordLength > lyricLength;
                  const paddingAmount = needsPadding ? chordLength - lyricLength : 0;
                  
                  return (
                    <span key={i} className="token">
                      {token.chord && <span className="chord">{token.chord}</span>}
                      <span className="lyric">
                        {highlightLyric(token.lyric)}
                        {needsPadding && <span className="chord-spacer">{'\u00A0'.repeat(paddingAmount)}</span>}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function songSubtitle(song: { key?: string; interpret?: string }) {
  const pieces = [];
  if (song.key) pieces.push(`Key: ${song.key}`);
  if (song.interpret) pieces.push(`Interpret: ${song.interpret}`);
  return pieces.join(' • ');
}

export default function App() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SongIndexEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [song, setSong] = useState<SongData | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [isTransposeOpen, setIsTransposeOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [contextSensitive, setContextSensitive] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveToast, setSaveToast] = useState<SaveToast>({
    visible: false,
    kind: 'success',
    message: 'Saved',
  });
  const [saveToastTick, setSaveToastTick] = useState(0);
  const [starred, setStarred] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('starred-songs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(0.15);
  const scrollSpeedRef = useRef(scrollSpeed);
  const saveToastTimeoutRef = useRef<number | null>(null);
  const saveIndicatorRef = useRef<HTMLDivElement | null>(null);
  const cursorPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (transpose === 0) {
      setIsTransposeOpen(false);
    }
  }, [transpose]);

  const adjustTranspose = (delta: number, button?: HTMLButtonElement) => {
    setTranspose((current) => {
      const next = current + delta;
      setIsTransposeOpen(next !== 0);
      if (next === 0) {
        window.setTimeout(() => button?.blur(), 0);
      }
      return next;
    });
  };

  const openTranspose = () => {
    setIsTransposeOpen(true);
  };

  const refreshIndex = (selectId?: string) => {
    return fetch(`${import.meta.env.BASE_URL}data/songs.index.json`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: SongIndexEntry[]) => {
        setIndex(data);
        if (selectId) {
          setSelectedId(selectId);
        } else if (!selectedId && data.length > 0) {
          setSelectedId(data[0].id);
        }
        return data;
      })
      .catch((err) => console.error('Failed to refresh index:', err));
  };

  const checkAuth = (): string | null => {
    if (isAuthenticated && adminPassword) return adminPassword;
    const password = window.prompt('Enter password to save changes:');
    if (password) {
      setAdminPassword(password);
      setIsAuthenticated(true);
      return password;
    }
    return null;
  };

  const positionSaveIndicator = (x: number, y: number) => {
    cursorPositionRef.current = { x, y };
    if (saveIndicatorRef.current) {
      saveIndicatorRef.current.style.setProperty('--cursor-x', `${x}px`);
      saveIndicatorRef.current.style.setProperty('--cursor-y', `${y}px`);
    }
  };

  const getSaveMessage = (sync?: SyncStatus) => {
    if (!sync) {
      return { kind: 'warning' as const, message: 'Saved locally, backup status unknown' };
    }
    if (!sync.ok) {
      return { kind: 'warning' as const, message: 'Saved locally, GitHub backup failed' };
    }
    if (!sync.pushed) {
      return { kind: 'success' as const, message: 'Saved locally, no backup changes' };
    }
    return { kind: 'success' as const, message: 'Saved and backed up' };
  };

  const showSaveToast = (sync?: SyncStatus) => {
    if (saveToastTimeoutRef.current !== null) {
      window.clearTimeout(saveToastTimeoutRef.current);
    }
    const nextToast = getSaveMessage(sync);
    positionSaveIndicator(cursorPositionRef.current.x, cursorPositionRef.current.y);
    setSaveToastTick((tick) => tick + 1);
    setSaveToast({ visible: true, ...nextToast });
    saveToastTimeoutRef.current = window.setTimeout(() => {
      setSaveToast((toast) => ({ ...toast, visible: false }));
      saveToastTimeoutRef.current = null;
    }, 2200);
  };

  const getResponseError = async (response: Response, fallbackMessage: string) => {
    try {
      const data = await response.json();
      if (typeof data?.detail === 'string' && data.detail.trim() !== '') {
        return data.detail;
      }
      if (typeof data?.message === 'string' && data.message.trim() !== '') {
        return data.message;
      }
    } catch {
      // Ignore JSON parsing issues and use the fallback below.
    }
    return fallbackMessage;
  };

  const loadSong = (id: string) => {
    return fetch(`${import.meta.env.BASE_URL}data/songs/${id}.json`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: SongData) => {
        setSong(data);
        setEditText(data.source ?? '');
        setIsEditing(false);
        setEditError(null);
        return data;
      });
  };

  useEffect(() => {
    scrollSpeedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  // Autoscroll effect
  useEffect(() => {
    if (!autoScroll) return;

    let animationFrameId: number;
    let accumulatedScroll = 0;
    let previousTimestamp: number | null = null;

    const scroll = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
      }

      const elapsedSeconds = Math.min((timestamp - previousTimestamp) / 1000, 0.1);
      previousTimestamp = timestamp;
      accumulatedScroll += scrollSpeedRef.current * 60 * elapsedSeconds;

      if (accumulatedScroll >= 1) {
        const pixelsToScroll = Math.floor(accumulatedScroll);
        window.scrollBy(0, pixelsToScroll);
        accumulatedScroll -= pixelsToScroll;
      }

      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [autoScroll]);

  useEffect(() => {
    refreshIndex();
  }, []);

  useEffect(() => {
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    positionSaveIndicator(initialX, initialY);

    const handlePointerMove = (event: PointerEvent) => {
      positionSaveIndicator(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (saveToastTimeoutRef.current !== null) {
        window.clearTimeout(saveToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (selectedId.startsWith('new-song-')) return;

    loadSong(selectedId).catch((err) => console.error(err));
  }, [selectedId]);

  // Fetch fresh content from backend when editing starts
  useEffect(() => {
    if (isEditing && song?.sourcePath) {
        const filename = song.sourcePath.split('/').pop();
        if (filename) {
            fetch(`/api/songs/${filename}`)
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

  const toggleFlag = (id: string, currentReviewed: boolean | undefined) => {
    const pwd = checkAuth();
    if (!pwd) return;
    const newReviewed = !currentReviewed;
    
    // Optimistically update the index
    setIndex(prev => prev.map(entry => 
      entry.id === id ? { ...entry, reviewed: newReviewed } : entry
    ));
    
    // Also update the current song if it's selected
    if (song && song.id === id) {
      setSong({ ...song, reviewed: newReviewed });
    }
    
    // Sync with backend
    fetch('/api/reviewed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pwd}`,
      },
      body: JSON.stringify({ song_id: id, reviewed: newReviewed }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          setIsAuthenticated(false);
          setAdminPassword(null);
          throw new Error('Unauthorized');
        }
        if (!res.ok) {
          throw new Error(await getResponseError(res, 'Failed to update reviewed status'));
        }
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          refreshIndex();
          showSaveToast(data.sync);
        } else {
          console.error('Failed to update reviewed status:', data.error);
          // Revert on error
          setIndex(prev => prev.map(entry => 
            entry.id === id ? { ...entry, reviewed: currentReviewed } : entry
          ));
          if (song && song.id === id) {
            setSong({ ...song, reviewed: currentReviewed });
          }
        }
      })
      .catch((err) => {
        console.error('Failed to sync reviewed status with backend:', err);
        // Revert on error
        setIndex(prev => prev.map(entry => 
          entry.id === id ? { ...entry, reviewed: currentReviewed } : entry
        ));
        if (song && song.id === id) {
          setSong({ ...song, reviewed: currentReviewed });
        }
      });
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTranspose(0);
  };

  const handleCreateNewSong = () => {
    if (!checkAuth()) return;
    const newSongTemplate = `{title: New Song}
{key: C}

{section: Verse 1}


{section: Chorus}

`;
    
    const newSong: SongData = {
      id: 'new-song-' + Date.now(),
      title: 'New Song',
      key: 'C',
      sections: [],
      source: newSongTemplate,
      sourcePath: null
    };
    
    setSong(newSong);
    setSelectedId(newSong.id);
    setEditText(newSongTemplate);
    setIsEditing(true);
    setEditError(null);
    setTranspose(0);
  };

  const refreshFromGithub = async () => {
    if (isRefreshing) return;
    const pwd = checkAuth();
    if (!pwd) return;

    try {
      setIsRefreshing(true);
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pwd}`,
        },
      });

      if (response.status === 401) {
        setIsAuthenticated(false);
        setAdminPassword(null);
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to refresh from GitHub.'));
      }

      const result: RefreshResponse = await response.json();
      if (!result.ok) {
        throw new Error(result.message || 'Failed to refresh from GitHub.');
      }

      await refreshIndex(selectedId ?? undefined);
      if (selectedId && !selectedId.startsWith('new-song-')) {
        await loadSong(selectedId);
      }

      setSaveToastTick((tick) => tick + 1);
      setSaveToast({
        visible: true,
        kind: 'success',
        message: result.changed ? 'Refreshed from GitHub' : 'Already up to date',
      });
      if (saveToastTimeoutRef.current !== null) {
        window.clearTimeout(saveToastTimeoutRef.current);
      }
      saveToastTimeoutRef.current = window.setTimeout(() => {
        setSaveToast((toast) => ({ ...toast, visible: false }));
        saveToastTimeoutRef.current = null;
      }, 2200);
    } catch (err) {
      alert('Failed to refresh from GitHub: ' + (err as Error).message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyEdit = async (source: string = editText) => {
    if (!song || isSaving) return;
    const pwd = checkAuth();
    if (!pwd) return;
    try {
      // Apply transpose to the source before saving
      const transposedSource = transposeChordProSource(source, transpose);
      const parsed = parseChordPro(transposedSource, song.sourcePath ?? 'inline');

      // Save to backend
      try {
        setIsSaving(true);
        if (song.sourcePath) {
          // Existing song - update it
          const filename = song.sourcePath.split('/').pop();
          if (!filename) {
            throw new Error('Failed to determine the song filename.');
          }

          const response = await fetch(`/api/songs/${filename}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${pwd}`,
            },
            body: JSON.stringify({ content: transposedSource }),
          });
          
          if (response.status === 401) {
            setIsAuthenticated(false);
            setAdminPassword(null);
            throw new Error('Unauthorized');
          }

          if (!response.ok) {
            throw new Error(await getResponseError(response, 'Failed to save song to the backend.'));
          }
          const result: SaveResponse = await response.json();

          setSong({ ...parsed, id: song.id });
          setEditText(transposedSource);
          setEditError(null);
          setIsEditing(false);
          setTranspose(0);
          await refreshIndex();
          showSaveToast(result.sync);
        } else {
          // New song - create it
          const response = await fetch(`/api/songs/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${pwd}`,
            },
            body: JSON.stringify({ content: transposedSource }),
          });
          
          if (response.status === 401) {
            setIsAuthenticated(false);
            setAdminPassword(null);
            throw new Error('Unauthorized');
          }

          if (!response.ok) {
            throw new Error(await getResponseError(response, 'Failed to create the song on the backend.'));
          }
          
          const result: SaveResponse = await response.json();

          setEditText(transposedSource);
          setEditError(null);
          setIsEditing(false);
          setTranspose(0);
          await refreshIndex(result.id);
          showSaveToast(result.sync);
        }
      } catch (backendErr) {
        console.error('Backend save failed:', backendErr);
        alert((backendErr as Error).message || 'Failed to save to the backend. Is the backend server running?');
      } finally {
        setIsSaving(false);
      }
    } catch (err) {
      setEditError((err as Error).message ?? 'Failed to parse song');
    }
  };

  const handleDelete = async () => {
    if (!song || !song.sourcePath) {
      // For unsaved new songs, just cancel
      setIsEditing(false);
      setSelectedId(index.length > 0 ? index[0].id : null);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${song.title}"?`)) {
      return;
    }

    const pwd = checkAuth();
    if (!pwd) return;

    try {
      const filename = song.sourcePath.split('/').pop();
      const response = await fetch(`/api/songs/${filename}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${pwd}`,
        },
      });

      if (response.status === 401) {
        setIsAuthenticated(false);
        setAdminPassword(null);
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to delete song'));
      }
      const result: SaveResponse = await response.json();

      // Select another song or clear selection
      const nextIndex = index.filter(s => s.id !== song.id);
      if (nextIndex.length > 0) {
        setSelectedId(nextIndex[0].id);
      } else {
        setSelectedId(null);
        setSong(null);
      }
      
      // Refresh index from server
      refreshIndex();
      
      setIsEditing(false);
      showSaveToast(result.sync);
    } catch (err) {
      alert('Failed to delete song: ' + (err as Error).message);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="brand-heading">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo-black.png`}
            alt=""
            aria-hidden="true"
          />
          <h1 className="brand-title" aria-label="Holy Songs">
            <span className="brand-title-holy">Holy</span>
            <span className="brand-title-songs">Songs</span>
          </h1>
        </div>
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
          <button 
            onClick={handleCreateNewSong}
            style={{ 
              width: '32px', 
              height: '32px', 
              padding: '0',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            title="Create new song"
          >
            +
          </button>
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
                    <div style={{ fontSize: 13, opacity: 0.75 }}>{songSubtitle(entry) || 'Key: —'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
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
                    <span
                      className={`flag-icon ${entry.reviewed ? 'reviewed' : 'not-reviewed'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlag(entry.id, entry.reviewed);
                      }}
                      title={entry.reviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
                    >
                      🚩
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        {song ? (
          <>
            <div className="song-header">
              <div className="song-heading">
                <h2 style={{ margin: 0 }}>{song.title}</h2>
                <div className="song-subtitle">{songSubtitle(song) || 'Key: —'}</div>
              </div>
              <div className="song-actions">
                <div
                  className={`transpose-control ${isTransposeOpen ? 'is-open' : ''} ${transpose !== 0 ? 'is-transposed' : ''}`}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsTransposeOpen(false);
                    }
                  }}
                >
                  <button
                    className="transpose-main"
                    onClick={openTranspose}
                    onFocus={() => setIsTransposeOpen(true)}
                    title="Transpose"
                    aria-label="Open transpose controls"
                  >
                    <span className="transpose-label-full">Transpose</span>
                    <span className="transpose-label-short">Tr.</span>
                  </button>
                  <button
                    className="transpose-step"
                    onClick={(event) => adjustTranspose(-1, event.currentTarget)}
                    tabIndex={isTransposeOpen || transpose !== 0 ? 0 : -1}
                    title="Transpose down"
                    aria-label="Transpose down"
                  >
                    -
                  </button>
                  <span className="transpose-value" aria-label={`Transpose ${transpose}`}>
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button
                    className="transpose-step"
                    onClick={(event) => adjustTranspose(1, event.currentTarget)}
                    tabIndex={isTransposeOpen || transpose !== 0 ? 0 : -1}
                    title="Transpose up"
                    aria-label="Transpose up"
                  >
                    +
                  </button>
                </div>
                <button onClick={() => setIsEditing((open) => !open)}>
                  {isEditing ? 'Close' : 'Edit'}
                </button>
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  style={{
                    background: autoScroll ? 'var(--brand-blue)' : 'var(--surface-muted)',
                    color: autoScroll ? '#ffffff' : 'var(--brand-blue)'
                  }}
                >
                  {autoScroll ? 'Stop scroll' : 'Autoscroll'}
                </button>
                <button
                  className="refresh-button"
                  onClick={refreshFromGithub}
                  disabled={isRefreshing}
                  title="Refresh from GitHub"
                  aria-label="Refresh from GitHub"
                >
                  <img src={`${import.meta.env.BASE_URL}refresh.png`} alt="" aria-hidden="true" />
                </button>
              </div>
              {autoScroll && (
                <div className="autoscroll-speed">
                  <label style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>Speed:</label>
                  <input
                    type="range"
                    min="0.05"
                    max="0.5"
                    step="0.01"
                    value={scrollSpeed}
                    onChange={(event) => setScrollSpeed(parseFloat(event.target.value))}
                    className="speed-slider"
                  />
                  <span className="speed-value">{scrollSpeed.toFixed(2)}x</span>
                </div>
              )}
            </div>
            {isEditing ? (
              <div className="editor-container">
                <SongEditor
                  initialSource={editText}
                  onSave={applyEdit}
                  onCancel={() => setIsEditing(false)}
                  onDelete={handleDelete}
                  isSaving={isSaving}
                />
                {editError && <div className="error">{editError}</div>}
                <div className="note" style={{ marginTop: 8 }}>Edits save to the content repo immediately and then sync to GitHub automatically.</div>
              </div>
            ) : (
              <div className="song-container">
                <SongView song={song} transpose={transpose} highlightQuery={query} isContextSensitive={contextSensitive} />
              </div>
            )}
          </>
        ) : (
          <p>Loading song...</p>
        )}
      </div>
      <div
        ref={saveIndicatorRef}
        className={`save-toast ${saveToast.visible ? 'visible' : ''} ${saveToast.kind}`}
        role="status"
        aria-live="polite"
        aria-label={saveToast.visible ? saveToast.message : undefined}
      >
        <div key={saveToastTick} className="save-toast-icon">
          {saveToast.kind === 'success' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 12.5 10 16.5 18 7.5" />
            </svg>
          ) : (
            <span aria-hidden="true">!</span>
          )}
        </div>
        <div className="save-toast-label">{saveToast.message}</div>
      </div>
    </div>
  );
}
