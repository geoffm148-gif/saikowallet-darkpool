import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../src/constants/colors';
import { Header } from '../src/components/Header';
import { Card } from '../src/components/Card';
import { ActionButton } from '../src/components/ActionButton';
import { useWallet } from '../src/wallet/context';
import { estimateGas, sendTransaction, type GasEstimate } from '../src/wallet/send';
import { resolveEns, isEnsName } from '../src/wallet/ens';
import { loadContacts, type Contact } from '../src/contacts/contacts';

type SendStep = 'compose' | 'review' | 'sending' | 'success';

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

export default function SendScreen() {
  const router = useRouter();
  const wallet = useWallet();

  const [step, setStep] = useState<SendStep>('compose');
  const [selectedToken, setSelectedToken] = useState<'ETH' | 'SAIKO'>('SAIKO');
  const [toAddress, setToAddress] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensError, setEnsError] = useState('');
  const [amount, setAmount] = useState('');
  const [addressError, setAddressError] = useState('');
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [txHash, setTxHash] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactList, setContactList] = useState<Contact[]>([]);

  const effectiveAddress = resolvedAddress ?? toAddress.trim();
  const balance = selectedToken === 'ETH' ? wallet.ethBalance : wallet.saikoBalance;

  // ENS resolution
  useEffect(() => {
    setResolvedAddress(null);
    setEnsError('');
    const input = toAddress.trim();
    if (!input || !isEnsName(input)) return;

    setEnsResolving(true);
    const timeout = setTimeout(() => {
      resolveEns(input)
        .then((addr) => {
          if (addr) {
            setResolvedAddress(addr);
            setEnsError('');
            setAddressError('');
          } else {
            setEnsError('Name not found');
          }
        })
        .catch(() => setEnsError('Name not found'))
        .finally(() => setEnsResolving(false));
    }, 500);

    return () => clearTimeout(timeout);
  }, [toAddress]);

  // Gas estimate on amount change
  useEffect(() => {
    if (!amount || !effectiveAddress || !isValidAddress(effectiveAddress)) {
      setGasEstimate(null);
      return;
    }
    const decimals = 18;
    const parts = amount.split('.');
    const whole = parts[0] ?? '0';
    const frac = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
    const amountWei = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
    if (amountWei === 0n) return;

    estimateGas({ toAddress: effectiveAddress, amountWei, token: selectedToken })
      .then(setGasEstimate)
      .catch(() => setGasEstimate(null));
  }, [amount, effectiveAddress, selectedToken]);

  const validateAndReview = useCallback(() => {
    if (!isValidAddress(effectiveAddress)) {
      setAddressError('Invalid Ethereum address');
      return;
    }
    setAddressError('');
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Enter an amount greater than zero.');
      return;
    }
    setStep('review');
  }, [effectiveAddress, amount]);

  const handleSend = useCallback(async () => {
    setStep('sending');
    try {
      const decimals = 18;
      const parts = amount.split('.');
      const whole = parts[0] ?? '0';
      const frac = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
      const amountWei = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);

      const hash = await sendTransaction({
        mnemonic: wallet.mnemonic,
        accountIndex: wallet.activeAccountIndex,
        toAddress: effectiveAddress,
        amountWei,
        token: selectedToken,
      });
      setTxHash(hash);
      setStep('success');
    } catch (err) {
      setStep('compose');
      Alert.alert(
        'Transaction Failed',
        err instanceof Error ? err.message : 'Could not send transaction. Please try again.',
      );
    }
  }, [wallet.mnemonic, wallet.activeAccountIndex, effectiveAddress, amount, selectedToken]);

  // Success screen
  if (step === 'success') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header title="Sent!" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20 }}>
          <Text style={{ fontSize: 48 }}>&#x2713;</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>Transaction Sent</Text>
          <Text style={{
            fontSize: 12,
            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
            color: COLORS.textMuted,
            textAlign: 'center',
          }}>
            {txHash}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://etherscan.io/tx/${txHash}`)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.primary }}>View on Etherscan</Text>
          </TouchableOpacity>
          <ActionButton
            label="Back to Dashboard"
            onPress={() => router.back()}
            variant="primary"
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }

  // Sending screen
  if (step === 'sending') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>Broadcasting...</Text>
          <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Do not close the app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Send" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Token Selector */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['SAIKO', 'ETH'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setSelectedToken(t)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: selectedToken === t ? COLORS.primary : COLORS.surface,
                borderWidth: 1,
                borderColor: selectedToken === t ? COLORS.primary : COLORS.border,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 15,
                fontWeight: '700',
                color: selectedToken === t ? '#fff' : COLORS.textSecondary,
              }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Balance display */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: selectedToken === 'SAIKO' ? COLORS.primary + '20' : '#627EEA20',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: selectedToken === 'SAIKO' ? COLORS.primary : '#627EEA' }}>
                {selectedToken === 'SAIKO' ? 'S' : '\u039E'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{selectedToken}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                Balance: {balance}
              </Text>
            </View>
          </View>
        </Card>

        {/* To Address */}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
            To Address
          </Text>
          <TextInput
            value={toAddress}
            onChangeText={(v) => { setToAddress(v); setAddressError(''); }}
            onBlur={() => {
              const input = toAddress.trim();
              if (input && !isEnsName(input) && !isValidAddress(input)) {
                setAddressError('Invalid Ethereum address');
              }
            }}
            placeholder="0x... or name.eth"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              height: 52,
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: addressError ? COLORS.error : COLORS.border,
              color: COLORS.text,
              fontSize: 15,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              paddingHorizontal: 16,
            }}
          />
          {addressError ? (
            <Text style={{ fontSize: 12, color: COLORS.error, marginTop: 4 }}>{addressError}</Text>
          ) : null}
          {ensResolving && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <ActivityIndicator size="small" color={COLORS.textMuted} />
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Resolving ENS...</Text>
            </View>
          )}
          {resolvedAddress && (
            <Text style={{ fontSize: 12, color: COLORS.success, marginTop: 4 }}>
              {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)} &#x2713;
            </Text>
          )}
          {ensError ? (
            <Text style={{ fontSize: 12, color: COLORS.error, marginTop: 4 }}>{ensError}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              void loadContacts().then((c) => { setContactList(c); setShowContactPicker(true); });
            }}
            activeOpacity={0.7}
            style={{ marginTop: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>
              Address Book
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
            Amount
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={amount}
              onChangeText={(v) => {
                if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              style={{
                flex: 1,
                height: 52,
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                color: COLORS.text,
                fontSize: 20,
                fontWeight: '700',
                paddingHorizontal: 16,
              }}
            />
            <TouchableOpacity
              onPress={() => {
                if (balance && balance !== '\u2014') setAmount(balance.replace(/,/g, ''));
              }}
              activeOpacity={0.7}
              style={{
                backgroundColor: COLORS.primary + '20',
                borderRadius: 12,
                paddingHorizontal: 16,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Gas Fee */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Estimated Gas Fee</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>
              {gasEstimate ? gasEstimate.estimatedCostEth : '\u2014'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Network</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Ethereum Mainnet</Text>
          </View>
        </Card>

        {/* Review Button */}
        <ActionButton
          label="Review Transaction"
          onPress={validateAndReview}
          variant="primary"
          fullWidth
          disabled={!effectiveAddress || !amount}
        />
      </ScrollView>

      {/* Contact Picker Modal */}
      <Modal visible={showContactPicker} transparent animationType="slide" onRequestClose={() => setShowContactPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: COLORS.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingBottom: 40,
            maxHeight: '60%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>Address Book</Text>
              <TouchableOpacity onPress={() => setShowContactPicker(false)}>
                <Text style={{ fontSize: 16, color: COLORS.textSecondary }}>Close</Text>
              </TouchableOpacity>
            </View>
            {contactList.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: COLORS.textMuted }}>No saved contacts</Text>
              </View>
            ) : (
              <ScrollView>
                {contactList.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => {
                      setToAddress(c.address);
                      setAddressError('');
                      setShowContactPicker(false);
                    }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                      gap: 12,
                    }}
                  >
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: COLORS.primary + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: c.emoji ? 18 : 14, fontWeight: '700', color: COLORS.primary }}>
                        {c.emoji || c.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>{c.name}</Text>
                      <Text style={{
                        fontSize: 12,
                        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                        color: COLORS.textMuted,
                      }}>
                        {c.address.slice(0, 6)}...{c.address.slice(-4)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={step === 'review'} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: COLORS.text,
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              Confirm Transaction
            </Text>

            <View style={{ gap: 12, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>From</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    color: COLORS.text,
                  }}
                  numberOfLines={1}
                >
                  {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>To</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    color: COLORS.text,
                  }}
                  numberOfLines={1}
                >
                  {effectiveAddress.slice(0, 8)}...{effectiveAddress.slice(-6)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Amount</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
                  {amount} {selectedToken}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Gas Fee</Text>
                <Text style={{ fontSize: 14, color: COLORS.text }}>
                  {gasEstimate ? gasEstimate.estimatedCostEth : '\u2014'}
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <ActionButton
                label="Confirm & Send"
                onPress={() => void handleSend()}
                variant="primary"
                fullWidth
              />
              <ActionButton
                label="Cancel"
                onPress={() => setStep('compose')}
                variant="ghost"
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
