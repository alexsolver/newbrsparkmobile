-- Quantas execuções RT ativas (pré-reserva no servidor) manter por associação técnico↔modelo (cache no app).
ALTER TABLE "RoutineTaskAssignment" ADD COLUMN IF NOT EXISTS "mobilePrefetchSlots" INTEGER NOT NULL DEFAULT 1;
