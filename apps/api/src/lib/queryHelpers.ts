import { Prisma } from '@prisma/client';

/**
 * Reads are wrapped in a transaction so the several queries behind one response
 * observe a single database snapshot — otherwise a concurrent `marks/import`
 * commit lands between the aggregate and the detail query and the two sections
 * of the same JSON body disagree. The timeout is raised well above Prisma's 5s
 * default because these aggregates are deliberately unbounded (see the Story
 * 10.1 review decision on scale).
 */
export const READ_TX_OPTIONS = {
  timeout: 20_000,
  maxWait: 5_000,
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

/** Averages are money-free ratios; two decimals is enough for every chart. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
