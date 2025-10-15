import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'EduProfile API is running!' });
});

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

// Classes routes
app.get('/api/classes', async (req, res) => {
  try {
    res.json(mockClasses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const classData = mockClasses.find(c => c.id === parseInt(id));

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json(classData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch class' });
  }
});

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

app.get('/api/marks/my-marks', async (req, res) => {
  try {
    // Mock current user - in real app this would come from auth
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
