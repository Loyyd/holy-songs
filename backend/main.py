from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from contextlib import asynccontextmanager
import os
import queue
import subprocess
import re
import threading
import time
import uuid
from urllib.parse import quote

from backend.utils import sanitize_filename


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_sync_worker_started()
    if os.path.exists(SONGS_DIR) and not os.path.exists(DIST_INDEX_PATH):
        rebuild_songs()
    yield


app = FastAPI(lifespan=lifespan)


def parse_cors_origins() -> list[str]:
    configured = os.environ.get("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    if origins:
        return origins
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


# Allow CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Path to the songs directory (relative to this file)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST_DIR = os.path.join(BASE_DIR, "dist")
DIST_DATA_DIR = os.path.join(DIST_DIR, "data")
DIST_INDEX_PATH = os.path.join(DIST_DATA_DIR, "songs.index.json")
GIT_SHA = os.environ.get("GIT_SHA", "unknown")
IMAGE_REF = os.environ.get("IMAGE_REF", "unknown")
ADMIN_TOKEN = os.environ.get("HOLY_SONGS_ADMIN_TOKEN", "").strip()


def require_write_access(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
):
    if not ADMIN_TOKEN:
        return

    bearer_prefix = "Bearer "
    provided_token = x_admin_token if isinstance(x_admin_token, str) else None
    if isinstance(authorization, str) and authorization.startswith(bearer_prefix):
        provided_token = authorization[len(bearer_prefix):].strip()

    if not provided_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin token required",
        )

    if provided_token != ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin token",
        )

def has_chordpro_files(directory: str) -> bool:
    try:
        return any(entry.endswith(".pro") for entry in os.listdir(directory))
    except OSError:
        return False

def resolve_songs_dir() -> str:
    configured_dir = os.environ.get("SONGS_DIR")
    if configured_dir:
        return os.path.abspath(configured_dir)

    local_dir = os.path.join(BASE_DIR, "songs")
    if os.path.isdir(local_dir) and has_chordpro_files(local_dir):
        return local_dir

    sibling_dir = os.path.abspath(os.path.join(BASE_DIR, "..", "holy-songs-content", "songs"))
    return sibling_dir

SONGS_DIR = resolve_songs_dir()

def resolve_content_repo_dir() -> str | None:
    configured_dir = os.environ.get("CONTENT_REPO_DIR")
    if configured_dir:
        return os.path.abspath(configured_dir)

    parent_dir = os.path.abspath(os.path.join(SONGS_DIR, ".."))
    if os.path.isdir(os.path.join(parent_dir, ".git")):
        return parent_dir

    sibling_repo = os.path.abspath(os.path.join(BASE_DIR, "..", "holy-songs-content"))
    if os.path.isdir(os.path.join(sibling_repo, ".git")):
        return sibling_repo

    return None

CONTENT_REPO_DIR = resolve_content_repo_dir()

DEFAULT_GIT_USER_NAME = "Holy Songs Bot"
DEFAULT_GIT_USER_EMAIL = "holy-songs-bot@local"

def rebuild_songs() -> dict:
    """Build generated song data without deploying."""
    try:
        env = os.environ.copy()
        if os.path.exists(DIST_DIR):
            env["SONGS_OUTPUT_DIR"] = DIST_DATA_DIR
        env["SONGS_DIR"] = SONGS_DIR
        
        subprocess.run(
            ["npm", "run", "build:songs"],
            cwd=BASE_DIR,
            check=True,
            env=env,
            capture_output=True,
            text=True,
        )
        message = "Build script executed successfully."
        print(message)
        return {"ok": True, "message": message}
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()
        stdout = (e.stdout or "").strip()
        message = f"Error during build: {stderr or stdout or e}"
        print(message)
        return {"ok": False, "message": message}

def build_push_target(remote_name: str) -> str:
    github_token = os.environ.get("GITHUB_TOKEN")
    explicit_remote_url = os.environ.get("CONTENT_REPO_PUSH_REMOTE_URL")

    if explicit_remote_url:
        remote_url = explicit_remote_url
    elif github_token:
        remote_url = subprocess.run(
            ["git", "remote", "get-url", remote_name],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    else:
        return remote_name

    if not github_token:
        return remote_url

    token = quote(github_token, safe="")
    if remote_url.startswith("git@github.com:"):
        remote_path = remote_url[len("git@github.com:"):]
        return f"https://x-access-token:{token}@github.com/{remote_path}"
    if remote_url.startswith("https://github.com/"):
        return remote_url.replace(
            "https://github.com/",
            f"https://x-access-token:{token}@github.com/",
            1,
        )
    return remote_url

def get_git_identity() -> tuple[str, str]:
    user_name = os.environ.get("CONTENT_REPO_GIT_USER_NAME", DEFAULT_GIT_USER_NAME)
    user_email = os.environ.get("CONTENT_REPO_GIT_USER_EMAIL", DEFAULT_GIT_USER_EMAIL)
    return user_name, user_email

def rebase_content_repo(remote_name: str, branch: str, user_name: str, user_email: str) -> bool:
    push_target = build_push_target(remote_name)
    before = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=CONTENT_REPO_DIR,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    subprocess.run(
        ["git", "fetch", push_target, branch],
        cwd=CONTENT_REPO_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        [
            "git",
            "-c",
            f"user.name={user_name}",
            "-c",
            f"user.email={user_email}",
            "rebase",
            "-X",
            "theirs",
            "FETCH_HEAD",
        ],
        cwd=CONTENT_REPO_DIR,
        check=True,
        capture_output=True,
        text=True,
    )

    after = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=CONTENT_REPO_DIR,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return before != after

def content_repo_has_uncommitted_changes() -> bool:
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=CONTENT_REPO_DIR,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return bool(status)

def sync_content_repo(changed_path: str, action: str) -> dict:
    if not CONTENT_REPO_DIR or not os.path.isdir(os.path.join(CONTENT_REPO_DIR, ".git")):
        message = "Skipping content repo sync: CONTENT_REPO_DIR is not a git repository."
        print(message)
        return {"ok": False, "pushed": False, "message": message}

    try:
        try:
            rel_path = os.path.relpath(os.path.abspath(changed_path), CONTENT_REPO_DIR)
        except ValueError:
            message = f"Skipping content repo sync: {changed_path} is outside the content repo."
            print(message)
            return {"ok": False, "pushed": False, "message": message}

        if rel_path.startswith(".."):
            message = f"Skipping content repo sync: {changed_path} is outside the content repo."
            print(message)
            return {"ok": False, "pushed": False, "message": message}

        remote_name = os.environ.get("CONTENT_REPO_PUSH_REMOTE", "origin")
        branch = os.environ.get("CONTENT_REPO_PUSH_BRANCH")
        if not branch:
            branch = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=CONTENT_REPO_DIR,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

        user_name, user_email = get_git_identity()
        subprocess.run(["git", "add", "--", rel_path], cwd=CONTENT_REPO_DIR, check=True)

        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--", rel_path],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if not staged:
            remote_changed = rebase_content_repo(remote_name, branch, user_name, user_email)
            if remote_changed:
                rebuild_songs()
                message = f"Content repo refreshed from GitHub for {rel_path}."
                print(message)
                return {"ok": True, "pushed": False, "message": message}
            message = f"No content repo changes to sync for {rel_path}."
            print(message)
            return {"ok": True, "pushed": False, "message": message}

        commit_message = f"{action}: {os.path.basename(rel_path)} via Holy Songs editor"
        subprocess.run(
            [
                "git",
                "-c",
                f"user.name={user_name}",
                "-c",
                f"user.email={user_email}",
                "commit",
                "-m",
                commit_message,
            ],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        )

        push_target = build_push_target(remote_name)
        remote_changed = False
        if not content_repo_has_uncommitted_changes():
            remote_changed = rebase_content_repo(remote_name, branch, user_name, user_email)
        subprocess.run(
            ["git", "push", push_target, f"HEAD:{branch}"],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        )
        if remote_changed:
            rebuild_songs()
        message = f"Content repo synced successfully for {rel_path}."
        print(message)
        return {"ok": True, "pushed": True, "message": message}
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        stdout = (error.stdout or "").strip()
        message = f"Content repo sync failed for {changed_path}: {stderr or stdout or error}"
        print(message)
        return {"ok": False, "pushed": False, "message": message}


SYNC_JOB_STATES = {"saved_locally", "rebuilding", "syncing", "synced", "failed"}
sync_job_queue: "queue.Queue[str]" = queue.Queue()
sync_jobs: dict[str, dict] = {}
sync_jobs_lock = threading.Lock()
sync_worker_started = False
sync_worker_lock = threading.Lock()


def public_job_status(job: dict) -> dict:
    status = {
        "job_id": job["job_id"],
        "status": job["status"],
        "action": job["action"],
        "filename": os.path.basename(job["changed_path"]),
        "message": job.get("message"),
        "ok": job.get("ok"),
        "pushed": job.get("pushed", False),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
    }
    return status


def update_sync_job(job_id: str, **changes):
    with sync_jobs_lock:
        job = sync_jobs.get(job_id)
        if not job:
            return
        if "status" in changes and changes["status"] not in SYNC_JOB_STATES:
            raise ValueError(f"Invalid sync job status: {changes['status']}")
        job.update(changes)
        job["updated_at"] = time.time()


def run_sync_job(job_id: str):
    with sync_jobs_lock:
        job = sync_jobs.get(job_id)
        if not job:
            return
        changed_path = job["changed_path"]
        action = job["action"]

    update_sync_job(
        job_id,
        status="rebuilding",
        message="Saved locally. Rebuilding song data...",
    )
    build_result = rebuild_songs()
    if not build_result["ok"]:
        update_sync_job(
            job_id,
            status="failed",
            ok=False,
            pushed=False,
            message=build_result["message"],
        )
        return

    update_sync_job(
        job_id,
        status="syncing",
        message="Song data rebuilt. Syncing content repo...",
    )
    sync_result = sync_content_repo(changed_path, action)
    if sync_result.get("ok"):
        update_sync_job(
            job_id,
            status="synced",
            ok=True,
            pushed=sync_result.get("pushed", False),
            message=sync_result.get("message") or "Content repo synced.",
        )
    else:
        update_sync_job(
            job_id,
            status="failed",
            ok=False,
            pushed=False,
            message=sync_result.get("message") or "Content repo sync failed.",
        )


def sync_worker_loop():
    while True:
        job_id = sync_job_queue.get()
        try:
            run_sync_job(job_id)
        finally:
            sync_job_queue.task_done()


def ensure_sync_worker_started():
    global sync_worker_started
    with sync_worker_lock:
        if sync_worker_started:
            return
        worker = threading.Thread(target=sync_worker_loop, name="content-sync-worker", daemon=True)
        worker.start()
        sync_worker_started = True


def enqueue_content_sync(changed_path: str, action: str) -> dict:
    ensure_sync_worker_started()
    now = time.time()
    job_id = uuid.uuid4().hex
    job = {
        "job_id": job_id,
        "status": "saved_locally",
        "action": action,
        "changed_path": changed_path,
        "message": "Saved locally. Waiting to rebuild song data...",
        "ok": None,
        "pushed": False,
        "created_at": now,
        "updated_at": now,
    }
    with sync_jobs_lock:
        sync_jobs[job_id] = job
    sync_job_queue.put(job_id)
    return public_job_status(job)


def validate_song_path(filepath: str):
    """Ensure the file path is within the songs directory"""
    if os.path.commonpath([os.path.abspath(filepath), SONGS_DIR]) != SONGS_DIR:
        raise HTTPException(status_code=403, detail="Invalid file path")

class SongContent(BaseModel):
    content: str

@app.get("/api/version")
def get_version():
    return {"git_sha": GIT_SHA, "image_ref": IMAGE_REF}


@app.get("/api/sync-jobs/{job_id}")
def get_sync_job(job_id: str):
    with sync_jobs_lock:
        job = sync_jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Sync job not found")
        return public_job_status(job.copy())


@app.post("/api/refresh", dependencies=[Depends(require_write_access)])
def refresh_from_github():
    """Pull the content repository from GitHub and rebuild generated song data."""
    if not CONTENT_REPO_DIR or not os.path.isdir(os.path.join(CONTENT_REPO_DIR, ".git")):
        message = "Cannot refresh: CONTENT_REPO_DIR is not a git repository."
        print(message)
        return {"ok": False, "changed": False, "message": message}

    try:
        remote_name = os.environ.get("CONTENT_REPO_PUSH_REMOTE", "origin")
        branch = os.environ.get("CONTENT_REPO_PUSH_BRANCH")
        if not branch:
            branch = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=CONTENT_REPO_DIR,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

        user_name, user_email = get_git_identity()
        changed = rebase_content_repo(remote_name, branch, user_name, user_email)
        build_result = rebuild_songs()
        if not build_result["ok"]:
            return {"ok": False, "changed": changed, "message": build_result["message"]}

        if changed:
            message = "Content repo refreshed from GitHub."
        else:
            message = "Content repo already up to date; song data rebuilt."
        print(message)
        return {"ok": True, "changed": changed, "message": message}
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        stdout = (error.stdout or "").strip()
        message = f"Content repo refresh failed: {stderr or stdout or error}"
        print(message)
        return {"ok": False, "changed": False, "message": message}

@app.get("/api/songs")
def list_songs():
    songs = []
    if os.path.exists(SONGS_DIR):
        for filename in os.listdir(SONGS_DIR):
            if filename.endswith(".pro"):
                songs.append(filename)
    return {"songs": sorted(songs)}

@app.post("/api/songs/create", dependencies=[Depends(require_write_access)])
def create_song(song: SongContent):
    """Create a new song file with auto-generated filename from title"""
    # Extract title from content
    title_match = re.search(r'\{title:\s*([^}]+)\}', song.content, re.IGNORECASE)
    if not title_match:
        raise HTTPException(status_code=400, detail="Song must have a {title: ...} directive")
    
    title = title_match.group(1).strip()
    base_filename = sanitize_filename(title)
    filename = f"{base_filename}.pro"
    filepath = os.path.join(SONGS_DIR, filename)
    
    # If file exists, add a number suffix
    counter = 1
    while os.path.exists(filepath):
        filename = f"{base_filename}-{counter}.pro"
        filepath = os.path.join(SONGS_DIR, filename)
        counter += 1
    
    # Ensure we are writing to the songs directory
    validate_song_path(filepath)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(song.content)
    
    sync = enqueue_content_sync(filepath, "Create song")
    
    # The ID is the base filename without extension
    song_id = os.path.splitext(filename)[0]
    
    return {"message": "Song saved locally", "filename": filename, "id": song_id, "sync": sync}

@app.get("/api/songs/{filename}")
def get_song(filename: str):
    # Basic security check to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
         raise HTTPException(status_code=400, detail="Invalid filename")
    
    filepath = os.path.join(SONGS_DIR, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Song not found")
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    return {"content": content}

@app.post("/api/songs/{filename}", dependencies=[Depends(require_write_access)])
@app.put("/api/songs/{filename}", dependencies=[Depends(require_write_access)])
def update_song(filename: str, song: SongContent):
    """Update an existing song file"""
    # Basic security check to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    filepath = os.path.join(SONGS_DIR, filename)
    
    # Ensure we are writing to the songs directory
    validate_song_path(filepath)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Song not found")
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(song.content)
    
    sync = enqueue_content_sync(filepath, "Update song")
    
    return {"message": "Song saved locally", "filename": filename, "sync": sync}

@app.delete("/api/songs/{filename}", dependencies=[Depends(require_write_access)])
def delete_song(filename: str):
    """Delete a song file"""
    # Basic security check to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    filepath = os.path.join(SONGS_DIR, filename)
    
    # Ensure we are deleting from the songs directory
    validate_song_path(filepath)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Song not found")
    
    os.remove(filepath)
    
    sync = enqueue_content_sync(filepath, "Delete song")
    
    return {"message": "Song deleted locally", "sync": sync}

def find_song_file_by_id(song_id: str) -> str | None:
    """Find a .pro file by song ID (slug of title)"""
    if not os.path.exists(SONGS_DIR):
        return None
    
    for filename in os.listdir(SONGS_DIR):
        if not filename.endswith(".pro"):
            continue
        filepath = os.path.join(SONGS_DIR, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        # Extract title and convert to slug
        title_match = re.search(r'\{title:\s*([^}]+)\}', content, re.IGNORECASE)
        if title_match:
            title = title_match.group(1).strip()
            # Create slug from title (same logic as frontend slugify)
            slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
            slug = re.sub(r'^-+|-+$', '', slug)
            if slug == song_id:
                return filepath
    return None

@app.get("/edit/{song_id:path}")
def serve_edit_page(song_id: str):
    """Serve the SPA shell for direct edit-page loads."""
    index_path = os.path.join(DIST_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend not built")
    return FileResponse(index_path)

# Mount the static files from dist/ directory (production)
if os.path.exists(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
