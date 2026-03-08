import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/colors';
import { Card } from '../../src/components/Card';
import { ActionButton } from '../../src/components/ActionButton';
import { useWallet } from '../../src/wallet/context';
import { fetchQuote, executeSwap, type SwapQuoteResult } from '../../src/wallet/swap';

const SLIPPAGE_OPTIONS = [
  { label: '0.1%', bps: 10 },
  { label: '0.5%', bps: 50 },
  { label: '1%', bps: 100 },
];

type Token = 'ETH' | 'SAIKO';

export default function SwapScreen() {
  const { mnemonic, activeAccountIndex, ethBalance, saikoBalance } = useWallet();

  const [fromToken, setFromToken] = useState<Token>('ETH');
  const [toToken, setToToken] = useState<Token>('SAIKO');
  const [fromAmount, setFromAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<SwapQuoteResult | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState<string>('');
  const [quoteCountdown, setQuoteCountdown] = useState(0);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Balance for the "from" token
  const fromBalance = fromToken === 'ETH'
    ? ethBalance.replace(/[^0-9.]/g, '')
    : saikoBalance.replace(/[^0-9.]/g, '');

  // Flip tokens
  const handleFlip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount('');
    setQuote(null);
  };

  // Debounced quote fetch
  const fetchQuoteDebounced = useCallback(
    (amount: string, from: Token, to: Token, slip: number) => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);

      if (!amount || parseFloat(amount) <= 0) {
        setQuote(null);
        setIsLoadingQuote(false);
        return;
      }

      setIsLoadingQuote(true);
      quoteTimer.current = setTimeout(async () => {
        try {
          const q = await fetchQuote(from, to, amount, slip);
          setQuote(q);
          startCountdown(q.expiresAt);
        } catch {
          setQuote(null);
        }
        setIsLoadingQuote(false);
      }, 500);
    },
    [],
  );

  useEffect(() => {
    fetchQuoteDebounced(fromAmount, fromToken, toToken, slippageBps);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [fromAmount, fromToken, toToken, slippageBps, fetchQuoteDebounced]);

  function startCountdown(expiresAt: number) {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    const update = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setQuoteCountdown(remaining);
      if (remaining <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        // Auto-refresh
        fetchQuoteDebounced(fromAmount, fromToken, toToken, slippageBps);
      }
    };
    update();
    countdownTimer.current = setInterval(update, 1000);
  }

  const handleMax = () => {
    setFromAmount(fromBalance || '0');
  };

  const handleSwap = async () => {
    if (!quote || !mnemonic) return;
    setShowReview(false);
    setIsSwapping(true);
    setSwapStatus('');

    try {
      // Check if approval needed (SAIKO→ETH)
      if (fromToken === 'SAIKO') {
        setSwapStatus('Checking approval...');
      }

      const result = await executeSwap({
        mnemonic,
        accountIndex: activeAccountIndex,
        fromToken,
        toToken,
        amountIn: fromAmount,
        minAmountOut: quote.minimumReceived,
        slippageBps,
      });

      if (result.approvalTxHash) {
        setSwapStatus(`Approved! Tx: ${result.approvalTxHash.slice(0, 10)}...`);
      }

      setSwapStatus('');
      setIsSwapping(false);
      setFromAmount('');
      setQuote(null);

      Alert.alert(
        'Swap Submitted',
        `Transaction: ${result.swapTxHash.slice(0, 14)}...`,
        [
          { text: 'View on Etherscan', onPress: () => Linking.openURL(`https://etherscan.io/tx/${result.swapTxHash}`) },
          { text: 'OK' },
        ],
      );
    } catch (err: any) {
      setIsSwapping(false);
      setSwapStatus('');
      const msg = err?.message || 'Swap failed';
      if (msg.includes('insufficient')) {
        Alert.alert('Insufficient Balance', 'You do not have enough funds for this swap.');
      } else if (msg.includes('slippage')) {
        Alert.alert('Slippage Exceeded', 'The price moved too much. Try increasing slippage tolerance.');
      } else {
        Alert.alert('Swap Failed', msg);
      }
    }
  };

  // Button label
  const getButtonLabel = () => {
    if (isSwapping) return swapStatus || 'Swapping...';
    if (isLoadingQuote) return 'Fetching quote...';
    if (!fromAmount) return 'Enter amount';
    if (!quote) return 'Fetching quote...';
    return `Swap ${fromToken} → ${toToken}`;
  };

  const insufficientBalance = fromAmount
    ? parseFloat(fromAmount) > parseFloat(fromBalance || '0')
    : false;

  // Format output for display
  const formatOutput = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    if (num >= 1_000_000) return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return num.toFixed(8);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: 0.5, marginBottom: 8 }}>
          Swap
        </Text>

        {/* From Token */}
        <Card style={{ backgroundColor: '#1E1E1E', borderColor: '#2A2A2A' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted }}>From</Text>
            <TouchableOpacity onPress={handleMax}>
              <Text style={{ fontSize: 12, color: COLORS.primary }}>
                MAX: {fromBalance} {fromToken}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TokenBadge token={fromToken} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{fromToken}</Text>
            <TextInput
              value={fromAmount}
              onChangeText={(val) => {
                if (val === '' || /^\d*\.?\d*$/.test(val)) setFromAmount(val);
              }}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              style={{ flex: 1, textAlign: 'right', fontSize: 24, fontWeight: '700', color: COLORS.text }}
            />
          </View>
        </Card>

        {/* Flip Button */}
        <View style={{ alignItems: 'center', marginVertical: -8, zIndex: 1 }}>
          <TouchableOpacity
            onPress={handleFlip}
            activeOpacity={0.7}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: COLORS.primary,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="swap-vertical" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* To Token */}
        <Card style={{ backgroundColor: '#1E1E1E', borderColor: '#2A2A2A' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 8 }}>To</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TokenBadge token={toToken} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{toToken}</Text>
            <Text style={{ flex: 1, textAlign: 'right', fontSize: 24, fontWeight: '700', color: quote ? COLORS.text : COLORS.textMuted }}>
              {isLoadingQuote ? '...' : quote ? formatOutput(quote.outputAmount) : '\u2014'}
            </Text>
          </View>
        </Card>

        {/* Quote Details */}
        {quote && (
          <Card>
            <View style={{ gap: 8 }}>
              <QuoteRow label="Rate" value={`1 ${fromToken} = ${formatOutput(
                String(parseFloat(quote.outputAmount) / parseFloat(fromAmount || '1'))
              )} ${toToken}`} />
              <QuoteRow label="Price Impact" value={`${quote.priceImpact.toFixed(2)}%`}
                valueColor={quote.priceImpact > 5 ? '#EF5350' : quote.priceImpact > 1 ? '#FFA726' : '#66BB6A'} />
              <QuoteRow label="Fee (0.5%)" value={`${parseFloat(quote.feeAmount).toFixed(6)} ${fromToken}`} />
              <QuoteRow label="Min. Received" value={`${formatOutput(quote.minimumReceived)} ${toToken}`} />
              {quote.isLive && (
                <QuoteRow label="Quote expires" value={`${quoteCountdown}s`}
                  valueColor={quoteCountdown < 10 ? '#FFA726' : COLORS.textSecondary} />
              )}
              {!quote.isLive && (
                <Text style={{ fontSize: 11, color: '#FFA726', textAlign: 'center' }}>
                  Estimated quote (RPC unavailable)
                </Text>
              )}
            </View>
          </Card>
        )}

        {/* Slippage */}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 }}>
            Slippage Tolerance
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SLIPPAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.bps}
                onPress={() => setSlippageBps(opt.bps)}
                activeOpacity={0.7}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: slippageBps === opt.bps ? COLORS.primary : COLORS.surface,
                  borderWidth: 1,
                  borderColor: slippageBps === opt.bps ? COLORS.primary : COLORS.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: '600',
                  color: slippageBps === opt.bps ? '#FFFFFF' : COLORS.textSecondary,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Fee Note */}
        <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 }}>
          0.5% fee  •  10% to DarkPool staking rewards
        </Text>

        {/* Insufficient Balance Warning */}
        {insufficientBalance && (
          <Text style={{ fontSize: 13, color: '#EF5350', textAlign: 'center', fontWeight: '600' }}>
            Insufficient {fromToken} balance
          </Text>
        )}

        {/* Swap Button */}
        <ActionButton
          label={getButtonLabel()}
          onPress={() => {
            if (quote && !insufficientBalance && !isSwapping) setShowReview(true);
          }}
          variant="primary"
          fullWidth
          disabled={!fromAmount || !quote || isLoadingQuote || isSwapping || insufficientBalance}
          style={{ height: 56 }}
        />

        {isSwapping && swapStatus ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>{swapStatus}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Review Modal */}
      <Modal visible={showReview} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: 40,
          }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 20 }}>
              Review Swap
            </Text>

            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>From</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text }}>
                {fromAmount} {fromToken}
              </Text>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>To (estimated)</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#66BB6A' }}>
                ~{quote ? formatOutput(quote.outputAmount) : '0'} {toToken}
              </Text>
            </Card>

            <View style={{ gap: 8, marginBottom: 20 }}>
              <QuoteRow label="Fee (0.5%)" value={`${quote ? parseFloat(quote.feeAmount).toFixed(6) : '0'} ${fromToken}`} />
              <QuoteRow label="Min. Received" value={`${quote ? formatOutput(quote.minimumReceived) : '0'} ${toToken}`} />
              <QuoteRow label="Gas Estimate" value={`~${quote?.gasEstimate || '0.005'} ETH`} />
              <QuoteRow label="Slippage" value={`${slippageBps / 100}%`} />
            </View>

            {fromToken === 'SAIKO' && (
              <Card style={{ marginBottom: 16, backgroundColor: '#1a2332', borderColor: '#2a3a4a' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle" size={18} color="#64B5F6" />
                  <Text style={{ fontSize: 12, color: '#64B5F6', flex: 1 }}>
                    If needed, you'll first approve Saiko Wallet to spend your SAIKO. This is a one-time transaction.
                  </Text>
                </View>
              </Card>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowReview(false)}
                style={{
                  flex: 1, paddingVertical: 16, borderRadius: 12,
                  backgroundColor: COLORS.surface, alignItems: 'center',
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textSecondary }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSwap}
                style={{
                  flex: 2, paddingVertical: 16, borderRadius: 12,
                  backgroundColor: COLORS.primary, alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Confirm Swap</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────────

function TokenBadge({ token }: { token: Token }) {
  const isSaiko = token === 'SAIKO';
  return (
    <View style={{
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: isSaiko ? COLORS.primary + '20' : '#627EEA20',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: isSaiko ? COLORS.primary : '#627EEA' }}>
        {isSaiko ? 'S' : 'E'}
      </Text>
    </View>
  );
}

function QuoteRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: valueColor || COLORS.text }}>{value}</Text>
    </View>
  );
}
