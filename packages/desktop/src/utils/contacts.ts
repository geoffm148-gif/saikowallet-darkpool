export interface Contact {
  id: string;
  name: string;
  address: string;
  note?: string;
  createdAt: number;
  emoji?: string;
}

const STORAGE_KEY = 'saiko_contacts';

export function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Contact[];
  } catch {
    return [];
  }
}

export function saveContacts(contacts: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch { /* localStorage full */ }
}

export function addContact(contact: Omit<Contact, 'id' | 'createdAt'>): Contact {
  const contacts = loadContacts();
  const newContact: Contact = {
    ...contact,
    id: Date.now().toString(36) + Math.random().toString(36),
    createdAt: Date.now(),
  };
  contacts.push(newContact);
  saveContacts(contacts);
  return newContact;
}

export function updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt'>>): void {
  const contacts = loadContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const existing = contacts[idx]!;
  contacts[idx] = { ...existing, ...updates };
  saveContacts(contacts);
}

export function deleteContact(id: string): void {
  const contacts = loadContacts().filter((c) => c.id !== id);
  saveContacts(contacts);
}

export function findContactByAddress(address: string): Contact | undefined {
  const lower = address.toLowerCase();
  return loadContacts().find((c) => c.address.toLowerCase() === lower);
}
