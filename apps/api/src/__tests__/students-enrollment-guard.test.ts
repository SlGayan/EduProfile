import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

/**
 * Bugfix: spec-sync-enrollment-duplicate-guard.
 *
 * `syncEnrollment` (students.ts) is the shared helper behind every
 * class-connect path in this file (`POST /api/students` create/update,
 * `POST /api/students/import` create/update). Unlike classes.ts's dedicated
 * enrol route, it never checked whether the student already had a
 * *different* class for the same year, so any of those four call sites
 * could silently pull a student out of one teacher's class into another's,
 * leaving two concurrent ACTIVE Enrollments that permanently block mark
 * entry (Story 13.3). This suite covers the new same-year-different-class
 * 409 guard against a real DB.
 *
 * Fixtures use an `enrollguard_*` email prefix and year 2034 (unused by
 * `seed.ts` and every other test file) so this file's data can't collide
 * with, or be polluted by, any other suite.
 */
describe('syncEnrollment same-year-different-class guard (bugfix)', () => {
  const YEAR = 2034;
  const GRADE = 9;

  let teacherAUserId: number, teacherATeacherId: number;
  let teacherBUserId: number, teacherBTeacherId: number;
  let adminToken: string, teacherAToken: string, teacherBToken: string;
  let classAId: number, classBId: number;
  const studentUserIds: number[] = [];

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
    return { userId: user.id, teacherId: teacher.id };
  }

  async function upsertClass(section: string, teacherId: number) {
    const identity = { gradeLevel: GRADE, section, year: YEAR };
    let klass = await prisma.class.findUnique({ where: { gradeLevel_section_year: identity } });
    if (!klass) {
      klass = await prisma.class.create({ data: { ...identity, teacherId } });
    } else {
      klass = await prisma.class.update({ where: { id: klass.id }, data: { teacherId } });
    }
    return klass.id;
  }

  // Creates a fresh student (no class yet) via Prisma directly, tracked for
  // teardown. Returns { studentId, indexNumber }.
  async function createStudent(emailLocal: string, indexNumber: string) {
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
      where: { email: `enrollguard_${emailLocal}@edu.com` },
      update: { password: passwordHash, role: 'STUDENT' },
      create: { email: `enrollguard_${emailLocal}@edu.com`, password: passwordHash, role: 'STUDENT' },
    });
    studentUserIds.push(user.id);
    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: { classes: { set: [] } },
      create: {
        userId: user.id,
        fullName: `Enroll Guard ${emailLocal}`,
        indexNumber,
        dateOfBirth: new Date('2010-01-01'),
        address: 'Test Address',
      },
    });
    return student.id;
  }

  async function enrollDirect(studentId: number, classId: number, year: number) {
    const enrolledAt = new Date(Date.UTC(year, 0, 1));
    await prisma.class.update({ where: { id: classId }, data: { students: { connect: { id: studentId } } } });
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId, classId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId, classId, enrolledAt, status: 'ACTIVE' },
    });
  }

  beforeAll(async () => {
    const teacherA = await upsertTeacherUser('enrollguard_teachera@edu.com');
    teacherAUserId = teacherA.userId;
    teacherATeacherId = teacherA.teacherId;

    const teacherB = await upsertTeacherUser('enrollguard_teacherb@edu.com');
    teacherBUserId = teacherB.userId;
    teacherBTeacherId = teacherB.teacherId;

    classAId = await upsertClass('GuardA', teacherATeacherId);
    classBId = await upsertClass('GuardB', teacherBTeacherId);

    adminToken = await login('admin@edu.com');
    teacherAToken = await login('enrollguard_teachera@edu.com');
    teacherBToken = await login('enrollguard_teacherb@edu.com');
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { student: { userId: { in: studentUserIds } } } });
    await prisma.enrollment.deleteMany({ where: { class: { year: YEAR } } });
    await prisma.student.deleteMany({ where: { userId: { in: studentUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: studentUserIds } } });
    await prisma.class.deleteMany({ where: { year: YEAR } });
    await prisma.teacher.deleteMany({ where: { id: { in: [teacherATeacherId, teacherBTeacherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherAUserId, teacherBUserId] } } });
    await prisma.$disconnect();
  });

  describe('POST /api/students', () => {
    it('brand-new student: guard never fires, 201 created', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          email: 'enrollguard_new1@edu.com',
          fullName: 'Enroll Guard New1',
          indexNumber: 'ENROLLGUARD01',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        });
      // Track before asserting, so a failing assertion below still leaves this
      // run's created User/Student rows swept by afterAll (year-scoped
      // cleanup doesn't reach them since they're not tied to a class/year).
      const createdUser = await prisma.user.findUnique({ where: { email: 'enrollguard_new1@edu.com' } });
      if (createdUser) studentUserIds.push(createdUser.id);

      expect(res.status).toBe(201);
      const student = await prisma.student.findUnique({ where: { indexNumber: 'ENROLLGUARD01' } });
      expect(student).not.toBeNull();

      const enrollment = await prisma.enrollment.findFirst({ where: { studentId: student!.id, classId: classAId } });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.status).toBe('ACTIVE');
    });

    it('re-confirm same class: reopens/leaves the existing Enrollment ACTIVE, no conflict', async () => {
      const studentId = await createStudent('sameclass1', 'ENROLLGUARD02');
      await enrollDirect(studentId, classAId, YEAR);

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          email: 'enrollguard_sameclass1@edu.com',
          fullName: 'Enroll Guard SameClass1',
          indexNumber: 'ENROLLGUARD02',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        });
      expect(res.status).toBe(200);

      const rows = await prisma.enrollment.findMany({ where: { studentId, classId: classAId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('ACTIVE');
    });

    it('conflict: teacher B targeting their own class for a student already ACTIVE in class A returns 409, no write', async () => {
      const studentId = await createStudent('conflict1', 'ENROLLGUARD03');
      await enrollDirect(studentId, classAId, YEAR);

      const before = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { classes: true } });

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({
          email: 'enrollguard_conflict1@edu.com',
          fullName: 'Enroll Guard Conflict1 Renamed',
          indexNumber: 'ENROLLGUARD03',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(`Student is already enrolled in "Grade ${GRADE}-GuardA" for ${YEAR}`);

      const after = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { classes: true } });
      // No partial write: fullName unchanged, class membership unchanged.
      expect(after.fullName).toBe(before.fullName);
      expect(after.classes.map((c) => c.id)).toEqual(before.classes.map((c) => c.id));

      const enrollments = await prisma.enrollment.findMany({ where: { studentId } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]!.classId).toBe(classAId);
    });

    it('conflict: admin explicitly targeting a different class for a same-year-enrolled student returns 409, no write', async () => {
      const studentId = await createStudent('conflict2', 'ENROLLGUARD04');
      await enrollDirect(studentId, classAId, YEAR);

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'enrollguard_conflict2@edu.com',
          fullName: 'Enroll Guard Conflict2',
          indexNumber: 'ENROLLGUARD04',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
          classId: classBId,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(`Student is already enrolled in "Grade ${GRADE}-GuardA" for ${YEAR}`);

      const enrollments = await prisma.enrollment.findMany({ where: { studentId } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]!.classId).toBe(classAId);
      expect(enrollments[0]!.status).toBe('ACTIVE');
    });
  });

  describe('POST /api/students/import', () => {
    function csvOf(rows: Record<string, string>[]) {
      const header = 'email,fullName,indexNumber,dateOfBirth,address,nicNumber,gender,olYear,alYear';
      const lines = rows.map((r) => header.split(',').map((col) => r[col] ?? '').join(','));
      return [header, ...lines].join('\n');
    }

    it('brand-new student: guard never fires, row counted as created', async () => {
      const csv = csvOf([
        {
          email: 'enrollguard_import_new1@edu.com',
          fullName: 'Enroll Guard Import New1',
          indexNumber: 'ENROLLGUARDIMP01',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        },
      ]);
      const res = await request(app)
        .post('/api/students/import')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .attach('file', Buffer.from(csv), 'students.csv');

      // Track before asserting, so a failing assertion below still leaves this
      // run's created User/Student rows swept by afterAll.
      const createdUser = await prisma.user.findUnique({ where: { email: 'enrollguard_import_new1@edu.com' } });
      if (createdUser) studentUserIds.push(createdUser.id);

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      const student = await prisma.student.findUniqueOrThrow({ where: { indexNumber: 'ENROLLGUARDIMP01' } });
      const enrollment = await prisma.enrollment.findFirst({ where: { studentId: student.id, classId: classAId } });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.status).toBe('ACTIVE');
    });

    it('re-confirm same class: 200, existing Enrollment left ACTIVE, no conflict', async () => {
      const studentId = await createStudent('import_sameclass1', 'ENROLLGUARDIMP02');
      await enrollDirect(studentId, classAId, YEAR);

      const csv = csvOf([
        {
          email: 'enrollguard_import_sameclass1@edu.com',
          fullName: 'Enroll Guard Import SameClass1',
          indexNumber: 'ENROLLGUARDIMP02',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        },
      ]);
      const res = await request(app)
        .post('/api/students/import')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .attach('file', Buffer.from(csv), 'students.csv');

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);

      const rows = await prisma.enrollment.findMany({ where: { studentId, classId: classAId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('ACTIVE');
    });

    it('conflict: importing row targets a different same-year class -- whole transaction rolled back, 409 with row detail', async () => {
      const studentId = await createStudent('import_conflict1', 'ENROLLGUARDIMP03');
      await enrollDirect(studentId, classAId, YEAR);

      const before = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });

      const csv = csvOf([
        {
          email: 'enrollguard_import_conflict1@edu.com',
          fullName: 'Enroll Guard Import Conflict1 Renamed',
          indexNumber: 'ENROLLGUARDIMP03',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        },
      ]);
      // teacherB owns exactly one class (classB) -> auto-enrolled there,
      // conflicting with the student's existing ACTIVE enrollment in classA.
      const res = await request(app)
        .post('/api/students/import')
        .set('Authorization', `Bearer ${teacherBToken}`)
        .attach('file', Buffer.from(csv), 'students.csv');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(`Student is already enrolled in "Grade ${GRADE}-GuardA" for ${YEAR}`);

      const after = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
      // Whole row rolled back: fullName unchanged.
      expect(after.fullName).toBe(before.fullName);

      const enrollments = await prisma.enrollment.findMany({ where: { studentId } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]!.classId).toBe(classAId);
    });

    it('conflict on row 2 of a multi-row import rolls back the whole transaction, including the clean row 1', async () => {
      const conflictStudentId = await createStudent('import_multiconflict', 'ENROLLGUARDIMP05');
      await enrollDirect(conflictStudentId, classAId, YEAR);
      const before = await prisma.student.findUniqueOrThrow({ where: { id: conflictStudentId } });

      const cleanIndexNumber = 'ENROLLGUARDIMP04';
      const cleanEmail = 'enrollguard_import_multiclean@edu.com';

      const csv = csvOf([
        {
          // Row 1: brand-new student, no conflict -- would resolve fine on
          // its own.
          email: cleanEmail,
          fullName: 'Enroll Guard Import MultiClean',
          indexNumber: cleanIndexNumber,
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        },
        {
          // Row 2: existing student already ACTIVE in classA -- teacherB
          // owns exactly one class (classB), so this row auto-enrolls there
          // and conflicts.
          email: 'enrollguard_import_multiconflict@edu.com',
          fullName: 'Enroll Guard Import MultiConflict Renamed',
          indexNumber: 'ENROLLGUARDIMP05',
          dateOfBirth: '2010-01-01',
          address: 'Test Address',
        },
      ]);

      const res = await request(app)
        .post('/api/students/import')
        .set('Authorization', `Bearer ${teacherBToken}`)
        .attach('file', Buffer.from(csv), 'students.csv');

      // Track before asserting (in case the rollback assertion below is
      // ever wrong and a row did get written), so this run's rows are still
      // swept by afterAll.
      const maybeCleanUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (maybeCleanUser) studentUserIds.push(maybeCleanUser.id);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(`Student is already enrolled in "Grade ${GRADE}-GuardA" for ${YEAR}`);

      // Row 1 (clean) must NOT have been written at all -- proves the
      // all-or-nothing transaction, not just that row 2 itself was rejected.
      expect(maybeCleanUser).toBeNull();
      const cleanStudent = await prisma.student.findUnique({ where: { indexNumber: cleanIndexNumber } });
      expect(cleanStudent).toBeNull();

      // Row 2 (conflicting) must also be untouched.
      const after = await prisma.student.findUniqueOrThrow({ where: { id: conflictStudentId } });
      expect(after.fullName).toBe(before.fullName);
      const enrollments = await prisma.enrollment.findMany({ where: { studentId: conflictStudentId } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]!.classId).toBe(classAId);
    });
  });
});
