import { useEffect, useRef, useState } from 'react';
import type { SaveToastState } from '../components/SaveToast';
import type { SyncJobStatus } from './useSongSaving';

function getSyncMessage(sync?: SyncJobStatus) {
  if (!sync) {
    return { kind: 'warning' as const, message: 'Saved locally, backup status unknown' };
  }
  if (sync.status === 'saved_locally') {
    return { kind: 'success' as const, message: 'Saved locally, syncing in background' };
  }
  if (sync.status === 'rebuilding') {
    return { kind: 'success' as const, message: 'Saved locally, rebuilding song data' };
  }
  if (sync.status === 'syncing') {
    return { kind: 'success' as const, message: 'Song data rebuilt, syncing backup' };
  }
  if (sync.status === 'failed' || !sync.ok) {
    return {
      kind: 'warning' as const,
      message: sync.message?.trim() || 'Saved locally, GitHub backup failed',
    };
  }
  if (!sync.pushed) {
    return { kind: 'success' as const, message: 'Saved locally, no backup changes' };
  }
  return { kind: 'success' as const, message: 'Saved and backed up' };
}

export function useSaveToast() {
  const [saveToast, setSaveToast] = useState<SaveToastState>({
    visible: false,
    kind: 'success',
    message: 'Saved',
  });
  const [saveToastTick, setSaveToastTick] = useState(0);
  const saveToastTimeoutRef = useRef<number | null>(null);

  const showToast = (nextToast: Omit<SaveToastState, 'visible'>) => {
    if (saveToastTimeoutRef.current !== null) {
      window.clearTimeout(saveToastTimeoutRef.current);
    }
    setSaveToastTick((tick) => tick + 1);
    setSaveToast({ visible: true, ...nextToast });
    saveToastTimeoutRef.current = window.setTimeout(() => {
      setSaveToast((toast) => ({ ...toast, visible: false }));
      saveToastTimeoutRef.current = null;
    }, nextToast.kind === 'error' ? 3600 : 2600);
  };

  const showSaveToast = (sync?: SyncJobStatus) => {
    showToast(getSyncMessage(sync));
  };

  const showFailureToast = (message: string) => {
    showToast({ kind: 'error', message });
  };

  useEffect(() => {
    return () => {
      if (saveToastTimeoutRef.current !== null) {
        window.clearTimeout(saveToastTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveToast,
    saveToastTick,
    showToast,
    showSaveToast,
    showFailureToast,
  };
}
