import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('API Smoke Tests', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });

  it('GET / should return running message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('EduProfile API is running!');
  });

  it('POST /api/auth/login should fail without credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    // Should get a validation error (e.g. 400 Bad Request)
    expect(res.status).toBe(400);
  });
});
