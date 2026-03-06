import React, { useRef, useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import type { SubWallet } from '@saiko-wallet/wallet-core';

const AVATAR_COLORS = ['#E31B23', '#627EEA', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4'];

function getAccountColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length] ?? '#E31B23';
}

function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Trigger Button ────────────────────────────────────────────────────────────

interface TriggerProps {
  account: SubWallet;
  onClick: () => void;
}

export function AccountSwitcherTrigger({ account, onClick }: TriggerProps): React.ReactElement {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[2],
    padding: `${SPACING[1]} ${SPACING[3]}`,
    background: 'none',
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    cursor: 'pointer',
    outline: 'none',
    color: COLORS.textPrimary,
  };

  return (
    <motion.button
      style={style}
      onClick={onClick}
      whileHover={{ borderColor: COLORS.primary }}
      whileTap={{ scale: 0.97 }}
    >
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: getAccountColor(account.index),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}>
        {account.name[0]?.toUpperCase() ?? '?'}
      </div>
      <span style={{
        fontFamily: FONT_FAMILY.sans,
        fontSize: FONT_SIZE.sm,
        fontWeight: FONT_WEIGHT.semibold,
        color: COLORS.textPrimary,
      }}>
        {account.name}
      </span>
      <span style={{ fontSize: '10px', color: COLORS.textMuted }}>▾</span>
    </motion.button>
  );
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  accounts: SubWallet[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onCreateNew: () => void;
  onRename: (index: number, newName: string) => void;
  onRemove: (index: number) => void;
}

export function AccountSwitcherDropdown({
  open,
  onClose,
  accounts,
  activeIndex,
  onSelect,
  onCreateNew,
  onRename,
  onRemove,
}: DropdownProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    width: '280px',
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 100,
    overflow: 'hidden',
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[3],
    padding: `${SPACING[3]} ${SPACING[4]}`,
    cursor: 'pointer',
    borderBottom: `1px solid ${COLORS.divider}`,
    position: 'relative',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          style={dropdownStyle}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          <div style={{
            padding: `${SPACING[3]} ${SPACING[4]}`,
            borderBottom: `1px solid ${COLORS.border}`,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.semibold,
            color: COLORS.textMuted,
          }}>
            Accounts
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {accounts.map((acct) => (
              <AccountRow
                key={acct.index}
                account={acct}
                isActive={acct.index === activeIndex}
                onSelect={() => { onSelect(acct.index); onClose(); }}
                onRename={(newName) => onRename(acct.index, newName)}
                onRemove={acct.index === 0 ? undefined : () => onRemove(acct.index)}
              />
            ))}
          </div>

          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[2],
              padding: `${SPACING[3]} ${SPACING[4]}`,
              cursor: 'pointer',
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.medium,
              color: COLORS.textSecondary,
              borderTop: `1px solid ${COLORS.border}`,
            }}
            onClick={() => { onCreateNew(); onClose(); }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)', color: COLORS.textPrimary }}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            Add Account
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Account Row ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  isActive,
  onSelect,
  onRename,
  onRemove,
}: {
  account: SubWallet;
  isActive: boolean;
  onSelect: () => void;
  onRename: (newName: string) => void;
  onRemove?: () => void;
}): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [renameValue, setRenameValue] = useState(account.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setRenameValue(account.name);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [renaming, account.name]);

  const confirmRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== account.name) onRename(trimmed);
    setRenaming(false);
  };

  return (
    <motion.div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACING[3],
        padding: `${SPACING[3]} ${SPACING[4]}`,
        cursor: renaming ? 'default' : 'pointer',
        borderBottom: `1px solid ${COLORS.divider}`,
        position: 'relative',
      }}
      onClick={renaming ? undefined : onSelect}
      whileHover={renaming ? {} : { backgroundColor: 'rgba(255,255,255,0.03)' }}
    >
      {/* Avatar */}
      <div style={{
        width: '32px', height: '32px', borderRadius: '16px',
        backgroundColor: getAccountColor(account.index),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
      }}>
        {account.name[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Name / inline rename input */}
      <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={confirmRename}
            style={{
              width: '100%',
              backgroundColor: COLORS.background,
              border: `1px solid ${COLORS.primary}`,
              borderRadius: RADIUS.sm,
              color: COLORS.textPrimary,
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.semibold,
              padding: `2px ${SPACING[2]}`,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        ) : (
          <>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
              {account.name}
            </div>
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted, marginTop: '1px' }}>
              {truncateAddress(account.address)}
            </div>
          </>
        )}
      </div>

      {isActive && !renaming && (
        <span style={{ color: COLORS.success, fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>✓</span>
      )}

      {/* Inline remove confirmation */}
      {confirmingRemove && !renaming && onRemove && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>Remove?</span>
          <button onClick={() => { setConfirmingRemove(false); onRemove(); }} style={{ background: 'rgba(227,27,35,0.15)', border: '1px solid rgba(227,27,35,0.4)', borderRadius: '4px', color: COLORS.error, cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: '11px', padding: '2px 8px' }}>Yes</button>
          <button onClick={() => setConfirmingRemove(false)} style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: '4px', color: COLORS.textSecondary, cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: '11px', padding: '2px 8px' }}>No</button>
        </div>
      )}

      {/* More menu */}
      {!renaming && !confirmingRemove && (
        <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <motion.button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: '2px 4px', fontSize: '14px', outline: 'none' }}
            onClick={() => setShowMenu(!showMenu)}
            whileHover={{ color: COLORS.textPrimary }}
          >
            •••
          </motion.button>
          {showMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '100%',
              backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              zIndex: 200, minWidth: '120px', overflow: 'hidden',
            }}>
              <div
                style={{ padding: `${SPACING[2]} ${SPACING[3]}`, cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}
                onClick={() => { setShowMenu(false); setRenaming(true); }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                Rename
              </div>
              {onRemove && (
                <div
                  style={{ padding: `${SPACING[2]} ${SPACING[3]}`, cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error }}
                  onClick={() => { setShowMenu(false); setConfirmingRemove(true); }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = 'rgba(227,27,35,0.08)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  Remove
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
