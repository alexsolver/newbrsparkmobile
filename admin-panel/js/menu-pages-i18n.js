/**
 * Páginas do menu admin sem módulo próprio — pt-BR / en-US (es-ES via fallback adminResolve).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    common_bc_panel: 'Painel',
    common_loading: 'Carregando…',
    common_cancel: 'Cancelar',
    common_save: 'Salvar',
    common_delete: 'Excluir',
    common_yes: 'Sim',
    common_no: 'Não',
    common_unlimited: 'Ilimitado',
    common_breadcrumb_trail: 'Trilha',

    /* Tenants */
    ten_pageTitle: 'BrSpark Admin — Tenants',
    ten_bc_here: 'Tenants',
    ten_hero_title: 'Gestão de tenants',
    ten_hero_sub:
      'Contas da plataforma, planos e status. Filtre por nome, plano ou situação; os cartões refletem o resultado atual da lista (até 200 registros).',
    ten_search_ph: 'Buscar por nome ou slug…',
    ten_lbl_plan: 'Plano',
    ten_lbl_status: 'Status',
    ten_opt_all_plans: 'Todos os planos',
    ten_opt_all_status: 'Todos os status',
    ten_st_TRIAL: 'Trial',
    ten_st_ACTIVE: 'Ativo',
    ten_st_SUSPENDED: 'Suspenso',
    ten_st_CANCELLED: 'Cancelado',
    ten_btn_new: 'Novo tenant',
    ten_table_title: 'Lista de tenants',
    ten_th_slug: 'Slug',
    ten_th_region: 'Região',
    ten_th_name: 'Nome',
    ten_th_plan: 'Plano',
    ten_th_users: 'Usuários',
    ten_th_assets: 'Bens',
    ten_th_status: 'Status',
    ten_th_created: 'Criado em',
    ten_th_actions: 'Ações',
    ten_stat_total: 'Total (lista)',
    ten_stat_active: 'Ativos (lista)',
    ten_stat_trial: 'Trial (lista)',
    ten_stat_susp: 'Suspensos (lista)',
    ten_count_one: '1 tenant',
    ten_count_many: '{n} tenants',
    ten_empty_title: 'Nenhum tenant encontrado',
    ten_empty_sub: 'Ajuste a busca ou os filtros, ou crie um novo tenant.',
    ten_undefined_region: 'Não definido',
    ten_row_suspend: 'Suspender',
    ten_row_activate: 'Ativar',
    ten_modal_title: 'Novo Tenant',
    ten_lbl_company: 'Nome da Empresa *',
    ten_ph_company: 'Ex: Benedito Imóveis',
    ten_lbl_admin_email: 'E-mail do Admin *',
    ten_ph_admin_email: 'admin@empresa.com',
    ten_lbl_region: 'Região/País *',
    ten_opt_region_pick: 'Selecione a localização…',
    ten_lbl_plan_modal: 'Plano',
    ten_opt_no_plan: 'Sem plano',
    ten_lbl_default_lang: 'Idioma Padrão',
    ten_btn_create: 'Criar Tenant',
    ten_alert_required: 'Campos obrigatórios: Nome, E-mail e Região.',
    ten_plan_per_mo: '/mês',

    /* Subscriptions */
    sub_pageTitle: 'BrSpark Admin — Assinaturas',
    sub_bc_here: 'Assinaturas',
    sub_hero_title: 'Planos e assinaturas',
    sub_hero_sub:
      'Pacotes ativos, cotas e vínculos com tenants. Atribua planos, ajuste biometria por pacote e acompanhe o status das assinaturas.',
    sub_section_plans: 'Planos ativos',
    sub_link_configure: 'Configurar planos',
    sub_link_billing: 'Billing e MRR',
    sub_lbl_status: 'Status',
    sub_opt_all_status: 'Todos os status',
    sub_st_ACTIVE: 'Ativo',
    sub_st_TRIALING: 'Trial',
    sub_st_PAST_DUE: 'Em atraso',
    sub_st_CANCELLED: 'Cancelado',
    sub_btn_assign: 'Atribuir plano',
    sub_table_title: 'Assinaturas',
    sub_th_tenant: 'Tenant',
    sub_th_plan: 'Plano',
    sub_th_cycle: 'Ciclo',
    sub_th_status: 'Status',
    sub_th_start: 'Início',
    sub_th_end: 'Vencimento',
    sub_th_actions: 'Ações',
    sub_cycle_MONTHLY: 'Mensal',
    sub_cycle_YEARLY: 'Anual (10% desconto)',
    sub_cycle_YEARLY_short: 'Anual',
    sub_facial_modal_title: 'Biometria facial — API por plano',
    sub_facial_intro: 'Plano:',
    sub_facial_body_html:
      'Define qual integração de visão (em <strong>Integrações</strong>) este plano pode usar no reconhecimento facial na app. O formulário já não escolhe o provedor — só o plano do tenant.',
    sub_facial_lbl: 'Motor de reconhecimento facial',
    sub_facial_opt_fm: 'FaceMatch (local) — padrão',
    sub_facial_opt_auto: 'Automático (prefere FaceMatch, senão AWS se configurado)',
    sub_facial_opt_aws: 'AWS Rekognition (custo API; ainda limitado no servidor)',
    sub_facial_hint: 'Valor gravado em plan.features.facialVisionProvider. Tenants sem assinatura usam FaceMatch.',
    sub_facial_save: 'Salvar',
    sub_modal_assign_title: 'Atribuir plano',
    sub_lbl_tenant: 'Tenant',
    sub_lbl_plan: 'Plano',
    sub_lbl_cycle: 'Ciclo de cobrança',
    sub_btn_assign_go: 'Atribuir',
    sub_facial_auto: 'Automático',
    sub_facial_aws: 'AWS',
    sub_facial_fm: 'FaceMatch',
    sub_plan_card_assets: 'bens',
    sub_plan_card_users: 'usuários no painel',
    sub_plan_card_tech: 'Técnicos:',
    sub_plan_card_ia: 'IA/mês facial',
    sub_plan_card_vis_det: 'visão det.',
    sub_plan_card_vis_an: 'visão IA análise (Gemini)',
    sub_plan_card_maps_routes: 'Google Maps (rotas)',
    sub_plan_card_ft: 'FT',
    sub_plan_card_rt: 'RT',
    sub_plan_card_forms: 'Formulários',
    sub_plan_card_facial: 'Facial:',
    sub_plan_card_tenants: 'tenants',
    sub_plan_btn_facial: 'Biometria / API',
    sub_plan_btn_facial_title: 'Configurar API de reconhecimento facial',
    sub_empty_plans: 'Nenhum plano cadastrado.',
    sub_empty_subs_title: 'Nenhuma assinatura',
    sub_empty_subs_sub: 'Altere o filtro de status ou atribua um plano a um tenant.',
    sub_count_one: '1 assinatura',
    sub_count_many: '{n} assinaturas',
    sub_btn_cancel_sub: 'Cancelar',
    sub_confirm_cancel: 'Cancelar esta assinatura?',
    sub_alert_pick: 'Selecione tenant e plano.',
    sub_tmpl_count_one: '1 template',
    sub_tmpl_count_many: '{n} templates',

    /* Plans */
    pln_pageTitle: 'BrSpark Admin — Planos (pacotes)',
    pln_bc_here: 'Planos (pacotes)',
    pln_hero_title: 'Catálogo de planos',
    pln_hero_sub_html:
      'Defina preços, limites e cotas mensais (IA, <strong>APIs Google</strong> — Maps rotas e visão IA análise Gemini, OS de campo, rotina, formulários). Os tenants herdam estes valores pela <a href="subscriptions.html" style="color:var(--accent);font-weight:700">assinatura</a>. <span style="color:var(--text3)">−1 = ilimitado</span> onde aplicável.',
    pln_link_subs: 'Assinaturas',
    pln_link_billing: 'Billing e MRR',
    pln_btn_new: 'Novo plano',
    pln_table_title: 'Todos os pacotes',
    pln_th_name: 'Nome',
    pln_th_pm: 'R$/mês',
    pln_th_py: 'R$/ano',
    pln_th_subs: 'Subs',
    pln_th_assets: 'Bens',
    pln_th_users: 'Usuários',
    pln_th_tech: 'Téc.',
    pln_th_gb: 'GB',
    pln_th_ft: 'FT/mês',
    pln_th_active: 'Ativo',
    pln_th_actions: 'Ações',
    pln_modal_new: 'Novo plano',
    pln_modal_edit: 'Editar: ',
    pln_chk_active: 'Plano ativo (visível para novas assinaturas)',
    pln_lbl_name: 'Nome do plano *',
    pln_ph_name: 'Ex.: Pro',
    pln_lbl_price_m: 'Preço mensal (R$) *',
    pln_lbl_price_y: 'Preço anual (R$) *',
    pln_lbl_max_assets: 'Limite de bens (−1 = ilimitado)',
    pln_lbl_max_users: 'Usuários do painel (−1 = ilimitado)',
    pln_lbl_storage: 'Armazenamento (GB)',
    pln_quotas_title: 'Cotas por tenant neste plano',
    pln_quotas_hint:
      'Técnicos = equipe em campo que usa o app no terreno. <strong>−1</strong> = ilimitado. <strong>0</strong> nas cotas Google (Mapas ou visão para análise) bloqueia o uso nesse plano.',
    pln_lbl_max_tech: 'Máx. técnicos',
    pln_lbl_ai_face: 'IA — facial / mês',
    pln_lbl_ai_vis_det: 'IA — visão detecção / mês',
    pln_lbl_ai_vis_an: 'Visão IA — análise (Google Gemini, checklist) / mês',
    pln_api_section_title: 'APIs Google (por tenant / mês)',
    pln_lbl_google_maps: 'Google Maps — rotas (ETA, computeRoutes) / mês',
    pln_lbl_ft: 'OS campo (FT) / mês',
    pln_lbl_rt: 'Rotina (RT) / mês',
    pln_lbl_max_tpl: 'Máx. formulários (tenantId no modelo)',
    pln_features_title: 'Recursos do pacote',
    pln_features_intro:
      'Ative ou desative módulos do produto para quem assinar este plano. Limites numéricos (IA, Mapas, OS de campo) ficam na secção «Cotas» acima — não são alterados aqui.',
    pln_feat_stock: 'Estoque',
    pln_feat_stock_hint: 'Controle de inventário e bens.',
    pln_feat_vault: 'Cofre',
    pln_feat_vault_hint: 'Área para documentos e arquivos com reforço de segurança.',
    pln_feat_ai: 'Assistente de IA',
    pln_feat_ai_hint: 'Recursos de inteligência artificial no produto (além das cotas mensais acima).',
    pln_feat_documents: 'Documentos',
    pln_feat_documents_hint: 'Gestão de documentos e anexos no fluxo habitual.',
    pln_feat_insurance: 'Seguros',
    pln_feat_insurance_hint: 'Funcionalidades ligadas a seguros e sinistros.',
    pln_feat_reports: 'Relatórios avançados',
    pln_feat_reports_hint: 'Relatórios e exportações para gestão.',
    pln_feat_realtime: 'Tempo real',
    pln_feat_realtime_hint: 'Atualizações e sincronização em tempo quase real.',
    pln_feat_facial_lbl: 'Motor de reconhecimento facial',
    pln_feat_facial_hint: 'Define qual integração de biometria usar neste plano.',
    pln_facial_compreface: 'Compreface (recomendado)',
    pln_facial_aws: 'Amazon Rekognition',
    pln_facial_auto: 'Automático (usa a integração ativa disponível)',
    pln_features_adv_summary: 'Avançado — JSON extra (só suporte técnico)',
    pln_lbl_features_adv: 'Chaves extras (JSON)',
    pln_features_adv_hint:
      'Deixe vazio na maior parte dos casos. Só preencha se a equipa técnica pedir chaves adicionais em «features».',
    pln_lbl_features: 'Recursos (legado)',
    pln_btn_save_plan: 'Salvar plano',
    pln_empty_title: 'Nenhum plano cadastrado',
    pln_empty_sub: 'Crie o primeiro pacote com «Novo plano».',
    pln_badge_yes: 'Sim',
    pln_badge_no: 'Não',
    pln_btn_edit: 'Editar',
    pln_btn_dup: 'Duplicar',
    pln_confirm_dup: 'Criar um plano novo copiando limites de «{name}»?',
    pln_dup_suffix: ' (cópia)',
    pln_dup_suffix_n: ' (cópia {n})',
    pln_dup_base: 'Plano',
    pln_alert_dup_ok: 'Plano duplicado. Fica inativo por padrão — edite e ative quando quiser.',
    pln_alert_dup_err: 'Falha ao duplicar.',
    pln_save_fail: 'Falha ao salvar.',
    pln_alert_json: 'JSON de features inválido.',
    pln_alert_json_adv: 'O JSON extra em «Avançado» está inválido. Corrija ou apague o conteúdo desse campo.',
    pln_alert_name: 'Nome é obrigatório.',
    pln_alert_save_err: 'Erro: {detail}',

    /* System */
    sys_pageTitle: 'BrSpark Admin — Sistema',
    sys_bc_here: 'Sistema',
    sys_hero_title: 'Configurações do sistema',
    sys_hero_sub:
      'Feature flags globais, estado da API e parâmetros gerais da plataforma. Alterações críticas devem ser coordenadas com a equipe técnica.',
    sys_flags_title: 'Feature flags globais',
    sys_info_title: 'Informações do sistema',
    sys_app_ver: 'Versão do App',
    sys_db: 'Banco de Dados',
    sys_api: 'API Backend',
    sys_server: 'Servidor',
    sys_global_title: 'Configurações globais',
    sys_lbl_lang: 'Idioma padrão',
    sys_lbl_retention: 'Retenção de logs (dias)',
    sys_lbl_trial: 'Período de trial (dias)',
    sys_db_checking: 'PostgreSQL (verificando…)',
    sys_db_ok: 'PostgreSQL — conectado',
    sys_api_checking: 'Verificando',
    sys_api_online: 'Online',
    sys_api_offline: 'Offline',
    sys_flags_count: '{n} flags',
    sys_alert_saved: 'Configurações salvas (persistência em desenvolvimento).',

    /* API docs */
    apidoc_pageTitle: 'BrSpark Admin — API Docs',
    apidoc_bc_here: 'Documentação da API',
    apidoc_hero_title: 'Documentação da API',
    apidoc_hero_sub:
      'Especificação OpenAPI interativa (Swagger). Autentique com JWT de admin ou de app conforme o fluxo de cada rota.',
    apidoc_btn_dl: 'Baixar OpenAPI (JSON)',
    apidoc_btn_open: 'Abrir JSON',
    apidoc_intro_1_html:
      'Esta página reflete as rotas expostas pelo backend em <code>admin-panel/backend/src/index.js</code> e pelos routers em <code>routes/</code>. A especificação OpenAPI é gerada por <code>admin-panel/scripts/build-openapi.js</code> — após alterar rotas, execute <code>npm run openapi</code> na pasta <code>admin-panel/backend</code>.',
    apidoc_intro_2_html:
      '<strong>Admin:</strong> obtenha JWT com <code>POST /api/auth/login</code> e use <em>Authorize → bearerAdmin</em>.<br /><strong>App:</strong> <code>POST /api/login</code> ou <code>POST /api/register</code> → <em>bearerApp</em>. Rotas públicas não exigem cabeçalho <code>Authorization</code>.',
    apidoc_err_load: 'Falha ao carregar: {src}',
    apidoc_err_swagger: 'Não foi possível carregar o Swagger UI (rede ou CDN).',

    /* Notifications */
    notif_pageTitle: 'BrSpark Admin — Notificações',
    notif_bc_here: 'Notificações',
    notif_hero_title: 'Notificações',
    notif_hero_sub:
      'Modelos por canal (e-mail, push, WhatsApp, SMS) e histórico de envios. Ative ou desative templates sem alterar o conteúdo.',
    notif_btn_new: 'Novo template',
    notif_panel_tmpl: 'Templates de notificação',
    notif_panel_log: 'Histórico de envios',
    notif_modal_new: 'Novo Template',
    notif_modal_edit: 'Editar template',
    notif_lbl_key: 'Chave (key)',
    notif_ph_key: 'Ex: password_reset',
    notif_lbl_label: 'Label',
    notif_ph_label: 'Resetar senha',
    notif_lbl_channel: 'Canal',
    notif_ch_EMAIL: 'E-mail',
    notif_ch_PUSH: 'Push',
    notif_ch_WHATSAPP: 'WhatsApp',
    notif_ch_SMS: 'SMS',
    notif_lbl_subject: 'Assunto (e-mail)',
    notif_ph_subject: '{{name}}, sua senha foi resetada',
    notif_lbl_body: 'Corpo (use {{variavel}} para vars)',
    notif_ph_body: 'Olá {{name}},\n\nSua senha foi resetada...',
    notif_btn_save: 'Salvar template',
    notif_key_prefix: 'Chave:',
    notif_subject_prefix: 'Assunto:',
    notif_btn_edit: 'Editar',
    notif_empty_tmpl_title: 'Nenhum template',
    notif_empty_tmpl_sub: 'Crie um template com «Novo template».',
    notif_empty_log_title: 'Nenhum envio registrado',
    notif_empty_log_sub: 'Os envios aparecem aqui após o sistema processar as filas.',
    notif_alert_required: 'Preencha os campos obrigatórios.',
    notif_tmpl_count_one: '1 template',
    notif_tmpl_count_many: '{n} templates',

    /* Locations */
    loc_pageTitle: 'BrSpark Admin — Multi-location (países e idiomas)',
    loc_bc_here: 'Multi-location',
    loc_hero_title: 'Países, regiões e idiomas',
    loc_hero_sub:
      'Locales ativos na plataforma, idiomas suportados e estatísticas agregadas por tenant. Use a busca para filtrar cartões; a tabela abaixo resume a cobertura de idiomas.',
    loc_stat_countries: 'Países ativos',
    loc_stat_langs: 'Idiomas suportados',
    loc_stat_users: 'Usuários nesses países',
    loc_stat_assets: 'Bens cadastrados',
    loc_search_ph: 'Buscar país ou código…',
    loc_table_regions: 'Regiões habilitadas',
    loc_btn_add_country: 'Adicionar país',
    loc_table_coverage: 'Cobertura de idiomas na plataforma',
    loc_th_lang: 'Idioma',
    loc_th_code: 'Código',
    loc_th_status: 'Status',
    loc_th_users: 'Usuários',
    loc_th_cov_app: 'Cobertura app',
    loc_th_cov_panel: 'Cobertura painel',
    loc_th_quality: 'Qualidade',
    loc_badge_enabled: 'Habilitado',
    loc_badge_inactive: '— Inativo',
    loc_badge_complete: 'Completo',
    loc_empty_regions_title: 'Nenhuma região encontrada',
    loc_empty_regions_sub: 'Ajuste o termo de busca ou limpe o filtro para ver todos os países.',
    loc_stat_users_lbl: 'Usuários',
    loc_stat_assets_lbl: 'Bens',
    loc_stat_status_lbl: 'Status',
    loc_toggle_on: 'Habilitado',
    loc_toggle_off: 'Desabilitado',
    loc_count_regions: '{n} regiões',
    loc_alert_country_required: 'Nome e código do país são obrigatórios.',
    loc_alert_country_stub: 'País «{name}» ({code}) será adicionado. Implemente a rota /api/regions para persistência.',

    /* Compliance */
    cmp_pageTitle: 'BrSpark Admin — Compliance LGPD',
    cmp_bc_here: 'Compliance',
    cmp_hero_title: 'Compliance e LGPD',
    cmp_hero_sub:
      'Versões de termos, políticas e DPA; histórico por tipo e aceitações registradas. Publique apenas após revisão jurídica.',
    cmp_btn_new: 'Nova versão',
    cmp_stat_versions: 'Versões totais',
    cmp_stat_active: 'Docs ativos',
    cmp_stat_accept: 'Aceitações registradas',
    cmp_stat_last: 'Última publicação',
    cmp_table_title: 'Documentos legais',
    cmp_editor_back: '← Voltar',
    cmp_editor_new_title: 'Nova versão',
    cmp_btn_draft: 'Salvar rascunho',
    cmp_btn_publish: 'Publicar',
    cmp_lbl_type: 'Tipo',
    cmp_lbl_version: 'Versão',
    cmp_ph_version: 'Ex: 2.0',
    cmp_lbl_doc_title: 'Título',
    cmp_ph_doc_title: 'Título completo do documento',
    cmp_lbl_content: 'Conteúdo (Markdown)',
    cmp_ph_content: '# Título\n\nEscreva o conteúdo em Markdown...',
    cmp_type_TERMS: 'Termos de Uso',
    cmp_type_PRIVACY: 'Política de Privacidade',
    cmp_type_DPA: 'DPA — LGPD',
    cmp_type_COOKIE: 'Política de Cookies',
    cmp_alert_err: 'Erro: {detail}',
    cmp_editor_editing: 'Editando: {title}',

    /* Metatags */
    mt_pageTitle: 'BrSpark Admin — Metatags & Categorias',
    mt_bc_here: 'Metatags',
    mt_hero_title: 'Metatags e categorias',
    mt_hero_sub:
      'Tipos de bem, estoque, serviço, despesas, receitas, mídia e tags globais usados no app e no painel. Filtre por tipo e mantenha chaves estáveis para não quebrar dados existentes.',
    mt_stat_total: 'Total',
    mt_stat_asset: 'Tipos de Bem',
    mt_stat_stock: 'Cat. Estoque',
    mt_stat_service: 'Cat. Serviço',
    mt_stat_expense: 'Despesa (bens)',
    mt_stat_tech_exp: 'Desp. técnico',
    mt_stat_revenue: 'Cat. Receita',
    mt_stat_media: 'Cat. Mídia',
    mt_stat_global: 'Tags Globais',
    mt_lbl_type: 'Tipo',
    mt_opt_all_types: 'Todos os tipos',
    mt_opt_ASSET_TYPE: 'Tipos de bem',
    mt_opt_STOCK_CATEGORY: 'Categorias de estoque',
    mt_opt_SERVICE_CATEGORY: 'Categorias de serviço',
    mt_opt_EXPENSE_CATEGORY: 'Categorias de despesa (bens)',
    mt_opt_TECHNICIAN_EXPENSE_CATEGORY: 'Despesa do técnico',
    mt_opt_REVENUE_CATEGORY: 'Categorias de receita',
    mt_opt_ASSET_STATUS: 'Status de bens',
    mt_opt_MEDIA_CATEGORY: 'Categorias de mídia',
    mt_opt_GLOBAL_TAG: 'Tags globais',
    mt_btn_new: 'Nova metatag',
    mt_table_title: 'Metatags cadastradas',
    mt_th_icon: 'Ícone',
    mt_th_type: 'Tipo',
    mt_th_key: 'Chave',
    mt_th_pt: 'PT-BR',
    mt_th_color: 'Cor',
    mt_th_status: 'Status',
    mt_th_actions: 'Ações',
    mt_confirm_delete: 'Excluir esta metatag?',
    mt_alert_key_pt: 'Chave e Nome PT-BR são obrigatórios.',
    mt_alert_save_err: 'Erro: {detail}',

    /* i18n admin page */
    trl_pageTitle: 'BrSpark Admin — Traduções e regionais',
    trl_bc_here: 'Traduções e regionais',
    trl_hero_title: 'Traduções e configurações regionais',
    trl_hero_sub:
      'Dicionário do app, metatags, flags, perfis de locale e overrides por tenant. Salve após editar; a tradução com IA preenche só campos vazios.',
    trl_search_ph: 'Buscar por chave ou conteúdo…',
    trl_lbl_source: 'Fonte',
    trl_src_app: 'Dicionário do app',
    trl_src_metatags: 'Metatags (categorias)',
    trl_src_flags: 'Feature flags',
    trl_src_locales: 'Configurações regionais',
    trl_src_overrides: 'Customização por tenant',
    trl_lbl_tenant: 'Tenant',
    trl_opt_tenant_pick: 'Selecione o tenant…',
    trl_counter: '{n} entradas',
    trl_locales_count: '{n} perfis',
    trl_btn_ai: 'Traduzir com IA',
    trl_btn_ai_title: 'Traduz campos vazios com IA',
    trl_btn_save: 'Salvar alterações',
    trl_table_title: 'Entradas',
    trl_th_key: 'Chave / ID',
    trl_th_pt: 'Português (pt-BR)',
    trl_th_en: 'Inglês (en-US)',
    trl_th_es: 'Espanhol (es-ES)',
    trl_loading: 'Carregando traduções…',
    trl_ai_title: 'Tradução com IA',
    trl_ai_sub: 'Preenchendo campos vazios via MyMemory API...',
    trl_ai_modal_title: 'Tradução com IA',
    trl_alert_profile_ok: 'Perfil atualizado!',
    trl_alert_no_changes: 'Sem alterações.',
    trl_alert_saved: 'Alterações salvas!',
    trl_alert_err: 'Erro: {msg}',
    trl_alert_no_val: 'Nenhum valor para traduzir nesta linha.',
    trl_alert_no_empty: 'Nenhum campo vazio encontrado nos resultados visíveis.',

    /* Work time — chrome */
    wt_pageTitle: 'BrSpark Admin — Registro de horas',
    wt_bc_here: 'Registro de horas',
    wt_hero_title: 'Registro de horas trabalhadas',
    wt_hero_sub:
      'Política de ponto por organização: módulo, obrigatoriedades de face/GPS/endereço e integridade. O app respeita também a flag global e a habilitação por usuário.',
    wt_btn_save: 'Salvar',
    wt_alert_pick_tenant: 'Selecione o tenant.',
    wt_alert_saved: 'Configurações guardadas.',

    /* Telemetry */
    tel_pageTitle: 'BrSpark Admin — Monitoramento de Telemetria',
    tel_bc_here: 'Telemetria',
    tel_hero_title: 'Rastreamento de telemetria',
    tel_hero_sub:
      'Eventos de campo, mapa e detalhes por lote. Filtre por e-mail do técnico e intervalo de datas; use «Ao vivo» com cautela em redes lentas.',
    tel_lbl_email: 'E-mail do técnico',
    tel_ph_email: 'ex: técnico@empresa.com',
    tel_lbl_date_from: 'Data inicial',
    tel_lbl_date_to: 'Data final',
    tel_hint_dates:
      'O filtro por data usa a hora em que o servidor recebeu o lote. Na lista e no mapa, a hora mostrada é a da <strong>coleta no dispositivo</strong> (GPS), quando o app a enviou.',
    tel_lbl_limit: 'Limitar',
    tel_opt_lim_50: '50 eventos',
    tel_opt_lim_200: '200 eventos',
    tel_opt_lim_500: '500 eventos',
    tel_opt_lim_1000: '1000 eventos',
    tel_btn_search: 'Buscar',
    tel_btn_live: 'Ao vivo',
    tel_btn_export: 'Exportar',
    tel_list_placeholder: 'Preencha o e-mail e busque para carregar os eventos.',
    tel_alert_email_first: 'Indique o e-mail do técnico antes de iniciar o rastreamento em tempo real.',
    tel_legend_prec_high: 'Precisão < 20 m',
    tel_legend_prec_med: 'Precisão 20 m – 100 m',
    tel_legend_prec_low: 'Precisão > 100 m (mock / Wi‑Fi)',
    tel_det_device: 'Dispositivo',
    tel_det_battery: 'Bateria / carga',
    tel_det_net: 'Rede',
    tel_det_gps: 'Precisão GPS',
    tel_det_ts_dev: 'Hora da coleta (dispositivo)',
    tel_det_ts_srv: 'Hora de recebimento (servidor)',

    /* Data collection */
    dc_pageTitle: 'BrSpark Admin — Coleta de Dados',
    dc_bc_here: 'Coleta de Dados',
    dc_hero_title: 'Coleta de dados e privacidade',
    dc_hero_sub:
      'Política global de localização, overrides por tenant, retenção e integridade. Alterações sensíveis exigem alinhamento com privacidade e operações.',
    dc_policy_global: 'Política global',
    dc_tab_global: 'Política global',
    dc_tab_tenants: 'Overrides por tenant',
    dc_tab_retention: 'Retenção de dados',
    dc_btn_save: 'Salvar',

    /* Tracking chat moderation */
    tcm_pageTitle: 'BrSpark Admin — Segurança do chat (visita)',
    tcm_bc_here: 'Chat de acompanhamento',
    tcm_hero_title: 'Segurança do chat de acompanhamento',
    tcm_hero_sub_html:
      'Defina o quanto o sistema <strong>analisa e pode intervir</strong> nas mensagens entre <strong>cliente</strong> e <strong>técnico</strong> no link da visita — reduzindo ofensas e abusos <strong>sem travar a operação</strong>.',
    tcm_btn_refresh: 'Atualizar resumo',
  },
  'en-US': {},
};

/* en-US: copiar pt e sobrescrever blocos principais */
M['en-US'] = {
  ...M['pt-BR'],
  common_bc_panel: 'Home',
  common_loading: 'Loading…',
  common_cancel: 'Cancel',
  common_save: 'Save',
  common_delete: 'Delete',
  common_yes: 'Yes',
  common_no: 'No',
  common_unlimited: 'Unlimited',
  common_breadcrumb_trail: 'Breadcrumb',

  ten_pageTitle: 'BrSpark Admin — Tenants',
  ten_bc_here: 'Tenants',
  ten_hero_title: 'Tenant management',
  ten_hero_sub:
    'Platform accounts, plans and status. Filter by name, plan or state; cards reflect the current list (up to 200 records).',
  ten_search_ph: 'Search by name or slug…',
  ten_lbl_plan: 'Plan',
  ten_lbl_status: 'Status',
  ten_opt_all_plans: 'All plans',
  ten_opt_all_status: 'All statuses',
  ten_st_TRIAL: 'Trial',
  ten_st_ACTIVE: 'Active',
  ten_st_SUSPENDED: 'Suspended',
  ten_st_CANCELLED: 'Cancelled',
  ten_btn_new: 'New tenant',
  ten_table_title: 'Tenant list',
  ten_th_slug: 'Slug',
  ten_th_region: 'Region',
  ten_th_name: 'Name',
  ten_th_plan: 'Plan',
  ten_th_users: 'Users',
  ten_th_assets: 'Assets',
  ten_th_status: 'Status',
  ten_th_created: 'Created',
  ten_th_actions: 'Actions',
  ten_stat_total: 'Total (list)',
  ten_stat_active: 'Active (list)',
  ten_stat_trial: 'Trial (list)',
  ten_stat_susp: 'Suspended (list)',
  ten_count_one: '1 tenant',
  ten_count_many: '{n} tenants',
  ten_empty_title: 'No tenants found',
  ten_empty_sub: 'Adjust search or filters, or create a new tenant.',
  ten_undefined_region: 'Not set',
  ten_row_suspend: 'Suspend',
  ten_row_activate: 'Activate',
  ten_modal_title: 'New tenant',
  ten_lbl_company: 'Company name *',
  ten_ph_company: 'e.g. ACME Properties',
  ten_lbl_admin_email: 'Admin e-mail *',
  ten_ph_admin_email: 'admin@company.com',
  ten_lbl_region: 'Region / country *',
  ten_opt_region_pick: 'Select location…',
  ten_lbl_plan_modal: 'Plan',
  ten_opt_no_plan: 'No plan',
  ten_lbl_default_lang: 'Default language',
  ten_btn_create: 'Create tenant',
  ten_alert_required: 'Required fields: Name, E-mail and Region.',
  ten_plan_per_mo: '/mo',

  sub_pageTitle: 'BrSpark Admin — Subscriptions',
  sub_bc_here: 'Subscriptions',
  sub_hero_title: 'Plans and subscriptions',
  sub_hero_sub:
    'Active packages, quotas and tenant links. Assign plans, tune biometrics per package and track subscription status.',
  sub_section_plans: 'Active plans',
  sub_link_configure: 'Configure plans',
  sub_link_billing: 'Billing & MRR',
  sub_lbl_status: 'Status',
  sub_opt_all_status: 'All statuses',
  sub_st_ACTIVE: 'Active',
  sub_st_TRIALING: 'Trialing',
  sub_st_PAST_DUE: 'Past due',
  sub_st_CANCELLED: 'Cancelled',
  sub_btn_assign: 'Assign plan',
  sub_table_title: 'Subscriptions',
  sub_th_tenant: 'Tenant',
  sub_th_plan: 'Plan',
  sub_th_cycle: 'Cycle',
  sub_th_status: 'Status',
  sub_th_start: 'Start',
  sub_th_end: 'Renewal',
  sub_th_actions: 'Actions',
  sub_cycle_MONTHLY: 'Monthly',
  sub_cycle_YEARLY: 'Yearly (10% off)',
  sub_cycle_YEARLY_short: 'Yearly',
  sub_facial_modal_title: 'Facial biometrics — API per plan',
    sub_facial_intro: 'Plan:',
  sub_facial_body_html:
    'Defines which vision integration (under <strong>Integrations</strong>) this plan may use for in-app facial recognition. The form no longer picks the provider — only the tenant plan.',
  sub_facial_lbl: 'Facial recognition engine',
  sub_facial_opt_fm: 'FaceMatch (local) — default',
  sub_facial_opt_auto: 'Automatic (prefer FaceMatch, else AWS if configured)',
  sub_facial_opt_aws: 'AWS Rekognition (API cost; still limited on server)',
  sub_facial_hint: 'Stored in plan.features.facialVisionProvider. Tenants without a subscription use FaceMatch.',
  sub_facial_save: 'Save',
  sub_modal_assign_title: 'Assign plan',
  sub_lbl_tenant: 'Tenant',
  sub_lbl_plan: 'Plan',
  sub_lbl_cycle: 'Billing cycle',
  sub_btn_assign_go: 'Assign',
  sub_facial_auto: 'Automatic',
  sub_facial_aws: 'AWS',
  sub_facial_fm: 'FaceMatch',
  sub_plan_card_assets: 'assets',
  sub_plan_card_users: 'panel users',
  sub_plan_card_tech: 'Technicians:',
  sub_plan_card_ia: 'AI/mo facial',
  sub_plan_card_vis_det: 'vision det.',
  sub_plan_card_vis_an: 'vision AI analysis (Gemini)',
  sub_plan_card_maps_routes: 'Google Maps (routes)',
  sub_plan_card_ft: 'FT',
  sub_plan_card_rt: 'RT',
  sub_plan_card_forms: 'Forms',
  sub_plan_card_facial: 'Facial:',
  sub_plan_card_tenants: 'tenants',
  sub_plan_btn_facial: 'Biometrics / API',
  sub_plan_btn_facial_title: 'Configure facial recognition API',
  sub_empty_plans: 'No plans configured.',
  sub_empty_subs_title: 'No subscriptions',
  sub_empty_subs_sub: 'Change the status filter or assign a plan to a tenant.',
  sub_count_one: '1 subscription',
  sub_count_many: '{n} subscriptions',
  sub_btn_cancel_sub: 'Cancel',
  sub_confirm_cancel: 'Cancel this subscription?',
  sub_alert_pick: 'Select tenant and plan.',
  sub_tmpl_count_one: '1 template',
  sub_tmpl_count_many: '{n} templates',

  pln_pageTitle: 'BrSpark Admin — Plans (packages)',
  pln_bc_here: 'Plans (packages)',
  pln_hero_title: 'Plan catalog',
  pln_hero_sub_html:
    'Set prices, limits and monthly quotas (AI, <strong>Google APIs</strong> — Maps routes and Gemini vision analysis, field OS, routine, forms). Tenants inherit these via <a href="subscriptions.html" style="color:var(--accent);font-weight:700">subscription</a>. <span style="color:var(--text3)">−1 = unlimited</span> where applicable.',
  pln_link_subs: 'Subscriptions',
  pln_link_billing: 'Billing & MRR',
  pln_btn_new: 'New plan',
  pln_table_title: 'All packages',
  pln_th_name: 'Name',
  pln_th_pm: 'BRL/mo',
  pln_th_py: 'BRL/yr',
  pln_th_subs: 'Subs',
  pln_th_assets: 'Assets',
  pln_th_users: 'Users',
  pln_th_tech: 'Tech.',
  pln_th_gb: 'GB',
  pln_th_ft: 'FT/mo',
  pln_th_active: 'Active',
  pln_th_actions: 'Actions',
  pln_modal_new: 'New plan',
  pln_modal_edit: 'Edit: ',
  pln_chk_active: 'Plan active (visible for new subscriptions)',
  pln_lbl_name: 'Plan name *',
  pln_ph_name: 'e.g. Pro',
  pln_lbl_price_m: 'Monthly price (BRL) *',
  pln_lbl_price_y: 'Yearly price (BRL) *',
  pln_lbl_max_assets: 'Asset limit (−1 = unlimited)',
  pln_lbl_max_users: 'Panel users (−1 = unlimited)',
  pln_lbl_storage: 'Storage (GB)',
  pln_quotas_title: 'Per-tenant quotas in this plan',
    pln_quotas_hint:
      'Technicians = field team using the app on the ground. <strong>−1</strong> = unlimited. <strong>0</strong> on Google quotas (Maps or vision analysis) blocks use on this plan.',
  pln_lbl_max_tech: 'Max technicians',
  pln_lbl_ai_face: 'AI — facial / month',
  pln_lbl_ai_vis_det: 'AI — vision detection / month',
  pln_lbl_ai_vis_an: 'Vision AI — analysis (Google Gemini, checklists) / month',
  pln_api_section_title: 'Google APIs (per tenant / month)',
  pln_lbl_google_maps: 'Google Maps — routes (ETA, computeRoutes) / month',
  pln_lbl_ft: 'Field tasks (FT) / month',
  pln_lbl_rt: 'Routine (RT) / month',
    pln_lbl_max_tpl: 'Max forms (tenantId on model)',
    pln_features_title: 'Package features',
    pln_features_intro:
      'Turn product modules on or off for subscribers on this plan. Numeric limits (AI, Maps, field tasks) stay in the «Quotas» section above — they are not changed here.',
    pln_feat_stock: 'Stock / inventory',
    pln_feat_stock_hint: 'Inventory and asset control.',
    pln_feat_vault: 'Vault',
    pln_feat_vault_hint: 'Stronger security for sensitive files.',
    pln_feat_ai: 'AI assistant',
    pln_feat_ai_hint: 'AI product features (separate from monthly quotas above).',
    pln_feat_documents: 'Documents',
    pln_feat_documents_hint: 'Standard document and attachment management.',
    pln_feat_insurance: 'Insurance',
    pln_feat_insurance_hint: 'Insurance and claims-related features.',
    pln_feat_reports: 'Advanced reports',
    pln_feat_reports_hint: 'Reporting and exports for management.',
    pln_feat_realtime: 'Realtime',
    pln_feat_realtime_hint: 'Near real-time updates and sync.',
    pln_feat_facial_lbl: 'Facial recognition engine',
    pln_feat_facial_hint: 'Which biometric integration to use on this plan.',
    pln_facial_compreface: 'Compreface (recommended)',
    pln_facial_aws: 'Amazon Rekognition',
    pln_facial_auto: 'Automatic (uses whichever active integration is available)',
    pln_features_adv_summary: 'Advanced — extra JSON (technical support only)',
    pln_lbl_features_adv: 'Extra keys (JSON)',
    pln_features_adv_hint: 'Leave empty in most cases. Only fill in if engineering asks for extra «features» keys.',
    pln_lbl_features: 'Features (legacy)',
  pln_btn_save_plan: 'Save plan',
  pln_empty_title: 'No plans yet',
  pln_empty_sub: 'Create the first package with «New plan».',
  pln_badge_yes: 'Yes',
  pln_badge_no: 'No',
  pln_btn_edit: 'Edit',
  pln_btn_dup: 'Duplicate',
  pln_confirm_dup: 'Create a new plan copying limits from «{name}»?',
  pln_dup_suffix: ' (copy)',
  pln_dup_suffix_n: ' (copy {n})',
  pln_dup_base: 'Plan',
  pln_alert_dup_ok: 'Plan duplicated. It stays inactive by default — edit and enable when ready.',
  pln_alert_dup_err: 'Could not duplicate.',
  pln_save_fail: 'Could not save.',
    pln_alert_json: 'Invalid features JSON.',
    pln_alert_json_adv: 'The extra JSON under «Advanced» is invalid. Fix or clear that field.',
  pln_alert_name: 'Name is required.',
  pln_alert_save_err: 'Error: {detail}',

  sys_pageTitle: 'BrSpark Admin — System',
  sys_bc_here: 'System',
  sys_hero_title: 'System settings',
  sys_hero_sub:
    'Global feature flags, API health and general platform parameters. Coordinate critical changes with the technical team.',
  sys_flags_title: 'Global feature flags',
  sys_info_title: 'System information',
  sys_app_ver: 'App version',
  sys_db: 'Database',
  sys_api: 'API backend',
  sys_server: 'Server',
  sys_global_title: 'Global settings',
  sys_lbl_lang: 'Default language',
  sys_lbl_retention: 'Log retention (days)',
  sys_lbl_trial: 'Trial period (days)',
  sys_db_checking: 'PostgreSQL (checking…)',
  sys_db_ok: 'PostgreSQL — connected',
  sys_api_checking: 'Checking',
  sys_api_online: 'Online',
  sys_api_offline: 'Offline',
  sys_flags_count: '{n} flags',
  sys_alert_saved: 'Settings saved (persistence in development).',

  apidoc_pageTitle: 'BrSpark Admin — API Docs',
  apidoc_bc_here: 'API documentation',
  apidoc_hero_title: 'API documentation',
  apidoc_hero_sub:
    'Interactive OpenAPI (Swagger). Authenticate with admin or app JWT according to each route.',
  apidoc_btn_dl: 'Download OpenAPI (JSON)',
  apidoc_btn_open: 'Open JSON',
  apidoc_intro_1_html:
    'This page reflects routes exposed by the backend in <code>admin-panel/backend/src/index.js</code> and <code>routes/</code>. OpenAPI is built with <code>admin-panel/scripts/build-openapi.js</code> — after route changes, run <code>npm run openapi</code> in <code>admin-panel/backend</code>.',
  apidoc_intro_2_html:
    '<strong>Admin:</strong> obtain JWT with <code>POST /api/auth/login</code> and use <em>Authorize → bearerAdmin</em>.<br /><strong>App:</strong> <code>POST /api/login</code> or <code>POST /api/register</code> → <em>bearerApp</em>. Public routes do not require <code>Authorization</code>.',
  apidoc_err_load: 'Failed to load: {src}',
  apidoc_err_swagger: 'Could not load Swagger UI (network or CDN).',

  notif_pageTitle: 'BrSpark Admin — Notifications',
  notif_bc_here: 'Notifications',
  notif_hero_title: 'Notifications',
  notif_hero_sub:
    'Templates per channel (e-mail, push, WhatsApp, SMS) and send history. Toggle templates without changing content.',
  notif_btn_new: 'New template',
  notif_panel_tmpl: 'Notification templates',
  notif_panel_log: 'Send history',
  notif_modal_new: 'New template',
  notif_modal_edit: 'Edit template',
  notif_lbl_key: 'Key',
  notif_ph_key: 'e.g. password_reset',
  notif_lbl_label: 'Label',
  notif_ph_label: 'Password reset',
  notif_lbl_channel: 'Channel',
  notif_ch_EMAIL: 'E-mail',
  notif_ch_PUSH: 'Push',
  notif_ch_WHATSAPP: 'WhatsApp',
  notif_ch_SMS: 'SMS',
  notif_lbl_subject: 'Subject (e-mail)',
  notif_ph_subject: '{{name}}, your password was reset',
  notif_lbl_body: 'Body (use {{var}} for variables)',
  notif_ph_body: 'Hello {{name}},\n\nYour password was reset...',
  notif_btn_save: 'Save template',
  notif_key_prefix: 'Key:',
  notif_subject_prefix: 'Subject:',
  notif_btn_edit: 'Edit',
  notif_empty_tmpl_title: 'No templates',
  notif_empty_tmpl_sub: 'Create one with «New template».',
  notif_empty_log_title: 'No sends recorded',
  notif_empty_log_sub: 'Sends appear here after the queues process.',
  notif_alert_required: 'Fill in the required fields.',
  notif_tmpl_count_one: '1 template',
  notif_tmpl_count_many: '{n} templates',

  loc_pageTitle: 'BrSpark Admin — Multi-location',
  loc_bc_here: 'Multi-location',
  loc_hero_title: 'Countries, regions and languages',
  loc_hero_sub:
    'Active locales, supported languages and tenant-aggregated stats. Search filters cards; the table summarizes language coverage.',
  loc_stat_countries: 'Active countries',
  loc_stat_langs: 'Supported languages',
  loc_stat_users: 'Users in these countries',
  loc_stat_assets: 'Registered assets',
  loc_search_ph: 'Search country or code…',
  loc_table_regions: 'Enabled regions',
  loc_btn_add_country: 'Add country',
  loc_table_coverage: 'Language coverage on the platform',
  loc_th_lang: 'Language',
  loc_th_code: 'Code',
  loc_th_status: 'Status',
  loc_th_users: 'Users',
  loc_th_cov_app: 'App coverage',
  loc_th_cov_panel: 'Panel coverage',
  loc_th_quality: 'Quality',
  loc_badge_enabled: 'Enabled',
  loc_badge_inactive: '— Inactive',
  loc_badge_complete: 'Complete',
  loc_empty_regions_title: 'No regions found',
  loc_empty_regions_sub: 'Adjust the search term or clear the filter to see all countries.',
  loc_stat_users_lbl: 'Users',
  loc_stat_assets_lbl: 'Assets',
  loc_stat_status_lbl: 'Status',
  loc_toggle_on: 'Enabled',
  loc_toggle_off: 'Disabled',
  loc_count_regions: '{n} regions',
  loc_alert_country_required: 'Country name and code are required.',
  loc_alert_country_stub: 'Country «{name}» ({code}) will be added. Implement /api/regions for persistence.',

  cmp_pageTitle: 'BrSpark Admin — LGPD & Compliance',
  cmp_bc_here: 'Compliance',
  cmp_hero_title: 'Compliance & LGPD',
  cmp_hero_sub:
    'Versions of terms, policies and DPA; history per type and recorded acceptances. Publish only after legal review.',
  cmp_btn_new: 'New version',
  cmp_stat_versions: 'Total versions',
  cmp_stat_active: 'Active docs',
  cmp_stat_accept: 'Recorded acceptances',
  cmp_stat_last: 'Last publication',
  cmp_table_title: 'Legal documents',
  cmp_editor_back: '← Back',
  cmp_editor_new_title: 'New version',
  cmp_btn_draft: 'Save draft',
  cmp_btn_publish: 'Publish',
  cmp_lbl_type: 'Type',
  cmp_lbl_version: 'Version',
  cmp_ph_version: 'e.g. 2.0',
  cmp_lbl_doc_title: 'Title',
  cmp_ph_doc_title: 'Full document title',
  cmp_lbl_content: 'Content (Markdown)',
  cmp_ph_content: '# Title\n\nWrite content in Markdown...',
  cmp_type_TERMS: 'Terms of use',
  cmp_type_PRIVACY: 'Privacy policy',
  cmp_type_DPA: 'DPA — LGPD',
  cmp_type_COOKIE: 'Cookie policy',
  cmp_alert_err: 'Error: {detail}',
  cmp_editor_editing: 'Editing: {title}',

  mt_pageTitle: 'BrSpark Admin — Metatags & categories',
  mt_bc_here: 'Metatags',
  mt_hero_title: 'Metatags and categories',
  mt_hero_sub:
    'Asset types, stock, service, expenses, revenue, media and global tags used in the app and panel. Filter by type and keep keys stable.',
  mt_stat_total: 'Total',
  mt_stat_asset: 'Asset types',
  mt_stat_stock: 'Stock cat.',
  mt_stat_service: 'Service cat.',
  mt_stat_expense: 'Expense (assets)',
  mt_stat_tech_exp: 'Technician exp.',
  mt_stat_revenue: 'Revenue cat.',
  mt_stat_media: 'Media cat.',
  mt_stat_global: 'Global tags',
  mt_lbl_type: 'Type',
  mt_opt_all_types: 'All types',
  mt_opt_ASSET_TYPE: 'Asset types',
  mt_opt_STOCK_CATEGORY: 'Stock categories',
  mt_opt_SERVICE_CATEGORY: 'Service categories',
  mt_opt_EXPENSE_CATEGORY: 'Expense categories (assets)',
  mt_opt_TECHNICIAN_EXPENSE_CATEGORY: 'Technician expenses',
  mt_opt_REVENUE_CATEGORY: 'Revenue categories',
  mt_opt_ASSET_STATUS: 'Asset status',
  mt_opt_MEDIA_CATEGORY: 'Media categories',
  mt_opt_GLOBAL_TAG: 'Global tags',
  mt_btn_new: 'New metatag',
  mt_table_title: 'Registered metatags',
  mt_th_icon: 'Icon',
  mt_th_type: 'Type',
  mt_th_key: 'Key',
  mt_th_pt: 'pt-BR',
  mt_th_color: 'Colour',
  mt_th_status: 'Status',
  mt_th_actions: 'Actions',
  mt_confirm_delete: 'Delete this metatag?',
  mt_alert_key_pt: 'Key and pt-BR name are required.',
  mt_alert_save_err: 'Error: {detail}',

  trl_pageTitle: 'BrSpark Admin — Translations & locale',
  trl_bc_here: 'Translations & locale',
  trl_hero_title: 'Translations and regional settings',
  trl_hero_sub:
    'App dictionary, metatags, flags, locale profiles and tenant overrides. Save after editing; AI translation only fills empty fields.',
  trl_search_ph: 'Search by key or content…',
  trl_lbl_source: 'Source',
  trl_src_app: 'App dictionary',
  trl_src_metatags: 'Metatags (categories)',
  trl_src_flags: 'Feature flags',
  trl_src_locales: 'Regional settings',
  trl_src_overrides: 'Tenant customization',
  trl_lbl_tenant: 'Tenant',
  trl_opt_tenant_pick: 'Select tenant…',
  trl_counter: '{n} entries',
  trl_locales_count: '{n} profiles',
  trl_btn_ai: 'Translate with AI',
  trl_btn_ai_title: 'Fill empty fields with AI',
  trl_btn_save: 'Save changes',
  trl_table_title: 'Entries',
  trl_th_key: 'Key / ID',
  trl_th_pt: 'Portuguese (pt-BR)',
  trl_th_en: 'English (en-US)',
  trl_th_es: 'Spanish (es-ES)',
  trl_loading: 'Loading translations…',
  trl_ai_title: 'AI translation',
  trl_ai_sub: 'Filling empty fields via MyMemory API...',
  trl_ai_modal_title: 'AI translation',
  trl_alert_profile_ok: 'Profile updated!',
  trl_alert_no_changes: 'No changes.',
  trl_alert_saved: 'Changes saved!',
  trl_alert_err: 'Error: {msg}',
  trl_alert_no_val: 'Nothing to translate on this row.',
  trl_alert_no_empty: 'No empty fields in the visible results.',

  wt_pageTitle: 'BrSpark Admin — Work time',
  wt_bc_here: 'Work time',
  wt_hero_title: 'Work time tracking',
  wt_hero_sub:
    'Per-organization time policy: module, face/GPS/address requirements and integrity. The app also respects the global flag and per-user enablement.',
  wt_btn_save: 'Save',
  wt_alert_pick_tenant: 'Select the organization.',
  wt_alert_saved: 'Settings saved.',

  tel_pageTitle: 'BrSpark Admin — Telemetry',
  tel_bc_here: 'Telemetry',
  tel_hero_title: 'Telemetry tracking',
  tel_hero_sub:
    'Field events, map and batch details. Filter by technician e-mail and date range; use «Live» carefully on slow networks.',
  tel_lbl_email: 'Technician e-mail',
  tel_ph_email: 'e.g. tech@company.com',
  tel_lbl_date_from: 'Start date',
  tel_lbl_date_to: 'End date',
  tel_hint_dates:
    'Date filter uses when the server received the batch. In the list and map, times shown are from <strong>device collection</strong> (GPS) when the app sent them.',
  tel_lbl_limit: 'Limit',
  tel_opt_lim_50: '50 events',
  tel_opt_lim_200: '200 events',
  tel_opt_lim_500: '500 events',
  tel_opt_lim_1000: '1000 events',
  tel_btn_search: 'Search',
  tel_btn_live: 'Live',
  tel_btn_export: 'Export',
  tel_list_placeholder: 'Enter e-mail and search to load events.',
  tel_alert_email_first: 'Enter the technician e-mail before starting live tracking.',
  tel_legend_prec_high: 'Accuracy < 20 m',
  tel_legend_prec_med: 'Accuracy 20 m – 100 m',
  tel_legend_prec_low: 'Accuracy > 100 m (mock / Wi‑Fi)',
  tel_det_device: 'Device',
  tel_det_battery: 'Battery / charge',
  tel_det_net: 'Network',
  tel_det_gps: 'GPS accuracy',
  tel_det_ts_dev: 'Collection time (device)',
  tel_det_ts_srv: 'Received time (server)',

  dc_pageTitle: 'BrSpark Admin — Data collection',
  dc_bc_here: 'Data collection',
  dc_hero_title: 'Data collection and privacy',
  dc_hero_sub:
    'Global location policy, tenant overrides, retention and integrity. Sensitive changes need privacy and operations alignment.',
  dc_policy_global: 'Global policy',
  dc_tab_global: 'Global policy',
  dc_tab_tenants: 'Tenant overrides',
  dc_tab_retention: 'Data retention',
  dc_btn_save: 'Save',

  tcm_pageTitle: 'BrSpark Admin — Visit chat safety',
  tcm_bc_here: 'Visit chat',
  tcm_hero_title: 'Visit tracking chat safety',
  tcm_hero_sub_html:
    'Define how much the system <strong>analyses and may intervene</strong> in messages between <strong>client</strong> and <strong>technician</strong> on the visit link — reducing abuse <strong>without blocking operations</strong>.',
  tcm_btn_refresh: 'Refresh summary',
};

function interp(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

export function mpT(key, vars) {
  const loc = getAdminUiLocale();
  const raw = adminResolve(M, loc, key);
  return vars ? interp(raw, vars) : raw;
}

export function mpIntlLocale() {
  return adminIntlLocale(getAdminUiLocale());
}

function setText(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = vars ? mpT(key, vars) : mpT(key);
}

function setHtml(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = vars ? interp(mpT(key), vars) : mpT(key);
}

/** Breadcrumb + hero padrão (`mpc-*`). */
export function applyMenuPageChrome(opts) {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  if (opts.pageTitle) document.title = mpT(opts.pageTitle);
  setText('mpc-bc-panel', opts.bcPanelKey || 'common_bc_panel');
  if (opts.bcHere) setText('mpc-bc-here', opts.bcHere);
  if (opts.heroTitle) setText('mpc-hero-title', opts.heroTitle);
  if (opts.heroSub) {
    const el = document.getElementById('mpc-hero-sub');
    if (el) {
      if (opts.heroSubHtml) el.innerHTML = mpT(opts.heroSub);
      else el.textContent = mpT(opts.heroSub);
    }
  }
}

export function applyTenantsPageI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  document.title = mpT('ten_pageTitle');
  setText('ten-bc-panel', 'common_bc_panel');
  setText('ten-bc-here', 'ten_bc_here');
  setText('ten-hero-title', 'ten_hero_title');
  setText('ten-hero-sub', 'ten_hero_sub');
  const si = document.getElementById('search-input');
  if (si) si.placeholder = mpT('ten_search_ph');
  setText('ten-lbl-plan', 'ten_lbl_plan');
  setText('ten-lbl-status', 'ten_lbl_status');
  const fp = document.getElementById('filter-plan');
  if (fp && fp.options[0]) fp.options[0].textContent = mpT('ten_opt_all_plans');
  const fs = document.getElementById('filter-status');
  if (fs && fs.options[0]) fs.options[0].textContent = mpT('ten_opt_all_status');
  if (fs) {
    const map = { ACTIVE: 'ten_st_ACTIVE', TRIAL: 'ten_st_TRIAL', SUSPENDED: 'ten_st_SUSPENDED', CANCELLED: 'ten_st_CANCELLED' };
    for (let i = 1; i < fs.options.length; i++) {
      const o = fs.options[i];
      const k = map[o.value];
      if (k) o.textContent = mpT(k);
    }
  }
  const btnNew = document.querySelector('[onclick="openModal(\'new-tenant-modal\')"]');
  if (btnNew) {
    const ic = btnNew.querySelector('ion-icon');
    btnNew.textContent = '';
    if (ic) btnNew.appendChild(ic);
    btnNew.appendChild(document.createTextNode(mpT('ten_btn_new')));
  }
  setText('ten-table-title', 'ten_table_title');
  const thMap = [
    ['ten-th-slug', 'ten_th_slug'],
    ['ten-th-region', 'ten_th_region'],
    ['ten-th-name', 'ten_th_name'],
    ['ten-th-plan', 'ten_th_plan'],
    ['ten-th-users', 'ten_th_users'],
    ['ten-th-assets', 'ten_th_assets'],
    ['ten-th-status', 'ten_th_status'],
    ['ten-th-created', 'ten_th_created'],
    ['ten-th-actions', 'ten_th_actions'],
  ];
  for (const [id, k] of thMap) setText(id, k);
  const loadRow = document.querySelector('#tenants-tbody tr td[colspan]');
  if (loadRow) loadRow.textContent = mpT('common_loading');
  setText('ten-modal-title', 'ten_modal_title');
  const labels = [
    ['ten-lbl-company', 'ten_lbl_company'],
    ['ten-lbl-admin-email', 'ten_lbl_admin_email'],
    ['ten-lbl-region', 'ten_lbl_region'],
    ['ten-lbl-plan-modal', 'ten_lbl_plan_modal'],
    ['ten-lbl-lang', 'ten_lbl_default_lang'],
  ];
  for (const [id, k] of labels) setText(id, k);
  const nn = document.getElementById('new-name');
  if (nn) nn.placeholder = mpT('ten_ph_company');
  const ne = document.getElementById('new-email');
  if (ne) ne.placeholder = mpT('ten_ph_admin_email');
  const lr = document.getElementById('new-locale-id');
  if (lr && lr.options[0]) lr.options[0].textContent = mpT('ten_opt_region_pick');
  const np = document.getElementById('new-plan-id');
  if (np && np.options[0]) np.options[0].textContent = mpT('ten_opt_no_plan');
  setText('ten-modal-cancel', 'common_cancel');
  const sv = document.getElementById('ten-modal-save');
  if (sv) sv.textContent = mpT('ten_btn_create');
}

export function tenantsStatusLabel(code) {
  const k = `ten_st_${String(code || '').trim()}`;
  const v = mpT(k);
  return v === k ? String(code || '') : v;
}

export function applySubscriptionsPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'sub_pageTitle',
    bcHere: 'sub_bc_here',
    heroTitle: 'sub_hero_title',
    heroSub: 'sub_hero_sub',
  });
  setText('sub-sec-plans-title', 'sub_section_plans');
  setText('sub-link-plans', 'sub_link_configure');
  setText('sub-link-billing', 'sub_link_billing');
  setText('sub-lbl-status', 'sub_lbl_status');
  const fs = document.getElementById('filter-status');
  if (fs && fs.options[0]) fs.options[0].textContent = mpT('sub_opt_all_status');
  const sm = { ACTIVE: 'sub_st_ACTIVE', TRIALING: 'sub_st_TRIALING', PAST_DUE: 'sub_st_PAST_DUE', CANCELLED: 'sub_st_CANCELLED' };
  if (fs) {
    for (let i = 1; i < fs.options.length; i++) {
      const o = fs.options[i];
      const k = sm[o.value];
      if (k) o.textContent = mpT(k);
    }
  }
  const subBtn = document.getElementById('sub-btn-assign');
  if (subBtn) {
    const ic = subBtn.querySelector('ion-icon');
    subBtn.textContent = '';
    if (ic) subBtn.appendChild(ic);
    subBtn.appendChild(document.createTextNode(mpT('sub_btn_assign')));
  }
  setText('sub-table-title', 'sub_table_title');
  [['sub-th-tenant', 'sub_th_tenant'], ['sub-th-plan', 'sub_th_plan'], ['sub-th-cycle', 'sub_th_cycle'], ['sub-th-status', 'sub_th_status'], ['sub-th-start', 'sub_th_start'], ['sub-th-end', 'sub_th_end'], ['sub-th-actions', 'sub_th_actions']].forEach(([id, k]) => setText(id, k));
  const pg = document.getElementById('plans-grid');
  if (pg && pg.textContent.includes('…')) pg.textContent = mpT('common_loading');
  const tb = document.querySelector('#subs-tbody tr td[colspan]');
  if (tb) tb.textContent = mpT('common_loading');
  setText('sub-facial-modal-title', 'sub_facial_modal_title');
  setText('sub-facial-plan-label', 'sub_facial_intro');
  setHtml('sub-facial-body', 'sub_facial_body_html');
  setText('sub-facial-lbl', 'sub_facial_lbl');
  const psel = document.getElementById('facial-provider-sel');
  if (psel) {
    const opts = [
      ['COMPREFACE', 'sub_facial_opt_fm'],
      ['AUTO', 'sub_facial_opt_auto'],
      ['AWS', 'sub_facial_opt_aws'],
    ];
    opts.forEach(([val, key], i) => {
      const o = Array.from(psel.options).find((x) => x.value === val);
      if (o) o.textContent = mpT(key);
    });
  }
  setText('sub-facial-hint', 'sub_facial_hint');
  const fsv = document.getElementById('sub-facial-save');
  if (fsv) fsv.textContent = mpT('sub_facial_save');
  setText('sub-facial-cancel', 'common_cancel');
  setText('sub-modal-assign-title', 'sub_modal_assign_title');
  setText('sub-modal-lbl-tenant', 'sub_lbl_tenant');
  setText('sub-modal-lbl-plan', 'sub_lbl_plan');
  setText('sub-modal-lbl-cycle', 'sub_lbl_cycle');
  const cyc = document.getElementById('sub-cycle');
  if (cyc) {
    const o0 = cyc.querySelector('option[value="MONTHLY"]');
    const o1 = cyc.querySelector('option[value="YEARLY"]');
    if (o0) o0.textContent = mpT('sub_cycle_MONTHLY');
    if (o1) o1.textContent = mpT('sub_cycle_YEARLY');
  }
  setText('sub-modal-cancel', 'common_cancel');
  const asb = document.getElementById('sub-modal-assign-btn');
  if (asb) asb.textContent = mpT('sub_btn_assign_go');
}

export function subscriptionsCycleLabel(cycle) {
  if (cycle === 'MONTHLY') return mpT('sub_cycle_MONTHLY');
  if (cycle === 'YEARLY') return mpT('sub_cycle_YEARLY_short');
  return cycle || '—';
}

export function subscriptionsStatusHtml(status) {
  const map = { ACTIVE: 'sub_st_ACTIVE', TRIALING: 'sub_st_TRIALING', PAST_DUE: 'sub_st_PAST_DUE', CANCELLED: 'sub_st_CANCELLED' };
  const k = map[status];
  const label = k ? mpT(k) : String(status || '');
  const icon =
    status === 'ACTIVE'
      ? '<ion-icon name="ellipse-outline" style="font-size:16px;vertical-align:middle;margin-right:8px"></ion-icon> '
      : status === 'PAST_DUE'
        ? '<ion-icon name="warning-outline" style="color:var(--amber);vertical-align:-2px"></ion-icon> '
        : status === 'CANCELLED'
          ? '<ion-icon name="close-outline" style="vertical-align:-2px"></ion-icon> '
          : '◐ ';
  if (status === 'TRIALING') return `${icon}${label}`;
  return `${icon}${label}`;
}

export function subscriptionsFacialLabel(val) {
  if (val === 'AUTO') return mpT('sub_facial_auto');
  if (val === 'AWS') return mpT('sub_facial_aws');
  return mpT('sub_facial_fm');
}

export function applyPlansPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'pln_pageTitle',
    bcHere: 'pln_bc_here',
    heroTitle: 'pln_hero_title',
    heroSub: 'pln_hero_sub_html',
    heroSubHtml: true,
  });
  setText('pln-link-subs', 'pln_link_subs');
  setText('pln-link-billing', 'pln_link_billing');
  const nb = document.getElementById('pln-btn-new');
  if (nb) {
    const ic = nb.querySelector('ion-icon');
    nb.textContent = '';
    if (ic) nb.appendChild(ic);
    nb.appendChild(document.createTextNode(mpT('pln_btn_new')));
  }
  setText('pln-table-title', 'pln_table_title');
  [['pln-th-name', 'pln_th_name'], ['pln-th-pm', 'pln_th_pm'], ['pln-th-py', 'pln_th_py'], ['pln-th-subs', 'pln_th_subs'], ['pln-th-assets', 'pln_th_assets'], ['pln-th-users', 'pln_th_users'], ['pln-th-tech', 'pln_th_tech'], ['pln-th-gb', 'pln_th_gb'], ['pln-th-ft', 'pln_th_ft'], ['pln-th-active', 'pln_th_active'], ['pln-th-actions', 'pln_th_actions']].forEach(([id, k]) => setText(id, k));
  const tb = document.querySelector('#plans-tbody tr td[colspan]');
  if (tb) tb.textContent = mpT('common_loading');
  setText('pln-modal-title', 'pln_modal_new');
  setText('pln-chk-active-span', 'pln_chk_active');
  setText('pln-lbl-name', 'pln_lbl_name');
  const pn = document.getElementById('plan-name');
  if (pn) pn.placeholder = mpT('pln_ph_name');
  setText('pln-lbl-pm', 'pln_lbl_price_m');
  setText('pln-lbl-py', 'pln_lbl_price_y');
  setText('pln-lbl-max-assets', 'pln_lbl_max_assets');
  setText('pln-lbl-max-users', 'pln_lbl_max_users');
  setText('pln-lbl-storage', 'pln_lbl_storage');
  setText('pln-quotas-title', 'pln_quotas_title');
  setHtml('pln-quotas-hint', 'pln_quotas_hint');
  setText('pln-lbl-max-tech', 'pln_lbl_max_tech');
  setText('pln-lbl-ai-face', 'pln_lbl_ai_face');
  setText('pln-lbl-ai-det', 'pln_lbl_ai_vis_det');
  setText('pln-lbl-ai-anal', 'pln_lbl_ai_vis_an');
  setText('pln-api-quotas-title', 'pln_api_section_title');
  setText('pln-lbl-google-maps', 'pln_lbl_google_maps');
  setText('pln-lbl-ft', 'pln_lbl_ft');
  setText('pln-lbl-rt', 'pln_lbl_rt');
  setText('pln-lbl-max-tpl', 'pln_lbl_max_tpl');
  setText('pln-features-title', 'pln_features_title');
  setText('pln-features-intro', 'pln_features_intro');
  const featPairs = [
    ['stock', 'pln_feat_stock', 'pln_feat_stock_hint'],
    ['vault', 'pln_feat_vault', 'pln_feat_vault_hint'],
    ['ai', 'pln_feat_ai', 'pln_feat_ai_hint'],
    ['documents', 'pln_feat_documents', 'pln_feat_documents_hint'],
    ['insurance', 'pln_feat_insurance', 'pln_feat_insurance_hint'],
    ['reports', 'pln_feat_reports', 'pln_feat_reports_hint'],
    ['realtime', 'pln_feat_realtime', 'pln_feat_realtime_hint'],
  ];
  featPairs.forEach(([k, lk, hk]) => {
    setText(`pln-feat-lbl-${k}`, lk);
    setText(`pln-feat-hint-${k}`, hk);
  });
  setText('pln-feat-lbl-facial', 'pln_feat_facial_lbl');
  setText('pln-feat-hint-facial', 'pln_feat_facial_hint');
  const fsel = document.getElementById('plan-feat-facial-provider');
  if (fsel) {
    [...fsel.options].forEach((o) => {
      if (o.value === 'COMPREFACE') o.textContent = mpT('pln_facial_compreface');
      if (o.value === 'AWS') o.textContent = mpT('pln_facial_aws');
      if (o.value === 'AUTO') o.textContent = mpT('pln_facial_auto');
    });
  }
  setText('pln-features-adv-summary', 'pln_features_adv_summary');
  setText('pln-lbl-features-adv', 'pln_lbl_features_adv');
  setText('pln-features-adv-hint', 'pln_features_adv_hint');
  setText('pln-modal-cancel', 'common_cancel');
  const pms = document.getElementById('pln-modal-save');
  if (pms) pms.textContent = mpT('pln_btn_save_plan');
}

export function applySystemPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'sys_pageTitle',
    bcHere: 'sys_bc_here',
    heroTitle: 'sys_hero_title',
    heroSub: 'sys_hero_sub',
  });
  setText('sys-flags-title-text', 'sys_flags_title');
  setText('sys-info-title-text', 'sys_info_title');
  setText('sys-global-title-text', 'sys_global_title');
  setText('sys-lbl-app-ver', 'sys_app_ver');
  setText('sys-lbl-db', 'sys_db');
  setText('sys-lbl-api', 'sys_api');
  setText('sys-lbl-server', 'sys_server');
  setText('sys-lbl-lang', 'sys_lbl_lang');
  setText('sys-lbl-retention', 'sys_lbl_retention');
  setText('sys-lbl-trial', 'sys_lbl_trial');
  const fl = document.getElementById('flags-list');
  if (fl && /Carregando|Loading|…|\.\.\./i.test(fl.textContent)) fl.textContent = mpT('common_loading');
  const dbi = document.getElementById('db-info');
  if (dbi && /verificando|checking/i.test(dbi.textContent)) dbi.textContent = mpT('sys_db_checking');
  const api = document.getElementById('api-status');
  if (api && /Verificando|Checking/i.test(api.textContent)) {
    api.innerHTML = `<ion-icon name="ellipse-outline" style="font-size:16px;vertical-align:middle;margin-right:8px"></ion-icon> ${mpT('sys_api_checking')}`;
  }
  setText('sys-save-btn', 'common_save');
}

export function applyApiDocsPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'apidoc_pageTitle',
    bcHere: 'apidoc_bc_here',
    heroTitle: 'apidoc_hero_title',
    heroSub: 'apidoc_hero_sub',
  });
  setText('apidoc-btn-dl-text', 'apidoc_btn_dl');
  setText('apidoc-btn-open-text', 'apidoc_btn_open');
  setHtml('apidoc-intro-1', 'apidoc_intro_1_html');
  setHtml('apidoc-intro-2', 'apidoc_intro_2_html');
}

export function applyNotificationsPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'notif_pageTitle',
    bcHere: 'notif_bc_here',
    heroTitle: 'notif_hero_title',
    heroSub: 'notif_hero_sub',
  });
  const b = document.getElementById('notif-btn-new');
  if (b) {
    const ic = b.querySelector('ion-icon');
    b.textContent = '';
    if (ic) b.appendChild(ic);
    b.appendChild(document.createTextNode(mpT('notif_btn_new')));
  }
  setText('notif-panel-tmpl', 'notif_panel_tmpl');
  setText('notif-panel-log', 'notif_panel_log');
  const t1 = document.querySelector('#template-list > div');
  if (t1 && t1.textContent.includes('…')) t1.textContent = mpT('common_loading');
  const t2 = document.querySelector('#log-list > div');
  if (t2 && t2.textContent.includes('…')) t2.textContent = mpT('common_loading');
  setText('notif-modal-title', 'notif_modal_new');
  setText('notif-lbl-key', 'notif_lbl_key');
  setText('notif-lbl-label', 'notif_lbl_label');
  const k = document.getElementById('tmpl-key');
  if (k) k.placeholder = mpT('notif_ph_key');
  const l = document.getElementById('tmpl-label');
  if (l) l.placeholder = mpT('notif_ph_label');
  setText('notif-lbl-channel', 'notif_lbl_channel');
  const ch = document.getElementById('tmpl-channel');
  if (ch) {
    const m = { EMAIL: 'notif_ch_EMAIL', PUSH: 'notif_ch_PUSH', WHATSAPP: 'notif_ch_WHATSAPP', SMS: 'notif_ch_SMS' };
    Array.from(ch.options).forEach((o) => {
      const key = m[o.value];
      if (key) o.textContent = mpT(key);
    });
  }
  setText('notif-lbl-subject', 'notif_lbl_subject');
  const ts = document.getElementById('tmpl-subject');
  if (ts) ts.placeholder = mpT('notif_ph_subject');
  setText('notif-lbl-body', 'notif_lbl_body');
  const tb = document.getElementById('tmpl-body');
  if (tb) tb.placeholder = mpT('notif_ph_body');
  setText('notif-modal-cancel', 'common_cancel');
  setText('notif-modal-save', 'notif_btn_save');
}

export function applyLocationsPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'loc_pageTitle',
    bcHere: 'loc_bc_here',
    heroTitle: 'loc_hero_title',
    heroSub: 'loc_hero_sub',
  });
  setText('loc-stat-countries-lbl', 'loc_stat_countries');
  setText('loc-stat-langs-lbl', 'loc_stat_langs');
  setText('loc-stat-users-lbl', 'loc_stat_users');
  setText('loc-stat-assets-lbl', 'loc_stat_assets');
  const si = document.getElementById('search-input');
  if (si) si.placeholder = mpT('loc_search_ph');
  setText('loc-table-regions-title', 'loc_table_regions');
  setText('loc-btn-add-country-text', 'loc_btn_add_country');
  setText('loc-table-title', 'loc_table_coverage');
  [['loc-th-lang', 'loc_th_lang'], ['loc-th-code', 'loc_th_code'], ['loc-th-status', 'loc_th_status'], ['loc-th-users', 'loc_th_users'], ['loc-th-cov-app', 'loc_th_cov_app'], ['loc-th-cov-panel', 'loc_th_cov_panel'], ['loc-th-quality', 'loc_th_quality']].forEach(([id, k]) => setText(id, k));
}

export function applyCompliancePageI18n() {
  applyMenuPageChrome({
    pageTitle: 'cmp_pageTitle',
    bcHere: 'cmp_bc_here',
    heroTitle: 'cmp_hero_title',
    heroSub: 'cmp_hero_sub',
  });
  const b = document.getElementById('cmp-btn-new');
  if (b) {
    const ic = b.querySelector('ion-icon');
    b.textContent = '';
    if (ic) b.appendChild(ic);
    b.appendChild(document.createTextNode(mpT('cmp_btn_new')));
  }
  setText('cmp-stat-versions', 'cmp_stat_versions');
  setText('cmp-stat-active', 'cmp_stat_active');
  setText('cmp-stat-accept', 'cmp_stat_accept');
  setText('cmp-stat-last', 'cmp_stat_last');
  setText('cmp-table-title', 'cmp_table_title');
  const dl = document.getElementById('docs-list');
  if (dl && dl.textContent.includes('…')) dl.textContent = mpT('common_loading');
  setText('cmp-editor-back', 'cmp_editor_back');
  setText('cmp-editor-title', 'cmp_editor_new_title');
  setText('cmp-btn-draft', 'cmp_btn_draft');
  setText('cmp-btn-publish', 'cmp_btn_publish');
  setText('cmp-lbl-type', 'cmp_lbl_type');
  const ty = document.getElementById('editor-type');
  if (ty) {
    const m = {
      TERMS_OF_USE: 'cmp_type_TERMS',
      PRIVACY_POLICY: 'cmp_type_PRIVACY',
      LGPD_DPA: 'cmp_type_DPA',
      COOKIE_POLICY: 'cmp_type_COOKIE',
    };
    Array.from(ty.options).forEach((o) => {
      const key = m[o.value];
      if (key) o.textContent = mpT(key);
    });
  }
  setText('cmp-lbl-version', 'cmp_lbl_version');
  const vv = document.getElementById('editor-version');
  if (vv) vv.placeholder = mpT('cmp_ph_version');
  setText('cmp-lbl-doc-title', 'cmp_lbl_doc_title');
  const dt = document.getElementById('editor-doc-title');
  if (dt) dt.placeholder = mpT('cmp_ph_doc_title');
  setText('cmp-lbl-content', 'cmp_lbl_content');
  const ec = document.getElementById('editor-content');
  if (ec) ec.placeholder = mpT('cmp_ph_content');
}

export function complianceTypeLabel(type) {
  const m = {
    TERMS_OF_USE: 'cmp_type_TERMS',
    PRIVACY_POLICY: 'cmp_type_PRIVACY',
    LGPD_DPA: 'cmp_type_DPA',
    COOKIE_POLICY: 'cmp_type_COOKIE',
  };
  const k = m[type];
  return k ? mpT(k) : String(type || '');
}

export function applyMetatagsPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'mt_pageTitle',
    bcHere: 'mt_bc_here',
    heroTitle: 'mt_hero_title',
    heroSub: 'mt_hero_sub',
  });
  ['mt-stat-total', 'mt-stat-asset', 'mt-stat-stock', 'mt-stat-service', 'mt-stat-expense', 'mt-stat-tech-exp', 'mt-stat-revenue', 'mt-stat-media', 'mt-stat-global'].forEach((id, i) => {
    const keys = ['mt_stat_total', 'mt_stat_asset', 'mt_stat_stock', 'mt_stat_service', 'mt_stat_expense', 'mt_stat_tech_exp', 'mt_stat_revenue', 'mt_stat_media', 'mt_stat_global'];
    setText(id, keys[i]);
  });
  setText('mt-lbl-type', 'mt_lbl_type');
  const b = document.querySelector('[onclick="openNewTag()"]');
  if (b) {
    const ic = b.querySelector('ion-icon');
    b.textContent = '';
    if (ic) b.appendChild(ic);
    b.appendChild(document.createTextNode(mpT('mt_btn_new')));
  }
  setText('mt-table-title', 'mt_table_title');
  [
    ['mt-th-icon', 'mt_th_icon'],
    ['mt-th-type', 'mt_th_type'],
    ['mt-th-key', 'mt_th_key'],
    ['mt-th-pt', 'mt_th_pt'],
    ['mt-th-color', 'mt_th_color'],
    ['mt-th-status', 'mt_th_status'],
    ['mt-th-actions', 'mt_th_actions'],
  ].forEach(([id, k]) => setText(id, k));
  const ft = document.getElementById('filter-type');
  if (ft) {
    if (ft.options[0]) ft.options[0].textContent = mpT('mt_opt_all_types');
    const optKeys = {
      ASSET_TYPE: 'mt_opt_ASSET_TYPE',
      STOCK_CATEGORY: 'mt_opt_STOCK_CATEGORY',
      SERVICE_CATEGORY: 'mt_opt_SERVICE_CATEGORY',
      EXPENSE_CATEGORY: 'mt_opt_EXPENSE_CATEGORY',
      TECHNICIAN_EXPENSE_CATEGORY: 'mt_opt_TECHNICIAN_EXPENSE_CATEGORY',
      REVENUE_CATEGORY: 'mt_opt_REVENUE_CATEGORY',
      ASSET_STATUS: 'mt_opt_ASSET_STATUS',
      MEDIA_CATEGORY: 'mt_opt_MEDIA_CATEGORY',
      GLOBAL_TAG: 'mt_opt_GLOBAL_TAG',
    };
    Array.from(ft.options).forEach((o) => {
      const ok = optKeys[o.value];
      if (ok) o.textContent = mpT(ok);
    });
  }
  const tb = document.querySelector('#tags-tbody tr td[colspan]');
  if (tb) tb.textContent = mpT('common_loading');
}

export function applyTrlPageI18n() {
  applyMenuPageChrome({
    pageTitle: 'trl_pageTitle',
    bcHere: 'trl_bc_here',
    heroTitle: 'trl_hero_title',
    heroSub: 'trl_hero_sub',
  });
  const si = document.getElementById('search-input');
  if (si) si.placeholder = mpT('trl_search_ph');
  setText('trl-lbl-source', 'trl_lbl_source');
  const sf = document.getElementById('source-filter');
  if (sf) {
    const m = { app: 'trl_src_app', 'db-metatags': 'trl_src_metatags', 'db-flags': 'trl_src_flags', locales: 'trl_src_locales', overrides: 'trl_src_overrides' };
    Array.from(sf.options).forEach((o) => {
      const k = m[o.value];
      if (k) o.textContent = mpT(k);
    });
  }
  setText('trl-lbl-tenant', 'trl_lbl_tenant');
  const ts = document.getElementById('tenant-selector');
  if (ts && ts.options[0]) ts.options[0].textContent = mpT('trl_opt_tenant_pick');
  setText('trl-btn-ai', 'trl_btn_ai');
  const ai = document.getElementById('ai-translate-btn');
  if (ai) ai.title = mpT('trl_btn_ai_title');
  const sa = document.getElementById('save-all-btn');
  if (sa) {
    const ic = sa.querySelector('ion-icon');
    sa.textContent = '';
    if (ic) sa.appendChild(ic);
    sa.appendChild(document.createTextNode(mpT('trl_btn_save')));
  }
  setText('trl-table-title', 'trl_table_title');
  [['trl-th-key', 'trl_th_key'], ['trl-th-pt', 'trl_th_pt'], ['trl-th-en', 'trl_th_en'], ['trl-th-es', 'trl_th_es']].forEach(([id, k]) => setText(id, k));
  const tb = document.querySelector('#i18n-tbody tr td[colspan]');
  if (tb) tb.textContent = mpT('trl_loading');
  setText('trl-ai-modal-title', 'trl_ai_modal_title');
  setText('trl-ai-sub', 'trl_ai_sub');
  setText('trl-ai-cancel', 'common_cancel');
  const cb = document.getElementById('counter-badge');
  if (cb) {
    const m = String(cb.textContent).match(/^(\d+)/);
    if (m) cb.textContent = mpT('trl_counter', { n: parseInt(m[1], 10) });
  }
}

export function applyWorkTimePageChrome() {
  applyMenuPageChrome({
    pageTitle: 'wt_pageTitle',
    bcHere: 'wt_bc_here',
    heroTitle: 'wt_hero_title',
    heroSub: 'wt_hero_sub',
  });
  setText('wt-btn-save', 'wt_btn_save');
}

export function applyTelemetryPageChrome() {
  applyMenuPageChrome({
    pageTitle: 'tel_pageTitle',
    bcHere: 'tel_bc_here',
    heroTitle: 'tel_hero_title',
    heroSub: 'tel_hero_sub',
  });
  setText('tel-lbl-email', 'tel_lbl_email');
  const fe = document.getElementById('filter-email');
  if (fe) fe.placeholder = mpT('tel_ph_email');
  setText('tel-lbl-date-from', 'tel_lbl_date_from');
  setText('tel-lbl-date-to', 'tel_lbl_date_to');
  setHtml('tel-hint-dates', 'tel_hint_dates');
  setText('tel-lbl-limit', 'tel_lbl_limit');
  const lim = document.getElementById('filter-limit');
  if (lim) {
    const map = { 50: 'tel_opt_lim_50', 200: 'tel_opt_lim_200', 500: 'tel_opt_lim_500', 1000: 'tel_opt_lim_1000' };
    Array.from(lim.options).forEach((o) => {
      const k = map[o.value];
      if (k) o.textContent = mpT(k);
    });
  }
  setText('tel-btn-search-txt', 'tel_btn_search');
  setText('tel-btn-live-txt', 'tel_btn_live');
  setText('tel-btn-export-txt', 'tel_btn_export');
  const emptyLi = document.getElementById('tel-list-empty-msg');
  if (emptyLi) emptyLi.textContent = mpT('tel_list_placeholder');
  setText('tel-det-device-lbl', 'tel_det_device');
  setText('tel-det-battery-lbl', 'tel_det_battery');
  setText('tel-det-net-lbl', 'tel_det_net');
  setText('tel-det-gps-lbl', 'tel_det_gps');
  setText('tel-det-ts-dev-lbl', 'tel_det_ts_dev');
  setText('tel-det-ts-srv-lbl', 'tel_det_ts_srv');
  setText('tel-leg-high', 'tel_legend_prec_high');
  setText('tel-leg-med', 'tel_legend_prec_med');
  setText('tel-leg-low', 'tel_legend_prec_low');
}

export function applyDataCollectionPageChrome() {
  applyMenuPageChrome({
    pageTitle: 'dc_pageTitle',
    bcHere: 'dc_bc_here',
    heroTitle: 'dc_hero_title',
    heroSub: 'dc_hero_sub',
  });
  setText('dc-policy-source-badge', 'dc_policy_global');
  setText('dc-tab-global-txt', 'dc_tab_global');
  setText('dc-tab-tenants-txt', 'dc_tab_tenants');
  setText('dc-tab-retention-txt', 'dc_tab_retention');
  setText('dc-btn-save-txt', 'dc_btn_save');
}

export function applyTcmPageChrome() {
  applyMenuPageChrome({
    pageTitle: 'tcm_pageTitle',
    bcHere: 'tcm_bc_here',
    heroTitle: 'tcm_hero_title',
    heroSub: 'tcm_hero_sub_html',
    heroSubHtml: true,
  });
  setText('tcm-btn-refresh', 'tcm_btn_refresh');
}
