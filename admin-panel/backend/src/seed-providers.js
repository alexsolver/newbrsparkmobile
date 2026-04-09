'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const providers = [
  // ── ELÉTRICA (10) ──────────────────────────────────────────────────────
  { category: 'Elétrica', name: 'Eletrotec SP', rating: 4.8, reviews: 142, verified: true, city: 'São Paulo', tags: ['residencial','instalação','manutenção'], keywords: 'eletricista instalação elétrica tomada disjuntor', phone: '(11) 98001-0001' },
  { category: 'Elétrica', name: 'Elétrica Rápida 24h', rating: 4.6, reviews: 98, verified: true, city: 'São Paulo', tags: ['emergência','24h','rápido'], keywords: 'eletricista emergência curto-circuito noturno', phone: '(11) 98001-0002' },
  { category: 'Elétrica', name: 'Instalações Becker', rating: 4.5, reviews: 67, verified: false, city: 'Guarulhos', tags: ['industrial','comercial'], keywords: 'eletricista industrial painel elétrico', phone: '(11) 98001-0003' },
  { category: 'Elétrica', name: 'Energia Total', rating: 4.9, reviews: 231, verified: true, city: 'Campinas', tags: ['solar','fotovoltaico','residencial'], keywords: 'energia solar painel fotovoltaico instalação', phone: '(19) 98001-0004' },
  { category: 'Elétrica', name: 'Voltagem Certa', rating: 4.3, reviews: 44, verified: false, city: 'Osasco', tags: ['manutenção','revisão'], keywords: 'eletricista revisão fiação elétrica', phone: '(11) 98001-0005' },
  { category: 'Elétrica', name: 'Master Eletro', rating: 4.7, reviews: 189, verified: true, city: 'São Paulo', tags: ['automação','smart home'], keywords: 'automação residencial controle smart home eletricista', phone: '(11) 98001-0006' },
  { category: 'Elétrica', name: 'Circuito Fácil', rating: 4.2, reviews: 33, verified: false, city: 'Santo André', tags: ['residencial','econômico'], keywords: 'eletricista barato residencial troca fiação', phone: '(11) 98001-0007' },
  { category: 'Elétrica', name: 'Eletro Premium', rating: 4.9, reviews: 312, verified: true, city: 'São Paulo', tags: ['certificado','NR10','premium'], keywords: 'eletricista certificado NR10 CREA laudo', phone: '(11) 98001-0008' },
  { category: 'Elétrica', name: 'Luz & Vida Instalações', rating: 4.6, reviews: 77, verified: true, city: 'São Bernardo', tags: ['iluminação','LED','decoração'], keywords: 'iluminação LED instalação decoração', phone: '(11) 98001-0009' },
  { category: 'Elétrica', name: 'Força Elétrica SP', rating: 4.4, reviews: 55, verified: false, city: 'São Paulo', tags: ['gerador','nobreak'], keywords: 'gerador instalação nobreak UPS eletricista', phone: '(11) 98001-0010' },

  // ── HIDRÁULICA (10) ────────────────────────────────────────────────────
  { category: 'Hidráulica', name: 'HidroFix Brasil', rating: 4.7, reviews: 203, verified: true, city: 'São Paulo', tags: ['vazamento','encanamento','rápido'], keywords: 'encanador vazamento cano rompido conserto', phone: '(11) 98002-0001' },
  { category: 'Hidráulica', name: 'AquaTec Soluções', rating: 4.5, reviews: 88, verified: true, city: 'São Paulo', tags: ['caixa-dágua','bomba','instalação'], keywords: 'caixa dágua bomba hidráulica pressão instalação', phone: '(11) 98002-0002' },
  { category: 'Hidráulica', name: 'Encanador Express', rating: 4.3, reviews: 61, verified: false, city: 'Guarulhos', tags: ['emergência','24h'], keywords: 'encanador emergência vazamento noturno', phone: '(11) 98002-0003' },
  { category: 'Hidráulica', name: 'Água Certa', rating: 4.8, reviews: 145, verified: true, city: 'Campinas', tags: ['reuso','sustentável','filtração'], keywords: 'filtro água tratamento reuso sustentável', phone: '(19) 98002-0004' },
  { category: 'Hidráulica', name: 'Master Plumber', rating: 4.6, reviews: 92, verified: true, city: 'São Paulo', tags: ['industrial','comercial','residencial'], keywords: 'encanador industrial residencial comercial tubulação', phone: '(11) 98002-0005' },
  { category: 'Hidráulica', name: 'Hidro Emergência', rating: 4.4, reviews: 76, verified: false, city: 'Osasco', tags: ['emergência','desentupimento'], keywords: 'desentupimento esgoto pia vaso sanitário entupido', phone: '(11) 98002-0006' },
  { category: 'Hidráulica', name: 'Obras & Água', rating: 4.2, reviews: 38, verified: false, city: 'São Paulo', tags: ['obra','reforma'], keywords: 'obra reforma banheiro cozinha encanamento novo', phone: '(11) 98002-0007' },
  { category: 'Hidráulica', name: 'FlowTech SP', rating: 4.9, reviews: 267, verified: true, city: 'São Paulo', tags: ['laudos','SABESP','certificado'], keywords: 'laudo hidráulico SABESP certificado CREA', phone: '(11) 98002-0008' },
  { category: 'Hidráulica', name: 'Tubos & Cia', rating: 4.5, reviews: 114, verified: true, city: 'Santo André', tags: ['aquecedor','gás','instalação'], keywords: 'aquecedor gás instalação boiler chuveiro', phone: '(11) 98002-0009' },
  { category: 'Hidráulica', name: 'Verde Água Sustentável', rating: 4.7, reviews: 83, verified: true, city: 'São Paulo', tags: ['captação','chuva','reuso'], keywords: 'captação água chuva cisterna reuso sustentabilidade', phone: '(11) 98002-0010' },

  // ── LIMPEZA (10) ───────────────────────────────────────────────────────
  { category: 'Limpeza', name: 'Clean Master SP', rating: 4.8, reviews: 334, verified: true, city: 'São Paulo', tags: ['residencial','periódica','profissional'], keywords: 'faxina limpeza residencial periódica doméstica', phone: '(11) 98003-0001' },
  { category: 'Limpeza', name: 'Brilho Total', rating: 4.6, reviews: 167, verified: true, city: 'São Paulo', tags: ['pós-obra','comercial'], keywords: 'limpeza pós-obra escritório comercial empresa', phone: '(11) 98003-0002' },
  { category: 'Limpeza', name: 'Verde Clean', rating: 4.7, reviews: 98, verified: true, city: 'São Paulo', tags: ['ecológico','produtos naturais'], keywords: 'limpeza ecológica produtos naturais sustentável', phone: '(11) 98003-0003' },
  { category: 'Limpeza', name: 'Lavanderia Express', rating: 4.5, reviews: 221, verified: true, city: 'São Paulo', tags: ['tapete','sofá','colchão'], keywords: 'lavanderia tapete sofá colchão higienização', phone: '(11) 98003-0004' },
  { category: 'Limpeza', name: 'Top Clean 24h', rating: 4.4, reviews: 78, verified: false, city: 'Guarulhos', tags: ['emergência','sinistro'], keywords: 'limpeza emergência sinistro alagamento desastre', phone: '(11) 98003-0005' },
  { category: 'Limpeza', name: 'Vidros & Cia', rating: 4.9, reviews: 189, verified: true, city: 'São Paulo', tags: ['vidros','fachada','predial'], keywords: 'limpeza vidros fachada predial prédio alto risco', phone: '(11) 98003-0006' },
  { category: 'Limpeza', name: 'Serviço Doméstico Premium', rating: 4.8, reviews: 445, verified: true, city: 'São Paulo', tags: ['diarista','semanal','mensal'], keywords: 'diarista faxineira serviço doméstico limpeza casa', phone: '(11) 98003-0007' },
  { category: 'Limpeza', name: 'HigienizaTec', rating: 4.6, reviews: 133, verified: true, city: 'Campinas', tags: ['hospitalar','clínica','asséptico'], keywords: 'limpeza hospitalar clínica asséptica sanitização', phone: '(19) 98003-0008' },
  { category: 'Limpeza', name: 'Piscina Cristal', rating: 4.7, reviews: 256, verified: true, city: 'São Paulo', tags: ['piscina','tratamento','manutenção'], keywords: 'limpeza piscina tratamento água cloro algicida pH', phone: '(11) 98003-0009' },
  { category: 'Limpeza', name: 'PredioLimpo', rating: 4.5, reviews: 87, verified: false, city: 'São Paulo', tags: ['condomínio','área comum'], keywords: 'limpeza condomínio área comum portaria elevador', phone: '(11) 98003-0010' },

  // ── REFORMAS (10) ──────────────────────────────────────────────────────
  { category: 'Reformas', name: 'Reforma Certa SP', rating: 4.7, reviews: 178, verified: true, city: 'São Paulo', tags: ['residencial','banheiro','cozinha'], keywords: 'reforma banheiro cozinha apartamento casa', phone: '(11) 98004-0001' },
  { category: 'Reformas', name: 'Pedreiro Expert', rating: 4.5, reviews: 93, verified: false, city: 'São Paulo', tags: ['alvenaria','reboco','massa'], keywords: 'pedreiro alvenaria reboco massa corrida nivelamento', phone: '(11) 98004-0002' },
  { category: 'Reformas', name: 'Gesso & Design', rating: 4.8, reviews: 211, verified: true, city: 'São Paulo', tags: ['gesso','drywall','forro'], keywords: 'gesseiro drywall forro gesso divisória parede falsa', phone: '(11) 98004-0003' },
  { category: 'Reformas', name: 'Piso & Azulejo Pro', rating: 4.6, reviews: 144, verified: true, city: 'São Paulo', tags: ['piso','azulejo','porcelanato'], keywords: 'assentamento piso azulejo porcelanato rejunte', phone: '(11) 98004-0004' },
  { category: 'Reformas', name: 'Construção Rápida', rating: 4.3, reviews: 56, verified: false, city: 'Guarulhos', tags: ['ampliação','construção','prazo'], keywords: 'construção ampliação sala quarto garagem telhado', phone: '(11) 98004-0005' },
  { category: 'Reformas', name: 'Marcenaria Fina', rating: 4.9, reviews: 312, verified: true, city: 'São Paulo', tags: ['marcenaria','armário','cozinha planejada'], keywords: 'marceneiro armário planejado cozinha closet marcenaria', phone: '(11) 98004-0006' },
  { category: 'Reformas', name: 'Pintura Premium', rating: 4.8, reviews: 267, verified: true, city: 'São Paulo', tags: ['pintura','textura','grafiato'], keywords: 'pintor parede textura grafiato apartamento casa', phone: '(11) 98004-0007' },
  { category: 'Reformas', name: 'Remodelação Arquitetônica', rating: 4.7, reviews: 89, verified: true, city: 'São Paulo', tags: ['projeto','arquitetura','design'], keywords: 'arquiteto reforma projeto interiores design', phone: '(11) 98004-0008' },
  { category: 'Reformas', name: 'Serralheria Total', rating: 4.5, reviews: 77, verified: false, city: 'Santo André', tags: ['ferro','alumínio','grade','portão'], keywords: 'serralheria grade portão ferro inox alumínio solda', phone: '(11) 98004-0009' },
  { category: 'Reformas', name: 'Vidraçaria Beleza', rating: 4.6, reviews: 101, verified: true, city: 'São Paulo', tags: ['vidro','espelho','box'], keywords: 'vidraçaria box banheiro espelho vidro temperado', phone: '(11) 98004-0010' },

  // ── JARDINAGEM (8) ─────────────────────────────────────────────────────
  { category: 'Jardinagem', name: 'Jardins SP', rating: 4.8, reviews: 198, verified: true, city: 'São Paulo', tags: ['paisagismo','corte','manutenção'], keywords: 'jardineiro paisagismo gramado poda manutenção jardim', phone: '(11) 98005-0001' },
  { category: 'Jardinagem', name: 'Verde Vivo Paisagismo', rating: 4.7, reviews: 134, verified: true, city: 'São Paulo', tags: ['projeto','irrigação','paisagismo'], keywords: 'paisagismo projeto irrigação plantas jardim', phone: '(11) 98005-0002' },
  { category: 'Jardinagem', name: 'Poda Expert', rating: 4.5, reviews: 67, verified: false, city: 'São Paulo', tags: ['poda','árvore','gramado'], keywords: 'poda árvore galho gramado corte roçagem', phone: '(11) 98005-0003' },
  { category: 'Jardinagem', name: 'AgroVerde', rating: 4.6, reviews: 88, verified: true, city: 'Campinas', tags: ['orgânico','horta','compostagem'], keywords: 'horta orgânica compostagem adubo plantio', phone: '(19) 98005-0004' },
  { category: 'Jardinagem', name: 'Urban Garden', rating: 4.9, reviews: 223, verified: true, city: 'São Paulo', tags: ['jardim vertical','telhado verde'], keywords: 'jardim vertical telhado verde parede vegetal', phone: '(11) 98005-0005' },
  { category: 'Jardinagem', name: 'Muda & Planta', rating: 4.4, reviews: 44, verified: false, city: 'São Paulo', tags: ['mudas','venda','plantio'], keywords: 'mudas plantas venda plantio jardim quintal', phone: '(11) 98005-0006' },
  { category: 'Jardinagem', name: 'Piscina & Jardim Total', rating: 4.7, reviews: 156, verified: true, city: 'São Paulo', tags: ['piscina','jardim','manutenção'], keywords: 'manutenção piscina jardim quintal area externa', phone: '(11) 98005-0007' },
  { category: 'Jardinagem', name: 'EcoPaisagem', rating: 4.6, reviews: 79, verified: true, city: 'São Paulo', tags: ['sustentável','ecológico'], keywords: 'paisagismo ecológico sustentável plantas nativas mata', phone: '(11) 98005-0008' },

  // ── SEGURANÇA (8) ──────────────────────────────────────────────────────
  { category: 'Segurança', name: 'SecureTech SP', rating: 4.8, reviews: 201, verified: true, city: 'São Paulo', tags: ['câmeras','CFTV','alarme'], keywords: 'câmera segurança CFTV alarme monitoramento instalação', phone: '(11) 98006-0001' },
  { category: 'Segurança', name: 'Vigilância Total', rating: 4.6, reviews: 145, verified: true, city: 'São Paulo', tags: ['vigilante','portaria','ronda'], keywords: 'vigilante portaria ronda segurança condomínio empresa', phone: '(11) 98006-0002' },
  { category: 'Segurança', name: 'Trava Forte', rating: 4.7, reviews: 98, verified: true, city: 'São Paulo', tags: ['fechadura','cofre','arrombamento'], keywords: 'chaveiro fechadura cofre arrombamento abertura porta', phone: '(11) 98006-0003' },
  { category: 'Segurança', name: 'Controle de Acesso Pro', rating: 4.9, reviews: 267, verified: true, city: 'São Paulo', tags: ['biometria','controle acesso','catracas'], keywords: 'controle acesso biometria catraca tag RFID cartão', phone: '(11) 98006-0004' },
  { category: 'Segurança', name: 'AlarmPro Brasil', rating: 4.5, reviews: 133, verified: true, city: 'Campinas', tags: ['alarme','monitoramento 24h'], keywords: 'alarme monitoramento central 24h disparo sensor', phone: '(19) 98006-0005' },
  { category: 'Segurança', name: 'Cerca Elétrica SP', rating: 4.4, reviews: 77, verified: false, city: 'São Paulo', tags: ['cerca elétrica','manutenção'], keywords: 'cerca elétrica instalação manutenção aterramento', phone: '(11) 98006-0006' },
  { category: 'Segurança', name: 'Drone Vigilância', rating: 4.7, reviews: 45, verified: true, city: 'São Paulo', tags: ['drone','monitoramento aéreo','fazenda'], keywords: 'drone monitoramento aéreo fazenda perímetro inspeção', phone: '(11) 98006-0007' },
  { category: 'Segurança', name: 'Safe Residências', rating: 4.8, reviews: 189, verified: true, city: 'São Paulo', tags: ['cofre','instalação','residencial'], keywords: 'cofre instalação residencial embutido parede seguro', phone: '(11) 98006-0008' },

  // ── CLIMATIZAÇÃO (8) ───────────────────────────────────────────────────
  { category: 'Climatização', name: 'Ar Gelado SP', rating: 4.8, reviews: 312, verified: true, city: 'São Paulo', tags: ['ar-condicionado','instalação','limpeza'], keywords: 'ar condicionado instalação limpeza manutenção', phone: '(11) 98007-0001' },
  { category: 'Climatização', name: 'Clima Perfeito', rating: 4.7, reviews: 189, verified: true, city: 'São Paulo', tags: ['split','multi-split','VRF'], keywords: 'split multi split VRF inverter instalação', phone: '(11) 98007-0002' },
  { category: 'Climatização', name: 'Refrigeração Total', rating: 4.5, reviews: 98, verified: false, city: 'São Paulo', tags: ['câmera fria','comercial'], keywords: 'câmera fria refrigeração comercial restaurante supermercado', phone: '(11) 98007-0003' },
  { category: 'Climatização', name: 'Ventilação Inteligente', rating: 4.6, reviews: 77, verified: true, city: 'Campinas', tags: ['exaustor','ventilação','limpeza dutos'], keywords: 'exaustor duto ventilação limpeza higienização', phone: '(19) 98007-0004' },
  { category: 'Climatização', name: 'EcoClima', rating: 4.9, reviews: 223, verified: true, city: 'São Paulo', tags: ['eficiência energética','inverter'], keywords: 'eficiência energética inverter ar eco sustentável', phone: '(11) 98007-0005' },
  { category: 'Climatização', name: 'Gás Refrigerante Pro', rating: 4.4, reviews: 56, verified: false, city: 'São Paulo', tags: ['recarga','gás','R-410A'], keywords: 'recarga gás R410A R22 ar condicionado refrigerante', phone: '(11) 98007-0006' },
  { category: 'Climatização', name: 'Laudo Técnico AC', rating: 4.7, reviews: 88, verified: true, city: 'São Paulo', tags: ['laudo','PMOC','manutenção preventiva'], keywords: 'laudo PMOC manutenção preventiva ar condicionado ABNT', phone: '(11) 98007-0007' },
  { category: 'Climatização', name: 'Aquecimento Radiante', rating: 4.8, reviews: 67, verified: true, city: 'São Paulo', tags: ['piso aquecido','aquecimento','laje'], keywords: 'piso aquecido radiant heat aquecimento laje infraestrutura', phone: '(11) 98007-0008' },

  // ── TECNOLOGIA (8) ─────────────────────────────────────────────────────
  { category: 'Tecnologia', name: 'TechFix SP', rating: 4.7, reviews: 234, verified: true, city: 'São Paulo', tags: ['notebook','desktop','reparo'], keywords: 'técnico computador notebook desktop reparo formatação', phone: '(11) 98008-0001' },
  { category: 'Tecnologia', name: 'Rede & Wi-Fi Pro', rating: 4.8, reviews: 178, verified: true, city: 'São Paulo', tags: ['rede','Wi-Fi','infraestrutura'], keywords: 'rede Wi-Fi roteador ponto acesso cabeamento ethernet', phone: '(11) 98008-0002' },
  { category: 'Tecnologia', name: 'Smart Home Expert', rating: 4.9, reviews: 145, verified: true, city: 'São Paulo', tags: ['automação','Alexa','Google Home'], keywords: 'automação residencial Alexa Google Home programação', phone: '(11) 98008-0003' },
  { category: 'Tecnologia', name: 'CFTV Install', rating: 4.6, reviews: 98, verified: true, city: 'São Paulo', tags: ['câmera IP','NVR','DVR'], keywords: 'câmera IP NVR DVR CFTV instalação configuração', phone: '(11) 98008-0004' },
  { category: 'Tecnologia', name: 'Som & Imagem', rating: 4.7, reviews: 167, verified: true, city: 'São Paulo', tags: ['home theater','som ambiente','TV'], keywords: 'home theater som ambiente TV instalação configuração', phone: '(11) 98008-0005' },
  { category: 'Tecnologia', name: 'Dados & Backup', rating: 4.5, reviews: 67, verified: false, city: 'São Paulo', tags: ['backup','recuperação de dados'], keywords: 'backup recuperação dados HD SSD servidor nuvem', phone: '(11) 98008-0006' },
  { category: 'Tecnologia', name: 'Impressoras & Periféricos', rating: 4.4, reviews: 44, verified: false, city: 'Guarulhos', tags: ['impressora','recarga','manutenção'], keywords: 'impressora recarga toner manutenção scanner periférico', phone: '(11) 98008-0007' },
  { category: 'Tecnologia', name: 'Energia Solar Tech', rating: 4.8, reviews: 201, verified: true, city: 'São Paulo', tags: ['inversor','monitoramento','app'], keywords: 'monitoramento solar inversor app produção energia', phone: '(11) 98008-0008' },

  // ── DEDETIZAÇÃO (6) ────────────────────────────────────────────────────
  { category: 'Dedetização', name: 'Dedetiza SP', rating: 4.7, reviews: 178, verified: true, city: 'São Paulo', tags: ['residencial','baratas','ratos'], keywords: 'dedetização baratas ratos cupim formiga pulga residencial', phone: '(11) 98009-0001' },
  { category: 'Dedetização', name: 'Controle de Pragas Pro', rating: 4.6, reviews: 134, verified: true, city: 'São Paulo', tags: ['laudo','certificado ANVISA'], keywords: 'controle pragas laudo certificado ANVISA dedetizador', phone: '(11) 98009-0002' },
  { category: 'Dedetização', name: 'Cupim Zero', rating: 4.8, reviews: 201, verified: true, city: 'São Paulo', tags: ['cupim','madeira','tratamento'], keywords: 'cupim tratamento madeira injeção dedetização', phone: '(11) 98009-0003' },
  { category: 'Dedetização', name: 'Safe Pest', rating: 4.5, reviews: 89, verified: false, city: 'Campinas', tags: ['ecológico','pets seguros'], keywords: 'dedetização ecológica segura pets crianças orgânico', phone: '(19) 98009-0004' },
  { category: 'Dedetização', name: 'Dengue & Mosquito Out', rating: 4.9, reviews: 267, verified: true, city: 'São Paulo', tags: ['dengue','mosquito','preventivo'], keywords: 'dengue mosquito aedes aegypti nebulização preventivo', phone: '(11) 98009-0005' },
  { category: 'Dedetização', name: 'PredioLivre', rating: 4.6, reviews: 112, verified: true, city: 'São Paulo', tags: ['condomínio','contrato anual'], keywords: 'dedetização condomínio contrato anual preventivo pragas', phone: '(11) 98009-0006' },

  // ── MUDANÇA & TRANSPORTES (8) ──────────────────────────────────────────
  { category: 'Mudança', name: 'Mudança Rápida SP', rating: 4.6, reviews: 234, verified: true, city: 'São Paulo', tags: ['residencial','embalagem','seguro'], keywords: 'mudança residencial embalagem caixas seguro transporte', phone: '(11) 98010-0001' },
  { category: 'Mudança', name: 'Trans Fácil', rating: 4.4, reviews: 156, verified: false, city: 'São Paulo', tags: ['caminhão','frete','interior'], keywords: 'frete mudança caminhão interior estado mudança', phone: '(11) 98010-0002' },
  { category: 'Mudança', name: 'Mudança Premium', rating: 4.8, reviews: 189, verified: true, city: 'São Paulo', tags: ['piano','objetos especiais','climatizado'], keywords: 'mudança piano objetos arte especiais climatizado', phone: '(11) 98010-0003' },
  { category: 'Mudança', name: 'Guarda-Móveis SP', rating: 4.7, reviews: 98, verified: true, city: 'São Paulo', tags: ['armazenamento','guarda-volume'], keywords: 'guarda móveis armazenamento self storage temporário', phone: '(11) 98010-0004' },
  { category: 'Mudança', name: 'Montagem Express', rating: 4.5, reviews: 145, verified: false, city: 'São Paulo', tags: ['montagem','IKEA','móvel'], keywords: 'montagem móveis IKEA Tok Stok desmontagem', phone: '(11) 98010-0005' },
  { category: 'Mudança', name: 'Carregador SP', rating: 4.3, reviews: 67, verified: false, city: 'Guarulhos', tags: ['carregadores','ajudantes'], keywords: 'carregadores ajudantes mudança manual braçal', phone: '(11) 98010-0006' },
  { category: 'Mudança', name: 'Mudança Corporativa', rating: 4.9, reviews: 312, verified: true, city: 'São Paulo', tags: ['empresa','escritório','TI'], keywords: 'mudança corporativa empresa escritório equipamentos TI', phone: '(11) 98010-0007' },
  { category: 'Mudança', name: 'Desmontagem & Transporte', rating: 4.6, reviews: 78, verified: true, city: 'São Paulo', tags: ['desmontagem','reassemblagem'], keywords: 'desmontagem remontagem mobiliário planejado', phone: '(11) 98010-0008' },

  // ── GÁS & AQUECIMENTO (6) ─────────────────────────────────────────────
  { category: 'Gás', name: 'Gás Seguro SP', rating: 4.8, reviews: 198, verified: true, city: 'São Paulo', tags: ['instalação','laudo ART','COMGAS'], keywords: 'gás instalação laudo ART COMGAS ABNT NBR segurança', phone: '(11) 98011-0001' },
  { category: 'Gás', name: 'Aquecedor Express', rating: 4.6, reviews: 134, verified: true, city: 'São Paulo', tags: ['aquecedor','boiler','manutenção'], keywords: 'aquecedor gás boiler manutenção conserto instalação', phone: '(11) 98011-0002' },
  { category: 'Gás', name: 'Fogão & Forno Pro', rating: 4.5, reviews: 87, verified: false, city: 'São Paulo', tags: ['fogão','forno','conversão'], keywords: 'fogão forno manutenção conversão gás boca queimador', phone: '(11) 98011-0003' },
  { category: 'Gás', name: 'GLP Residencial', rating: 4.7, reviews: 112, verified: true, city: 'São Paulo', tags: ['GLP','botijão','central de gás'], keywords: 'GLP botijão central gás manifold residencial', phone: '(11) 98011-0004' },
  { category: 'Gás', name: 'Detecção de Vazamentos', rating: 4.9, reviews: 201, verified: true, city: 'São Paulo', tags: ['detector','vazamento','emergência'], keywords: 'detector vazamento gás emergência sensor monóxido', phone: '(11) 98011-0005' },
  { category: 'Gás', name: 'Gas Tec Construção', rating: 4.4, reviews: 56, verified: false, city: 'Campinas', tags: ['obra','projeto','aprovação COMGAS'], keywords: 'projeto gás canalizado obra aprovação COMGAS arquiteto', phone: '(19) 98011-0006' },

  // ── PINTURA (6) ────────────────────────────────────────────────────────
  { category: 'Pintura', name: 'Pintor Master SP', rating: 4.8, reviews: 289, verified: true, city: 'São Paulo', tags: ['interna','externa','textura'], keywords: 'pintor residencial interna externa textura tinta', phone: '(11) 98012-0001' },
  { category: 'Pintura', name: 'Arte & Cor Pintura', rating: 4.9, reviews: 134, verified: true, city: 'São Paulo', tags: ['grafite','mural','artístico'], keywords: 'grafite mural artístico pintura decorativa fachada', phone: '(11) 98012-0002' },
  { category: 'Pintura', name: 'Epóxi & Industriais', rating: 4.7, reviews: 98, verified: true, city: 'São Paulo', tags: ['epóxi','piso','garagem'], keywords: 'epóxi piso garagem galpão industrial pintura', phone: '(11) 98012-0003' },
  { category: 'Pintura', name: 'Fachada Total', rating: 4.6, reviews: 167, verified: true, city: 'São Paulo', tags: ['fachada','predial','externo'], keywords: 'pintura fachada predial externo impermeabilização', phone: '(11) 98012-0004' },
  { category: 'Pintura', name: 'Grafiato Premium', rating: 4.5, reviews: 78, verified: false, city: 'São Paulo', tags: ['grafiato','textura','spray'], keywords: 'grafiato textura spray rolo efeito decorativo', phone: '(11) 98012-0005' },
  { category: 'Pintura', name: 'Verniz & Madeira', rating: 4.7, reviews: 112, verified: true, city: 'São Paulo', tags: ['verniz','madeira','deck','restauração'], keywords: 'verniz madeira deck restauração tratamento lixamento', phone: '(11) 98012-0006' },
];

async function main() {
  console.log(`🌱 Seeding ${providers.length} prestadores de serviço...\n`);
  let count = 0;
  for (const prov of providers) {
    const { tags, ...rest } = prov;
    await p.serviceProvider.upsert({
      where: { id: prov.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 50) },
      update: { rating: prov.rating, reviews: prov.reviews },
      create: {
        id: prov.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 50),
        ...rest,
        tags: tags || [],
        isActive: true,
      },
    });
    count++;
    if (count % 10 === 0) process.stdout.write(`  ${count}/${providers.length}...\r`);
  }
  console.log(`\n✅ ${count} prestadores criados/atualizados no PostgreSQL.`);
}

main().catch(err => { console.error('❌', err); process.exit(1); }).finally(() => p.$disconnect());
