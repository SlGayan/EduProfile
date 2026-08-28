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

    await prisma.termMark.deleteMany({ where: { studentId, year: YEAR, term: TERM } });

    ownerToken = await login('marksscope_owner@edu.com');
    assignedToken = await login('marksscope_assigned@edu.com');
    outsiderToken = await login('marksscope_outsider@edu.com');
  });

  afterAll(async () => {
    await prisma.termMark.deleteMany({ where: { studentId } });
    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId } });
    await prisma.student.deleteMany({ where: { userId: studentUserId } });
    await prisma.user.deleteMany({ where: { id: studentUserId } });
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
