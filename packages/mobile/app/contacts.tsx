import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../src/constants/colors';
import { Header } from '../src/components/Header';
import { Card } from '../src/components/Card';
import { ActionButton } from '../src/components/ActionButton';
import {
  loadContacts,
  addContact,
  updateContact,
  deleteContact,
  type Contact,
} from '../src/contacts/contacts';

function validateAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function AvatarCircle({ contact, size = 40 }: { contact: Contact; size?: number }) {
  const colors = ['#E31B23', '#627EEA', '#43A047', '#F59E0B', '#8B5CF6', '#42A5F5'];
  const colorIdx = contact.name.charCodeAt(0) % colors.length;
  const bg = colors[colorIdx];

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: bg + '20',
      borderWidth: 1,
      borderColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{ fontSize: contact.emoji ? size * 0.5 : size * 0.4, fontWeight: '700', color: bg }}>
        {contact.emoji || contact.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [addressError, setAddressError] = useState('');

  const reload = useCallback(async () => {
    setContacts(await loadContacts());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
  });

  const openAddForm = useCallback(() => {
    setEditingContact(null);
    setFormName('');
    setFormAddress('');
    setFormNote('');
    setFormEmoji('');
    setAddressError('');
    setShowForm(true);
  }, []);

  const openEditForm = useCallback((c: Contact) => {
    setEditingContact(c);
    setFormName(c.name);
    setFormAddress(c.address);
    setFormNote(c.note ?? '');
    setFormEmoji(c.emoji ?? '');
    setAddressError('');
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim()) return;
    if (!validateAddress(formAddress)) {
      setAddressError('Invalid Ethereum address');
      return;
    }
    const data = {
      name: formName.trim().slice(0, 32),
      address: formAddress.trim(),
      note: formNote.trim() || undefined,
      emoji: formEmoji.trim() || undefined,
    };
    if (editingContact) {
      await updateContact(editingContact.id, data);
    } else {
      await addContact(data);
    }
    setShowForm(false);
    await reload();
  }, [formName, formAddress, formNote, formEmoji, editingContact, reload]);

  const handleDelete = useCallback((c: Contact) => {
    Alert.alert('Delete Contact', `Remove "${c.name}" from address book?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteContact(c.id);
          await reload();
        },
      },
    ]);
  }, [reload]);

  const handleContactPress = useCallback((c: Contact) => {
    Alert.alert(c.name, truncateAddr(c.address), [
      {
        text: 'Copy Address',
        onPress: () => void Clipboard.setStringAsync(c.address),
      },
      {
        text: 'Send to this address',
        onPress: () => router.push({ pathname: '/send', params: { to: c.address } }),
      },
      { text: 'Edit', onPress: () => openEditForm(c) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => handleDelete(c),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [router, openEditForm, handleDelete]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Address Book" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search + Add */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{
            flex: 1,
            height: 44,
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            gap: 8,
          }}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts..."
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex: 1,
                color: COLORS.text,
                fontSize: 14,
              }}
            />
          </View>
          <TouchableOpacity
            onPress={openAddForm}
            activeOpacity={0.7}
            style={{
              height: 44,
              paddingHorizontal: 16,
              backgroundColor: COLORS.primary,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Contact List */}
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 40, gap: 16 }}>
            <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
            <Text style={{ fontSize: 16, color: COLORS.textMuted, textAlign: 'center' }}>
              {contacts.length === 0 ? 'No saved contacts yet' : 'No contacts match your search'}
            </Text>
            {contacts.length === 0 && (
              <ActionButton
                label="Add your first contact"
                onPress={openAddForm}
                variant="primary"
              />
            )}
          </View>
        ) : (
          <Card>
            {filtered.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => handleContactPress(c)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                <AvatarCircle contact={c} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>
                    {c.name}
                  </Text>
                  <Text style={{
                    fontSize: 12,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    color: COLORS.textMuted,
                    marginTop: 2,
                  }}>
                    {truncateAddr(c.address)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: COLORS.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            gap: 16,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
                Name *
              </Text>
              <TextInput
                value={formName}
                onChangeText={(v) => setFormName(v.slice(0, 32))}
                placeholder="Contact name"
                placeholderTextColor={COLORS.textMuted}
                style={{
                  height: 48,
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                  fontSize: 15,
                  paddingHorizontal: 16,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
                Address *
              </Text>
              <TextInput
                value={formAddress}
                onChangeText={(v) => { setFormAddress(v); setAddressError(''); }}
                onBlur={() => {
                  if (formAddress.trim() && !validateAddress(formAddress)) {
                    setAddressError('Invalid Ethereum address');
                  }
                }}
                placeholder="0x..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  height: 48,
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: addressError ? COLORS.error : COLORS.border,
                  color: COLORS.text,
                  fontSize: 14,
                  fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                  paddingHorizontal: 16,
                }}
              />
              {addressError ? (
                <Text style={{ fontSize: 12, color: COLORS.error, marginTop: 4 }}>{addressError}</Text>
              ) : null}
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
                Note (optional)
              </Text>
              <TextInput
                value={formNote}
                onChangeText={setFormNote}
                placeholder="e.g. Trading wallet"
                placeholderTextColor={COLORS.textMuted}
                style={{
                  height: 48,
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                  fontSize: 15,
                  paddingHorizontal: 16,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
                Emoji (optional)
              </Text>
              <TextInput
                value={formEmoji}
                onChangeText={(v) => setFormEmoji(v.slice(0, 2))}
                placeholder="Enter an emoji"
                placeholderTextColor={COLORS.textMuted}
                style={{
                  height: 48,
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                  fontSize: 20,
                  paddingHorizontal: 16,
                }}
              />
            </View>

            <View style={{ gap: 12, marginTop: 8 }}>
              <ActionButton
                label="Save"
                onPress={() => void handleSave()}
                variant="primary"
                fullWidth
                disabled={!formName.trim() || !formAddress.trim()}
              />
              <ActionButton
                label="Cancel"
                onPress={() => setShowForm(false)}
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
