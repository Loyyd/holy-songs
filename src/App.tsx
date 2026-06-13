import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import type { SongData } from './types';
import { transposeChordProSource } from './lib/chords';
import { parseChordPro } from './lib/parseChordPro';
import { addSongCategoryToSource, normalizeCategoryName } from './lib/songCategories';
import { SongEditor } from './components/SongEditor';
import { SaveToast } from './components/SaveToast';
import { SongList } from './components/SongList';
import { SongToolbar } from './components/SongToolbar';
import { SongView } from './components/SongView';
import { SongMeta } from './components/SongMeta';
import {
  LAST_QUERY_KEY,
  LAST_SELECTED_ID_KEY,
  NEW_SONG_TEMPLATE,
  STARRED_SONGS_KEY,
  CATEGORY_SUGGESTIONS,
  isTemporaryNewSongId,
  parseAppRoute,
} from './appUtils';
import type { AppRoute } from './appUtils';
import { useSaveToast } from './hooks/useSaveToast';
import { useSelectedSong } from './hooks/useSelectedSong';
import { useSongSaving } from './hooks/useSongSaving';
import type { SyncJobStatus } from './hooks/useSongSaving';
import { useSongIndex } from './hooks/useSongIndex';

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute());
  const [query, setQuery] = useState(() => sessionStorage.getItem(LAST_QUERY_KEY) ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [isTransposeOpen, setIsTransposeOpen] = useState(false);
  const [contextSensitive, setContextSensitive] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const [starred, setStarred] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STARRED_SONGS_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(0.15);

  const scrollSpeedRef = useRef(scrollSpeed);
  const selectedSongButtonRef = useRef<HTMLButtonElement | null>(null);
  const isEditing = route.mode === 'edit';

  const {
    index,
    setIndex,
    refreshIndex,
    getInitialSelectedId,
    shouldRestoreSelection,
  } = useSongIndex();
  const {
    song,
    setSong,
    editText,
    setEditText,
    lastSavedText,
    setLastSavedText,
    editError,
    setEditError,
    loadSong,
    setSongSource,
  } = useSelectedSong(selectedId, isEditing);
  const {
    isSaving,
    isRefreshing,
    saveExistingSong,
    createSong,
    deleteSong,
    refreshFromGithub,
    pollSyncJob,
  } = useSongSaving();
  const {
    saveToast,
    saveToastTick,
    showToast,
    showSaveToast,
    showFailureToast,
  } = useSaveToast();

  const hasUnsavedChanges = editText !== lastSavedText || transpose !== 0;

  useEffect(() => {
    if (transpose === 0) {
      setIsTransposeOpen(false);
    }
  }, [transpose]);

  useEffect(() => {
    scrollSpeedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseAppRoute());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    sessionStorage.setItem(LAST_QUERY_KEY, query);
  }, [query]);

  useEffect(() => {
    if (selectedId && !isTemporaryNewSongId(selectedId)) {
      sessionStorage.setItem(LAST_SELECTED_ID_KEY, selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (index.length > 0 && shouldRestoreSelection()) {
      setSelectedId((currentSelectedId) => getInitialSelectedId(index, currentSelectedId));
    }
  }, [getInitialSelectedId, index, shouldRestoreSelection]);

  useEffect(() => {
    if (route.mode === 'edit' && route.id !== selectedId) {
      setSelectedId(route.id);
      setTranspose(0);
    }
  }, [route, selectedId]);

  useEffect(() => {
    if (route.mode !== 'edit' || !isTemporaryNewSongId(route.id)) return;

    const newSong: SongData = {
      id: route.id,
      title: 'Example Song Title',
      key: 'C',
      sections: [],
      source: NEW_SONG_TEMPLATE,
      sourcePath: null,
    };

    setSongSource(newSong, NEW_SONG_TEMPLATE);
    setSelectedId(route.id);
    setTranspose(0);
  }, [route, setSongSource]);

  const fuse = useMemo(() => {
    if (index.length === 0) return null;
    return new Fuse(index, {
      keys: contextSensitive ? ['title', 'categories', 'sections'] : ['title', 'categories'],
      threshold: 0.35,
      includeScore: true,
    });
  }, [index, contextSensitive]);

  const results = useMemo(() => {
    if (!fuse || query.trim() === '') return index;
    return fuse.search(query).map((hit) => hit.item);
  }, [fuse, index, query]);

  const sortedResults = useMemo(() => {
    const starredSongs = results.filter((entry) => starred.has(entry.id));
    const unstarredSongs = results.filter((entry) => !starred.has(entry.id));
    return [...starredSongs, ...unstarredSongs];
  }, [results, starred]);

  const editHeaderSong = useMemo(() => {
    if (!isEditing || !song) return song;
    return {
      ...parseChordPro(editText, song.sourcePath ?? 'inline'),
      id: song.id,
      sourcePath: song.sourcePath,
    };
  }, [editText, isEditing, song]);

  useEffect(() => {
    if (isEditing || !selectedId) return;

    window.requestAnimationFrame(() => {
      selectedSongButtonRef.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    });
  }, [isEditing, selectedId, sortedResults]);

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

  const navigateToBrowse = () => {
    window.history.pushState(null, '', '/');
    setRoute({ mode: 'browse' });
  };

  const navigateToEdit = (id: string) => {
    window.location.assign(`/edit/${encodeURIComponent(id)}`);
  };

  const toggleStar = (id: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(STARRED_SONGS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTranspose(0);
  };

  const handleCreateNewSong = () => {
    navigateToEdit('new');
  };

  const refreshIndexAfterSync = async (selectId?: string, reloadSelectedSong = true) => {
    const { data } = await refreshIndex(selectId);
    if (selectId) {
      setSelectedId(selectId);
    } else if (data.length > 0 && shouldRestoreSelection()) {
      setSelectedId((currentSelectedId) => getInitialSelectedId(data, currentSelectedId));
    }

    if (reloadSelectedSong && selectId && !isTemporaryNewSongId(selectId)) {
      await loadSong(selectId).catch((err) => console.error(err));
    }
  };

  const settleBackgroundSync = async (sync: SyncJobStatus | undefined, selectId?: string, reloadSelectedSong = true) => {
    showSaveToast(sync);
    try {
      const finalStatus = await pollSyncJob(sync);
      if (finalStatus) {
        showSaveToast(finalStatus);
      }
      await refreshIndexAfterSync(selectId, reloadSelectedSong);
    } catch (err) {
      console.warn('Background sync status failed:', err);
      showToast({ kind: 'warning', message: 'Saved locally, sync status unknown' });
    }
  };

  const handleRefreshFromGithub = async () => {
    try {
      const result = await refreshFromGithub();
      if (!result) return;

      await refreshIndexAfterSync(selectedId ?? undefined);
      showToast({
        kind: 'success',
        message: result.changed ? 'Refreshed from GitHub' : 'Already up to date',
      });
    } catch (err) {
      showFailureToast('Failed to refresh from GitHub');
    }
  };

  const applyEdit = async (source: string = editText) => {
    if (!song || isSaving || !hasUnsavedChanges) return;
    try {
      const transposedSource = transposeChordProSource(source, transpose);
      const parsed = parseChordPro(transposedSource, song.sourcePath ?? 'inline');

      try {
        if (song.sourcePath) {
          const filename = song.sourcePath.split('/').pop();
          if (!filename) {
            throw new Error('Failed to determine the song filename.');
          }

          const result = await saveExistingSong(filename, transposedSource);

          setSong({ ...parsed, id: song.id, sourcePath: song.sourcePath });
          setEditText(transposedSource);
          setLastSavedText(transposedSource);
          setEditError(null);
          setTranspose(0);
          void settleBackgroundSync(result.sync, song.id, false);
        } else {
          const result = await createSong(transposedSource);
          const nextId = result.id ?? parsed.id;
          const sourcePath = result.filename ?? `${nextId}.pro`;

          setSong({ ...parsed, id: nextId, sourcePath });
          setSelectedId(nextId);
          setEditText(transposedSource);
          setLastSavedText(transposedSource);
          setEditError(null);
          setTranspose(0);
          window.history.replaceState(null, '', `/edit/${encodeURIComponent(nextId)}`);
          setRoute({ mode: 'edit', id: nextId });
          void settleBackgroundSync(result.sync, nextId, false);
        }
      } catch (backendErr) {
        console.error('Backend save failed:', backendErr);
        const message = (backendErr as Error).message || 'Failed to save changes';
        setEditError(message);
        showFailureToast(message);
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Failed to parse song';
      setEditError(message);
      showFailureToast(message);
    }
  };

  const handleDelete = async () => {
    if (!song || !song.sourcePath) {
      setSelectedId(index.length > 0 ? index[0].id : null);
      navigateToBrowse();
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${song.title}"?`)) {
      return;
    }

    try {
      const filename = song.sourcePath.split('/').pop();
      if (!filename) {
        throw new Error('Failed to determine the song filename.');
      }

      const result = await deleteSong(filename);
      const nextIndex = index.filter((entry) => entry.id !== song.id);
      setIndex(nextIndex);
      if (nextIndex.length > 0) {
        setSelectedId(nextIndex[0].id);
      } else {
        setSelectedId(null);
        setSong(null);
      }

      navigateToBrowse();
      void settleBackgroundSync(result.sync, nextIndex[0]?.id, false);
    } catch (err) {
      showFailureToast('Failed to delete song');
    }
  };

  const handleCancelEdit = () => {
    if (isTemporaryNewSongId(selectedId)) {
      setSelectedId(index.length > 0 ? index[0].id : null);
      setSong(null);
    }
    setEditError(null);
    navigateToBrowse();
  };

  const handleAddCategory = (event: React.FormEvent) => {
    event.preventDefault();
    const category = normalizeCategoryName(categoryInput);
    if (!category) return;

    setEditText((current) => addSongCategoryToSource(current, category));
    setCategoryInput('');
  };

  const saveToastElement = <SaveToast toast={saveToast} tick={saveToastTick} />;

  if (isEditing) {
    return (
      <div className="edit-page-shell">
        <div className="edit-page-card">
          <div className="edit-page-header">
            {editHeaderSong && (
              <div className="edit-page-title">
                <h2>{isTemporaryNewSongId(editHeaderSong.id) ? 'Create Song' : `Edit ${editHeaderSong.title}`}</h2>
                <SongMeta song={editHeaderSong} />
              </div>
            )}
            <div className="edit-page-actions">
              <form className="category-add-control" onSubmit={handleAddCategory}>
                <input
                  value={categoryInput}
                  onChange={(event) => setCategoryInput(event.target.value)}
                  placeholder="Category"
                  list="category-suggestions"
                  disabled={!song || isSaving}
                />
                <datalist id="category-suggestions">
                  {CATEGORY_SUGGESTIONS.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <button type="submit" disabled={!song || isSaving || normalizeCategoryName(categoryInput) === ''}>
                  Add category
                </button>
              </form>
              <button className="edit-cancel-button" onClick={handleCancelEdit} disabled={isSaving}>
                Back
              </button>
              <button className="primary" onClick={() => applyEdit(editText)} disabled={!song || isSaving || !hasUnsavedChanges}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="danger" onClick={handleDelete} disabled={!song || isSaving}>
                Delete
              </button>
            </div>
          </div>

          {song ? (
            <>
              <SongEditor
                source={editText}
                onChange={setEditText}
              />
              {editError && <div className="error">{editError}</div>}
              <div className="note edit-page-note">Edits save locally immediately and sync to GitHub in the background.</div>
            </>
          ) : (
            <p>Loading editor...</p>
          )}
        </div>
        {saveToastElement}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SongList
        entries={sortedResults}
        selectedId={selectedId}
        starred={starred}
        query={query}
        contextSensitive={contextSensitive}
        selectedSongButtonRef={selectedSongButtonRef}
        onQueryChange={setQuery}
        onContextSensitiveChange={setContextSensitive}
        onCreateNewSong={handleCreateNewSong}
        onSelect={handleSelect}
        onToggleStar={toggleStar}
      />

      <div className="card">
        {song ? (
          <>
            <SongToolbar
              song={song}
              transpose={transpose}
              isTransposeOpen={isTransposeOpen}
              autoScroll={autoScroll}
              scrollSpeed={scrollSpeed}
              isRefreshing={isRefreshing}
              onOpenTranspose={() => setIsTransposeOpen(true)}
              onSetTransposeOpen={setIsTransposeOpen}
              onAdjustTranspose={adjustTranspose}
              onEdit={() => navigateToEdit(song.id)}
              onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
              onScrollSpeedChange={setScrollSpeed}
              onRefresh={handleRefreshFromGithub}
            />
            <div className="song-container">
              <SongView song={song} transpose={transpose} highlightQuery={query} isContextSensitive={contextSensitive} />
            </div>
          </>
        ) : (
          <p>Loading song...</p>
        )}
      </div>
      {autoScroll && (
        <button
          className="floating-autoscroll-stop"
          onClick={() => setAutoScroll(false)}
          type="button"
          aria-label="Disable autoscroll"
        >
          Stop scroll
        </button>
      )}
      {saveToastElement}
    </div>
  );
}
