-- Rename tables to match new model names (DepartmentLead, TeamLead)
ALTER TABLE "Supervisor" RENAME TO "DepartmentLead";
ALTER TABLE "TeamLeader" RENAME TO "TeamLead";
