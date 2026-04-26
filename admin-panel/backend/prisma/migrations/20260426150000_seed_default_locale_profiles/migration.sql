-- Default LocaleProfile rows for tenant creation / multi-region SaaS.
-- Idempotent: does not overwrite existing rows (same countryCode).

INSERT INTO "LocaleProfile" (
  "id",
  "countryCode",
  "name",
  "language",
  "currency",
  "currencySymbol",
  "dateFormat",
  "numberFormat",
  "timezone",
  "taxIdLabel",
  "postalCodeLabel",
  "measureSystem",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
  ('bsp_loc_br', 'BR', 'Brasil', 'pt-BR', 'BRL', 'R$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Sao_Paulo', 'CPF', 'CEP', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_us', 'US', 'United States', 'en-US', 'USD', '$', 'MM/DD/YYYY', 'US_STYLE', 'America/New_York', 'Tax ID', 'ZIP', 'IMPERIAL', true, NOW(), NOW()),
  ('bsp_loc_pt', 'PT', 'Portugal', 'pt-PT', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Lisbon', 'NIF', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_es', 'ES', 'Espanha', 'es-ES', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Madrid', 'NIF / CIF', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_de', 'DE', 'Alemanha', 'de-DE', 'EUR', '€', 'DD.MM.YYYY', 'PT_STYLE', 'Europe/Berlin', 'Steuer-ID', 'PLZ', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_fr', 'FR', 'França', 'fr-FR', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Paris', 'SIRET', 'Code postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_gb', 'GB', 'Reino Unido', 'en-GB', 'GBP', '£', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/London', 'Company No.', 'Postcode', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_mx', 'MX', 'México', 'es-MX', 'MXN', '$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Mexico_City', 'RFC', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_ar', 'AR', 'Argentina', 'es-AR', 'ARS', '$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Argentina/Buenos_Aires', 'CUIT', 'CPA', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_cl', 'CL', 'Chile', 'es-CL', 'CLP', '$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Santiago', 'RUT', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_co', 'CO', 'Colômbia', 'es-CO', 'COP', '$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Bogota', 'NIT', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_pe', 'PE', 'Peru', 'es-PE', 'PEN', 'S/', 'DD/MM/YYYY', 'PT_STYLE', 'America/Lima', 'RUC', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_uy', 'UY', 'Uruguai', 'es-UY', 'UYU', '$', 'DD/MM/YYYY', 'PT_STYLE', 'America/Montevideo', 'RUT', 'Código postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_it', 'IT', 'Itália', 'it-IT', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Rome', 'Codice fiscale', 'CAP', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_nl', 'NL', 'Países Baixos', 'nl-NL', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Amsterdam', 'KvK / BTW', 'Postcode', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_be', 'BE', 'Bélgica', 'nl-BE', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Brussels', 'Numéro entreprise', 'Code postal', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_ch', 'CH', 'Suíça', 'de-CH', 'CHF', 'CHF', 'DD.MM.YYYY', 'PT_STYLE', 'Europe/Zurich', 'UID', 'PLZ', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_at', 'AT', 'Áustria', 'de-AT', 'EUR', '€', 'DD.MM.YYYY', 'PT_STYLE', 'Europe/Vienna', 'UID', 'PLZ', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_pl', 'PL', 'Polónia', 'pl-PL', 'PLN', 'zł', 'DD.MM.YYYY', 'PT_STYLE', 'Europe/Warsaw', 'NIP', 'Kod pocztowy', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_ie', 'IE', 'Irlanda', 'en-IE', 'EUR', '€', 'DD/MM/YYYY', 'PT_STYLE', 'Europe/Dublin', 'Tax ID', 'Eircode', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_ca', 'CA', 'Canadá', 'en-CA', 'CAD', '$', 'YYYY-MM-DD', 'US_STYLE', 'America/Toronto', 'BN / NEQ', 'Postal code', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_au', 'AU', 'Austrália', 'en-AU', 'AUD', '$', 'DD/MM/YYYY', 'PT_STYLE', 'Australia/Sydney', 'ABN', 'Postcode', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_nz', 'NZ', 'Nova Zelândia', 'en-NZ', 'NZD', '$', 'DD/MM/YYYY', 'PT_STYLE', 'Pacific/Auckland', 'IRD', 'Postcode', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_jp', 'JP', 'Japão', 'ja-JP', 'JPY', '¥', 'YYYY/MM/DD', 'US_STYLE', 'Asia/Tokyo', 'Corporate No.', 'Postal code', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_cn', 'CN', 'China', 'zh-CN', 'CNY', '¥', 'YYYY-MM-DD', 'US_STYLE', 'Asia/Shanghai', 'USCC', 'Postal code', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_in', 'IN', 'Índia', 'en-IN', 'INR', '₹', 'DD/MM/YYYY', 'PT_STYLE', 'Asia/Kolkata', 'PAN / GSTIN', 'PIN', 'METRIC', true, NOW(), NOW()),
  ('bsp_loc_za', 'ZA', 'África do Sul', 'en-ZA', 'ZAR', 'R', 'DD/MM/YYYY', 'PT_STYLE', 'Africa/Johannesburg', 'Reg. No.', 'Postal code', 'METRIC', true, NOW(), NOW())
ON CONFLICT ("countryCode") DO NOTHING;
