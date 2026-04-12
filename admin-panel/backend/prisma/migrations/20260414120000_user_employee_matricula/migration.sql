-- Matrícula funcional 1:1 no utilizador (ponto e relatórios). Única por tenant quando preenchida (vários NULL permitidos).
ALTER TABLE "User" ADD COLUMN "employee_matricula" TEXT;

CREATE UNIQUE INDEX "User_tenantId_employeeMatricula_key" ON "User"("tenantId", "employee_matricula");
