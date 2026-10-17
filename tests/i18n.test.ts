import { describe, it, expect } from 'vitest';
import enMessages from '../messages/en.json';
import lgMessages from '../messages/lg.json';

describe('i18n integrity', () => {
  it('en.json and lg.json have identical key sets', () => {
    const enKeys = Object.keys(enMessages).sort();
    const lgKeys = Object.keys(lgMessages).sort();

    expect(enKeys).toEqual(lgKeys);
  });
});
