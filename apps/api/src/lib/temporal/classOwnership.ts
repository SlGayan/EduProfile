import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Story 13.4 — Epic 13's first `lib/temporal/` module. `ClassOwnership` is
 * the single source of truth for "who owned this class at a given point in
 * time" reads. `Class.teacherId` stays the live, write-authoritative column
 * for this story (mirrors 13.2 keeping the implicit class<->student relation
 * alive alongside `Enrollment`) -- dropping it is later full-contract
 * cleanup, not this story.
 *
 * `getOwnedClassIds`/`resolveOwnerAt` read only `ClassOwnership`, never
 * `Class.teacherId` -- deliberate even though `teacherId` still holds the
 * live value, so no migrated caller needs a second swap when the column is
 * eventually dropped. No controller may query `ClassOwnership` directly;
 * everything goes through this module.
 */

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

/** Either the top-level client or a `prisma.$transaction(async (tx) => ...)` handle. */
type OwnershipWriter = PrismaClient | Prisma.TransactionClient;

/**
 * Every class `teacherId` owned at `at` (default: now). AD-3/FR15: this is
 * ownership only -- a caller that also needs subject-assignment classes
 * (e.g. marks.controller.ts) unions this with `TeacherSubjectAssignment`
 * itself; that union logic is untouched by this story.
 */
export async function getOwnedClassIds(teacherId: number, at: Date = new Date()): Promise<number[]> {
  const rows = await prisma.classOwnership.findMany({
    where: {
      teacherId,
      fromDate: { lte: at },
      OR: [{ toDate: null }, { toDate: { gt: at } }],
    },
    select: { classId: true },
  });
  return rows.map((r) => r.classId);
}

/**
 * The teacher who owned `classId` at `at` (default: now), or `null` if no
 * ownership row covers that date -- e.g. a date before the class had any
 * owner. Never throws and never guesses.
 */
export async function resolveOwnerAt(classId: number, at: Date = new Date()): Promise<number | null> {
  const row = await prisma.classOwnership.findFirst({
    where: {
      classId,
      fromDate: { lte: at },
      OR: [{ toDate: null }, { toDate: { gt: at } }],
    },
    select: { teacherId: true },
  });
  return row?.teacherId ?? null;
}

/**
 * Reassignment: closes `classId`'s current open row (`toDate` = `at`) and,
 * when `teacherId` names a new owner, opens a new open row for them --
 * mirrors the caller's `Class.teacherId` write and MUST run in the same
 * transaction as that write (pass the `tx` handle, not the top-level
 * client) so the two representations never diverge (13.2's dual-write
 * precedent).
 *
 * `teacherId: null` covers PUT /api/classes/:id's pre-existing "unassign"
 * case (`updateClassSchema.teacherId` is nullable): the class becomes
 * ownerless, so the current row is closed and no new one opens --
 * `ClassOwnership.teacherId` is NOT NULL, so a null "owner" cannot be a row
 * at all. POST /api/classes/:id/teacher never passes null (its schema
 * requires a real teacherId), so it always both closes and opens.
 */
export async function assignClassOwnership(
  tx: OwnershipWriter,
  classId: number,
  teacherId: number | null,
  at: Date = new Date()
): Promise<void> {
  await tx.classOwnership.updateMany({
    where: { classId, toDate: null },
    data: { toDate: at },
  });

  if (teacherId !== null) {
    await tx.classOwnership.create({
      data: { classId, teacherId, fromDate: at },
    });
  }
}
