import React, { useState, useEffect, useContext, useCallback, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Card,
  Button,
  Input,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  createRpcClient,
  DEFAULT_MAINNET_PROVIDERS,
  decryptPayload,
  wipeBytes,
} from '@saiko-wallet/wallet-core';
import type { EncryptedKeystore } from '@saiko-wallet/wallet-core';
import { IconArrowLeft, IconCopy, IconExternalLink, IconKey } from '../icons.js';
import { AppCtx } from '../context.js';
import { getActiveNetwork } from '../utils/network.js';

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  margin: '0 auto',
  padding: `${SPACING[6]} ${SPACING[6]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[5],
};

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

async function fetchEthBalance(address: string): Promise<bigint> {
  const client = createRpcClient({
    chainId: getActiveNetwork().chainId,
    providers: DEFAULT_MAINNET_PROVIDERS,
    maxRetries: 3,
  });
  const hex = await client.send<string>({
    method: 'eth_getBalance',
    params: [address, 'latest'],
  });
  return BigInt(hex);
}

export function AccountDetailsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { index } = useParams<{ index: string }>();
  const ctx = useContext(AppCtx);
  const accountIndex = Number(index ?? 0);

  const account = ctx.accounts.find(a => a.index === accountIndex);
  const [editName, setEditName] = useState(account?.name ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [ethBalance, setEthBalance] = useState('\u2014');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // C-5: Passphrase gate for private key export
  const [isRequestingKeyExport, setIsRequestingKeyExport] = useState(false);
  const [exportKeyPassphrase, setExportKeyPassphrase] = useState('');
  const [exportKeyError, setExportKeyError] = useState('');
  const [isVerifyingExport, setIsVerifyingExport] = useState(false);

  useEffect(() => {
    if (account?.address) {
      fetchEthBalance(account.address)
        .then(raw => setEthBalance(formatTokenAmount(raw, 18)))
        .catch(() => setEthBalance('\u2014'));
    }
  }, [account?.address]);

  const handleSave = useCallback(() => {
    if (!editName.trim()) return;
    ctx.renameAccount(accountIndex, editName);
    setIsEditing(false);
  }, [editName, accountIndex, ctx]);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleRequestKeyExport = useCallback(() => {
    setIsRequestingKeyExport(true);
    setExportKeyPassphrase('');
    setExportKeyError('');
  }, []);

  const handleConfirmKeyExport = useCallback(async () => {
    setIsVerifyingExport(true);
    setExportKeyError('');
    try {
      const keystoreRaw = localStorage.getItem('saiko_keystore');
      if (!keystoreRaw) throw new Error('No keystore found');
      const keystore = JSON.parse(keystoreRaw) as EncryptedKeystore;
      // Verify passphrase by attempting to decrypt
      const plaintextBytes = await decryptPayload(keystore, exportKeyPassphrase);
      // Passphrase is valid — wipe decrypted bytes and export key
      wipeBytes(plaintextBytes);
      if (!ctx.exportPrivateKey) return;
      const pk = ctx.exportPrivateKey(accountIndex);
      setRevealedKey(pk);
      setIsRequestingKeyExport(false);
      setExportKeyPassphrase('');
    } catch {
      setExportKeyError('Incorrect passphrase.');
    } finally {
      setIsVerifyingExport(false);
    }
  }, [exportKeyPassphrase, accountIndex, ctx]);

  if (!account) {
    return (
      <div style={{ ...PAGE_STYLE, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: COLORS.textMuted }}>Account not found</span>
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>Go Back</Button>
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACING[3],
        padding: `${SPACING[4]} ${SPACING[6]}`,
        backgroundColor: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <motion.button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: COLORS.textSecondary,
            padding: SPACING[1],
            display: 'flex',
            outline: 'none',
          }}
          onClick={() => navigate('/dashboard')}
          whileHover={{ color: COLORS.textPrimary }}
        >
          <IconArrowLeft size={20} />
        </motion.button>
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.lg,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary,
        }}>
          Account Details
        </span>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Name */}
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              fontWeight: FONT_WEIGHT.semibold,
              color: COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Account Name
            </span>
            {isEditing ? (
              <div style={{ display: 'flex', gap: SPACING[2] }}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
                  autoFocus
                  aria-label="Account name"
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.background,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.md,
                    padding: `${SPACING[2]} ${SPACING[3]}`,
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.base,
                    color: COLORS.textPrimary,
                    outline: 'none',
                  }}
                />
                <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Edit account name"
                style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                onClick={() => { setEditName(account.name); setIsEditing(true); }}
              >
                <span style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xl,
                  fontWeight: FONT_WEIGHT.semibold,
                  color: COLORS.textPrimary,
                }}>
                  {account.name}
                </span>
                <span style={{ color: COLORS.textMuted, fontSize: '12px' }}>✎</span>
              </button>
            )}
          </div>
        </Card>

        {/* Address */}
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.xs,
                fontWeight: FONT_WEIGHT.semibold,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Address
              </span>
              <motion.button
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: COLORS.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  fontSize: FONT_SIZE.xs,
                  fontFamily: FONT_FAMILY.sans,
                  outline: 'none',
                }}
                onClick={() => handleCopy(account.address)}
                whileHover={{ color: COLORS.textPrimary }}
              >
                <IconCopy size={12} />
                {copied ? 'Copied!' : 'Copy'}
              </motion.button>
            </div>
            <span style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textPrimary,
              wordBreak: 'break-all',
              lineHeight: '1.6',
            }}>
              {account.address}
            </span>
            <span style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: '11px',
              color: COLORS.textMuted,
            }}>
              {account.derivationPath}
            </span>
          </div>
        </Card>

        {/* ETH Balance */}
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[1] }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              fontWeight: FONT_WEIGHT.semibold,
              color: COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              ETH Balance
            </span>
            <span style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE['2xl'],
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
            }}>
              {ethBalance} ETH
            </span>
          </div>
        </Card>

        {/* View on Etherscan */}
        <a
          href={`${getActiveNetwork().explorerUrl}/address/${account.address}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACING[2],
            color: COLORS.textSecondary,
            textDecoration: 'none',
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.medium,
          }}
        >
          <IconExternalLink size={14} />
          View on Etherscan
        </a>

        {/* Export Private Key */}
        {revealedKey ? (
          <div style={{
            backgroundColor: `${COLORS.error}10`,
            border: `1px solid ${COLORS.error}4D`,
            borderRadius: RADIUS.lg,
            padding: SPACING[5],
            display: 'flex',
            flexDirection: 'column',
            gap: SPACING[3],
          }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.error,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Private Key — Do Not Share
            </span>
            <span style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textPrimary,
              wordBreak: 'break-all',
              lineHeight: '1.6',
            }}>
              {revealedKey}
            </span>
            <div style={{ display: 'flex', gap: SPACING[3] }}>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleCopy(revealedKey)}
              >
                Copy Key
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevealedKey(null)}
              >
                Hide
              </Button>
            </div>
          </div>
        ) : isRequestingKeyExport ? (
          <div style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            display: 'flex',
            flexDirection: 'column',
            gap: SPACING[3],
          }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary,
            }}>
              Enter your passphrase to export the private key
            </span>
            <Input
              label="Passphrase"
              value={exportKeyPassphrase}
              onChange={setExportKeyPassphrase}
              type="password"
              placeholder="Enter your passphrase"
              disabled={isVerifyingExport}
              autoFocus
              error={exportKeyError || undefined}
            />
            <div style={{ display: 'flex', gap: SPACING[3] }}>
              <Button variant="ghost" size="sm" onClick={() => { setIsRequestingKeyExport(false); setExportKeyPassphrase(''); setExportKeyError(''); }}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isVerifyingExport}
                disabled={exportKeyPassphrase.length === 0 || isVerifyingExport}
                onClick={() => void handleConfirmKeyExport()}
              >
                {isVerifyingExport ? 'Verifying...' : 'Export Key'}
              </Button>
            </div>
          </div>
        ) : (
          <motion.button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[2],
              padding: `${SPACING[3]} ${SPACING[4]}`,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.error}4D`,
              background: 'none',
              cursor: 'pointer',
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.semibold,
              color: COLORS.error,
              outline: 'none',
            }}
            onClick={handleRequestKeyExport}
            whileHover={{ backgroundColor: `${COLORS.error}10` }}
          >
            <IconKey size={16} />
            Export Private Key
          </motion.button>
        )}
      </div>
    </div>
  );
}
