import React, { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = useCallback((cmd: Command) => {
    onClose();
    cmd.action();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) executeCommand(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filtered, selectedIndex, executeCommand, onClose]);

  if (!isOpen) return null;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '20vh',
    zIndex: 9999,
  };

  const panelStyle: CSSProperties = {
    width: '100%',
    maxWidth: '520px',
    backgroundColor: '#1A1A1A',
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: `${SPACING[4]} ${SPACING[5]}`,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.base,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          style={inputStyle}
        />
        <div style={{ maxHeight: '320px', overflowY: 'auto', padding: SPACING[1] }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: SPACING[4],
              textAlign: 'center',
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
            }}>
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: `${SPACING[3]} ${SPACING[4]}`,
                  backgroundColor: i === selectedIndex ? 'rgba(227,27,35,0.12)' : 'transparent',
                  border: 'none',
                  borderRadius: RADIUS.sm,
                  color: i === selectedIndex ? COLORS.textPrimary : COLORS.textSecondary,
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: FONT_WEIGHT.medium,
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                }}
              >
                <span>{cmd.label}</span>
                {cmd.shortcut && (
                  <span style={{
                    fontFamily: FONT_FAMILY.mono,
                    fontSize: FONT_SIZE.xs,
                    color: COLORS.textMuted,
                    backgroundColor: COLORS.surface,
                    padding: `2px ${SPACING[2]}`,
                    borderRadius: '4px',
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
