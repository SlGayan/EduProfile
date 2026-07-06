-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermMark" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "marks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermMark_studentId_idx" ON "TermMark"("studentId");

-- CreateIndex
CREATE INDEX "TermMark_subjectId_idx" ON "TermMark"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TermMark_studentId_subjectId_term_year_key" ON "TermMark"("studentId", "subjectId", "term", "year");

-- AddForeignKey
ALTER TABLE "TermMark" ADD CONSTRAINT "TermMark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermMark" ADD CONSTRAINT "TermMark_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
