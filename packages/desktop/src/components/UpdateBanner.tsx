/**
 * UpdateBanner — shows a slim bar at the top of the app when an update is available,
 * downloading, or ready to install. Dismissible for "available" state.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';
import { useUpdater } from '../hooks/useUpdater.js';

export function UpdateBanner(): React.ReactElement | null {
  const { update, download, install, dismiss } = useUpdater();

  if (update.status === 'idle' || update.status === 'checking') return null;

  let bg: string = COLORS.surface;
  let borderColor: string = COLORS.border;
  let content: React.ReactNode = null;

  if (update.status === 'available') {
    bg = 'rgba(98,126,234,0.12)';
    borderColor = 'rgba(98,126,234,0.4)';
    content = (
      <>
        <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>
          ✦ Update <strong>v{update.version}</strong> available
        </span>
        <div style={{ display: 'flex', gap: SPACING[2], alignItems: 'center' }}>
          <button
            onClick={download}
            style={{
              background: 'rgba(98,126,234,0.9)', border: 'none', borderRadius: RADIUS.sm,
              color: '#fff', cursor: 'pointer', fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
              padding: `${SPACING[1]} ${SPACING[3]}`,
            }}
          >
            Download
          </button>
          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}
            aria-label="Dismiss update"
          >
            ×
          </button>
        </div>
      </>
    );
  }

  if (update.status === 'downloading') {
    bg = 'rgba(245,158,11,0.10)';
    borderColor = 'rgba(245,158,11,0.35)';
    content = (
      <>
        <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>
          Downloading update… <strong>{Math.round(update.percent)}%</strong>
        </span>
        <div style={{ width: '120px', height: '4px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${update.percent}%`, height: '100%', backgroundColor: '#F59E0B', transition: 'width 0.3s ease' }} />
        </div>
      </>
    );
  }

  if (update.status === 'ready') {
    bg = 'rgba(34,197,94,0.10)';
    borderColor = 'rgba(34,197,94,0.35)';
    content = (
      <>
        <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>
          ✓ Update <strong>v{update.version}</strong> ready — restart to install
        </span>
        <button
          onClick={install}
          style={{
            background: 'rgba(34,197,94,0.85)', border: 'none', borderRadius: RADIUS.sm,
            color: '#fff', cursor: 'pointer', fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
            padding: `${SPACING[1]} ${SPACING[3]}`,
          }}
        >
          Restart &amp; Install
        </button>
      </>
    );
  }

  if (update.status === 'error') {
    bg = 'rgba(227,27,35,0.10)';
    borderColor = 'rgba(227,27,35,0.35)';
    content = (
      <>
        <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error }}>
          Update failed: {update.message}
        </span>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}>×</button>
      </>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key={update.status}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ overflow: 'hidden' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${SPACING[2]} ${SPACING[6]}`,
          backgroundColor: bg,
          borderBottom: `1px solid ${borderColor}`,
          gap: SPACING[4],
        }}>
          {content}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
