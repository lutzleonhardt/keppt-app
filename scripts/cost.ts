#!/usr/bin/env tsx
/**
 * Aggregate per-turn token usage from a session directory into a cost report.
 *
 * Usage:
 *   pnpm cost                          # prompts for a session path
 *   pnpm cost /path/to/session         # one-shot
 *
 * Pricing is hard-coded per model family. Adjust the `PRICES` table below if
 * provider list prices change. DeepSeek promo pricing expires 2026-05-31.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

type AnthropicPrice = {
  schema: 'anthropic';
  in: number; out: number; cr: number; w5: number; w1: number;
};
type DeepSeekPrice = {
  schema: 'deepseek';
  miss: number; hit: number; out: number;
};
type Price = AnthropicPrice | DeepSeekPrice;

// USD per 1M tokens.
const PRICES: { match: RegExp; label: string; price: Price }[] = [
  {
    match: /sonnet/i,
    label: 'Claude Sonnet (4.x)',
    price: { schema: 'anthropic', in: 3.0, out: 15.0, cr: 0.30, w5: 3.75, w1: 6.00 },
  },
  {
    match: /haiku/i,
    label: 'Claude Haiku (4.x)',
    price: { schema: 'anthropic', in: 1.0, out: 5.0, cr: 0.10, w5: 1.25, w1: 2.00 },
  },
  {
    match: /opus/i,
    label: 'Claude Opus (4.x)',
    price: { schema: 'anthropic', in: 15.0, out: 75.0, cr: 1.50, w5: 18.75, w1: 30.00 },
  },
  {
    // 75% promo until 2026-05-31 15:59 UTC. List: miss 1.74, hit 0.0145, out 3.48.
    match: /deepseek-v4-pro/i,
    label: 'DeepSeek-V4-Pro (promo)',
    price: { schema: 'deepseek', miss: 0.435, hit: 0.003625, out: 0.87 },
  },
  {
    match: /deepseek/i,
    label: 'DeepSeek (generic R1-tier)',
    price: { schema: 'deepseek', miss: 0.55, hit: 0.14, out: 2.19 },
  },
];

const FALLBACK: { label: string; price: Price } = {
  label: 'Unknown (Sonnet pricing)',
  price: { schema: 'anthropic', in: 3.0, out: 15.0, cr: 0.30, w5: 3.75, w1: 6.00 },
};

function priceFor(model: string): { label: string; price: Price } {
  for (const p of PRICES) if (p.match.test(model)) return { label: p.label, price: p.price };
  return FALLBACK;
}

type TurnRow = {
  turn: string;
  model: string;
  outcome: string;
  durSec: number;
  inUncached: number;
  inCached: number;
  out: number;
  reasoning: number;
  costUsd: number;
};

type Step = {
  usage?: {
    raw?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
};

type Turn = {
  turnId: string;
  model: string;
  outcome?: string;
  durationMs?: number;
  steps?: Step[];
};

function aggregateTurn(turn: Turn): TurnRow {
  const { price } = priceFor(turn.model);
  let inUncached = 0, inCached = 0, out = 0, reasoning = 0, w5 = 0, w1 = 0;

  for (const step of turn.steps ?? []) {
    const raw = step.usage?.raw;
    if (!raw) continue;
    if (price.schema === 'deepseek') {
      inUncached += raw.prompt_cache_miss_tokens ?? 0;
      inCached += raw.prompt_cache_hit_tokens ?? 0;
      out += raw.completion_tokens ?? 0;
      reasoning += raw.completion_tokens_details?.reasoning_tokens ?? 0;
    } else {
      inUncached += raw.input_tokens ?? 0;
      out += raw.output_tokens ?? 0;
      inCached += raw.cache_read_input_tokens ?? 0;
      w5 += raw.cache_creation?.ephemeral_5m_input_tokens ?? 0;
      w1 += raw.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    }
  }

  let cost: number;
  if (price.schema === 'deepseek') {
    cost = (inUncached * price.miss + inCached * price.hit + out * price.out) / 1_000_000;
  } else {
    cost = (inUncached * price.in + out * price.out + inCached * price.cr
      + w5 * price.w5 + w1 * price.w1) / 1_000_000;
  }

  return {
    turn: turn.turnId,
    model: turn.model,
    outcome: turn.outcome ?? '?',
    durSec: (turn.durationMs ?? 0) / 1000,
    inUncached, inCached, out, reasoning,
    costUsd: cost,
  };
}

async function loadSession(dir: string): Promise<Turn[]> {
  const entries = await readdir(dir);
  const turnFiles = entries.filter(f => /^turn-\d+\.json$/.test(f)).sort();
  if (turnFiles.length === 0) throw new Error(`no turn-*.json files in ${dir}`);
  const turns: Turn[] = [];
  for (const f of turnFiles) {
    const raw = await readFile(join(dir, f), 'utf8');
    turns.push(JSON.parse(raw) as Turn);
  }
  return turns;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function printReport(sessionLabel: string, rows: TurnRow[]) {
  const okRows = rows.filter(r => r.outcome === 'ok');
  const errRows = rows.filter(r => r.outcome !== 'ok');

  const totalInUncached = okRows.reduce((s, r) => s + r.inUncached, 0);
  const totalInCached = okRows.reduce((s, r) => s + r.inCached, 0);
  const totalOut = okRows.reduce((s, r) => s + r.out, 0);
  const totalReasoning = okRows.reduce((s, r) => s + r.reasoning, 0);
  const totalCost = okRows.reduce((s, r) => s + r.costUsd, 0);
  const totalDur = okRows.reduce((s, r) => s + r.durSec, 0);
  const cacheBase = totalInUncached + totalInCached;
  const cacheHitPct = cacheBase > 0 ? (totalInCached / cacheBase) * 100 : 0;
  const models = [...new Set(rows.map(r => r.model))];

  // Per-turn table
  const cols: [string, (r: TurnRow) => string][] = [
    ['turn',       r => r.turn],
    ['outcome',    r => r.outcome],
    ['dur_s',      r => r.durSec.toFixed(1)],
    ['in_uncach',  r => fmtInt(r.inUncached)],
    ['in_cached',  r => fmtInt(r.inCached)],
    ['out',        r => fmtInt(r.out)],
    ['cost',       r => fmtUsd(r.costUsd)],
  ];

  const headers = cols.map(([h]) => h);
  const data = rows.map(r => cols.map(([, fn]) => fn(r)));
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map(row => row[i].length))
  );

  const pad = (s: string, w: number, right = false) =>
    right ? s.padStart(w) : s.padEnd(w);

  // Numeric columns right-aligned (everything except first two).
  const align = (i: number) => i >= 2;

  console.log(`\nSession: ${sessionLabel}`);
  console.log(`Model(s): ${models.join(', ')}`);
  console.log();

  console.log(headers.map((h, i) => pad(h, widths[i], align(i))).join('  '));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of data) {
    console.log(row.map((c, i) => pad(c, widths[i], align(i))).join('  '));
  }

  console.log();
  console.log(`Turns:          ${okRows.length} ok${errRows.length ? ` (+${errRows.length} err)` : ''}`);
  console.log(`Wall time:      ${totalDur.toFixed(1)} s`);
  console.log(`Input uncached: ${fmtInt(totalInUncached)} tok`);
  console.log(`Input cached:   ${fmtInt(totalInCached)} tok`);
  console.log(`Output:         ${fmtInt(totalOut)} tok` + (totalReasoning > 0 ? ` (incl. ${fmtInt(totalReasoning)} reasoning)` : ''));
  console.log(`Cache hit:      ${cacheHitPct.toFixed(1)} %`);
  console.log(`Total cost:     ${fmtUsd(totalCost)}`);
  console.log();
}

async function promptPath(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Session-Pfad (z. B. /pfad/zu/.keppt/logs/sessions/YYYY-MM-DD): ');
    return answer.trim().replace(/^["']|["']$/g, ''); // strip optional quotes
  } finally {
    rl.close();
  }
}

async function main() {
  let dir = process.argv[2];
  if (!dir) dir = await promptPath();
  if (!dir) {
    console.error('Kein Pfad angegeben.');
    process.exit(1);
  }

  const turns = await loadSession(dir);
  const rows = turns.map(aggregateTurn);
  printReport(basename(dir), rows);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
