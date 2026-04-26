-- E-mail único global na tabela "User": deduplica filiações (mesmo e-mail em vários tenants)
-- atribuindo RFC plus-addressing ao que não for a filiação «principal» (PROVIDER > COMPANY > CLIENT).

UPDATE "User" u
SET email =
  split_part(lower(trim(u.email)), '@', 1)
  || '+brspark.ws.'
  || md5(random()::text || u.id::text || clock_timestamp()::text)
  || '@'
  || split_part(lower(trim(u.email)), '@', 2)
FROM (
  SELECT u2.id,
    row_number() OVER (
      PARTITION BY lower(trim(u2.email))
      ORDER BY
        CASE t.kind::text
          WHEN 'PROVIDER' THEN 3
          WHEN 'COMPANY' THEN 2
          WHEN 'CLIENT' THEN 1
          ELSE 0
        END DESC,
        u2."createdAt" ASC
    ) AS rn
  FROM "User" u2
  INNER JOIN "Tenant" t ON t.id = u2."tenantId"
) sub
WHERE u.id = sub.id
  AND sub.rn > 1
  AND strpos(lower(trim(u.email)), '@') > 0;

UPDATE "User" SET email = lower(trim(email));

DROP INDEX IF EXISTS "User_email_tenantId_key";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
