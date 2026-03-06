import React, { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconArrowLeft,
  IconSearch,
  IconCopy,
  IconDelete,
  IconCheck,
  IconX,
} from '../icons.js';
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
  loadContacts,
  saveContacts,
  addContact,
  updateContact,
  deleteContact,
  type Contact,
} from '../utils/contacts.js';

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: SPACING[6],
};

const CONTENT_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: '960px',
  display: 'flex',
  gap: SPACING[6],
};

function validateAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function AvatarCircle({ contact }: { contact: Contact }): React.ReactElement {
  const colors = ['#E31B23', '#627EEA', '#43A047', '#F59E0B', '#8B5CF6', '#42A5F5'];
  const colorIdx = contact.name.charCodeAt(0) % colors.length;
  const bg = colors[colorIdx];

  return (
    <div style={{
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      backgroundColor: `${bg}20`,
      border: `1px solid ${bg}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: contact.emoji ? '20px' : '16px',
      fontWeight: 700,
      color: bg,
    }}>
      {contact.emoji || contact.name.charAt(0).toUpperCase()}
    </div>
  );
}

type FormMode = 'add' | 'edit';

interface ContactFormProps {
  mode: FormMode;
  initial?: Contact;
  onSave: (data: Omit<Contact, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

function ContactForm({ mode, initial, onSave, onCancel }: ContactFormProps): React.ReactElement {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [addressError, setAddressError] = useState('');

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    if (!validateAddress(address)) {
      setAddressError('Invalid Ethereum address');
      return;
    }
    setAddressError('');
    onSave({
      name: name.trim().slice(0, 32),
      address: address.trim(),
      note: note.trim() || undefined,
      emoji: emoji.trim() || undefined,
    });
  }, [name, address, note, emoji, onSave]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}
    >
      <h3 style={{
        fontFamily: FONT_FAMILY.sans,
        fontSize: FONT_SIZE.lg,
        fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary,
        margin: 0,
      }}>
        {mode === 'add' ? 'Add Contact' : 'Edit Contact'}
      </h3>
      <Input
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Contact name"
      />
      <Input
        label="Address"
        value={address}
        onChange={(v) => { setAddress(v); if (addressError) setAddressError(''); }}
        placeholder="0x..."
        monospace
        error={addressError}
      />
      <Input
        label="Note (optional)"
        value={note}
        onChange={setNote}
        placeholder="e.g. Trading wallet"
      />
      <Input
        label="Emoji (optional)"
        value={emoji}
        onChange={(v) => setEmoji(v.slice(0, 2))}
        placeholder="Enter an emoji"
      />
      <div style={{ display: 'flex', gap: SPACING[3] }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!name.trim() || !address.trim()}>
          Save
        </Button>
      </div>
    </motion.div>
  );
}

export function ContactsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
  });

  const handleAdd = useCallback((data: Omit<Contact, 'id' | 'createdAt'>) => {
    const c = addContact(data);
    setContacts(loadContacts());
    setSelected(c);
    setFormMode(null);
  }, []);

  const handleEdit = useCallback((data: Omit<Contact, 'id' | 'createdAt'>) => {
    if (!selected) return;
    updateContact(selected.id, data);
    setContacts(loadContacts());
    setSelected({ ...selected, ...data });
    setFormMode(null);
  }, [selected]);

  const handleDelete = useCallback((id: string) => {
    deleteContact(id);
    setContacts(loadContacts());
    if (selected?.id === id) {
      setSelected(null);
      setFormMode(null);
    }
  }, [selected]);

  const handleCopy = useCallback((addr: string) => {
    void navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '960px', display: 'flex', alignItems: 'center', gap: SPACING[4], marginBottom: SPACING[4] }}>
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
          flex: 1,
        }}>
          Address Book
        </h1>
        <Button variant="primary" size="sm" onClick={() => { setFormMode('add'); setSelected(null); }}>
          + Add Contact
        </Button>
      </div>

      <div style={CONTENT_STYLE}>
        {/* Left panel — contact list */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <IconSearch size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: COLORS.textMuted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              style={{
                width: '100%',
                height: '40px',
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                color: COLORS.textPrimary,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                paddingLeft: '36px',
                paddingRight: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <Card bordered>
            {filtered.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: SPACING[6],
                fontFamily: FONT_FAMILY.sans,
                color: COLORS.textMuted,
              }}>
                {contacts.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], alignItems: 'center' }}>
                    <span style={{ fontSize: FONT_SIZE.base }}>No saved contacts yet</span>
                    <Button variant="primary" size="sm" onClick={() => { setFormMode('add'); setSelected(null); }}>
                      Add your first contact
                    </Button>
                  </div>
                ) : (
                  <span style={{ fontSize: FONT_SIZE.sm }}>No contacts match your search</span>
                )}
              </div>
            ) : (
              filtered.map((c, i) => (
                <motion.div
                  key={c.id}
                  onClick={() => { setSelected(c); setFormMode(null); }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: SPACING[3],
                    padding: `${SPACING[3]} ${SPACING[4]}`,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${COLORS.divider}`,
                    backgroundColor: selected?.id === c.id ? COLORS.surface : 'transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <AvatarCircle contact={c} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.base,
                      fontWeight: FONT_WEIGHT.medium,
                      color: COLORS.textPrimary,
                    }}>{c.name}</div>
                    <div style={{
                      fontFamily: FONT_FAMILY.mono,
                      fontSize: FONT_SIZE.xs,
                      color: COLORS.textMuted,
                    }}>{truncateAddr(c.address)}</div>
                  </div>
                </motion.div>
              ))
            )}
          </Card>
        </div>

        {/* Right panel — detail / form */}
        <div style={{ width: '380px', flexShrink: 0 }}>
          <AnimatePresence mode="wait">
            {formMode === 'add' && (
              <Card bordered padding="lg" key="add-form">
                <ContactForm mode="add" onSave={handleAdd} onCancel={() => setFormMode(null)} />
              </Card>
            )}
            {formMode === 'edit' && selected && (
              <Card bordered padding="lg" key="edit-form">
                <ContactForm mode="edit" initial={selected} onSave={handleEdit} onCancel={() => setFormMode(null)} />
              </Card>
            )}
            {!formMode && selected && (
              <motion.div
                key={`detail-${selected.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card bordered padding="lg">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], alignItems: 'center' }}>
                    <AvatarCircle contact={selected} />
                    <h3 style={{
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.xl,
                      fontWeight: FONT_WEIGHT.bold,
                      color: COLORS.textPrimary,
                      margin: 0,
                    }}>{selected.name}</h3>
                    {selected.note && (
                      <span style={{
                        fontFamily: FONT_FAMILY.sans,
                        fontSize: FONT_SIZE.sm,
                        color: COLORS.textSecondary,
                      }}>{selected.note}</span>
                    )}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACING[2],
                      backgroundColor: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md,
                      padding: `${SPACING[2]} ${SPACING[3]}`,
                      width: '100%',
                    }}>
                      <span style={{
                        fontFamily: FONT_FAMILY.mono,
                        fontSize: FONT_SIZE.xs,
                        color: COLORS.textMuted,
                        wordBreak: 'break-all',
                        flex: 1,
                      }}>{selected.address}</span>
                      <motion.button
                        onClick={() => handleCopy(selected.address)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copied ? COLORS.success : COLORS.textSecondary,
                          padding: '4px',
                          display: 'flex',
                          outline: 'none',
                        }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </motion.button>
                    </div>
                    <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
                      <Button variant="secondary" size="sm" onClick={() => setFormMode('edit')} fullWidth>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(selected.id)} fullWidth>
                        Delete
                      </Button>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={() => void navigate(`/send?to=${selected.address}`)}
                    >
                      Send to this address
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
            {!formMode && !selected && (
              <motion.div
                key="empty-detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.textMuted,
                }}
              >
                Select a contact to view details
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
