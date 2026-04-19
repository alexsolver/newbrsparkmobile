-- Expandir classes raiz de ativos (Imobiliário, Mobilidade, Maquinário, TI, Coleções…)
-- PostgreSQL: novos valores de enum só podem ser usados após commit — o UPDATE fica na migração seguinte.
ALTER TYPE "AssetType" ADD VALUE 'MOBILITY';
ALTER TYPE "AssetType" ADD VALUE 'MACHINERY';
ALTER TYPE "AssetType" ADD VALUE 'IT';
ALTER TYPE "AssetType" ADD VALUE 'COLLECTIONS';
