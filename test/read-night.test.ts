import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('finds 5 jobs, sorted, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts valid lines per status', () => {
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps retries and the last error', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a failed job and a null owner', () => {
    expect(night?.rows.find((r) => r.job === 'notes/backup')?.lastStatus).toBe('fail');
    const render = night?.rows.find((r) => r.job === 'digest/render');
    expect(render).toBeDefined();
    expect(render?.owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a missing file or a bad night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines that fail validation, skips blank ones', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-01-03T03:00:00+01:00","job":"a","status":"ok"}',
      '[]',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-03');
    expect(night?.rows).toHaveLength(1);
    expect(night?.badLines).toBe(3);
  });
});
