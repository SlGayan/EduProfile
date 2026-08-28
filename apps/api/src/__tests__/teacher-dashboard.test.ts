import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';
import { round2 } from '../lib/queryHelpers.js';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

/**
 * Covers GET /api/teachers/me/dashboard end to end against a real DB, since
 * this is the endpoint's only integration coverage (the frontend test only
 * mocks the fetch). All fixtures are purpose-built rather than reused from
 * `prisma/seed.ts` — the seeded teachers all have a class and marks with
 * randomised per-student subject subsets, which can't produce a deterministic
 * "missing exactly one subject" or "one mark below 50" scenario.
 *
 * Every fixture uses a `dash_*` email and year 2030 (a year `seed.ts` never
 * writes), so this file's data can't collide with, or be polluted by, any
 * other test file's fixtures.
 */
describe('Teacher dashboard endpoint (GET /api/teachers/me/dashboard)', () => {
  const YEAR = 2030;
  const TERM = 1;

  let noProfileUserId: number;
  let noClassUserId: number;
  let noClassTeacherId: number;
  let zeroStudentUserId: number;
  let zeroStudentTeacherId: number;
  let zeroStudentClassId: number;
  let mainUserId: number;
  let mainTeacherId: number;
  let mainClassId: number;
  let studentUserIds: number[];
  let studentIds: number[];
  let subjects: { id: number; name: string }[];

  let noProfileToken: string;
  let noClassToken: string;
  let zeroStudentToken: string;
  let mainToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10);

    async function upsertTeacherUser(email: string) {
      const user = await prisma.user.upsert({
        where: { email },
        update: { password: passwordHash, role: 'TEACHER' },
        create: { email, password: passwordHash, role: 'TEACHER' },
      });
      return user.id;
    }

    // Fixture 1: a TEACHER-role user with no Teacher profile row at all --
    // login succeeds (role lives on User), but the dashboard's own
    // `tx.teacher.findUnique` must come back empty.
    noProfileUserId = await upsertTeacherUser('dash_no_profile@edu.com');

    // Fixture 2: a Teacher profile with zero assigned classes.
    noClassUserId = await upsertTeacherUser('dash_no_class@edu.com');
    const noClassTeacher = await prisma.teacher.upsert({
      where: { userId: noClassUserId },
      update: {},
      create: { userId: noClassUserId },
    });
    noClassTeacherId = noClassTeacher.id;

    // Fixture 3: a Teacher whose one class has zero enrolled students.
    zeroStudentUserId = await upsertTeacherUser('dash_zero_students@edu.com');
    const zeroStudentTeacher = await prisma.teacher.upsert({
      where: { userId: zeroStudentUserId },
      update: {},
      create: { userId: zeroStudentUserId },
    });
    zeroStudentTeacherId = zeroStudentTeacher.id;
    const ZERO_STUDENT_CLASS = { gradeLevel: 9, section: 'DashZero', year: YEAR };
    let zeroStudentClass = await prisma.class.findUnique({
      where: { gradeLevel_section_year: ZERO_STUDENT_CLASS },
    });
    if (!zeroStudentClass) {
      zeroStudentClass = await prisma.class.create({
        data: { ...ZERO_STUDENT_CLASS, teacherId: zeroStudentTeacherId },
      });
    }
    zeroStudentClassId = zeroStudentClass.id;

    // Fixture 4: a populated class with purpose-built marks covering the
    // pending/support edge cases.
    mainUserId = await upsertTeacherUser('dash_main@edu.com');
    const mainTeacher = await prisma.teacher.upsert({
      where: { userId: mainUserId },
      update: {},
      create: { userId: mainUserId },
    });
    mainTeacherId = mainTeacher.id;
    const MAIN_CLASS = { gradeLevel: 9, section: 'DashMain', year: YEAR };
    let mainClass = await prisma.class.findUnique({
      where: { gradeLevel_section_year: MAIN_CLASS },
    });
    if (!mainClass) {
      mainClass = await prisma.class.create({
        data: { ...MAIN_CLASS, teacherId: mainTeacherId },
      });
    }
    mainClassId = mainClass.id;

    // `expectedSubjectCount` in the controller is the FULL global Subject
    // catalogue, so the fixture must use every real subject row, not an
    // arbitrary count, to exercise "missing exactly one" correctly.
    subjects = await prisma.subject.findMany({ select: { id: true, name: true } });

    async function upsertStudent(email: string, fullName: string, indexNumber: string) {
      const user = await prisma.user.upsert({
        where: { email },
        update: { password: passwordHash, role: 'STUDENT' },
        create: { email, password: passwordHash, role: 'STUDENT' },
      });
      const student = await prisma.student.upsert({
        where: { userId: user.id },
        update: { classes: { set: [{ id: mainClassId }] } },
        create: {
          userId: user.id,
          fullName,
          indexNumber,
          dateOfBirth: new Date('2009-01-01'),
          address: 'Test Address',
          classes: { connect: [{ id: mainClassId }] },
        },
      });
      return { userId: user.id, studentId: student.id };
    }

    // "full": marked in every subject, all passing -> not pending, no support flag.
    const full = await upsertStudent('dash_student_full@edu.com', 'Full Marks Student', 'DASHTEST01');
    // "partial": missing exactly one subject -> pending, no support flag.
    const partial = await upsertStudent('dash_student_partial@edu.com', 'Partial Marks Student', 'DASHTEST02');
    // "support": marked in every subject, one of them below 50 -> not pending, flagged.
    const support = await upsertStudent('dash_student_support@edu.com', 'Needs Support Student', 'DASHTEST03');
    // "none": zero marks recorded -> pending, never enters the support calculation.
    const none = await upsertStudent('dash_student_none@edu.com', 'No Marks Student', 'DASHTEST04');

    studentUserIds = [full.userId, partial.userId, support.userId, none.userId];
    studentIds = [full.studentId, partial.studentId, support.studentId, none.studentId];

    // Clear this exact scope first so reruns start from a known state
    // instead of layering marks on top of a previous run's rows.
    await prisma.termMark.deleteMany({ where: { studentId: { in: studentIds }, year: YEAR, term: TERM } });

    const markRows: { studentId: number; subjectId: number; term: number; year: number; marks: number }[] = [];
    for (const s of subjects) {
      markRows.push({ studentId: full.studentId, subjectId: s.id, term: TERM, year: YEAR, marks: 80 });
    }
    for (const s of subjects.slice(0, subjects.length - 1)) {
      markRows.push({ studentId: partial.studentId, subjectId: s.id, term: TERM, year: YEAR, marks: 80 });
    }
    subjects.forEach((s, i) => {
      markRows.push({
        studentId: support.studentId,
        subjectId: s.id,
        term: TERM,
        year: YEAR,
        marks: i === 0 ? 40 : 80,
      });
    });
    await prisma.termMark.createMany({ data: markRows });

    noProfileToken = await login('dash_no_profile@edu.com');
    noClassToken = await login('dash_no_class@edu.com');
    zeroStudentToken = await login('dash_zero_students@edu.com');
    mainToken = await login('dash_main@edu.com');
  });

  afterAll(async () => {
    await prisma.termMark.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { userId: { in: studentUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: studentUserIds } } });
    await prisma.class.deleteMany({ where: { id: { in: [mainClassId, zeroStudentClassId] } } });
    await prisma.teacher.deleteMany({
      where: { id: { in: [mainTeacherId, zeroStudentTeacherId, noClassTeacherId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [mainUserId, zeroStudentUserId, noClassUserId, noProfileUserId] } },
    });
    await prisma.$disconnect();
  });

  it('returns 403 when the authenticated user has no Teacher profile', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${noProfileToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Teacher profile not found');
  });

  it('returns 200 with nulled/empty fields when the teacher has no assigned class', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${noClassToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      classId: null,
      className: null,
      studentCount: 0,
      marksPending: 0,
      classAverage: null,
      needsSupport: 0,
      scope: { year: null, term: null },
    });
  });

  it('returns 200 with zeroed stats when the assigned class has no enrolled students', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${zeroStudentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.classId).toBe(zeroStudentClassId);
    expect(res.body.studentCount).toBe(0);
    expect(res.body.marksPending).toBe(0);
    expect(res.body.classAverage).toBeNull();
    expect(res.body.needsSupport).toBe(0);
  });

  it('flags a student as needing support the moment ANY one subject is below 50, not their overall average', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ year: YEAR, term: TERM });
    // Only "support" has any mark below 50; their overall average (all
    // subjects at 80 but one at 40) is well above 50, so this would be 0 if
    // the code still filtered on the student's average instead.
    expect(res.body.needsSupport).toBe(1);
  });

  it('counts a student as pending when missing ANY expected subject, not only when they have zero marks', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(res.status).toBe(200);
    // "partial" (missing one subject) and "none" (zero marks) both count;
    // "full" and "support" are both marked in every subject and don't.
    expect(res.body.marksPending).toBe(2);
  });

  it('computes the class average across marked students only, excluding the zero-mark student entirely', async () => {
    const res = await request(app)
      .get('/api/teachers/me/dashboard')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(res.status).toBe(200);
    const n = subjects.length;
    const supportAverage = (80 * (n - 1) + 40) / n;
    const expectedClassAverage = round2((80 + 80 + supportAverage) / 3);
    expect(res.body.classAverage).toBe(expectedClassAverage);
    expect(res.body.studentCount).toBe(4);
  });
});
