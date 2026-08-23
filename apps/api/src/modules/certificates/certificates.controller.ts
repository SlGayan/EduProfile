import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import PDFDocument from 'pdfkit';

const prisma = new PrismaClient();

export const issueCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const principalId = req.user!.id;
    const { studentId, selectedActivities, reasonForLeaving, characterGrade, studentAttributes, academicSummary } = req.body;

    if (!studentId || !characterGrade) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the current year for the ID
    const year = new Date().getFullYear();

    // Get the latest certificate count for this year to generate sequence number
    const count = await prisma.characterCertificate.count({
      where: {
        id: {
          startsWith: `DSCTH/CC/${year}/`,
        },
      },
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    const certificateId = `DSCTH/CC/${year}/${sequence}`;

    // Get a snapshot of student data
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        termMarks: { include: { subject: true } },
        activities: { where: { id: { in: selectedActivities || [] }, status: 'APPROVED' } },
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const contentSnapshot = {
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: student.dateOfBirth,
      dateOfAdmission: student.dateOfAdmission,
      admissionGrade: student.admissionGrade,
      attendancePercentage: student.attendancePercentage,
      activities: student.activities,
      termMarks: student.termMarks,
    };

    const certificate = await prisma.characterCertificate.create({
      data: {
        id: certificateId,
        studentId,
        principalId,
        selectedActivities: (selectedActivities || []).map(String),
        reasonForLeaving,
        characterGrade,
        studentAttributes,
        academicSummary,
        contentSnapshot: contentSnapshot as any,
      },
    });

    return res.status(201).json(certificate);
  } catch (error) {
    console.error('Error issuing certificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCertificatePdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // We decode the ID because it contains slashes (DSCTH/CC/YYYY/NNNN)
    // Actually, express will handle URL encoded params, so we expect it to be passed as DSCTH%2FCC%2FYYYY%2FNNNN
    const decodedId = decodeURIComponent(id as string);

    const certificate = await prisma.characterCertificate.findUnique({
      where: { id: decodedId },
      include: {
        student: true,
        principal: true,
      },
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // PDF Generation using PDFKit as a placeholder or basic implementation
    // A robust solution might use puppeteer or @react-pdf/renderer on the server or client.
    // For this implementation, we will return JSON and let the frontend render the PDF if desired,
    // OR we generate a basic PDF string here. Since the spec mentions generating it on the server,
    // we'll send a basic PDF with pdfkit (which might need to be installed, let's just return JSON for now 
    // or create a simple pdfkit doc).
    // Actually, the spec says "generate PDF". We will use pdfkit.
    
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Character_Certificate_${decodedId.replace(/\//g, '_')}.pdf`);
    
    doc.pipe(res);
    
    // Header
    doc.fontSize(16).text('KG/DHARMASIRI SENANAYAKE CENTRAL COLLEGE', { align: 'center' });
    doc.fontSize(14).text('THULHIRIYA', { align: 'center' });
    doc.fontSize(12).text('Principal TP : 035-3228094      e-mail : dscthulhiriya@gmail.com', { align: 'center' });
    doc.text('TP /FAX : 037-2053088', { align: 'center' });
    doc.moveDown(2);
    
    // Reference & Date
    doc.fontSize(11).text(`Ref No: ${certificate.id}`, { continued: true });
    doc.text(`Date: ${certificate.issuedAt.toLocaleDateString()}`, { align: 'right' });
    doc.moveDown(2);
    
    // Title
    doc.fontSize(14).font('Helvetica-Bold').text('TO WHOM IT MAY CONCERN', { align: 'center' });
    doc.moveDown(2);
    
    // Body
    doc.fontSize(12).font('Helvetica');
    const snapshot = certificate.contentSnapshot as any;
    
    const admDate = snapshot.dateOfAdmission ? new Date(snapshot.dateOfAdmission).toLocaleDateString() : 'N/A';
    
    doc.text(`This is to certify that ${snapshot.fullName} (Admission No: ${snapshot.admissionNumber || 'N/A'}) was a bona fide student of KG/Dharmasiri Senanayake Central College, Thulhiriya from ${admDate} to ${certificate.issuedAt.toLocaleDateString()}.`);
    doc.moveDown();
    
    doc.text('According to our school records, his/her particulars are as follows:');
    doc.moveDown();
    
    const dob = snapshot.dateOfBirth ? new Date(snapshot.dateOfBirth).toLocaleDateString() : 'N/A';
    doc.text(`Date of Birth: ${dob}`);
    doc.text(`Grade on Admission: Grade ${snapshot.admissionGrade || 'N/A'}`);
    doc.text(`Academic Performance: ${certificate.academicSummary || 'N/A'}`);
    doc.moveDown();
    
    doc.text('Extracurricular Activities & Achievements:');
    if (snapshot.activities && snapshot.activities.length > 0) {
      snapshot.activities.forEach((act: any) => {
        doc.text(`- ${act.activityName} (${act.activityType}): ${act.achievements || act.description || ''}`, { indent: 20 });
      });
    } else {
      doc.text('None recorded.', { indent: 20 });
    }
    doc.moveDown();
    
    doc.text(`Overall Attendance: ${snapshot.attendancePercentage || 'N/A'}%`);
    if (certificate.reasonForLeaving) {
      doc.text(`Reason for Leaving: ${certificate.reasonForLeaving}`);
    }
    doc.moveDown();
    
    doc.text('Character and Conduct:');
    doc.text(`Based on the disciplinary records and teachers' evaluations during his/her tenure at the school, he/she has displayed a ${certificate.characterGrade} moral character. He/She is a ${certificate.studentAttributes || 'well-behaved'} student who maintained exemplary discipline and cooperated well with the school community.`);
    doc.moveDown(2);
    
    doc.text('We wish him/her all the best in his/her future endeavors.');
    doc.moveDown(4);
    
    doc.text('...........................................................');
    doc.text('Principal');
    doc.text('KG/Dharmasiri Senanayake Central College');
    doc.text('Thulhiriya.');
    
    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    // If headers already sent, we can't send JSON. But we wrap it early.
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const listCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const certificates = await prisma.characterCertificate.findMany({
      include: { student: true },
      orderBy: { issuedAt: 'desc' },
    });
    
    return res.status(200).json(certificates);
  } catch (error) {
    console.error('Error listing certificates:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
