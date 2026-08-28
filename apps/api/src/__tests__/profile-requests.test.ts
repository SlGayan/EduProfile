import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

describe('Teacher self-edit and student profile-request endpoints', () => {
  let teacherToken: string;
  let otherTeacherToken: string;
  let studentToken: string;

  let studentId: number;
  let createdRequestIds: number[] = [];

  beforeAll(async () => {
    // teacher@edu.com owns "Grade 10-A (Test)", which student@edu.com belongs
    // to. teacher1@edu.com owns a disjoint set of classes — used to exercise
    // the cross-class 404.
    teacherToken = await login('teacher@edu.com');
    otherTeacherToken = await login('teacher1@edu.com');
    studentToken = await login('student@edu.com');

    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'student@edu.com' } });
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUser.id } });
    studentId = student.id;
  });

  afterAll(async () => {
    // Clean up rows this suite created/mutated so re-runs stay idempotent.
    await prisma.profileEditRequest.deleteMany({ where: { studentId } });
    await prisma.student.update({
      where: { id: studentId },
      data: { phoneNumber: null, address: 'Test Address' },
    });
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@edu.com' } });
    await prisma.teacher.update({
      where: { userId: teacherUser.id },
      data: { displayName: null, phoneNumber: null, address: null },
    });
    await prisma.$disconnect();
  });

  describe('PATCH /api/teachers/me', () => {
    it('saves the teacher\'s own contact info immediately, with no approval step', async () => {
      const res = await request(app)
        .patch('/api/teachers/me')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ displayName: 'Ms. Perera', phoneNumber: '0771234567', address: '12 Lake Road' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        displayName: 'Ms. Perera',
        phoneNumber: '0771234567',
        address: '12 Lake Road',
      });

      const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@edu.com' } });
      const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
      expect(teacher.displayName).toBe('Ms. Perera');
      expect(teacher.phoneNumber).toBe('0771234567');
    });

    it('rejects an empty payload', async () => {
      const res = await request(app)
        .patch('/api/teachers/me')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects a phoneNumber that is not exactly 10 digits', async () => {
      const res = await request(app)
        .patch('/api/teachers/me')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ phoneNumber: '077123456' }); // 9 digits

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/students/me/profile-requests', () => {
    it('rejects a phoneNumber that is not exactly 10 digits', async () => {
      const res = await request(app)
        .post('/api/students/me/profile-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ phoneNumber: '071-987-6543' }); // has separators

      expect(res.status).toBe(400);
    });

    it('rejects a submission with neither phoneNumber nor address', async () => {
      const res = await request(app)
        .post('/api/students/me/profile-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('creates a PENDING request when at least one field is provided', async () => {
      const res = await request(app)
        .post('/api/students/me/profile-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ phoneNumber: '0719876543' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.requestedPhoneNumber).toBe('0719876543');
      createdRequestIds.push(Number(res.body.id));
    });

    it('rejects a second submission while one is still PENDING', async () => {
      const res = await request(app)
        .post('/api/students/me/profile-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ address: '99 New Street' });

      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /api/teachers/profile-requests/:id', () => {
    it('returns 404 when the reviewing teacher does not share a class with the student', async () => {
      const pendingId = createdRequestIds[0]!;

      const res = await request(app)
        .patch(`/api/teachers/profile-requests/${pendingId}`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(404);

      // Confirm the request is untouched — still reviewable in later tests.
      const stillPending = await prisma.profileEditRequest.findUniqueOrThrow({ where: { id: pendingId } });
      expect(stillPending.status).toBe('PENDING');
    });

    it('rejects a rejection without a teacherNote', async () => {
      const pendingId = createdRequestIds[0]!;

      const res = await request(app)
        .patch(`/api/teachers/profile-requests/${pendingId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(400);
    });

    it('approves a request, applying the requested fields to the Student record', async () => {
      const pendingId = createdRequestIds[0]!;

      const res = await request(app)
        .patch(`/api/teachers/profile-requests/${pendingId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');

      const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
      expect(student.phoneNumber).toBe('0719876543');
    });

    it('rejects a request with a note, leaving the Student record unchanged', async () => {
      // The prior APPROVED request cleared the PENDING slot, so a fresh
      // submission is needed to exercise the reject path.
      const submitRes = await request(app)
        .post('/api/students/me/profile-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ address: '42 Rejected Ave' });
      expect(submitRes.status).toBe(201);
      const newRequestId = Number(submitRes.body.id);
      createdRequestIds.push(newRequestId);

      const res = await request(app)
        .patch(`/api/teachers/profile-requests/${newRequestId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ status: 'REJECTED', teacherNote: 'Please provide a verifiable address.' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');

      const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
      expect(student.address).not.toBe('42 Rejected Ave');
    });
  });
});
