export type SaveToastState = {
  visible: boolean;
  kind: 'success' | 'warning' | 'error';
  message: string;
};

interface SaveToastProps {
  toast: SaveToastState;
  tick: number;
}

export function SaveToast({ toast, tick }: SaveToastProps) {
  return (
    <div
      className={`save-toast ${toast.visible ? 'visible' : ''} ${toast.kind}`}
      role="status"
      aria-live="polite"
      aria-label={toast.visible ? toast.message : undefined}
    >
      <div key={tick} className="save-toast-icon">
        {toast.kind === 'success' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 12.5 10 16.5 18 7.5" />
          </svg>
        ) : toast.kind === 'error' ? (
          <span aria-hidden="true">×</span>
        ) : (
          <span aria-hidden="true">!</span>
        )}
      </div>
      <div className="save-toast-label">{toast.message}</div>
    </div>
  );
}
