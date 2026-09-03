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

function csvOf(rows: { studentIndexNumber: string; subjectName: string; term: number; year: number; marks: number }[]) {
  const header = 'studentIndexNumber,subjectName,term,year,marks';
  const lines = rows.map((r) => `${r.studentIndexNumber},${r.subjectName},${r.term},${r.year},${r.marks}`);
  return [header, ...lines].join('\n');
}

/**
 * Covers Story 12.3 (subject-scoped mark edit enforcement) against a real
 * DB. Fixtures use a `marksscope_*` email prefix and year 2031 (unused by
 * `seed.ts` and other test files) so this file's data can't collide with or
 * be polluted by any other suite.
 */
describe('Subject-scoped mark authorization (Story 12.3)', () => {
  const YEAR = 2031;
  const TERM = 1;

  let ownerUserId: number, ownerTeacherId: number;
  let assignedUserId: number, assignedTeacherId: number;
  let outsiderUserId: number, outsiderTeacherId: number;
  let classId: number;
  let assignedSubjectId: number;
  let unassignedSubjectId: number;
  let studentUserId: number, studentId: number;
  const studentIndexNumber = 'MARKSCOPE01';
  // Story 13.3 — a current member of `classId` (so the owner's ownsAClass
  // permission check passes) with NO Enrollment row for YEAR, used to prove
  // the multi-row import's all-or-nothing resolution guarantee below.
  let noEnrollmentStudentUserId: number, noEnrollmentStudentId: number;
  const noEnrollmentIndexNumber = 'MARKSCOPE02';

  let ownerToken: string, assignedToken: string, outsiderToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10);

    async function upsertTeacherUser(email: string) {
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

    const owner = await upsertTeacherUser('marksscope_owner@edu.com');
    ownerUserId = owner.userId;
    ownerTeacherId = owner.teacherId;

    const assigned = await upsertTeacherUser('marksscope_assigned@edu.com');
    assignedUserId = assigned.userId;
    assignedTeacherId = assigned.teacherId;

    const outsider = await upsertTeacherUser('marksscope_outsider@edu.com');
    outsiderUserId = outsider.userId;
    outsiderTeacherId = outsider.teacherId;

    const CLASS_IDENTITY = { gradeLevel: 10, section: 'MarkScope', year: YEAR };
    let klass = await prisma.class.findUnique({
      where: { gradeLevel_section_year: CLASS_IDENTITY },
    });
    if (!klass) {
      klass = await prisma.class.create({
        data: { ...CLASS_IDENTITY, teacherId: ownerTeacherId },
      });
    } else {
      klass = await prisma.class.update({ where: { id: klass.id }, data: { teacherId: ownerTeacherId } });
    }
    classId = klass.id;

    const assignedSubject = await prisma.subject.upsert({
      where: { name: 'Mark Scope Assigned Subject' },
      update: {},
      create: { name: 'Mark Scope Assigned Subject' },
    });
    assignedSubjectId = assignedSubject.id;

    const unassignedSubject = await prisma.subject.upsert({
      where: { name: 'Mark Scope Unassigned Subject' },
      update: {},
      create: { name: 'Mark Scope Unassigned Subject' },
    });
    unassignedSubjectId = unassignedSubject.id;

    // `assigned` teacher does NOT own the class, but is explicitly assigned
    // to teach `assignedSubjectId` within it.
    await prisma.teacherSubjectAssignment.upsert({
      where: {
        teacherId_subjectId_classId: {
          teacherId: assignedTeacherId,
          subjectId: assignedSubjectId,
          classId,
        },
      },
      update: {},
      create: { teacherId: assignedTeacherId, subjectId: assignedSubjectId, classId },
    });

    const studentUser = await prisma.user.upsert({
      where: { email: 'marksscope_student@edu.com' },
      update: { password: passwordHash, role: 'STUDENT' },
      create: { email: 'marksscope_student@edu.com', password: passwordHash, role: 'STUDENT' },
    });
    studentUserId = studentUser.id;

    const student = await prisma.student.upsert({
      where: { userId: studentUserId },
      update: { classes: { set: [{ id: classId }] } },
      create: {
        userId: studentUserId,
        fullName: 'Mark Scope Test Student',
        indexNumber: studentIndexNumber,
        dateOfBirth: new Date('2009-01-01'),
        address: 'Test Address',
        classes: { connect: [{ id: classId }] },
      },
    });
    studentId = student.id;

    // Story 13.3 — TermMark now anchors to an Enrollment, so the fixture
    // needs a matching one for (studentId, classId, YEAR), mirroring
    // routes/classes.ts's enrol route (enrolledAt = Jan 1 UTC of class year).
    const enrolledAt = new Date(Date.UTC(YEAR, 0, 1));
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId, classId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId, classId, enrolledAt, status: 'ACTIVE' },
    });

    // Story 13.3 — second student, current member of `classId` but with NO
    // Enrollment row for YEAR at all (see all-or-nothing atomicity test below).
    const noEnrollmentUser = await prisma.user.upsert({
      where: { email: 'marksscope_noenrollment@edu.com' },
      update: { password: passwordHash, role: 'STUDENT' },
      create: { email: 'marksscope_noenrollment@edu.com', password: passwordHash, role: 'STUDENT' },
    });
    noEnrollmentStudentUserId = noEnrollmentUser.id;
    const noEnrollmentStudent = await prisma.student.upsert({
      where: { userId: noEnrollmentStudentUserId },
      update: { classes: { set: [{ id: classId }] } },
      create: {
        userId: noEnrollmentStudentUserId,
        fullName: 'Mark Scope No-Enrollment Student',
        indexNumber: noEnrollmentIndexNumber,
        dateOfBirth: new Date('2009-01-01'),
        address: 'Test Address',
        classes: { connect: [{ id: classId }] },
      },
    });
    noEnrollmentStudentId = noEnrollmentStudent.id;

    await prisma.termMark.deleteMany({ where: { studentId, year: YEAR, term: TERM } });
    await prisma.termMark.deleteMany({ where: { studentId: noEnrollmentStudentId, year: YEAR, term: TERM } });

    ownerToken = await login('marksscope_owner@edu.com');
    assignedToken = await login('marksscope_assigned@edu.com');
    outsiderToken = await login('marksscope_outsider@edu.com');
  });

  afterAll(async () => {
    await prisma.termMark.deleteMany({ where: { studentId } });
    await prisma.termMark.deleteMany({ where: { studentId: noEnrollmentStudentId } });
    // Story 13.3 — Enrollment is ON DELETE RESTRICT against both Student and
    // Class, so it must be torn down before either of those below.
    await prisma.enrollment.deleteMany({ where: { studentId, classId } });
    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId } });
    await prisma.student.deleteMany({ where: { userId: studentUserId } });
    await prisma.student.deleteMany({ where: { userId: noEnrollmentStudentUserId } });
    await prisma.user.deleteMany({ where: { id: studentUserId } });
    await prisma.user.deleteMany({ where: { id: noEnrollmentStudentUserId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.teacher.deleteMany({ where: { id: { in: [ownerTeacherId, assignedTeacherId, outsiderTeacherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, assignedUserId, outsiderUserId] } } });
    // Subject rows are left in place: Subject is a shared global catalogue
    // (see teacher-dashboard.test.ts), and other suites' fixtures may have
    // already attached their own TermMarks to these rows via a full-catalogue
    // scan, so deleting them here can hit a foreign key constraint.
    await prisma.$disconnect();
  });

  describe('POST /api/marks/import', () => {
    it('allows the owning teacher to import marks for any subject in their class', async () => {
      const csv = csvOf([
        { studentIndexNumber, subjectName: 'Mark Scope Unassigned Subject', term: TERM, year: YEAR, marks: 77 },
      ]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(200);
    });

    it('allows a non-owning teacher with a matching TeacherSubjectAssignment to import that subject', async () => {
      const csv = csvOf([
        { studentIndexNumber, subjectName: 'Mark Scope Assigned Subject', term: TERM, year: YEAR, marks: 88 },
      ]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${assignedToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(200);
    });

    it('returns 403 for a non-owning teacher importing a subject they are not assigned to teach', async () => {
      const csv = csvOf([
        { studentIndexNumber, subjectName: 'Mark Scope Unassigned Subject', term: TERM, year: YEAR, marks: 55 },
      ]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${assignedToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('do not have permission');
    });

    it('returns 403 for a teacher with no class ownership and no subject assignment at all', async () => {
      const csv = csvOf([
        { studentIndexNumber, subjectName: 'Mark Scope Assigned Subject', term: TERM, year: YEAR, marks: 66 },
      ]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(403);
    });

    it('writes no TermMark at all when one row of a multi-row import cannot resolve an enrollment (Story 13.3 all-or-nothing)', async () => {
      const csv = csvOf([
        { studentIndexNumber, subjectName: 'Mark Scope Atomicity Subject', term: TERM, year: YEAR, marks: 90 },
        { studentIndexNumber: noEnrollmentIndexNumber, subjectName: 'Mark Scope Atomicity Subject', term: TERM, year: YEAR, marks: 50 },
      ]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No enrollment found');

      const written = await prisma.termMark.findFirst({
        where: { studentId, subject: { name: 'Mark Scope Atomicity Subject' }, term: TERM, year: YEAR },
      });
      expect(written).toBeNull();
    });
  });

  describe('GET /api/marks/class-marks', () => {
    it('allows the owning teacher to view the class', async () => {
      const res = await request(app)
        .get('/api/marks/class-marks')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((m: { studentIndexNumber: string }) => m.studentIndexNumber === studentIndexNumber)).toBe(true);
    });

    it('allows a non-owning teacher with any TeacherSubjectAssignment in the class to view the whole class, unfiltered by subject', async () => {
      const res = await request(app)
        .get('/api/marks/class-marks')
        .set('Authorization', `Bearer ${assignedToken}`);
      expect(res.status).toBe(200);
      const rowsForStudent = res.body.filter((m: { studentIndexNumber: string }) => m.studentIndexNumber === studentIndexNumber);
      // Not subject-filtered: both the assigned and unassigned subject's
      // marks for this student should be visible.
      const subjectsSeen = rowsForStudent.map((m: { subject: string }) => m.subject);
      expect(subjectsSeen).toContain('Mark Scope Assigned Subject');
      expect(subjectsSeen).toContain('Mark Scope Unassigned Subject');
    });

    it('returns 403 for a teacher with no class ownership and no subject assignment at all', async () => {
      const res = await request(app)
        .get('/api/marks/class-marks')
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Teacher is not assigned to any classes');
    });
  });
});

/**
 * Story 13.3 — a TermMark now anchors to the Enrollment it was earned in
 * rather than the student's current class membership. Covers the I/O
 * matrix's no-match/ambiguous/post-transfer-visibility rows against a real
 * DB. Fixtures use a `marksanchor_*` email prefix and year 2032 (unused by
 * `seed.ts` and every other test file) so this block's data can't collide
 * with, or be polluted by, any other suite.
 */
describe('Enrollment anchoring (Story 13.3)', () => {
  const YEAR = 2032;

  let teacherAUserId: number, teacherATeacherId: number;
  let teacherBUserId: number, teacherBTeacherId: number;
  let classAId: number, classBId: number, classCId: number;
  let studentUserIds: number[] = [];

  // "noEnroll": current member of classA, but no Enrollment row for YEAR.
  let noEnrollStudentId: number;
  const noEnrollIndex = 'MARKSANCHOR01';
  // "ambiguous": two Enrollment rows in YEAR, one for classA and one for
  // classC (both owned by teacherA) -- a mid-year transfer between two
  // classes the same teacher can act in.
  let ambiguousStudentId: number;
  const ambiguousIndex = 'MARKSANCHOR02';
  // "transfer": starts enrolled in classA under teacherA, then genuinely
  // transfers to classB under teacherB.
  let transferStudentId: number;
  const transferIndex = 'MARKSANCHOR03';
  // "valid": a straightforward single Enrollment in classA/YEAR, used as
  // the "resolves fine" row in the multi-row atomicity test.
  let validStudentId: number;
  const validIndex = 'MARKSANCHOR04';
  // "duplicate": same setup as "transfer" (classA under teacherA, then
  // transfers to classB under teacherB), used to prove the retained
  // natural-key unique index actually fires a 409 when the SAME
  // subject/term/year is written under two different enrollments.
  let duplicateStudentId: number;
  const duplicateIndex = 'MARKSANCHOR05';
  // "duplicateImport": same scenario as "duplicate" above, but exercised
  // through POST /api/marks/import (the CSV path) instead of createMark.
  let duplicateImportStudentId: number;
  const duplicateImportIndex = 'MARKSANCHOR06';

  let teacherAToken: string, teacherBToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10);

    async function upsertTeacherUser(email: string) {
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

    const teacherA = await upsertTeacherUser('marksanchor_teachera@edu.com');
    teacherAUserId = teacherA.userId;
    teacherATeacherId = teacherA.teacherId;

    const teacherB = await upsertTeacherUser('marksanchor_teacherb@edu.com');
    teacherBUserId = teacherB.userId;
    teacherBTeacherId = teacherB.teacherId;

    async function upsertClass(section: string, teacherId: number) {
      const identity = { gradeLevel: 11, section, year: YEAR };
      let klass = await prisma.class.findUnique({ where: { gradeLevel_section_year: identity } });
      if (!klass) {
        klass = await prisma.class.create({ data: { ...identity, teacherId } });
      } else {
        klass = await prisma.class.update({ where: { id: klass.id }, data: { teacherId } });
      }
      return klass.id;
    }

    classAId = await upsertClass('AnchorA', teacherATeacherId);
    classBId = await upsertClass('AnchorB', teacherBTeacherId);
    // A second class owned by teacherA, used to construct the ambiguous
    // (two-candidate) enrollment scenario within one teacher's own reach.
    classCId = await upsertClass('AnchorC', teacherATeacherId);

    await prisma.subject.upsert({
      where: { name: 'Mark Anchor Subject' },
      update: {},
      create: { name: 'Mark Anchor Subject' },
    });

    const enrolledAt = new Date(Date.UTC(YEAR, 0, 1));

    async function upsertAnchorStudent(email: string, fullName: string, indexNumber: string, classId: number) {
      const user = await prisma.user.upsert({
        where: { email },
        update: { password: passwordHash, role: 'STUDENT' },
        create: { email, password: passwordHash, role: 'STUDENT' },
      });
      const student = await prisma.student.upsert({
        where: { userId: user.id },
        update: { classes: { set: [{ id: classId }] } },
        create: {
          userId: user.id,
          fullName,
          indexNumber,
          dateOfBirth: new Date('2009-01-01'),
          address: 'Test Address',
          classes: { connect: [{ id: classId }] },
        },
      });
      studentUserIds.push(user.id);
      return student.id;
    }

    // noEnroll: current member of classA, deliberately NO Enrollment row.
    noEnrollStudentId = await upsertAnchorStudent(
      'marksanchor_noenroll@edu.com',
      'Anchor No Enrollment Student',
      noEnrollIndex,
      classAId
    );

    // ambiguous: current member of classA, with Enrollment rows in BOTH
    // classA and classC for YEAR.
    ambiguousStudentId = await upsertAnchorStudent(
      'marksanchor_ambiguous@edu.com',
      'Anchor Ambiguous Student',
      ambiguousIndex,
      classAId
    );
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: ambiguousStudentId, classId: classAId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: ambiguousStudentId, classId: classAId, enrolledAt, status: 'ACTIVE' },
    });
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: ambiguousStudentId, classId: classCId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: ambiguousStudentId, classId: classCId, enrolledAt, status: 'ACTIVE' },
    });

    // transfer: starts in classA with a normal single Enrollment there.
    transferStudentId = await upsertAnchorStudent(
      'marksanchor_transfer@edu.com',
      'Anchor Transfer Student',
      transferIndex,
      classAId
    );
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: transferStudentId, classId: classAId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: transferStudentId, classId: classAId, enrolledAt, status: 'ACTIVE' },
    });

    // valid: a plain, unambiguous single Enrollment in classA/YEAR.
    validStudentId = await upsertAnchorStudent(
      'marksanchor_valid@edu.com',
      'Anchor Valid Student',
      validIndex,
      classAId
    );
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: validStudentId, classId: classAId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: validStudentId, classId: classAId, enrolledAt, status: 'ACTIVE' },
    });

    // duplicate: starts in classA with a normal single Enrollment there,
    // exactly like "transfer" -- the second Enrollment (classB) is added
    // inside the 409 test itself, right before the conflicting write.
    duplicateStudentId = await upsertAnchorStudent(
      'marksanchor_duplicate@edu.com',
      'Anchor Duplicate Student',
      duplicateIndex,
      classAId
    );
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: duplicateStudentId, classId: classAId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: duplicateStudentId, classId: classAId, enrolledAt, status: 'ACTIVE' },
    });

    // duplicateImport: same shape as "duplicate", used by the CSV-import
    // version of the 409 test below.
    duplicateImportStudentId = await upsertAnchorStudent(
      'marksanchor_duplicateimport@edu.com',
      'Anchor Duplicate Import Student',
      duplicateImportIndex,
      classAId
    );
    await prisma.enrollment.upsert({
      where: { studentId_classId_enrolledAt: { studentId: duplicateImportStudentId, classId: classAId, enrolledAt } },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: duplicateImportStudentId, classId: classAId, enrolledAt, status: 'ACTIVE' },
    });

    await prisma.termMark.deleteMany({
      where: {
        studentId: {
          in: [
            noEnrollStudentId,
            ambiguousStudentId,
            transferStudentId,
            validStudentId,
            duplicateStudentId,
            duplicateImportStudentId,
          ],
        },
      },
    });

    teacherAToken = await login('marksanchor_teachera@edu.com');
    teacherBToken = await login('marksanchor_teacherb@edu.com');
  });

  afterAll(async () => {
    const allStudentIds = [
      noEnrollStudentId,
      ambiguousStudentId,
      transferStudentId,
      validStudentId,
      duplicateStudentId,
      duplicateImportStudentId,
    ];
    await prisma.termMark.deleteMany({ where: { studentId: { in: allStudentIds } } });
    // Enrollment is ON DELETE RESTRICT against both Student and Class, so it
    // must be torn down before either of those below.
    await prisma.enrollment.deleteMany({ where: { studentId: { in: allStudentIds } } });
    await prisma.student.deleteMany({ where: { userId: { in: studentUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: studentUserIds } } });
    await prisma.class.deleteMany({ where: { id: { in: [classAId, classBId, classCId] } } });
    await prisma.teacher.deleteMany({ where: { id: { in: [teacherATeacherId, teacherBTeacherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherAUserId, teacherBUserId] } } });
    // Subject rows are left in place: shared global catalogue (see
    // marksscope's afterAll comment above for the same reasoning).
    await prisma.$disconnect();
  });

  describe('POST /api/marks/import — enrollment resolution', () => {
    it('returns 404 when the student has no Enrollment for the CSV row\'s year', async () => {
      const csv = csvOf([{ studentIndexNumber: noEnrollIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 }]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe(`No enrollment found for student ${noEnrollIndex} in ${YEAR}`);
    });

    it('returns 400 when the student has two enrollments the teacher can act in for the same year', async () => {
      const csv = csvOf([{ studentIndexNumber: ambiguousIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 }]);
      const res = await request(app)
        .post('/api/marks/import')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .attach('file', Buffer.from(csv), 'marks.csv');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(`Multiple enrollments match student ${ambiguousIndex} in ${YEAR}, cannot resolve`);
    });
  });

  describe('POST /api/marks — createMark enrollment resolution', () => {
    it('returns 404 when the student has no Enrollment for the given year', async () => {
      const res = await request(app)
        .post('/api/marks')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentIndexNumber: noEnrollIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe(`No enrollment found for student ${noEnrollIndex} in ${YEAR}`);
    });

    it('returns 400 when the student has two enrollments the teacher can act in for the same year', async () => {
      const res = await request(app)
        .post('/api/marks')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentIndexNumber: ambiguousIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(`Multiple enrollments match student ${ambiguousIndex} in ${YEAR}, cannot resolve`);
    });
  });

  it('keeps marks visible to the recording teacher after the student transfers, and shows the new teacher only marks recorded under their own enrollment', async () => {
    // Pre-transfer: teacherA (owns classA) records a mark while the student
    // is still their enrollee.
    const preTransfer = await request(app)
      .post('/api/marks')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ studentIndexNumber: transferIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 });
    expect(preTransfer.status).toBe(201);

    // Transfer: student leaves classA (teacherA) and joins classB (teacherB).
    // classA's Enrollment row is left as-is (history), a new one is opened
    // for classB.
    await prisma.student.update({
      where: { id: transferStudentId },
      data: { classes: { disconnect: [{ id: classAId }], connect: [{ id: classBId }] } },
    });
    await prisma.enrollment.upsert({
      where: {
        studentId_classId_enrolledAt: { studentId: transferStudentId, classId: classBId, enrolledAt: new Date(Date.UTC(YEAR, 0, 1)) },
      },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: transferStudentId, classId: classBId, enrolledAt: new Date(Date.UTC(YEAR, 0, 1)), status: 'ACTIVE' },
    });

    // Post-transfer: teacherB (now owns the student's class) records a mark
    // for a different term, so it doesn't collide with the pre-transfer row
    // on the retained natural-key unique index.
    const postTransfer = await request(app)
      .post('/api/marks')
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ studentIndexNumber: transferIndex, subjectName: 'Mark Anchor Subject', term: 2, year: YEAR, marks: 85 });
    expect(postTransfer.status).toBe(201);

    const teacherAView = await request(app)
      .get('/api/marks/class-marks')
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(teacherAView.status).toBe(200);
    const teacherARows = teacherAView.body.filter((m: { studentIndexNumber: string }) => m.studentIndexNumber === transferIndex);
    // Teacher A still sees the mark recorded under their class's enrollment...
    expect(teacherARows.some((m: { term: number; marks: number }) => m.term === 1 && m.marks === 70)).toBe(true);
    // ...but not the mark recorded under the new teacher's enrollment.
    expect(teacherARows.some((m: { term: number }) => m.term === 2)).toBe(false);

    const teacherBView = await request(app)
      .get('/api/marks/class-marks')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(teacherBView.status).toBe(200);
    const teacherBRows = teacherBView.body.filter((m: { studentIndexNumber: string }) => m.studentIndexNumber === transferIndex);
    // The new teacher sees the mark recorded under their own enrollment...
    expect(teacherBRows.some((m: { term: number; marks: number }) => m.term === 2 && m.marks === 85)).toBe(true);
    // ...but not the mark recorded under teacher A's enrollment.
    expect(teacherBRows.some((m: { term: number }) => m.term === 1)).toBe(false);
  });

  it('returns 409 and writes no duplicate when the same subject/term/year is recorded under two different enrollments for the same student', async () => {
    // First write, under classA/teacherA's enrollment.
    const first = await request(app)
      .post('/api/marks')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ studentIndexNumber: duplicateIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 });
    expect(first.status).toBe(201);

    // Transfer to classB/teacherB, same as the visibility test above.
    await prisma.student.update({
      where: { id: duplicateStudentId },
      data: { classes: { disconnect: [{ id: classAId }], connect: [{ id: classBId }] } },
    });
    await prisma.enrollment.upsert({
      where: {
        studentId_classId_enrolledAt: { studentId: duplicateStudentId, classId: classBId, enrolledAt: new Date(Date.UTC(YEAR, 0, 1)) },
      },
      update: { status: 'ACTIVE', leftAt: null },
      create: { studentId: duplicateStudentId, classId: classBId, enrolledAt: new Date(Date.UTC(YEAR, 0, 1)), status: 'ACTIVE' },
    });

    // Second write: SAME subject/term/year, but resolves to classB's
    // enrollment (a different enrollmentId) -- the anchor key alone would
    // allow this, but the retained natural-key unique index must reject it.
    const second = await request(app)
      .post('/api/marks')
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ studentIndexNumber: duplicateIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 99 });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('A mark for this student/subject/term/year already exists under a different enrollment');

    const rows = await prisma.termMark.findMany({
      where: { studentId: duplicateStudentId, subject: { name: 'Mark Anchor Subject' }, term: 1, year: YEAR },
    });
    // Exactly the original row, unchanged -- no duplicate, no overwrite.
    expect(rows.length).toBe(1);
    expect(rows[0]!.marks).toBe(70);
  });

  it('returns 409 and writes no duplicate via POST /api/marks/import when the same subject/term/year is recorded under two different enrollments', async () => {
    // First write, under classA/teacherA's enrollment, via the CSV import path.
    const firstCsv = csvOf([
      { studentIndexNumber: duplicateImportIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 70 },
    ]);
    const first = await request(app)
      .post('/api/marks/import')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .attach('file', Buffer.from(firstCsv), 'marks.csv');
    expect(first.status).toBe(200);

    // Transfer to classB/teacherB, same as the createMark 409 test above.
    await prisma.student.update({
      where: { id: duplicateImportStudentId },
      data: { classes: { disconnect: [{ id: classAId }], connect: [{ id: classBId }] } },
    });
    await prisma.enrollment.upsert({
      where: {
        studentId_classId_enrolledAt: {
          studentId: duplicateImportStudentId,
          classId: classBId,
          enrolledAt: new Date(Date.UTC(YEAR, 0, 1)),
        },
      },
      update: { status: 'ACTIVE', leftAt: null },
      create: {
        studentId: duplicateImportStudentId,
        classId: classBId,
        enrolledAt: new Date(Date.UTC(YEAR, 0, 1)),
        status: 'ACTIVE',
      },
    });

    // Second write: SAME subject/term/year via import, but resolves to
    // classB's enrollment (a different enrollmentId) -- must be rejected by
    // the retained natural-key unique index, same as the createMark path.
    const secondCsv = csvOf([
      { studentIndexNumber: duplicateImportIndex, subjectName: 'Mark Anchor Subject', term: 1, year: YEAR, marks: 99 },
    ]);
    const second = await request(app)
      .post('/api/marks/import')
      .set('Authorization', `Bearer ${teacherBToken}`)
      .attach('file', Buffer.from(secondCsv), 'marks.csv');
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('A mark for this student/subject/term/year already exists under a different enrollment');

    const rows = await prisma.termMark.findMany({
      where: { studentId: duplicateImportStudentId, subject: { name: 'Mark Anchor Subject' }, term: 1, year: YEAR },
    });
    // Exactly the original row, unchanged -- no duplicate, no overwrite.
    expect(rows.length).toBe(1);
    expect(rows[0]!.marks).toBe(70);
  });

  it('writes no TermMark at all when one row of a multi-row import cannot resolve an enrollment (all-or-nothing)', async () => {
    const csv = csvOf([
      { studentIndexNumber: validIndex, subjectName: 'Mark Anchor Subject', term: 3, year: YEAR, marks: 95 },
      { studentIndexNumber: noEnrollIndex, subjectName: 'Mark Anchor Subject', term: 3, year: YEAR, marks: 40 },
    ]);
    const res = await request(app)
      .post('/api/marks/import')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .attach('file', Buffer.from(csv), 'marks.csv');
    expect(res.status).toBe(404);

    const written = await prisma.termMark.findFirst({
      where: { studentId: validStudentId, subject: { name: 'Mark Anchor Subject' }, term: 3, year: YEAR },
    });
    expect(written).toBeNull();
  });
});
