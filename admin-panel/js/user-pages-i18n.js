/**
 * Textos da listagem e ficha de usuários (painel admin), pt-BR, en-US e es-ES.
 * Preferência: localStorage `brspark_admin_ui_locale`; se vazio, **pt-BR** (painel).
 */
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';
import { USER_PAGES_ES_MERGE } from './user-pages-es-merge.js';

const LS_LOCALE = 'brspark_admin_ui_locale';

const M = {
  'pt-BR': {
    localeLabel: 'Idioma do painel',
    topbarLogout: 'Sair',
    localePt: 'Português (Brasil)',
    localeEn: 'English (US)',
    localeEs: 'Español',
    nav_home_title: 'BrSpark, Início',
    nav_sidebar_expand: 'Expandir menu',
    nav_sidebar_collapse: 'Recolher menu',
    imp_banner_prefix: 'Visualizando o painel como ',
    imp_banner_suffix: ' (sessão temporária).',
    imp_end_btn: 'Terminar impersonação',
    nav_sec_mgmt: 'Gestão',
    nav_sec_ops: 'Operações',
    nav_sec_multi: 'Multi-Location',
    nav_sec_plat: 'Plataforma',
    nav_sec_sys: 'Sistema',
    nav_dashboard: 'Dashboard',
    nav_tenants: 'Tenants',
    nav_my_org: 'Minha organização',
    nav_users: 'Usuários',
    nav_tech_signup: 'Cadastro prestador',
    nav_forms_builder: 'Forms Builder',
    nav_operations: 'Central de Operações',
    nav_routine_tasks: 'RT, Tarefas de rotina',
    nav_reports_pdf: 'Relatórios PDF',
    nav_evaluations: 'Avaliações',
    nav_cockpit: 'Sync Cockpit',
    nav_locations: 'Multi-Location',
    nav_i18n: 'Traduções e regionais',
    nav_metatags: 'Metatags',
    nav_subscriptions: 'Assinaturas',
    nav_plans: 'Planos (pacotes)',
    nav_integrations: 'Integrações',
    nav_notifications: 'Notificações',
    nav_chat: 'Chat corporativo',
    topbarChat: 'Abrir chat',
    topbarChatUnread: 'Mensagens não lidas no chat',
    nav_compliance: 'LGPD & Compliance',
    nav_chat_mod: 'Segurança do chat (visita)',
    nav_data_collection: 'Coleta de Dados',
    nav_work_time: 'Registro de horas',
    nav_telemetry: 'Telemetria',
    nav_api_docs: 'API Docs',
    nav_audit: 'Auditoria',
    nav_system: 'Configurações',
    unsaved: 'Alterações não salvas',
    save: 'Salvar alterações',
    saveStay: 'Salvar e permanecer',
    discard: 'Descartar alterações',
    backList: 'Voltar à lista',
    prevUser: 'Usuário anterior',
    nextUser: 'Próximo usuário',
    moreActions: 'Mais ações',
    copyLink: 'Copiar link da ficha',
    exportJson: 'Exportar ficha (JSON)',
    duplicate: 'Duplicar para novo usuário…',
    ue_duplicateNameSuffix: ' (cópia)',
    roleMatrix: 'Matriz de papéis…',
    openAuditPage: 'Abrir auditoria global…',
    summaryId: 'ID',
    summaryTenant: 'Tenant',
    summaryRole: 'Papel',
    summaryActive: 'Conta ativa',
    summaryInactive: 'Conta inativa',
    summaryProvider: 'Prestador',
    summaryLastLogin: 'Último acesso',
    summaryWorkTime: 'Ponto',
    summarySession: 'Sessão',
    summarySessionNone: 'sem sessão registrada',
    disconnect: 'Encerrar sessão e dispositivo',
    disconnectOk: 'Sessão encerrada. O usuário pode voltar a fazer login.',
    internalNotes: 'Notas internas (painel)',
    internalNotesHint: 'Visível apenas no painel admin. Não sincroniza com a app móvel.',
    appLocale: 'Idioma preferido na app (BCP-47)',
    appLocaleHint: 'Usado no chat e conteúdos traduzidos. Vazio = dispositivo / tenant.',
    mfaTitle: 'MFA / SSO',
    mfaBody: 'A plataforma não expõe MFA nem SSO federado nesta ficha neste momento.',
    emailVerifyTitle: 'Verificação de e-mail',
    emailVerifyBody: '—',
    ue_emailVerVerified: 'E-mail verificado em {date}.',
    ue_emailVerPendingDesc:
      'Ainda não há confirmação de e-mail. Envie um link ao usuário ou marque manualmente (apenas administradores da organização).',
    ue_emailVerSendBtn: 'Enviar link de verificação',
    ue_emailVerMarkBtn: 'Marcar como verificado (manual)',
    ue_emailVerSentOk: 'Pedido registrado. Se o Nylas estiver configurado, o usuário recebeu o e-mail.',
    ue_emailVerSentWarn:
      'Link gerado, mas o envio automático falhou: {detail}. Copie o URL se for mostrado ou configure Nylas em Integrações.',
    ue_emailVerSendErr: 'Não foi possível enviar o pedido de verificação.',
    ue_emailVerMarkConfirm: 'Marcar este e-mail como verificado sem o usuário abrir o link?',
    ue_emailVerMarkOk: 'E-mail marcado como verificado.',
    ue_emailVerMarkErr: 'Não foi possível atualizar o estado.',
    auditTitle: 'Registro de atividade (auditoria)',
    auditEmpty: 'Sem eventos indexados para este usuário.',
    auditLoadErr: 'Não foi possível carregar a auditoria.',
    elevateTitle: 'Confirmar elevação de privilégios',
    elevateBody:
      'Você está atribuindo um papel de administração elevado. Para confirmar, digite o e-mail completo deste usuário:',
    elevateMismatch: 'O e-mail não coincide. Operação cancelada.',
    roleMatrixTitle: 'Papéis, resumo',
    filterLocs: 'Filtrar bases por nome…',
    docSituation: 'Situação',
    docAttach: 'Anexo (URL ou arquivo)',
    docValidOk: 'Válido',
    docExpiring: 'Prestes a expirar',
    docExpired: 'Expirado',
    docUnknown: '—',
    matriculaOk: 'Matrícula disponível.',
    matriculaDup: 'Matrícula já atribuída a outro usuário nesta organização.',
    matriculaCheckErr: 'Não foi possível validar a matrícula.',
    leaveUnsaved: 'Há alterações não salvas. Sair mesmo assim?',
    openNewTab: 'Abrir ficha em nova aba',
    usersNavStored: 'Navegação da lista ativa, use anterior/próximo na ficha.',
    ul_breadcrumb: 'Painel',
    ul_breadcrumbUsers: 'Usuários',
    ul_heroTitle: 'Gestão de usuários',
    ul_heroSub:
      'Centralize contas, papéis e acessos. Acompanhe prestadores, registro de ponto e sincronização FaceMatch num só lugar.',
    ul_statTotal: 'Total na página',
    ul_statActive: 'Ativos (página)',
    ul_statAdmins: 'Gestão / admin (página)',
    ul_statInactive: 'Inativos (página)',
    ul_searchPh: 'Buscar por nome ou e-mail…',
    ul_filterRoleLbl: 'Papel',
    ul_filterRoleAll: 'Todos os papéis',
    ul_filterWorktime: 'Só ponto ativo',
    ul_filterActiveLbl: 'Conta ativa',
    ul_filterActiveAll: 'Todas',
    ul_filterActiveOn: 'Somente ativos',
    ul_filterActiveOff: 'Somente inativos',
    ul_filtersToggleExpand: 'Mostrar filtros',
    ul_filtersToggleCollapse: 'Ocultar filtros',
    ul_localeLbl: 'Idioma',
    ul_exportTitle: 'Exportar a página atual em CSV',
    ul_exportBtn: 'Exportar',
    ul_techSignup: 'Cadastro prestador',
    ul_newUser: 'Novo usuário',
    ul_tableTitle: 'Lista de usuários',
    ul_thUser: 'Usuário',
    ul_thCreated: 'Criado em',
    ul_thMatricula: 'Matrícula',
    ul_thTenant: 'Tenant',
    ul_thRole: 'Papel',
    ul_thPonto: 'Ponto',
    ul_thLast: 'Último acesso',
    ul_thAccount: 'Conta / OS',
    ul_thFace: 'FaceMatch',
    ul_thActions: 'Ações',
    ul_modalNewTitle: 'Novo usuário',
    ul_modalResetTitle: 'Resetar senha',
    ul_lblName: 'Nome *',
    ul_lblEmail: 'E-mail *',
    ul_phName: 'João Silva',
    ul_phEmail: 'joao@exemplo.com',
    ul_lblMatricula: 'Matrícula funcional',
    ul_phMatricula: 'Opcional, única na organização',
    ul_lblTenant: 'Conta (Tenant)',
    ul_tenantPick: 'Selecione…',
    ul_lblRole: 'Papel',
    ul_lblTempPwd: 'Senha temporária *',
    ul_phPwd: 'Mín. 8 caracteres, maiúscula, minúscula e número',
    ul_cancel: 'Cancelar',
    ul_createUser: 'Criar usuário',
    ul_resetPwd: 'Resetar senha',
    ul_role_USER: 'Usuário',
    ul_role_PROVIDER: 'Prestador',
    ul_role_MANAGER: 'Gestor',
    ul_role_TENANT_ADMIN: 'Admin do tenant',
    ul_role_SAAS_ADMIN: 'Admin SaaS',
    ul_role_ADMIN: 'Admin',
    ul_roleBadge_USER: 'Usuário',
    ul_roleBadge_PROVIDER: 'Prestador',
    ul_roleBadge_MANAGER: 'Gestor',
    ul_roleBadge_TENANT_ADMIN: 'Admin tenant',
    ul_roleBadge_SAAS_ADMIN: 'Admin SaaS',
    ul_roleBadge_ADMIN: 'Admin',
    ul_yes: 'Sim',
    ul_no: 'Não',
    ul_chipSearch: 'Busca',
    ul_chipRole: 'Papel',
    ul_chipWorktime: 'Só ponto ativo',
    ul_chipActiveOn: 'Somente ativos',
    ul_chipActiveOff: 'Somente inativos',
    ul_clearFilters: 'Limpar filtros',
    ul_csvNoRows: 'Não há linhas para exportar nesta página.',
    ul_csvFilename: 'usuarios-pagina',
    ul_csvName: 'Nome',
    ul_csvEmail: 'E-mail',
    ul_csvMatricula: 'Matrícula',
    ul_csvTenant: 'Tenant',
    ul_csvTenantEmail: 'E-mail tenant',
    ul_csvRole: 'Papel',
    ul_csvPonto: 'Ponto',
    ul_csvLast: 'Último acesso',
    ul_csvActive: 'Conta ativa',
    ul_csvFace: 'FaceMatch',
    ul_pagShowing: 'Mostrando',
    ul_pagOf: 'de',
    ul_pagRows: 'Linhas',
    ul_pagPerPage: 'Itens por página',
    ul_loadErrTitle: 'Não foi possível carregar os usuários.',
    ul_loadErrHint: 'Reinicie o servidor da API após',
    ul_loadErrPrisma: 'se acabou de migrar o schema.',
    ul_countOne: '1 usuário',
    ul_countMany: 'usuários',
    ul_providerActive: 'Prestador: pode receber OS',
    ul_providerPending: 'Prestador: pendente (ainda não recebe OS)',
    ul_providerPendingSub:
      'Isto é o perfil técnico. O formulário de cadastro é outra lista: <a href="technician-applications.html" style="color:inherit;text-decoration:underline;font-weight:600">Cadastro de prestadores</a> (procure «Perfil sem candidatura» se não houver convite).',
    ul_providerInactive: 'Prestador: inativo (não recebe OS)',
    ul_providerSuspended: 'Prestador: suspenso',
    ul_cfNoSync: 'Sem registro de sincronização FaceMatch',
    ul_cfSynced: 'Sincronizado',
    ul_cfPending: 'Pendente',
    ul_cfError: 'Erro',
    ul_emptyTitle: 'Nenhum usuário encontrado',
    ul_emptySub: 'Ajuste a busca ou os filtros, ou cadastre um novo usuário.',
    ul_accountActive: 'Conta ativa',
    ul_accountInactive: 'Conta inativa',
    ul_editUser: 'Editar usuário',
    ul_resetPwdBtn: 'Resetar senha',
    ul_deactivate: 'Desativar conta',
    ul_activate: 'Ativar conta',
    ul_pwdMin: 'A senha deve ter pelo menos 8 caracteres, com uma letra maiúscula, uma minúscula e um número.',
    ul_pwdOk: 'Senha resetada com sucesso.',
    ul_pwdErr: 'Erro ao resetar senha:',
    ul_createFill: 'Preencha todos os campos obrigatórios.',
    ul_createErr: 'Falha ao criar usuário.',
    ul_errBadge: 'Erro',
    ul_filterTenantTxt: 'Tenant',
    ul_filterTenantAll: 'Todos os tenants',
    ul_filterCfTxt: 'FaceMatch',
    ul_filterCfAll: 'Todos os estados',
    ul_cfOptSynced: 'Sincronizado',
    ul_cfOptPending: 'Pendente',
    ul_cfOptError: 'Erro',
    ul_cfOptNone: 'Sem registro (JSON vazio)',
    ul_filterTechTxt: 'Prestador (OS)',
    ul_filterTechAll: 'Qualquer estado',
    ul_lastLoginFrom: 'Último acesso (de)',
    ul_lastLoginTo: 'Último acesso (até)',
    ul_sortBy: 'Ordenar por',
    ul_sortCreated: 'Criação',
    ul_sortLastLogin: 'Último acesso',
    ul_sortName: 'Nome',
    ul_sortEmail: 'E-mail',
    ul_sortUpdated: 'Atualização',
    ul_sortDirLbl: 'Ordem',
    ul_sortDesc: 'Descendente',
    ul_sortAsc: 'Ascendente',
    ul_chipTenant: 'Tenant',
    ul_chipCf: 'FaceMatch',
    ul_chipTech: 'Prestador',
    ul_chipLastLogin: 'Último acesso',
    ul_chipEmailVer: 'E-mail',
    ul_filterEmailVerLbl: 'Verificação de e-mail',
    ul_filterEmailVerAll: 'Todos',
    ul_filterEmailVerVerified: 'Verificado',
    ul_filterEmailVerUnverified: 'Sem verificação',
    ul_filterEmailVerPending: 'Convite pendente',
    ul_cfSyncedAt: 'Última sync',
    ul_sortId: 'ID (ordenar)',
    ul_sortMatricula: 'Matrícula (ordenar)',
    ul_sortRoleOpt: 'Papel (ordenar)',
    ul_sortActiveOpt: 'Conta ativa (ordenar)',
    ul_sortPontoOpt: 'Ponto, flag (ordenar)',
    ul_sortClickHint: 'Clique para ordenar por esta coluna; clique de novo para inverter ascendente/descendente.',
    ul_colsExtra: 'Colunas extra',
    ul_thCountry: 'País',
    ul_csvId: 'ID',
    ul_csvCreated: 'Criado em',
    ul_csvCountry: 'País',
    ul_csvEmailVer: 'E-mail (verificação)',
    ul_thEmailVer: 'E-mail verificado',
    ul_emailVerOk: 'Verificado',
    ul_emailVerPending: 'Convite enviado',
    ul_emailVerPendingTip: 'Link de verificação válido até',
    ul_emailVerNo: 'Não verificado',
    ul_emailVerCsvPending: 'pendente',
    ul_emailVerCsvNo: 'não',
    ul_sortEmailVer: 'E-mail verificado (ordenar)',
    ul_bulkSelected: '{n} selecionados nesta página',
    ul_bulkSelectAll: 'Selecionar ou limpar todas as linhas desta página',
    ul_bulkExportSel: 'Exportar selecionados (CSV)',
    ul_bulkDeactivateBtn: 'Desativar selecionados',
    ul_rowSelectAria: 'Selecionar linha: {name}',
    ul_bulkNoSelection: 'Nenhuma linha selecionada.',
    ul_bulkNoneActive: 'Entre os selecionados, nenhuma conta está ativa.',
    ul_bulkDeactivateConfirm:
      'Desativar as contas selecionadas que ainda estão ativas? Só será alterado o estado ativo/inativo.',
    ul_bulkDeactivateOk: '{n} conta(s) desativada(s).',
    ul_bulkDeactivateErr: 'Não foi possível desativar em massa.',
    ul_viewUser: 'Ver ficha (só leitura)',
    ul_impersonateBtn: 'Abrir painel como este usuário',
    ul_impersonateConfirm:
      'Iniciar uma sessão temporária do painel como este usuário? A sua sessão atual fica salva até terminar a impersonação.',
    ul_impersonateErr: 'Não foi possível iniciar a impersonação.',
    ul_impersonateStorageErr: 'Não foi possível salvar o estado de recuperação no navegador (quota ou modo privado).',
    ul_resetEmailModalTitle: 'Resetar senha por e-mail',
    ul_resetEmailHint:
      'Útil quando não tem o usuário na página. Se o mesmo e-mail existir em mais do que uma organização, escolha o tenant. Caso contrário, deixe «Automático».',
    ul_resetEmailLblEmail: 'E-mail do usuário',
    ul_resetEmailLblTenant: 'Organização (tenant)',
    ul_resetEmailTenantOptAuto: 'Automático se o e-mail for único',
    ul_resetEmailNeedEmail: 'Indique o e-mail do usuário.',
    ul_openResetEmailTitle: 'Redefinir senha quando sabe o e-mail (e opcionalmente o tenant)',
    ul_openResetEmailTxt: 'Reset por e-mail',
    ul_resetEmailConfirmBtn: 'Redefinir senha',
    ue_stickyHint_html:
      '<strong>Dica de uso:</strong> utilize os atalhos abaixo. <strong>Documentos multi-location:</strong> em «Bases», deixe vazio (nenhuma seleção com Ctrl) para indicar validade em <em>todo o tenant</em>; ou selecione uma ou mais <code>Location</code> do tenant (edifícios, áreas, armazéns) para restringir onde o documento se aplica, alinhado ao modelo Multi-Location do painel. <strong>Lista:</strong> «Voltar à lista» repõe filtros, ordenação e página que tinha ao abrir a ficha (quando veio da listagem).',
    ue_navDados: 'Dados pessoais',
    ue_navFace: 'Reconhecimento facial',
    ue_navWorkTime: 'Registro de horas',
    ue_navAddr: 'Endereço',
    ue_navAccess: 'Tipo de acesso',
    ue_navTech: 'Prestador',
    ue_navDocsP: 'Docs. pessoais',
    ue_navDocsPro: 'Docs. profissionais',
    ue_navSchedule: 'Horários',
    ue_navRegions: 'Regiões atendidas',
    ue_secDados: 'Dados pessoais',
    ue_lblPhone: 'Telefone / WhatsApp',
    ue_phPhone: '+55 …',
    ue_lblAvatarUrl: 'URL foto de perfil',
    ue_secFace: 'Reconhecimento facial, fotos base',
    ue_faceIntro_html:
      'Fotos base para o motor de reconhecimento: <strong>JPEG, PNG ou WebP</strong> (máx. <strong>5 MB</strong> cada; até <strong>12</strong>). HEIC do iPhone não é aceito. Quem veio do <strong>cadastro em etapas</strong> traz a foto do passo 1 como referência principal (não removível aqui; só muda com novo cadastro aprovado ou exclusão do usuário). Reforce com fotos nítidas adicionais do rosto. O campo «URL foto de perfil» em Dados pessoais é gestão administrativa (o app do colaborador <strong>não</strong> permite trocar foto nem matrícula após o perfil de prestador ficar <strong>ACTIVE</strong>).',
    ue_faceAddPhotos: '+ Adicionar fotos',
    ue_cfGalleryTitle: 'Galeria FaceMatch (Recognition)',
    ue_cfGalleryDesc_html:
      'Ao adicionar ou remover fotos base ou ao gravar alteração de avatar, o <strong>servidor envia na hora</strong> a galeria ao FaceMatch (ordem: referência do passo 1, quando existir; depois avatar; depois demais matrículas).',
    ue_cfSyncAgain: 'Sincronizar novamente',
    ue_cfSyncIdle: 'Pronto, a sincronizar após alterar fotos.',
    ue_cfSubjectFoot: 'O subject no FaceMatch segue o formato tenant:usuário definido pelo painel.',
    ue_secWorkTime: 'Registro de horas (ponto)',
    ue_lblMatricula: 'Matrícula funcional',
    ue_phMatricula: 'Ex.: 12345, FT-00042…',
    ue_matriculaHint:
      'Um valor por usuário, único na organização quando preenchido. Usado no app de ponto, nas batidas e nos relatórios de horas (exportação / auditoria).',
    ue_wtLoading: 'A carregar política do tenant…',
    ue_wtEnableLbl: 'Habilitar registro de horas para este usuário',
    ue_wtBrRegimeTitle: 'Vínculo laboral (Brasil)',
    ue_wtBrRegimeHint:
      'CLT: no app móvel mantém a aba «Ponto» e o texto «Jornada acumulada do dia». PJ: a aba passa a «Registro» e o texto vira «Horas registradas hoje». Só disponível quando a organização tem país BR no perfil de localização do tenant; nas demais localizações não há esta opção.',
    ue_wtPolicy_html:
      'Efetivo no app para todos os papéis <strong>exceto cliente</strong> (papel «Usuário» / <code>USER</code>): com a flag <strong>work_time</strong>, módulo ligado em <a href="work-time.html" style="color:var(--accent);font-weight:700">Registro de horas</a>, esta opção ativa no usuário e matrícula facial conforme a política.',
    ue_secAddr: 'Endereço (JSON estruturado / multi-location)',
    ue_addrL1: 'Linha 1 (rua, nº)',
    ue_addrL2: 'Linha 2 (complemento)',
    ue_addrDistrict: 'Bairro',
    ue_addrCity: 'Cidade',
    ue_addrState: 'Estado / UF',
    ue_addrPostal: 'CEP / Código postal',
    ue_addrCountry: 'País (ISO, ex. BR)',
    ue_addr_br_l1: 'Logradouro e número',
    ue_addr_br_l2: 'Complemento (apto, bloco…)',
    ue_addr_br_district: 'Bairro',
    ue_addr_br_city: 'Cidade',
    ue_addr_br_state: 'Estado (UF)',
    ue_addr_br_postal: 'CEP',
    ue_addr_br_country: 'País (código ISO, ex. BR)',
    ue_addr_us_l1: 'Endereço (rua e nº)',
    ue_addr_us_l2: 'Apto / suíte (linha 2)',
    ue_addr_us_district: 'Condado / distrito (opcional)',
    ue_addr_us_city: 'Cidade',
    ue_addr_us_state: 'Estado (sigla)',
    ue_addr_us_postal: 'ZIP / código postal',
    ue_addr_us_country: 'País (código ISO, ex. US)',
    ue_avatarUploadBtn: 'Enviar imagem',
    ue_avatarUploading: 'A enviar…',
    ue_avatarUploadErr: 'Não foi possível enviar a imagem do avatar.',
    ue_avatarHeic: 'HEIC não é aceito. Use JPEG ou PNG.',
    ue_rbacRoleFieldLocked: 'O seu papel não permite alterar este campo.',
    ue_rbacAdminNotesReadonly: 'Notas internas só podem ser editadas por administradores da organização.',
    ue_rbacCannotEditSaasUser: 'Sem permissão para editar administrador da plataforma.',
    ue_secAccess: 'Tipo de acesso na conta',
    ue_lblAccountRole: 'Papel na conta',
    ue_accessHint_html:
      '<strong>Prestador</strong> ativa o perfil técnico (horários, regiões, docs. profissionais). <strong>SaaS admin</strong> é para a equipe da plataforma; use só em contas que devam operar no âmbito global do serviço.',
    ue_activeLbl: 'Conta ativa (pode fazer login no app / painel)',
    ue_activeHint_html:
      'Isto é <strong>independente</strong> do estado do prestador abaixo: uma conta pode estar ativa e o prestador <strong>inativo</strong>, nesse caso <strong>não</strong> é possível despachar OS para este e-mail.',
    ue_secTech: 'Prestador de serviço (técnico)',
    ue_techIntro:
      'Estes campos aplicam-se quando o papel é Prestador (ou quando já existe perfil técnico). Se mudar o papel para outro, o perfil técnico fica INACTIVE (não apaga histórico).',
    ue_lblTechStatus: 'Estado do prestador (habilitação para receber OS)',
    ue_techPending: 'Pendente',
    ue_techActive: 'Ativo',
    ue_techInactive: 'Inativo',
    ue_techSuspended: 'Suspenso',
    ue_lblScore: 'Score interno',
    ue_lblCft: 'CFT / registro profissional',
    ue_lblSpecialty: 'Especialidade principal',
    ue_lblSkills: 'Habilidades (tags separadas por vírgula)',
    ue_phSkills: 'Ar condicionado, Elétrica, Hidráulica…',
    ue_secDocsP: 'Documentos pessoais, escopo por base (multi-location)',
    ue_secDocsPro: 'Documentos profissionais (certificações, ASO, NR, etc.)',
    ue_btnAddDoc: '+ Adicionar documento',
    ue_docThType: 'Tipo',
    ue_docThId: 'Identificador',
    ue_docThFrom: 'Emissão',
    ue_docThTo: 'Validade',
    ue_docThIssuer: 'Órgão emissor',
    ue_docThLocs: 'Bases (Location)',
    ue_docThAttach: 'Anexo',
    ue_docThNotes: 'Notas / ações',
    ue_docPhNumber: 'Número',
    ue_docPhIssuer: 'Órgão emissor',
    ue_docPhAttach: 'https://… ou envie arquivo',
    ue_docLocsTitle: 'Vazio = válido em todas as bases do tenant',
    ue_docLocsHint: 'Ctrl+clique várias',
    ue_docUploadBtn: 'Enviar arquivo',
    ue_docUploading: 'A enviar…',
    ue_docUploadErr: 'Não foi possível enviar o anexo.',
    ue_docPhNotes: 'Notas',
    ue_docRemove: 'Remover',
    ue_docEmpty: 'Nenhum documento. Use «Adicionar».',
    ue_secSchedule: 'Horários de trabalho (prestador)',
    ue_schActiveLbl: 'Ativo',
    ue_schStart: 'Início',
    ue_schEnd: 'Fim',
    ue_schLocsInSlot: 'Regiões neste turno',
    ue_schLocsTitle: 'Vazio = não fixa base neste turno',
    ue_schLocsHintShort: 'Ctrl/Cmd + clique',
    ue_schRemoveTitle: 'Remover turno',
    ue_schAddSlotBtn: '+ Turno neste dia',
    ue_scheduleIntro_html:
      'Use <strong>+ Turno neste dia</strong> para vários blocos no mesmo dia (ex.: manhã numa base, tarde em outra). Cada dia pode ter turnos com <strong>regiões diferentes</strong>. Em cada turno, «Regiões» vazio significa que o turno não fixa base (continua limitado pelo universo <a href="#sec-regioes">Regiões atendidas</a> abaixo).',
    ue_secRegions: 'Área de atendimento',
    ue_regionsIntro: 'Defina o centro geográfico da operação e o raio máximo em quilômetros para despacho do técnico.',
    ue_auditDesc: 'Eventos recentes ligados a este usuário.',
    ue_auditThWhen: 'Data',
    ue_auditThAction: 'Ação',
    ue_auditThAdmin: 'Admin',
    ue_auditThDetail: 'Detalhe',
    ue_auditLoading: 'A carregar…',
    ue_elevateModalTitle: 'Confirmar elevação',
    ue_elevateLblEmail: 'E-mail',
    ue_elevateConfirm: 'Confirmar',
    ue_matrixOk: 'OK',
    ue_fatalMissingTitle: 'Link incompleto',
    ue_fatalMissingBody:
      'Falta o identificador do usuário na URL. Abra a ficha a partir da lista de usuários, ou use o link «Editar» na linha correta.',
    ue_fatalNotFoundTitle: 'Usuário não encontrado',
    ue_fatalNotFoundBody:
      'Não foi possível carregar esta conta. O registro pode ter sido removido, o ID pode estar incorreto ou a API devolveu um erro.',
    ue_fatalBackList: 'Voltar à lista',
    ue_fatalGoUsers: 'Ir para lista de usuários',
    ue_fatalDashboard: 'Painel',
    ue_fatalEdit: 'Editar',
    ue_readonlyCrumb: 'Ver (só leitura)',
    ue_readonlyBannerTitle: 'Modo só leitura.',
    ue_readonlyBannerBody:
      'Não é possível alterar dados nesta visualização. Feche a aba ou abra o cadastro em modo de edição a partir da lista.',
    ue_roleMatrixIntro:
      'Modelo de acesso em alto nível. Permissões exatas acompanham o produto.',
    ue_roleMatrixLiUser: 'USER, usuário padrão / fluxos de cliente.',
    ue_roleMatrixLiProv: 'PROVIDER, prestador de campo, horários, documentos.',
    ue_roleMatrixLiMgr: 'MANAGER, gestão operacional no tenant.',
    ue_roleMatrixLiTenant: 'TENANT_ADMIN, administração completa da organização.',
    ue_roleMatrixLiSaas: 'SAAS_ADMIN, equipe da plataforma, multi-tenant. Atribuir com muito cuidado.',
    ue_addrHintBR: 'Brasil: bairro e UF são comuns. Código postal: CEP.',
    ue_addrHintUS: 'Estados Unidos: use ZIP e estado com duas letras quando aplicável.',
    ue_addrHintGeneric: 'Use ISO país (2 letras). Rótulos genéricos; alinhe à prática local.',
    ue_addrHintNonBR: 'País com código postal alfanumérico: confira cidade e estado/província conforme o local.',
    ue_addrHintDefault: 'Use o código ISO de 2 letras no país. Campos genéricos (linha 1, cidade, CEP) adaptam-se a vários países.',
    ue_disconnectConfirm: 'Encerrar a sessão deste usuário?',
    ue_disconnectGenericErr: 'Não foi possível concluir o pedido.',
    ue_discardConfirm: 'Descartar todas as alterações?',
    ue_saveNeedNameEmail: 'Nome e e-mail são obrigatórios.',
    ue_saveEmailInvalid: 'Formato de e-mail inválido.',
    ue_saveOk: 'Guardado com sucesso.',
    ue_copyLinkOk: 'Link copiado.',
    ue_copyLinkPrompt: 'Copie:',
    ue_cfAdminNoState_html:
      '<strong>FaceMatch (registro)</strong>, sem estado salvo. Após enviar fotos ou «Sincronizar», o estado aparece aqui.',
    ue_cfBadgeSynced: 'Sincronizado',
    ue_cfBadgePending: 'Pendente',
    ue_cfBadgeErr: 'Erro de sincronização',
    ue_cfGalleryCount: '{n} imagem(ns) na galeria',
    ue_cfGallerySent: '{n} imagem(ns) enviada(s)',
    ue_cfSubjectLabel: 'subject',
    ue_cfPendingDefault: 'Aguarda sincronização com FaceMatch.',
    ue_cfFailDefault: 'Falha',
    ue_cfLastOk: ' Último OK: {date} ({n} img).',
    ue_cfSyncLoading: 'A sincronizar com FaceMatch…',
    ue_cfSyncGalleryOkShort: 'Galeria atualizada, {n} imagem(ns) enviada(s) · subject: {sub}',
    ue_cfSyncFail: 'Falha na sincronização.',
    ue_cfSyncNetErrShort: 'Erro de rede ao contatar o servidor.',
    ue_cfSyncNetErrAlert: 'Erro de rede ao sincronizar.',
    ue_cfSyncApplyErr: 'FaceMatch: sincronização falhou.',
    ue_faceGalleryEmpty: 'Nenhuma foto base. Use «Adicionar fotos».',
    ue_faceProtectedTitle: 'Foto do passo 1 do cadastro do prestador, não pode ser removida aqui.',
    ue_faceProtectedBadge: 'Protegida',
    ue_faceRibbonPrimary: 'Referência (passo 1)',
    ue_facePrimaryRemoveBlock:
      'Esta é a foto de referência do passo 1 do cadastro do prestador. Ela não pode ser removida aqui, só muda se o cadastro for refeito e aprovado de novo ou se o usuário for excluído.',
    ue_faceRemoveConfirm: 'Remover esta foto base?',
    ue_wtPolicyLoadErr: 'Não foi possível carregar a política de ponto do tenant.',
    ue_wtHintModuleOff: 'O módulo de ponto está desligado nas configurações do tenant.',
    ue_wtHintFaceNoPhotos:
      'Sem fotos base de rosto, batidas podem sair com ressalva até adicionar fotos em Reconhecimento facial.',
    ue_wtHintFaceMatchNotSynced:
      'FaceMatch ainda não confirmou esta galeria no servidor (integração, rede ou falha no envio). Em Integrações, verifique «Exadel CompreFace» ativo e use «Testar». Batidas podem sair com ressalva até ficar OK.',
    ue_wtHintTechActive:
      'Prestador ACTIVE: fotos de perfil e de matrícula só por esta ficha no painel (não pelo app).',
    ue_wtHintAttentionPrefix: 'Atenção:',
    ue_wtHintPolicyPrefix: 'Política:',
    ue_wtHintPolicyOk:
      'requisitos do tenant alinhados com a matrícula atual (verifique sempre antes de exigir ponto).',
    ue_wtFaceMatricula: 'Matrícula facial:',
    ue_wtFacePhotosCount: '{n} foto(s) base',
    ue_wtFaceNoPhotos: 'sem fotos base',
    ue_faceIdentityActive:
      'Prestador ACTIVE: o colaborador não altera foto de perfil nem matrícula facial pelo app, só por esta ficha no painel.',
    ue_faceHeicAlert:
      'HEIC não é suportado aqui: {file}\nNo iPhone use Ajustes → Câmera → Formatos → «Mais compatível», ou converta para JPEG.',
    ue_faceFormatAlert: 'Formato não reconhecido (use JPEG, PNG ou WebP): {file}',
    ue_faceFileFallback: 'arquivo',
    ue_faceUploadingFile: 'A enviar {file}…',
    ue_faceUploadFail: 'Falha ao enviar a foto. Verifique a conexão com a API e o console do navegador.',
    ue_navSessionNotes: 'Sessão e notas',
    ue_navActivity: 'Atividade',
    ue_secSessionNotesTitle: 'Sessão, notas e preferências',
    ue_lblSessionCurrent: 'Sessão atual (painel / app)',
    ue_prefLocaleDefault: '(Padrão do dispositivo / tenant)',
  },
  'en-US': {
    localeLabel: 'Panel language',
    topbarLogout: 'Sign out',
    localePt: 'Portuguese (Brazil)',
    localeEn: 'English (US)',
    localeEs: 'Spanish',
    nav_home_title: 'BrSpark, Home',
    nav_sidebar_expand: 'Expand menu',
    nav_sidebar_collapse: 'Collapse menu',
    imp_banner_prefix: 'Viewing the panel as ',
    imp_banner_suffix: ' (temporary session).',
    imp_end_btn: 'End impersonation',
    nav_sec_mgmt: 'Management',
    nav_sec_ops: 'Operations',
    nav_sec_multi: 'Multi-location',
    nav_sec_plat: 'Platform',
    nav_sec_sys: 'System',
    nav_dashboard: 'Dashboard',
    nav_tenants: 'Tenants',
    nav_my_org: 'My organization',
    nav_users: 'Users',
    nav_tech_signup: 'Technician signup',
    nav_forms_builder: 'Forms Builder',
    nav_operations: 'Operations center',
    nav_routine_tasks: 'Routine tasks',
    nav_reports_pdf: 'PDF reports',
    nav_evaluations: 'Evaluations',
    nav_cockpit: 'Sync Cockpit',
    nav_locations: 'Multi-location',
    nav_i18n: 'Translations & locale',
    nav_metatags: 'Metatags',
    nav_subscriptions: 'Subscriptions',
    nav_plans: 'Plans (packages)',
    nav_integrations: 'Integrations',
    nav_notifications: 'Notifications',
    nav_chat: 'Team chat',
    topbarChat: 'Open chat',
    topbarChatUnread: 'Unread chat messages',
    nav_compliance: 'Privacy & compliance',
    nav_chat_mod: 'Visit chat safety',
    nav_data_collection: 'Data collection',
    nav_work_time: 'Time tracking',
    nav_telemetry: 'Telemetry',
    nav_api_docs: 'API docs',
    nav_audit: 'Audit',
    nav_system: 'Settings',
    unsaved: 'Unsaved changes',
    save: 'Save changes',
    saveStay: 'Save and stay',
    discard: 'Discard changes',
    backList: 'Back to list',
    prevUser: 'Previous user',
    nextUser: 'Next user',
    moreActions: 'More actions',
    copyLink: 'Copy record link',
    exportJson: 'Export record (JSON)',
    duplicate: 'Duplicate as new user…',
    ue_duplicateNameSuffix: ' (copy)',
    roleMatrix: 'Role matrix…',
    openAuditPage: 'Open global audit…',
    summaryId: 'ID',
    summaryTenant: 'Tenant',
    summaryRole: 'Role',
    summaryActive: 'Account active',
    summaryInactive: 'Account inactive',
    summaryProvider: 'Provider',
    summaryLastLogin: 'Last sign-in',
    summaryWorkTime: 'Time clock',
    summarySession: 'Session',
    summarySessionNone: 'no active session id',
    disconnect: 'Sign out session & device',
    disconnectOk: 'Session cleared. The user can sign in again.',
    internalNotes: 'Internal notes (panel)',
    internalNotesHint: 'Panel-only. Not shown in the mobile app.',
    appLocale: 'Preferred app language (BCP-47)',
    appLocaleHint: 'Used for chat and translated content. Empty = device / tenant default.',
    mfaTitle: 'MFA / SSO',
    mfaBody: 'MFA and federated SSO are not shown on this screen in the current API.',
    emailVerifyTitle: 'Email verification',
    emailVerifyBody: '—',
    ue_emailVerVerified: 'Email verified on {date}.',
    ue_emailVerPendingDesc:
      'This email is not confirmed yet. Send a link to the user or mark manually (organization admins only).',
    ue_emailVerSendBtn: 'Send verification link',
    ue_emailVerMarkBtn: 'Mark as verified (manual)',
    ue_emailVerSentOk: 'Request recorded. If Nylas is configured, the user was emailed.',
    ue_emailVerSentWarn:
      'Link generated but email delivery failed: {detail}. Copy the URL if shown, or configure Nylas under Integrations.',
    ue_emailVerSendErr: 'Could not start email verification.',
    ue_emailVerMarkConfirm: 'Mark this email as verified without the user opening the link?',
    ue_emailVerMarkOk: 'Email marked as verified.',
    ue_emailVerMarkErr: 'Could not update verification state.',
    auditTitle: 'Activity log (audit)',
    auditEmpty: 'No indexed events for this user.',
    auditLoadErr: 'Could not load audit trail.',
    elevateTitle: 'Confirm privilege elevation',
    elevateBody: 'You are assigning an elevated admin role. Type the user’s full email to confirm:',
    elevateMismatch: 'Email does not match. Cancelled.',
    roleMatrixTitle: 'Roles, overview',
    filterLocs: 'Filter sites by name…',
    docSituation: 'Status',
    docAttach: 'Attachment (URL or file)',
    docValidOk: 'Valid',
    docExpiring: 'Expiring soon',
    docExpired: 'Expired',
    docUnknown: '—',
    matriculaOk: 'Employee ID available.',
    matriculaDup: 'Employee ID already used by another user in this organization.',
    matriculaCheckErr: 'Could not validate employee ID.',
    leaveUnsaved: 'You have unsaved changes. Leave anyway?',
    openNewTab: 'Open record in new tab',
    usersNavStored: 'List navigation active, use prev/next on the user record.',
    ul_breadcrumb: 'Panel',
    ul_breadcrumbUsers: 'Users',
    ul_heroTitle: 'User management',
    ul_heroSub:
      'Centralize accounts, roles and access. Track providers, time clock and FaceMatch sync in one place.',
    ul_statTotal: 'On this page',
    ul_statActive: 'Active (page)',
    ul_statAdmins: 'Mgmt / admin (page)',
    ul_statInactive: 'Inactive (page)',
    ul_searchPh: 'Search by name or email…',
    ul_filterRoleLbl: 'Role',
    ul_filterRoleAll: 'All roles',
    ul_filterWorktime: 'Time clock only',
    ul_filterActiveLbl: 'Account status',
    ul_filterActiveAll: 'All',
    ul_filterActiveOn: 'Active only',
    ul_filterActiveOff: 'Inactive only',
    ul_filtersToggleExpand: 'Show filters',
    ul_filtersToggleCollapse: 'Hide filters',
    ul_localeLbl: 'Language',
    ul_exportTitle: 'Export current page as CSV',
    ul_exportBtn: 'Export',
    ul_techSignup: 'Technician signup',
    ul_newUser: 'New user',
    ul_tableTitle: 'User list',
    ul_thUser: 'User',
    ul_thCreated: 'Created',
    ul_thMatricula: 'Employee ID',
    ul_thTenant: 'Tenant',
    ul_thRole: 'Role',
    ul_thPonto: 'Time clock',
    ul_thLast: 'Last sign-in',
    ul_thAccount: 'Account / jobs',
    ul_thFace: 'FaceMatch',
    ul_thActions: 'Actions',
    ul_modalNewTitle: 'New user',
    ul_modalResetTitle: 'Reset password',
    ul_lblName: 'Name *',
    ul_lblEmail: 'Email *',
    ul_phName: 'John Doe',
    ul_phEmail: 'john@example.com',
    ul_lblMatricula: 'Employee ID',
    ul_phMatricula: 'Optional, unique in the organization',
    ul_lblTenant: 'Account (tenant)',
    ul_tenantPick: 'Select…',
    ul_lblRole: 'Role',
    ul_lblTempPwd: 'Temporary password *',
    ul_phPwd: 'Min. 8 chars, upper, lower, and a number',
    ul_cancel: 'Cancel',
    ul_createUser: 'Create user',
    ul_resetPwd: 'Reset password',
    ul_role_USER: 'User',
    ul_role_PROVIDER: 'Provider',
    ul_role_MANAGER: 'Manager',
    ul_role_TENANT_ADMIN: 'Tenant admin',
    ul_role_SAAS_ADMIN: 'SaaS admin',
    ul_role_ADMIN: 'Admin',
    ul_roleBadge_USER: 'User',
    ul_roleBadge_PROVIDER: 'Provider',
    ul_roleBadge_MANAGER: 'Manager',
    ul_roleBadge_TENANT_ADMIN: 'Tenant admin',
    ul_roleBadge_SAAS_ADMIN: 'SaaS admin',
    ul_roleBadge_ADMIN: 'Admin',
    ul_yes: 'Yes',
    ul_no: 'No',
    ul_chipSearch: 'Search',
    ul_chipRole: 'Role',
    ul_chipWorktime: 'Time clock only',
    ul_chipActiveOn: 'Active only',
    ul_chipActiveOff: 'Inactive only',
    ul_clearFilters: 'Clear filters',
    ul_csvNoRows: 'No rows to export on this page.',
    ul_csvFilename: 'users-page',
    ul_csvName: 'Name',
    ul_csvEmail: 'Email',
    ul_csvMatricula: 'Employee ID',
    ul_csvTenant: 'Tenant',
    ul_csvTenantEmail: 'Tenant email',
    ul_csvRole: 'Role',
    ul_csvPonto: 'Time clock',
    ul_csvLast: 'Last sign-in',
    ul_csvActive: 'Account active',
    ul_csvFace: 'FaceMatch',
    ul_pagShowing: 'Showing',
    ul_pagOf: 'of',
    ul_pagRows: 'Rows',
    ul_pagPerPage: 'Items per page',
    ul_loadErrTitle: 'Could not load users.',
    ul_loadErrHint: 'Restart the API server after',
    ul_loadErrPrisma: 'if you just migrated the schema.',
    ul_countOne: '1 user',
    ul_countMany: 'users',
    ul_providerActive: 'Provider: can receive work orders',
    ul_providerPending: 'Provider: pending (cannot receive work orders yet)',
    ul_providerPendingSub:
      'This is the technician profile. Signup is a separate list: <a href="technician-applications.html" style="color:inherit;text-decoration:underline;font-weight:600">Technician applications</a> (look for “profile without application” if there is no invite).',
    ul_providerInactive: 'Provider: inactive (no work orders)',
    ul_providerSuspended: 'Provider: suspended',
    ul_cfNoSync: 'No FaceMatch sync record',
    ul_cfSynced: 'Synced',
    ul_cfPending: 'Pending',
    ul_cfError: 'Error',
    ul_emptyTitle: 'No users found',
    ul_emptySub: 'Adjust search or filters, or create a new user.',
    ul_accountActive: 'Account active',
    ul_accountInactive: 'Account inactive',
    ul_editUser: 'Edit user',
    ul_resetPwdBtn: 'Reset password',
    ul_deactivate: 'Deactivate account',
    ul_activate: 'Activate account',
    ul_pwdMin: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.',
    ul_pwdOk: 'Password reset successfully.',
    ul_pwdErr: 'Error resetting password:',
    ul_createFill: 'Fill in all required fields.',
    ul_createErr: 'Failed to create user.',
    ul_errBadge: 'Error',
    ul_filterTenantTxt: 'Tenant',
    ul_filterTenantAll: 'All tenants',
    ul_filterCfTxt: 'FaceMatch',
    ul_filterCfAll: 'All states',
    ul_cfOptSynced: 'Synced',
    ul_cfOptPending: 'Pending',
    ul_cfOptError: 'Error',
    ul_cfOptNone: 'No record (empty JSON)',
    ul_filterTechTxt: 'Provider (work orders)',
    ul_filterTechAll: 'Any status',
    ul_lastLoginFrom: 'Last sign-in (from)',
    ul_lastLoginTo: 'Last sign-in (to)',
    ul_sortBy: 'Sort by',
    ul_sortCreated: 'Created',
    ul_sortLastLogin: 'Last sign-in',
    ul_sortName: 'Name',
    ul_sortEmail: 'Email',
    ul_sortUpdated: 'Updated',
    ul_sortDirLbl: 'Direction',
    ul_sortDesc: 'Descending',
    ul_sortAsc: 'Ascending',
    ul_chipTenant: 'Tenant',
    ul_chipCf: 'FaceMatch',
    ul_chipTech: 'Provider',
    ul_chipLastLogin: 'Last sign-in',
    ul_chipEmailVer: 'Email',
    ul_filterEmailVerLbl: 'Email verification',
    ul_filterEmailVerAll: 'All',
    ul_filterEmailVerVerified: 'Verified',
    ul_filterEmailVerUnverified: 'Not verified',
    ul_filterEmailVerPending: 'Pending invite',
    ul_cfSyncedAt: 'Last sync',
    ul_sortId: 'ID (sort)',
    ul_sortMatricula: 'Employee ID (sort)',
    ul_sortRoleOpt: 'Role (sort)',
    ul_sortActiveOpt: 'Account active (sort)',
    ul_sortPontoOpt: 'Time clock flag (sort)',
    ul_sortClickHint: 'Click to sort by this column; click again to toggle ascending/descending.',
    ul_colsExtra: 'Extra columns',
    ul_thCountry: 'Country',
    ul_csvId: 'ID',
    ul_csvCreated: 'Created',
    ul_csvCountry: 'Country',
    ul_csvEmailVer: 'Email (verification)',
    ul_thEmailVer: 'Email verified',
    ul_emailVerOk: 'Verified',
    ul_emailVerPending: 'Invite sent',
    ul_emailVerPendingTip: 'Verification link valid until',
    ul_emailVerNo: 'Not verified',
    ul_emailVerCsvPending: 'pending',
    ul_emailVerCsvNo: 'no',
    ul_sortEmailVer: 'Email verified (sort)',
    ul_bulkSelected: '{n} selected on this page',
    ul_bulkSelectAll: 'Select or clear all rows on this page',
    ul_bulkExportSel: 'Export selection (CSV)',
    ul_bulkDeactivateBtn: 'Deactivate selection',
    ul_rowSelectAria: 'Select row: {name}',
    ul_bulkNoSelection: 'No rows selected.',
    ul_bulkNoneActive: 'None of the selected accounts are active.',
    ul_bulkDeactivateConfirm:
      'Deactivate selected accounts that are still active? Only the active/inactive flag will change.',
    ul_bulkDeactivateOk: '{n} account(s) deactivated.',
    ul_bulkDeactivateErr: 'Bulk deactivate failed.',
    ul_viewUser: 'View record (read-only)',
    ul_impersonateBtn: 'Open panel as this user',
    ul_impersonateConfirm:
      'Start a temporary panel session as this user? Your current session is saved until you end impersonation.',
    ul_impersonateErr: 'Could not start impersonation.',
    ul_impersonateStorageErr: 'Could not store recovery state in the browser (quota or private mode).',
    ul_resetEmailModalTitle: 'Reset password by email',
    ul_resetEmailHint:
      'Use when the user is not on this page. If the same email exists in more than one organization, pick the tenant; otherwise leave «Automatic».',
    ul_resetEmailLblEmail: 'User email',
    ul_resetEmailLblTenant: 'Organization (tenant)',
    ul_resetEmailTenantOptAuto: 'Automatic if the email is unique',
    ul_resetEmailNeedEmail: 'Enter the user email.',
    ul_openResetEmailTitle: 'Reset password when you know the email (and optionally the tenant)',
    ul_openResetEmailTxt: 'Reset by email',
    ul_resetEmailConfirmBtn: 'Reset password',
    ue_stickyHint_html:
      '<strong>Tip:</strong> use the shortcuts below. <strong>Multi-location documents:</strong> under “Sites”, leave nothing selected (Ctrl+click to clear) to mean <em>valid for the whole tenant</em>; or select one or more tenant <code>Location</code> records (buildings, areas, warehouses) to limit where the document applies, aligned with the panel’s multi-location model. <strong>List:</strong> “Back to list” restores filters, sort and page from when you opened this record (when coming from the list).',
    ue_navDados: 'Personal data',
    ue_navFace: 'Face recognition',
    ue_navWorkTime: 'Time clock',
    ue_navAddr: 'Address',
    ue_navAccess: 'Account access',
    ue_navTech: 'Provider',
    ue_navDocsP: 'Personal docs',
    ue_navDocsPro: 'Professional docs',
    ue_navSchedule: 'Schedule',
    ue_navRegions: 'Service areas',
    ue_secDados: 'Personal data',
    ue_lblPhone: 'Phone / WhatsApp',
    ue_phPhone: '+1 …',
    ue_lblAvatarUrl: 'Profile photo URL',
    ue_secFace: 'Face recognition, base photos',
    ue_faceIntro_html:
      'Base photos for the recognition engine: <strong>JPEG, PNG or WebP</strong> (max <strong>5 MB</strong> each; up to <strong>12</strong>). iPhone HEIC is not accepted. Users from <strong>step-by-step registration</strong> keep step 1 as the main reference (not removable here; only changes with a new approved signup or user deletion). Add sharp face photos. The “profile photo URL” field under Personal data is admin-only (the field app <strong>does not</strong> allow changing photo or employee ID after the provider profile is <strong>ACTIVE</strong>).',
    ue_faceAddPhotos: '+ Add photos',
    ue_cfGalleryTitle: 'FaceMatch gallery (Recognition)',
    ue_cfGalleryDesc_html:
      'When you add or remove base photos or save a profile photo URL change, the <strong>server pushes immediately</strong> to FaceMatch (order: step 1 reference if any; then avatar; then other enrollment photos).',
    ue_cfSyncAgain: 'Sync again',
    ue_cfSyncIdle: 'Ready, will sync after photo changes.',
    ue_cfSubjectFoot: 'The FaceMatch subject follows the tenant:user format defined by the panel.',
    ue_secWorkTime: 'Time clock',
    ue_lblMatricula: 'Employee ID',
    ue_phMatricula: 'e.g. 12345, FT-00042…',
    ue_matriculaHint:
      'One value per user, unique in the organization when set. Used in the time-clock app, punches and hour reports (export / audit).',
    ue_wtLoading: 'Loading tenant policy…',
    ue_wtEnableLbl: 'Enable time clock for this user',
    ue_wtBrRegimeTitle: 'Employment type (Brazil)',
    ue_wtBrRegimeHint:
      'CLT: keeps the mobile tab label and “accumulated day” wording as today. PJ: the tab label becomes “Log” (pt-BR: «Registro») and the card title becomes “Hours logged today” (pt-BR: «Horas registradas hoje»). Only shown when the tenant locale country is BR; other regions use a single wording per locale.',
    ue_wtPolicy_html:
      'Effective in the app for all roles <strong>except the client role</strong> (<code>USER</code>): with the <strong>work_time</strong> flag, the module enabled in <a href="work-time.html" style="color:var(--accent);font-weight:700">Time clock</a>, this user option on, and face enrollment per policy.',
    ue_secAddr: 'Address (structured JSON / multi-location)',
    ue_addrL1: 'Line 1 (street, no.)',
    ue_addrL2: 'Line 2 (complement)',
    ue_addrDistrict: 'District / neighbourhood',
    ue_addrCity: 'City',
    ue_addrState: 'State / region',
    ue_addrPostal: 'ZIP / postal code',
    ue_addrCountry: 'Country (ISO, e.g. US)',
    ue_addr_br_l1: 'Street and number',
    ue_addr_br_l2: 'Complement (apt, block…)',
    ue_addr_br_district: 'Neighborhood (bairro)',
    ue_addr_br_city: 'City',
    ue_addr_br_state: 'State (UF)',
    ue_addr_br_postal: 'Postal code (CEP)',
    ue_addr_br_country: 'Country (ISO code, e.g. BR)',
    ue_addr_us_l1: 'Street address',
    ue_addr_us_l2: 'Apt / suite (line 2)',
    ue_addr_us_district: 'County / district (optional)',
    ue_addr_us_city: 'City',
    ue_addr_us_state: 'State (2-letter)',
    ue_addr_us_postal: 'ZIP / postal code',
    ue_addr_us_country: 'Country (ISO code, e.g. US)',
    ue_avatarUploadBtn: 'Upload image',
    ue_avatarUploading: 'Uploading…',
    ue_avatarUploadErr: 'Could not upload the profile image.',
    ue_avatarHeic: 'HEIC is not accepted. Use JPEG or PNG.',
    ue_rbacRoleFieldLocked: 'Your role does not allow changing this field.',
    ue_rbacAdminNotesReadonly: 'Internal notes can only be edited by organization administrators.',
    ue_rbacCannotEditSaasUser: 'You do not have permission to edit a platform administrator account.',
    ue_secAccess: 'Account access type',
    ue_lblAccountRole: 'Role in account',
    ue_accessHint_html:
      '<strong>Provider</strong> enables the technician profile (schedules, regions, professional documents). <strong>SaaS admin</strong> is for the platform team; use only on accounts that must operate globally.',
    ue_activeLbl: 'Account active (can sign in to app / panel)',
    ue_activeHint_html:
      'This is <strong>independent</strong> of the provider state below: the account can be active and the provider <strong>inactive</strong>, then work orders <strong>cannot</strong> be dispatched to this email.',
    ue_secTech: 'Service provider (technician)',
    ue_techIntro:
      'These fields apply when the role is Provider (or a technician profile already exists). If you change the role, the technician profile becomes INACTIVE (history is kept).',
    ue_lblTechStatus: 'Provider state (eligible for work orders)',
    ue_techPending: 'Pending',
    ue_techActive: 'Active',
    ue_techInactive: 'Inactive',
    ue_techSuspended: 'Suspended',
    ue_lblScore: 'Internal score',
    ue_lblCft: 'Professional registration',
    ue_lblSpecialty: 'Main specialty',
    ue_lblSkills: 'Skills (comma-separated tags)',
    ue_phSkills: 'HVAC, Electrical, Plumbing…',
    ue_secDocsP: 'Personal documents, per site (multi-location)',
    ue_secDocsPro: 'Professional documents (certs, medical fitness, safety, etc.)',
    ue_btnAddDoc: '+ Add document',
    ue_docThType: 'Type',
    ue_docThId: 'Identifier',
    ue_docThFrom: 'Issued',
    ue_docThTo: 'Expiry',
    ue_docThIssuer: 'Issuing body',
    ue_docThLocs: 'Sites (Location)',
    ue_docThAttach: 'Attachment',
    ue_docThNotes: 'Notes / actions',
    ue_docPhNumber: 'Number',
    ue_docPhIssuer: 'Issuing body',
    ue_docPhAttach: 'https://… or upload a file',
    ue_docLocsTitle: 'Empty = valid for all tenant sites',
    ue_docLocsHint: 'Ctrl/Cmd + click for multiple',
    ue_docUploadBtn: 'Upload file',
    ue_docUploading: 'Uploading…',
    ue_docUploadErr: 'Could not upload the attachment.',
    ue_docPhNotes: 'Notes',
    ue_docRemove: 'Remove',
    ue_docEmpty: 'No documents. Use “Add”.',
    ue_secSchedule: 'Work schedule (provider)',
    ue_schActiveLbl: 'Active',
    ue_schStart: 'Start',
    ue_schEnd: 'End',
    ue_schLocsInSlot: 'Regions in this shift',
    ue_schLocsTitle: 'Empty = no fixed site for this shift',
    ue_schLocsHintShort: 'Ctrl/Cmd + click',
    ue_schRemoveTitle: 'Remove shift',
    ue_schAddSlotBtn: '+ Shift on this day',
    ue_scheduleIntro_html:
      'Use <strong>+ Shift on this day</strong> for multiple blocks on the same day (e.g. morning at one site, afternoon at another). Each day can have shifts with <strong>different regions</strong>. Empty “Regions” on a shift means the shift does not pin a site (still limited by <a href="#sec-regioes">Service areas</a> below).',
    ue_secRegions: 'Service area',
    ue_regionsIntro: 'Set the operating center point and the maximum radius in kilometers for technician dispatch.',
    ue_auditDesc: 'Recent events linked to this user.',
    ue_auditThWhen: 'When',
    ue_auditThAction: 'Action',
    ue_auditThAdmin: 'Admin',
    ue_auditThDetail: 'Detail',
    ue_auditLoading: 'Loading…',
    ue_elevateModalTitle: 'Confirm elevation',
    ue_elevateLblEmail: 'Email',
    ue_elevateConfirm: 'Confirm',
    ue_matrixOk: 'OK',
    ue_fatalMissingTitle: 'Incomplete link',
    ue_fatalMissingBody:
      'The user id is missing from the URL. Open the record from the user list, or use “Edit” on the correct row.',
    ue_fatalNotFoundTitle: 'User not found',
    ue_fatalNotFoundBody:
      'This account could not be loaded. It may have been removed, the id may be wrong, or the API returned an error.',
    ue_fatalBackList: 'Back to list',
    ue_fatalGoUsers: 'Go to user list',
    ue_fatalDashboard: 'Dashboard',
    ue_fatalEdit: 'Edit',
    ue_readonlyCrumb: 'View (read-only)',
    ue_readonlyBannerTitle: 'Read-only mode.',
    ue_readonlyBannerBody:
      'You cannot change data in this view. Close the tab or open the record in edit mode from the list.',
    ue_roleMatrixIntro: 'High-level access model. Exact permissions evolve with the product.',
    ue_roleMatrixLiUser: 'USER, default collaborator / client workflows.',
    ue_roleMatrixLiProv: 'PROVIDER, field technician, schedules, documents.',
    ue_roleMatrixLiMgr: 'MANAGER, operational management in the tenant.',
    ue_roleMatrixLiTenant: 'TENANT_ADMIN, full administration of the organization.',
    ue_roleMatrixLiSaas: 'SAAS_ADMIN, platform team, cross-tenant. Assign with extreme care.',
    ue_addrHintBR: 'Brazil: neighbourhood (bairro) and state (UF) are common. Postal code: CEP.',
    ue_addrHintUS: 'United States: use ZIP and two-letter state when applicable.',
    ue_addrHintGeneric: 'Use a 2-letter ISO country. Labels are generic; align with local practice.',
    ue_addrHintNonBR: 'For countries with alphanumeric postal codes, double-check city and state/province.',
    ue_addrHintDefault: 'Use the 2-letter ISO country code. Generic fields adapt to many countries.',
    ue_disconnectConfirm: 'Sign this user out of the current session?',
    ue_disconnectGenericErr: 'The request could not be completed.',
    ue_discardConfirm: 'Discard all changes?',
    ue_saveNeedNameEmail: 'Name and email are required.',
    ue_saveEmailInvalid: 'Invalid email format.',
    ue_saveOk: 'Saved successfully.',
    ue_copyLinkOk: 'Link copied.',
    ue_copyLinkPrompt: 'Copy:',
    ue_cfAdminNoState_html:
      '<strong>FaceMatch (record)</strong>, no saved state yet. After uploading photos or tapping “Sync”, status appears here.',
    ue_cfBadgeSynced: 'Synced',
    ue_cfBadgePending: 'Pending',
    ue_cfBadgeErr: 'Sync error',
    ue_cfGalleryCount: '{n} image(s) in gallery',
    ue_cfGallerySent: '{n} image(s) uploaded',
    ue_cfSubjectLabel: 'subject',
    ue_cfPendingDefault: 'Waiting for FaceMatch sync.',
    ue_cfFailDefault: 'Failed',
    ue_cfLastOk: ' Last OK: {date} ({n} img).',
    ue_cfSyncLoading: 'Syncing with FaceMatch…',
    ue_cfSyncGalleryOkShort: 'Gallery updated, {n} image(s) sent · subject: {sub}',
    ue_cfSyncFail: 'Synchronization failed.',
    ue_cfSyncNetErrShort: 'Network error contacting the server.',
    ue_cfSyncNetErrAlert: 'Network error while syncing.',
    ue_cfSyncApplyErr: 'FaceMatch: synchronization failed.',
    ue_faceGalleryEmpty: 'No base photos yet. Use “Add photos”.',
    ue_faceProtectedTitle: 'Technician signup step-1 photo, cannot be removed here.',
    ue_faceProtectedBadge: 'Protected',
    ue_faceRibbonPrimary: 'Reference (step 1)',
    ue_facePrimaryRemoveBlock:
      'This is the technician signup step-1 reference photo. It cannot be removed here, it only changes if signup is re-done and approved again, or the user is deleted.',
    ue_faceRemoveConfirm: 'Remove this base photo?',
    ue_wtPolicyLoadErr: 'Could not load the tenant time-clock policy.',
    ue_wtHintModuleOff: 'The time clock module is turned off in tenant settings.',
    ue_wtHintFaceNoPhotos:
      'No face base photos yet, punches may stay flagged until you add photos under Face recognition.',
    ue_wtHintFaceMatchNotSynced:
      'FaceMatch has not confirmed this gallery on the server (integration, network, or upload failure). In Integrations, check “Exadel CompreFace” is active and use “Test”. Punches may stay flagged until OK.',
    ue_wtHintTechActive:
      'Provider ACTIVE: profile and enrollment photos are only from this admin page (not the app).',
    ue_wtHintAttentionPrefix: 'Warning:',
    ue_wtHintPolicyPrefix: 'Policy:',
    ue_wtHintPolicyOk: 'tenant requirements match the current enrollment (always verify before requiring punches).',
    ue_wtFaceMatricula: 'Face enrollment:',
    ue_wtFacePhotosCount: '{n} base photo(s)',
    ue_wtFaceNoPhotos: 'no base photos',
    ue_faceIdentityActive:
      'Provider ACTIVE: the worker cannot change profile photo or enrollment photos in the app, only on this page.',
    ue_faceHeicAlert:
      'HEIC is not supported here: {file}\nOn iPhone use Settings → Camera → Formats → “Most Compatible”, or convert to JPEG.',
    ue_faceFormatAlert: 'Unrecognized format (use JPEG, PNG or WebP): {file}',
    ue_faceFileFallback: 'file',
    ue_faceUploadingFile: 'Uploading {file}…',
    ue_faceUploadFail: 'Upload failed. Check the API connection and the browser console.',
    ue_navSessionNotes: 'Session & notes',
    ue_navActivity: 'Activity',
    ue_secSessionNotesTitle: 'Session, notes & preferences',
    ue_lblSessionCurrent: 'Current session (panel / app)',
    ue_prefLocaleDefault: '(Device / tenant default)',
  },
};
M['es-ES'] = Object.assign({}, M['en-US'], USER_PAGES_ES_MERGE);

/** Valores persistidos (JSON), documentos de identificação / pessoais */
export const DOC_TYPE_ROWS_PERSONAL = {
  'pt-BR': [
    ['CPF', 'CPF'],
    ['RG', 'RG'],
    ['CNH', 'CNH'],
    ['Passaporte', 'Passaporte'],
    ['CNS', 'CNS'],
    ['PIS/PASEP', 'PIS/PASEP'],
    ['Outro', 'Outro'],
  ],
  'en-US': [
    ['CPF', 'Tax ID (CPF)'],
    ['RG', 'National ID'],
    ['CNH', 'Driver license'],
    ['Passaporte', 'Passport'],
    ['CNS', 'Health ID'],
    ['PIS/PASEP', 'Social / work ID'],
    ['Outro', 'Other'],
  ],
  'es-ES': [
    ['CPF', 'CPF (ID fiscal)'],
    ['RG', 'Documento de identidad'],
    ['CNH', 'Permiso de conducir'],
    ['Passaporte', 'Pasaporte'],
    ['CNS', 'ID de salud'],
    ['PIS/PASEP', 'ID social / laboral'],
    ['Outro', 'Otro'],
  ],
};

/**
 * Valores persistidos, certificações, saúde ocupacional, NRs (mesmos códigos em todos os locales).
 * Rótulos traduzidos para o painel.
 */
export const DOC_TYPE_ROWS_PROFESSIONAL = {
  'pt-BR': [
    ['ASO', 'ASO (saúde ocupacional)'],
    ['NR-06', 'NR-06 (EPI / integração)'],
    ['NR-10', 'NR-10 (eletricidade)'],
    ['NR-11', 'NR-11 (transporte / ergonomia)'],
    ['NR-12', 'NR-12 (máquinas e equipamentos)'],
    ['NR-33', 'NR-33 (espaço confinado)'],
    ['NR-35', 'NR-35 (trabalho em altura)'],
    ['Certificacao', 'Certificação / curso'],
    ['RegistroProfissional', 'CREA / CRQ / registro profissional'],
    ['Habilitacao', 'Habilitação / credencial'],
    ['Outro', 'Outro'],
  ],
  'en-US': [
    ['ASO', 'Occupational health certificate (ASO)'],
    ['NR-06', 'NR-06 (PPE / safety integration)'],
    ['NR-10', 'NR-10 (electrical safety)'],
    ['NR-11', 'NR-11 (transport / ergonomics)'],
    ['NR-12', 'NR-12 (machinery & equipment)'],
    ['NR-33', 'NR-33 (confined space)'],
    ['NR-35', 'NR-35 (work at height)'],
    ['Certificacao', 'Certificate / training course'],
    ['RegistroProfissional', 'Professional council registration (e.g. CREA)'],
    ['Habilitacao', 'License / credential'],
    ['Outro', 'Other'],
  ],
  'es-ES': [
    ['ASO', 'ASO (salud ocupacional)'],
    ['NR-06', 'NR-06 (EPI / integración)'],
    ['NR-10', 'NR-10 (electricidad)'],
    ['NR-11', 'NR-11 (transporte / ergonomía)'],
    ['NR-12', 'NR-12 (máquinas y equipos)'],
    ['NR-33', 'NR-33 (espacio confinado)'],
    ['NR-35', 'NR-35 (trabajo en altura)'],
    ['Certificacao', 'Certificación / curso'],
    ['RegistroProfissional', 'Registro profesional (CREA / CRQ)'],
    ['Habilitacao', 'Habilitación / credencial'],
    ['Outro', 'Otro'],
  ],
};

/** @deprecated Preferir `DOC_TYPE_ROWS_PERSONAL`, mantido por compatibilidade com imports antigos */
export const DOC_TYPE_ROWS = DOC_TYPE_ROWS_PERSONAL;

const DAYS_PT = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];
const DAYS_EN = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];
const DAYS_ES = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export function getAdminUiLocale() {
  try {
    const ls = localStorage.getItem(LS_LOCALE);
    if (ls === 'en-US' || ls === 'pt-BR' || ls === 'es-ES') return ls;
  } catch {
    /* ignore */
  }
  return 'pt-BR';
}

export function setAdminUiLocale(code) {
  try {
    if (code === 'en-US' || code === 'pt-BR' || code === 'es-ES') localStorage.setItem(LS_LOCALE, code);
  } catch {
    /* ignore */
  }
}

export function t(key) {
  return adminResolve(M, getAdminUiLocale(), key);
}

export { adminDocumentLang, adminIntlLocale };

const UE_ADDR_LABEL_DOM_IDS = [
  'ue-addr-l1',
  'ue-addr-l2',
  'ue-addr-district',
  'ue-addr-city',
  'ue-addr-state',
  'ue-addr-postal',
  'ue-addr-country',
];

const UE_ADDR_FIELD_PROFILE_KEYS = {
  generic: [
    'ue_addrL1',
    'ue_addrL2',
    'ue_addrDistrict',
    'ue_addrCity',
    'ue_addrState',
    'ue_addrPostal',
    'ue_addrCountry',
  ],
  br: [
    'ue_addr_br_l1',
    'ue_addr_br_l2',
    'ue_addr_br_district',
    'ue_addr_br_city',
    'ue_addr_br_state',
    'ue_addr_br_postal',
    'ue_addr_br_country',
  ],
  us: [
    'ue_addr_us_l1',
    'ue_addr_us_l2',
    'ue_addr_us_district',
    'ue_addr_us_city',
    'ue_addr_us_state',
    'ue_addr_us_postal',
    'ue_addr_us_country',
  ],
};

/** Rótulos do bloco de endereço conforme o país (BR / US / genérico) e o idioma do painel. */
export function applyAddressFieldLabelsForCountry(countryCode) {
  if (typeof document === 'undefined') return;
  let cc = '';
  if (countryCode !== undefined && countryCode !== null && String(countryCode).trim() !== '') {
    cc = String(countryCode).trim().toUpperCase().slice(0, 2);
  } else {
    cc = String(document.getElementById('a-country')?.value || '')
      .trim()
      .toUpperCase()
      .slice(0, 2);
  }
  const profile = cc === 'BR' ? 'br' : cc === 'US' ? 'us' : 'generic';
  const keys = UE_ADDR_FIELD_PROFILE_KEYS[profile];
  UE_ADDR_LABEL_DOM_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el && keys[i]) el.textContent = t(keys[i]);
  });
}

/** Linhas [valor, rótulo] para o select de tipo conforme o bloco (pessoal vs profissional). */
export function getDocTypeRowsForLocale(kind) {
  const loc = getAdminUiLocale();
  const table = kind === 'professional' ? DOC_TYPE_ROWS_PROFESSIONAL : DOC_TYPE_ROWS_PERSONAL;
  return table[loc] || table['en-US'] || table['pt-BR'];
}

export function docTypesForLocale() {
  const p = getDocTypeRowsForLocale('personal').map((x) => x[0]);
  const r = getDocTypeRowsForLocale('professional').map((x) => x[0]);
  return [...new Set([...p, ...r])];
}

export function weekdaysForLocale() {
  const loc = getAdminUiLocale();
  if (loc === 'en-US') return DAYS_EN;
  if (loc === 'es-ES') return DAYS_ES;
  return DAYS_PT;
}

/** Texto estático da lista de usuários (hero, filtros, tabela, modais). */
/** Sincroniza texto e `aria-expanded` do botão retrátil de filtros da lista de usuários. */
export function syncUsersListFiltersToggle() {
  if (typeof document === 'undefined') return;
  const ufPanel = document.getElementById('users-filters-panel');
  const ufToggle = document.getElementById('users-filters-toggle');
  const ufSpan = document.querySelector('[data-ul-filters-toggle-txt]');
  if (!ufPanel || !ufToggle || !ufSpan) return;
  const expanded = !ufPanel.classList.contains('is-collapsed');
  ufToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  ufSpan.textContent = t(expanded ? 'ul_filtersToggleCollapse' : 'ul_filtersToggleExpand');
}

export function applyUsersListPageI18n() {
  if (typeof document === 'undefined') return;
  const setT = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const setH = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t(key);
  };
  setT('ul-bc-panel', 'ul_breadcrumb');
  setT('ul-bc-users', 'ul_breadcrumbUsers');
  setT('ul-hero-title', 'ul_heroTitle');
  setH('ul-hero-sub', 'ul_heroSub');
  setT('ul-stat-total-lbl', 'ul_statTotal');
  setT('ul-stat-active-lbl', 'ul_statActive');
  setT('ul-stat-admins-lbl', 'ul_statAdmins');
  setT('ul-stat-inactive-lbl', 'ul_statInactive');
  const si = document.getElementById('search-input');
  if (si) si.placeholder = t('ul_searchPh');
  setT('ul-filter-role-txt', 'ul_filterRoleLbl');
  setT('ul-filter-worktime-lbl', 'ul_filterWorktime');
  setT('ul-filter-active-lbl', 'ul_filterActiveLbl');
  const fa = document.getElementById('filter-active');
  if (fa && fa.options.length >= 3) {
    fa.options[0].textContent = t('ul_filterActiveAll');
    fa.options[1].textContent = t('ul_filterActiveOn');
    fa.options[2].textContent = t('ul_filterActiveOff');
  }
  setT('ul-locale-lbl', 'ul_localeLbl');
  const ex = document.getElementById('export-users-btn');
  if (ex) ex.title = t('ul_exportTitle');
  setT('ul-export-btn-txt', 'ul_exportBtn');
  setT('ul-tech-signup-txt', 'ul_techSignup');
  setT('ul-new-user-btn-txt', 'ul_newUser');
  setT('users-table-title', 'ul_tableTitle');
  setT('ul-cols-label', 'ul_colsExtra');
  const sa = document.getElementById('ul-select-all');
  if (sa) {
    const lab = t('ul_bulkSelectAll');
    sa.setAttribute('aria-label', lab);
    sa.title = lab;
  }
  setT('ul-bulk-export-csv-txt', 'ul_bulkExportSel');
  setT('ul-bulk-deactivate-txt', 'ul_bulkDeactivateBtn');
  setT('ul-col-lbl-id', 'summaryId');
  setT('ul-col-lbl-created', 'ul_thCreated');
  setT('ul-col-lbl-country', 'ul_thCountry');
  setT('ul-col-lbl-emailver', 'ul_thEmailVer');
  setT('lbl-th-user', 'ul_thUser');
  setT('lbl-th-id', 'summaryId');
  setT('lbl-th-created', 'ul_thCreated');
  setT('lbl-th-country', 'ul_thCountry');
  setT('lbl-th-emailver', 'ul_thEmailVer');
  setT('lbl-th-mat', 'ul_thMatricula');
  setT('lbl-th-tenant', 'ul_thTenant');
  setT('lbl-th-role', 'ul_thRole');
  setT('lbl-th-ponto', 'ul_thPonto');
  setT('lbl-th-last', 'ul_thLast');
  setT('lbl-th-account', 'ul_thAccount');
  setT('lbl-th-cf', 'ul_thFace');
  setT('lbl-th-actions', 'ul_thActions');
  setT('new-user-modal-title', 'ul_modalNewTitle');
  setT('reset-pwd-modal-title', 'ul_modalResetTitle');
  setT('ul-new-lbl-name', 'ul_lblName');
  setT('ul-new-lbl-email', 'ul_lblEmail');
  setT('ul-new-lbl-matricula', 'ul_lblMatricula');
  setT('ul-new-lbl-tenant', 'ul_lblTenant');
  setT('ul-new-lbl-role', 'ul_lblRole');
  setT('ul-new-lbl-pwd', 'ul_lblTempPwd');
  const nn = document.getElementById('new-name');
  if (nn) nn.placeholder = t('ul_phName');
  const ne = document.getElementById('new-email');
  if (ne) ne.placeholder = t('ul_phEmail');
  const nm = document.getElementById('new-employee-matricula');
  if (nm) nm.placeholder = t('ul_phMatricula');
  const np = document.getElementById('new-password');
  if (np) np.placeholder = t('ul_phPwd');
  const rp = document.getElementById('reset-password');
  if (rp) rp.placeholder = t('ul_phPwd');
  const repw = document.getElementById('reset-email-password');
  if (repw) repw.placeholder = t('ul_phPwd');
  setT('ul-reset-pwd-lbl', 'ul_lblTempPwd');
  const nt = document.getElementById('new-tenant');
  if (nt && nt.options.length) nt.options[0].textContent = t('ul_tenantPick');
  const mapRoleSelect = (selId, withAll) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    let i0 = 0;
    if (withAll && sel.options[0] && sel.options[0].value === '') {
      sel.options[0].textContent = t('ul_filterRoleAll');
      i0 = 1;
    }
    const order = ['USER', 'PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];
    order.forEach((role, j) => {
      const op = sel.options[i0 + j];
      if (op && op.value === role) op.textContent = t(`ul_role_${role}`);
    });
  };
  mapRoleSelect('filter-role', true);
  mapRoleSelect('new-role', false);
  document.querySelectorAll('[data-ul-cancel]').forEach((b) => {
    b.textContent = t('ul_cancel');
  });
  setT('save-user-btn', 'ul_createUser');
  setT('confirm-reset-btn', 'ul_resetPwd');
  setT('confirm-reset-email-btn', 'ul_resetEmailConfirmBtn');
  setT('reset-email-modal-title', 'ul_resetEmailModalTitle');
  const remh = document.getElementById('reset-email-modal-hint');
  if (remh) remh.textContent = t('ul_resetEmailHint');
  setT('reset-email-lbl-email', 'ul_resetEmailLblEmail');
  setT('reset-email-lbl-tenant', 'ul_resetEmailLblTenant');
  setT('ul-reset-email-pwd-lbl', 'ul_lblTempPwd');
  const rteo = document.getElementById('reset-email-tenant-opt-auto');
  if (rteo) rteo.textContent = t('ul_resetEmailTenantOptAuto');
  setT('ul-open-reset-email-txt', 'ul_openResetEmailTxt');
  const oreb = document.getElementById('ul-open-reset-email-btn');
  if (oreb) oreb.title = t('ul_openResetEmailTitle');
  setT('ul-filter-tenant-txt', 'ul_filterTenantTxt');
  setT('ul-filter-cf-txt', 'ul_filterCfTxt');
  setT('ul-filter-tech-txt', 'ul_filterTechTxt');
  setT('ul-filter-emailver-txt', 'ul_filterEmailVerLbl');
  setT('ul-filter-login-from-lbl', 'ul_lastLoginFrom');
  setT('ul-filter-login-to-lbl', 'ul_lastLoginTo');
  setT('ul-filter-sort-lbl', 'ul_sortBy');
  setT('ul-filter-sortdir-lbl', 'ul_sortDirLbl');
  const ft0 = document.getElementById('filter-tenant');
  if (ft0 && ft0.options[0]) ft0.options[0].textContent = t('ul_filterTenantAll');
  const cfs = document.getElementById('filter-compreface');
  if (cfs) {
    const m = { '': 'ul_filterCfAll', synced: 'ul_cfOptSynced', pending: 'ul_cfOptPending', error: 'ul_cfOptError', none: 'ul_cfOptNone' };
    [...cfs.options].forEach((op) => {
      const k = m[op.value];
      if (k) op.textContent = t(k);
    });
  }
  const fts = document.getElementById('filter-technician');
  if (fts && fts.options[0]) fts.options[0].textContent = t('ul_filterTechAll');
  const fev = document.getElementById('filter-email-verification');
  if (fev) {
    const em = {
      '': 'ul_filterEmailVerAll',
      verified: 'ul_filterEmailVerVerified',
      unverified: 'ul_filterEmailVerUnverified',
      pending: 'ul_filterEmailVerPending',
    };
    [...fev.options].forEach((op) => {
      const k = em[op.value];
      if (k) op.textContent = t(k);
    });
  }
  const fsort = document.getElementById('filter-sort');
  if (fsort) {
    const sm = {
      createdAt: 'ul_sortCreated',
      lastLogin: 'ul_sortLastLogin',
      name: 'ul_sortName',
      email: 'ul_sortEmail',
      updatedAt: 'ul_sortUpdated',
      id: 'ul_sortId',
      employeeMatricula: 'ul_sortMatricula',
      role: 'ul_sortRoleOpt',
      isActive: 'ul_sortActiveOpt',
      workTimeTrackingEnabled: 'ul_sortPontoOpt',
      emailVerifiedAt: 'ul_sortEmailVer',
    };
    [...fsort.options].forEach((op) => {
      const k = sm[op.value];
      if (k) op.textContent = t(k);
    });
  }
  const fsd = document.getElementById('filter-sort-dir');
  if (fsd) {
    [...fsd.options].forEach((op) => {
      op.textContent = op.value === 'asc' ? t('ul_sortAsc') : t('ul_sortDesc');
    });
  }
  const upLoc = document.getElementById('users-panel-locale');
  if (upLoc && upLoc.options.length >= 3) {
    upLoc.options[0].textContent = t('localePt');
    upLoc.options[1].textContent = t('localeEn');
    upLoc.options[2].textContent = t('localeEs');
  }
  syncUsersListFiltersToggle();
}

const UE_DOC_TH_KEYS = [
  'ue_docThType',
  'ue_docThId',
  'ue_docThFrom',
  'ue_docThTo',
  'docSituation',
  'ue_docThIssuer',
  'ue_docThLocs',
  'ue_docThAttach',
  'ue_docThNotes',
];

/** Blocos longos da ficha (secções, navegação, títulos de tabela de documentos / auditoria). */
export function applyUserEditStaticPageI18n() {
  if (typeof document === 'undefined') return;
  const setT = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const setH = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t(key);
  };
  setH('ue-sticky-hint', 'ue_stickyHint_html');
  setT('ue-nav-dados', 'ue_navDados');
  setT('ue-nav-face', 'ue_navFace');
  setT('ue-nav-worktime', 'ue_navWorkTime');
  setT('ue-nav-addr', 'ue_navAddr');
  setT('ue-nav-access', 'ue_navAccess');
  setT('ue-nav-tech', 'ue_navTech');
  setT('ue-nav-docs-p', 'ue_navDocsP');
  setT('ue-nav-docs-pro', 'ue_navDocsPro');
  setT('ue-nav-schedule', 'ue_navSchedule');
  setT('ue-nav-regions', 'ue_navRegions');
  setT('ue-nav-ops', 'ue_navSessionNotes');
  setT('ue-nav-audit', 'ue_navActivity');
  setT('sec-ops-title', 'ue_secSessionNotesTitle');
  setT('lbl-session', 'ue_lblSessionCurrent');
  setT('sec-audit-title', 'auditTitle');
  setT('ue-sec-dados-title', 'ue_secDados');
  setT('ue-lbl-name', 'ul_lblName');
  setT('ue-lbl-email', 'ul_lblEmail');
  setT('ue-lbl-phone', 'ue_lblPhone');
  setT('ue-lbl-avatar', 'ue_lblAvatarUrl');
  const fp = document.getElementById('f-phone');
  if (fp) fp.placeholder = t('ue_phPhone');
  const fa = document.getElementById('f-avatar');
  if (fa) fa.placeholder = t('ue_docPhAttach');
  setT('ue-sec-face-title', 'ue_secFace');
  setH('ue-face-intro', 'ue_faceIntro_html');
  setT('btn-face-pick', 'ue_faceAddPhotos');
  setT('ue-cf-gallery-title', 'ue_cfGalleryTitle');
  setH('ue-cf-gallery-desc', 'ue_cfGalleryDesc_html');
  setH('ue-cf-subject-foot', 'ue_cfSubjectFoot');
  setT('ue-sec-worktime-title', 'ue_secWorkTime');
  setT('ue-lbl-matricula', 'ue_lblMatricula');
  const fm = document.getElementById('f-employee-matricula');
  if (fm) fm.placeholder = t('ue_phMatricula');
  setH('ue-matricula-hint', 'ue_matriculaHint');
  setT('ue-wt-enable-lbl', 'ue_wtEnableLbl');
  setT('wt-br-regime-title', 'ue_wtBrRegimeTitle');
  setT('wt-br-regime-hint', 'ue_wtBrRegimeHint');
  setH('ue-wt-policy', 'ue_wtPolicy_html');
  setT('ue-sec-addr-title', 'ue_secAddr');
  setT('ue-addr-l1', 'ue_addrL1');
  setT('ue-addr-l2', 'ue_addrL2');
  setT('ue-addr-district', 'ue_addrDistrict');
  setT('ue-addr-city', 'ue_addrCity');
  setT('ue-addr-state', 'ue_addrState');
  setT('ue-addr-postal', 'ue_addrPostal');
  setT('ue-addr-country', 'ue_addrCountry');
  setT('ue-sec-access-title', 'ue_secAccess');
  setT('ue-lbl-f-role', 'ue_lblAccountRole');
  setH('ue-access-hint', 'ue_accessHint_html');
  setT('ue-active-lbl', 'ue_activeLbl');
  setH('ue-active-hint', 'ue_activeHint_html');
  setT('ue-sec-tech-title', 'ue_secTech');
  setH('ue-tech-intro', 'ue_techIntro');
  setT('ue-lbl-t-status', 'ue_lblTechStatus');
  const ts = document.getElementById('t-status');
  if (ts) {
    const ord = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
    const tk = ['ue_techPending', 'ue_techActive', 'ue_techInactive', 'ue_techSuspended'];
    [...ts.options].forEach((op, i) => {
      if (tk[i]) op.textContent = t(tk[i]);
    });
  }
  setT('ue-lbl-t-score', 'ue_lblScore');
  setT('ue-lbl-t-cft', 'ue_lblCft');
  setT('ue-lbl-t-specialty', 'ue_lblSpecialty');
  setT('ue-lbl-t-skills', 'ue_lblSkills');
  const tsk = document.getElementById('t-skills');
  if (tsk) tsk.placeholder = t('ue_phSkills');
  setT('ue-sec-docs-p-title', 'ue_secDocsP');
  setT('ue-sec-docs-pro-title', 'ue_secDocsPro');
  setT('btn-add-doc-p', 'ue_btnAddDoc');
  setT('btn-add-doc-pro', 'ue_btnAddDoc');
  ['sec-docs-p', 'sec-docs-pro'].forEach((sec) => {
    const tbl = document.querySelector(`#${sec} thead tr`);
    if (!tbl) return;
    [...tbl.querySelectorAll('th')].forEach((th, i) => {
      if (UE_DOC_TH_KEYS[i]) th.textContent = t(UE_DOC_TH_KEYS[i]);
    });
  });
  setT('ue-sec-schedule-title', 'ue_secSchedule');
  setH('ue-schedule-intro', 'ue_scheduleIntro_html');
  setT('ue-sec-regions-title', 'ue_secRegions');
  setH('ue-regions-intro', 'ue_regionsIntro');
  setT('sec-audit-desc', 'ue_auditDesc');
  const ath = document.querySelector('#sec-audit thead tr');
  if (ath) {
    const ak = ['ue_auditThWhen', 'ue_auditThAction', 'ue_auditThAdmin', 'ue_auditThDetail'];
    [...ath.querySelectorAll('th')].forEach((th, i) => {
      if (ak[i]) th.textContent = t(ak[i]);
    });
  }
  const audLoad = document.getElementById('ue-audit-loading-td');
  if (audLoad) audLoad.textContent = t('ue_auditLoading');
  setT('elevate-lbl-email', 'ue_elevateLblEmail');
  setT('elevate-confirm-btn', 'ue_elevateConfirm');
  document.querySelectorAll('[data-close-elevate]').forEach((b) => {
    if (b.classList.contains('btn-ghost')) b.textContent = t('ul_cancel');
  });
  document.querySelectorAll('[data-close-matrix]').forEach((b) => {
    if (b.classList.contains('btn-primary')) b.textContent = t('ue_matrixOk');
  });
  const fr = document.getElementById('f-role');
  if (fr) {
    const keys = ['USER', 'PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];
    [...fr.options].forEach((op, i) => {
      if (keys[i]) op.textContent = t(`ul_role_${keys[i]}`);
    });
  }
  const ueLoc = document.getElementById('ue-panel-locale');
  if (ueLoc && ueLoc.options.length >= 3) {
    ueLoc.options[0].textContent = t('localePt');
    ueLoc.options[1].textContent = t('localeEn');
    ueLoc.options[2].textContent = t('localeEs');
  }
  setT('ue-locale-label', 'localeLabel');
  const pref = document.getElementById('f-preferred-locale');
  if (pref) {
    [...pref.options].forEach((op) => {
      const v = op.value;
      if (v === '') op.textContent = t('ue_prefLocaleDefault');
      else if (v === 'pt-BR') op.textContent = t('localePt');
      else if (v === 'en-US') op.textContent = t('localeEn');
      else if (v === 'es-ES') op.textContent = t('localeEs');
    });
  }
}
