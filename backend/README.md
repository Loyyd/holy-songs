# Holy Songs Backend

This is a FastAPI backend to edit the song files.

## Setup

1.  Create a virtual environment (if not already created):
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

## Running the Server

Run the server with:

```bash
python main.py
```

The API will be available at `http://localhost:8000`.

## API Endpoints

*   `GET /api/songs`: List all songs.
*   `GET /api/songs/{filename}`: Get the content of a song.
*   `POST /api/songs/{filename}`: Update the content of a song.
    *   Body: `{"content": "new content..."}`
    *   This will also trigger `npm run build:songs` in the background to update the frontend data.
