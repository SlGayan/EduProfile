import express from 'express';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import classesRouter from './routes/classes.js';
import studentsRouter from './routes/students.js';
import marksRouter from './modules/marks/marks.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());

// Routes
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

// Marks management routes (bulk import)
app.use('/api/marks', marksRouter);

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

const mockTeachers = [
  {
    id: 1,
    name: 'John Doe',
    email: 'teacher@edu.com',
    classes: [{ id: 1, name: 'Grade 10-A' }]
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

app.get('/api/students/search', async (req, res) => {
  try {
    const { query } = req.query;
    const filteredStudents = mockStudents.filter(student =>
      student.firstName.toLowerCase().includes((query as string).toLowerCase()) ||
      student.lastName.toLowerCase().includes((query as string).toLowerCase()) ||
      student.email.toLowerCase().includes((query as string).toLowerCase())
    );
    res.json(filteredStudents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search students' });
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

// Teachers routes
app.get('/api/teachers', async (req, res) => {
  try {
    res.json(mockTeachers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teachers' });
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
app.listen(PORT, () => {
  console.log(`🚀 EduProfile API server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});
