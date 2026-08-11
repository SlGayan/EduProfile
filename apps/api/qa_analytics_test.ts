/**
 * Live verification for Story 10.1 — Academic Performance Analytics endpoints.
 *
 * `apps/api` has no test runner (`npm test` is a stub), so verification follows
 * the `qa_test.ts` precedent: mint JWTs against APP_JWT_SECRET, drive the real
 * server over HTTP, assert, then clean up every row this script created.
 *
 * Run:  cd apps/api && npx tsx qa_analytics_test.ts
 * The API server MUST be restarted first — the dev script is `tsx src/server.ts`,
 * not `tsx watch`, so a running process serves a stale route table.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
// Override with QA_API_ROOT to drive a server on another port without having to
// stop whichever instance is already holding :8000.
const API_ROOT = process.env.QA_API_ROOT ?? 'http://localhost:8000';
const BASE = `${API_ROOT}/api/analytics`;
const SECRET = process.env.APP_JWT_SECRET;

if (!SECRET) {
  console.error('APP_JWT_SECRET is not set — cannot mint test tokens.');
  process.exit(1);
}

const TAG = `qa10_1_${Date.now()}`;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
    if (detail !== undefined) console.error(`        got: ${JSON.stringify(detail)}`);
  }
}

function token(userId: number, role: string) {
  return jwt.sign({ id: userId, role }, SECRET as string, { expiresIn: '15m' });
}

async function get(path: string, bearer?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Created ids, torn down in reverse-dependency order. */
const created = {
  userIds: [] as number[],
  studentIds: [] as number[],
  teacherIds: [] as number[],
  classIds: [] as number[],
  subjectIds: [] as number[],
};

async function makeUser(role: 'TEACHER' | 'STUDENT' | 'PRINCIPAL' | 'ADMINISTRATOR', n: number) {
  const user = await prisma.user.create({
    data: { email: `${TAG}.${role.toLowerCase()}${n}@edu.test`, password: 'x', role },
  });
  created.userIds.push(user.id);
  return user;
}

async function setup() {
  console.log(`Setting up fixtures (tag ${TAG})...`);

  const [uTeacherA, uTeacherB, uPrincipal, uAdmin] = [
    await makeUser('TEACHER', 1),
    await makeUser('TEACHER', 2),
    await makeUser('PRINCIPAL', 1),
    await makeUser('ADMINISTRATOR', 1),
  ];

  const teacherA = await prisma.teacher.create({ data: { userId: uTeacherA.id } });
  const teacherB = await prisma.teacher.create({ data: { userId: uTeacherB.id } });
  created.teacherIds.push(teacherA.id, teacherB.id);

  const classA = await prisma.class.create({
    data: { name: `${TAG}-A`, year: 2026, teacherId: teacherA.id },
  });
  const classB = await prisma.class.create({
    data: { name: `${TAG}-B`, year: 2026, teacherId: teacherB.id },
  });
  const classEmpty = await prisma.class.create({
    data: { name: `${TAG}-Empty`, year: 2026, teacherId: teacherA.id },
  });
  created.classIds.push(classA.id, classB.id, classEmpty.id);

  const math = await prisma.subject.create({ data: { name: `${TAG}-Math` } });
  const sci = await prisma.subject.create({ data: { name: `${TAG}-Sci` } });
  created.subjectIds.push(math.id, sci.id);

  async function makeStudent(n: number, classIds: number[], deleted = false) {
    const u = await prisma.user.create({
      data: {
        email: `${TAG}.student${n}@edu.test`,
        password: 'x',
        role: 'STUDENT',
        deletedAt: deleted ? new Date() : null,
      },
    });
    created.userIds.push(u.id);
    const s = await prisma.student.create({
      data: {
        userId: u.id,
        fullName: `${TAG} Student ${n}`,
        indexNumber: `${TAG}-${n}`,
        dateOfBirth: new Date('2010-01-01'),
        address: 'test',
        classes: { connect: classIds.map((id) => ({ id })) },
      },
    });
    created.studentIds.push(s.id);
    return { user: u, student: s };
  }

  const s1 = await makeStudent(1, [classA.id]);
  const s2 = await makeStudent(2, [classA.id]);
  // Soft-deleted student in classA. Their mark must be EXCLUDED from averages.
  const s3 = await makeStudent(3, [classA.id], true);
  const s4 = await makeStudent(4, [classB.id]);
  const s5 = await makeStudent(5, [classEmpty.id]);
  // Active, enrolled in classA, NO marks. Without this the "students with marks"
  // and "students enrolled" readings of studentCount coincide and the defect
  // the review found is undetectable. classA is now 3 enrolled / 2 scored.
  const s6 = await makeStudent(6, [classA.id]);

  const marks: Array<[number, number, number, number, number]> = [
    // studentId, subjectId, term, year, marks
    [s1.student.id, math.id, 1, 2026, 80],
    [s2.student.id, math.id, 1, 2026, 60], // Math t1 avg = 70 over 2
    [s1.student.id, math.id, 2, 2026, 90],
    [s2.student.id, math.id, 2, 2026, 70], // Math t2 avg = 80 over 2
    [s1.student.id, sci.id, 1, 2026, 50],
    [s2.student.id, sci.id, 1, 2026, 55], // Sci  t1 avg = 52.5 over 2
    [s3.student.id, math.id, 1, 2026, 0], // soft-deleted — must not drag Math t1 to 46.67
    [s4.student.id, math.id, 1, 2026, 100], // classB only
    [s1.student.id, math.id, 1, 2025, 10], // prior year — for the ?year= filter
  ];
  for (const [studentId, subjectId, term, year, m] of marks) {
    await prisma.termMark.create({ data: { studentId, subjectId, term, year, marks: m } });
  }

  return {
    tokens: {
      teacherA: token(uTeacherA.id, 'teacher'),
      teacherB: token(uTeacherB.id, 'teacher'),
      principal: token(uPrincipal.id, 'principal'),
      admin: token(uAdmin.id, 'admin'),
      student: token(s1.user.id, 'student'),
    },
    classA,
    classB,
    classEmpty,
    math,
    sci,
    s1,
    s2,
    s5,
    s6,
  };
}

async function teardown() {
  console.log('\nCleaning up fixtures...');
  await prisma.termMark.deleteMany({ where: { studentId: { in: created.studentIds } } });
  for (const id of created.studentIds) {
    await prisma.student.update({ where: { id }, data: { classes: { set: [] } } });
  }
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
  await prisma.class.deleteMany({ where: { id: { in: created.classIds } } });
  await prisma.teacher.deleteMany({ where: { id: { in: created.teacherIds } } });
  await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
}

async function run() {
  const fx = await setup();
  const { tokens } = fx;

  console.log('\n--- AC1: class analytics for the assigned teacher ---');
  {
    const r = await get(`/class/${fx.classA.id}`, tokens.teacherA);
    check('AC1 teacher on own class -> 200', r.status === 200, r.status);
    check('AC1 echoes classId', r.body?.classId === fx.classA.id, r.body?.classId);
    check('AC1 echoes className', r.body?.className === fx.classA.name, r.body?.className);

    // Four groups, not three: AC1 aggregates across YEARS as well as terms, so
    // student 1's 2025 Math mark forms its own (subject, term, year) group.
    const avgs: any[] = r.body?.subjectAverages ?? [];
    check('AC1 four subject/term/year groups', avgs.length === 4, avgs.length);

    const mathT1Prior = avgs.find(
      (a) => a.subject === fx.math.name && a.term === 1 && a.year === 2025
    );
    check('AC1 prior-year group is separate, average = 10', mathT1Prior?.average === 10, mathT1Prior);
    check('AC1 prior-year markCount = 1', mathT1Prior?.markCount === 1, mathT1Prior?.markCount);

    const mathT1 = avgs.find((a) => a.subject === fx.math.name && a.term === 1 && a.year === 2026);
    check('AC1 Math t1 average = 70 (soft-deleted student excluded)', mathT1?.average === 70, mathT1);
    check('AC1 Math t1 markCount = 2', mathT1?.markCount === 2, mathT1?.markCount);

    const mathT2 = avgs.find((a) => a.subject === fx.math.name && a.term === 2 && a.year === 2026);
    check('AC1 Math t2 average = 80', mathT2?.average === 80, mathT2);

    const sciT1 = avgs.find((a) => a.subject === fx.sci.name && a.term === 1 && a.year === 2026);
    check('AC1 Sci t1 average = 52.5 (fractional avg preserved)', sciT1?.average === 52.5, sciT1);

    const prog: any[] = r.body?.studentProgress ?? [];
    check('AC1 two students with progress (soft-deleted excluded)', prog.length === 2, prog.length);
    const p1 = prog.find((p) => p.studentId === fx.s1.student.id);
    check('AC1 student 1 has 4 marks incl. prior year', p1?.marks?.length === 4, p1?.marks?.length);
    check(
      'AC1 student progress ordered by year then term',
      p1?.marks?.[0]?.year === 2025,
      p1?.marks?.[0]
    );
    check('AC1 progress carries indexNumber', typeof p1?.indexNumber === 'string', p1?.indexNumber);
  }

  console.log('\n--- AC3: teacher scoping ---');
  {
    const r = await get(`/class/${fx.classB.id}`, tokens.teacherA);
    check('AC3 teacher on a class they do NOT own -> 403', r.status === 403, r.status);
    const own = await get(`/class/${fx.classB.id}`, tokens.teacherB);
    check('AC3 the owning teacher still gets 200', own.status === 200, own.status);
  }

  console.log('\n--- AC4: role restrictions ---');
  {
    const s1 = await get(`/class/${fx.classA.id}`, tokens.student);
    check('AC4 student on class analytics -> 403', s1.status === 403, s1.status);
    const s2 = await get('/school', tokens.student);
    check('AC4 student on school analytics -> 403', s2.status === 403, s2.status);
    const t = await get('/school', tokens.teacherA);
    check('AC4 teacher on school analytics -> 403', t.status === 403, t.status);
    const p = await get(`/class/${fx.classA.id}`, tokens.principal);
    check('AC4 principal on any class -> 200', p.status === 200, p.status);
    const a = await get(`/class/${fx.classA.id}`, tokens.admin);
    check('AC4 admin on any class -> 200 (no "Teacher profile not found")', a.status === 200, a.body);
    const anon = await get(`/class/${fx.classA.id}`);
    check('no token -> 401', anon.status === 401, anon.status);
  }

  console.log('\n--- AC2: school analytics ---');
  {
    const p = await get('/school', tokens.principal);
    check('AC2 principal -> 200', p.status === 200, p.status);
    check('AC2 scope echoed', p.body?.scope !== undefined, p.body?.scope);
    check('AC2 has subjectAverages', Array.isArray(p.body?.subjectAverages), p.body?.subjectAverages);
    check('AC2 has classBreakdown', Array.isArray(p.body?.classBreakdown), p.body?.classBreakdown);

    const a = await get('/school', tokens.admin);
    check('AC2 administrator -> 200', a.status === 200, a.status);

    const scoped = await get(`/school?classId=${fx.classA.id}`, tokens.principal);
    check('AC2 ?classId= -> 200', scoped.status === 200, scoped.status);
    const breakdown: any[] = scoped.body?.classBreakdown ?? [];
    check('AC2 ?classId= narrows breakdown to one class', breakdown.length === 1, breakdown.length);
    check(
      'AC2 studentCount = 3 ENROLLED (2 scored + 1 markless; soft-deleted excluded)',
      breakdown[0]?.studentCount === 3,
      breakdown[0]
    );
    check('AC2 scoredStudentCount = 2 is reported separately', breakdown[0]?.scoredStudentCount === 2, breakdown[0]);
    check('AC2 breakdown markCount = 7 (all years)', breakdown[0]?.markCount === 7, breakdown[0]);

    const byYear = await get(`/school?classId=${fx.classA.id}&year=2025`, tokens.principal);
    const b2: any[] = byYear.body?.classBreakdown ?? [];
    check('AC2 ?year= narrows to the one 2025 mark', b2[0]?.markCount === 1, b2[0]);
    check('AC2 ?year= average = 10', b2[0]?.average === 10, b2[0]);
    check('AC2 scope reflects the year filter', byYear.body?.scope?.year === 2025, byYear.body?.scope);
    check(
      'AC2 ?year= still reports all 3 enrolled students, not just the scored one',
      b2[0]?.studentCount === 3,
      b2[0]
    );
  }

  console.log('\n--- Review patches: breakdown roster, totals, 404 parity ---');
  {
    // A class with zero marks must still appear — it is exactly the class a
    // principal needs to notice. Previously the roster came from marks only.
    const empty = await get(`/school?classId=${fx.classEmpty.id}`, tokens.principal);
    check('zero-mark class -> 200', empty.status === 200, empty.status);
    const row = (empty.body?.classBreakdown ?? [])[0];
    check('zero-mark class IS present in classBreakdown', row?.classId === fx.classEmpty.id, row);
    check('zero-mark class average is null, not 0', row?.average === null, row);
    check('zero-mark class markCount = 0', row?.markCount === 0, row);
    check('zero-mark class still reports its 1 enrolled student', row?.studentCount === 1, row);
    check('fixture sanity: s5 is that enrolled student', typeof fx.s5.student.id === 'number');

    // 404 parity with /class/:classId — an empty 200 was indistinguishable
    // from a real class that simply has no marks yet.
    const ghost = await get('/school?classId=999999999', tokens.principal);
    check('/school?classId=<nonexistent> -> 404 (parity with /class/:id)', ghost.status === 404, ghost.status);

    // School-level totals: summing classBreakdown does NOT reproduce these.
    const all = await get(`/school?classId=${fx.classA.id}`, tokens.principal);
    check('totals block present', all.body?.totals !== undefined, all.body?.totals);
    check('totals.markCount = 7', all.body?.totals?.markCount === 7, all.body?.totals);
    check('totals.studentCount = 2 (distinct scorers)', all.body?.totals?.studentCount === 2, all.body?.totals);
  }

  console.log('\n--- Review patch: ?year= / ?term= on /class/:classId ---');
  {
    const y = await get(`/class/${fx.classA.id}?year=2026`, tokens.teacherA);
    check('?year=2026 -> 200', y.status === 200, y.status);
    check('?year= echoed in scope', y.body?.scope?.year === 2026, y.body?.scope);
    const yAvgs: any[] = y.body?.subjectAverages ?? [];
    check('?year=2026 drops the 2025 group (3 not 4)', yAvgs.length === 3, yAvgs.length);
    check('?year=2026 excludes the 2025 mark', !yAvgs.some((a) => a.year === 2025), yAvgs);

    const t = await get(`/class/${fx.classA.id}?year=2026&term=1`, tokens.teacherA);
    check('?term=1 -> 200', t.status === 200, t.status);
    const tAvgs: any[] = t.body?.subjectAverages ?? [];
    check('?year=2026&term=1 leaves Math t1 + Sci t1 only', tAvgs.length === 2, tAvgs.length);
    check('?term= echoed in scope', t.body?.scope?.term === 1, t.body?.scope);
    const p1 = (t.body?.studentProgress ?? []).find((p: any) => p.studentId === fx.s1.student.id);
    check('?term= also narrows studentProgress', p1?.marks?.length === 2, p1?.marks?.length);

    check('?term=4 out of range -> 400', (await get(`/class/${fx.classA.id}?term=4`, tokens.teacherA)).status === 400);
    check('?term=0 out of range -> 400', (await get(`/class/${fx.classA.id}?term=0`, tokens.teacherA)).status === 400);
    check('?year=1999 out of range -> 400', (await get(`/class/${fx.classA.id}?year=1999`, tokens.teacherA)).status === 400);
    check('unknown ?grade= -> 400 (strict, by design)', (await get(`/class/${fx.classA.id}?grade=10`, tokens.teacherA)).status === 400);
  }

  console.log('\n--- Review patch: authorization against a REAL login token ---');
  {
    // The rest of this suite mints its own JWTs, which means it cannot catch a
    // change to the role normalization in routes/auth.ts. These assertions go
    // through the real login endpoint so that trap is actually covered.
    const res = await fetch(`${API_ROOT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'principal@edu.com', password: 'password123' }),
    });
    const login: any = await res.json().catch(() => null);
    check('seeded principal can log in', res.status === 200 && !!login?.token, res.status);
    check("login mints lowercase role 'principal'", login?.user?.role === 'principal', login?.user?.role);

    if (login?.token) {
      const real = await get('/school', login.token);
      check('REAL principal token -> 200 on /school', real.status === 200, real.status);
      const realClass = await get(`/class/${fx.classA.id}`, login.token);
      check('REAL principal token -> 200 on any class', realClass.status === 200, realClass.status);
    }

    const tRes = await fetch(`${API_ROOT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teacher@edu.com', password: 'password123' }),
    });
    const tLogin: any = await tRes.json().catch(() => null);
    check("login mints lowercase role 'teacher'", tLogin?.user?.role === 'teacher', tLogin?.user?.role);
    if (tLogin?.token) {
      const real = await get('/school', tLogin.token);
      check('REAL teacher token -> 403 on /school', real.status === 403, real.status);
    }
  }

  console.log('\n--- Empty state ---');
  {
    const r = await get(`/class/${fx.classEmpty.id}`, tokens.teacherA);
    check('empty class -> 200 (not 404, not 500)', r.status === 200, r.status);
    check('empty class -> subjectAverages []', Array.isArray(r.body?.subjectAverages) && r.body.subjectAverages.length === 0, r.body?.subjectAverages);
    check('empty class -> studentProgress []', Array.isArray(r.body?.studentProgress) && r.body.studentProgress.length === 0, r.body?.studentProgress);
  }

  console.log('\n--- Input validation (the 8.2 parseInt defect) ---');
  {
    const missing = await get('/class/999999999', tokens.principal);
    check('non-existent classId -> 404', missing.status === 404, missing.status);

    for (const bad of ['5.9', '5abc', '1e5', 'abc', '-1', '0']) {
      const r = await get(`/class/${bad}`, tokens.principal);
      check(`malformed classId "${bad}" -> 400`, r.status === 400, r.status);
    }

    const tooBig = await get('/class/2147483648', tokens.principal);
    check('classId > int4 max -> 400 (not 500)', tooBig.status === 400, tooBig.status);

    for (const bad of ['5.9', '5abc', 'abc']) {
      const r = await get(`/school?classId=${bad}`, tokens.principal);
      check(`malformed ?classId=${bad} -> 400`, r.status === 400, r.status);
    }
    const badYear = await get('/school?year=20xx', tokens.principal);
    check('malformed ?year= -> 400', badYear.status === 400, badYear.status);
    const oobYear = await get('/school?year=1999', tokens.principal);
    check('out-of-range ?year=1999 -> 400', oobYear.status === 400, oobYear.status);
  }
}

run()
  .catch((err) => {
    console.error('\nUnhandled error:', err);
    failed++;
  })
  .finally(async () => {
    await teardown().catch((e) => console.error('Teardown failed:', e));
    await prisma.$disconnect();
    console.log(`\n===== ${passed} passed, ${failed} failed =====`);
    process.exit(failed === 0 ? 0 : 1);
  });
