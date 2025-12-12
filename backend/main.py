from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import subprocess
import re

app = FastAPI()

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
SONGS_DIR = os.path.join(BASE_DIR, "songs")

def run_build_script():
    # Run the npm build script
    try:
        subprocess.run(["npm", "run", "build:songs"], cwd=BASE_DIR, check=True)
        print("Build script executed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error running build script: {e}")

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

class SongContent(BaseModel):
    content: str

@app.get("/api/songs")
def list_songs():
    songs = []
    if os.path.exists(SONGS_DIR):
        for filename in os.listdir(SONGS_DIR):
            if filename.endswith(".pro"):
                songs.append(filename)
    return {"songs": sorted(songs)}

@app.post("/api/songs/create")
def create_song(song: SongContent, background_tasks: BackgroundTasks):
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
    if os.path.commonpath([os.path.abspath(filepath), SONGS_DIR]) != SONGS_DIR:
        raise HTTPException(status_code=403, detail="Invalid file path")
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(song.content)
    
    # Trigger build in background
    background_tasks.add_task(run_build_script)
    
    return {"message": "Song created successfully", "filename": filename}

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
def save_song(filename: str, song: SongContent, background_tasks: BackgroundTasks):
    # Basic security check to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
         raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(SONGS_DIR, filename)
    
    # Ensure we are writing to the songs directory
    if os.path.commonpath([os.path.abspath(filepath), SONGS_DIR]) != SONGS_DIR:
         raise HTTPException(status_code=403, detail="Invalid file path")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(song.content)
    
    # Trigger build in background
    background_tasks.add_task(run_build_script)
    
    return {"message": "Song saved successfully and build triggered"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
