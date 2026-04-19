-- Pré-carga do campo «receitas do técnico» (integração ERP/CRM → app só leitura + aceitar).
CREATE TABLE "technician_revenue_inputs" (
    "id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "fts_origem" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_revenue_inputs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "technician_revenue_inputs_tenant_id_conductor_id_idx" ON "technician_revenue_inputs"("tenant_id", "conductor_id");

ALTER TABLE "technician_revenue_inputs" ADD CONSTRAINT "technician_revenue_inputs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technician_revenue_inputs" ADD CONSTRAINT "technician_revenue_inputs_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
