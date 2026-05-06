/**
 * Textos do Forms Builder (painel admin), pt-BR, en-US, es-ES e de-DE.
 * Preferência: `getAdminUiLocale()` (localStorage `aria_admin_ui_locale`; padrão pt-BR).
 * O seletor «Rótulos (edição)» (`window.__formSchemaEditLocale`) afeta só textos do **canvas**
 * via `fbTCanvas` — o chrome do painel continua no idioma do admin.
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const LS_LOCALE = 'aria_admin_ui_locale';

const FB_CHECKLISTS_SYNC_LOCALES = new Set(['pt-BR', 'en-US', 'es-ES', 'de-DE']);

/** Locale do canvas (rótulos / pré-visualização do bloco central) — segue o seletor de schema, não o idioma do painel. */
function formBuilderCanvasUiLocale() {
  try {
    if (typeof window !== 'undefined' && window.__formSchemaEditLocale) {
      const o = String(window.__formSchemaEditLocale).trim();
      if (FB_CHECKLISTS_SYNC_LOCALES.has(o)) return o;
    }
  } catch {
    /* ignore */
  }
  return getAdminUiLocale();
}

const M = {
  'pt-BR': {
    fb_pageTitle: 'Aria Admin, Forms Builder',
    fb_bc_panel: 'Painel',
    fb_bc_builder: 'Forms Builder',
    fb_hero_title: 'Forms Builder',
    fb_hero_sub:
      'Monte o schema do formulário para o app: campos, regras, ícone e navegação por seções. Use o painel retrátil abaixo para título, descrição pública, estado e atalhos do app.',
    fb_meta_summary_hint: 'Título, descrição, estado e opções do app',
    fb_meta_summary_fallback: 'Sem título',
    fb_open: 'Abrir formulário',
    fb_open_title: 'Ver formulários salvos',
    fb_new: 'Criar novo',
    fb_new_title: 'Novo formulário em branco',
    fb_import_title: 'Importar JSON',
    fb_export_title: 'Exportar schema (transferência)',
    fb_copilot: 'Composer',
    fb_copilot_title: 'Composer: ajustar formulário, regras e ícones com IA',
    fb_preview: 'Pré-visualização no app',
    fb_geofence: 'Cerca global',
    fb_duration: 'Tempo do formulário',
    fb_duration_title:
      'Minutos previstos só do preenchimento (sem deslocamento), usados no despacho',
    fb_save: 'Salvar formulário',
    fb_save_title: 'Salva o modelo no navegador e envia para a API quando disponível',
    fb_unsaved: 'Alterações não salvas',
    fb_unsaved_leave: 'Há alterações não salvas. Sair mesmo assim?',
    fb_save_saving: 'Salvando…',
    fb_save_local_ok: 'Salvo localmente',
    fb_save_cloud_ok: 'Na nuvem e na app',
    fb_toolbox_title: 'Campos dinâmicos',
    fb_toolbox_filter_ph: 'Filtrar tipos de campo…',
    fb_toolbox_tablist_aria: 'Categorias de campos na palette',
    fb_cat_basic: 'Básicos',
    fb_cat_premium: 'Dinâmicos',
    fb_cat_wfm: 'Rastreamento',
    fb_cat_audit: 'Evidências',
    fb_cat_launches: 'Lançamentos',
    fb_cat_ai: 'IA',

    fb_tb_text: 'Resposta em texto',
    fb_tb_number: 'Entrada numérica',
    fb_tb_currency: 'Moeda (valor monetário)',
    fb_tb_email: 'E-mail',
    fb_tb_phone: 'Telefone / celular',
    fb_tb_date: 'Data / hora',
    fb_tb_checkbox: 'Caixa de seleção',
    fb_tb_yes_no: 'Sim / não (alternar)',
    fb_tb_dropdown: 'Lista (dropdown)',
    fb_tb_multiselect: 'Múltipla escolha',
    fb_tb_rating: 'Avaliação (estrelas)',
    fb_tb_lookup_select: 'Lista dinâmica (servidor / JSON)',
    fb_tb_repeatable_matrix: 'Matriz repetível (tabela)',
    fb_tb_opinion_scale: 'Escala NPS / Likert',
    fb_tb_image_annotation: 'Foto com anotações',
    fb_tb_calculated: 'Campo calculado (expressão)',
    fb_tb_hidden: 'Campo oculto',
    fb_tb_transit_start: 'Iniciar deslocamento',
    fb_tb_transit_end: 'Finalizar deslocamento',
    fb_tb_geofence_check: 'Validar cerca (geofence)',
    fb_tb_location_pick: 'Localização (GPS + mapa)',
    fb_tb_file_upload: 'Anexar arquivo',
    fb_tb_photo: 'Foto (galeria livre)',
    fb_tb_photo_stamped: 'Foto carimbada (ao vivo)',
    fb_tb_barcode_scan: 'Escanear etiqueta / ativo',
    fb_tb_materials_consumption: 'Materiais / consumo (estoque técnico)',
    fb_tb_materials_receipt: 'Materiais / entrada (estoque técnico)',
    fb_tb_technician_finance_expense: 'Despesas do técnico',
    fb_tb_technician_finance_revenue: 'Receitas do técnico',
    fb_tb_signature: 'Assinatura',
    fb_tb_signature_summary: 'Resumo para assinatura · Signature summary',
    fb_tb_leitura: 'Leitura',
    fb_tb_form_complete_button: 'Botão concluir (FT / OS)',
    fb_tb_voice_note: 'Nota de voz',
    fb_tb_facial_recognition: 'Reconhecimento facial',
    fb_tb_vision_checklist: 'Visão de IA, detecção',
    fb_tb_vision_ai_analysis: 'Visão de IA, análise',
    fb_tb_vision_ai_comparison: 'Visão de IA, comparação',

    fb_canvas_section_prefix: 'Seção ·',
    fb_canvas_preamble_title: 'Área Externa',
    fb_canvas_fields_one: '{n} campo',
    fb_canvas_fields_many: '{n} campos',
    fb_canvas_questions_one: '{n} pergunta',
    fb_canvas_questions_many: '{n} perguntas',
    fb_canvas_questions_list_suffix: ' · lista',
    fb_canvas_new_step: 'Nova etapa',
    fb_canvas_step_n: 'Etapa {n}',
    fb_canvas_aria_toggle_section: 'Recolher ou expandir esta seção',
    fb_canvas_step_edit_title: 'Clique para editar o nome e o ícone desta etapa',
    fb_canvas_section_props: 'Propriedades da seção',
    fb_canvas_section_logic: 'Lógica e regras',
    fb_canvas_section_dup: 'Duplicar seção',
    fb_canvas_section_del: 'Excluir seção',
    fb_canvas_step_req_required: 'Etapa obrigatória, clique para tornar opcional',
    fb_canvas_step_req_optional: 'Etapa opcional, clique para tornar obrigatória',
    fb_canvas_add_section: 'Nova seção',
    fb_props_kind_section: 'Etapa / seção',

    fb_prop_pick_gear_hint:
      'Clique na engrenagem de um campo ou de uma etapa para editar as propriedades.',
    fb_prop_label_section_title: 'Nome da etapa ou seção (como aparece no app móvel)',
    fb_prop_label_question_panel: 'Rótulo da pergunta no painel (técnico vê no app)',
    fb_prop_internal_id: 'ID interno do campo (slug)',
    fb_prop_internal_id_copy_title: 'Copie isso para usar em fórmulas',
    fb_prop_textmask_title: 'Máscara dinâmica (opcional)',
    fb_prop_textmask_ph: 'Ex.: ##/##/#### (data)',
    fb_prop_textmask_hint:
      'Use "#" para cada dígito ou letra que o app tentará formatar enquanto o técnico digita. Deixe vazio para texto livre.',
    fb_prop_signature_summary_fields_title: 'Campos no resumo (ordem = ordem no formulário)',
    fb_prop_signature_summary_fields_help:
      'No app, estes valores aparecem num único bloco <b>acima</b> da zona de assinatura. Na raiz, o app também procura valores em <b>seções repetíveis</b> (primeira ocorrência com texto). Dentro de uma linha repetível, usa-se o contexto dessa linha.',
    fb_prop_signature_summary_none_eligible: 'Nenhum campo disponível para incluir.',
    fb_prop_signature_summary_select_all: 'Selecionar todos',
    fb_prop_signature_summary_clear_all: 'Limpar seleção',
    fb_prop_section_app_view_title: 'Como o técnico vê esta etapa (app)',
    fb_prop_section_fill_list_title: 'Lista com scroll',
    fb_prop_section_fill_list_desc: 'Todos os campos desta seção visíveis com scroll.',
    fb_prop_section_fill_wizard_title: 'Um campo de cada vez',
    fb_prop_section_fill_wizard_desc: 'Assistente: Próximo / Voltar só dentro desta seção.',
    fb_prop_section_legacy_inherit:
      'Legado: «seguir global», o app usa ainda <code>appFillMode</code> no JSON até escolher uma opção acima.',
    fb_prop_section_repeat_chk: 'Repetir esta seção (lista)',
    fb_prop_section_repeat_help:
      'O técnico pode preencher <b>várias instâncias</b> seguidas dos mesmos campos (ex.: vários equipamentos). Cada linha grava um objeto no array <b>__section_repeat_&lt;id&gt;</b> na execução. Use mín./máx. para limitar quantas instâncias.',
    fb_prop_min_instances_sec: 'Mín. instâncias (vazio = 0)',
    fb_prop_max_instances_sec: 'Máx. instâncias (vazio = ilimitado)',
    fb_ph_instance_example: 'ex.: {n}',
    fb_prop_reading_title: 'Texto da leitura (rich text)',
    fb_prop_reading_intro:
      'Exibido no app como <strong>só leitura</strong> (scroll com o formulário). <strong>Links não são permitidos</strong>, são removidos ao editar.',
    fb_prop_instructions_title: 'Instruções ao técnico (rich text, opcional)',
    fb_prop_instructions_show_title: 'Mostrar instruções no celular do técnico',
    fb_prop_instructions_show_aria: 'Mostrar instruções no app móvel',
    fb_quill_help_placeholder:
      'Texto e imagens que o técnico consulta no app (botão «Instruções»).',
    fb_quill_reading_placeholder:
      'Texto formatado exibido no app (só leitura). Links não são permitidos.',
    fb_prop_default_value_lbl: 'Auto-preenchimento / valor padrão (opcional)',
    fb_prop_default_value_ph: 'Use tags como {{user.name}}, {{date}}',
    fb_prop_required_q: 'Resposta obrigatória?',
    fb_prop_leitura_block_note:
      'Este bloco <strong>não coleta resposta</strong> no app, serve apenas para o técnico ler (contratos, avisos, etc.).',
    fb_prop_form_complete_btn_note:
      'No app, este bloco mostra um <strong>botão</strong> que faz o mesmo que o botão principal do rodapé (avançar, voltar ao menu de etapas ou <strong>concluir a OS</strong>). O texto do botão é o <strong>rótulo</strong> acima; se estiver vazio, o app usa o texto padrão do rodapé. Pode colocar o campo na <strong>Área Externa</strong> ou dentro de qualquer etapa.',
    fb_prop_repeat_field_title: 'Várias respostas (lista)',
    fb_prop_repeat_field_help:
      'O app grava um <b>array</b> na execução para este campo (texto, opções, fotos, assinaturas, etc.). Compatível com formulários antigos (valor único continua sendo string ou valor único).',
    fb_prop_min_items_field: 'Mín. itens (vazio = padrão)',
    fb_prop_max_items_field: 'Máx. itens (vazio = ilimitado)',
    fb_prop_media_comment_title: 'Comentário opcional por foto / arquivo',
    fb_prop_media_comment_help:
      'Diferente do comentário geral do campo: aqui o técnico pode comentar cada foto, captura ou anexo (câmera, galeria ou arquivo). Tudo opcional.',
    fb_prop_tech_comment_title: 'Comentário do técnico (opcional no app)',
    fb_prop_tech_comment_help:
      'Mostra uma caixa de texto livre abaixo da resposta no app. Complementa as instruções ao técnico (não as substitui).',
    fb_prop_online_validation_title: 'Exigir validação apenas online?',
    fb_prop_online_validation_face:
      'No reconhecimento facial: <b>desmarcado</b> permite capturar offline e envia a biometria ao servidor quando houver rede. <b>Marcado</b> exige internet e match imediato.',
    fb_prop_online_validation_vision:
      'Na visão IA: <b>desmarcado</b> permite capturar pela câmera sem rede e tentar análise quando houver rede. <b>Marcado</b> exige internet no envio ao servidor.',
    fb_prop_vision_ai_structured_prompt_hint:
      'Descreva critérios da sua operação, o que conta como boa ou má evidência e o que a IA deve observar na mídia. Limite aproximado de {max} caracteres. A API responde em JSON com <code>answers</code> (ex.: <code>q1</code>); o modelo padrão usa <code>value</code> como string de "0" a "10" ou <code>unknown</code>. Com a classificação 0–10 ativada acima, a raiz inclui também <code>rating0To10</code> (inteiro alinhado à mesma nota).',
    fb_prop_online_validation_voice:
      'Nota de voz: a transcrição (Whisper) é <b>sempre no servidor</b>. <b>Desmarcado</b> = pode gravar offline mas precisa de rede ao «Parar e transcrever». <b>Marcado</b> = exige internet no envio.',
    fb_prop_online_validation_lookup:
      'Com preset no servidor: <b>desmarcado</b> permite abrir o campo offline se as opções já tiverem sido obtidas antes. <b>Marcado</b> exige internet ao abrir o campo para carregar o preset.',
    fb_prop_online_validation_generic:
      'Se ativado, bloqueia o preenchimento caso o dispositivo esteja sem internet no momento. Caso contrário, permite modo assíncrono (validado depois), quando aplicável.',

    fb_prop_tech_finance_title: 'PDF e compartilhamento com o cliente',
    fb_prop_tech_finance_help_html:
      'Por padrão, <strong>este campo não entra no PDF geral</strong>. No construtor de relatório PDF (Relatórios), só passa a constar se ativar a visibilidade para este campo. Ao fazê-lo, <strong>informações que podem corresponder a custos operacionais internos do técnico poderão ficar disponíveis ao cliente</strong> ou a quem receber o documento, confirme sempre o preset antes de compartilhar.',

    fb_prop_geofence_title: 'Configurações da cerca eletrônica',
    fb_prop_geofence_zone_type_lbl: 'Tipo de zona',
    fb_prop_geofence_opt_radius: 'Destino da OS (ponto + raio Haversine)',
    fb_prop_geofence_opt_polygon: 'Geometria da OS (rota, área, polígono / KML no despacho)',
    fb_prop_geofence_hint_radius:
      'Validação face ao destino da OS: distância em linha reta (Haversine) do GPS ao ponto da OS; o raio abaixo é predefinição se a OS não fixar outro no despacho.',
    fb_prop_geofence_hint_polygon:
      'Validação face à geometria do despacho: polígono (área), corredor de rota (KML) ou extremos A/B (trecho). Os valores abaixo são predefinição quando a OS não trouxer tolerância.',
    fb_prop_geofence_radius_lbl: 'Raio de aceitação (metros)',
    fb_prop_geofence_radius_help:
      'Padrão do formulário quando a OS não define raio no despacho; se a OS tiver raio, esse valor prevalece.',
    fb_prop_geofence_dest_radius_lbl: 'Raio de aceitação (metros)',
    fb_prop_geofence_dest_radius_help:
      'Predefinição se a OS não fixar raio no despacho; caso contrário prevalece o da OS.',
    fb_prop_geofence_geom_tol_lbl: 'Corredor da rota / polilinha (metros)',
    fb_prop_geofence_geom_tol_help:
      'Rota, patrulhamento ou KML em linha: distância máxima do GPS ao traçado (evitar desvio do caminho). Predefinição se a OS não fixar tolerância no despacho.',
    fb_prop_geofence_seg_buf_lbl: 'Tolerância nos extremos A↔B (metros)',
    fb_prop_geofence_seg_buf_help:
      'Só quando o despacho usa zona «trecho» (dois pontos A e B): distância máxima até A ou até B. Não substitui o corredor da rota acima, seguir linha/polilinha é sempre o campo de cima.',
    fb_prop_geofence_fail_mode_lbl: 'Modo de falha',
    fb_prop_geofence_fail_block: 'Bloquear, impede avanço do formulário',
    fb_prop_geofence_fail_warn: 'Apenas alertar, registra desvio e continua',
    fb_prop_geofence_fail_allow_warn: 'Registrar e permitir, alerta se fora da zona',
    fb_prop_geofence_fail_record_only: 'Só registro, fora/dentro sem bloquear',
    fb_prop_geofence_unblock_reentry:
      'Com bloqueio: liberar automaticamente ao voltar à zona permitida (GPS em segundo plano)',
    fb_prop_geofence_error_msg_lbl: 'Mensagem de erro customizada (opcional)',
    fb_prop_geofence_error_msg_ph: 'Ex.: Você está fora da área de serviço autorizada.',

    fb_prop_transit_screen_title: 'Tela durante o deslocamento',
    fb_prop_transit_keep_awake_lbl: 'Manter a tela sempre acesa até finalizar o deslocamento',
    fb_prop_transit_keep_awake_help_html:
      'O equipamento pode consumir mais bateria, mas tende a aumentar a precisão e a continuidade da coleta de GPS enquanto o deslocamento estiver em curso (mapa visível ou minimizado). A opção desliga automaticamente ao tocar em <strong>Finalizar deslocamento</strong>.',
    fb_prop_transit_reimbursement_lbl: 'Apenas registro de deslocamento durante a atividade',
    fb_prop_transit_reimbursement_help:
      'Registra só a trilha GPS no app. Sem ETA, sem chat com o cliente e sem página de acompanhamento, use um segundo par início/fim depois do deslocamento operacional.',
    fb_prop_transit_dest_os_lbl: 'Destino: local de atendimento da OS (ETA, mapa, acompanhamento)',
    fb_prop_transit_patrol_lbl: 'Patrulhamento (trajeto KML / geometria da OS no mapa)',
    fb_prop_transit_patrol_help:
        'O mapa de deslocamento usa a polilinha ou zona enviada no despacho (ex.: KML). Indicado para seguir o percurso planejado sem assumir o destino como «serviço no cliente».',
    fb_prop_transit_purpose_title: 'Finalidade deste início de deslocamento',
    fb_prop_transit_first_default_hint:
      'O primeiro «Iniciar deslocamento» do formulário vem por padrão com destino na OS, indicado para o deslocamento até o local de atendimento.',
    fb_prop_transit_vs_geofence_help:
      'Deslocamento (transit) registra trilha e tempos; a cerca eletrônica (campo à parte) é a prova de entrada na área de serviço.',

    fb_prop_location_pick_title: 'Localização (GPS + mapa)',
    fb_prop_location_pick_help:
      'No app, o técnico obtém o GPS do dispositivo e pode mover o alfinete no mapa. A resposta salva as duas posições em JSON (relatório e exportações).',

    fb_prop_photo_stamped_warn_title: 'Modo anti-fraude obrigatório',
    fb_prop_photo_stamped_warn_body: 'A galeria do celular ficará bloqueada. Câmera ao vivo exigida.',

    fb_prop_facial_title: 'Biometria e IA obrigatórias',
    fb_prop_facial_intro:
      'A foto tirada será comparada com a foto de perfil do técnico usando o motor de IA selecionado nas integrações do sistema.',
    fb_prop_facial_engine_note_html:
      'O motor de reconhecimento (FaceMatch, automático ou AWS) é definido por <b>plano</b> em <b>Planos e assinaturas</b> → botão «Biometria / API» em cada cartão de plano. Padrão: FaceMatch.',
    fb_prop_facial_mode_lbl: 'Modo de validação biométrica',
    fb_prop_facial_mode_self: 'Provar identidade do usuário logado (ponto / OS)',
    fb_prop_facial_mode_identify: 'Identificar qualquer usuário matriculado (mesmo tenant)',
    fb_prop_facial_identify_help:
      'Em «identificar», qualquer usuário com sessão na app pode preencher o campo: o rosto é comparado à galeria FaceMatch e o servidor devolve nome e e-mail de quem for reconhecido no <b>mesmo tenant</b> da sessão. Quem é identificado <b>não</b> precisa estar logado na app.',
    fb_prop_facial_camera_note: 'A captura facial na app usa sempre a câmera do sistema (alta resolução).',

    fb_prop_vision_title_analysis_html:
      '<ion-icon name="sparkles-outline" style="color:#b91c1c"></ion-icon> <span style="color:#dc2626;font-weight:900">Visão de IA, análise</span>',
    fb_prop_vision_title_detection_html:
      '<ion-icon name="videocam-outline"></ion-icon> Visão de IA, detecção',
    fb_prop_vision_body_analysis_html:
      'No app, o técnico usa <b>só a câmera</b>, sem galeria nem escolha de arquivo. O servidor Aria chama a API <b>Gemini</b> com a integração <b>Google AI Studio</b> (chave e modelo em Integrações). O texto abaixo é um <b>único prompt estruturado</b>; a resposta traz nota de 0 a 10 em <code>answers[0].value</code> (string), confiança e racional. Com «Classificação 0–10» ativada (recomendado), a raiz do JSON inclui também <code>rating0To10</code>.',
    fb_prop_vision_body_detection_html:
      'No app, o técnico usa <b>só a câmera</b>, sem galeria nem escolha de arquivo. O servidor chama a integração <b>Visão IA - Moondream</b> (API de pergunta sobre imagem) ou encaminha ao proxy <b>Visão IA - YOLO</b>, conforme a preferência do tenant em Integrações / conta. Abaixo define-se <b>um único critério</b> em linguagem natural (estilo semelhante à «Visão de IA, análise»); a resposta normalizada traz <code>answers[0].value</code> (<code>yes</code> / <code>no</code> / <code>unknown</code>), confiança e racional.',
    fb_prop_vision_detection_prompt_lbl: 'Prompt (sim/não)',
    fb_prop_vision_detection_prompt_hint:
      'Um <b>único</b> critério por envio de mídia (até <b>{maxSingle}</b> caracteres), em texto livre como no campo de análise. O backend devolve o mesmo envelope JSON (<code>answers</code> com <code>q1</code>, <code>value</code>, <code>confidence</code>, <code>rationale</code>) com valor <code>yes</code>, <code>no</code> ou <code>unknown</code>.',
    fb_prop_vision_default_structured_prompt:
      'Contexto: inspeção visual de uma etapa executada em campo (foto ou vídeo único).\n\n' +
      'Tarefa:\n' +
      '1) Atribua uma nota inteira de 0 a 10 à aderência da evidência visual aos critérios desta etapa da OS.\n' +
      '2) Baseie-se apenas no visível: presença do item ou serviço esperado, estado aparente, organização e gravidade de eventuais não conformidades.\n\n' +
      'Campo value (obrigatório):\n' +
      '- Envie somente os dígitos de um inteiro entre 0 e 10, como string (ex.: "7").\n' +
      '- Ou envie exatamente unknown se a mídia for insuficiente, o alvo não estiver identificável ou houver ambiguidade relevante.\n\n' +
      'Rubrica orientativa:\n' +
      '- 0–2: inaceitável ou evidência irrelevante; não conformidade grave ou evidente.\n' +
      '- 3–4: vários problemas visíveis ou qualidade fraca da evidência.\n' +
      '- 5–6: aceitável com ressalvas; melhorias necessárias.\n' +
      '- 7–8: bom estado geral; apenas falhas leves.\n' +
      '- 9–10: excelente; critérios da etapa inequivocamente atendidos.\n\n' +
      'No rationale, em 2–4 frases curtas em pt-BR, diga o que foi observado e o que mais pesou na nota.',
    fb_prop_vision_prompt_placeholder:
      'Contexto: inspeção visual de uma etapa executada em campo (foto ou vídeo único).\n\n' +
      'Tarefa:\n' +
      '1) Atribua uma nota inteira de 0 a 10 à aderência da evidência visual aos critérios desta etapa da OS.\n' +
      '2) Baseie-se apenas no visível: presença do item ou serviço esperado, estado aparente, organização e gravidade de eventuais não conformidades.\n\n' +
      'Campo value (obrigatório):\n' +
      '- Envie somente os dígitos de um inteiro entre 0 e 10, como string (ex.: "7").\n' +
      '- Ou envie exatamente unknown se a mídia for insuficiente, o alvo não estiver identificável ou houver ambiguidade relevante.\n\n' +
      'Rubrica orientativa:\n' +
      '- 0–2: inaceitável ou evidência irrelevante; não conformidade grave ou evidente.\n' +
      '- 3–4: vários problemas visíveis ou qualidade fraca da evidência.\n' +
      '- 5–6: aceitável com ressalvas; melhorias necessárias.\n' +
      '- 7–8: bom estado geral; apenas falhas leves.\n' +
      '- 9–10: excelente; critérios da etapa inequivocamente atendidos.\n\n' +
      'No rationale, em 2–4 frases curtas em pt-BR, diga o que foi observado e o que mais pesou na nota.',
    fb_prop_vision_default_detection_prompt:
      'Contexto: inspeção visual de uma etapa executada em campo (foto ou vídeo único; em vídeo o backend usa um frame como imagem).\n\n' +
      'Tarefa:\n' +
      '1) Com base apenas no visível, o critério abaixo deve ser avaliado de forma binária para este ponto da OS.\n' +
      '2) Descreva no critério o que deve ser verificado (presença, ausência, estado, EPI, ordem, etc.).\n\n' +
      'Critério (identificador q1):\n' +
      '[Edite aqui, ex.: «Há pelo menos um extintor de incêndio claramente visível e aparentemente acessível na área fotografada?»]\n\n' +
      'Resposta esperada no app: o servidor normaliza para yes, no ou unknown em answers[0].value, com confiança e racional (integração «Visão IA - Moondream» ou proxy «Visão IA - YOLO», conforme o tenant).',
    fb_prop_vision_rating_chk_lbl: 'Classificação 0–10 (preenchida pela API após a análise)',
    fb_prop_vision_rating_hint_html:
      'Com esta opção, a API devolve <code>rating0To10</code> na raiz do JSON (inteiro de 0 a 10, ou <code>null</code> se não for possível). O app mostra a nota junto ao resultado e nos relatórios.',
    fb_prop_vision_show_ai_chk_lbl: 'Mostrar detalhes da resposta da IA no app',
    fb_prop_vision_show_ai_hint:
      'Desmarque para ocultar no formulário do técnico o texto da resposta, confiança, racional e bloco de classificação 0–10 (a mídia e o estado «concluído» mantêm-se). Relatórios e resumo de assinatura podem continuar mostrando os dados.',
    fb_prop_vision_comparison_show_ref_chk_lbl: 'Mostrar foto de referência ao técnico no app',
    fb_prop_vision_comparison_show_ref_hint:
      'Se desmarcar, o prestador não vê a miniatura da referência no formulário; a imagem continua a ser enviada ao servidor para comparar com a captura em campo.',
    fb_prop_vision_grid_lbl: 'Grade de fotos (composição única antes do envio)',
    fb_prop_vision_grid_help:
      'Só <b>1×1</b> ou <b>2×2</b>. Com mais de uma célula, o app exige <b>todas</b> as fotos (câmera) antes de analisar; só <b>foto</b> (sem vídeo). Modelos antigos com grade maior passam a <b>2×2</b> ao salvar.',
    fb_prop_vision_grid_opt_1x1: '1 foto, 1×1',
    fb_prop_vision_grid_opt_2x2: '4 fotos, 2×2',
    fb_prop_vision_capture_lbl: 'Tipo de captura pela câmera',
    fb_prop_vision_capture_photo_only: 'Somente foto',
    fb_prop_vision_capture_video_only: 'Somente vídeo',
    fb_prop_vision_capture_photo_video: 'Foto e vídeo',
    fb_prop_vision_video_max_hint:
      'Na app, em campos de Visão de IA (detecção ou análise), cada vídeo tem no máximo 10 segundos; clips mais longos são recusados. Na detecção, o envio ao servidor usa uma imagem extraída do primeiro instante do vídeo (Moondream e o proxy YOLO recebem só imagem).',
    fb_prop_vision_prompt_lbl: 'Prompt estruturado (único)',
    fb_vision_prompt_ex_btn: 'Exemplos',
    fb_vision_prompt_ex_btn_title: 'Modelos de prompt para serviços de campo (Visão de IA, análise)',
    fb_vision_prompt_ex_modal_title: 'Exemplos de prompt estruturado',
    fb_vision_prompt_ex_modal_intro:
      'Escolha um modelo para preencher o campo. Ajuste depois ao seu checklist. Em campos novos, «Classificação 0–10» vem ativada por padrão para a API devolver <code>rating0To10</code> alinhado à nota em <code>value</code>; desative nas propriedades se não precisar.',
    fb_vision_prompt_ex_apply: 'Aplicar ao campo',
    fb_vision_prompt_ex_close: 'Fechar',
    fb_vision_prompt_ex_area_lbl: 'Área / setor',
    fb_vision_prompt_ex_empty_filter: 'Nenhum modelo nesta área. Escolha «Todas as áreas» ou outro setor.',
    fb_vision_prompt_ex_catalog_missing:
      'Catálogo de exemplos não carregado. Recarregue a página do Forms Builder (o script visionAiAnalysisPromptExamplesData.js deve estar disponível).',
    fb_vision_detection_ex_btn_title: 'Modelos de prompt (Visão de IA, detecção)',
    fb_vision_detection_ex_modal_title: 'Modelos de prompt para detecção',
    fb_vision_detection_ex_modal_intro:
      'Cada modelo inclui contexto, tarefa, critério (q1) e nota sobre <code>answers[0]</code>, o mesmo molde do prompt padrão do campo. Adapte o critério ao seu checklist. Um envio de mídia por critério; Moondream ou o proxy YOLO normalizam sim/não em <code>answers[0].value</code>. Para contagem, diga o que deve ser ignorado.',
    fb_vision_detection_ex_catalog_missing:
      'Catálogo de exemplos não carregado. Recarregue a página do Forms Builder (o script visionDetectionPromptExamplesData.js deve estar disponível).',

    fb_prop_voice_title: 'Nota de voz',
    fb_prop_voice_help_html:
      'A transcrição usa <b>OpenAI Whisper</b> no servidor (mesma <b>API key</b> da integração «OpenAI» em Integrações). O técnico precisa de <b>internet</b> ao tocar em «Parar e transcrever».',
    fb_prop_voice_lang_lbl: 'Idioma (Whisper)',
    fb_prop_voice_lang_hint:
      'Lista derivada dos <b>perfis regionais ativos</b> na plataforma (SaaS). Opcional, mas ajuda com sotaque e ruído.',

    fb_prop_file_upload_title: 'Anexar arquivo (app)',
    fb_prop_file_upload_help:
      'Máximo <b>50 MB</b> por arquivo. O app bloqueia executáveis, scripts e outros tipos habitualmente perigosos; documentos e arquivos correntes (PDF, Office, imagens, ZIP etc.) são aceitos.',

    fb_prop_image_annot_title: 'Foto com anotações',
    fb_prop_image_annot_help:
      'No app, o técnico escolhe câmera ou galeria e pode desenhar por cima da imagem. O valor salvo é JSON (URI local + traços normalizados).',
    fb_prop_image_annot_pen_lbl: 'Cor do traço',
    fb_prop_image_annot_width_lbl: 'Espessura (1–24)',

    fb_prop_lookup_title: 'Lista dinâmica',
    fb_prop_lookup_source_lbl: 'Origem',
    fb_prop_lookup_src_preset: 'Preset no servidor (GET com sessão)',
    fb_prop_lookup_src_api: 'Endpoint da API (GET com sessão)',
    fb_prop_lookup_src_inline: 'JSON no modelo (sem rede)',
    fb_prop_lookup_preset_lbl: 'Preset',
    fb_prop_lookup_api_path_lbl: 'Caminho da API',
    fb_prop_lookup_api_path_help:
      'Use caminho relativo da API do backend (ex.: /api/checklists/lookup-options/equipamentos_demo). Resposta esperada: { options:[{value,label}] } ou array direto.',
    fb_prop_lookup_json_lbl: 'JSON (array de pares value / label)',

    fb_prop_matrix_title: 'Matriz repetível',
    fb_prop_matrix_intro_html:
      'Defina até 8 colunas com nome e tipo. No app o técnico preenche várias linhas numa tabela; os dados guardam-se em JSON.',
    fb_prop_matrix_cols_ui_lbl: 'Colunas da tabela',
    fb_prop_matrix_col_label_ph: 'Nome da coluna no app (ex.: Item)',
    fb_prop_matrix_type_text: 'Texto',
    fb_prop_matrix_type_number: 'Número',
    fb_prop_matrix_type_yesno: 'Sim / Não',
    fb_prop_matrix_add_col: 'Adicionar coluna',
    fb_prop_matrix_remove_col: 'Remover coluna',
    fb_prop_matrix_col_empty_fallback: 'Coluna {n}',
    fb_prop_matrix_json_adv: 'Avançado, editar JSON',
    fb_prop_matrix_json_adv_hint:
      'Ao sair deste campo, o JSON substitui a grelha acima. Use só se souber o formato.',
    fb_prop_matrix_cols_lbl: 'Colunas (JSON)',
    fb_prop_matrix_min_rows: 'Mín. linhas',
    fb_prop_matrix_max_rows: 'Máx. linhas',

    fb_prop_opinion_title: 'Escala NPS / Likert',
    fb_prop_opinion_mode_lbl: 'Modo',
    fb_prop_opinion_mode_nps: 'NPS (0 a 10)',
    fb_prop_opinion_mode_likert: 'Likert (5 níveis)',
    fb_prop_opinion_likert_lbl: 'Rótulos Likert (um por linha, até 5)',

    fb_prop_list_options_lbl: 'Opções da lista (separe por vírgula)',

    fb_prop_calc_title: 'Expressão matemática do sistema',
    fb_prop_calc_ph: 'Ex.: field_123 + field_456',
    fb_prop_calc_help:
      'Variáveis: use o ID sublinhado de outros blocos (ex.: field_111 * field_222) ou use "Math.sqrt(field_111)" para fórmulas puras.',
    fb_prop_calc_insert_field_lbl: 'Inserir campo (no cursor)',
    fb_prop_calc_field_placeholder: 'Escolher campo…',
    fb_prop_calc_op_placeholder: 'Inserir operador ou função…',
    fb_prop_calc_op_group_arith: 'Operadores',
    fb_prop_calc_op_group_math: 'Math',
    fb_prop_calc_ops_lbl: 'Operadores e funções',
    fb_prop_calc_display_lbl: 'Formato do resultado',
    fb_prop_calc_display_auto:
      'Automático — moeda se a fórmula só usar IDs de campos «moeda»; caso contrário, número.',
    fb_prop_calc_display_number: 'Número (preferências do app)',
    fb_prop_calc_display_currency: 'Moeda (locale do app)',
    fb_prop_calc_display_percent:
      'Percentagem — o valor da expressão é tratado como fração (ex.: 0,15 → 15%).',

    fb_canvas_panel: 'Canvas do formulário',
    fb_schema_locale_hint: 'Rótulos (edição)',
    fb_schema_locale_select_title:
      'Idioma em que edita e grava os rótulos no JSON. Só o canvas (centro) usa este idioma para textos de UI; o resto do painel segue o idioma da conta.',
    fb_schema_copy_primary: 'Copiar de pt-BR',
    fb_schema_copy_primary_title:
      'Copia o texto em pt-BR de cada campo/etapa para o idioma de edição atual (útil como base para rever ou traduzir).',
    fb_schema_auto_translate_lbl: 'Traduzir ao mudar idioma (vazios ou ainda iguais ao pt-BR)',
    fb_schema_auto_translate_title:
      'Se estiver ligado: ao escolher EN/ES/DE, o builder pede tradução (MyMemory) para cada rótulo em que o destino está vazio ou ainda é o mesmo texto que em pt-BR — por exemplo depois de «Copiar de pt-BR». Não substitui um texto em inglês (ou outro) que já seja diferente do português. Pode falhar: rede, quota MyMemory ou bloqueio do browser.',
    fb_schema_translate_now: 'Traduzir agora',
    fb_schema_translate_now_loading: 'A traduzir…',
    fb_schema_translate_now_title:
      'Executa já a tradução automática para o idioma selecionado (útil se abriu o formulário e os rótulos continuaram em português).',
    fb_canvas_loading:
      'Carregando o canvas… Pode colocar campos na «Área Externa» ou dentro de cada etapa; arraste da barra lateral.',
    fb_label_form_title: 'Título do formulário',
    fb_placeholder_form_title: 'Ex.: Vistoria cautelar',
    fb_label_form_active: 'Formulário ativo',
    fb_hint_form_active:
      'Desmarcado: o modelo fica inativo, não aparece no despacho de OS nem no GET público de modelos (no builder use a lista com «incluir arquivados»). Pode voltar a marcar e salvar para reativar.',
    fb_label_public_desc: 'Descrição pública',
    fb_placeholder_public_desc: 'O que os seus parceiros farão com este documento?',
    fb_tpl_icon_title: 'Ícone do formulário, clique para escolher',
    fb_tpl_icon_aria: 'Escolher ícone do formulário',
    fb_nav_help_summary: 'Ajuda: navegação por seções na app (lista vs um a um)',
    fb_nav_help_p1:
      'Navegação na app, Em cada seção, no painel de propriedades à direita, escolha lista com scroll ou um campo de cada vez. A app junta as seções num scroll único quando todas são lista; se alguma for «um a um», usa telas por etapa. Formulários antigos só com «seguir global» continuam usando o modo salvo no JSON até definir modo por seção.',
    fb_nav_help_p2:
      'Com uma única seção, o menu de etapas é ignorado na app. Com hub ativo e várias seções só em lista, a app mostra uma etapa de cada vez em vez de um scroll único.',
    fb_app_start_eyebrow: 'Layout',
    fb_app_layout_modal_title: 'Layout na app',
    fb_app_layout_modal_intro:
      'Defina como o prestador abre o formulário no celular e, quando usar menu de etapas, se a ordem das seções é livre ou fixa.',
    fb_app_layout_open_title: 'Abrir opções de layout do formulário no app',
    fb_app_layout_done: 'Pronto',
    fb_app_start_group_title: 'Como o prestador entra no formulário',
    fb_app_start_direct: '1ª etapa',
    fb_app_start_direct_hint: '— clássico',
    fb_app_start_hub: 'Menu de etapas',
    fb_app_start_hub_hint: '— escolhe a seção',
    fb_app_hub_sep: 'No menu',
    fb_app_hub_free: 'Livre',
    fb_app_hub_seq: 'Ordem fixa',
    fb_app_hub_wrap_title: 'Ativo quando «Menu de etapas» está selecionado',
    fb_app_nav_scroll_hint: 'Deslize horizontalmente na barra se os controles não couberem na tela.',

    fb_locale_lbl: 'Idioma do painel',
    fb_locale_pt: 'Português (Brasil)',
    fb_locale_en: 'English (US)',
    fb_locale_es: 'Español',
    fb_sync_idle: 'Sinc.: —',
    fb_sync_saving: 'Salvando…',
    fb_sync_local: 'Só neste navegador',
    fb_sync_cloud: 'Sincronizado com a API',
    fb_sync_error: 'Erro de API / rede',

    fb_val_empty_title: 'O título do formulário não pode estar vazio.',
    fb_val_empty_labels: 'Há campos sem rótulo (etapas ignoradas). Corrija antes de salvar.',
    fb_val_dup_ids: 'IDs de campo duplicados: {ids}. Corrija antes de salvar.',
    fb_val_no_operational:
      'O formulário ainda não tem perguntas operacionais. Adicione pelo menos um campo ou use o Composer para gerar um rascunho.',
    fb_val_choice_no_options:
      'Existem campos de escolha (lista, múltipla ou escala) sem opções definidas. Corrija antes de salvar.',

    mdl_field_props_title: 'Propriedades do campo',
    mdl_field_props_close: 'Fechar',
    mdl_field_props_ok: 'OK',
    mdl_mobile_preview_app: 'App Aria',
    mdl_mobile_preview_sim_nav: 'Simular navegação (só pré-visualização)',
    mdl_mobile_preview_list: 'Lista',
    mdl_mobile_preview_wizard: 'Um a um',
    mdl_mobile_preview_hybrid: 'Híbrido',
    mdl_mobile_preview_notice:
      'Simulação no navegador. Imita o layout do app (HTML/CSS), mas não é o mesmo motor do celular (React Native em app/checklist/[id].tsx, GPS, anexos, lógica de negócio, etc.).',
    mdl_new_form_title: 'Novo formulário',
    mdl_new_form_label: 'Dê um nome / título para o documento:',
    mdl_new_form_ph: 'Ex.: Roteiro de ar condicionado',
    mdl_cancel: 'Cancelar',
    mdl_new_form_create: 'Criar painel em branco',
    mdl_forms_title: 'Meus formulários',
    mdl_forms_sub:
      'Vista em árvore: expanda pastas, arraste formulários para mover. Clique na pasta para definir onde criar um novo modelo.',
    mdl_forms_search_ph: 'Filtrar por nome (pastas e formulários)…',
    mdl_forms_filter_non_archived: 'Apenas não arquivados',
    mdl_forms_tree_tip:
        'Arraste o cartão para uma pasta para mover. O sufixo #xxxxxx distingue títulos iguais. «Mover para outra pasta» fica no detalhe, só quando precisar.',
    mdl_forms_new_folder: '+ Nova pasta',
    mdl_forms_new_here: 'Novo formulário aqui',
    fb_forms_list_locales_tip: 'Idiomas com rótulos neste modelo: {list}',
    mdl_folder_title: 'Nova pasta',
    mdl_folder_sub: 'A pasta será criada no nível atual (breadcrumb).',
    mdl_folder_name_lbl: 'Nome',
    mdl_folder_name_ph: 'Ex.: Manutenção 2026',
    mdl_folder_create: 'Criar pasta',
    mdl_geofence_title: 'Cerca eletrônica global',
    mdl_geofence_body:
      'Se ativar, a app pode exigir que o técnico esteja dentro do raio (metros) do GPS da manutenção para abrir este formulário.',
    mdl_geofence_chk: 'Exigir cerca para abrir o formulário',
    mdl_geofence_radius: 'Raio (metros)',
    mdl_geofence_hint:
      'Você pode continuar usando o bloco «Validar cerca» em passos isolados. Use Salvar formulário para gravar essas configurações.',
    mdl_geofence_close: 'Fechar',
    mdl_geofence_apply: 'Aplicar',
    mdl_duration_title: 'Tempo previsto de execução do formulário',
    mdl_duration_body:
      'Só o preenchimento do formulário (sem deslocamento). Opcional: se vazio, no despacho usa-se 60 min. Múltiplos de 5 min; mínimo 5.',
    mdl_duration_lbl: 'Minutos (opcional)',
    mdl_duration_ph: 'Ex.: 90, deixe vazio para o padrão no despacho',
    mdl_duration_hint: 'Use Salvar formulário para gravar esta configuração no modelo.',
    mdl_section_title: 'Editar etapa',
    mdl_section_body: 'Nome e ícone usados no canvas e na app móvel (quando o campo de seção tiver ícone definido).',
    mdl_section_name_lbl: 'Nome da etapa',
    mdl_section_name_ph: 'Ex.: Inspeção inicial',
    mdl_section_pick_icon: 'Escolher ícone',
    mdl_section_clear_icon: 'Ícone predefinido',
    mdl_section_apply: 'Aplicar',
    mdl_icon_title: 'Selecionar um ícone',
    mdl_icon_search_lbl: 'Pesquisar ícone',
    mdl_icon_search_ph: 'Pesquisa (inglês ou PT: estrela→star, carro→car…)',
    mdl_icon_lib: 'Biblioteca',
    mdl_icon_color: 'Cor',
    mdl_icon_remove: 'Remover ícone (deixar vazio)',
    mdl_logic_title: 'Regras e lógica do campo',
    mdl_logic_sub_default: 'A configurar gatilhos para o campo…',
    mdl_logic_rules_in_block: 'Regras neste bloco:',
    mdl_logic_sub_help_html:
      'Use <em>Campo monitorado</em> para disparar a condição a partir de outro campo ou de uma <em>seção/etapa</em>. Ações "Buscar na API e preencher campo" disparam ao <strong>sair do campo monitorizado</strong> (teclado), em geral com o mesmo timing que "Validar na API externa", GET sem corpo ou POST com JSON do formulário.',
    mdl_logic_field_label_aria: 'Nome do campo ou etapa',
    mdl_logic_close_aria: 'Fechar',
    mdl_logic_h4: 'Condição (SE) e ações (ENTÃO)',
    mdl_logic_add: '+ Adicionar regra (SE)',
    mdl_logic_empty: 'Este campo não tem regras ativas.',
    mdl_logic_save: 'Salvar regras do campo',

    fb_logic_monitor_label: 'Campo monitorado (dispara o SE)',
    fb_logic_form_clock_option: '[Formulário] Cronômetro geral (tempo total)',
    fb_logic_if: 'SE',
    fb_logic_then: 'ENTÃO',
    fb_logic_del_rule: 'Excluir regra',
    fb_logic_add_action: '+ Adicionar ação (ENTÃO)',
    fb_logic_target_pick: '[Selecionar alvo]',
    fb_logic_field_section_prefix: '[Seção/Etapa]',
    fb_logic_field_unnamed: '(sem nome)',
    fb_logic_new_value_ph: 'Novo valor',
    fb_logic_ph_sec_single: 'Segundos (ex.: 120)',
    fb_logic_ph_sec_between: 'min|max em segundos (ex.: 30|600)',
    fb_logic_ph_default: 'Valor esperado',

    fb_logic_op_eq: 'Igual a (==)',
    fb_logic_op_ne: 'Diferente de (!=)',
    fb_logic_op_contains: 'Contém texto',
    fb_logic_op_not_contains: 'Não contém texto',
    fb_logic_op_starts_with: 'Começa com',
    fb_logic_op_ends_with: 'Termina com',
    fb_logic_op_not_starts_with: 'Não começa com',
    fb_logic_op_not_ends_with: 'Não termina com',
    fb_logic_op_is_empty: 'Está vazio',
    fb_logic_op_not_empty: 'Está preenchido (qualquer valor)',
    fb_logic_op_is_true: 'Verdadeiro (caixa / sim / 1)',
    fb_logic_op_is_false: 'Falso (não / 0 / desmarcado)',
    fb_logic_op_gt: 'Maior que (número)',
    fb_logic_op_lt: 'Menor que (número)',
    fb_logic_op_gte: 'Maior ou igual (número)',
    fb_logic_op_lte: 'Menor ou igual (número)',
    fb_logic_op_between: 'Entre dois números (inclusive), valor: min|max',
    fb_logic_op_not_between: 'Fora do intervalo, valor: min|max',
    fb_logic_op_one_of: 'É um de (lista exata, separada por vírgula)',
    fb_logic_op_none_of: 'Não é nenhum de (lista exata)',
    fb_logic_op_includes_any: 'Contém qualquer trecho da lista (vírgula)',
    fb_logic_op_includes_all: 'Contém todos os trechos da lista',
    fb_logic_op_excludes_all: 'Não contém nenhum trecho da lista',
    fb_logic_op_matches_regex: 'Corresponde ao padrão (regex JavaScript)',
    fb_logic_op_length_eq: 'Tamanho do texto = (número de caracteres)',
    fb_logic_op_length_neq: 'Tamanho do texto ≠',
    fb_logic_op_length_gt: 'Tamanho do texto >',
    fb_logic_op_length_gte: 'Tamanho do texto ≥',
    fb_logic_op_length_lt: 'Tamanho do texto <',
    fb_logic_op_length_lte: 'Tamanho do texto ≤',
    fb_logic_op_count_eq: 'N.º de itens selecionados =',
    fb_logic_op_count_neq: 'N.º de itens selecionados ≠',
    fb_logic_op_count_gt: 'N.º de itens selecionados >',
    fb_logic_op_count_gte: 'N.º de itens selecionados ≥',
    fb_logic_op_count_lt: 'N.º de itens selecionados <',
    fb_logic_op_count_lte: 'N.º de itens selecionados ≤',
    fb_logic_op_date_before: 'Data/hora é antes de (valor ISO ou reconhecível)',
    fb_logic_op_date_after: 'Data/hora é depois de',
    fb_logic_op_date_on_or_before: 'Data/hora ≤ referência',
    fb_logic_op_date_on_or_after: 'Data/hora ≥ referência',

    fb_logic_op_form_elapsed_gte: 'Tempo total no formulário ≥ (segundos)',
    fb_logic_op_form_elapsed_lte: 'Tempo total no formulário ≤ (segundos)',
    fb_logic_op_form_elapsed_gt: 'Tempo total no formulário > (segundos)',
    fb_logic_op_form_elapsed_lt: 'Tempo total no formulário < (segundos)',
    fb_logic_op_form_elapsed_eq: 'Tempo total no formulário = (segundos inteiros)',
    fb_logic_op_form_elapsed_between: 'Tempo total entre (seg), min|max',

    fb_logic_op_section_started: 'Técnico já entrou nesta etapa',
    fb_logic_op_section_not_started: 'Ainda não entrou nesta etapa',
    fb_logic_op_section_ended: 'Etapa já foi concluída (avançou ou enviou)',
    fb_logic_op_section_not_ended: 'Etapa ainda não foi concluída',
    fb_logic_op_section_in_progress: 'Em andamento (entrou e não concluiu)',
    fb_logic_op_section_elapsed_gte: 'Tempo gasto na etapa ≥ (segundos)',
    fb_logic_op_section_elapsed_lte: 'Tempo gasto na etapa ≤ (segundos)',
    fb_logic_op_section_elapsed_gt: 'Tempo gasto na etapa > (segundos)',
    fb_logic_op_section_elapsed_lt: 'Tempo gasto na etapa < (segundos)',
    fb_logic_op_section_elapsed_eq: 'Tempo gasto na etapa = (segundos inteiros)',
    fb_logic_op_section_elapsed_between: 'Tempo na etapa entre (seg), min|max',

    fb_logic_ph_between: 'Mínimo|Máximo (ex.: 10|500)',
    fb_logic_ph_not_between: 'Mínimo|Máximo, fora do intervalo',
    fb_logic_ph_one_of: 'Valor1, Valor2 (igualdade, ignora maiúsculas)',
    fb_logic_ph_none_of: 'Valor1, Valor2…',
    fb_logic_ph_includes_any: 'Trecho1, Trecho2…',
    fb_logic_ph_includes_all: 'Trecho1, Trecho2… (todos devem aparecer)',
    fb_logic_ph_excludes_all: 'Trecho1, Trecho2… (nenhum pode aparecer)',
    fb_logic_ph_matches_regex: 'Regex JS (máx. 500 caracteres)',
    fb_logic_ph_num_ref: 'Número de referência',
    fb_logic_ph_len: 'Número de caracteres',
    fb_logic_ph_count_list: 'Quantidade de itens na resposta (listas)',
    fb_logic_ph_count: 'Quantidade',
    fb_logic_ph_date_ref: 'Data/hora de referência (ex.: 2025-12-31 ou ISO 8601)',
    fb_logic_ph_date_ref_short: 'Data/hora de referência',

    fb_logic_act_show: 'Exibir o campo',
    fb_logic_act_hide: 'Ocultar o campo',
    fb_logic_act_require: 'Tornar obrigatório',
    fb_logic_act_optional: 'Tornar opcional',
    fb_logic_act_set_value: 'Definir valor',
    fb_logic_act_api_val: 'Validar na API externa',
    fb_logic_act_api_fetch: 'Buscar na API e preencher campo',

    fb_logic_vision_hint_html:
      '<strong>Classificação 0–10 ativa neste campo:</strong> os operadores <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, «Entre dois números» e «Fora do intervalo» comparam o valor <code>rating0To10</code> (0 a 10) devolvido pela análise Gemini. Use <b>Está preenchido</b> se só precisar de análise concluída. Se a resposta não tiver nota, <b>!=</b> com um número é verdadeiro; <b>==</b> e as outras comparações numéricas falham.',
    fb_logic_vision_detection_hint_html:
      '<strong>Visão de IA, detecção:</strong> com análise concluída, <code>==</code>, <code>!=</code>, «contém», «um de», <b>É verdadeiro</b> (resposta <code>yes</code>) e <b>É falso</b> (resposta <code>no</code>) usam o valor de <code>answers[0]</code> (normalizado para <code>yes</code> / <code>no</code> / <code>unknown</code>). Use <b>Está preenchido</b> se só precisar de detecção concluída.',

    fb_logic_api_fetch_offline: 'Se offline, não buscar nem alterar o campo',
    fb_logic_api_allow_offline: 'Permitir que o técnico pule a regra se estiver offline',
    fb_logic_api_lbl_target: 'Campo destino (recebe o texto extraído)',
    fb_logic_api_lbl_method: 'Método HTTP',
    fb_logic_api_method_post: 'POST (JSON com formulário, tarefa e respostas)',
    fb_logic_api_method_get: 'GET (URL completa; sem corpo)',
    fb_logic_api_lbl_url: 'URL do endpoint',
    fb_logic_api_ph_url: 'https://… (GET: inclua query na URL)',
    fb_logic_api_lbl_path: 'Caminho no JSON da resposta (opcional)',
    fb_logic_api_ph_path: 'Ex.: current.temp_c (vazio = corpo inteiro como texto)',
    fb_logic_api_lbl_errmsg: 'Mensagem se falhar a chamada',
    fb_logic_api_ph_errmsg: 'Ex.: Serviço indisponível.',
    fb_logic_api_lbl_url_val: 'URL do endpoint (o app fará POST injetando o payload XML/JSON)',
    fb_logic_api_ph_url_val: 'Ex.: https://api.fornecedor.com/valida',
    fb_logic_api_lbl_expected: 'Condição de retorno de sucesso (string/regex esperada no corpo)',
    fb_logic_api_ph_expected: 'Ex.: "status":"VALID"',
    fb_logic_api_lbl_block_msg: 'Mensagem personalizada em caso de bloqueio/erro',
    fb_logic_api_ph_block_msg: 'Ex.: CPF inválido no Serasa.',

    mdl_copilot_drag_title: 'Arraste pelo cabeçalho para mover o painel. Duplo clique aqui repõe a posição.',
    mdl_copilot_options: 'Opções',
    mdl_copilot_options_title: 'Mostrar ou ocultar opções, arquivos de referência e contexto',
    mdl_copilot_close_aria: 'Fechar Composer',
    mdl_copilot_thinking: 'A IA está pensando…',
    mdl_copilot_input_ph:
      'Mensagem para o Composer… (Enter envia; pode colar links https://; clipe ou arrastar ficheiros)',
    mdl_copilot_send: 'Enviar',
    mdl_copilot_send_aria: 'Enviar mensagem',
    mdl_copilot_attach_title: 'Anexar ficheiros (Excel, Word, PDF, imagem, JSON…)',
    mdl_copilot_attach_aria: 'Anexar ficheiros de referência ao Composer',
    mdl_copilot_menu_eyebrow: 'Opções e contexto',
    mdl_copilot_collapse_aria: 'Recolher menu de opções',
    mdl_copilot_collapse_title: 'Recolher',
    mdl_copilot_follow_canvas: 'Ao clicar no canvas, usar esse campo na conversa',
    mdl_copilot_pin: 'Fixar seleção atual',
    mdl_copilot_clear_focus: 'Limpar foco',
    mdl_copilot_clarify_hint:
      'Marque uma ou mais opções em cada pergunta (toque de novo para desmarcar) e use «Enviar escolhas»; ou escreva livremente na caixa de texto.',
    mdl_copilot_adv_summary: 'Contexto, links e ficheiros (opcional)',
    mdl_copilot_undo_hint:
      'O Composer aplica as alterações logo no formulário. Use o botão abaixo para desfazer só a última rodada (canvas + configurações + regras sugeridas nessa mensagem).',
    mdl_copilot_undo: 'Desfazer última alteração',
    mdl_copilot_undo_title: 'Reverte o formulário ao estado antes da última alteração aplicada pelo Composer',
    mdl_copilot_clear_chat: 'Limpar conversa',
    mdl_copilot_preview_title: 'Rever campos sugeridos',
    mdl_copilot_preview_intro:
      'Marque Incluir para cada linha. Ajuste o tipo, a descrição, instruções por campo (só para a IA ao reprocessar) e obrigatório. O resumo do pedido no chat aparece por defeito uma vez em Comentários gerais (não é repetido em cada linha). Use Comentários gerais e Reprocessar com instruções para pedir à IA um novo rascunho antes de aplicar no canvas. Etapas (section_break) não podem ser excluídas, o tipo de etapa não é alterável aqui.',
    mdl_copilot_prev_th_inc: 'Incl.',
    mdl_copilot_prev_th_field: 'Campo / etapa',
    mdl_copilot_prev_th_type: 'Tipo',
    mdl_copilot_prev_th_desc: 'Descrição',
    mdl_copilot_prev_th_ai: 'Instruções p/ IA (opcional)',
    mdl_copilot_prev_th_req: 'Obr.',
    mdl_copilot_prev_notes_lbl: 'Comentários gerais para a IA (opcional)',
    mdl_copilot_prev_notes_hint:
      'Por defeito inclui o contexto da conversa uma vez (pode editar ou apagar). Acrescente instruções globais (tom, LGPD, simplificar etapas). Use com Reprocessar com instruções para a IA reapresentar o formulário; só Aplicar no canvas não envia o texto à IA.',
    mdl_copilot_prev_notes_ph:
      'Ex.: reduzir campos da etapa «Avaliação nutricional»; todos os textos em tom formal; adicionar campo de consentimento LGPD…',
    mdl_copilot_prev_optional: 'Tornar todos opcionais',
    mdl_copilot_prev_reprocess: 'Reprocessar com instruções',
    mdl_copilot_prev_apply: 'Aplicar no canvas',
    mdl_copilot_feedback_applied:
      '**Alterações no editor:** esta proposta foi aplicada **só no canvas local** (definições do modelo e/ou regras sugeridas), **sem gravar na nuvem** — quem **guarda** é o botão **Salvar** do construtor. **«Desfazer última alteração»** reverte a última rodada do Composer.',
    mdl_copilot_feedback_preview:
      '**Estado do painel:** abriu-se a **tabela de revisão** com os campos sugeridos. Confirme com **«Aplicar no canvas»** quando estiver pronto, ou ajuste as linhas antes.',
    fb_copilot_empty_reply: '(A IA não devolveu texto, veja avisos ao lado ou tente de novo.)',
    fb_guided_title: 'Monte seu formulário com ajuda guiada',
    fb_guided_sub:
      'Descreva o objetivo, quem vai preencher e o cenário. O Composer monta um primeiro rascunho profissional e já sugere estrutura, evidências e próximos passos.',
    mdl_delete_form_title: 'Arquivar formulário?',
    mdl_delete_form_body:
      'O formulário será arquivado e poderá ser restaurado depois pelo histórico/versões. Isso evita perda acidental.',
    mdl_delete_form_yes: 'Sim, arquivar',

    fb_alert_upload_rejected: 'Upload recusado.',
    fb_alert_no_image_url: 'O servidor não devolveu o URL da imagem.',
    fb_alert_editor_not_ready: 'O editor não está pronto. Clique de novo no campo e tente inserir a imagem.',
    fb_alert_image_insert_fail: 'Não foi possível inserir a imagem no editor. Atualize a página e tente de novo.',
    fb_alert_image_send_fail: 'Falha ao enviar imagem: {detail}',
    fb_alert_file_picker: 'Não foi possível abrir o seletor de arquivos. Tente outro navegador ou permissões de arquivos.',
    fb_alert_transit_end: 'O campo «Finalizar deslocamento» não pode ficar antes de «Iniciar deslocamento». Coloque primeiro o início ou arraste o fim para depois do início.',
    fb_alert_transit_start:
      'Com «Iniciar deslocamento» no formulário, também é obrigatório incluir «Finalizar deslocamento».',
    fb_alert_forms_empty:
      'Nenhuma pasta nem formulário neste nível. Use «Nova pasta» ou «Novo formulário aqui».',
    fb_alert_matrix_json: 'JSON inválido nas colunas.',
    fb_alert_matrix_array: 'As colunas devem ser um array JSON.',
    fb_alert_matrix_none: 'Nenhuma coluna válida. Ex.: [{"id":"c1","label":"Item","cellType":"text"}]',
    fb_alert_export_needs_field: 'Adicione pelo menos um campo de pergunta ao canvas (a primeira seção já existe).',
    fb_alert_import_ok: "Formulário importado com sucesso. Clique em «Salvar formulário» para persistir no catálogo local e na API.",
    fb_alert_import_bad: 'O arquivo não é compatível com o Aria Builder.',
    fb_alert_import_corrupt: 'Arquivo corrompido: {detail}',
    fb_alert_dup_title_folder: 'Já existe um formulário com este nome nesta pasta (catálogo local). Escolha outro título ou pasta.',
    fb_alert_dup_title_api: 'Já existe um formulário ativo com este nome nesta pasta.',
    fb_alert_api_save_fail: 'Salvo apenas neste navegador. A API não gravou ({status}): {detail}\n\nConfirme que o backend está no ar e que o URL da API está correto.',
    fb_alert_api_network: 'Não foi possível contatar a API. O formulário ficou salvo apenas neste navegador.\n\n{detail}',
    fb_alert_save_fatal: 'Erro ao salvar: {detail}',
    fb_alert_pdf_needs_fields: 'Adicione perguntas antes de gerar o PDF.',
    fb_alert_jspdf_missing:
      'A biblioteca jsPDF não carregou (rede ou CDN). Não é possível gerar o PDF de pré-visualização, recarregue a página ou confira o script em checklists.html.',
    fb_alert_sortable_missing:
      'A biblioteca SortableJS não carregou (rede ou CDN). O arrastar e soltar no canvas fica desativado, recarregue a página ou verifique o script em checklists.html.',
    fb_alert_folder_ui: 'Recarregue a página (interface «Nova pasta» não carregou).',
    fb_alert_folder_name: 'Indique um nome para a pasta.',
    fb_alert_folder_create_fail: 'Não foi possível criar a pasta: {detail}',
    fb_alert_folder_rename_fail: 'Não foi possível renomear: {detail}',
    fb_alert_folder_rename_net: 'Erro de rede ao renomear.',
    fb_alert_folder_delete_fail: 'Não foi possível excluir: {detail}',
    fb_alert_folder_delete_net: 'Erro de rede ao excluir pasta.',
    fb_alert_folder_move_fail: '{detail}',
    fb_alert_folder_move_net: 'Erro de rede ao mover formulário.',
    fb_alert_clone_net: 'Erro de rede ao clonar. A cópia local foi descartada.',
    fb_alert_clone_ok: "Formulário «{title}» clonado com sucesso.",
    fb_alert_new_panel:
      'Painel preparado para «{title}». Já existe uma primeira etapa no canvas, arraste perguntas para a «Área Externa» ou para dentro de uma etapa (ou adicione mais seções).',
    fb_alert_select_field: 'Selecione um campo no canvas (clique num cartão).',
    fb_alert_clarify_options: 'Marque pelo menos uma opção em alguma pergunta, ou escreva na caixa de texto.',
    fb_alert_copilot_reprocess: 'Sem proposta carregada para reprocessar.',
    fb_alert_login: 'Faça login no painel admin (token ausente).',
    fb_alert_logic_goal: 'Descreva o que a lógica deve fazer.',
    fb_alert_copilot_max_files: 'No máximo {max} arquivos por vez. Serão analisados só os primeiros {max}.',
    fb_alert_err_detail: '{detail}',
    fb_alert_help_image_401_hint:
      ' Faça login no painel (ex.: index.html na mesma máquina) e abra o Form Builder pela URL do servidor Node (ex.: http://localhost:3001/checklists.html), não pelo Live Server.',
    fb_alert_folder_create_net:
      'Erro de rede ao criar pasta. Abra o Form Builder pela URL do servidor Node (ex.: http://localhost:3001/checklists.html), não pelo Live Server.',
    fb_alert_clone_fail_api: 'Não foi possível clonar na API: {detail}',
    fb_alert_copilot_write_or_attach:
      'Escreva uma mensagem ou envie arquivos de referência (Excel, Word, PDF, imagem ou JSON) no Composer para obter sugestões automáticas.',
    fb_alert_copilot_bad_ext:
      'Extensão não suportada em: {list}. Use .xlsx, .xlsm, .docx, .pdf, .png, .jpg, .jpeg, .webp ou .json.',
    fb_alert_copilot_analyze_none_ok: 'Nenhum arquivo foi analisado com sucesso.\n\n{detail}',
    fb_alert_copilot_analyze_none: 'Nenhum arquivo foi analisado.',
  },
  'en-US': {
    fb_pageTitle: 'Aria Admin, Forms Builder',
    fb_bc_panel: 'Home',
    fb_bc_builder: 'Forms Builder',
    fb_hero_title: 'Forms Builder',
    fb_hero_sub:
      'Build the form schema for the app: fields, rules, icon, and section navigation. Use the collapsible panel below for the public title, description, status, and app shortcuts.',
    fb_meta_summary_hint: 'Title, description, status, and app options',
    fb_meta_summary_fallback: 'Untitled form',
    fb_open: 'Open form',
    fb_open_title: 'View saved forms',
    fb_new: 'Create new',
    fb_new_title: 'New blank form',
    fb_import_title: 'Import JSON',
    fb_export_title: 'Export schema (download)',
    fb_copilot: 'Composer',
    fb_copilot_title: 'Composer: adjust the form, rules, and icons with AI',
    fb_preview: 'App preview',
    fb_geofence: 'Global geofence',
    fb_duration: 'Form duration',
    fb_duration_title:
      'Expected minutes for filling only (excluding travel), used in dispatch',
    fb_save: 'Save form',
    fb_save_title: 'Saves the template in the browser and sends to the API when available',
    fb_unsaved: 'Unsaved changes',
    fb_unsaved_leave: 'You have unsaved changes. Leave anyway?',
    fb_save_saving: 'Saving…',
    fb_save_local_ok: 'Saved locally',
    fb_save_cloud_ok: 'In the cloud and app',
    fb_toolbox_title: 'Dynamic fields',
    fb_toolbox_filter_ph: 'Filter field types…',
    fb_toolbox_tablist_aria: 'Field palette categories',
    fb_cat_basic: 'Basics',
    fb_cat_premium: 'Dynamic',
    fb_cat_wfm: 'Tracking',
    fb_cat_audit: 'Evidence',
    fb_cat_launches: 'Transactions',
    fb_cat_ai: 'AI',

    fb_tb_text: 'Text answer',
    fb_tb_number: 'Numeric input',
    fb_tb_currency: 'Currency (money amount)',
    fb_tb_email: 'Email',
    fb_tb_phone: 'Phone / mobile',
    fb_tb_date: 'Date / time',
    fb_tb_checkbox: 'Checkbox',
    fb_tb_yes_no: 'Yes / no (toggle)',
    fb_tb_dropdown: 'List (dropdown)',
    fb_tb_multiselect: 'Multiple choice',
    fb_tb_rating: 'Rating (stars)',
    fb_tb_lookup_select: 'Dynamic list (server / JSON)',
    fb_tb_repeatable_matrix: 'Repeatable matrix (table)',
    fb_tb_opinion_scale: 'NPS / Likert scale',
    fb_tb_image_annotation: 'Photo with annotations',
    fb_tb_calculated: 'Calculated field (expression)',
    fb_tb_hidden: 'Hidden field',
    fb_tb_transit_start: 'Start travel',
    fb_tb_transit_end: 'End travel',
    fb_tb_geofence_check: 'Validate geofence',
    fb_tb_location_pick: 'Location (GPS + map)',
    fb_tb_file_upload: 'Attach file',
    fb_tb_photo: 'Photo (free gallery)',
    fb_tb_photo_stamped: 'Stamped photo (live)',
    fb_tb_barcode_scan: 'Scan label / asset',
    fb_tb_materials_consumption: 'Materials / consumption (tech stock)',
    fb_tb_materials_receipt: 'Materials / inbound (tech stock)',
    fb_tb_technician_finance_expense: 'Technician expenses',
    fb_tb_technician_finance_revenue: 'Technician revenue',
    fb_tb_signature: 'Signature',
    fb_tb_signature_summary: 'Signature summary · Resumo para assinatura',
    fb_tb_leitura: 'Reading',
    fb_tb_form_complete_button: 'Complete button (form / work order)',
    fb_tb_voice_note: 'Voice note',
    fb_tb_facial_recognition: 'Face recognition',
    fb_tb_vision_checklist: 'AI vision, detection',
    fb_tb_vision_ai_analysis: 'AI vision, analysis',
    fb_tb_vision_ai_comparison: 'AI vision, comparison',

    fb_canvas_section_prefix: 'Section ·',
    fb_canvas_preamble_title: 'External area',
    fb_canvas_fields_one: '{n} field',
    fb_canvas_fields_many: '{n} fields',
    fb_canvas_questions_one: '{n} question',
    fb_canvas_questions_many: '{n} questions',
    fb_canvas_questions_list_suffix: ' · list',
    fb_canvas_new_step: 'New step',
    fb_canvas_step_n: 'Step {n}',
    fb_canvas_aria_toggle_section: 'Collapse or expand this section',
    fb_canvas_step_edit_title: 'Click to edit this step name and icon',
    fb_canvas_section_props: 'Section properties',
    fb_canvas_section_logic: 'Logic and rules',
    fb_canvas_section_dup: 'Duplicate section',
    fb_canvas_section_del: 'Delete section',
    fb_canvas_step_req_required: 'Required step, click to make optional',
    fb_canvas_step_req_optional: 'Optional step, click to require',
    fb_canvas_add_section: 'New section',
    fb_props_kind_section: 'Step / section',

    fb_prop_pick_gear_hint:
      'Click a field or step gear icon to edit its properties.',
    fb_prop_label_section_title: 'Section / step name (shown in the mobile app)',
    fb_prop_label_question_panel: 'Question label in the builder (shown to the technician in the app)',
    fb_prop_internal_id: 'Internal field ID (slug)',
    fb_prop_internal_id_copy_title: 'Copy this to use in formulas',
    fb_prop_textmask_title: 'Dynamic mask (optional)',
    fb_prop_textmask_ph: 'e.g. ##/##/#### (date)',
    fb_prop_textmask_hint:
      'Use "#" for each digit or letter the app should try to format while typing. Leave empty for free text.',
    fb_prop_signature_summary_fields_title: 'Fields in summary (order follows the form)',
    fb_prop_signature_summary_fields_help:
      'In the app, these values appear in a single block <b>above</b> the signature area. At the root, the app also reads values from <b>repeatable sections</b> (first occurrence with text). Inside a repeatable row, that row’s context is used.',
    fb_prop_signature_summary_none_eligible: 'No fields available to include.',
    fb_prop_signature_summary_select_all: 'Select all',
    fb_prop_signature_summary_clear_all: 'Clear selection',
    fb_prop_section_app_view_title: 'How the technician sees this step (app)',
    fb_prop_section_fill_list_title: 'List with scroll',
    fb_prop_section_fill_list_desc: 'All fields in this section are visible with scrolling.',
    fb_prop_section_fill_wizard_title: 'One field at a time',
    fb_prop_section_fill_wizard_desc: 'Wizard: Next / Back only within this section.',
    fb_prop_section_legacy_inherit:
      'Legacy: “follow global”, the app still uses <code>appFillMode</code> in the JSON until you pick an option above.',
    fb_prop_section_repeat_chk: 'Repeat this section (list)',
    fb_prop_section_repeat_help:
      'The technician can fill <b>several consecutive instances</b> of the same fields (e.g. multiple pieces of equipment). Each row saves an object in the <b>__section_repeat_&lt;id&gt;</b> array in the run. Use min/max to cap how many instances.',
    fb_prop_min_instances_sec: 'Min instances (empty = 0)',
    fb_prop_max_instances_sec: 'Max instances (empty = unlimited)',
    fb_ph_instance_example: 'e.g. {n}',
    fb_prop_reading_title: 'Reading text (rich text)',
    fb_prop_reading_intro:
      'Shown in the app as <strong>read-only</strong> (scrolls with the form). <strong>Hyperlinks are not allowed</strong>, they are removed when editing.',
    fb_prop_instructions_title: 'Instructions for the technician (rich text, optional)',
    fb_prop_instructions_show_title: 'Show instructions on the technician’s phone',
    fb_prop_instructions_show_aria: 'Show instructions in the mobile app',
    fb_quill_help_placeholder:
      'Text and images the technician can open in the app (Instructions button).',
    fb_quill_reading_placeholder:
      'Formatted text shown in the app (read-only). Hyperlinks are not allowed.',
    fb_prop_default_value_lbl: 'Autofill / default value (optional)',
    fb_prop_default_value_ph: 'Use tags like {{user.name}}, {{date}}',
    fb_prop_required_q: 'Required answer?',
    fb_prop_leitura_block_note:
      'This block <strong>does not collect an answer</strong> in the app, it is only for the technician to read (contracts, notices, etc.).',
    fb_prop_form_complete_btn_note:
      'In the app, this block shows a <strong>button</strong> that performs the same action as the main footer button (advance, return to the step menu, or <strong>complete the work order</strong>). The button text is the <strong>label</strong> above; if empty, the app uses the default footer label. You can place the field in the <strong>External area</strong> or inside any step.',
    fb_prop_repeat_field_title: 'Multiple answers (list)',
    fb_prop_repeat_field_help:
      'The app stores an <b>array</b> in the run for this field (text, options, photos, signatures, etc.). Compatible with older forms (a single value remains a string or single value).',
    fb_prop_min_items_field: 'Min items (empty = default)',
    fb_prop_max_items_field: 'Max items (empty = unlimited)',
    fb_prop_media_comment_title: 'Optional comment per photo / file',
    fb_prop_media_comment_help:
      'Unlike the general field comment: here the technician can comment each photo, capture, or attachment (camera, gallery, or file). All optional.',
    fb_prop_tech_comment_title: 'Technician comment (optional in the app)',
    fb_prop_tech_comment_help:
      'Shows a free-text box below the answer in the app. Complements the instructions (does not replace them).',
    fb_prop_online_validation_title: 'Require online-only validation?',
    fb_prop_online_validation_face:
      'Face recognition: <b>unchecked</b> allows offline capture and sends biometrics when online. <b>Checked</b> requires internet and immediate match.',
    fb_prop_online_validation_vision:
      'AI vision: <b>unchecked</b> allows camera capture without network and tries analysis when online. <b>Checked</b> requires internet when sending to the server.',
    fb_prop_vision_ai_structured_prompt_hint:
      'Describe your operation’s criteria, what counts as good or poor evidence, and what the AI should look for in the media. Approximate limit: {max} characters. The API returns JSON with <code>answers</code> (e.g. <code>q1</code>); the default template uses <code>value</code> as a string from "0" to "10" or <code>unknown</code>. With the 0–10 rating enabled above, the root also includes <code>rating0To10</code> (integer aligned with the same score).',
    fb_prop_online_validation_voice:
      'Voice note: transcription (Whisper) is <b>always on the server</b>. <b>Unchecked</b> = can record offline but needs network on “Stop and transcribe”. <b>Checked</b> = requires internet on upload.',
    fb_prop_online_validation_lookup:
      'With a server preset: <b>unchecked</b> allows opening the field offline if options were fetched before. <b>Checked</b> requires internet when opening the field to load the preset.',
    fb_prop_online_validation_generic:
      'If enabled, blocks filling when the device is offline at that moment. Otherwise allows async mode (validated later) when applicable.',

    fb_prop_tech_finance_title: 'PDF and sharing with the client',
    fb_prop_tech_finance_help_html:
      'By default, <strong>this field is not included in the general PDF</strong>. In the PDF report builder (Reports), it only appears if you enable visibility for this field. When you do, <strong>information that may correspond to the technician’s internal operating costs could become available to the client</strong> or anyone who receives the document, always confirm the preset before sharing.',

    fb_prop_geofence_title: 'Geofence settings',
    fb_prop_geofence_zone_type_lbl: 'Zone type',
    fb_prop_geofence_opt_radius: 'WO destination (point + Haversine radius)',
    fb_prop_geofence_opt_polygon: 'WO geometry (route, area, polygon / KML on dispatch)',
    fb_prop_geofence_hint_radius:
      'Validation against the WO destination point: straight-line (Haversine) distance from GPS to the WO point; the radius below is the default if the WO does not set one on dispatch.',
    fb_prop_geofence_hint_polygon:
      'Validation against dispatch geometry: polygon (area), route corridor (KML), or A/B endpoints (segment). The values below are defaults when the WO does not include tolerances.',
    fb_prop_geofence_radius_lbl: 'Acceptance radius (meters)',
    fb_prop_geofence_radius_help:
      'Form default when the WO does not set a radius on dispatch; if the WO defines a radius, that value wins.',
    fb_prop_geofence_dest_radius_lbl: 'Acceptance radius (meters)',
    fb_prop_geofence_dest_radius_help:
      'Default if the WO does not set a radius on dispatch; otherwise the WO value wins.',
    fb_prop_geofence_geom_tol_lbl: 'Route corridor / polyline (meters)',
    fb_prop_geofence_geom_tol_help:
      'Route, patrol, or line KML: max distance from GPS to the path (stay within the corridor). Default if the WO does not set tolerance on dispatch.',
    fb_prop_geofence_seg_buf_lbl: 'A↔B endpoint tolerance (meters)',
    fb_prop_geofence_seg_buf_help:
      'Only when dispatch uses a segment zone (two points A and B): max distance to A or to B. Not for following a route line, use the field above for that.',
    fb_prop_geofence_fail_mode_lbl: 'Failure mode',
    fb_prop_geofence_fail_block: 'Block, prevents advancing the form',
    fb_prop_geofence_fail_warn: 'Warn only, logs deviation and continues',
    fb_prop_geofence_fail_allow_warn: 'Log and allow, warn if outside the zone',
    fb_prop_geofence_fail_record_only: 'Log only, inside/outside without blocking',
    fb_prop_geofence_unblock_reentry:
      'When blocking: auto-release after returning to the allowed zone (background GPS)',
    fb_prop_geofence_error_msg_lbl: 'Custom error message (optional)',
    fb_prop_geofence_error_msg_ph: 'e.g. You are outside the authorized service area.',

    fb_prop_transit_screen_title: 'Screen while traveling',
    fb_prop_transit_keep_awake_lbl: 'Keep the screen on until travel ends',
    fb_prop_transit_keep_awake_help_html:
      'The device may use more battery, but GPS capture tends to be more accurate and continuous while travel is in progress (map visible or minimized). The option turns off automatically when tapping <strong>End travel</strong>.',
    fb_prop_transit_reimbursement_lbl: 'Displacement log only during the activity',
    fb_prop_transit_reimbursement_help:
      'Records only the GPS track in the app. No ETA, no customer chat, and no public tracking page, add a second start/end pair after operational travel.',
    fb_prop_transit_dest_os_lbl: 'Destination: work order service location (ETA, map, tracking)',
    fb_prop_transit_patrol_lbl: 'Patrol (KML / work order geometry on the map)',
    fb_prop_transit_patrol_help:
      'The travel map uses the polyline or zone from dispatch (e.g. KML). Use this to follow the planned path without treating the destination as “customer service arrival”.',
    fb_prop_transit_purpose_title: 'Purpose of this travel start',
    fb_prop_transit_first_default_hint:
      'The first “Start travel” in the form defaults to the OS destination, use it for travel to the service location.',
    fb_prop_transit_vs_geofence_help:
      'Travel (transit) records track and times; geofence (separate field) proves entry into the service area.',

    fb_prop_location_pick_title: 'Location (GPS + map)',
    fb_prop_location_pick_help:
      'In the app, the technician gets the device GPS and can move the map pin. The saved answer stores both positions as JSON (reports and exports).',

    fb_prop_photo_stamped_warn_title: 'Mandatory anti-fraud mode',
    fb_prop_photo_stamped_warn_body: 'The phone gallery will be blocked. Live camera required.',

    fb_prop_facial_title: 'Biometrics and AI required',
    fb_prop_facial_intro:
      'The captured photo is compared with the technician’s profile photo using the AI engine selected in system Integrations.',
    fb_prop_facial_engine_note_html:
      'The recognition engine (FaceMatch, automatic, or AWS) is set by <b>plan</b> under <b>Plans &amp; subscriptions</b> → “Biometrics / API” on each plan card. Default: FaceMatch.',
    fb_prop_facial_mode_lbl: 'Biometric validation mode',
    fb_prop_facial_mode_self: 'Prove logged-in user identity (job / work order)',
    fb_prop_facial_mode_identify: 'Identify any enrolled user (same tenant)',
    fb_prop_facial_identify_help:
      'In “identify”, any user with an app session can fill the field: the face is compared to the FaceMatch gallery and the server returns the name and email of whoever is recognized in the <b>same tenant</b> as the session. The identified person does <b>not</b> need to be logged into the app.',
    fb_prop_facial_camera_note: 'Face capture in the app always uses the <b>system camera</b> (high resolution).',

    fb_prop_vision_title_analysis_html:
      '<ion-icon name="sparkles-outline" style="color:#b91c1c"></ion-icon> <span style="color:#dc2626;font-weight:900">AI vision, analysis</span>',
    fb_prop_vision_title_detection_html:
      '<ion-icon name="videocam-outline"></ion-icon> AI vision, detection',
    fb_prop_vision_body_analysis_html:
      'In the app, the technician uses <b>camera only</b>, no gallery or file picker. The Aria server calls the <b>Gemini</b> API with the <b>Google AI Studio</b> integration (key and model under Integrations). The text below is a <b>single structured prompt</b>; the response includes a 0–10 score in <code>answers[0].value</code> (string), confidence, and rationale. With <b>0–10 rating</b> enabled (recommended), the JSON root also includes <code>rating0To10</code>.',
    fb_prop_vision_body_detection_html:
      'In the app, the technician uses <b>camera only</b>, no gallery or file picker. The server calls the <b>Vision AI - Moondream</b> integration (image Q&amp;A API) or forwards to the <b>Vision AI - YOLO</b> proxy, depending on tenant settings under Integrations / account. Below you define <b>one criterion</b> in natural language (similar to <b>AI vision, analysis</b>); the normalized response includes <code>answers[0].value</code> (<code>yes</code> / <code>no</code> / <code>unknown</code>), confidence, and rationale.',
    fb_prop_vision_detection_prompt_lbl: 'Prompt (yes/no)',
    fb_prop_vision_detection_prompt_hint:
      'A <b>single</b> criterion per media upload (up to <b>{maxSingle}</b> characters), in free text like the analysis field. The backend returns the same JSON envelope (<code>answers</code> with <code>q1</code>, <code>value</code>, <code>confidence</code>, <code>rationale</code>) with <code>yes</code>, <code>no</code>, or <code>unknown</code>.',
    fb_prop_vision_default_structured_prompt:
      'Context: visual inspection of a field-service step (single photo or video).\n\n' +
      'Task:\n' +
      '1) Assign an integer score from 0 to 10 for how well the visual evidence meets this work-order step’s criteria.\n' +
      '2) Rely only on what is visible: expected item or service, apparent condition, organization, and severity of any visible non-conformities.\n\n' +
      'Field value (required):\n' +
      '- Send only the digits of an integer between 0 and 10, as a string (e.g. "7").\n' +
      '- Or send exactly unknown if the media is insufficient, the target cannot be identified, or the decision would be ambiguous.\n\n' +
      'Guidance rubric:\n' +
      '- 0–2: unacceptable or irrelevant evidence; clear severe non-conformity.\n' +
      '- 3–4: several visible issues or weak evidence quality.\n' +
      '- 5–6: acceptable with caveats; improvements needed.\n' +
      '- 7–8: generally good; only minor issues.\n' +
      '- 9–10: excellent; step requirements clearly met.\n\n' +
      'In rationale, in 2–4 short sentences, state what you saw and what drove the score most.',
    fb_prop_vision_prompt_placeholder:
      'Context: visual inspection of a field-service step (single photo or video).\n\n' +
      'Task:\n' +
      '1) Assign an integer score from 0 to 10 for how well the visual evidence meets this work-order step’s criteria.\n' +
      '2) Rely only on what is visible: expected item or service, apparent condition, organization, and severity of any visible non-conformities.\n\n' +
      'Field value (required):\n' +
      '- Send only the digits of an integer between 0 and 10, as a string (e.g. "7").\n' +
      '- Or send exactly unknown if the media is insufficient, the target cannot be identified, or the decision would be ambiguous.\n\n' +
      'Guidance rubric:\n' +
      '- 0–2: unacceptable or irrelevant evidence; clear severe non-conformity.\n' +
      '- 3–4: several visible issues or weak evidence quality.\n' +
      '- 5–6: acceptable with caveats; improvements needed.\n' +
      '- 7–8: generally good; only minor issues.\n' +
      '- 9–10: excellent; step requirements clearly met.\n\n' +
      'In rationale, in 2–4 short sentences, state what you saw and what drove the score most.',
    fb_prop_vision_default_detection_prompt:
      'Context: visual inspection of a field-service step (single photo or video; for video the backend uses one frame as the image).\n\n' +
      'Task:\n' +
      '1) Based only on what is visible, the criterion below must be evaluated in a binary way for this work-order step.\n' +
      '2) In the criterion, describe what must be verified (presence, absence, state, PPE, housekeeping, etc.).\n\n' +
      'Criterion (id q1):\n' +
      '[Edit here, e.g. “Is there at least one clearly visible and apparently accessible fire extinguisher in the photographed area?”]\n\n' +
      'Expected app result: the server normalizes to yes, no, or unknown in answers[0].value, with confidence and rationale (<b>Vision AI - Moondream</b> integration or <b>Vision AI - YOLO</b> proxy, depending on the tenant).',
    fb_prop_vision_rating_chk_lbl: '0–10 rating (filled by the API after analysis)',
    fb_prop_vision_rating_hint_html:
      'With this option, the API returns <code>rating0To10</code> at the JSON root (integer 0–10, or <code>null</code> if not possible). The app shows the score with the result and in reports.',
    fb_prop_vision_show_ai_chk_lbl: 'Show AI response details in the app',
    fb_prop_vision_show_ai_hint:
      'Uncheck to hide from the technician’s form the response text, confidence, rationale, and 0–10 block (media and “completed” state remain). Reports and signature summary may still show the data.',
    fb_prop_vision_comparison_show_ref_chk_lbl: 'Show reference photo to the technician in the app',
    fb_prop_vision_comparison_show_ref_hint:
      'If unchecked, the provider does not see the reference thumbnail in the form; the image is still sent to the server to compare with the field capture.',
    fb_prop_vision_grid_lbl: 'Photo grid (single composite before upload)',
    fb_prop_vision_grid_help:
      'Only <b>1×1</b> or <b>2×2</b>. With more than one cell, the app requires <b>all</b> photos (camera) before analysis; <b>photo</b> only (no video). Older models with a larger grid are saved as <b>2×2</b>.',
    fb_prop_vision_grid_opt_1x1: '1 photo, 1×1',
    fb_prop_vision_grid_opt_2x2: '4 photos, 2×2',
    fb_prop_vision_capture_lbl: 'Camera capture type',
    fb_prop_vision_capture_photo_only: 'Photo only',
    fb_prop_vision_capture_video_only: 'Video only',
    fb_prop_vision_capture_photo_video: 'Photo and video',
    fb_prop_vision_video_max_hint:
      'In the app, each video in AI Vision fields (detection and analysis) is limited to 10 seconds; longer clips are rejected. For detection, the upload uses an image from the first moment of the video (Moondream and the YOLO proxy still receive an image only).',
    fb_prop_vision_prompt_lbl: 'Structured prompt (single)',
    fb_vision_prompt_ex_btn: 'Examples',
    fb_vision_prompt_ex_btn_title: 'Ready-made prompts for field services (AI vision, analysis)',
    fb_vision_prompt_ex_modal_title: 'Structured prompt examples',
    fb_vision_prompt_ex_modal_intro:
      'Pick a template to fill the field, then tune it for your checklist. On new fields, «0–10 rating» is on by default so the API returns <code>rating0To10</code> aligned with the score in <code>value</code>; turn it off in properties if you do not need it.',
    fb_vision_prompt_ex_apply: 'Apply to field',
    fb_vision_prompt_ex_close: 'Close',
    fb_vision_prompt_ex_area_lbl: 'Area / sector',
    fb_vision_prompt_ex_empty_filter: 'No templates in this area. Choose “All areas” or another sector.',
    fb_vision_prompt_ex_catalog_missing:
      'Example catalog failed to load. Reload the Form Builder page (visionAiAnalysisPromptExamplesData.js must be available).',
    fb_vision_detection_ex_btn_title: 'Prompt templates (AI vision, detection)',
    fb_vision_detection_ex_modal_title: 'Detection prompt templates',
    fb_vision_detection_ex_modal_intro:
      'Each template includes context, task, criterion (q1), and a note on <code>answers[0]</code>, same layout as the field’s default prompt. Adapt the criterion to your checklist. One criterion per media upload; Moondream or the YOLO proxy normalize yes/no in <code>answers[0].value</code>. For counting, state what must be ignored.',
    fb_vision_detection_ex_catalog_missing:
      'Example catalog failed to load. Reload the Form Builder page (visionDetectionPromptExamplesData.js must be available).',

    fb_prop_voice_title: 'Voice note',
    fb_prop_voice_help_html:
      'Transcription uses <b>OpenAI Whisper</b> on the server (same <b>API key</b> as the “OpenAI” integration under Integrations). The technician needs <b>internet</b> when tapping “Stop and transcribe”.',
    fb_prop_voice_lang_lbl: 'Language (Whisper)',
    fb_prop_voice_lang_hint:
      'List is built from <b>active regional profiles</b> on the platform (SaaS). Optional but helps with accent and noise.',

    fb_prop_file_upload_title: 'Attach file (app)',
    fb_prop_file_upload_help:
      'Maximum <b>50 MB</b> per file. The app blocks executables, scripts, and other commonly dangerous types; documents and usual files (PDF, Office, images, ZIP, etc.) are accepted.',

    fb_prop_image_annot_title: 'Photo with annotations',
    fb_prop_image_annot_help:
      'In the app, the technician chooses camera or gallery and can draw on the image. The stored value is JSON (local URI + normalized strokes).',
    fb_prop_image_annot_pen_lbl: 'Stroke color',
    fb_prop_image_annot_width_lbl: 'Width (1–24)',

    fb_prop_lookup_title: 'Dynamic list',
    fb_prop_lookup_source_lbl: 'Source',
    fb_prop_lookup_src_preset: 'Server preset (GET with session)',
    fb_prop_lookup_src_api: 'API endpoint (GET with session)',
    fb_prop_lookup_src_inline: 'JSON in the model (no network)',
    fb_prop_lookup_preset_lbl: 'Preset',
    fb_prop_lookup_api_path_lbl: 'API path',
    fb_prop_lookup_api_path_help:
      'Use a backend relative API path (e.g. /api/checklists/lookup-options/equipamentos_demo). Expected response: { options:[{value,label}] } or a direct array.',
    fb_prop_lookup_json_lbl: 'JSON (array of value / label pairs)',

    fb_prop_matrix_title: 'Repeatable matrix',
    fb_prop_matrix_intro_html:
      'Define up to 8 columns with a name and type. In the app the technician fills multiple table rows; data is stored as JSON.',
    fb_prop_matrix_cols_ui_lbl: 'Table columns',
    fb_prop_matrix_col_label_ph: 'Column name in the app (e.g. Item)',
    fb_prop_matrix_type_text: 'Text',
    fb_prop_matrix_type_number: 'Number',
    fb_prop_matrix_type_yesno: 'Yes / No',
    fb_prop_matrix_add_col: 'Add column',
    fb_prop_matrix_remove_col: 'Remove column',
    fb_prop_matrix_col_empty_fallback: 'Column {n}',
    fb_prop_matrix_json_adv: 'Advanced, edit JSON',
    fb_prop_matrix_json_adv_hint:
      'When you leave this field, the JSON replaces the grid above. Use only if you know the format.',
    fb_prop_matrix_cols_lbl: 'Columns (JSON)',
    fb_prop_matrix_min_rows: 'Min rows',
    fb_prop_matrix_max_rows: 'Max rows',

    fb_prop_opinion_title: 'NPS / Likert scale',
    fb_prop_opinion_mode_lbl: 'Mode',
    fb_prop_opinion_mode_nps: 'NPS (0 to 10)',
    fb_prop_opinion_mode_likert: 'Likert (5 levels)',
    fb_prop_opinion_likert_lbl: 'Likert labels (one per line, up to 5)',

    fb_prop_list_options_lbl: 'List options (comma-separated)',

    fb_prop_calc_title: 'System math expression',
    fb_prop_calc_ph: 'e.g. field_123 + field_456',
    fb_prop_calc_help:
      'Variables: use the underscore ID of other blocks (e.g. field_111 * field_222) or use "Math.sqrt(field_111)" for pure formulas.',
    fb_prop_calc_insert_field_lbl: 'Insert field (at cursor)',
    fb_prop_calc_field_placeholder: 'Choose field…',
    fb_prop_calc_op_placeholder: 'Insert operator or function…',
    fb_prop_calc_op_group_arith: 'Operators',
    fb_prop_calc_op_group_math: 'Math',
    fb_prop_calc_ops_lbl: 'Operators and functions',
    fb_prop_calc_display_lbl: 'Result display format',
    fb_prop_calc_display_auto:
      'Automatic — currency if the formula only references currency field IDs; otherwise number.',
    fb_prop_calc_display_number: 'Number (app preferences)',
    fb_prop_calc_display_currency: 'Currency (app locale)',
    fb_prop_calc_display_percent:
      'Percent — expression value is a fraction (e.g. 0.15 → 15%).',

    fb_canvas_panel: 'Form canvas',
    fb_schema_locale_hint: 'Labels (editing)',
    fb_schema_locale_select_title:
      'Language in which you edit and save labels in the JSON. Only the center canvas uses this for UI strings; the rest of the panel follows your account language.',
    fb_schema_copy_primary: 'Copy from pt-BR',
    fb_schema_copy_primary_title:
      'Copies each field/section text from pt-BR into the current edit language (as a starting point to review or translate).',
    fb_schema_auto_translate_lbl: 'Auto-translate on language change (empty or still Portuguese)',
    fb_schema_auto_translate_title:
      'When enabled: choosing EN/ES/DE triggers MyMemory for each label whose target slot is empty or still matches the pt-BR text (e.g. after «Copy from pt-BR»). It does not overwrite text that already differs from Portuguese. May fail: network, MyMemory quota, or browser blocking.',
    fb_schema_translate_now: 'Translate now',
    fb_schema_translate_now_loading: 'Translating…',
    fb_schema_translate_now_title:
      'Run automatic translation for the selected language now (useful if labels stayed in Portuguese after opening the form).',
    fb_canvas_loading:
      'Loading canvas… Place fields in the “External area” or inside each step; drag from the sidebar.',
    fb_label_form_title: 'Form title',
    fb_placeholder_form_title: 'e.g. Condition survey',
    fb_label_form_active: 'Form active',
    fb_hint_form_active:
      'Unchecked: template is inactive, hidden from OS dispatch and from the default templates list (use “include archived” in the builder). Check and save to reactivate.',
    fb_label_public_desc: 'Public description',
    fb_placeholder_public_desc: 'What will partners do with this document?',
    fb_tpl_icon_title: 'Form icon, click to choose',
    fb_tpl_icon_aria: 'Choose form icon',
    fb_nav_help_summary: 'Help: section navigation in the app (list vs one-by-one)',
    fb_nav_help_p1:
      'In-app navigation, For each section, in the properties panel on the right, choose list with scroll or one field at a time. The app merges sections into a single scroll when all are list mode; if any is one-by-one, it uses step screens. Older forms with only a global follow mode keep the JSON mode until you set per-section mode.',
    fb_nav_help_p2:
      'With a single section, the step menu is ignored in the app. With an active hub and several list-only sections, the app shows one step at a time instead of a single scroll.',
    fb_app_start_eyebrow: 'Layout',
    fb_app_layout_modal_title: 'In-app layout',
    fb_app_layout_modal_intro:
      'Choose how the technician opens the form on mobile and, when using the step menu, whether section order is free or fixed.',
    fb_app_layout_open_title: 'Open form layout options for the app',
    fb_app_layout_done: 'Done',
    fb_app_start_group_title: 'How the provider opens the form',
    fb_app_start_direct: 'First step',
    fb_app_start_direct_hint: '— classic',
    fb_app_start_hub: 'Step menu',
    fb_app_start_hub_hint: '— pick a section',
    fb_app_hub_sep: 'In menu',
    fb_app_hub_free: 'Free',
    fb_app_hub_seq: 'Fixed order',
    fb_app_hub_wrap_title: 'Active when “Step menu” is selected',
    fb_app_nav_scroll_hint: 'Scroll this bar horizontally if the controls do not fit on screen.',

    fb_locale_lbl: 'Admin language',
    fb_locale_pt: 'Portuguese (Brazil)',
    fb_locale_en: 'English (US)',
    fb_locale_es: 'Español',
    fb_sync_idle: 'Sync: —',
    fb_sync_saving: 'Saving…',
    fb_sync_local: 'Browser only',
    fb_sync_cloud: 'Synced with API',
    fb_sync_error: 'API / network error',

    fb_val_empty_title: 'The form title cannot be empty.',
    fb_val_empty_labels: 'Some fields have no label (sections ignored). Fix before saving.',
    fb_val_dup_ids: 'Duplicate field IDs: {ids}. Fix before saving.',
    fb_val_no_operational:
      'The form has no operational fields yet. Add at least one field or use Composer to create a draft.',
    fb_val_choice_no_options:
      'Some choice fields (list, multiselect, or scale) are missing options. Fix before saving.',

    mdl_field_props_title: 'Field properties',
    mdl_field_props_close: 'Close',
    mdl_field_props_ok: 'OK',
    mdl_mobile_preview_app: 'Aria app',
    mdl_mobile_preview_sim_nav: 'Simulate navigation (preview only)',
    mdl_mobile_preview_list: 'List',
    mdl_mobile_preview_wizard: 'One by one',
    mdl_mobile_preview_hybrid: 'Hybrid',
    mdl_mobile_preview_notice:
      'Browser simulation. It mimics the app layout (HTML/CSS), but is not the same engine as the phone (React Native in app/checklist/[id].tsx, GPS, attachments, business logic, etc.).',
    mdl_new_form_title: 'New form',
    mdl_new_form_label: 'Give a name / title for the document:',
    mdl_new_form_ph: 'e.g. AC maintenance runbook',
    mdl_cancel: 'Cancel',
    mdl_new_form_create: 'Create blank canvas',
    mdl_forms_title: 'My forms',
    mdl_forms_sub:
      'Tree view: expand folders, drag forms to move. Click a folder to set where new templates are created.',
    mdl_forms_search_ph: 'Filter by name (folders and forms)…',
    mdl_forms_filter_non_archived: 'Non-archived only',
    mdl_forms_tree_tip:
        'Drag a card onto a folder to move it. The #xxxxxx suffix distinguishes duplicate titles. Expand «Move to another folder…» only when needed.',
    mdl_forms_new_folder: '+ New folder',
    mdl_forms_new_here: 'New form here',
    fb_forms_list_locales_tip: 'Languages with labels in this template: {list}',
    mdl_folder_title: 'New folder',
    mdl_folder_sub: 'The folder is created at the current level (breadcrumb).',
    mdl_folder_name_lbl: 'Name',
    mdl_folder_name_ph: 'e.g. Maintenance 2026',
    mdl_folder_create: 'Create folder',
    mdl_geofence_title: 'Global geofence',
    mdl_geofence_body:
      'When enabled, the app may require the technician to be within the radius (meters) of the job GPS to open this form.',
    mdl_geofence_chk: 'Require geofence to open the form',
    mdl_geofence_radius: 'Radius (meters)',
    mdl_geofence_hint:
      'You can still use the “Validate geofence” block in isolated steps. Use Save form to persist these settings.',
    mdl_geofence_close: 'Close',
    mdl_geofence_apply: 'Apply',
    mdl_duration_title: 'Expected form completion time',
    mdl_duration_body:
      'Filling the form only (no travel). Optional: if empty, dispatch defaults to 60 min. Multiples of 5 min; minimum 5.',
    mdl_duration_lbl: 'Minutes (optional)',
    mdl_duration_ph: 'e.g. 90, leave empty for dispatch default',
    mdl_duration_hint: 'Use Save form to persist this setting on the template.',
    mdl_section_title: 'Edit step',
    mdl_section_body: 'Name and icon used on the canvas and mobile app (when the section field has an icon).',
    mdl_section_name_lbl: 'Step name',
    mdl_section_name_ph: 'e.g. Initial inspection',
    mdl_section_pick_icon: 'Choose icon',
    mdl_section_clear_icon: 'Default icon',
    mdl_section_apply: 'Apply',
    mdl_icon_title: 'Select an icon',
    mdl_icon_search_lbl: 'Search icon',
    mdl_icon_search_ph: 'Search (EN or PT: star, car…)',
    mdl_icon_lib: 'Library',
    mdl_icon_color: 'Color',
    mdl_icon_remove: 'Remove icon (clear)',
    mdl_logic_title: 'Field rules and logic',
    mdl_logic_sub_default: 'Configuring triggers for field…',
    mdl_logic_rules_in_block: 'Rules in this block:',
    mdl_logic_sub_help_html:
      'Use <em>Monitored field</em> to trigger the condition from another field or a <em>section/step</em>. “Fetch from API and fill field” runs when <strong>leaving the monitored field</strong> (keyboard), generally with the same timing as “Validate against external API”, GET with no body or POST with form JSON.',
    mdl_logic_field_label_aria: 'Field or step name',
    mdl_logic_close_aria: 'Close',
    mdl_logic_h4: 'Condition (IF) and actions (THEN)',
    mdl_logic_add: '+ Add rule (IF)',
    mdl_logic_empty: 'This field has no active rules.',
    mdl_logic_save: 'Save field rules',

    fb_logic_monitor_label: 'Monitored field (triggers IF)',
    fb_logic_form_clock_option: '[Form] Overall timer (total time)',
    fb_logic_if: 'IF',
    fb_logic_then: 'THEN',
    fb_logic_del_rule: 'Delete rule',
    fb_logic_add_action: '+ Add action (THEN)',
    fb_logic_target_pick: '[Select target]',
    fb_logic_field_section_prefix: '[Section/Step]',
    fb_logic_field_unnamed: '(unnamed)',
    fb_logic_new_value_ph: 'New value',
    fb_logic_ph_sec_single: 'Seconds (e.g. 120)',
    fb_logic_ph_sec_between: 'min|max seconds (e.g. 30|600)',
    fb_logic_ph_default: 'Expected value',

    fb_logic_op_eq: 'Equals (==)',
    fb_logic_op_ne: 'Not equals (!=)',
    fb_logic_op_contains: 'Contains text',
    fb_logic_op_not_contains: 'Does not contain text',
    fb_logic_op_starts_with: 'Starts with',
    fb_logic_op_ends_with: 'Ends with',
    fb_logic_op_not_starts_with: 'Does not start with',
    fb_logic_op_not_ends_with: 'Does not end with',
    fb_logic_op_is_empty: 'Is empty',
    fb_logic_op_not_empty: 'Has any value',
    fb_logic_op_is_true: 'True (checkbox / yes / 1)',
    fb_logic_op_is_false: 'False (no / 0 / unchecked)',
    fb_logic_op_gt: 'Greater than (number)',
    fb_logic_op_lt: 'Less than (number)',
    fb_logic_op_gte: 'Greater or equal (number)',
    fb_logic_op_lte: 'Less or equal (number)',
    fb_logic_op_between: 'Between two numbers (inclusive), value: min|max',
    fb_logic_op_not_between: 'Outside range, value: min|max',
    fb_logic_op_one_of: 'Is one of (exact list, comma-separated)',
    fb_logic_op_none_of: 'Is none of (exact list)',
    fb_logic_op_includes_any: 'Contains any substring from list (comma)',
    fb_logic_op_includes_all: 'Contains all substrings from list',
    fb_logic_op_excludes_all: 'Contains none of the substrings',
    fb_logic_op_matches_regex: 'Matches pattern (JavaScript regex)',
    fb_logic_op_length_eq: 'Text length = (characters)',
    fb_logic_op_length_neq: 'Text length ≠',
    fb_logic_op_length_gt: 'Text length >',
    fb_logic_op_length_gte: 'Text length ≥',
    fb_logic_op_length_lt: 'Text length <',
    fb_logic_op_length_lte: 'Text length ≤',
    fb_logic_op_count_eq: 'Selected item count =',
    fb_logic_op_count_neq: 'Selected item count ≠',
    fb_logic_op_count_gt: 'Selected item count >',
    fb_logic_op_count_gte: 'Selected item count ≥',
    fb_logic_op_count_lt: 'Selected item count <',
    fb_logic_op_count_lte: 'Selected item count ≤',
    fb_logic_op_date_before: 'Date/time is before (ISO or parseable value)',
    fb_logic_op_date_after: 'Date/time is after',
    fb_logic_op_date_on_or_before: 'Date/time ≤ reference',
    fb_logic_op_date_on_or_after: 'Date/time ≥ reference',

    fb_logic_op_form_elapsed_gte: 'Total time on form ≥ (seconds)',
    fb_logic_op_form_elapsed_lte: 'Total time on form ≤ (seconds)',
    fb_logic_op_form_elapsed_gt: 'Total time on form > (seconds)',
    fb_logic_op_form_elapsed_lt: 'Total time on form < (seconds)',
    fb_logic_op_form_elapsed_eq: 'Total time on form = (whole seconds)',
    fb_logic_op_form_elapsed_between: 'Total time between (sec), min|max',

    fb_logic_op_section_started: 'Technician has entered this step',
    fb_logic_op_section_not_started: 'Has not entered this step yet',
    fb_logic_op_section_ended: 'Step completed (advanced or submitted)',
    fb_logic_op_section_not_ended: 'Step not completed yet',
    fb_logic_op_section_in_progress: 'In progress (entered, not completed)',
    fb_logic_op_section_elapsed_gte: 'Time spent on step ≥ (seconds)',
    fb_logic_op_section_elapsed_lte: 'Time spent on step ≤ (seconds)',
    fb_logic_op_section_elapsed_gt: 'Time spent on step > (seconds)',
    fb_logic_op_section_elapsed_lt: 'Time spent on step < (seconds)',
    fb_logic_op_section_elapsed_eq: 'Time spent on step = (whole seconds)',
    fb_logic_op_section_elapsed_between: 'Time on step between (sec), min|max',

    fb_logic_ph_between: 'Min|Max (e.g. 10|500)',
    fb_logic_ph_not_between: 'Min|Max, outside range',
    fb_logic_ph_one_of: 'Value1, Value2 (equality, case-insensitive)',
    fb_logic_ph_none_of: 'Value1, Value2…',
    fb_logic_ph_includes_any: 'Substring1, Substring2…',
    fb_logic_ph_includes_all: 'Substring1, Substring2… (all must appear)',
    fb_logic_ph_excludes_all: 'Substring1, Substring2… (none may appear)',
    fb_logic_ph_matches_regex: 'JS regex (max 500 chars)',
    fb_logic_ph_num_ref: 'Reference number',
    fb_logic_ph_len: 'Character count',
    fb_logic_ph_count_list: 'Number of items in answer (lists)',
    fb_logic_ph_count: 'Count',
    fb_logic_ph_date_ref: 'Reference date/time (e.g. 2025-12-31 or ISO 8601)',
    fb_logic_ph_date_ref_short: 'Reference date/time',

    fb_logic_act_show: 'Show field',
    fb_logic_act_hide: 'Hide field',
    fb_logic_act_require: 'Make required',
    fb_logic_act_optional: 'Make optional',
    fb_logic_act_set_value: 'Set value',
    fb_logic_act_api_val: 'Validate with external API',
    fb_logic_act_api_fetch: 'Fetch from API and fill field',

    fb_logic_vision_hint_html:
      '<strong>0–10 rating active on this field:</strong> operators <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, “Between two numbers”, and “Outside range” compare the <code>rating0To10</code> value (0–10) from Gemini. Use <b>Has any value</b> if you only need analysis done. If there is no score, <b>!=</b> with a number is true; <b>==</b> and other numeric comparisons fail.',
    fb_logic_vision_detection_hint_html:
      '<strong>AI vision, detection:</strong> once analysis completes, <code>==</code>, <code>!=</code>, “contains”, “one of”, <b>Is true</b> (<code>yes</code>) and <b>Is false</b> (<code>no</code>) use <code>answers[0]</code> (normalized to <code>yes</code> / <code>no</code> / <code>unknown</code>). Use <b>Has any value</b> if you only need detection done.',

    fb_logic_api_fetch_offline: 'If offline, do not fetch or change the field',
    fb_logic_api_allow_offline: 'Allow technician to skip rule when offline',
    fb_logic_api_lbl_target: 'Target field (receives extracted text)',
    fb_logic_api_lbl_method: 'HTTP method',
    fb_logic_api_method_post: 'POST (JSON with form, task, and answers)',
    fb_logic_api_method_get: 'GET (full URL; no body)',
    fb_logic_api_lbl_url: 'Endpoint URL',
    fb_logic_api_ph_url: 'https://… (GET: include query in URL)',
    fb_logic_api_lbl_path: 'Path in JSON response (optional)',
    fb_logic_api_ph_path: 'e.g. current.temp_c (empty = whole body as text)',
    fb_logic_api_lbl_errmsg: 'Message if the call fails',
    fb_logic_api_ph_errmsg: 'e.g. Service unavailable.',
    fb_logic_api_lbl_url_val: 'Endpoint URL (app will POST the payload)',
    fb_logic_api_ph_url_val: 'e.g. https://api.vendor.com/validate',
    fb_logic_api_lbl_expected: 'Success return condition (string/regex expected in body)',
    fb_logic_api_ph_expected: 'e.g. "status":"VALID"',
    fb_logic_api_lbl_block_msg: 'Custom message on block/error',
    fb_logic_api_ph_block_msg: 'e.g. Invalid CPF.',

    mdl_copilot_drag_title: 'Drag the header to move the panel. Double-click resets position.',
    mdl_copilot_options: 'Options',
    mdl_copilot_options_title: 'Show or hide options, reference files, and context',
    mdl_copilot_close_aria: 'Close Composer',
    mdl_copilot_thinking: 'AI is thinking…',
    mdl_copilot_input_ph:
      'Message… (Enter sends; paste https:// links; attach or drop files)',
    mdl_copilot_send: 'Send',
    mdl_copilot_send_aria: 'Send message',
    mdl_copilot_attach_title: 'Attach files (Excel, Word, PDF, image, JSON…)',
    mdl_copilot_attach_aria: 'Attach reference files to Composer',
    mdl_copilot_menu_eyebrow: 'Options and context',
    mdl_copilot_collapse_aria: 'Collapse options menu',
    mdl_copilot_collapse_title: 'Collapse',
    mdl_copilot_follow_canvas: 'When clicking the canvas, use that field in the conversation',
    mdl_copilot_pin: 'Pin current selection',
    mdl_copilot_clear_focus: 'Clear focus',
    mdl_copilot_clarify_hint:
      'Select one or more options per question (tap again to deselect) and use “Send choices”; or type freely in the text box.',
    mdl_copilot_adv_summary: 'Context, links, and files (optional)',
    mdl_copilot_undo_hint:
      'Composer applies changes directly to the form. Use the button below to undo only the last round (canvas + settings + suggested rules from that message).',
    mdl_copilot_undo: 'Undo last change',
    mdl_copilot_undo_title: 'Reverts the form to before the last Composer-applied change',
    mdl_copilot_clear_chat: 'Clear conversation',
    mdl_copilot_preview_title: 'Review suggested fields',
    mdl_copilot_preview_intro:
      'Check Include on each row. Adjust type, description, per-field AI instructions (only when reprocessing), and required. By default, a one-line summary of the chat request appears once under General comments (not repeated on every row). Use General comments and Reprocess with instructions for a new draft before applying to the canvas. Steps (section_break) cannot be removed, step type is not editable here.',
    mdl_copilot_prev_th_inc: 'Inc.',
    mdl_copilot_prev_th_field: 'Field / step',
    mdl_copilot_prev_th_type: 'Type',
    mdl_copilot_prev_th_desc: 'Description',
    mdl_copilot_prev_th_ai: 'AI instructions (optional)',
    mdl_copilot_prev_th_req: 'Req.',
    mdl_copilot_prev_notes_lbl: 'General comments for the AI (optional)',
    mdl_copilot_prev_notes_hint:
      'By default this includes the conversation context once (you can edit or clear). Add global instructions (tone, GDPR, simplify steps). Reprocess with instructions sends it to the AI; Apply to canvas alone does not.',
    mdl_copilot_prev_notes_ph:
      'e.g. reduce fields in “Nutrition review”; formal tone; add GDPR consent field…',
    mdl_copilot_prev_optional: 'Mark all optional',
    mdl_copilot_prev_reprocess: 'Reprocess with instructions',
    mdl_copilot_prev_apply: 'Apply to canvas',
    mdl_copilot_feedback_applied:
      '**Editor changes:** this proposal was applied **only to the local canvas** (model settings and/or suggested rules), **not saved to the cloud** — use **Save** in the builder to persist. **«Undo last change»** reverts the last Composer round.',
    mdl_copilot_feedback_preview:
      '**Panel state:** the **review table** with suggested fields is open. Confirm with **«Apply to canvas»** when ready, or adjust rows first.',
    fb_copilot_empty_reply: '(The AI returned no text, check side notes or try again.)',
    fb_guided_title: 'Build your form with guided help',
    fb_guided_sub:
      'Describe the goal, who will fill it out, and the scenario. Composer will create a professional first draft and suggest structure, evidence, and next steps.',
    mdl_delete_form_title: 'Archive form?',
    mdl_delete_form_body:
      'The form will be archived and can be restored later from history/versions. This helps avoid accidental loss.',
    mdl_delete_form_yes: 'Yes, archive',

    fb_alert_upload_rejected: 'Upload rejected.',
    fb_alert_no_image_url: 'The server did not return the image URL.',
    fb_alert_editor_not_ready: 'Editor is not ready. Click the field again to insert the image.',
    fb_alert_image_insert_fail: 'Could not insert the image. Refresh the page and try again.',
    fb_alert_image_send_fail: 'Failed to upload image: {detail}',
    fb_alert_file_picker: 'Could not open the file picker. Try another browser or file permissions.',
    fb_alert_transit_end: '“End travel” cannot be placed before “Start travel”. Add start first or drag end after start.',
    fb_alert_transit_start:
      'When the form has “Start travel”, you must also include “End travel”.',
    fb_alert_forms_empty:
      'No folders or forms at this level. Use “New folder” or “New form here”.',
    fb_alert_matrix_json: 'Invalid JSON in columns.',
    fb_alert_matrix_array: 'Columns must be a JSON array.',
    fb_alert_matrix_none: 'No valid columns. e.g. [{"id":"c1","label":"Item","cellType":"text"}]',
    fb_alert_export_needs_field: 'Add at least one question field on the canvas (the first section already exists).',
    fb_alert_import_ok: 'Form imported successfully. Click Save form to persist to local catalog and API.',
    fb_alert_import_bad: 'This file is not compatible with the Aria builder.',
    fb_alert_import_corrupt: 'Corrupt file: {detail}',
    fb_alert_dup_title_folder: 'A form with this name already exists in this folder (local catalog). Choose another title or folder.',
    fb_alert_dup_title_api: 'An active form with this name already exists in this folder.',
    fb_alert_api_save_fail: 'Saved in this browser only. API did not save ({status}): {detail}\n\nCheck that the backend is up and the API URL is correct.',
    fb_alert_api_network: 'Could not reach the API. The form was saved in this browser only.\n\n{detail}',
    fb_alert_save_fatal: 'Save error: {detail}',
    fb_alert_pdf_needs_fields: 'Add questions before generating the PDF.',
    fb_alert_jspdf_missing:
      'The jsPDF library did not load (network or CDN). PDF preview cannot be generated, reload the page or check the script in checklists.html.',
    fb_alert_sortable_missing:
      'SortableJS did not load (network or CDN). Canvas drag-and-drop is disabled, reload the page or check the script in checklists.html.',
    fb_alert_folder_ui: 'Reload the page (New folder UI did not load).',
    fb_alert_folder_name: 'Enter a folder name.',
    fb_alert_folder_create_fail: 'Could not create folder: {detail}',
    fb_alert_folder_rename_fail: 'Could not rename: {detail}',
    fb_alert_folder_rename_net: 'Network error while renaming.',
    fb_alert_folder_delete_fail: 'Could not delete: {detail}',
    fb_alert_folder_delete_net: 'Network error while deleting folder.',
    fb_alert_folder_move_fail: '{detail}',
    fb_alert_folder_move_net: 'Network error while moving form.',
    fb_alert_clone_net: 'Network error while cloning. Local copy was rolled back.',
    fb_alert_clone_ok: 'Form “{title}” cloned successfully.',
    fb_alert_new_panel:
      'Canvas ready for “{title}”. A first step already exists, drag questions into the “External area” or inside a step (or add more sections).',
    fb_alert_select_field: 'Select a field on the canvas (click a card).',
    fb_alert_clarify_options: 'Select at least one option in a question, or type in the text box.',
    fb_alert_copilot_reprocess: 'No loaded draft to reprocess.',
    fb_alert_login: 'Sign in to the admin panel (token missing).',
    fb_alert_logic_goal: 'Describe what the logic should do.',
    fb_alert_copilot_max_files: 'At most {max} files at a time. Only the first {max} will be analyzed.',
    fb_alert_err_detail: '{detail}',
    fb_alert_help_image_401_hint:
      ' Sign in to the panel (e.g. index.html on the same machine) and open the Form Builder from the Node server URL (e.g. http://localhost:3001/checklists.html), not from Live Server.',
    fb_alert_folder_create_net:
      'Network error while creating the folder. Open the Form Builder from the Node server URL (e.g. http://localhost:3001/checklists.html), not from Live Server.',
    fb_alert_clone_fail_api: 'Could not clone via API: {detail}',
    fb_alert_copilot_write_or_attach:
      'Type a message or upload reference files (Excel, Word, PDF, image, or JSON) in Composer to get automatic suggestions.',
    fb_alert_copilot_bad_ext:
      'Unsupported extension for: {list}. Use .xlsx, .xlsm, .docx, .pdf, .png, .jpg, .jpeg, .webp, or .json.',
    fb_alert_copilot_analyze_none_ok: 'No files were analyzed successfully.\n\n{detail}',
    fb_alert_copilot_analyze_none: 'No files were analyzed.',
  },
};
M['es-ES'] = { ...M['en-US'] };
Object.assign(M['es-ES'], {
  fb_schema_auto_translate_lbl: 'Traducir al cambiar idioma (vacíos o aún iguales a pt-BR)',
  fb_schema_auto_translate_title:
    'Si está activada: al elegir EN/ES/DE, pide traducción (MyMemory) para cada etiqueta cuyo destino esté vacío o siga siendo el mismo texto que en pt-BR. No sobrescribe un texto que ya sea distinto del portugués. Puede fallar: red, cuota o bloqueo.',
  fb_schema_translate_now: 'Traducir ahora',
  fb_schema_translate_now_loading: 'Traduciendo…',
  fb_schema_translate_now_title:
    'Ejecuta ya la traducción automática para el idioma seleccionado (útil si las etiquetas siguen en portugués).',
  fb_tb_currency: 'Moneda (importe)',
  fb_prop_voice_lang_hint:
    'Lista basada en los <b>perfiles regionales activos</b> de la plataforma (SaaS). Opcional; ayuda con acento y ruido.',
  mdl_forms_sub:
    'Vista en árbol: expanda carpetas, arrastre formularios para mover. Pulse una carpeta para definir dónde crear un modelo nuevo.',
  mdl_forms_filter_non_archived: 'Solo no archivados',
  mdl_forms_tree_tip:
    'Arrastre la tarjeta a una carpeta para moverla. El sufijo #xxxxxx distingue títulos duplicados. «Mover a otra carpeta…» está plegado hasta que lo necesite.',
  fb_forms_list_locales_tip: 'Idiomas con etiquetas en esta plantilla: {list}',
  fb_vision_prompt_ex_btn: 'Ejemplos',
  fb_vision_prompt_ex_btn_title: 'Modelos de prompt para servicios de campo (visión IA, análisis)',
  fb_vision_prompt_ex_modal_title: 'Ejemplos de prompt estructurado',
  fb_vision_prompt_ex_modal_intro:
    'Elija una plantilla para rellenar el campo y adáptela a su checklist. En campos nuevos, la «Clasificación 0–10» viene activada por defecto para que la API devuelva <code>rating0To10</code> alineado con la nota en <code>value</code>; desactívela en propiedades si no la necesita.',
  fb_vision_prompt_ex_apply: 'Aplicar al campo',
  fb_vision_prompt_ex_close: 'Cerrar',
  fb_vision_prompt_ex_area_lbl: 'Área / sector',
  fb_vision_prompt_ex_empty_filter:
    'No hay modelos en esta área. Elija «Todas las áreas» u otro sector.',
  fb_vision_prompt_ex_catalog_missing:
    'No se cargó el catálogo de ejemplos. Recargue la página del Form Builder (debe existir visionAiAnalysisPromptExamplesData.js).',
  fb_vision_detection_ex_btn_title: 'Modelos de prompt (visión IA, detección)',
  fb_vision_detection_ex_modal_title: 'Modelos de prompt para detección',
  fb_vision_detection_ex_modal_intro:
    'Cada modelo incluye contexto, tarea, criterio (q1) y nota sobre <code>answers[0]</code>, la misma estructura que el prompt predeterminado del campo. Adapte el criterio a su checklist. Un criterio por envío de medios; Moondream o el proxy YOLO normalizan sí/no en <code>answers[0].value</code>. En conteos, indique qué debe ignorarse.',
  fb_prop_vision_body_detection_html:
    'En la app, el técnico usa <b>solo la cámara</b>, sin galería ni selector de archivos. El servidor llama a la integración <b>Visión IA - Moondream</b> (API de pregunta sobre imagen) o reenvía al proxy <b>Visión IA - YOLO</b>, según la preferencia del tenant en Integraciones / cuenta. Abajo se define <b>un único criterio</b> en lenguaje natural (estilo semejante a «visión IA, análisis»); la respuesta normalizada incluye <code>answers[0].value</code> (<code>yes</code> / <code>no</code> / <code>unknown</code>), confianza y racional.',
  fb_prop_vision_detection_prompt_lbl: 'Prompt (sí/no)',
  fb_prop_vision_detection_prompt_hint:
    'Un <b>único</b> criterio por envío de medios (hasta <b>{maxSingle}</b> caracteres), en texto libre como en el campo de análisis. El backend devuelve el mismo sobre JSON (<code>answers</code> con <code>q1</code>, <code>value</code>, <code>confidence</code>, <code>rationale</code>) con valor <code>yes</code>, <code>no</code> o <code>unknown</code>.',
  fb_prop_vision_body_analysis_html:
    'En la app, el técnico usa <b>solo la cámara</b>, sin galería ni selector de archivos. El servidor Aria llama a la API <b>Gemini</b> con la integración <b>Google AI Studio</b> (clave y modelo en Integraciones). El texto de abajo es un <b>único prompt estructurado</b>; la respuesta incluye una nota de 0 a 10 en <code>answers[0].value</code> (cadena), confianza y racional. Con la «Clasificación 0–10» activada (recomendado), la raíz del JSON incluye también <code>rating0To10</code>.',
  fb_prop_vision_ai_structured_prompt_hint:
    'Describa criterios de su operación, qué cuenta como buena o mala evidencia y qué debe observar la IA en el medio. Límite aproximado: {max} caracteres. La API devuelve JSON con <code>answers</code> (p. ej. <code>q1</code>); la plantilla predeterminada usa <code>value</code> como cadena de "0" a "10" o <code>unknown</code>. Con la clasificación 0–10 activada arriba, la raíz incluye también <code>rating0To10</code> (entero alineado con la misma nota).',
  fb_prop_vision_default_structured_prompt:
    'Contexto: inspección visual de una etapa ejecutada en campo (foto o vídeo único).\n\n' +
    'Tarea:\n' +
    '1) Asigne un entero de 0 a 10 a la adherencia de la evidencia visual a los criterios de esta etapa de la OS.\n' +
    '2) Basándose solo en lo visible: presencia del ítem o servicio esperado, estado aparente, organización y gravedad de posibles no conformidades.\n\n' +
    'Campo value (obligatorio):\n' +
    '- Envíe solo los dígitos de un entero entre 0 y 10, como cadena (p. ej. "7").\n' +
    '- O envíe exactamente unknown si el medio es insuficiente, el objetivo no es identificable o hay ambigüedad relevante.\n\n' +
    'Rúbrica orientativa:\n' +
    '- 0–2: inaceptable o evidencia irrelevante; no conformidad grave o evidente.\n' +
    '- 3–4: varios problemas visibles o calidad débil de la evidencia.\n' +
    '- 5–6: aceptable con matices; mejoras necesarias.\n' +
    '- 7–8: buen estado general; solo fallos leves.\n' +
    '- 9–10: excelente; criterios de la etapa inequívocamente cumplidos.\n\n' +
    'En rationale, en 2–4 frases breves en es-ES, diga qué observó y qué movió más la nota.',
  fb_prop_vision_prompt_placeholder:
    'Contexto: inspección visual de una etapa ejecutada en campo (foto o vídeo único).\n\n' +
    'Tarea:\n' +
    '1) Asigne un entero de 0 a 10 a la adherencia de la evidencia visual a los criterios de esta etapa de la OS.\n' +
    '2) Basándose solo en lo visible: presencia del ítem o servicio esperado, estado aparente, organización y gravedad de posibles no conformidades.\n\n' +
    'Campo value (obligatorio):\n' +
    '- Envíe solo los dígitos de un entero entre 0 y 10, como cadena (p. ej. "7").\n' +
    '- O envíe exactamente unknown si el medio es insuficiente, el objetivo no es identificable o hay ambigüedad relevante.\n\n' +
    'Rúbrica orientativa:\n' +
    '- 0–2: inaceptable o evidencia irrelevante; no conformidad grave o evidente.\n' +
    '- 3–4: varios problemas visibles o calidad débil de la evidencia.\n' +
    '- 5–6: aceptable con matices; mejoras necesarias.\n' +
    '- 7–8: buen estado general; solo fallos leves.\n' +
    '- 9–10: excelente; criterios de la etapa inequívocamente cumplidos.\n\n' +
    'En rationale, en 2–4 frases breves en es-ES, diga qué observó y qué movió más la nota.',
  fb_prop_vision_default_detection_prompt:
    'Contexto: inspección visual de una etapa ejecutada en campo (foto o vídeo único; en vídeo el backend usa un frame como imagen).\n\n' +
    'Tarea:\n' +
    '1) Con base solo en lo visible, el criterio siguiente debe evaluarse de forma binaria para este punto de la OS.\n' +
    '2) Describa en el criterio qué debe verificarse (presencia, ausencia, estado, EPI, orden, etc.).\n\n' +
    'Criterio (identificador q1):\n' +
    '[Edite aquí, ej.: «¿Hay al menos un extintor claramente visible y aparentemente accesible en la zona fotografiada?»]\n\n' +
    'Respuesta esperada en la app: el servidor normaliza a yes, no o unknown en answers[0].value, con confianza y racional (integración «Visión IA - Moondream» o proxy «Visión IA - YOLO», según el tenant).',
  fb_logic_vision_detection_hint_html:
    '<strong>Visión IA, detección:</strong> con análisis terminado, <code>==</code>, <code>!=</code>, «contiene», «uno de», <b>Es verdadero</b> (<code>yes</code>) y <b>Es falso</b> (<code>no</code>) usan <code>answers[0]</code> (normalizado a <code>yes</code> / <code>no</code> / <code>unknown</code>). Use <b>Está rellenado</b> si solo necesita detección completada.',
  fb_vision_detection_ex_catalog_missing:
    'No se cargó el catálogo de ejemplos. Recargue la página del Form Builder (debe existir visionDetectionPromptExamplesData.js).',
  fb_app_nav_scroll_hint: 'Desplace horizontalmente la barra si los controles no caben en pantalla.',
  fb_prop_calc_insert_field_lbl: 'Insertar campo (en el cursor)',
  fb_prop_calc_field_placeholder: 'Elegir campo…',
  fb_prop_calc_op_placeholder: 'Insertar operador o función…',
  fb_prop_calc_op_group_arith: 'Operadores',
  fb_prop_calc_op_group_math: 'Math',
  fb_prop_calc_ops_lbl: 'Operadores y funciones',
  fb_prop_calc_display_lbl: 'Formato del resultado',
  fb_prop_calc_display_auto:
    'Automático — moneda si la fórmula solo usa IDs de campos «moneda»; si no, número.',
  fb_prop_calc_display_number: 'Número (preferencias de la app)',
  fb_prop_calc_display_currency: 'Moneda (locale de la app)',
  fb_prop_calc_display_percent:
    'Porcentaje — el valor de la expresión es fracción (p. ej. 0,15 → 15%).',
  fb_app_layout_modal_title: 'Diseño en la app',
  fb_app_layout_modal_intro:
    'Defina cómo el técnico abre el formulario en el móvil y, con el menú de pasos, si el orden de las secciones es libre o fijo.',
  fb_app_layout_open_title: 'Abrir opciones de diseño del formulario en la app',
  fb_app_layout_done: 'Listo',
  fb_app_start_direct: '1.ª etapa',
  fb_app_start_direct_hint: '— clásico',
  fb_app_start_hub: 'Menú de pasos',
  fb_app_start_hub_hint: '— elige la sección',
  fb_app_hub_sep: 'En el menú',
  fb_app_hub_free: 'Libre',
  fb_app_hub_seq: 'Orden fijo',
  fb_app_hub_wrap_title: 'Activo cuando «Menú de pasos» está seleccionado',
  fb_label_form_active: 'Formulario activo',
  fb_hint_form_active:
    'Desmarcado: el modelo queda inactivo, no aparece en el despacho de OS ni en el listado público de plantillas (en el builder use la lista con «incluir archivados»). Vuelva a marcar y guardar para reactivar.',
  fb_prop_vision_video_max_hint:
    'En la app, en los campos de visión IA (detección o análisis), cada vídeo dura como máximo 10 segundos; se rechazan clips más largos. En detección, el envío al servidor usa una imagen extraída del primer instante del vídeo (Moondream y el proxy YOLO reciben solo imagen).',
  fb_canvas_preamble_title: 'Área externa',
  fb_canvas_loading:
    'Cargando el canvas… Puede colocar campos en el «Área externa» o dentro de cada paso; arrastre desde la barra lateral.',
  fb_prop_geofence_opt_radius: 'Destino de la OS (punto + radio Haversine)',
  fb_prop_geofence_opt_polygon: 'Geometría de la OS (ruta, área, polígono / KML en el despacho)',
  fb_prop_geofence_hint_radius:
    'Validación frente al destino de la OS: distancia en línea recta (Haversine) del GPS al punto de la OS; el radio de abajo es el valor predeterminado si la OS no fija otro en el despacho.',
  fb_prop_geofence_hint_polygon:
    'Validación frente a la geometría del despacho: polígono (área), corredor de ruta (KML) o extremos A/B (tramo). Los valores de abajo son predeterminados cuando la OS no trae tolerancias.',
  fb_prop_geofence_radius_help:
    'Valor predeterminado del formulario si la OS no define radio en el despacho; si la OS define radio, prevalece ese valor.',
  fb_prop_geofence_dest_radius_lbl: 'Radio de aceptación (metros)',
  fb_prop_geofence_dest_radius_help:
    'Predeterminado si la OS no fija radio en el despacho; en caso contrario prevalece el de la OS.',
  fb_prop_geofence_geom_tol_lbl: 'Corredor de ruta / polilínea (metros)',
  fb_prop_geofence_geom_tol_help:
    'Ruta, patrullaje o KML en línea: distancia máxima del GPS al trazado (no alejarse del camino). Valor predeterminado si la OS no fija tolerancia en el despacho.',
  fb_prop_geofence_seg_buf_lbl: 'Tolerancia en extremos A↔B (metros)',
  fb_prop_geofence_seg_buf_help:
    'Solo cuando el despacho usa zona «tramo» (dos puntos A y B): distancia máxima hasta A o hasta B. No sustituye el corredor de ruta de arriba; seguir línea/polilínea es siempre el campo superior.',
  fb_alert_new_panel:
    'Panel listo para «{title}». Ya existe un primer paso en el canvas, arrastre preguntas al «Área externa» o dentro de un paso (o añada más secciones).',
  fb_prop_form_complete_btn_note:
    'En la app, este bloque muestra un <strong>botón</strong> que hace lo mismo que el botón principal del pie (avanzar, volver al menú de pasos o <strong>cerrar la OS</strong>). El texto del botón es la <strong>etiqueta</strong> de arriba; si está vacío, la app usa el texto predeterminado del pie. Puede colocar el campo en el <strong>Área externa</strong> o dentro de cualquier paso.',
});

M['de-DE'] = { ...M['en-US'] };
Object.assign(M['de-DE'], {
  fb_schema_auto_translate_lbl: 'Beim Sprachwechsel übersetzen (leer oder noch wie pt-BR)',
  fb_schema_auto_translate_title:
    'Wenn aktiv: Bei EN/ES/DE wird MyMemory für jede Bezeichnung aufgerufen, deren Ziel leer ist oder noch dem pt-BR-Text entspricht. Bereits abweichende Übersetzungen bleiben erhalten. Fehler möglich: Netz, Kontingent, Browser.',
  fb_schema_translate_now: 'Jetzt übersetzen',
  fb_schema_translate_now_loading: 'Übersetze…',
  fb_schema_translate_now_title:
    'Übersetzung sofort für die gewählte Sprache ausführen (hilfreich, wenn Beschriftungen weiterhin Portugiesisch sind).',
  fb_forms_list_locales_tip: 'Sprachen mit Beschriftungen in dieser Vorlage: {list}',
  fb_locale_lbl: 'Admin-Sprache',
  fb_pageTitle: 'Aria Admin, Formular-Editor',
  fb_bc_panel: 'Start',
  fb_bc_builder: 'Formular-Editor',
  fb_hero_title: 'Formular-Editor',
  fb_hero_sub:
    'Erstellen Sie das Formularschema für die App: Felder, Regeln, Symbol und Abschnittsnavigation. Nutzen Sie das aufklappbare Panel unten für Titel, öffentliche Beschreibung, Status und App-Shortcuts.',
  fb_save: 'Formular speichern',
  fb_new: 'Neu erstellen',
  fb_open: 'Formular öffnen',
  fb_toolbox_title: 'Dynamische Felder',
  fb_unsaved: 'Ungespeicherte Änderungen',
  fb_unsaved_leave: 'Es gibt ungespeicherte Änderungen. Trotzdem verlassen?',
  fb_prop_voice_lang_hint:
    'Liste aus den <b>aktiven regionalen Profilen</b> der Plattform (SaaS). Optional; hilft bei Akzent und Rauschen.',
});

function interpolate(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

/** Formata inteiro para o locale da interface do admin (não o seletor de rótulos do canvas). */
export function fbFormatInt(n) {
  return Number(n).toLocaleString(adminIntlLocale(getAdminUiLocale()));
}

export function fbT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

/** Traduções só para o canvas / cartões / TYPE no canvas — alinhadas a `__formSchemaEditLocale`. */
export function fbTCanvas(key, vars) {
  const raw = adminResolve(M, formBuilderCanvasUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setInputPh(id, ph) {
  const el = document.getElementById(id);
  if (el && 'placeholder' in el) el.placeholder = ph;
}

/** Aplica textos estáticos do chrome do Forms Builder (ids no checklists.html). */
export function applyChecklistsBuilderChromeI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }

  document.title = fbT('fb_pageTitle');

  const bcPanel = document.getElementById('fb-bc-panel');
  if (bcPanel) bcPanel.textContent = fbT('fb_bc_panel');
  setText('fb-bc-builder', fbT('fb_bc_builder'));

  setText('fb-hero-heading-text', fbT('fb_hero_title'));
  const heroSub = document.querySelector('.fb-page-hero .page-hero-sub');
  if (heroSub) heroSub.textContent = fbT('fb_hero_sub');

  setText('fb-btn-open-lbl', fbT('fb_open'));
  const openBtn = document.getElementById('forms-modal-btn');
  if (openBtn) openBtn.title = fbT('fb_open_title');

  setText('fb-btn-new-lbl', fbT('fb_new'));
  const newBtn = document.querySelector('[data-fb-action="new-form"]');
  if (newBtn) newBtn.title = fbT('fb_new_title');

  const imp = document.querySelector('[data-fb-action="import-json"]');
  if (imp) {
    imp.title = fbT('fb_import_title');
    imp.setAttribute('aria-label', fbT('fb_import_title'));
  }
  const exp = document.querySelector('[data-fb-action="export-json"]');
  if (exp) {
    exp.title = fbT('fb_export_title');
    exp.setAttribute('aria-label', fbT('fb_export_title'));
  }

  setText('fb-btn-copilot-lbl', fbT('fb_copilot'));
  const cop = document.getElementById('ai-copilot-toggle-btn');
  if (cop) cop.title = fbT('fb_copilot_title');

  setText('fb-btn-preview-lbl', fbT('fb_preview'));
  setText('fb-btn-geofence-lbl', fbT('fb_geofence'));
  setText('fb-btn-duration-lbl', fbT('fb_duration'));
  const geoNav = document.getElementById('fb-btn-geofence-nav');
  if (geoNav) geoNav.title = fbT('mdl_geofence_title');
  const durBtn = document.querySelector('[data-fb-action="form-duration"]');
  if (durBtn) durBtn.title = fbT('fb_duration_title');

  setText('fb-btn-save-lbl', fbT('fb_save'));
  const saveBtn = document.getElementById('fb-save-schema-btn');
  if (saveBtn) saveBtn.title = fbT('fb_save_title');

  const badge = document.getElementById('fb-unsaved-badge');
  if (badge) badge.textContent = fbT('fb_unsaved');

  setText('fb-toolbox-panel-title', fbT('fb_toolbox_title'));
  setInputPh('fb-toolbox-filter', fbT('fb_toolbox_filter_ph'));

  const tabList = document.getElementById('fb-toolbox-tablist');
  if (tabList) tabList.setAttribute('aria-label', fbT('fb_toolbox_tablist_aria'));
  setText('fb-toolbox-tab-basic', fbT('fb_cat_basic'));
  setText('fb-toolbox-tab-premium', fbT('fb_cat_premium'));
  setText('fb-toolbox-tab-wfm', fbT('fb_cat_wfm'));
  setText('fb-toolbox-tab-audit', fbT('fb_cat_audit'));
  setText('fb-toolbox-tab-launches', fbT('fb_cat_launches'));
  setText('fb-toolbox-tab-ai', fbT('fb_cat_ai'));
  applyChecklistsToolboxI18n();

  setText('fb-canvas-panel-title', fbT('fb_canvas_panel'));
  setText('fb-schema-locale-hint', fbT('fb_schema_locale_hint'));
  const schemaLocSel = document.getElementById('fb-schema-locale-select');
  if (schemaLocSel) {
    schemaLocSel.setAttribute('title', fbT('fb_schema_locale_select_title'));
  }
  const schemaCopyBtn = document.getElementById('fb-schema-locale-copy-btn');
  if (schemaCopyBtn) {
    schemaCopyBtn.textContent = fbT('fb_schema_copy_primary');
    schemaCopyBtn.setAttribute('title', fbT('fb_schema_copy_primary_title'));
    schemaCopyBtn.setAttribute('aria-label', fbT('fb_schema_copy_primary_title'));
  }
  const schemaTranslateNowBtn = document.getElementById('fb-schema-translate-now-btn');
  if (schemaTranslateNowBtn) {
    schemaTranslateNowBtn.textContent = fbT('fb_schema_translate_now');
    schemaTranslateNowBtn.setAttribute('title', fbT('fb_schema_translate_now_title'));
    schemaTranslateNowBtn.setAttribute('aria-label', fbT('fb_schema_translate_now_title'));
  }
  setText('fb-schema-auto-translate-lbl', fbT('fb_schema_auto_translate_lbl'));
  const autoTrCb = document.getElementById('fb-schema-auto-translate');
  if (autoTrCb) {
    autoTrCb.setAttribute('title', fbT('fb_schema_auto_translate_title'));
    autoTrCb.setAttribute('aria-label', fbT('fb_schema_auto_translate_title'));
  }
  try {
    if (typeof window.updateFbSchemaCopyButtonState === 'function') window.updateFbSchemaCopyButtonState();
  } catch {
    /* builder ainda não carregou */
  }

  setText('fb-label-tpl-title', fbT('fb_label_form_title'));
  setText('fb-label-form-active', fbT('fb_label_form_active'));
  setText('fb-hint-form-active', fbT('fb_hint_form_active'));
  setInputPh('tpl-title', fbT('fb_placeholder_form_title'));
  try {
    if (typeof window.__fbApplyLocalizedDefaultFormTitle === 'function') {
      window.__fbApplyLocalizedDefaultFormTitle();
    }
  } catch {
    /* ignore */
  }
  setText('fb-meta-summary-hint', fbT('fb_meta_summary_hint'));
  try {
    if (typeof window.fbSyncFormMetaSummary === 'function') window.fbSyncFormMetaSummary();
  } catch {
    /* ignore */
  }
  setText('fb-label-tpl-desc', fbT('fb_label_public_desc'));
  setInputPh('tpl-desc', fbT('fb_placeholder_public_desc'));

  const iconTrig = document.getElementById('tpl-form-icon-trigger');
  if (iconTrig) {
    iconTrig.title = fbT('fb_tpl_icon_title');
    iconTrig.setAttribute('aria-label', fbT('fb_tpl_icon_aria'));
  }

  setText('fb-nav-help-summary-text', fbT('fb_nav_help_summary'));
  setText('fb-nav-help-p1', fbT('fb_nav_help_p1'));
  setText('fb-nav-help-p2', fbT('fb_nav_help_p2'));
  setText('mdl-app-layout-title', fbT('fb_app_layout_modal_title'));
  setText('mdl-app-layout-intro', fbT('fb_app_layout_modal_intro'));
  setText('mdl-app-layout-close', fbT('fb_app_layout_done'));
  const layoutOpen = document.getElementById('fb-app-layout-open-btn');
  if (layoutOpen) layoutOpen.title = fbT('fb_app_layout_open_title');

  const startGrp = document.querySelector('.fb-app-start-group');
  if (startGrp) startGrp.title = fbT('fb_app_start_group_title');

  setText('fb-app-start-direct', fbT('fb_app_start_direct'));
  setText('fb-app-start-direct-hint', fbT('fb_app_start_direct_hint'));
  setText('fb-app-start-hub', fbT('fb_app_start_hub'));
  setText('fb-app-start-hub-hint', fbT('fb_app_start_hub_hint'));

  setText('fb-app-hub-sep', fbT('fb_app_hub_sep'));
  setText('fb-app-hub-free', fbT('fb_app_hub_free'));
  setText('fb-app-hub-seq', fbT('fb_app_hub_seq'));

  const hubWrap = document.getElementById('app-hub-order-wrap');
  if (hubWrap) hubWrap.title = fbT('fb_app_hub_wrap_title');

  try {
    if (typeof window.updateFbAppLayoutButtonSummary === 'function') window.updateFbAppLayoutButtonSummary();
  } catch {
    /* builder ainda não carregou */
  }

  const navScroll = document.getElementById('fb-app-nav-scroll');
  if (navScroll) navScroll.title = fbT('fb_app_nav_scroll_hint');

  applyChecklistsModalsI18n();

  try {
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  } catch {
    /* ignore */
  }

  try {
    if (
      typeof window.renderProperties === 'function' &&
      typeof window.__fbHasSelectedFieldForProps === 'function' &&
      window.__fbHasSelectedFieldForProps()
    ) {
      window.renderProperties();
    }
  } catch {
    /* ignore */
  }
}

function escapeToolboxLabelHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Rótulos da palette (`.toolbox-item[data-type]` em `checklists.html`). Preserva `ion-icon` e estilos do item. */
export function applyChecklistsToolboxI18n() {
  const host = document.getElementById('toolbox');
  if (!host) return;
  host.querySelectorAll('.toolbox-item[data-type]').forEach((el) => {
    const type = el.getAttribute('data-type');
    if (!type) return;
    const key = 'fb_tb_' + type;
    const label = fbT(key);
    const icon = el.querySelector(':scope > ion-icon');
    const iconHtml = icon ? icon.outerHTML : '';
    if (type === 'vision_ai_analysis') {
      el.innerHTML =
        iconHtml + '<span style="color:#991b1b;font-weight:800">' + escapeToolboxLabelHtml(label) + '</span>';
      return;
    }
    if (type === 'vision_ai_comparison') {
      el.innerHTML =
        iconHtml + '<span style="color:#86198f;font-weight:800">' + escapeToolboxLabelHtml(label) + '</span>';
      return;
    }
    el.innerHTML = iconHtml + escapeToolboxLabelHtml(label);
  });
  try {
    const fi = document.getElementById('fb-toolbox-filter');
    if (fi && String(fi.value || '').trim()) {
      fi.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch {
    /* ignore */
  }
}

/** Textos dos modais e painéis (ids em checklists.html). */
export function applyChecklistsModalsI18n() {
  setText('field-properties-modal-title', fbT('mdl_field_props_title'));
  const fpClose = document.getElementById('mdl-field-props-close-btn');
  if (fpClose) {
    fpClose.title = fbT('mdl_field_props_close');
    fpClose.setAttribute('aria-label', fbT('mdl_field_props_close'));
  }
  setText('mdl-field-props-ok', fbT('mdl_field_props_ok'));

  setText('mobile-preview-title', fbT('mdl_mobile_preview_app'));
  setText('mdl-mobile-sim-nav', fbT('mdl_mobile_preview_sim_nav'));
  setText('mdl-mobile-btn-list', fbT('mdl_mobile_preview_list'));
  setText('mdl-mobile-btn-wizard', fbT('mdl_mobile_preview_wizard'));
  setText('mdl-mobile-btn-hybrid', fbT('mdl_mobile_preview_hybrid'));
  const mNotice = document.getElementById('mdl-mobile-preview-notice');
  if (mNotice) {
    mNotice.textContent = fbT('mdl_mobile_preview_notice');
  }

  setText('mdl-forms-title', fbT('mdl_forms_title'));
  setText('mdl-forms-sub', fbT('mdl_forms_sub'));
  setInputPh('form-search', fbT('mdl_forms_search_ph'));
  setText('mdl-forms-filter-archived-text', fbT('mdl_forms_filter_non_archived'));
  setText('forms-tree-tip', fbT('mdl_forms_tree_tip'));
  setText('btn-new-template-folder', fbT('mdl_forms_new_folder'));
  const btnHere = document.querySelector('[data-fb-forms-new-here]');
  if (btnHere) btnHere.textContent = fbT('mdl_forms_new_here');

  setText('mdl-folder-title', fbT('mdl_folder_title'));
  setText('mdl-folder-sub', fbT('mdl_folder_sub'));
  setText('mdl-folder-name-lbl', fbT('mdl_folder_name_lbl'));
  setInputPh('new-folder-name-input', fbT('mdl_folder_name_ph'));
  setText('mdl-folder-cancel', fbT('mdl_cancel'));
  setText('mdl-folder-create', fbT('mdl_folder_create'));

  setText('mdl-geofence-title', fbT('mdl_geofence_title'));
  setText('mdl-geofence-body', fbT('mdl_geofence_body'));
  setText('mdl-geofence-chk-label', fbT('mdl_geofence_chk'));
  setText('mdl-geofence-radius-lbl', fbT('mdl_geofence_radius'));
  setText('mdl-geofence-hint', fbT('mdl_geofence_hint'));
  setText('mdl-geofence-close', fbT('mdl_geofence_close'));
  setText('mdl-geofence-apply', fbT('mdl_geofence_apply'));

  setText('mdl-duration-title', fbT('mdl_duration_title'));
  setText('mdl-duration-body', fbT('mdl_duration_body'));
  setText('mdl-duration-lbl', fbT('mdl_duration_lbl'));
  setInputPh('expected-form-duration-minutes', fbT('mdl_duration_ph'));
  setText('mdl-duration-hint', fbT('mdl_duration_hint'));
  setText('mdl-duration-close', fbT('mdl_geofence_close'));
  setText('mdl-duration-apply', fbT('mdl_geofence_apply'));

  setText('mdl-section-title', fbT('mdl_section_title'));
  setText('mdl-section-body', fbT('mdl_section_body'));
  setText('mdl-section-name-lbl', fbT('mdl_section_name_lbl'));
  setInputPh('section-step-edit-title', fbT('mdl_section_name_ph'));
  setText('mdl-section-pick-icon', fbT('mdl_section_pick_icon'));
  setText('mdl-section-clear-icon', fbT('mdl_section_clear_icon'));
  setText('mdl-section-cancel', fbT('mdl_cancel'));
  setText('mdl-section-apply', fbT('mdl_section_apply'));

  setText('mdl-icon-picker-title', fbT('mdl_icon_title'));
  setText('mdl-icon-search-lbl', fbT('mdl_icon_search_lbl'));
  setInputPh('icon-search', fbT('mdl_icon_search_ph'));
  setText('mdl-icon-lib-lbl', fbT('mdl_icon_lib'));
  setText('mdl-icon-color-lbl', fbT('mdl_icon_color'));
  setText('mdl-icon-remove', fbT('mdl_icon_remove'));
  setText('mdl-icon-cancel', fbT('mdl_cancel'));

  setText('mdl-logic-title', fbT('mdl_logic_title'));
  setText('mdl-logic-h4', fbT('mdl_logic_h4'));
  setText('mdl-logic-add', fbT('mdl_logic_add'));
  setText('mdl-logic-empty', fbT('mdl_logic_empty'));
  setText('mdl-logic-cancel', fbT('mdl_cancel'));
  const logicSave = document.getElementById('mdl-logic-save');
  if (logicSave) {
    logicSave.innerHTML =
      '<ion-icon name="save-outline" style="vertical-align:-2px"></ion-icon> ' + fbT('mdl_logic_save');
  }
  const logicClose = document.getElementById('mdl-logic-close');
  if (logicClose) logicClose.setAttribute('aria-label', fbT('mdl_logic_close_aria'));

  try {
    const logicModal = document.getElementById('logic-modal');
    if (
      logicModal &&
      logicModal.style.display === 'flex' &&
      typeof window.renderLogicRules === 'function'
    ) {
      window.renderLogicRules();
    }
  } catch {
    /* ignore */
  }

  const copHead = document.querySelector('.ai-copilot-head h4');
  if (copHead) copHead.title = fbT('mdl_copilot_drag_title');
  setText('mdl-copilot-head-text', fbT('fb_copilot'));
  const optLbl = document.querySelector('#ai-copilot-menu-toggle-btn .ai-copilot-menu-toggle-label');
  if (optLbl) optLbl.textContent = fbT('mdl_copilot_options');
  const optBtn = document.getElementById('ai-copilot-menu-toggle-btn');
  if (optBtn) optBtn.title = fbT('mdl_copilot_options_title');
  const closeCop = document.getElementById('ai-copilot-close-btn');
  if (closeCop) {
    closeCop.setAttribute('aria-label', fbT('mdl_copilot_close_aria'));
    closeCop.title = fbT('mdl_copilot_close_aria');
  }
  setText('ai-copilot-thinking-label', fbT('mdl_copilot_thinking'));
  setInputPh('ai-copilot-input', fbT('mdl_copilot_input_ph'));
  const sendFab = document.getElementById('ai-copilot-send-fab');
  if (sendFab) {
    sendFab.title = fbT('mdl_copilot_send');
    sendFab.setAttribute('aria-label', fbT('mdl_copilot_send_aria'));
  }
  const attachFab = document.getElementById('ai-copilot-attach-fab');
  if (attachFab) {
    attachFab.title = fbT('mdl_copilot_attach_title');
    attachFab.setAttribute('aria-label', fbT('mdl_copilot_attach_aria'));
  }
  const menuEyebrow = document.querySelector('.ai-copilot-menu-eyebrow span');
  if (menuEyebrow) menuEyebrow.textContent = fbT('mdl_copilot_menu_eyebrow');
  const collBtn = document.querySelector('.ai-copilot-menu-collapse-btn');
  if (collBtn) {
    collBtn.setAttribute('aria-label', fbT('mdl_copilot_collapse_aria'));
    collBtn.title = fbT('mdl_copilot_collapse_title');
  }
  setText('mdl-copilot-follow-txt', fbT('mdl_copilot_follow_canvas'));
  setText('copilot-pin-selection-btn', fbT('mdl_copilot_pin'));
  setText('copilot-clear-focus-btn', fbT('mdl_copilot_clear_focus'));
  const clar = document.getElementById('ai-copilot-clarify-hint');
  if (clar) clar.textContent = fbT('mdl_copilot_clarify_hint');
  const advSummary = document.getElementById('mdl-copilot-adv-summary-txt');
  if (advSummary) advSummary.textContent = fbT('mdl_copilot_adv_summary');
  const undoHint = document.querySelector('.ai-copilot-confirm-block p');
  if (undoHint) undoHint.textContent = fbT('mdl_copilot_undo_hint');
  const undoBtn = document.getElementById('ai-copilot-undo-btn');
  if (undoBtn) {
    undoBtn.title = fbT('mdl_copilot_undo_title');
    undoBtn.setAttribute('aria-label', fbT('mdl_copilot_undo'));
    if (!undoBtn.querySelector('ion-icon')) {
      undoBtn.innerHTML =
        '<ion-icon name="arrow-undo-outline" style="font-size:20px"></ion-icon>';
    }
  }
  const clearChatHead = document.getElementById('ai-copilot-clear-btn');
  if (clearChatHead) {
    clearChatHead.title = fbT('mdl_copilot_clear_chat');
    clearChatHead.setAttribute('aria-label', fbT('mdl_copilot_clear_chat'));
    if (!clearChatHead.querySelector('ion-icon')) {
      clearChatHead.innerHTML =
        '<ion-icon name="trash-outline" style="font-size:20px"></ion-icon>';
    }
  }

  const cph = document.getElementById('copilot-preview-intro');
  if (cph) cph.textContent = fbT('mdl_copilot_preview_intro');
  setText('copilot-schema-preview-heading', fbT('mdl_copilot_preview_title'));
  setText('copilot-prev-th-inc', fbT('mdl_copilot_prev_th_inc'));
  setText('copilot-prev-th-field', fbT('mdl_copilot_prev_th_field'));
  setText('copilot-prev-th-type', fbT('mdl_copilot_prev_th_type'));
  setText('copilot-prev-th-desc', fbT('mdl_copilot_prev_th_desc'));
  setText('copilot-prev-th-ai', fbT('mdl_copilot_prev_th_ai'));
  setText('copilot-prev-th-req', fbT('mdl_copilot_prev_th_req'));
  const prevNoteLbl = document.querySelector('label[for="copilot-schema-preview-general-note"]');
  if (prevNoteLbl) prevNoteLbl.textContent = fbT('mdl_copilot_prev_notes_lbl');
  const prevNoteP = document.getElementById('copilot-preview-notes-hint');
  if (prevNoteP) prevNoteP.textContent = fbT('mdl_copilot_prev_notes_hint');
  setInputPh('copilot-schema-preview-general-note', fbT('mdl_copilot_prev_notes_ph'));
  setText('copilot-preview-mark-optional', fbT('mdl_copilot_prev_optional'));
  setText('copilot-preview-cancel', fbT('mdl_cancel'));
  const prevRe = document.getElementById('copilot-preview-reprocess');
  if (prevRe)
    prevRe.innerHTML =
      '<ion-icon name="refresh-outline" style="vertical-align:-2px"></ion-icon> ' +
      fbT('mdl_copilot_prev_reprocess');
  const prevAp = document.getElementById('copilot-preview-apply');
  if (prevAp)
    prevAp.innerHTML =
      '<ion-icon name="checkmark-done-outline" style="vertical-align:-2px"></ion-icon> ' +
      fbT('mdl_copilot_prev_apply');

  setText('mdl-delete-form-title', fbT('mdl_delete_form_title'));
  setText('mdl-delete-form-body', fbT('mdl_delete_form_body'));
  setText('custom-confirm-cancel', fbT('mdl_cancel'));
  setText('custom-confirm-yes', fbT('mdl_delete_form_yes'));
}

/** Indicador curto de sincronização (toolbar). */
export function setFbSyncStatus(mode) {
  const el = document.getElementById('fb-sync-status');
  if (!el) return;
  const map = {
    idle: fbT('fb_sync_idle'),
    saving: fbT('fb_sync_saving'),
    local: fbT('fb_sync_local'),
    cloud: fbT('fb_sync_cloud'),
    error: fbT('fb_sync_error'),
  };
  el.textContent = map[mode] != null ? map[mode] : fbT('fb_sync_idle');
  el.title = mode === 'error' ? fbT('fb_sync_error') : '';
}

let __fbLocaleListenerBound = false;

export function bindChecklistsBuilderLocaleHotReload() {
  if (__fbLocaleListenerBound) return;
  __fbLocaleListenerBound = true;
  window.addEventListener('storage', (ev) => {
    if (ev.key === LS_LOCALE) {
      applyChecklistsBuilderChromeI18n();
    }
  });
}

const FB_TOOLBOX_TAB_LS = 'aria_fb_toolbox_tab';
const FB_VALID_TOOLBOX_TABS = new Set(['basic', 'premium', 'wfm', 'audit', 'launches', 'ai']);

function readSavedToolboxTab() {
  try {
    const t = localStorage.getItem(FB_TOOLBOX_TAB_LS);
    if (t && FB_VALID_TOOLBOX_TABS.has(t)) return t;
  } catch {
    /* ignore */
  }
  return 'basic';
}

function persistToolboxTab(t) {
  try {
    localStorage.setItem(FB_TOOLBOX_TAB_LS, t);
  } catch {
    /* ignore */
  }
}

/**
 * Mostra uma categoria da palette (tabs). Sem UI de tabs no DOM, não faz nada.
 * Exportado para poder sincronizar após mudanças de markup em cache.
 */
export function setFbToolboxTab(tabId) {
  const host = document.getElementById('toolbox');
  if (!host || !FB_VALID_TOOLBOX_TABS.has(tabId)) return;
  if (!host.querySelector('.fb-toolbox-tab[role="tab"]')) return;

  host.querySelectorAll('.fb-toolbox-tab[role="tab"]').forEach((btn) => {
    const id = btn.getAttribute('data-fb-toolbox-tab');
    const sel = id === tabId;
    btn.setAttribute('aria-selected', sel ? 'true' : 'false');
    btn.tabIndex = sel ? 0 : -1;
  });
  host.querySelectorAll('.fb-toolbox-pane[data-fb-toolbox-pane]').forEach((pane) => {
    const id = pane.getAttribute('data-fb-toolbox-pane');
    if (id === tabId) pane.removeAttribute('hidden');
    else pane.setAttribute('hidden', '');
  });
  persistToolboxTab(tabId);
}

function bindFbToolboxTabClicksOnce(host) {
  if (host.dataset.fbToolboxTabsBound === '1') return;
  host.dataset.fbToolboxTabsBound = '1';
  host.querySelectorAll('.fb-toolbox-tab[role="tab"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-fb-toolbox-tab');
      if (t) setFbToolboxTab(t);
    });
  });
}

function initFbToolboxTabsFromDom() {
  const host = document.getElementById('toolbox');
  if (!host || !host.querySelector('.fb-toolbox-tab[role="tab"]')) return;
  bindFbToolboxTabClicksOnce(host);
  setFbToolboxTab(readSavedToolboxTab());
}

/** Filtro client-side nos itens da palette; com texto activa modo pesquisa (painéis empilhados). */
export function initToolboxTypeFilter() {
  const input = document.getElementById('fb-toolbox-filter');
  const host = document.getElementById('toolbox');
  if (!input || !host) return;

  initFbToolboxTabsFromDom();

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  function apply() {
    const q = norm(input.value.trim());
    const items = host.querySelectorAll('.toolbox-item');
    const panes = host.querySelectorAll('.fb-toolbox-pane[data-fb-toolbox-pane]');

    items.forEach((el) => {
      const hay = norm(el.textContent || '');
      el.style.display = !q || hay.includes(q) ? '' : 'none';
    });

    if (q && panes.length) {
      host.classList.add('fb-toolbox--filtering');
      panes.forEach((pane) => {
        const any = [...pane.querySelectorAll('.toolbox-item')].some((n) => n.style.display !== 'none');
        if (any) pane.removeAttribute('hidden');
        else pane.setAttribute('hidden', '');
      });
    } else {
      host.classList.remove('fb-toolbox--filtering');
      if (panes.length && host.querySelector('.fb-toolbox-tab[role="tab"]')) {
        setFbToolboxTab(readSavedToolboxTab());
      }
    }
  }

  input.addEventListener('input', apply);
  input.addEventListener('change', apply);
}
