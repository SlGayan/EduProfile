import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

describe('Teacher subject assignment endpoints', () => {
  let adminToken: string;
  let principalToken: string;
  let teacherToken: string;
  let studentToken: string;
  let teacher2Token: string;

  let teacherId: number;
  let subjectId: number;
  let classId: number;

  beforeAll(async () => {
    adminToken = await login('admin@edu.com');
    principalToken = await login('principal@edu.com');
    teacherToken = await login('teacher@edu.com');
    studentToken = await login('student@edu.com');
    teacher2Token = await login('teacher2@edu.com');

    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@edu.com' } });
    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
    teacherId = teacher.id;

    const subject = await prisma.subject.findFirstOrThrow();
    subjectId = subject.id;

    // A class the seeded teacher does NOT own, so the "coexist harmlessly"
    // acceptance criterion can be exercised separately from a plain create.
    const otherClass = await prisma.class.findFirst({ where: { teacherId: { not: teacher.id } } });
    classId = otherClass ? otherClass.id : (await prisma.class.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    // Clean up any assignments this suite created so re-runs stay idempotent.
    await prisma.teacherSubjectAssignment.deleteMany({ where: { teacherId } });
    await prisma.$disconnect();
  });

  it('rejects non-admin/principal callers on create', async () => {
    const teacherRes = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ teacherId, subjectId, classId });
    expect(teacherRes.status).toBe(403);
    expect(teacherRes.body).toEqual({ error: 'Insufficient permissions' });

    const studentRes = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ teacherId, subjectId, classId });
    expect(studentRes.status).toBe(403);
  });

  it('returns 404 for a non-existent teacher/subject/class', async () => {
    const badTeacher = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: 999999, subjectId, classId });
    expect(badTeacher.status).toBe(404);
    expect(badTeacher.body).toEqual({ error: 'Teacher not found' });

    const badSubject = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId, subjectId: 999999, classId });
    expect(badSubject.status).toBe(404);
    expect(badSubject.body).toEqual({ error: 'Subject not found' });

    const badClass = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId, subjectId, classId: 999999 });
    expect(badClass.status).toBe(404);
    expect(badClass.body).toEqual({ error: 'Class not found' });
  });

  it('creates a valid assignment as Admin, then rejects the duplicate as Principal with 409', async () => {
    const created = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId, subjectId, classId });
    expect(created.status).toBe(201);
    expect(created.body.assignment).toMatchObject({ teacherId, subjectId, classId });

    const duplicate = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ teacherId, subjectId, classId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'Assignment already exists' });

    const rows = await prisma.teacherSubjectAssignment.findMany({ where: { teacherId, subjectId, classId } });
    expect(rows).toHaveLength(1);
  });

  it('succeeds when assigning a teacher to a subject in a class they already own', async () => {
    const ownedClass = await prisma.class.findFirstOrThrow({ where: { teacherId } });
    const otherSubject = await prisma.subject.findFirstOrThrow({ where: { id: { not: subjectId } } });

    const res = await request(app)
      .post('/api/teacher-subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId, subjectId: otherSubject.id, classId: ownedClass.id });

    expect(res.status).toBe(201);
    expect(res.body.assignment).toMatchObject({ teacherId, subjectId: otherSubject.id, classId: ownedClass.id });
  });

  it('includes a warning field on the 4th+ active assignment for the same teacher, without blocking it', async () => {
    const subjects = await prisma.subject.findMany({ take: 4 });
    expect(subjects.length).toBeGreaterThanOrEqual(4);
    const classes = await prisma.class.findMany({ take: 4 });
    expect(classes.length).toBeGreaterThanOrEqual(4);

    let lastRes;
    for (let i = 0; i < 4; i++) {
      lastRes = await request(app)
        .post('/api/teacher-subject-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ teacherId, subjectId: subjects[i]!.id, classId: classes[i]!.id });
      expect(lastRes.status).toBe(201);
    }

    // By this point teacherId has at least 6 assignments from prior tests in
    // this suite plus these 4, so the final create is well past the soft cap.
    expect(lastRes!.body.warning).toBeDefined();
    expect(typeof lastRes!.body.warning).toBe('string');
  });

  it('lists assignments for a class, empty array when none exist', async () => {
    const emptyClass = await prisma.class.create({ data: { name: 'Empty Assignments Class (test)', year: 2025 } });

    const emptyRes = await request(app)
      .get(`/api/classes/${emptyClass.id}/subject-assignments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.assignments).toEqual([]);

    const listRes = await request(app)
      .get(`/api/classes/${classId}/subject-assignments`)
      .set('Authorization', `Bearer ${principalToken}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.assignments)).toBe(true);
    expect(listRes.body.assignments.some((a: { teacherId: number; subjectId: number }) => a.teacherId === teacherId && a.subjectId === subjectId)).toBe(true);

    await prisma.class.delete({ where: { id: emptyClass.id } });
  });

  it('rejects non-admin/principal callers on the class list endpoint', async () => {
    const res = await request(app)
      .get(`/api/classes/${classId}/subject-assignments`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('deletes an assignment, then 404s on repeat delete', async () => {
    const toDelete = await prisma.teacherSubjectAssignment.findFirstOrThrow({ where: { teacherId, subjectId, classId } });

    const del = await request(app)
      .delete(`/api/teacher-subject-assignments/${toDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const redel = await request(app)
      .delete(`/api/teacher-subject-assignments/${toDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(redel.status).toBe(404);
    expect(redel.body).toEqual({ error: 'Assignment not found' });
  });

  it('rejects non-admin/principal callers on delete', async () => {
    const res = await request(app)
      .delete('/api/teacher-subject-assignments/1')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 409 when deleting a class with active subject-teaching assignments (FK constraint)', async () => {
    const classWithAssignment = await prisma.class.create({ data: { name: 'FK Delete Test Class (test)', year: 2025 } });
    await prisma.teacherSubjectAssignment.create({
      data: { teacherId, subjectId, classId: classWithAssignment.id },
    });

    const res = await request(app)
      .delete(`/api/classes/${classWithAssignment.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Cannot delete class with active subject-teaching assignments' });

    // Cleanup: remove the blocking assignment first, then the class.
    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId: classWithAssignment.id } });
    await prisma.class.delete({ where: { id: classWithAssignment.id } });
  });

  it('still deletes a class with zero subject-teaching assignments (200, regression check)', async () => {
    const emptyClass = await prisma.class.create({ data: { name: 'No Assignments Delete Test Class (test)', year: 2025 } });

    const res = await request(app)
      .delete(`/api/classes/${emptyClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Class successfully deleted' });
  });

  it("returns the authenticated teacher's own subject assignments", async () => {
    const assignedClass = await prisma.class.create({ data: { name: 'Me Endpoint Test Class (test)', year: 2025 } });
    await prisma.teacherSubjectAssignment.create({
      data: { teacherId, subjectId, classId: assignedClass.id },
    });

    const res = await request(app)
      .get('/api/teachers/me/subject-assignments')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.some(
        (a: { classId: string; className: string; subjectId: string; subjectName: string }) =>
          a.classId === String(assignedClass.id) && a.subjectId === String(subjectId) && !!a.className && !!a.subjectName
      )
    ).toBe(true);

    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId: assignedClass.id } });
    await prisma.class.delete({ where: { id: assignedClass.id } });
  });

  it('returns an empty array for a teacher with no subject assignments', async () => {
    const res = await request(app)
      .get('/api/teachers/me/subject-assignments')
      .set('Authorization', `Bearer ${teacher2Token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rejects non-teacher callers on the me/subject-assignments endpoint', async () => {
    const adminRes = await request(app)
      .get('/api/teachers/me/subject-assignments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(403);

    const studentRes = await request(app)
      .get('/api/teachers/me/subject-assignments')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentRes.status).toBe(403);
  });

  it('returns 403 for a TEACHER-role user with no linked Teacher profile', async () => {
    const bcrypt = await import('bcrypt');
    const orphanUser = await prisma.user.create({
      data: {
        email: 'orphan-teacher-role-test@edu.com',
        password: await bcrypt.hash('password123', 10),
        role: 'TEACHER',
      },
    });

    try {
      const orphanToken = await login(orphanUser.email);
      const res = await request(app)
        .get('/api/teachers/me/subject-assignments')
        .set('Authorization', `Bearer ${orphanToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Teacher profile not found' });
    } finally {
      await prisma.user.delete({ where: { id: orphanUser.id } });
    }
  });

  describe('GET /api/subjects role gate', () => {
    it('allows PRINCIPAL, ADMINISTRATOR, and TEACHER, and rejects STUDENT', async () => {
      const principalRes = await request(app)
        .get('/api/subjects')
        .set('Authorization', `Bearer ${principalToken}`);
      expect(principalRes.status).toBe(200);
      expect(Array.isArray(principalRes.body)).toBe(true);

      const adminRes = await request(app)
        .get('/api/subjects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(Array.isArray(adminRes.body)).toBe(true);

      const teacherRes = await request(app)
        .get('/api/subjects')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(teacherRes.status).toBe(200);
      expect(Array.isArray(teacherRes.body)).toBe(true);

      const studentRes = await request(app)
        .get('/api/subjects')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentRes.status).toBe(403);
    });
  });
});
