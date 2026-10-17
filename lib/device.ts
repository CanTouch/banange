import crypto from 'crypto';

let memoryDeviceId: string | null = null;

export function getClientDeviceId(): string {
  if (typeof window === 'undefined') {
    return '00000000-0000-0000-0000-000000000000';
  }

  try {
    const existing = window.localStorage.getItem('banange_device');
    if (existing) {
      return existing;
    }
    const newId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.localStorage.setItem('banange_device', newId);
    return newId;
  } catch {
    if (!memoryDeviceId) {
      memoryDeviceId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return memoryDeviceId;
  }
}

export function hashDeviceId(deviceId: string): string {
  const salt = process.env.DEVICE_SALT || 'dev-salt';
  return crypto.createHash('sha256').update(deviceId + salt).digest('hex');
}
