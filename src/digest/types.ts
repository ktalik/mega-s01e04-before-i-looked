// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader is in
// read-night.ts.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times are kept as written in the log, offset included.
export type DigestRow = {
  job: string;
  owner: string | null; // owner on the job's last line; the view renders null as missing data (styleguide)
  runs: number; // lines for this job, retries included
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // most recent error on any of the job's lines
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse; counted, never thrown
  counts: Record<RunStatus, number>; // lines per status, for the board
};

// null when runs/<night>.jsonl does not exist. An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;

// A night is a date; anything else is not a file name we read.
export const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;
