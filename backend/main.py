from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
import subprocess
import re
import secrets
from urllib.parse import quote

app = FastAPI()
security = HTTPBearer()

def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    admin_password = os.environ.get("ADMIN_PASSWORD", "truelove")
    if not secrets.compare_digest(credentials.credentials, admin_password):
        raise HTTPException(status_code=401, detail="Invalid or missing password")
    return credentials.credentials

# Allow CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Path to the songs directory (relative to this file)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST_DIR = os.path.join(BASE_DIR, "dist")
DIST_DATA_DIR = os.path.join(DIST_DIR, "data")
DIST_INDEX_PATH = os.path.join(DIST_DATA_DIR, "songs.index.json")

def resolve_songs_dir() -> str:
    configured_dir = os.environ.get("SONGS_DIR")
    if configured_dir:
        return os.path.abspath(configured_dir)

    local_dir = os.path.join(BASE_DIR, "songs")
    if os.path.isdir(local_dir):
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

def rebuild_songs():
    # Only rebuild songs, no deployment
    try:
        # In production, rebuild to dist/data directly for instant updates
        env = os.environ.copy()
        if os.path.exists(DIST_DIR):
            env["SONGS_OUTPUT_DIR"] = DIST_DATA_DIR
        env["SONGS_DIR"] = SONGS_DIR
        
        subprocess.run(["npm", "run", "build:songs"], cwd=BASE_DIR, check=True, env=env)
        print("Build script executed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error during build: {e}")

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

        subprocess.run(["git", "add", "--", rel_path], cwd=CONTENT_REPO_DIR, check=True)

        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--", rel_path],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if not staged:
            message = f"No content repo changes to sync for {rel_path}."
            print(message)
            return {"ok": True, "pushed": False, "message": message}

        commit_message = f"{action}: {os.path.basename(rel_path)} via Holy Songs editor"
        user_name, user_email = get_git_identity()
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

        # The content repository can move independently of the running editor,
        # for example if another browser session or maintainer pushes first.
        # Rebase this editor commit onto the current branch head before
        # pushing so one remote-side commit does not wedge every later save.
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
        subprocess.run(
            ["git", "push", push_target, f"HEAD:{branch}"],
            cwd=CONTENT_REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        )
        message = f"Content repo synced successfully for {rel_path}."
        print(message)
        return {"ok": True, "pushed": True, "message": message}
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        stdout = (error.stdout or "").strip()
        message = f"Content repo sync failed for {changed_path}: {stderr or stdout or error}"
        print(message)
        return {"ok": False, "pushed": False, "message": message}


@app.on_event("startup")
def ensure_generated_song_data():
    if os.path.exists(SONGS_DIR) and not os.path.exists(DIST_INDEX_PATH):
        rebuild_songs()

def sanitize_filename(title: str) -> str:
    """Convert song title to a valid filename"""
    # Convert to lowercase and replace spaces with hyphens
    filename = title.lower().strip()
    # Remove special characters, keep only alphanumeric, hyphens, and spaces
    filename = re.sub(r'[^a-z0-9\s-]', '', filename)
    # Replace multiple spaces/hyphens with single hyphen
    filename = re.sub(r'[\s-]+', '-', filename)
    # Remove leading/trailing hyphens
    filename = filename.strip('-')
    return filename if filename else 'untitled-song'

def validate_song_path(filepath: str):
    """Ensure the file path is within the songs directory"""
    if os.path.commonpath([os.path.abspath(filepath), SONGS_DIR]) != SONGS_DIR:
        raise HTTPException(status_code=403, detail="Invalid file path")

class SongContent(BaseModel):
    content: str

class ReviewedRequest(BaseModel):
    song_id: str
    reviewed: bool

@app.get("/api/songs")
def list_songs():
    songs = []
    if os.path.exists(SONGS_DIR):
        for filename in os.listdir(SONGS_DIR):
            if filename.endswith(".pro"):
                songs.append(filename)
    return {"songs": sorted(songs)}

@app.post("/api/songs/create")
def create_song(song: SongContent, _admin=Depends(verify_admin)):
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
    
    # Trigger rebuild synchronously for instant updates
    rebuild_songs()
    sync = sync_content_repo(filepath, "Create song")
    
    # The ID is the base filename without extension
    song_id = os.path.splitext(filename)[0]
    
    return {"message": "Song created successfully", "filename": filename, "id": song_id, "sync": sync}

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

@app.post("/api/songs/{filename}")
@app.put("/api/songs/{filename}")
def update_song(filename: str, song: SongContent, _admin=Depends(verify_admin)):
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
    
    # Trigger rebuild synchronously
    rebuild_songs()
    sync = sync_content_repo(filepath, "Update song")
    
    return {"message": "Song updated successfully", "filename": filename, "sync": sync}

@app.delete("/api/songs/{filename}")
def delete_song(filename: str, _admin=Depends(verify_admin)):
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
    
    # Trigger rebuild synchronously
    rebuild_songs()
    sync = sync_content_repo(filepath, "Delete song")
    
    return {"message": "Song deleted successfully", "sync": sync}

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

def update_reviewed_in_file(filepath: str, reviewed: bool) -> bool:
    """Update or add {reviewed: } directive in a .pro file"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    reviewed_value = "true" if reviewed else "false"
    
    # Check if {reviewed: } already exists
    if re.search(r'\{reviewed:\s*[^}]+\}', content, re.IGNORECASE):
        # Update existing
        new_content = re.sub(
            r'\{reviewed:\s*[^}]+\}',
            f'{{reviewed: {reviewed_value}}}',
            content,
            flags=re.IGNORECASE
        )
    else:
        # Add after {key: } or {title: }
        key_match = re.search(r'(\{key:\s*[^}]+\})', content, re.IGNORECASE)
        if key_match:
            # Add after key
            new_content = content.replace(
                key_match.group(1),
                f'{key_match.group(1)}\n{{reviewed: {reviewed_value}}}'
            )
        else:
            # Add after title
            title_match = re.search(r'(\{title:\s*[^}]+\})', content, re.IGNORECASE)
            if title_match:
                new_content = content.replace(
                    title_match.group(1),
                    f'{title_match.group(1)}\n{{reviewed: {reviewed_value}}}'
                )
            else:
                # Add at the beginning
                new_content = f'{{reviewed: {reviewed_value}}}\n{content}'
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    
    return True

@app.post("/api/reviewed")
def update_reviewed(request: ReviewedRequest, _admin=Depends(verify_admin)):
    """Update the reviewed status of a song in its .pro file"""
    filepath = find_song_file_by_id(request.song_id)
    
    if not filepath:
        raise HTTPException(status_code=404, detail=f"Song with ID '{request.song_id}' not found")
    
    try:
        update_reviewed_in_file(filepath, request.reviewed)
        # Trigger rebuild synchronously
        rebuild_songs()
        sync = sync_content_repo(filepath, "Update reviewed status")
        return {"success": True, "message": "Reviewed status updated", "reviewed": request.reviewed, "sync": sync}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount the static files from dist/ directory (production)
if os.path.exists(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
