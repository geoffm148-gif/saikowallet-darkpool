import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface InputProps {
  /** Input label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value: string;
  onChange: (value: string) => void;
  /** Error message — shown below input in red */
  error?: string;
  /** Helper/hint text */
  hint?: string;
  /** Monospace variant for addresses, hashes, seed phrases */
  monospace?: boolean;
  /** Password / hidden input */
  type?: 'text' | 'password' | 'number' | 'email';
  /** Right-side adornment (e.g., MAX button) */
  rightAdornment?: React.ReactNode;
  disabled?: boolean;
  maxLength?: number;
  autoComplete?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  rows?: number;
  style?: CSSProperties;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/** Text input with label, error state, and monospace variant */
export function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  hint,
  monospace = false,
  type = 'text',
  rightAdornment,
  disabled = false,
  maxLength,
  autoComplete,
  autoFocus,
  multiline = false,
  rows = 4,
  style,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: InputProps): React.ReactElement {
  const [isFocused, setIsFocused] = React.useState(false);
  const inputId = id ?? (label !== undefined ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = inputId !== undefined ? `${inputId}-error` : undefined;
  const hintId = inputId !== undefined ? `${inputId}-hint` : undefined;

  const hasError = error !== undefined && error.length > 0;
  const borderColor = hasError
    ? COLORS.error
    : isFocused
    ? COLORS.borderFocus
    : COLORS.border;

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: SPACING[2],
    ...style,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
    letterSpacing: '0.04em',
  };

  const inputWrapperStyle: CSSProperties = {
    display: 'flex',
    alignItems: multiline ? 'flex-start' : 'center',
    backgroundColor: COLORS.surface,
    border: `1px solid ${borderColor}`,
    borderRadius: RADIUS.md,
    transition: 'border-color 0.15s ease',
    overflow: 'hidden',
  };

  const sharedInputStyle: CSSProperties = {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: disabled ? COLORS.textDisabled : COLORS.textPrimary,
    fontFamily: monospace ? FONT_FAMILY.mono : FONT_FAMILY.sans,
    fontSize: FONT_SIZE.base,
    padding: `${SPACING[3]} ${SPACING[4]}`,
    lineHeight: '1.5',
    cursor: disabled ? 'not-allowed' : 'text',
    resize: multiline ? 'vertical' : 'none',
    width: '100%',
  };

  const helperStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: hasError ? COLORS.error : COLORS.textMuted,
    lineHeight: '1.4',
  };

  const describedByIds = [
    hasError && errorId,
    hint !== undefined && hintId,
    ariaDescribedBy,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div style={containerStyle}>
      {label !== undefined && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      )}
      <div style={inputWrapperStyle}>
        {multiline ? (
          <textarea
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            rows={rows}
            aria-label={ariaLabel}
            aria-describedby={describedByIds}
            aria-invalid={hasError}
            style={{ ...sharedInputStyle, paddingTop: SPACING[3] }}
          />
        ) : (
          <input
            id={inputId}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            aria-describedby={describedByIds}
            aria-invalid={hasError}
            style={sharedInputStyle}
          />
        )}
        {rightAdornment !== undefined && (
          <div
            style={{
              padding: `0 ${SPACING[3]}`,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {rightAdornment}
          </div>
        )}
      </div>
      {hasError && (
        <span id={errorId} style={helperStyle} role="alert">
          {error}
        </span>
      )}
      {hint !== undefined && !hasError && (
        <span id={hintId} style={helperStyle}>
          {hint}
        </span>
      )}
    </div>
  );
}
