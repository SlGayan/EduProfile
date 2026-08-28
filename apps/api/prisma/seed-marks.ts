import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const allTerms = [
  { year: 2023, term: 1 }, { year: 2023, term: 2 }, { year: 2023, term: 3 },
  { year: 2024, term: 1 }, { year: 2024, term: 2 }, { year: 2024, term: 3 },
  { year: 2025, term: 1 }
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function main() {
  console.log('Backfilling TermMark data for students with no marks...');

  const subjects = await prisma.subject.findMany();
  if (subjects.length === 0) {
    console.log('No subjects found — nothing to backfill.');
    return;
  }

  const students = await prisma.student.findMany({
    where: { user: { deletedAt: null } },
    include: { termMarks: { select: { id: true }, take: 1 } },
  });

  const studentsWithoutMarks = students.filter((s) => s.termMarks.length === 0);
  if (studentsWithoutMarks.length === 0) {
    console.log('Every student already has at least one mark — nothing to backfill.');
    return;
  }

  console.log(`Found ${studentsWithoutMarks.length} student(s) with no marks (out of ${students.length}).`);

  const markRecords: { studentId: number; subjectId: number; term: number; year: number; marks: number }[] = [];

  for (const student of studentsWithoutMarks) {
    const numSubjects = randomInt(5, Math.min(subjects.length, 9));
    const studentSubjects = [...subjects].sort(() => 0.5 - Math.random()).slice(0, numSubjects);

    const basePerformance = randomInt(45, 95);

    for (const termInfo of allTerms) {
      for (const subject of studentSubjects) {
        let mark = basePerformance + randomInt(-12, 12);
        if (mark > 100) mark = 100;
        if (mark < 0) mark = randomInt(20, 35);

        markRecords.push({
          studentId: student.id,
          subjectId: subject.id,
          term: termInfo.term,
          year: termInfo.year,
          marks: mark,
        });
      }
    }
  }

  const chunkSize = 500;
  for (let i = 0; i < markRecords.length; i += chunkSize) {
    const chunk = markRecords.slice(i, i + chunkSize);
    await prisma.termMark.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`✓ Backfilled ${markRecords.length} term mark(s) for ${studentsWithoutMarks.length} student(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
