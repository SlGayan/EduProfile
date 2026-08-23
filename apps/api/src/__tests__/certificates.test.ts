import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

describe('Character certificate endpoints', () => {
  let principalToken: string;
  let teacherToken: string;
  let studentId: number;

  beforeAll(async () => {
    principalToken = await login('principal@edu.com');
    teacherToken = await login('teacher@edu.com');
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'student@edu.com' } });
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUser.id } });
    studentId = student.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects certificate issuance from a non-Principal role', async () => {
    const res = await request(app)
      .post('/api/certificates')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentId, characterGrade: 'EXCELLENT' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid characterGrade value', async () => {
    const res = await request(app)
      .post('/api/certificates')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ studentId, characterGrade: 'NOT_A_REAL_GRADE' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array selectedActivities value', async () => {
    const res = await request(app)
      .post('/api/certificates')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ studentId, characterGrade: 'EXCELLENT', selectedActivities: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('lets a Principal issue a certificate with a well-formed reference number', async () => {
    const res = await request(app)
      .post('/api/certificates')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        studentId,
        characterGrade: 'EXCELLENT',
        studentAttributes: 'well-behaved',
        reasonForLeaving: 'completion of studies',
        academicSummary: 'Performed well academically.',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^DSCTH\/CC\/\d{4}\/\d{4}$/);
    // The full printed content must be captured in the immutable snapshot,
    // not only as separate mutable columns.
    expect(res.body.contentSnapshot.characterGrade).toBe('EXCELLENT');
    expect(res.body.contentSnapshot.studentAttributes).toBe('well-behaved');
  });

  it('requires authentication to download a certificate PDF', async () => {
    const cert = await prisma.characterCertificate.findFirst({ where: { studentId } });
    const res = await request(app).get(`/api/certificates/${encodeURIComponent(cert!.id)}/pdf`);
    expect(res.status).toBe(401);
  });

  it('lets a Principal download an issued certificate PDF', async () => {
    const cert = await prisma.characterCertificate.findFirst({ where: { studentId } });
    const res = await request(app)
      .get(`/api/certificates/${encodeURIComponent(cert!.id)}/pdf`)
      .set('Authorization', `Bearer ${principalToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('restricts the certificate-profile lookup to the Principal role', async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/certificate-profile`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('returns the aggregated profile for a Principal', async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/certificate-profile`)
      .set('Authorization', `Bearer ${principalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(studentId);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });
});
