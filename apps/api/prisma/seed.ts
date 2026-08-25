import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'History',
  'Information Technology',
  'Geography',
  'Arts',
  'Commerce',
  'Health Science'
];

const CLASSES = [
  { name: 'Grade 10-A', year: 2025, teacherEmail: 'teacher1@edu.com' },
  { name: 'Grade 10-B', year: 2025, teacherEmail: 'teacher2@edu.com' },
  { name: 'Grade 11-A', year: 2025, teacherEmail: 'teacher3@edu.com' },
  { name: 'Grade 11-B', year: 2025, teacherEmail: 'teacher4@edu.com' },
  { name: 'Grade 12-Science', year: 2025, teacherEmail: 'teacher1@edu.com' },
  { name: 'Grade 12-Arts', year: 2025, teacherEmail: 'teacher2@edu.com' },
];

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function main() {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const hashedPassword = await bcrypt.hash('password123', rounds);

  console.log('🌱 Starting massive database seeding...');

  // Guard: skip seeding if the database already has users (production safety).
  // Remove this block if you want to force a full reseed.
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`⏭️  Database already has ${existingUsers} users — skipping seed to preserve production data.`);
    return;
  }

  // 0. Clean up existing data for fresh seed (Optional but good for analytics)
  console.log('Clearing existing marks, activities, materials, and classes...');
  await prisma.termMark.deleteMany({});
  await prisma.extracurricularActivity.deleteMany({});
  await prisma.studyMaterial.deleteMany({});
  
  // Disconnect students from classes before deleting classes
  await prisma.student.updateMany({ data: {} }); // Just a dummy, actually Prisma handles many-to-many through implicit tables.
  
  // For classes, we might have foreign key constraints, let's just create new ones or find existing.
  
  // 1. Core Users
  const coreUsers = [
    { email: 'admin@edu.com', role: 'ADMINISTRATOR' as const },
    { email: 'principal@edu.com', role: 'PRINCIPAL' as const },
    { email: 'teacher@edu.com', role: 'TEACHER' as const }, // The main test teacher
    { email: 'student@edu.com', role: 'STUDENT' as const }, // The main test student
    { email: 'teacher1@edu.com', role: 'TEACHER' as const },
    { email: 'teacher2@edu.com', role: 'TEACHER' as const },
    { email: 'teacher3@edu.com', role: 'TEACHER' as const },
    { email: 'teacher4@edu.com', role: 'TEACHER' as const },
  ];

  const userMap = new Map<string, any>();
  for (const u of coreUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hashedPassword, role: u.role },
      create: {
        email: u.email,
        password: hashedPassword,
        role: u.role,
        mustChangePassword: false,
      },
    });
    userMap.set(u.email, user);
  }
  console.log('✓ Core admin/principal/teacher users created');

  // 2. Teacher Profiles
  const teachers = ['teacher@edu.com', 'teacher1@edu.com', 'teacher2@edu.com', 'teacher3@edu.com', 'teacher4@edu.com'];
  const teacherDetails: Record<string, { fullName: string; phone: string }> = {
    'teacher@edu.com': { fullName: 'Mrs. S. Silva', phone: '+94 71 234 5678' },
    'teacher1@edu.com': { fullName: 'Mr. R. Fernando', phone: '+94 71 234 5679' },
    'teacher2@edu.com': { fullName: 'Ms. K. Jayawardena', phone: '+94 71 234 5680' },
    'teacher3@edu.com': { fullName: 'Mr. D. Bandara', phone: '+94 71 234 5681' },
    'teacher4@edu.com': { fullName: 'Mrs. N. Herath', phone: '+94 71 234 5682' },
  };
  const teacherProfiles = new Map<string, any>();
  for (const email of teachers) {
    const u = userMap.get(email)!;
    const details = teacherDetails[email]!;
    const profile = await prisma.teacher.upsert({
      where: { userId: u.id },
      update: { fullName: details.fullName, phone: details.phone },
      create: { userId: u.id, fullName: details.fullName, phone: details.phone },
    });
    teacherProfiles.set(email, profile);
  }
  console.log('✓ Teacher profiles created');

  // 3. Classes
  const classMap = new Map<string, any>();
  
  let mainClass = await prisma.class.findFirst({ where: { name: 'Grade 10-A (Test)' }});
  if (!mainClass) {
    mainClass = await prisma.class.create({
      data: { name: 'Grade 10-A (Test)', year: 2025, teacherId: teacherProfiles.get('teacher@edu.com')!.id },
    });
  }
  classMap.set(mainClass.name, mainClass);

  for (const c of CLASSES) {
    let cls = await prisma.class.findFirst({ where: { name: c.name }});
    if (!cls) {
      const tProfile = teacherProfiles.get(c.teacherEmail)!;
      cls = await prisma.class.create({
        data: { name: c.name, year: c.year, teacherId: tProfile.id },
      });
    }
    classMap.set(c.name, cls);
  }
  console.log('✓ Classes created');

  // 4. Subjects
  const subjectMap = new Map<string, any>();
  for (const name of SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    subjectMap.set(name, subject);
  }
  console.log(`✓ Subjects created`);

  // 5. Generate 100 Students
  console.log('Generating students...');
  const firstNames = ['Amal', 'Bimal', 'Kamal', 'Nimal', 'Sunil', 'Kasun', 'Ruwan', 'Saman', 'Dinesh', 'Nuwan', 'Kumara', 'Sahan', 'Gayan', 'Tharindu', 'Lahiru', 'Sandun', 'Chathura', 'Isuru', 'Asanka', 'Chaminda', 'Nayana', 'Niranjala', 'Kumari', 'Sriyani', 'Malkanthi', 'Nandani', 'Renuka', 'Nilmini', 'Sriyani', 'Chandani', 'Kanthi', 'Rupika', 'Deepani', 'Geethani', 'Darshani', 'Apsara', 'Kaushalya', 'Anusha', 'Nadeesha', 'Dhammika'];
  const lastNames = ['Perera', 'Silva', 'Fernando', 'De Silva', 'Kumara', 'Bandara', 'Herath', 'Dissanayake', 'Wickramasinghe', 'Gunawardena', 'Rajapaksha', 'Jayawardena', 'Liyanage', 'Ranasinghe', 'Peiris', 'Ratnayake', 'Wijesinghe', 'Balasuriya', 'Samarasinghe', 'Edirisinghe'];

  const studentUsers = [];
  // Ensure main student is in the main class
  const mainStudentUser = await prisma.user.upsert({
    where: { email: 'student@edu.com' },
    update: { password: hashedPassword, role: 'STUDENT' },
    create: { email: 'student@edu.com', password: hashedPassword, role: 'STUDENT' },
  });
  
  const mainStudentProfile = await prisma.student.upsert({
    where: { userId: mainStudentUser.id },
    update: {
      classes: { set: [{ id: mainClass.id }] },
      admissionNumber: '2019/000',
      dateOfAdmission: new Date('2019-01-01'),
      admissionGrade: '6',
      attendancePercentage: 92.5,
    },
    create: {
      userId: mainStudentUser.id,
      fullName: 'Kasun Perera (Test Student)',
      indexNumber: 'STU0000',
      admissionNumber: '2019/000',
      dateOfBirth: new Date('2008-01-01'),
      dateOfAdmission: new Date('2019-01-01'),
      admissionGrade: '6',
      attendancePercentage: 92.5,
      address: 'Test Address',
      nicNumber: '200800000000',
      olYear: 2024,
      alYear: 2026,
      classes: { connect: [{ id: mainClass.id }] },
    },
  });
  studentUsers.push(mainStudentProfile);

  await prisma.guardian.upsert({
    where: { studentId: mainStudentProfile.id },
    update: {
      guardianName: 'Mr. Nimal Perera',
      primaryPhone: '+94 77 123 4567',
      emergencyContactPhone: '+94 71 987 6543',
    },
    create: {
      studentId: mainStudentProfile.id,
      guardianName: 'Mr. Nimal Perera',
      primaryPhone: '+94 77 123 4567',
      emergencyContactPhone: '+94 71 987 6543',
    },
  });

  const allClasses = Array.from(classMap.values());
  let studentCount = 1;

  for (let i = 0; i < 100; i++) {
    const fName = firstNames[randomInt(0, firstNames.length - 1)];
    const lName = lastNames[randomInt(0, lastNames.length - 1)];
    const email = `student_gen_${studentCount}@edu.com`;
    const indexNumber = `STU${10000 + studentCount}`;
    const assignedClass = allClasses[randomInt(0, allClasses.length - 1)];
    
    const user = await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword, role: 'STUDENT' },
      create: { email, password: hashedPassword, role: 'STUDENT' },
    });

    const admissionYear = 2018 + (i % 5);
    const admissionNumber = `${admissionYear}/${(i + 1).toString().padStart(3, '0')}`;
    const dateOfAdmission = new Date(`${admissionYear}-01-01`);
    const admissionGrade = '6';
    const attendancePercentage = 75 + (i % 25);

    const profile = await prisma.student.upsert({
      where: { userId: user.id },
      update: {
        classes: { set: [{ id: assignedClass.id }] },
        admissionNumber,
        dateOfAdmission,
        admissionGrade,
        attendancePercentage,
      },
      create: {
        userId: user.id,
        fullName: `${fName} ${lName}`,
        indexNumber: indexNumber,
        admissionNumber,
        dateOfBirth: new Date(`${2005 + (i % 5)}-${(i % 12) + 1}-15`),
        dateOfAdmission,
        admissionGrade,
        attendancePercentage,
        address: `${Math.floor(Math.random() * 100) + 1}, Main Road, Colombo ${Math.floor(Math.random() * 15) + 1}`,
        nicNumber: `${randomInt(200700000000, 200999999999)}`,
        olYear: 2024 + (i % 3),
        alYear: 2026 + (i % 3),
        classes: { connect: [{ id: assignedClass.id }] },
      },
    });
    studentUsers.push(profile);
    studentCount++;
  }
  console.log(`✓ Created ${studentUsers.length} students`);

  // 6. Marks Data
  console.log('Generating marks for all students...');
  const markRecords = [];
  const allTerms = [
    { year: 2023, term: 1 }, { year: 2023, term: 2 }, { year: 2023, term: 3 },
    { year: 2024, term: 1 }, { year: 2024, term: 2 }, { year: 2024, term: 3 },
    { year: 2025, term: 1 }
  ];

  for (const student of studentUsers) {
    const numSubjects = randomInt(5, SUBJECTS.length);
    const studentSubjects = [...SUBJECTS].sort(() => 0.5 - Math.random()).slice(0, numSubjects);
    
    // Determine student's base performance level
    const basePerformance = randomInt(45, 95); 

    for (const termInfo of allTerms) {
      for (const subjectName of studentSubjects) {
        const subject = subjectMap.get(subjectName)!;
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

  // Insert marks in chunks
  const chunkSize = 500;
  for (let i = 0; i < markRecords.length; i += chunkSize) {
    const chunk = markRecords.slice(i, i + chunkSize);
    await prisma.termMark.createMany({
      data: chunk,
      skipDuplicates: true, 
    });
  }
  console.log(`✓ Term marks created (${markRecords.length} records)`);

  // 7. Extracurricular Activities
  const activities = [];
  for (let i = 0; i < 50; i++) {
    const randomStudent = studentUsers[randomInt(0, studentUsers.length - 1)];
    activities.push({
      studentId: randomStudent.id,
      activityName: `Activity ${i}`,
      activityType: i % 2 === 0 ? 'Sports' : 'Clubs & Societies',
      description: 'Test description for activity',
      startDate: randomDate(new Date(2023, 0, 1), new Date(2024, 11, 31)),
      achievements: i % 3 === 0 ? 'Winner' : null,
    });
  }
  await prisma.extracurricularActivity.createMany({
    data: activities,
    skipDuplicates: true,
  });
  console.log(`✓ ${activities.length} Extracurricular activities created`);

  // 8. Study Materials
  const materials = [];
  for (let i = 0; i < 40; i++) {
    const randomClass = allClasses[randomInt(0, allClasses.length - 1)];
    const randomSubject = subjectMap.get(SUBJECTS[randomInt(0, SUBJECTS.length - 1)])!;
    const tProfileId = teacherProfiles.get(teachers[randomInt(0, teachers.length - 1)])!.id;
    
    materials.push({
      title: `Study Material ${i} - ${randomSubject.name}`,
      description: 'Test material description for revision',
      fileUrl: 'https://example.com/dummy.pdf',
      fileType: 'pdf',
      uploadedById: tProfileId,
      classId: randomClass.id,
      subjectId: randomSubject.id,
    });
  }
  await prisma.studyMaterial.createMany({
    data: materials,
    skipDuplicates: true,
  });
  console.log(`✓ ${materials.length} Study materials created`);

  console.log('\n🎉 Massive seeding completed successfully!');
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
