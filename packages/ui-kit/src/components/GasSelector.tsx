import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export type GasSpeed = 'slow' | 'normal' | 'fast';

export interface GasOption {
  speed: GasSpeed;
  label: string;
  estimatedFee: string;
  estimatedFeeUsd?: string;
  estimatedTime: string;
}

export interface GasSelectorProps {
  options: GasOption[];
  selectedSpeed: GasSpeed;
  onChange: (speed: GasSpeed) => void;
  style?: CSSProperties;
}

const SPEED_ICON: Record<GasSpeed, string> = {
  slow: '🐢',
  normal: '🚶',
  fast: '⚡',
};

const SPEED_COLOR: Record<GasSpeed, string> = {
  slow: COLORS.textMuted,
  normal: COLORS.textSecondary,
  fast: COLORS.warning,
};

/** Gas speed picker — slow / normal / fast with estimated costs */
export function GasSelector({
  options,
  selectedSpeed,
  onChange,
  style,
}: GasSelectorProps): React.ReactElement {
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

  const optionsRowStyle: CSSProperties = {
    display: 'flex',
    gap: SPACING[3],
  };

  const getOptionStyle = (speed: GasSpeed): CSSProperties => {
    const isSelected = speed === selectedSpeed;
    return {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: SPACING[1],
      padding: `${SPACING[4]} ${SPACING[3]}`,
      backgroundColor: isSelected ? 'rgba(229,57,53,0.08)' : COLORS.surface,
      border: `1px solid ${isSelected ? COLORS.primary : COLORS.border}`,
      borderRadius: RADIUS.md,
      cursor: 'pointer',
      transition: 'border-color 0.15s ease, background-color 0.15s ease',
      outline: 'none',
    };
  };

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>Network Fee</span>
      <div style={optionsRowStyle}>
        {options.map((option) => {
          const isSelected = option.speed === selectedSpeed;
          return (
            <button
              key={option.speed}
              style={getOptionStyle(option.speed)}
              onClick={() => onChange(option.speed)}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${option.label} gas speed: ${option.estimatedFee}, ${option.estimatedTime}`}
            >
              <span style={{ fontSize: '20px' }} aria-hidden="true">
                {SPEED_ICON[option.speed]}
              </span>
              <span
                style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: isSelected ? FONT_WEIGHT.semibold : FONT_WEIGHT.medium,
                  color: isSelected ? COLORS.primary : SPEED_COLOR[option.speed],
                }}
              >
                {option.label}
              </span>
              <span
                style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: FONT_WEIGHT.medium,
                  color: COLORS.textPrimary,
                }}
              >
                {option.estimatedFee}
              </span>
              {option.estimatedFeeUsd !== undefined && (
                <span
                  style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.xs,
                    color: COLORS.textMuted,
                  }}
                >
                  {option.estimatedFeeUsd}
                </span>
              )}
              <span
                style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.textMuted,
                }}
              >
                ~{option.estimatedTime}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Default gas options for mock/placeholder use */
export const DEFAULT_GAS_OPTIONS: GasOption[] = [
  {
    speed: 'slow',
    label: 'Slow',
    estimatedFee: '0.0008 ETH',
    estimatedFeeUsd: '~$2.40',
    estimatedTime: '5 min',
  },
  {
    speed: 'normal',
    label: 'Normal',
    estimatedFee: '0.0012 ETH',
    estimatedFeeUsd: '~$3.60',
    estimatedTime: '1 min',
  },
  {
    speed: 'fast',
    label: 'Fast',
    estimatedFee: '0.0018 ETH',
    estimatedFeeUsd: '~$5.40',
    estimatedTime: '15 sec',
  },
];
