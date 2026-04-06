-- Índice único em coluna nullable: em PostgreSQL, UNIQUE permite vários NULL.
-- Passamos a índice único parcial: valores distintos obrigatórios quando osNumber IS NOT NULL.
DROP INDEX IF EXISTS "ChecklistExecution_osNumber_key";

CREATE UNIQUE INDEX "ChecklistExecution_osNumber_key" ON "ChecklistExecution"("osNumber") WHERE "osNumber" IS NOT NULL;
