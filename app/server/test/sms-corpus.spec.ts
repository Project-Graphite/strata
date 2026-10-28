import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { institutions } from '../src/spending/capture/senders';
import { parseMessage } from '../src/spending/capture/sms-parser';

interface Sample {
  sender: string;
  text: string;
  expect: { ignored: string } | Record<string, string | number | null>;
}

const folder = join(__dirname, 'fixtures', 'sms');
const corpora = readdirSync(folder)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as { institution: string; messages: Sample[] });

describe('SMS corpus', () => {
  const rows = corpora.map(({ institution, messages }) => {
    const misses: string[] = [];
    let expected = 0;
    let predicted = 0;
    let correct = 0;
    let otpLeaks = 0;
    for (const { sender, text, expect: wanted } of messages) {
      const parsed = parseMessage(sender, text);
      if (!('ignored' in wanted)) expected++;
      if (parsed.kind === 'ignored') {
        if (!('ignored' in wanted)) misses.push(`missed: ${text}`);
        continue;
      }
      predicted++;
      if ('ignored' in wanted) {
        if (wanted.ignored === 'code') otpLeaks++;
        misses.push(`false movement: ${text}`);
        continue;
      }
      const wrong = Object.entries(wanted).filter(([field, value]) => parsed[field as keyof typeof parsed] !== value);
      if (wrong.length === 0) correct++;
      else misses.push(`${text} -> ${wrong.map(([field]) => `${field}=${JSON.stringify(parsed[field as keyof typeof parsed])}`).join(', ')}`);
    }
    return { institution, messages: messages.length, expected, predicted, correct, precision: predicted ? correct / predicted : 1, recall: expected ? correct / expected : 1, otpLeaks, misses };
  });

  it('covers at least eight movements and an OTP and a promotion per institution', () => {
    expect(corpora.map(({ institution }) => institution).sort()).toEqual(institutions.map(({ institution }) => institution).sort());
    for (const { messages } of corpora) {
      expect(messages.filter((sample) => !('ignored' in sample.expect)).length).toBeGreaterThanOrEqual(8);
      expect(messages.some((sample) => 'ignored' in sample.expect && sample.expect.ignored === 'code')).toBe(true);
      expect(messages.some((sample) => 'ignored' in sample.expect && sample.expect.ignored === 'promotion')).toBe(true);
    }
  });

  it('claims every message for its own institution only', () => {
    for (const { institution, messages } of corpora) {
      for (const { sender, text, expect: wanted } of messages) {
        const claimants = institutions.filter(({ senderPatterns }) => senderPatterns.some((pattern) => pattern.test(sender))).map((found) => found.institution);
        expect(claimants, sender).toEqual([institution]);
        if (!('ignored' in wanted)) expect(parseMessage(sender, text), text).toMatchObject({ institution, templateId: expect.any(String) });
      }
    }
  });

  it('reads every institution with high precision and recall and never records an OTP', () => {
    console.table(rows.map(({ misses: _misses, ...row }) => ({ ...row, precision: row.precision.toFixed(3), recall: row.recall.toFixed(3) })));
    for (const row of rows) {
      expect(row.precision, `${row.institution}\n${row.misses.join('\n')}`).toBeGreaterThanOrEqual(0.98);
      expect(row.recall, `${row.institution}\n${row.misses.join('\n')}`).toBeGreaterThanOrEqual(0.95);
      expect(row.otpLeaks, row.institution).toBe(0);
    }
  });
});
