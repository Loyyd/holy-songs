import pytest

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
