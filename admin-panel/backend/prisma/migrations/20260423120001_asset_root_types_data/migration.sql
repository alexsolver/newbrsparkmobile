-- Dados existentes: "terrestre" vira mobilidade (veículos / frota) — após commit dos novos valores do enum.
UPDATE "Asset" SET "type" = 'MOBILITY' WHERE "type" = 'TERRESTRIAL';
