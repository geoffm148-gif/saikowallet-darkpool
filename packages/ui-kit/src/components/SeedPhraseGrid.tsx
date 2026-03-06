import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface SeedPhraseGridProps {
  /** Array of seed phrase words (12 or 24) */
  words: readonly string[];
  /**
   * Display mode:
   * - 'display': show all words with numbers (for backup)
   * - 'verify': clickable words user must select in order
   * - 'input': blank word slots user must fill in
   */
  mode?: 'display' | 'verify' | 'input';
  /** In 'verify' mode — words the user has selected so far */
  selectedWords?: string[];
  /** In 'verify' mode — called when user clicks a word */
  onWordSelect?: (word: string, index: number) => void;
  /** In 'input' mode — current input values per slot */
  inputValues?: string[];
  /** In 'input' mode — called when a slot changes */
  onInputChange?: (index: number, value: string) => void;
  /** Indices of correctly verified words (for feedback) */
  correctIndices?: number[];
  /** Indices of incorrectly verified words (for feedback) */
  incorrectIndices?: number[];
  /** Blur/hide words (for security when screen might be recorded) */
  blurred?: boolean;
  style?: CSSProperties;
}

function WordCell({
  index,
  word,
  mode,
  isSelected,
  isCorrect,
  isIncorrect,
  blurred,
  inputValue,
  onSelect,
  onInputChange,
}: {
  index: number;
  word: string;
  mode: 'display' | 'verify' | 'input';
  isSelected?: boolean;
  isCorrect?: boolean;
  isIncorrect?: boolean;
  blurred?: boolean;
  inputValue?: string;
  onSelect?: () => void;
  onInputChange?: (val: string) => void;
}): React.ReactElement {
  const wordNumber = index + 1;

  let borderColor: string = COLORS.border;
  if (isCorrect === true) borderColor = COLORS.success;
  if (isIncorrect === true) borderColor = COLORS.error;
  if (isSelected === true) borderColor = COLORS.primary;

  let bgColor: string = COLORS.surface;
  if (isCorrect === true) bgColor = 'rgba(67,160,71,0.1)';
  if (isIncorrect === true) bgColor = 'rgba(229,57,53,0.1)';
  if (isSelected === true && mode === 'verify') bgColor = 'rgba(229,57,53,0.1)';

  const cellStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius: RADIUS.md,
    padding: `${SPACING[2]} ${SPACING[3]}`,
    cursor: mode === 'verify' ? 'pointer' : 'default',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
    userSelect: 'none',
  };

  const numberStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    minWidth: '18px',
    flexShrink: 0,
    textAlign: 'right',
  };

  const wordStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
    flex: 1,
    filter: blurred === true ? 'blur(6px)' : 'none',
    userSelect: blurred === true ? 'none' : 'text',
    transition: 'filter 0.2s ease',
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
    padding: 0,
    lineHeight: '1.4',
  };

  if (mode === 'verify') {
    return (
      <div style={cellStyle} onClick={onSelect} role="button" aria-pressed={isSelected}>
        <span style={numberStyle}>{wordNumber}.</span>
        <span style={wordStyle}>{word}</span>
      </div>
    );
  }

  if (mode === 'input') {
    return (
      <div style={cellStyle}>
        <span style={numberStyle}>{wordNumber}.</span>
        <input
          type="text"
          value={inputValue ?? ''}
          onChange={(e) => onInputChange?.(e.target.value)}
          style={inputStyle}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="word"
          aria-label={`Seed word ${wordNumber}`}
        />
      </div>
    );
  }

  return (
    <div style={cellStyle}>
      <span style={numberStyle}>{wordNumber}.</span>
      <span style={wordStyle}>{word}</span>
    </div>
  );
}

/** 12 or 24 word seed phrase grid — display, verify, or input modes */
export function SeedPhraseGrid({
  words,
  mode = 'display',
  selectedWords = [],
  onWordSelect,
  inputValues,
  onInputChange,
  correctIndices = [],
  incorrectIndices = [],
  blurred = false,
  style,
}: SeedPhraseGridProps): React.ReactElement {
  const columns = words.length === 24 ? 3 : 3;

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: SPACING[3],
    ...style,
  };

  return (
    <div style={gridStyle}>
      {words.map((word, i) => (
        <WordCell
          key={i}
          index={i}
          word={word}
          mode={mode}
          isSelected={selectedWords.includes(word)}
          isCorrect={correctIndices.includes(i)}
          isIncorrect={incorrectIndices.includes(i)}
          blurred={blurred}
          inputValue={inputValues?.[i]}
          onSelect={() => onWordSelect?.(word, i)}
          onInputChange={(val) => onInputChange?.(i, val)}
        />
      ))}
    </div>
  );
}
