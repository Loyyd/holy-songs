import type { SongData } from '../types';
import { songSubtitle } from '../appUtils';

interface SongToolbarProps {
  song: SongData;
  transpose: number;
  isTransposeOpen: boolean;
  autoScroll: boolean;
  scrollSpeed: number;
  isRefreshing: boolean;
  onOpenTranspose: () => void;
  onSetTransposeOpen: (isOpen: boolean) => void;
  onAdjustTranspose: (delta: number, button?: HTMLButtonElement) => void;
  onEdit: () => void;
  onToggleAutoScroll: () => void;
  onScrollSpeedChange: (speed: number) => void;
  onRefresh: () => void;
}

export function SongToolbar({
  song,
  transpose,
  isTransposeOpen,
  autoScroll,
  scrollSpeed,
  isRefreshing,
  onOpenTranspose,
  onSetTransposeOpen,
  onAdjustTranspose,
  onEdit,
  onToggleAutoScroll,
  onScrollSpeedChange,
  onRefresh,
}: SongToolbarProps) {
  return (
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
              onSetTransposeOpen(false);
            }
          }}
        >
          <button
            className="transpose-main"
            onClick={onOpenTranspose}
            onFocus={() => onSetTransposeOpen(true)}
            title="Transpose"
            aria-label="Open transpose controls"
          >
            <span className="transpose-label-full">Transpose</span>
            <span className="transpose-label-short">Tr.</span>
          </button>
          <button
            className="transpose-step"
            onClick={(event) => onAdjustTranspose(-1, event.currentTarget)}
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
            onClick={(event) => onAdjustTranspose(1, event.currentTarget)}
            tabIndex={isTransposeOpen || transpose !== 0 ? 0 : -1}
            title="Transpose up"
            aria-label="Transpose up"
          >
            +
          </button>
        </div>
        <button onClick={onEdit}>Edit</button>
        <button
          onClick={onToggleAutoScroll}
          style={{
            background: autoScroll ? 'var(--brand-blue)' : 'var(--surface-muted)',
            color: autoScroll ? '#ffffff' : 'var(--brand-blue)',
          }}
        >
          {autoScroll ? 'Stop scroll' : 'Autoscroll'}
        </button>
        <button
          className="refresh-button"
          onClick={onRefresh}
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
            onChange={(event) => onScrollSpeedChange(parseFloat(event.target.value))}
            className="speed-slider"
          />
          <span className="speed-value">{scrollSpeed.toFixed(2)}x</span>
        </div>
      )}
    </div>
  );
}
