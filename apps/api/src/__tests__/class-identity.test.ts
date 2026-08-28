import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';
import { deriveClassName } from '../lib/classIdentity.js';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

/**
 * Story 13.1 — structured class identity.
 *
 * Covers the story's I/O & edge-case matrix against a real DB. Fixtures use
 * year 2033 and grade 7, unused by `seed.ts` and every other suite, so this
 * file's classes cannot collide with theirs under the new
 * `@@unique([gradeLevel, section, year])` constraint.
 */
describe('Structured class identity (Story 13.1)', () => {
  const YEAR = 2033;
  const GRADE = 7;

  let adminToken: string;
  let studentId: number;
  let studentUserId: number;
  const createdClassIds: number[] = [];

  async function createClass(body: Record<string, unknown>) {
    return request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  beforeAll(async () => {
    adminToken = await login('admin@edu.com');

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
      where: { email: 'classidentity_student@edu.com' },
      update: { password: passwordHash, role: 'STUDENT' },
      create: { email: 'classidentity_student@edu.com', password: passwordHash, role: 'STUDENT' },
    });
    studentUserId = user.id;

    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: { classes: { set: [] } },
      create: {
        userId: user.id,
        fullName: 'Class Identity Test Student',
        indexNumber: 'CLSID01',
        dateOfBirth: new Date('2010-01-01'),
        address: 'Test Address',
      },
    });
    studentId = student.id;
  });

  afterAll(async () => {
    // Story 13.2: Enrollment rows have ON DELETE RESTRICT FKs (AD-3), so they
    // must be removed before classes or students can be deleted in tests.
    await prisma.enrollment.deleteMany({ where: { student: { userId: studentUserId } } });
    await prisma.enrollment.deleteMany({ where: { class: { year: YEAR } } });
    await prisma.student.deleteMany({ where: { userId: studentUserId } });
    await prisma.user.deleteMany({ where: { id: studentUserId } });
    await prisma.class.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
  });

  describe('POST /api/classes', () => {
    it('creates from the identity triple and returns the derived name', async () => {
      const res = await createClass({ gradeLevel: 10, section: 'A', year: YEAR });
      expect(res.status).toBe(201);
      expect(res.body.class.name).toBe('Grade 10-A');
      expect(res.body.class.gradeLevel).toBe(10);
      expect(res.body.class.section).toBe('A');
      expect(res.body.class.year).toBe(YEAR);
      createdClassIds.push(res.body.class.id);
    });

    it('derives a word section the same way', async () => {
      const res = await createClass({ gradeLevel: 12, section: 'Science', year: YEAR });
      expect(res.status).toBe(201);
      expect(res.body.class.name).toBe('Grade 12-Science');
      createdClassIds.push(res.body.class.id);
    });

    it('rejects a duplicate identity with 409 and leaves the existing class unmodified', async () => {
      const first = await createClass({ gradeLevel: GRADE, section: 'Dup', year: YEAR });
      expect(first.status).toBe(201);
      const existingId = first.body.class.id as number;
      createdClassIds.push(existingId);

      const before = await prisma.class.findUniqueOrThrow({ where: { id: existingId } });

      const second = await createClass({ gradeLevel: GRADE, section: 'Dup', year: YEAR });
      expect(second.status).toBe(409);
      expect(second.body.error).toBeDefined();

      const after = await prisma.class.findUniqueOrThrow({ where: { id: existingId } });
      expect(after).toEqual(before);
      expect(await prisma.class.count({ where: { gradeLevel: GRADE, section: 'Dup', year: YEAR } })).toBe(1);
    });

    it('rejects a missing year with 400 and zod details', async () => {
      const res = await createClass({ gradeLevel: 10, section: 'B' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.some((d: { path: string[] }) => d.path.includes('year'))).toBe(true);
    });

    it.each([0, 14])('rejects gradeLevel %i as out of range with 400', async (gradeLevel) => {
      const res = await createClass({ gradeLevel, section: 'X', year: YEAR });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.some((d: { path: string[] }) => d.path.includes('gradeLevel'))).toBe(true);
    });

    it('rejects an empty section with 400', async () => {
      const res = await createClass({ gradeLevel: 10, section: '', year: YEAR });
      expect(res.status).toBe(400);
      expect(res.body.details.some((d: { path: string[] }) => d.path.includes('section'))).toBe(true);
    });

    it('no longer accepts a free-text name in place of the identity fields', async () => {
      const res = await createClass({ name: 'Remedial Group', year: YEAR });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/classes/:id', () => {
    it('updates the identity and re-derives the name', async () => {
      const created = await createClass({ gradeLevel: GRADE, section: 'Before', year: YEAR });
      expect(created.status).toBe(201);
      const id = created.body.class.id as number;
      createdClassIds.push(id);

      const res = await request(app)
        .put(`/api/classes/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ section: 'After' });

      expect(res.status).toBe(200);
      expect(res.body.class.name).toBe(`Grade ${GRADE}-After`);
    });

    it('rejects an update that would collide with another class, with 409', async () => {
      const a = await createClass({ gradeLevel: GRADE, section: 'CollideA', year: YEAR });
      const b = await createClass({ gradeLevel: GRADE, section: 'CollideB', year: YEAR });
      createdClassIds.push(a.body.class.id, b.body.class.id);

      const res = await request(app)
        .put(`/api/classes/${b.body.class.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ section: 'CollideA' });

      expect(res.status).toBe(409);
      const unchanged = await prisma.class.findUniqueOrThrow({ where: { id: b.body.class.id } });
      expect(unchanged.section).toBe('CollideB');
    });
  });

  describe('GET /api/classes', () => {
    it('carries the derived name on every listed class', async () => {
      const res = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.classes.length).toBeGreaterThan(0);
      for (const c of res.body.classes) {
        expect(c.name).toBe(deriveClassName(c));
      }
    });
  });

  describe('POST /api/classes/:id/students — cross-class duplicate-enrolment guard', () => {
    it('rejects a second class in the same year with 409, naming the first', async () => {
      const first = await createClass({ gradeLevel: GRADE, section: 'EnrolA', year: YEAR });
      const second = await createClass({ gradeLevel: GRADE, section: 'EnrolB', year: YEAR });
      createdClassIds.push(first.body.class.id, second.body.class.id);

      const added = await request(app)
        .post(`/api/classes/${first.body.class.id}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId });
      expect(added.status).toBe(200);

      const conflict = await request(app)
        .post(`/api/classes/${second.body.class.id}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId });

      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe(
        `Student is already enrolled in "Grade ${GRADE}-EnrolA" for ${YEAR}`
      );

      // Cleanup so afterAll's class delete is not blocked by the enrolment.
      await request(app)
        .delete(`/api/classes/${first.body.class.id}/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    });
  });

  /**
   * Story 13.2 — enrollment lifecycle.
   *
   * Verifies that the Enrollment model is kept in sync with the implicit
   * _ClassToStudent relation on both the enrol and unenrol paths.
   */
  describe('Story 13.2 — Enrollment lifecycle (enrol / unenrol)', () => {
    let lifecycleClassId: number;

    beforeAll(async () => {
      const res = await createClass({ gradeLevel: GRADE, section: 'LifecycleEnrol', year: YEAR });
      expect(res.status).toBe(201);
      lifecycleClassId = res.body.class.id as number;
      createdClassIds.push(lifecycleClassId);
    });

    it('creates an ACTIVE Enrollment row when a student is enrolled', async () => {
      const res = await request(app)
        .post(`/api/classes/${lifecycleClassId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId });
      expect(res.status).toBe(200);

      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId, classId: lifecycleClassId },
        orderBy: { createdAt: 'desc' },
      });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.status).toBe('ACTIVE');
      expect(enrollment!.leftAt).toBeNull();
      // enrolledAt must be Jan 1 of YEAR at midnight UTC (Date.UTC construction in route, AD-10)
      const expectedEnrolledAt = new Date(Date.UTC(YEAR, 0, 1));
      expect(enrollment!.enrolledAt.toISOString()).toBe(expectedEnrolledAt.toISOString());
    });

    it('closes the Enrollment row (leftAt + status=LEFT) when a student is unenrolled', async () => {
      const res = await request(app)
        .delete(`/api/classes/${lifecycleClassId}/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId, classId: lifecycleClassId },
        orderBy: { createdAt: 'desc' },
      });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.status).toBe('LEFT');
      expect(enrollment!.leftAt).not.toBeNull();
      // Row must NOT be deleted — AD-3
      const count = await prisma.enrollment.count({ where: { studentId, classId: lifecycleClassId } });
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('deriveClassName (Epic 13 AD-9)', () => {
  it('formats the identity as "Grade {gradeLevel}-{section}"', () => {
    expect(deriveClassName({ gradeLevel: 10, section: 'A' })).toBe('Grade 10-A');
    expect(deriveClassName({ gradeLevel: 12, section: 'Science' })).toBe('Grade 12-Science');
    expect(deriveClassName({ gradeLevel: 1, section: 'B' })).toBe('Grade 1-B');
  });
});
