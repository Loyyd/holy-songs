# Chord Songs - Deployment Guide

1. **Build the Frontend assets** (Compiles React/TypeScript to `dist/`):
   ```bash
   npm install
   npm run build
   ```

2. **Start the services**:
   ```bash
   docker-compose up -d --build
   ```
   *The website will be available at `http://localhost` (Port 80).*

---

## 🛠️ How to Update

### 1. Update the Backend (API or Build Scripts)
If you modified files in `backend/`, `scripts/`, or `Dockerfile.backend`:
```bash
git pull
docker-compose up -d --build backend
```
*The frontend stays online while the backend restarts.*

### 2. Update the Frontend (UI / React)
If you modified files in `src/` or `index.html`:
```bash
git pull
npm run build
```
*Nginx serves the new `dist/` files immediately. No Docker restart required.*

### 3. Update Song Files
If you added or edited `.pro` files in the sibling `holy-songs-content/songs/` repo:
```bash
cd ../holy-songs-content && git pull
cd ../holy-songs
git pull
npm run build:songs
```
*The backend also handles this automatically when you save via the web editor.*

---

## 📂 Project Structure
* **`backend/`**: Python FastAPI logic.
* **`../holy-songs-content/songs/`**: Your source ChordPro files.
* **`dist/`**: The compiled frontend served by Nginx.
* **`nginx.conf`**: Routing for the web server and API proxy.

## Content Repo

The app now expects song source files in a separate sibling repository:

```text
GitHub/
  holy-songs/
  holy-songs-content/
    songs/
```

By default the app resolves songs from:

1. `SONGS_DIR`, if set
2. local `songs/`, if present
3. `../holy-songs-content/songs`
