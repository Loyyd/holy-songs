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
  const [mode, setMode] = useState<'visual' | 'raw'>('visual');
  
  const lines = source.split(/\r?\n/);

  const handleLineChange = (index: number, newLine: string) => {
    const newLines = [...lines];
    newLines[index] = newLine;
    setSource(newLines.join('\n'));
  };

  return (
    <div className="song-editor">
      <div className="editor-toolbar">
        <div className="toolbar-group">
            <button onClick={() => setMode(m => m === 'visual' ? 'raw' : 'visual')}>
                {mode === 'visual' ? 'Raw Text' : 'Visual Editor'}
            </button>
        </div>
        <div className="toolbar-group">
            <button onClick={() => onSave(source)}>Save & Apply</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
      
      {mode === 'visual' ? (
        <div className="editor-content">
            {lines.map((line, i) => (
            <LineEditor
                key={i}
                line={line}
                onChange={(newLine) => handleLineChange(i, newLine)}
            />
            ))}
        </div>
      ) : (
        <textarea
            className="raw-editor"
            value={source}
            onChange={e => setSource(e.target.value)}
            spellCheck={false}
        />
      )}

      <style>{`
        .song-editor {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          background: #1e1e1e;
          color: #e5e5e5;
          padding: 1rem;
          border-radius: 8px;
        }
        .editor-toolbar {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
        }
        .toolbar-group {
            display: flex;
            gap: 0.5rem;
        }
        .editor-content {
          font-family: monospace;
          font-size: 14px;
          overflow-x: auto;
          max-height: 70vh;
          overflow-y: auto;
        }
        .raw-editor {
            font-family: monospace;
            font-size: 14px;
            background: rgba(0,0,0,0.2);
            color: inherit;
            border: 1px solid rgba(255,255,255,0.1);
            padding: 1rem;
            min-height: 400px;
            resize: vertical;
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
          pointer-events: auto;
          cursor: text; /* Indicate clickable */
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
          color: #e5e5e5;
          padding: 0;
          margin: 0;
          outline: none;
          letter-spacing: 0;
        }
        .lyrics-input:focus {
          background: rgba(255, 255, 255, 0.05);
        }
        .drop-indicator {
          position: absolute;
          top: -1.5em;
          width: 2px;
          height: 2.8em;
          background-color: #fbbf24;
          pointer-events: none;
          z-index: 5;
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
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  
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
    
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const newCharIndex = Math.max(0, Math.min(Math.round(offsetX / charWidth), lyrics.length));
    
    setDropIndex(newCharIndex);
  };
  
  const handleDragLeave = () => {
    setDropIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropIndex(null);
    const chordIdxStr = e.dataTransfer.getData('chordIndex');
    if (!chordIdxStr) return;
    
    const chordArrIndex = parseInt(chordIdxStr, 10);
    const chordToMove = chords[chordArrIndex];
    
    if (!containerRef.current) return;
    
    // Calculate new character index based on mouse position
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    
    const newCharIndex = Math.max(0, Math.min(Math.round(offsetX / charWidth), lyrics.length));
    
    // Update chords array
    const newChords = [...chords];
    newChords[chordArrIndex] = { ...chordToMove, index: newCharIndex };
    
    reconstructLine(lyrics, newChords);
  };

  const handleChordClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const chord = chords[index];
    const newName = prompt('Edit chord (clear to delete):', chord.name);
    if (newName === null) return; // Cancelled
    
    const newChords = [...chords];
    if (newName.trim() === '') {
        // Delete chord
        newChords.splice(index, 1);
    } else {
        newChords[index] = { ...chord, name: newName };
    }
    reconstructLine(lyrics, newChords);
  };

  const handleLayerClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const charIndex = Math.max(0, Math.min(Math.round(offsetX / charWidth), lyrics.length));
    
    const name = prompt('Add chord:');
    if (name) {
        const newChords = [...chords, { name, index: charIndex, originalTokenIndex: -1 }];
        reconstructLine(lyrics, newChords);
    }
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
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropIndex !== null && (
        <div 
            className="drop-indicator" 
            style={{ left: `${dropIndex * charWidth}px` }}
        />
      )}
      <div 
        className="chords-layer"
        onClick={handleLayerClick}
      >
        {chords.map((chord, i) => (
          <div
            key={i}
            className="chord-pill"
            style={{ left: `${chord.index * charWidth}px` }}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onClick={(e) => handleChordClick(e, i)}
            title="Drag to move, click to edit"
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
