import re


def sanitize_filename(title: str) -> str:
    """Convert a song title to a safe .pro filename stem."""
    filename = title.lower().strip()
    filename = re.sub(r"[^a-z0-9\s-]", "", filename)
    filename = re.sub(r"[\s-]+", "-", filename)
    filename = filename.strip("-")
    return filename if filename else "untitled-song"
