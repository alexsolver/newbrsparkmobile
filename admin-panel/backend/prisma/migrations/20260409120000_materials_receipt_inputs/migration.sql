-- Linhas para pré-carga do campo «materiais / entrada» (API / integrações).
CREATE TABLE "materials_receipt_inputs" (
    "id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo_interno" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "preco_un" DECIMAL(14,4),
    "qtd" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_receipt_inputs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "materials_receipt_inputs_tenant_id_conductor_id_idx" ON "materials_receipt_inputs"("tenant_id", "conductor_id");

ALTER TABLE "materials_receipt_inputs" ADD CONSTRAINT "materials_receipt_inputs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "materials_receipt_inputs" ADD CONSTRAINT "materials_receipt_inputs_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
