import pytest
import queue

import backend.main as main
from backend.utils import sanitize_filename

@pytest.mark.parametrize("input_title,expected_output", [
    ("Song Title", "song-title"),
    ("My SoNg", "my-song"),
    ("Song! @#$%^&*()Title", "song-title"),
    ("Song   Title", "song-title"),
    ("Song---Title", "song-title"),
    ("Song - - Title", "song-title"),
    ("  Song Title  ", "song-title"),
    ("--Song Title--", "song-title"),
    ("Song 123", "song-123"),
    ("", "untitled-song"),
    ("!!! @#$ %^&", "untitled-song"),
    (" - - ", "untitled-song"),
    ("123 abc", "123-abc"),
])
def test_sanitize_filename(input_title, expected_output):
    assert sanitize_filename(input_title) == expected_output


def test_enqueue_content_sync_records_saved_locally(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "ensure_sync_worker_started", lambda: None)
    monkeypatch.setattr(main, "sync_job_queue", queue.Queue())
    with main.sync_jobs_lock:
        main.sync_jobs.clear()

    status = main.enqueue_content_sync(str(tmp_path / "amazing-grace.pro"), "Update song")

    assert status["status"] == "saved_locally"
    assert status["filename"] == "amazing-grace.pro"
    assert status["ok"] is None
    assert main.sync_job_queue.get_nowait() == status["job_id"]


def test_run_sync_job_marks_failed_when_rebuild_fails(monkeypatch, tmp_path):
    job_id = "job-1"
    changed_path = str(tmp_path / "song.pro")
    with main.sync_jobs_lock:
        main.sync_jobs.clear()
        main.sync_jobs[job_id] = {
            "job_id": job_id,
            "status": "saved_locally",
            "action": "Update song",
            "changed_path": changed_path,
            "message": "Saved locally.",
            "ok": None,
            "pushed": False,
            "created_at": 1,
            "updated_at": 1,
        }

    monkeypatch.setattr(main, "rebuild_songs", lambda: {"ok": False, "message": "Build failed"})
    monkeypatch.setattr(
        main,
        "sync_content_repo",
        lambda *_args, **_kwargs: pytest.fail("sync should not run after a failed rebuild"),
    )

    main.run_sync_job(job_id)

    with main.sync_jobs_lock:
        job = main.sync_jobs[job_id]
    assert job["status"] == "failed"
    assert job["ok"] is False
    assert job["message"] == "Build failed"
