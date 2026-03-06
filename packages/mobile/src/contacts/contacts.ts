import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface Contact {
  id: string;
  name: string;
  address: string;
  note?: string;
  createdAt: number;
  emoji?: string;
}

const STORAGE_KEY = 'saiko_contacts';
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function loadRaw(): Promise<Contact[]> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Contact[];
  } catch {
    return [];
  }
}

async function saveRaw(contacts: Contact[]): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export async function loadContacts(): Promise<Contact[]> {
  return loadRaw();
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await saveRaw(contacts);
}

export async function addContact(contact: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> {
  const contacts = await loadRaw();
  const newContact: Contact = {
    ...contact,
    id: Date.now().toString(36) + Math.random().toString(36),
    createdAt: Date.now(),
  };
  contacts.push(newContact);
  await saveRaw(contacts);
  return newContact;
}

export async function updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
  const contacts = await loadRaw();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return;
  contacts[idx] = { ...contacts[idx], ...updates };
  await saveRaw(contacts);
}

export async function deleteContact(id: string): Promise<void> {
  const contacts = (await loadRaw()).filter((c) => c.id !== id);
  await saveRaw(contacts);
}

export async function findContactByAddress(address: string): Promise<Contact | undefined> {
  const lower = address.toLowerCase();
  return (await loadRaw()).find((c) => c.address.toLowerCase() === lower);
}
