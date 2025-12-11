import React, { useState, useEffect, useRef } from 'react';
import { parseTokens, serializeTokens } from '../lib/parseChordPro';
import { SongLineToken } from '../types';

interface SongEditorProps {
  initialSource: string;
  onSave: (source: string) => void;
  onCancel: () => void;
}

export function SongEditor({ initialSource, onSave, onCancel }: SongEditorProps) {
  const [source, setSource] = useState(initialSource);
  const lines = source.split(/\r?\n/);

  const handleLineChange = (index: number, newLine: string) => {
    const newLines = [...lines];
    newLines[index] = newLine;
    setSource(newLines.join('\n'));
  };

  return (
    <div className="song-editor">
      <div className="editor-toolbar">
        <button onClick={() => onSave(source)}>Save & Apply</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <div className="editor-content">
        {lines.map((line, i) => (
          <LineEditor
            key={i}
            line={line}
            onChange={(newLine) => handleLineChange(i, newLine)}
          />
        ))}
      </div>
      <style>{`
        .song-editor {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          background: #1e1e1e;
          padding: 1rem;
          border-radius: 8px;
        }
        .editor-content {
          font-family: monospace;
          font-size: 14px;
          overflow-x: auto;
        }
        .line-editor {
          position: relative;
          margin-bottom: 2.5em; /* Space for chords */
          min-height: 1.5em;
        }
        .chords-layer {
          position: absolute;
          top: -1.5em;
          left: 0;
          width: 100%;
          height: 1.5em;
          pointer-events: none; /* Let clicks pass through to input if needed, but chords need pointer-events */
        }
        .chord-pill {
          position: absolute;
          background: #fbbf24;
          color: #000;
          padding: 0 4px;
          border-radius: 4px;
          font-size: 0.9em;
          cursor: grab;
          pointer-events: auto;
          transform: translateX(-50%); /* Center on the character index */
          white-space: nowrap;
          z-index: 10;
          user-select: none;
        }
        .chord-pill:active {
          cursor: grabbing;
        }
        .lyrics-input {
          font-family: monospace;
          font-size: 14px;
          width: 100%;
          background: transparent;
          border: none;
          color: inherit;
          padding: 0;
          margin: 0;
          outline: none;
          letter-spacing: 0;
        }
        .lyrics-input:focus {
          background: rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </div>
  );
}

interface LineEditorProps {
  line: string;
  onChange: (newLine: string) => void;
}

function LineEditor({ line, onChange }: LineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parse line into lyrics and chords with positions
  const tokens = parseTokens(line);
  
  // Calculate lyrics and chord positions
  let lyrics = '';
  const chords: { name: string; index: number; originalTokenIndex: number }[] = [];
  
  let currentLen = 0;
  tokens.forEach((token, i) => {
    if (token.chord) {
      chords.push({ name: token.chord, index: currentLen, originalTokenIndex: i });
    }
    lyrics += token.lyric;
    currentLen += token.lyric.length;
  });

  const handleLyricsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLyrics = e.target.value;
    reconstructLine(newLyrics, chords);
  };

  const reconstructLine = (newLyrics: string, currentChords: typeof chords) => {
    // Sort chords by index
    const sortedChords = [...currentChords].sort((a, b) => a.index - b.index);
    
    const newTokens: SongLineToken[] = [];
    let lastIndex = 0;
    
    // Group chords by index to handle multiple chords at same position
    const chordsByIndex = new Map<number, string[]>();
    sortedChords.forEach(c => {
      const idx = Math.min(c.index, newLyrics.length); // Clamp to length
      const list = chordsByIndex.get(idx) || [];
      list.push(c.name);
      chordsByIndex.set(idx, list);
    });

    // Iterate through the lyrics and insert chords
    // We need to handle indices from 0 to length
    const allIndices = new Set([...chordsByIndex.keys(), newLyrics.length]);
    const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);

    // If 0 is not in sortedIndices (no chords at start), we start from 0
    if (sortedIndices.length === 0 || sortedIndices[0] !== 0) {
        sortedIndices.unshift(0);
    }
    
    // Actually, a simpler way:
    // Iterate through sorted unique indices where chords exist
    // Slice lyrics between indices
    
    let currentIndex = 0;
    
    // Check if there are chords at 0
    if (chordsByIndex.has(0)) {
        const chordsAtZero = chordsByIndex.get(0)!;
        // Create tokens for these chords. 
        // The first ones have empty lyrics, the last one takes the lyric segment?
        // Or we just push them.
        
        // Example: [A][B]Hello
        // Token: {chord: "A", lyric: ""}, {chord: "B", lyric: "..."}
        
        chordsAtZero.forEach((chord, i) => {
            if (i < chordsAtZero.length - 1) {
                newTokens.push({ chord, lyric: '' });
            } else {
                // The last chord at this position will be attached to the next lyric segment
                // But we handle that in the loop below
            }
        });
    }

    // This logic is getting complicated.
    // Let's try a different approach for reconstruction.
    // We build the string directly? No, we need tokens for `serializeTokens`? 
    // Actually `serializeTokens` is just a helper. We can build the string directly.
    
    let result = '';
    for (let i = 0; i <= newLyrics.length; i++) {
        if (chordsByIndex.has(i)) {
            const chordsAtI = chordsByIndex.get(i)!;
            chordsAtI.forEach(c => result += `[${c}]`);
        }
        if (i < newLyrics.length) {
            result += newLyrics[i];
        }
    }
    
    onChange(result);
  };

  const handleDragStart = (e: React.DragEvent, chordIndex: number) => {
    e.dataTransfer.setData('chordIndex', chordIndex.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const chordIdxStr = e.dataTransfer.getData('chordIndex');
    if (!chordIdxStr) return;
    
    const chordArrIndex = parseInt(chordIdxStr, 10);
    const chordToMove = chords[chordArrIndex];
    
    if (!containerRef.current) return;
    
    // Calculate new character index based on mouse position
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    
    // Assuming monospace font with approx 8.4px width (depends on font size)
    // Better to measure a character
    const charWidth = 8.4; // Approximation for 14px monospace. 
    // To be precise, we should measure it.
    
    // Let's measure 'M' width dynamically
    const measureSpan = document.createElement('span');
    measureSpan.style.fontFamily = 'monospace';
    measureSpan.style.fontSize = '14px';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.textContent = 'M';
    document.body.appendChild(measureSpan);
    const exactCharWidth = measureSpan.getBoundingClientRect().width;
    document.body.removeChild(measureSpan);
    
    const newCharIndex = Math.max(0, Math.min(Math.round(offsetX / exactCharWidth), lyrics.length));
    
    // Update chords array
    const newChords = [...chords];
    newChords[chordArrIndex] = { ...chordToMove, index: newCharIndex };
    
    reconstructLine(lyrics, newChords);
  };

  // Measure char width on mount
  const [charWidth, setCharWidth] = useState(8.4);
  useEffect(() => {
    const measureSpan = document.createElement('span');
    measureSpan.style.fontFamily = 'monospace';
    measureSpan.style.fontSize = '14px';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.textContent = 'M';
    document.body.appendChild(measureSpan);
    const width = measureSpan.getBoundingClientRect().width;
    setCharWidth(width);
    document.body.removeChild(measureSpan);
  }, []);

  return (
    <div 
      className="line-editor" 
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="chords-layer">
        {chords.map((chord, i) => (
          <div
            key={i}
            className="chord-pill"
            style={{ left: `${chord.index * charWidth}px` }}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            title="Drag to move"
          >
            {chord.name}
          </div>
        ))}
      </div>
      <input
        className="lyrics-input"
        value={lyrics}
        onChange={handleLyricsChange}
        spellCheck={false}
      />
    </div>
  );
}
