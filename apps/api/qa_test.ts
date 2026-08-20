import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:8000/api/marks/import';

// Need to read from .env if we can, or we assume it's in process.env
import dotenv from 'dotenv';
dotenv.config();
const SECRET = process.env.APP_JWT_SECRET || 'fallback';

async function setupTestData() {
  console.log('1. Setting up test data...');
  
  // Create a teacher user
  const teacherUser = await prisma.user.create({
    data: {
      email: `qa.teacher.${Date.now()}@edu.com`,
      password: 'password123',
      role: 'TEACHER',
      teacher: {
        create: {}
      }
    },
    include: { teacher: true }
  });

  // Create another teacher to test unauthorized cross-class mark imports
  const otherTeacherUser = await prisma.user.create({
    data: {
      email: `qa.other.teacher.${Date.now()}@edu.com`,
      password: 'password123',
      role: 'TEACHER',
      teacher: {
        create: {}
      }
    },
    include: { teacher: true }
  });

  // Create a class assigned to teacher
  const cls = await prisma.class.create({
    data: {
      name: `QA Class ${Date.now()}`,
      teacherId: teacherUser.teacher!.id,
    }
  });

  // Create a student in that class
  const studentIndex = `IDX-${Date.now()}`;
  const studentUser = await prisma.user.create({
    data: {
      email: `qa.student.${Date.now()}@edu.com`,
      password: 'password123',
      role: 'STUDENT',
      student: {
        create: {
          fullName: 'QA Student',
          indexNumber: studentIndex,
          dateOfBirth: new Date('2010-01-01'),
          address: 'QA Address',
          classes: {
            connect: { id: cls.id }
          }
        }
      }
    }
  });

  // Create another student NOT in the teacher's class
  const otherStudentIndex = `IDX-OTHER-${Date.now()}`;
  const otherStudentUser = await prisma.user.create({
    data: {
      email: `qa.other.student.${Date.now()}@edu.com`,
      password: 'password123',
      role: 'STUDENT',
      student: {
        create: {
          fullName: 'QA Other Student',
          indexNumber: otherStudentIndex,
          dateOfBirth: new Date('2010-01-01'),
          address: 'QA Address'
        }
      }
    }
  });

  return { teacherUser, otherTeacherUser, studentIndex, otherStudentIndex };
}

async function uploadCsv(token: string, csvContent: string) {
  const formData = new FormData();
  formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'marks.csv');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData as any
  });
  
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function runQaTests() {
  console.log('=== QA Tests: Bulk Marks Import ===');
  const data = await setupTestData();
  
  const teacherToken = jwt.sign({ id: data.teacherUser.id, role: 'teacher' }, SECRET);
  const otherTeacherToken = jwt.sign({ id: data.otherTeacherUser.id, role: 'teacher' }, SECRET);
  const studentToken = jwt.sign({ id: 1, role: 'student' }, SECRET); // unauthorized role

  console.log('\nTest 1: Valid CSV Upload for own student');
  const validCsv = `studentIndexNumber,subjectName,term,year,marks\n${data.studentIndex},Mathematics,1,2026,85\n${data.studentIndex},Science,1,2026,90`;
  const res1 = await uploadCsv(teacherToken, validCsv);
  console.log('Result 1:', res1.status === 200 ? '✅ PASSED' : '❌ FAILED', res1.data);

  console.log('\nTest 2: Invalid Role (Student trying to upload)');
  const res2 = await uploadCsv(studentToken, validCsv);
  console.log('Result 2:', res2.status === 403 ? '✅ PASSED' : '❌ FAILED', res2.data);

  console.log('\nTest 3: Missing fields in CSV');
  const missingCsv = `studentIndexNumber,subjectName,term\n${data.studentIndex},Mathematics,1`;
  const res3 = await uploadCsv(teacherToken, missingCsv);
  console.log('Result 3:', res3.status === 400 ? '✅ PASSED' : '❌ FAILED', res3.data);

  console.log('\nTest 4: Out of bounds marks');
  const boundsCsv = `studentIndexNumber,subjectName,term,year,marks\n${data.studentIndex},Mathematics,1,2026,105`;
  const res4 = await uploadCsv(teacherToken, boundsCsv);
  console.log('Result 4:', res4.status === 400 ? '✅ PASSED' : '❌ FAILED', res4.data);

  console.log('\nTest 5: Uploading marks for student NOT in teacher\'s class');
  const otherCsv = `studentIndexNumber,subjectName,term,year,marks\n${data.otherStudentIndex},Mathematics,1,2026,85`;
  const res5 = await uploadCsv(teacherToken, otherCsv);
  console.log('Result 5:', res5.status === 403 ? '✅ PASSED' : '❌ FAILED', res5.data);

  console.log('\nTest 6: Empty CSV File');
  const emptyCsv = `studentIndexNumber,subjectName,term,year,marks\n`;
  const res6 = await uploadCsv(teacherToken, emptyCsv);
  console.log('Result 6:', res6.status === 400 ? '✅ PASSED' : '❌ FAILED', res6.data);

  // Clean up
  console.log('\nCleaning up test data...');
  // not strictly required for test db, but good practice
}

runQaTests().catch(console.error).finally(() => prisma.$disconnect());
