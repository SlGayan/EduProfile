import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import { EXPECTED_IMPORT_COLUMNS, studentImportRowSchema } from '../validators/studentValidators.js';

const prisma = new PrismaClient();
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);
router.use(requireRole(['ADMINISTRATOR', 'TEACHER']));

router.post('/import', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded (expected field name "file")' });
    }

    let records: Record<string, string>[];
    try {
      records = parse(req.file.buffer, { columns: true, trim: true, skip_empty_lines: true });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Failed to parse CSV file' });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file contains no data rows' });
    }

    const actualColumns = Object.keys(records[0]!);
    const missing = EXPECTED_IMPORT_COLUMNS.filter((col) => !actualColumns.includes(col));
    const unexpected = actualColumns.filter(
      (col) => !(EXPECTED_IMPORT_COLUMNS as readonly string[]).includes(col)
    );
    if (missing.length > 0 || unexpected.length > 0) {
      return res.status(400).json({
        error: 'CSV header does not match the expected columns',
        expectedColumns: EXPECTED_IMPORT_COLUMNS,
        missingColumns: missing,
        unexpectedColumns: unexpected,
      });
    }

    const rowErrors: { row: number; errors: string[] }[] = [];
    const validRows: { rowNumber: number; data: ReturnType<typeof studentImportRowSchema.parse> }[] = [];

    records.forEach((record, index) => {
      const rowNumber = index + 2; // account for header row, 1-indexed
      const parsed = studentImportRowSchema.safeParse(record);
      if (!parsed.success) {
        rowErrors.push({
          row: rowNumber,
          errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        });
      } else {
        validRows.push({ rowNumber, data: parsed.data });
      }
    });

    if (rowErrors.length > 0) {
      return res.status(400).json({ error: 'CSV contains invalid rows', rowErrors });
    }

    const indexNumbers = validRows.map((r) => r.data.indexNumber);
    const duplicateIndexNumbers = indexNumbers.filter((val, i) => indexNumbers.indexOf(val) !== i);
    if (duplicateIndexNumbers.length > 0) {
      return res.status(400).json({
        error: 'CSV contains duplicate indexNumber values',
        duplicateIndexNumbers: [...new Set(duplicateIndexNumbers)],
      });
    }

    let createdCount = 0;
    let updatedCount = 0;

    try {
      await prisma.$transaction(async (tx) => {
        for (const { data } of validRows) {
          const existingStudent = await tx.student.findUnique({
            where: { indexNumber: data.indexNumber },
          });

          if (existingStudent) {
            await tx.student.update({
              where: { id: existingStudent.id },
              data: {
                fullName: data.fullName,
                dateOfBirth: new Date(data.dateOfBirth),
                address: data.address,
                nicNumber: data.nicNumber ?? null,
                olYear: data.olYear ?? null,
                alYear: data.alYear ?? null,
              },
            });
            updatedCount++;
          } else {
            // Deterministic placeholder password; student resets it on first login.
            const placeholderPassword = `Student@${data.indexNumber}`;
            const hashedPassword = await bcrypt.hash(placeholderPassword, 10);

            const user = await tx.user.create({
              data: {
                email: data.email.trim().toLowerCase(),
                password: hashedPassword,
                role: 'STUDENT',
              },
            });

            await tx.student.create({
              data: {
                userId: user.id,
                fullName: data.fullName,
                indexNumber: data.indexNumber,
                dateOfBirth: new Date(data.dateOfBirth),
                address: data.address,
                nicNumber: data.nicNumber ?? null,
                olYear: data.olYear ?? null,
                alYear: data.alYear ?? null,
              },
            });
            createdCount++;
          }
        }
      });
    } catch (txErr: any) {
      console.error('Student import transaction failed:', txErr);
      if (txErr?.code === 'P2002') {
        return res.status(409).json({
          error: 'Import failed due to a uniqueness conflict (duplicate email or indexNumber)',
          details: txErr.meta,
        });
      }
      return res.status(500).json({ error: 'Import failed, no changes were saved' });
    }

    return res.status(200).json({
      message: 'Import completed successfully',
      created: createdCount,
      updated: updatedCount,
    });
  } catch (err) {
    console.error('Error importing students:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
