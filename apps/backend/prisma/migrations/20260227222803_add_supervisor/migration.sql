-- CreateTable
CREATE TABLE "Supervisor" (
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Supervisor_pkey" PRIMARY KEY ("departmentId","userId")
);

-- AddForeignKey
ALTER TABLE "Supervisor" ADD CONSTRAINT "Supervisor_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supervisor" ADD CONSTRAINT "Supervisor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
