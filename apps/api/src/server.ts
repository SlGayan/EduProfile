import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import classesRouter from './routes/classes.js';
import studentsRouter from './routes/students.js';
import teachersRouter from './routes/teachers.js';
import marksRouter from './modules/marks/marks.routes.js';
import activitiesRouter from './modules/activities/activities.routes.js';
import materialsRouter from './modules/materials/materials.routes.js';
import subjectsRouter from './modules/subjects/subjects.routes.js';
import analyticsRouter from './modules/analytics/analytics.routes.js';
import certificateRoutes from './routes/certificates.js';
import studentCertificatesRouter from './modules/studentCertificates/studentCertificates.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const prisma = new PrismaClient();

// Middleware
app.use(cors({
  // credentials:true + origin:'*' is invalid — browsers reject it.
  // When ALLOWED_ORIGINS is not set (local dev), CORS is disabled; local dev
  // hits the API through the Next.js rewrite proxy (same-origin), so no CORS needed.
  // In production, set ALLOWED_ORIGINS to the comma-separated list of frontend URLs.
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : false,
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'EduProfile API is running!' });
});

// Auth routes
app.use('/api/auth', authRouter);

// User management routes
app.use('/api/users', usersRouter);

// Class management routes
app.use('/api/classes', classesRouter);

// Student management routes (bulk import)
app.use('/api/students', studentsRouter);

// Teacher listing routes
app.use('/api/teachers', teachersRouter);

// Certificate routes
app.use('/api/certificates', certificateRoutes);

// Student-added certificate review routes (status update, evidence file for
// reviewers). The student-scoped submit/list/download routes are served by
// studentsRouter, and the teacher's pending-list by teachersRouter.
app.use('/api/student-certificates', studentCertificatesRouter);

// Marks management routes (bulk import)
app.use('/api/marks', marksRouter);

// Extracurricular activity routes (update/delete by activity id).
// The student-scoped list/create routes are served by studentsRouter above.
app.use('/api/activities', activitiesRouter);

// Study material upload/assignment routes
app.use('/api/materials', materialsRouter);

// Subject listing routes
app.use('/api/subjects', subjectsRouter);

// Academic performance analytics (class averages, progress trends, school-wide
// aggregates). Mounted with the other routers, i.e. BEFORE the legacy mock
// handlers below, so nothing can fall through to mock data.
app.use('/api/analytics', analyticsRouter);

// Mock data for now - will be replaced with actual database queries
const mockClasses = [
  {
    id: 1,
    name: 'Grade 10-A',
    teacher: { id: 1, name: 'John Doe', email: 'teacher@edu.com' },
    students: [
      { id: 1, firstName: 'Alice', lastName: 'Johnson', email: 'alice@edu.com' },
      { id: 2, firstName: 'Bob', lastName: 'Smith', email: 'bob@edu.com' }
    ]
  }
];

const mockStudents = [
  {
    id: 1,
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@edu.com',
    class: { id: 1, name: 'Grade 10-A' },
    marks: []
  },
  {
    id: 2,
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@edu.com',
    class: { id: 1, name: 'Grade 10-A' },
    marks: []
  }
];

// Students routes
app.get('/api/students', async (req, res) => {
  try {
    res.json(mockStudents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

app.get('/api/students/me', async (req, res) => {
  try {
    // Mock current user - in real app this would come from auth
    const student = mockStudents[0];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student profile' });
  }
});

// Marks routes
app.get('/api/marks', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch marks' });
  }
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 EduProfile API server running on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

export default app;
