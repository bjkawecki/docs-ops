-- CreateTable CompanyLead
CREATE TABLE "CompanyLead" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CompanyLead_pkey" PRIMARY KEY ("companyId","userId")
);

-- AlterTable Owner: add companyId
ALTER TABLE "Owner" ADD COLUMN "companyId" TEXT;

-- AddForeignKey CompanyLead
ALTER TABLE "CompanyLead" ADD CONSTRAINT "CompanyLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyLead" ADD CONSTRAINT "CompanyLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Owner.companyId
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
