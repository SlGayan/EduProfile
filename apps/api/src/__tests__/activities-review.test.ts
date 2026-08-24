import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

describe('Activity submission and review endpoints', () => {
  let studentToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    studentToken = await login('student@edu.com');
    teacherToken = await login('teacher@edu.com');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a non-http(s) evidenceUrl', async () => {
    const res = await request(app)
      .post('/api/students/me/activities')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        activityName: 'Chess Club',
        activityType: 'Club',
        startDate: '2026-01-10',
        evidenceUrl: 'javascript:alert(1)',
      });
    expect(res.status).toBe(400);
  });

  it('accepts a well-formed http(s) evidenceUrl', async () => {
    const res = await request(app)
      .post('/api/students/me/activities')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        activityName: 'Chess Club',
        activityType: 'Club',
        startDate: '2026-01-10',
        evidenceUrl: 'https://example.com/proof.png',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  it('requires a teacherNote when requesting a correction', async () => {
    const created = await request(app)
      .post('/api/students/me/activities')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ activityName: 'Debate Club', activityType: 'Club', startDate: '2026-01-10' });

    const res = await request(app)
      .patch(`/api/activities/${created.body.id}/status`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'NEEDS_CORRECTION' });

    expect(res.status).toBe(400);
  });

  it('blocks a student from resubmitting a REJECTED activity', async () => {
    const created = await request(app)
      .post('/api/students/me/activities')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ activityName: 'Science Fair', activityType: 'Competition', startDate: '2026-01-10' });

    const reviewed = await request(app)
      .patch(`/api/activities/${created.body.id}/status`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'REJECTED', teacherNote: 'Insufficient evidence provided.' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe('REJECTED');

    const resubmit = await request(app)
      .patch(`/api/students/me/activities/${created.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ activityName: 'Science Fair (resubmitted)' });

    expect(resubmit.status).toBe(403);
  });

  it("lists a teacher's pending activities for their own class", async () => {
    await request(app)
      .post('/api/students/me/activities')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ activityName: 'Basketball Team', activityType: 'Sport', startDate: '2026-01-10' });

    const res = await request(app)
      .get('/api/teachers/me/pending-activities')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((a: { activityName: string }) => a.activityName === 'Basketball Team')).toBe(true);
  });
});
