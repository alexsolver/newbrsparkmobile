-- Row-Level Security (Aria admin-panel / API Node)
-- Sessão: set_config('app.*', ..., true) por pedido (ver src/lib/prismaRlsSession.js).

CREATE OR REPLACE FUNCTION public._aria_rls_privileged() RETURNS boolean AS $$
SELECT
  COALESCE(NULLIF(current_setting('app.admin_is_platform', true), ''), '') IN ('true', '1', 'yes')
  OR COALESCE(NULLIF(current_setting('app.bridge_internal', true), ''), '') = '1'
  OR COALESCE(NULLIF(current_setting('app.reports_api', true), ''), '') = '1';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public._aria_rls_tenant_allowed(tenant_row_id text) RETURNS boolean AS $$
SELECT
  public._aria_rls_privileged()
  OR (
    tenant_row_id IS NOT NULL
    AND tenant_row_id IN (
      NULLIF(current_setting('app.current_tenant_id', true), ''),
      NULLIF(current_setting('app.admin_panel_tenant_id', true), '')
    )
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public._aria_rls_tenant_or_global(tenant_row_id text) RETURNS boolean AS $$
SELECT
  public._aria_rls_privileged()
  OR tenant_row_id IS NULL
  OR public._aria_rls_tenant_allowed(tenant_row_id);
$$ LANGUAGE sql STABLE;

-- ─── Tenant (conta / workspace) ───────────────────────────────────────────
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_tenant_all ON "Tenant";
CREATE POLICY aria_tenant_all ON "Tenant" FOR ALL
USING (
  public._aria_rls_privileged()
  OR public._aria_rls_tenant_allowed("id")
)
WITH CHECK (
  public._aria_rls_privileged()
  OR public._aria_rls_tenant_allowed("id")
);

-- ─── Subscrição / faturação (via tenant) ───────────────────────────────────
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_subscription_all ON "Subscription";
CREATE POLICY aria_subscription_all ON "Subscription" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_invoice_all ON "Invoice";
CREATE POLICY aria_invoice_all ON "Invoice" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Subscription" s
    WHERE s.id = "Invoice"."subscriptionId"
      AND public._aria_rls_tenant_allowed(s."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Subscription" s
    WHERE s.id = "Invoice"."subscriptionId"
      AND public._aria_rls_tenant_allowed(s."tenantId")
  )
);

ALTER TABLE "TenantPlanUsagePeriod" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_tenant_plan_usage_all ON "TenantPlanUsagePeriod";
CREATE POLICY aria_tenant_plan_usage_all ON "TenantPlanUsagePeriod" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

-- ─── Inventário ────────────────────────────────────────────────────────────
ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_asset_all ON "Asset";
CREATE POLICY aria_asset_all ON "Asset" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_location_all ON "Location";
CREATE POLICY aria_location_all ON "Location" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "StockItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_stock_item_all ON "StockItem";
CREATE POLICY aria_stock_item_all ON "StockItem" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Asset" a
    WHERE a.id = "StockItem"."assetId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Asset" a
    WHERE a.id = "StockItem"."assetId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
);

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_stock_movement_all ON "StockMovement";
CREATE POLICY aria_stock_movement_all ON "StockMovement" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "StockItem" si
    INNER JOIN "Asset" a ON a.id = si."assetId"
    WHERE si.id = "StockMovement"."itemId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "StockItem" si
    INNER JOIN "Asset" a ON a.id = si."assetId"
    WHERE si.id = "StockMovement"."itemId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
);

-- ─── Partilhas de ativos ───────────────────────────────────────────────────
ALTER TABLE "AssetShare" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_asset_share_all ON "AssetShare";
CREATE POLICY aria_asset_share_all ON "AssetShare" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Asset" a
    WHERE a.id = "AssetShare"."assetId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "Asset" a
    WHERE a.id = "AssetShare"."assetId"
      AND public._aria_rls_tenant_allowed(a."tenantId")
  )
);

-- ─── Ponto / registro de horas ─────────────────────────────────────────────
ALTER TABLE "WorkTimeSettings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_work_time_settings_all ON "WorkTimeSettings";
CREATE POLICY aria_work_time_settings_all ON "WorkTimeSettings" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "WorkTimePunch" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_work_time_punch_all ON "WorkTimePunch";
CREATE POLICY aria_work_time_punch_all ON "WorkTimePunch" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

-- ─── Biblioteca de referência ──────────────────────────────────────────────
ALTER TABLE "ReferenceLibrary" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_ref_lib_all ON "ReferenceLibrary";
CREATE POLICY aria_ref_lib_all ON "ReferenceLibrary" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "ReferenceLibraryField" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_ref_lib_field_all ON "ReferenceLibraryField";
CREATE POLICY aria_ref_lib_field_all ON "ReferenceLibraryField" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ReferenceLibrary" lib
    WHERE lib.id = "ReferenceLibraryField"."libraryId"
      AND public._aria_rls_tenant_allowed(lib."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ReferenceLibrary" lib
    WHERE lib.id = "ReferenceLibraryField"."libraryId"
      AND public._aria_rls_tenant_allowed(lib."tenantId")
  )
);

ALTER TABLE "ReferenceLibraryRow" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_ref_lib_row_all ON "ReferenceLibraryRow";
CREATE POLICY aria_ref_lib_row_all ON "ReferenceLibraryRow" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ReferenceLibrary" lib
    WHERE lib.id = "ReferenceLibraryRow"."libraryId"
      AND public._aria_rls_tenant_allowed(lib."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ReferenceLibrary" lib
    WHERE lib.id = "ReferenceLibraryRow"."libraryId"
      AND public._aria_rls_tenant_allowed(lib."tenantId")
  )
);

-- ─── i18n overrides ───────────────────────────────────────────────────────
ALTER TABLE "TranslationOverride" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_translation_override_all ON "TranslationOverride";
CREATE POLICY aria_translation_override_all ON "TranslationOverride" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

-- ─── Feature flags (global ou por tenant) ──────────────────────────────────
ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_feature_flag_all ON "FeatureFlag";
CREATE POLICY aria_feature_flag_all ON "FeatureFlag" FOR ALL
USING (public._aria_rls_tenant_or_global("tenantId"))
WITH CHECK (public._aria_rls_tenant_or_global("tenantId"));

-- ─── Registo de auditoria ──────────────────────────────────────────────────
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_audit_log_all ON "AuditLog";
CREATE POLICY aria_audit_log_all ON "AuditLog" FOR ALL
USING (
  public._aria_rls_privileged()
  OR ("tenantId" IS NOT NULL AND public._aria_rls_tenant_allowed("tenantId"))
)
WITH CHECK (
  public._aria_rls_privileged()
  OR ("tenantId" IS NOT NULL AND public._aria_rls_tenant_allowed("tenantId"))
);

-- ─── Prestador / rede ──────────────────────────────────────────────────────
ALTER TABLE "ProviderTenantAffiliation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_provider_affiliation_all ON "ProviderTenantAffiliation";
CREATE POLICY aria_provider_affiliation_all ON "ProviderTenantAffiliation" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "ProviderIdentity" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_provider_identity_all ON "ProviderIdentity";
CREATE POLICY aria_provider_identity_all ON "ProviderIdentity" FOR ALL
USING (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "ProviderIdentity"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "ProviderIdentity"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
);

ALTER TABLE "ProviderOnboardingApplication" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_provider_onboarding_all ON "ProviderOnboardingApplication";
CREATE POLICY aria_provider_onboarding_all ON "ProviderOnboardingApplication" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ProviderIdentity" pi
    WHERE pi.id = "ProviderOnboardingApplication"."providerIdentityId"
      AND (
        pi."userId" = NULLIF(current_setting('app.current_user_id', true), '')
        OR EXISTS (
          SELECT 1 FROM "User" u
          WHERE u.id = pi."userId"
            AND public._aria_rls_tenant_allowed(u."tenantId")
        )
      )
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ProviderIdentity" pi
    WHERE pi.id = "ProviderOnboardingApplication"."providerIdentityId"
      AND (
        pi."userId" = NULLIF(current_setting('app.current_user_id', true), '')
        OR EXISTS (
          SELECT 1 FROM "User" u
          WHERE u.id = pi."userId"
            AND public._aria_rls_tenant_allowed(u."tenantId")
        )
      )
  )
);

-- ─── Candidaturas técnicos ───────────────────────────────────────────────────
ALTER TABLE "TechnicianRegistrationApplication" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_tech_reg_app_all ON "TechnicianRegistrationApplication";
CREATE POLICY aria_tech_reg_app_all ON "TechnicianRegistrationApplication" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "TechnicianRegistrationEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_tech_reg_event_all ON "TechnicianRegistrationEvent";
CREATE POLICY aria_tech_reg_event_all ON "TechnicianRegistrationEvent" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "TechnicianRegistrationApplication" app
    WHERE app.id = "TechnicianRegistrationEvent"."applicationId"
      AND public._aria_rls_tenant_allowed(app."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "TechnicianRegistrationApplication" app
    WHERE app.id = "TechnicianRegistrationEvent"."applicationId"
      AND public._aria_rls_tenant_allowed(app."tenantId")
  )
);

-- ─── Rotina / inputs financeiros ───────────────────────────────────────────
ALTER TABLE "RoutineTaskAssignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_rt_assign_all ON "RoutineTaskAssignment";
CREATE POLICY aria_rt_assign_all ON "RoutineTaskAssignment" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "materials_receipt_inputs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_mat_receipt_in_all ON "materials_receipt_inputs";
CREATE POLICY aria_mat_receipt_in_all ON "materials_receipt_inputs" FOR ALL
USING (public._aria_rls_tenant_allowed("tenant_id"))
WITH CHECK (public._aria_rls_tenant_allowed("tenant_id"));

ALTER TABLE "technician_revenue_inputs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_tech_rev_in_all ON "technician_revenue_inputs";
CREATE POLICY aria_tech_rev_in_all ON "technician_revenue_inputs" FOR ALL
USING (public._aria_rls_tenant_allowed("tenant_id"))
WITH CHECK (public._aria_rls_tenant_allowed("tenant_id"));

-- ─── Checklists / execuções ─────────────────────────────────────────────────
ALTER TABLE "ChecklistTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_tpl_all ON "ChecklistTemplate";
CREATE POLICY aria_checklist_tpl_all ON "ChecklistTemplate" FOR ALL
USING (public._aria_rls_tenant_or_global("tenantId"))
WITH CHECK (public._aria_rls_tenant_or_global("tenantId"));

ALTER TABLE "ChecklistTemplateVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_tpl_ver_all ON "ChecklistTemplateVersion";
CREATE POLICY aria_checklist_tpl_ver_all ON "ChecklistTemplateVersion" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistTemplate" t
    WHERE t.id = "ChecklistTemplateVersion"."templateId"
      AND public._aria_rls_tenant_or_global(t."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistTemplate" t
    WHERE t.id = "ChecklistTemplateVersion"."templateId"
      AND public._aria_rls_tenant_or_global(t."tenantId")
  )
);

ALTER TABLE "ChecklistTemplateEmbedding" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_tpl_emb_all ON "ChecklistTemplateEmbedding";
CREATE POLICY aria_checklist_tpl_emb_all ON "ChecklistTemplateEmbedding" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistTemplate" t
    WHERE t.id = "ChecklistTemplateEmbedding"."templateId"
      AND public._aria_rls_tenant_or_global(t."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistTemplate" t
    WHERE t.id = "ChecklistTemplateEmbedding"."templateId"
      AND public._aria_rls_tenant_or_global(t."tenantId")
  )
);

ALTER TABLE "ChecklistExecution" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_exec_all ON "ChecklistExecution";
CREATE POLICY aria_checklist_exec_all ON "ChecklistExecution" FOR ALL
USING (
  public._aria_rls_privileged()
  OR (
    "assetId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "Asset" a
      WHERE a.id = "ChecklistExecution"."assetId"
        AND public._aria_rls_tenant_allowed(a."tenantId")
    )
  )
  OR (
    "templateId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "ChecklistTemplate" t
      WHERE t.id = "ChecklistExecution"."templateId"
        AND public._aria_rls_tenant_or_global(t."tenantId")
    )
  )
  OR (
    "ownerEmail" IS NOT NULL
    AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
    AND lower(trim("ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR (
    "assetId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "Asset" a
      WHERE a.id = "ChecklistExecution"."assetId"
        AND public._aria_rls_tenant_allowed(a."tenantId")
    )
  )
  OR (
    "templateId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "ChecklistTemplate" t
      WHERE t.id = "ChecklistExecution"."templateId"
        AND public._aria_rls_tenant_or_global(t."tenantId")
    )
  )
  OR (
    "ownerEmail" IS NOT NULL
    AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
    AND lower(trim("ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
  )
);

ALTER TABLE "ChecklistExecutionRevision" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_exec_rev_all ON "ChecklistExecutionRevision";
CREATE POLICY aria_checklist_exec_rev_all ON "ChecklistExecutionRevision" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "ChecklistExecutionRevision"."executionId"
      AND (
        public._aria_rls_privileged()
        OR (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
        OR (
          ex."ownerEmail" IS NOT NULL
          AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
          AND lower(trim(ex."ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
        )
      )
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "ChecklistExecutionRevision"."executionId"
      AND (
        public._aria_rls_privileged()
        OR (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
        OR (
          ex."ownerEmail" IS NOT NULL
          AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
          AND lower(trim(ex."ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
        )
      )
  )
);

ALTER TABLE "checklist_execution_ops_chat_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_ops_chat_msg_all ON "checklist_execution_ops_chat_messages";
CREATE POLICY aria_ops_chat_msg_all ON "checklist_execution_ops_chat_messages" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "checklist_execution_ops_chat_messages"."execution_id"
      AND (
        (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
        OR (
          ex."ownerEmail" IS NOT NULL
          AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
          AND lower(trim(ex."ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
        )
      )
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "checklist_execution_ops_chat_messages"."execution_id"
      AND (
        (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
        OR (
          ex."ownerEmail" IS NOT NULL
          AND NULLIF(current_setting('app.current_user_email', true), '') IS NOT NULL
          AND lower(trim(ex."ownerEmail")) = lower(trim(NULLIF(current_setting('app.current_user_email', true), '')))
        )
      )
  )
);

ALTER TABLE "tracking_chat_moderation_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_track_chat_mod_all ON "tracking_chat_moderation_events";
CREATE POLICY aria_track_chat_mod_all ON "tracking_chat_moderation_events" FOR ALL
USING (
  public._aria_rls_privileged()
  OR ("tenant_id" IS NOT NULL AND public._aria_rls_tenant_allowed("tenant_id"))
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "tracking_chat_moderation_events"."execution_id"
      AND (
        (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
      )
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR ("tenant_id" IS NOT NULL AND public._aria_rls_tenant_allowed("tenant_id"))
  OR EXISTS (
    SELECT 1 FROM "ChecklistExecution" ex
    WHERE ex.id = "tracking_chat_moderation_events"."execution_id"
      AND (
        (
          ex."assetId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Asset" a
            WHERE a.id = ex."assetId"
              AND public._aria_rls_tenant_allowed(a."tenantId")
          )
        )
        OR (
          ex."templateId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "ChecklistTemplate" t
            WHERE t.id = ex."templateId"
              AND public._aria_rls_tenant_or_global(t."tenantId")
          )
        )
      )
  )
);

-- ─── Pastas de modelos (sem tenant na tabela — acesso plataforma) ─────────
ALTER TABLE "ChecklistTemplateFolder" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_checklist_folder_all ON "ChecklistTemplateFolder";
CREATE POLICY aria_checklist_folder_all ON "ChecklistTemplateFolder" FOR ALL
USING (public._aria_rls_privileged())
WITH CHECK (public._aria_rls_privileged());

-- ─── Política de coleta / PDF presets ──────────────────────────────────────
ALTER TABLE "CollectionPolicy" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_collection_policy_all ON "CollectionPolicy";
CREATE POLICY aria_collection_policy_all ON "CollectionPolicy" FOR ALL
USING (public._aria_rls_tenant_or_global("tenantId"))
WITH CHECK (public._aria_rls_tenant_or_global("tenantId"));

ALTER TABLE "PdfReportPreset" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_pdf_preset_all ON "PdfReportPreset";
CREATE POLICY aria_pdf_preset_all ON "PdfReportPreset" FOR ALL
USING (public._aria_rls_tenant_or_global("tenantId"))
WITH CHECK (public._aria_rls_tenant_or_global("tenantId"));

-- ─── Avaliações (tenant obrigatório nas principais) ─────────────────────────
ALTER TABLE "EvaluationTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_tpl_all ON "EvaluationTemplate";
CREATE POLICY aria_eval_tpl_all ON "EvaluationTemplate" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "EvaluationTemplateQuestion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_tpl_q_all ON "EvaluationTemplateQuestion";
CREATE POLICY aria_eval_tpl_q_all ON "EvaluationTemplateQuestion" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationTemplate" et
    WHERE et.id = "EvaluationTemplateQuestion"."templateId"
      AND public._aria_rls_tenant_allowed(et."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationTemplate" et
    WHERE et.id = "EvaluationTemplateQuestion"."templateId"
      AND public._aria_rls_tenant_allowed(et."tenantId")
  )
);

ALTER TABLE "EvaluationInstance" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_instance_all ON "EvaluationInstance";
CREATE POLICY aria_eval_instance_all ON "EvaluationInstance" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "EvaluationResponse" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_response_all ON "EvaluationResponse";
CREATE POLICY aria_eval_response_all ON "EvaluationResponse" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationResponse"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationResponse"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
);

ALTER TABLE "EvaluationScore" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_score_all ON "EvaluationScore";
CREATE POLICY aria_eval_score_all ON "EvaluationScore" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationScore"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationScore"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
);

ALTER TABLE "EvaluationAcknowledgement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_ack_all ON "EvaluationAcknowledgement";
CREATE POLICY aria_eval_ack_all ON "EvaluationAcknowledgement" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationAcknowledgement"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationAcknowledgement"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
);

ALTER TABLE "EvaluationInternalNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_note_all ON "EvaluationInternalNote";
CREATE POLICY aria_eval_note_all ON "EvaluationInternalNote" FOR ALL
USING (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationInternalNote"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR EXISTS (
    SELECT 1 FROM "EvaluationInstance" ei
    WHERE ei.id = "EvaluationInternalNote"."instanceId"
      AND public._aria_rls_tenant_allowed(ei."tenantId")
  )
);

ALTER TABLE "EvaluationActionPlan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_action_all ON "EvaluationActionPlan";
CREATE POLICY aria_eval_action_all ON "EvaluationActionPlan" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

ALTER TABLE "EvaluationDispute" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_eval_dispute_all ON "EvaluationDispute";
CREATE POLICY aria_eval_dispute_all ON "EvaluationDispute" FOR ALL
USING (public._aria_rls_tenant_allowed("tenantId"))
WITH CHECK (public._aria_rls_tenant_allowed("tenantId"));

-- ─── Contadores globais (só plataforma / bridge) ───────────────────────────
ALTER TABLE "RtSerialCounter" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_rt_serial_all ON "RtSerialCounter";
CREATE POLICY aria_rt_serial_all ON "RtSerialCounter" FOR ALL
USING (public._aria_rls_privileged())
WITH CHECK (public._aria_rls_privileged());

ALTER TABLE "OsSerialCounter" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_os_serial_all ON "OsSerialCounter";
CREATE POLICY aria_os_serial_all ON "OsSerialCounter" FOR ALL
USING (public._aria_rls_privileged())
WITH CHECK (public._aria_rls_privileged());

-- ─── Perfil técnico / sessões app (via User.tenantId) ───────────────────────
ALTER TABLE "TechnicianProfile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_technician_profile_all ON "TechnicianProfile";
CREATE POLICY aria_technician_profile_all ON "TechnicianProfile" FOR ALL
USING (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "TechnicianProfile"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "TechnicianProfile"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
);

ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_push_token_all ON "PushToken";
CREATE POLICY aria_push_token_all ON "PushToken" FOR ALL
USING (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "PushToken"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "PushToken"."userId"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
);

ALTER TABLE "app_refresh_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_app_refresh_sess_all ON "app_refresh_sessions";
CREATE POLICY aria_app_refresh_sess_all ON "app_refresh_sessions" FOR ALL
USING (
  public._aria_rls_privileged()
  OR "user_id" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "app_refresh_sessions"."user_id"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
)
WITH CHECK (
  public._aria_rls_privileged()
  OR "user_id" = NULLIF(current_setting('app.current_user_id', true), '')
  OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "app_refresh_sessions"."user_id"
      AND public._aria_rls_tenant_allowed(u."tenantId")
  )
);
