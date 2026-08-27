import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

/**
 * Covers Story 12.8's CRUD endpoints for CertificateTemplate: strict
 * Admin/Principal-only RBAC, plus create/read/update/delete behavior.
 * Uses the seeded admin/principal/teacher/student accounts (same as
 * teacher-subject-assignments.test.ts) since this resource has no
 * class/student fixtures of its own to build.
 */
describe('Certificate template endpoints (Story 12.8)', () => {
  let adminToken: string;
  let principalToken: string;
  let teacherToken: string;
  let studentToken: string;

  const createdIds: number[] = [];

  beforeAll(async () => {
    adminToken = await login('admin@edu.com');
    principalToken = await login('principal@edu.com');
    teacherToken = await login('teacher@edu.com');
    studentToken = await login('student@edu.com');
  });

  afterAll(async () => {
    await prisma.certificateTemplate.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  describe('RBAC: only ADMINISTRATOR and PRINCIPAL may access any endpoint', () => {
    it('rejects TEACHER and STUDENT on every CRUD endpoint with 403', async () => {
      for (const token of [teacherToken, studentToken]) {
        const create = await request(app)
          .post('/api/certificate-templates')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Should Not Be Created', layoutData: {} });
        expect(create.status).toBe(403);

        const list = await request(app)
          .get('/api/certificate-templates')
          .set('Authorization', `Bearer ${token}`);
        expect(list.status).toBe(403);

        const getOne = await request(app)
          .get('/api/certificate-templates/1')
          .set('Authorization', `Bearer ${token}`);
        expect(getOne.status).toBe(403);

        const update = await request(app)
          .patch('/api/certificate-templates/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Hijacked' });
        expect(update.status).toBe(403);

        const del = await request(app)
          .delete('/api/certificate-templates/1')
          .set('Authorization', `Bearer ${token}`);
        expect(del.status).toBe(403);
      }
    });

    it('rejects requests with no auth token at all with 401', async () => {
      const res = await request(app).get('/api/certificate-templates');
      expect(res.status).toBe(401);
    });
  });

  // Matches the shape apps/web/lib/certificateTemplates.ts actually produces
  // (TemplateLayoutData: canvasWidth/canvasHeight + TemplateField[]), which
  // the API's zod schema now enforces.
  const validLayoutData = {
    canvasWidth: 850,
    canvasHeight: 600,
    fields: [{ id: 'f1', kind: 'bound', boundField: 'STUDENT_NAME', x: 10, y: 20 }],
  };
  const emptyLayoutData = { canvasWidth: 850, canvasHeight: 600, fields: [] };

  describe('POST /api/certificate-templates', () => {
    it('creates a template as ADMINISTRATOR', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Admin Test Template', layoutData: validLayoutData });

      expect(res.status).toBe(201);
      expect(res.body.template).toMatchObject({ name: 'Admin Test Template' });
      expect(res.body.template.layoutData).toEqual(validLayoutData);
      createdIds.push(Number(res.body.template.id));
    });

    it('creates a template as PRINCIPAL', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({ name: 'Principal Test Template', layoutData: emptyLayoutData });

      expect(res.status).toBe(201);
      expect(res.body.template).toMatchObject({ name: 'Principal Test Template' });
      createdIds.push(Number(res.body.template.id));
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ layoutData: emptyLayoutData });
      expect(res.status).toBe(400);
    });

    it('returns 400 when name is whitespace-only', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ', layoutData: emptyLayoutData });
      expect(res.status).toBe(400);
    });

    it('returns 400 when layoutData is missing', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Layout' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when layoutData has an invalid shape', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Layout', layoutData: {} });
      expect(res.status).toBe(400);
    });

    it('returns 400 when layoutData is null', async () => {
      const res = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Null Layout', layoutData: null });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/certificate-templates', () => {
    it('lists templates including ones created above', async () => {
      const res = await request(app)
        .get('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.templates)).toBe(true);
      expect(
        res.body.templates.some((t: { id: string; name: string }) => createdIds.includes(Number(t.id)))
      ).toBe(true);
    });
  });

  describe('GET /api/certificate-templates/:id', () => {
    it('fetches a single template by id', async () => {
      const id = createdIds[0];
      const res = await request(app)
        .get(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${principalToken}`);
      expect(res.status).toBe(200);
      expect(Number(res.body.template.id)).toBe(id);
    });

    it('returns 404 for a non-existent id', async () => {
      const res = await request(app)
        .get('/api/certificate-templates/999999999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-numeric id', async () => {
      const res = await request(app)
        .get('/api/certificate-templates/not-a-number')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/certificate-templates/:id', () => {
    it('updates the name only, leaving layoutData untouched', async () => {
      const id = createdIds[0]!;
      const before = await prisma.certificateTemplate.findUniqueOrThrow({ where: { id } });

      const res = await request(app)
        .patch(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed Admin Test Template' });

      expect(res.status).toBe(200);
      expect(res.body.template.name).toBe('Renamed Admin Test Template');
      expect(res.body.template.layoutData).toEqual(before.layoutData);
    });

    it('updates layoutData only, leaving name untouched', async () => {
      const id = createdIds[1]!;
      const before = await prisma.certificateTemplate.findUniqueOrThrow({ where: { id } });

      const newLayoutData = {
        canvasWidth: 850,
        canvasHeight: 600,
        fields: [{ id: 'f2', kind: 'text', text: 'Congratulations', x: 5, y: 5 }],
      };
      const res = await request(app)
        .patch(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({ layoutData: newLayoutData });

      expect(res.status).toBe(200);
      expect(res.body.template.name).toBe(before.name);
      expect(res.body.template.layoutData).toEqual(newLayoutData);
    });

    it('returns 400 when the body is empty', async () => {
      const id = createdIds[0];
      const res = await request(app)
        .patch(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent id', async () => {
      const res = await request(app)
        .patch('/api/certificate-templates/999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/certificate-templates/:id', () => {
    it('deletes a template, then 404s on repeat delete and subsequent get', async () => {
      const create = await request(app)
        .post('/api/certificate-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Delete Me Template', layoutData: emptyLayoutData });
      expect(create.status).toBe(201);
      const id = Number(create.body.template.id);

      const del = await request(app)
        .delete(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(200);

      const redel = await request(app)
        .delete(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(redel.status).toBe(404);

      const getAfter = await request(app)
        .get(`/api/certificate-templates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getAfter.status).toBe(404);
    });
  });
});
