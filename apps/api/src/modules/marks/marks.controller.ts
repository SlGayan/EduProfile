import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

const prisma = new PrismaClient();

const markRowSchema = z.object({
  studentIndexNumber: z.string().min(1),
  subjectName: z.string().min(1),
  term: z.coerce.number().int().min(1).max(3),
  year: z.coerce.number().int().min(2000).max(2100),
  marks: z.coerce.number().int().min(0).max(100),
});

type MarkRow = z.infer<typeof markRowSchema>;

const myMarksYearSchema = z.coerce.number().int().min(2000).max(2100);
const myMarksTermSchema = z.coerce.number().int().min(1).max(3);

export const importMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }
    
    if (!req.user || req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized: Only teachers can import marks' });
    }
    
    const teacherUserId = req.user.id;

    // Parse CSV
    const rows: any[] = [];
    await new Promise((resolve, reject) => {
      Readable.from(req.file!.buffer)
        .pipe(csvParser())
        .on('data', (data) => rows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const parsedRows: MarkRow[] = [];
    const errors: any[] = [];

    rows.forEach((row, index) => {
      const parsed = markRowSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({ row: index + 1, data: row, issues: parsed.error.issues });
      } else {
        parsedRows.push(parsed.data);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'CSV Validation failed', details: errors });
    }
    
    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }
    
    // Look up Teacher to ensure they exist and get their classes
    const teacher = await prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      include: { classes: true }
    });
    
    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }
    
    const teacherClassIds = teacher.classes.map(c => c.id);
    if (teacherClassIds.length === 0) {
      return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
    }

    // Get unique students and subjects
    const uniqueIndexNumbers = [...new Set(parsedRows.map(r => r.studentIndexNumber))];
    const uniqueSubjectNames = [...new Set(parsedRows.map(r => r.subjectName))];
    
    // Fetch students
    const students = await prisma.student.findMany({
      where: { indexNumber: { in: uniqueIndexNumbers } },
      include: { classes: true }
    });
    
    const studentMap = new Map(students.map(s => [s.indexNumber, s]));
    
    // Ensure all students exist and are in the teacher's classes
    for (const row of parsedRows) {
      const student = studentMap.get(row.studentIndexNumber);
      if (!student) {
        return res.status(400).json({ error: `Student with index number ${row.studentIndexNumber} not found` });
      }
      
      const studentClassIds = student.classes.map(c => c.id);
      const isTeacherOfStudent = studentClassIds.some(cId => teacherClassIds.includes(cId));
      
      if (!isTeacherOfStudent) {
        return res.status(403).json({ error: `You do not have permission to modify marks for student ${row.studentIndexNumber}` });
      }
    }
    
    // Upsert subjects
    const subjectMap = new Map<string, number>();
    for (const subName of uniqueSubjectNames) {
      let subject = await prisma.subject.findFirst({ where: { name: subName } });
      if (!subject) {
        subject = await prisma.subject.create({ data: { name: subName } });
      }
      subjectMap.set(subName, subject.id);
    }
    
    // Prepare transaction
    const upsertPromises = parsedRows.map(row => {
      const student = studentMap.get(row.studentIndexNumber)!;
      const subjectId = subjectMap.get(row.subjectName)!;
      
      return prisma.termMark.upsert({
        where: {
          studentId_subjectId_term_year: {
            studentId: student.id,
            subjectId: subjectId,
            term: row.term,
            year: row.year
          }
        },
        update: { marks: row.marks },
        create: {
          studentId: student.id,
          subjectId: subjectId,
          term: row.term,
          year: row.year,
          marks: row.marks
        }
      });
    });
    
    await prisma.$transaction(upsertPromises);
    
    return res.status(200).json({ message: `Successfully imported ${parsedRows.length} mark(s)` });

  } catch (err: any) {
    console.error('Import marks error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

export const getMyMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const { year, term } = req.query;

    if ((year !== undefined && typeof year !== 'string') || (term !== undefined && typeof term !== 'string')) {
      return res.status(400).json({ error: 'Invalid year or term parameter' });
    }

    let yearFilter: { year?: number } = {};
    if (year && year !== 'all') {
      const parsedYear = myMarksYearSchema.safeParse(year);
      if (!parsedYear.success) {
        return res.status(400).json({ error: 'Invalid year parameter' });
      }
      yearFilter = { year: parsedYear.data };
    }

    let termFilter: { term?: number } = {};
    if (term && term !== 'all') {
      const parsedTerm = myMarksTermSchema.safeParse(term);
      if (!parsedTerm.success) {
        return res.status(400).json({ error: 'Invalid term parameter' });
      }
      termFilter = { term: parsedTerm.data };
    }

    const termMarks = await prisma.termMark.findMany({
      where: {
        studentId: student.id,
        ...yearFilter,
        ...termFilter,
      },
      include: { subject: true },
      orderBy: [{ year: 'desc' }, { term: 'asc' }, { subject: { name: 'asc' } }],
    });

    return res.status(200).json(
      termMarks.map((m) => ({
        id: String(m.id),
        subject: m.subject.name,
        term: m.term,
        year: m.year,
        marks: m.marks,
      }))
    );
  } catch (err: any) {
    console.error('Get my marks error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
