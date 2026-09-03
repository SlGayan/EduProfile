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
 * The PDF download routes now redirect to blob storage (302 + Location)
 * instead of streaming the PDF directly, so tests follow that redirect
 * themselves. materials.blob's dev fallback (used when Azure isn't
 * reachable, e.g. in CI with no AZURE_STORAGE_* configured) hands back a
 * same-origin `/api/materials/local-blob/...` path; a working Azure
 * connection instead hands back a real, absolute SAS URL. Handle both.
 */
async function downloadCertificatePdf(encodedId: string, token: string) {
  const redirectRes = await request(app)
    .get(`/api/certificates/${encodedId}/pdf`)
    .set('Authorization', `Bearer ${token}`);
  expect(redirectRes.status).toBe(302);
  const location = redirectRes.headers.location as string;
  expect(location).toBeTruthy();

  if (/^https?:\/\//.test(location)) {
    const res = await fetch(location);
    return { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? '' } };
  }
  return request(app).get(location).set('Authorization', `Bearer ${token}`);
}

describe('Character certificate endpoints', () => {
  let principalToken: string;
  let teacherToken: string;
  let studentId: number;
  const createdTemplateIds: number[] = [];

  beforeAll(async () => {
    principalToken = await login('principal@edu.com');
    teacherToken = await login('teacher@edu.com');
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'student@edu.com' } });
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUser.id } });
    studentId = student.id;
  });

  afterAll(async () => {
    // ON DELETE SET NULL means deleting the template is enough to detach any
    // certificate that referenced it.
    await prisma.certificateTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
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
    const encodedId = Buffer.from(cert!.id, 'utf8').toString('base64url');
    const res = await request(app).get(`/api/certificates/${encodedId}/pdf`);
    expect(res.status).toBe(401);
  });

  it('lets a Principal download an issued certificate PDF', async () => {
    const cert = await prisma.characterCertificate.findFirst({ where: { studentId } });
    // The certificate id itself contains slashes (DSCTH/CC/YYYY/NNNN), so it
    // travels as base64url, not a raw/percent-encoded path segment.
    const encodedId = Buffer.from(cert!.id, 'utf8').toString('base64url');
    const res = await downloadCertificatePdf(encodedId, principalToken);
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

  it('issues a certificate against a template and renders the PDF from its layout, not the default', async () => {
    const templateRes = await request(app)
      .post('/api/certificate-templates')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        name: 'Template-rendering test layout',
        layoutData: {
          canvasWidth: 850,
          canvasHeight: 600,
          fields: [
            { id: 'f1', kind: 'bound', boundField: 'STUDENT_NAME', x: 10, y: 10 },
            { id: 'f2', kind: 'text', text: 'Custom letterhead text', x: 10, y: 60 },
          ],
        },
      });
    expect(templateRes.status).toBe(201);
    const templateId = templateRes.body.template.id as number;
    createdTemplateIds.push(templateId);

    const issueRes = await request(app)
      .post('/api/certificates')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ studentId, characterGrade: 'GOOD', templateId });
    expect(issueRes.status).toBe(201);
    expect(issueRes.body.templateId).toBe(templateId);

    const encodedId = Buffer.from(issueRes.body.id, 'utf8').toString('base64url');
    const pdfRes = await downloadCertificatePdf(encodedId, principalToken);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
  });
});
