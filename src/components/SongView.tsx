import type { SongData } from '../types';
import { transposeTokens } from '../lib/chords';

interface SongViewProps {
  song: SongData;
  transpose: number;
  highlightQuery?: string;
  isContextSensitive?: boolean;
}

export function SongView({ song, transpose, highlightQuery, isContextSensitive }: SongViewProps) {
  if (!song || !song.sections) return <div className="song">No content</div>;

  const highlightLyric = (lyric: string) => {
    if (!highlightQuery || !isContextSensitive || lyric.trim() === '') {
      return lyric;
    }

    const regex = new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = lyric.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} style={{ backgroundColor: 'rgba(216, 152, 16, 0.28)', color: 'var(--brand-blue)', padding: '2px 0' }}>{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="song">
      {song.sections.map((section, sectionIdx) => (
        <div key={`${song.id}-section-${sectionIdx}`}>
          <div className="section-title">{section.name}</div>
          {section.lines.map((line, idx) => {
            const transposedTokens = transposeTokens(line.tokens, transpose);
            const hasAnyChord = transposedTokens.some((token) => token.chord);
            const mergedTokens: { chord: string | null; lyric: string }[] = [];
            let pendingChord: string | null = null;

            for (const token of transposedTokens) {
              if (token.chord && !token.lyric) {
                pendingChord = token.chord;
              } else if (pendingChord) {
                mergedTokens.push({ chord: pendingChord, lyric: token.lyric || '' });
                pendingChord = null;
              } else {
                mergedTokens.push({ chord: token.chord, lyric: token.lyric || '' });
              }
            }

            if (pendingChord) {
              mergedTokens.push({ chord: pendingChord, lyric: '' });
            }

            return (
              <div className={`line ${hasAnyChord ? 'has-chords' : ''}`} key={`${song.id}-${sectionIdx}-line-${idx}`}>
                {mergedTokens.map((token, i) => {
                  const chordLength = token.chord ? token.chord.length : 0;
                  const lyricLength = token.lyric.length;
                  const needsPadding = chordLength > lyricLength;
                  const paddingAmount = needsPadding ? chordLength - lyricLength : 0;

                  return (
                    <span key={i} className="token">
                      {token.chord && <span className="chord">{token.chord}</span>}
                      <span className="lyric">
                        {highlightLyric(token.lyric)}
                        {needsPadding && <span className="chord-spacer">{'\u00A0'.repeat(paddingAmount)}</span>}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
