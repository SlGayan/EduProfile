import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';
import { getOwnedClassIds, resolveOwnerAt, assignClassOwnership } from '../lib/temporal/classOwnership.js';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

// Relative to this process's own clock, deliberately not the DB server's —
// avoids flaking on the small (but real) clock drift between the two.
function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60_000);
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60_000);
}

/**
 * Story 13.4 — time-bounded class ownership. Covers the story's I/O &
 * edge-case matrix against a real DB. Fixtures use a `classownership_*`
 * email prefix, grade 9 and year 2034 (unused by `seed.ts` and every other
 * suite) so this file's data can't collide with, or be polluted by, any
 * other suite. `Class.teacherId` remains the live column this story keeps
 * writing (see classOwnership.ts's header comment); these tests exercise
 * ClassOwnership -- the read side -- directly and through the two
 * reassignment endpoints.
 */
describe('Time-bounded class ownership (Story 13.4)', () => {
  const YEAR = 2034;
  const GRADE = 9;

  let adminToken: string;
  let teacherATeacherId: number, teacherBTeacherId: number;

  const classIds: number[] = [];
  const teacherIds: number[] = [];
  const userIds: number[] = [];
  const subjectIds: number[] = [];

  async function upsertTeacherUser(email: string) {
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: { password: passwordHash, role: 'TEACHER' },
      create: { email, password: passwordHash, role: 'TEACHER' },
    });
    const teacher = await prisma.teacher.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    userIds.push(user.id);
    teacherIds.push(teacher.id);
    return { userId: user.id, teacherId: teacher.id };
  }

  /** Creates (or reuses) a class by identity. Does NOT touch ClassOwnership. */
  async function upsertClass(section: string, teacherId: number | null) {
    const identity = { gradeLevel: GRADE, section, year: YEAR };
    let klass = await prisma.class.findUnique({ where: { gradeLevel_section_year: identity } });
    if (!klass) {
      klass = await prisma.class.create({ data: { ...identity, teacherId } });
    } else {
      klass = await prisma.class.update({ where: { id: klass.id }, data: { teacherId } });
    }
    classIds.push(klass.id);
    return klass;
  }

  beforeAll(async () => {
    adminToken = await login('admin@edu.com');

    const a = await upsertTeacherUser('classownership_teachera@edu.com');
    teacherATeacherId = a.teacherId;

    const b = await upsertTeacherUser('classownership_teacherb@edu.com');
    teacherBTeacherId = b.teacherId;
  });

  afterAll(async () => {
    // ClassOwnership and TeacherSubjectAssignment are both ON DELETE
    // RESTRICT against Class, so they must be torn down before it.
    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classOwnership.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.teacher.deleteMany({ where: { id: { in: teacherIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    // Subject rows are left in place: shared global catalogue (see
    // marks-subject-scope.test.ts's afterAll comment for the same reasoning).
    await prisma.$disconnect();
  });

  it('happy path: a class owned since creation is included by getOwnedClassIds and resolveOwnerAt(now) returns that teacher', async () => {
    const klass = await upsertClass('Happy', teacherATeacherId);
    // A minute in the past, not `klass.createdAt`: the DB server's clock and
    // this process's clock can differ by tens of milliseconds, which would
    // otherwise make `fromDate <= now` flake around the boundary.
    await assignClassOwnership(prisma, klass.id, teacherATeacherId, minutesAgo(1));

    const owned = await getOwnedClassIds(teacherATeacherId);
    expect(owned).toContain(klass.id);

    const owner = await resolveOwnerAt(klass.id, new Date());
    expect(owner).toBe(teacherATeacherId);
  });

  it('backfill shape: a pre-existing class with a teacher gets exactly one open row with fromDate = the class\'s createdAt', async () => {
    const klass = await upsertClass('BackfillHasTeacher', teacherATeacherId);
    // Mirrors the migration's backfill: fromDate = Class.createdAt, open (toDate null).
    await assignClassOwnership(prisma, klass.id, teacherATeacherId, klass.createdAt);

    const rows = await prisma.classOwnership.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teacherId).toBe(teacherATeacherId);
    expect(rows[0]!.toDate).toBeNull();
    expect(rows[0]!.fromDate.toISOString()).toBe(klass.createdAt.toISOString());
  });

  it('backfill shape: a pre-existing class with no teacher gets no ClassOwnership row', async () => {
    const klass = await upsertClass('BackfillNoTeacher', null);

    const rows = await prisma.classOwnership.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(0);
    expect(await resolveOwnerAt(klass.id, new Date())).toBeNull();
  });

  it('resolveOwnerAt returns null for a date before the class had any owner', async () => {
    const klass = await upsertClass('PointInTime', teacherATeacherId);
    const fromDate = new Date(Date.UTC(YEAR, 0, 1)); // Jan 1 YEAR
    await assignClassOwnership(prisma, klass.id, teacherATeacherId, fromDate);

    const before = new Date(Date.UTC(YEAR - 1, 11, 31)); // Dec 31, the prior year
    expect(await resolveOwnerAt(klass.id, before)).toBeNull();
    // Sanity check the row does resolve on/after fromDate.
    expect(await resolveOwnerAt(klass.id, fromDate)).toBe(teacherATeacherId);
  });

  it('getOwnedClassIds returns only owned classes, not classes reached solely via a TeacherSubjectAssignment (AD-3/FR15)', async () => {
    const ownedClass = await upsertClass('UnionOwned', teacherATeacherId);
    await assignClassOwnership(prisma, ownedClass.id, teacherATeacherId, minutesAgo(1));

    const assignedOnlyClass = await upsertClass('UnionAssignedOnly', teacherBTeacherId);
    await assignClassOwnership(prisma, assignedOnlyClass.id, teacherBTeacherId, minutesAgo(1));

    const subject = await prisma.subject.upsert({
      where: { name: 'Class Ownership Union Subject' },
      update: {},
      create: { name: 'Class Ownership Union Subject' },
    });
    subjectIds.push(subject.id);
    await prisma.teacherSubjectAssignment.upsert({
      where: {
        teacherId_subjectId_classId: {
          teacherId: teacherATeacherId,
          subjectId: subject.id,
          classId: assignedOnlyClass.id,
        },
      },
      update: {},
      create: { teacherId: teacherATeacherId, subjectId: subject.id, classId: assignedOnlyClass.id },
    });

    const owned = await getOwnedClassIds(teacherATeacherId);
    expect(owned).toContain(ownedClass.id);
    expect(owned).not.toContain(assignedOnlyClass.id);
  });

  it('POST /api/classes — a class created with a teacherId gets an open ClassOwnership row immediately, visible via getOwnedClassIds without needing a reassignment first', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gradeLevel: GRADE, section: 'CreatedWithTeacher', year: YEAR, teacherId: teacherATeacherId });
    expect(res.status).toBe(201);
    const classId = res.body.class.id as number;
    classIds.push(classId);

    const rows = await prisma.classOwnership.findMany({ where: { classId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teacherId).toBe(teacherATeacherId);
    expect(rows[0]!.toDate).toBeNull();

    const owned = await getOwnedClassIds(teacherATeacherId);
    expect(owned).toContain(classId);
    expect(await resolveOwnerAt(classId, new Date())).toBe(teacherATeacherId);
  });

  it('POST /api/classes — a class created with no teacherId gets no ClassOwnership row', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gradeLevel: GRADE, section: 'CreatedNoTeacher', year: YEAR });
    expect(res.status).toBe(201);
    const classId = res.body.class.id as number;
    classIds.push(classId);

    const rows = await prisma.classOwnership.findMany({ where: { classId } });
    expect(rows).toHaveLength(0);
    expect(await resolveOwnerAt(classId, new Date())).toBeNull();
  });

  describe('reassignment keeps ClassOwnership in sync with Class.teacherId', () => {
    it('PUT /api/classes/:id — closes the outgoing teacher\'s row and opens the incoming teacher\'s, while the outgoing teacher\'s tenure period still resolves to them', async () => {
      const klass = await upsertClass('ReassignPut', teacherATeacherId);
      // Simulates "owned since January" with a real elapsed interval (30 days
      // ago) rather than a fixed calendar date, so the reassignment below
      // (which closes the row at the real current time) always lands after it.
      await assignClassOwnership(prisma, klass.id, teacherATeacherId, daysAgo(30));

      const res = await request(app)
        .put(`/api/classes/${klass.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ teacherId: teacherBTeacherId });
      expect(res.status).toBe(200);

      const ownedByA = await getOwnedClassIds(teacherATeacherId);
      expect(ownedByA).not.toContain(klass.id);
      const ownedByB = await getOwnedClassIds(teacherBTeacherId);
      expect(ownedByB).toContain(klass.id);

      // A's earlier tenure (e.g. "mid-year", before the reassignment above)
      // still resolves to A.
      expect(await resolveOwnerAt(klass.id, daysAgo(15))).toBe(teacherATeacherId);
      expect(await resolveOwnerAt(klass.id, new Date())).toBe(teacherBTeacherId);
    });

    it('POST /api/classes/:id/teacher — closes the outgoing teacher\'s row and opens the incoming teacher\'s, while the outgoing teacher\'s tenure period still resolves to them', async () => {
      const klass = await upsertClass('ReassignPost', teacherATeacherId);
      await assignClassOwnership(prisma, klass.id, teacherATeacherId, daysAgo(30));

      const res = await request(app)
        .post(`/api/classes/${klass.id}/teacher`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ teacherId: teacherBTeacherId });
      expect(res.status).toBe(200);

      const ownedByA = await getOwnedClassIds(teacherATeacherId);
      expect(ownedByA).not.toContain(klass.id);
      const ownedByB = await getOwnedClassIds(teacherBTeacherId);
      expect(ownedByB).toContain(klass.id);

      expect(await resolveOwnerAt(klass.id, daysAgo(15))).toBe(teacherATeacherId);
      expect(await resolveOwnerAt(klass.id, new Date())).toBe(teacherBTeacherId);
    });
  });
});
