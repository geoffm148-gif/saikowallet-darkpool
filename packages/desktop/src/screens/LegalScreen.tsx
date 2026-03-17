import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconArrowLeft } from '../icons.js';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';

const PAGE_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: SPACING[6],
};

const CONTENT_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: '640px',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

const sectionStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY.sans,
  fontSize: FONT_SIZE.base,
  color: COLORS.textSecondary,
  lineHeight: '1.7',
};

const headingStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY.sans,
  fontSize: FONT_SIZE.lg,
  fontWeight: FONT_WEIGHT.semibold,
  color: COLORS.textPrimary,
  margin: `${SPACING[5]} 0 ${SPACING[3]}`,
};

function PrivacyPolicy(): React.ReactElement {
  return (
    <div style={sectionStyle}>
      <p>Last updated: March 2026</p>

      <h3 style={headingStyle}>Non-Custodial Design</h3>
      <p>Saiko Wallet is a non-custodial cryptocurrency wallet. We never have access to your private keys, seed phrase, or funds. All cryptographic operations happen entirely on your device.</p>

      <h3 style={headingStyle}>Data Collection</h3>
      <p>Zero. Saiko Wallet does not collect analytics, telemetry, crash reports, or maintain user accounts. We have no servers that store your data.</p>

      <h3 style={headingStyle}>Local Storage</h3>
      <p>All wallet data — including your encrypted seed phrase, account settings, contacts, and preferences — is stored locally on your device using browser local storage. Clearing your browser data will remove this information.</p>

      <h3 style={headingStyle}>Third-Party Services</h3>
      <p>Saiko Wallet connects to the following external services for functionality:</p>
      <ul style={{ paddingLeft: SPACING[5], marginTop: SPACING[2] }}>
        <li><strong>Ethereum RPC Providers</strong> — to broadcast transactions and fetch balances</li>
        <li><strong>CoinGecko / DexScreener</strong> — for token price data</li>
        <li><strong>Etherscan</strong> — for transaction history</li>
        <li><strong>WalletConnect (Reown)</strong> — for dApp connections</li>
      </ul>
      <p style={{ marginTop: SPACING[3] }}>These services may log your IP address and request data per their own privacy policies. Saiko Wallet does not control their data practices.</p>

      <h3 style={headingStyle}>Contact</h3>
      <p>For privacy concerns: <a href="mailto:support@saikowallet.app" style={{ color: COLORS.primary, textDecoration: 'none' }}>support@saikowallet.app</a></p>
    </div>
  );
}

function TermsOfService(): React.ReactElement {
  return (
    <div style={sectionStyle}>
      <p>Last updated: March 2026</p>

      <h3 style={headingStyle}>Acceptance</h3>
      <p>By using Saiko Wallet you agree to these terms. If you do not agree, do not use the software.</p>

      <h3 style={headingStyle}>Non-Custodial Disclaimer</h3>
      <p>You are solely responsible for securing your seed phrase and private keys. Saiko Wallet cannot recover lost seed phrases, reverse transactions, or freeze accounts. If you lose your seed phrase, your funds are permanently inaccessible.</p>

      <h3 style={headingStyle}>Risk Warning</h3>
      <p>Cryptocurrency involves significant risk, including the risk of total loss. Token prices are volatile and can go to zero. Past performance does not indicate future results. Do not invest more than you can afford to lose.</p>

      <h3 style={headingStyle}>No Guarantee of Accuracy</h3>
      <p>Price data, balance displays, and transaction history are provided for informational purposes only and may be delayed or inaccurate. Always verify important transactions on-chain via a block explorer.</p>

      <h3 style={headingStyle}>Prohibited Use</h3>
      <p>You must not use Saiko Wallet to evade sanctions, launder money, finance terrorism, or violate any applicable law. You are responsible for compliance with all laws in your jurisdiction.</p>

      <h3 style={headingStyle}>Limitation of Liability</h3>
      <p>Saiko Wallet is provided "as is" without warranty. We are not liable for any loss of funds, data, or damages arising from your use of this software.</p>

      <h3 style={headingStyle}>Governing Law</h3>
      <p>These terms are governed by the laws of Australia. Any disputes shall be resolved in the courts of New South Wales, Australia.</p>

      <h3 style={headingStyle}>Contact</h3>
      <p>Questions: <a href="mailto:support@saikowallet.app" style={{ color: COLORS.primary, textDecoration: 'none' }}>support@saikowallet.app</a></p>
    </div>
  );
}

export function LegalScreen(): React.ReactElement {
  const { page } = useParams<{ page: string }>();
  const navigate = useNavigate();
  const isPrivacy = page === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  return (
    <div style={PAGE_STYLE}>
      <div style={CONTENT_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[4] }}>
          <motion.button
            onClick={() => void navigate('/settings')}
            style={{
              background: 'none',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '6px',
              color: COLORS.textSecondary,
              cursor: 'pointer',
              padding: SPACING[2],
              display: 'flex',
              alignItems: 'center',
              outline: 'none',
            }}
            aria-label="Back"
            whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
            whileTap={{ scale: 0.95 }}
          >
            <IconArrowLeft size={20} />
          </motion.button>
          <h1 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            margin: 0,
            textTransform: 'uppercase',
          }}>
            {title}
          </h1>
        </div>

        <div style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg,
          padding: SPACING[6],
        }}>
          {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
        </div>
      </div>
    </div>
  );
}
