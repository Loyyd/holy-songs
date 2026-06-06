import { useState } from 'react';
import { ADMIN_TOKEN_KEY } from '../appUtils';

export type SyncJobStatus = {
  job_id: string;
  status: 'saved_locally' | 'rebuilding' | 'syncing' | 'synced' | 'failed';
  action?: string;
  filename?: string;
  message?: string;
  ok?: boolean | null;
  pushed?: boolean;
  created_at?: number;
  updated_at?: number;
};

export type SaveResponse = {
  id?: string;
  filename?: string;
  message?: string;
  sync?: SyncJobStatus;
};

export type RefreshResponse = {
  ok: boolean;
  changed: boolean;
  message?: string;
};

const SYNC_JOB_DONE = new Set<SyncJobStatus['status']>(['synced', 'failed']);

async function getResponseError(response: Response, fallbackMessage: string) {
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
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useSongSaving() {
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) ?? '');

  const getWriteHeaders = (includeJson = false, token = adminToken) => {
    const headers: Record<string, string> = {};
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const promptForAdminToken = (message: string) => {
    const token = window.prompt(message)?.trim();
    if (!token) {
      return null;
    }
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    setAdminToken(token);
    return token;
  };

  const fetchWithAdminRetry = async (url: string, init: RequestInit = {}, includeJson = false) => {
    const request = (token = adminToken) =>
      fetch(url, {
        ...init,
        headers: getWriteHeaders(includeJson, token),
      });

    let response = await request();
    const responseText = response.status === 403 ? await response.clone().text() : '';
    const needsToken = response.status === 401;
    const invalidToken = response.status === 403 && responseText.includes('Invalid admin token');

    if (!needsToken && !invalidToken) {
      return response;
    }

    if (invalidToken) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAdminToken('');
    }

    const nextToken = promptForAdminToken(invalidToken ? 'Invalid admin token. Enter admin token:' : 'Admin token required:');
    if (!nextToken) {
      return response;
    }

    return request(nextToken);
  };

  const pollSyncJob = async (
    initialStatus: SyncJobStatus | undefined,
    onUpdate?: (status: SyncJobStatus) => void,
  ) => {
    if (!initialStatus?.job_id) {
      return initialStatus;
    }

    let latest = initialStatus;
    onUpdate?.(latest);

    for (let attempt = 0; attempt < 180 && !SYNC_JOB_DONE.has(latest.status); attempt += 1) {
      await sleep(attempt < 8 ? 750 : 1500);
      const response = await fetch(`/api/sync-jobs/${latest.job_id}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to check background sync status.'));
      }
      latest = await response.json();
      onUpdate?.(latest);
    }

    return latest;
  };

  const saveExistingSong = async (filename: string, content: string) => {
    setIsSaving(true);
    try {
      const response = await fetchWithAdminRetry(`/api/songs/${filename}`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }, true);

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to save song to the backend.'));
      }

      return await response.json() as SaveResponse;
    } finally {
      setIsSaving(false);
    }
  };

  const createSong = async (content: string) => {
    setIsSaving(true);
    try {
      const response = await fetchWithAdminRetry('/api/songs/create', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }, true);

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to create the song on the backend.'));
      }

      return await response.json() as SaveResponse;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSong = async (filename: string) => {
    setIsSaving(true);
    try {
      const response = await fetchWithAdminRetry(`/api/songs/${filename}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to delete song'));
      }

      return await response.json() as SaveResponse;
    } finally {
      setIsSaving(false);
    }
  };

  const refreshFromGithub = async () => {
    if (isRefreshing) return null;

    setIsRefreshing(true);
    try {
      const response = await fetchWithAdminRetry('/api/refresh', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to refresh from GitHub.'));
      }

      const result = await response.json() as RefreshResponse;
      if (!result.ok) {
        throw new Error(result.message || 'Failed to refresh from GitHub.');
      }
      return result;
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    isSaving,
    isRefreshing,
    saveExistingSong,
    createSong,
    deleteSong,
    refreshFromGithub,
    pollSyncJob,
  };
}
