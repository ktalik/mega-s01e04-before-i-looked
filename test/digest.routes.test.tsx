import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixtures live in a temp dir; the repo's runs/ is read-only and never touched.
const NORMAL = '2026-10-30';
const BAD_LINE = '2026-10-29';
const EMPTY = '2026-10-31';
const MISSING = '2026-11-01';

const normalLines = [
  { at: '2026-10-30T01:00:00+01:00', job: 'sync-mail', status: 'ok', owner: 'ana' },
  { at: '2026-10-30T01:05:00+01:00', job: 'build-report', status: 'retry', owner: 'ben', error: 'timeout' },
  { at: '2026-10-30T01:06:00+01:00', job: 'build-report', status: 'ok', owner: 'ben' },
  { at: '2026-10-30T02:00:00+01:00', job: 'backup-db', status: 'ok', owner: null },
];

const badLineLines = [
  '{"at":"2026-10-29T03:00:00+01:00","job":"fetch-rates","status":"fail","owner":"cy","error":"503 upstream"}',
  'this line is not json',
  '{"at":"2026-10-29T03:10:00+01:00","job":"rotate-logs","status":"ok","owner":"cy"}',
];

// Job names in fixture order are deliberately not sorted, so the sort is really tested.
const jobsOfNormal = ['sync-mail', 'build-report', 'backup-db'];
const sortedNormal = ['backup-db', 'build-report', 'sync-mail'];

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: '' };

let runsDir = '';
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.writeFileSync(
    path.join(runsDir, `${NORMAL}.jsonl`),
    normalLines.map((line) => JSON.stringify(line)).join('\n') + '\n',
  );
  fs.writeFileSync(path.join(runsDir, `${BAD_LINE}.jsonl`), badLineLines.join('\n') + '\n');
  fs.writeFileSync(path.join(runsDir, `${EMPTY}.jsonl`), '');
  app = createApp({ ...config, runsDir });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (page)', () => {
  it('renders the jobs of a normal night in one table', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    for (const job of jobsOfNormal) expect(html).toContain(job);
  });

  it('lists the jobs sorted by name', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const positions = sortedNormal.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('returns 404 when the night has no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders the valid jobs when a line is not JSON', async () => {
    const res = await app.request(`/digest/${BAD_LINE}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('fetch-rates');
    expect(html).toContain('rotate-logs');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the Night for a normal night with rows sorted by job', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.night).toBe(NORMAL);
    expect(night.badLines).toBe(0);
    expect(night.counts).toEqual({ ok: 3, retry: 1, fail: 0 });
    expect(night.rows.map((row) => row.job)).toEqual(sortedNormal);
  });

  it('computes each row from its lines, retries included', async () => {
    const night = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    const byJob = Object.fromEntries(night.rows.map((row) => [row.job, row]));
    expect(byJob['build-report']).toEqual({
      job: 'build-report',
      owner: 'ben',
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'timeout',
      firstAt: '2026-10-30T01:05:00+01:00',
      lastAt: '2026-10-30T01:06:00+01:00',
    });
    expect(byJob['backup-db'].owner).toBeNull();
  });

  it('returns 404 when the night has no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns no rows and no bad lines for an empty file', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.rows).toEqual([]);
    expect(night.badLines).toBe(0);
  });

  it('counts a bad line and keeps the valid rows', async () => {
    const res = await app.request(`/api/digest/${BAD_LINE}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((row) => row.job)).toEqual(['fetch-rates', 'rotate-logs']);
    expect(night.counts).toEqual({ ok: 1, retry: 0, fail: 1 });
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const night = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    const pageOrder = jobsOfNormal
      .map((job) => ({ job, at: html.indexOf(job) }))
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.job);
    expect(pageOrder).toEqual(night.rows.map((row) => row.job));
  });
});
