/**
 * Catálogo trilíngue (pt-BR / en-US / es-ES) de modelos de prompt para «Visão de IA — análise».
 * Consumido pelo Forms Builder (modal de exemplos + filtro por área).
 */
'use strict';

/** @param {string} pt @param {string} en @param {string} es */
function T(pt, en, es) {
  return { 'pt-BR': pt, 'en-US': en, 'es-ES': es };
}

/** @param {Record<string, string>} m @param {string} loc */
function pick(m, loc) {
  if (m[loc]) return m[loc];
  if (m['en-US']) return m['en-US'];
  return m['pt-BR'] || '';
}

/** Ordem do seletor (exceto «todas»). */
export const VISION_AI_EXAMPLE_AREA_ORDER = [
  'electrical_energy',
  'hvac_mechanical',
  'plumbing_fluids',
  'civil_finishes',
  'fire_safety',
  'worksite_safety',
  'it_networks',
  'cleaning_facilities',
  'asset_identification',
  'retail_hospitality',
  'outdoor_infra',
  'fleet_vehicles',
  'renewable_energy',
  'agri_rural',
  'food_cold_chain',
  'logistics_warehouse',
  'public_urban',
  'industrial_oem',
  'specialty_other',
];

/** Rótulos de área por locale. */
export const VISION_AI_EXAMPLE_AREA_LABELS = {
  'pt-BR': {
    all: 'Todas as áreas',
    electrical_energy: 'Elétrica e energia',
    hvac_mechanical: 'HVAC e mecânica',
    plumbing_fluids: 'Hidráulica e fluidos',
    civil_finishes: 'Civil e acabamentos',
    fire_safety: 'Incêndio e emergência',
    worksite_safety: 'Segurança em campo / EPI',
    it_networks: 'TI, redes e telecom',
    cleaning_facilities: 'Limpeza e facilities',
    asset_identification: 'Identificação de ativos',
    retail_hospitality: 'Varejo e hospitalidade',
    outdoor_infra: 'Infraestrutura outdoor',
    fleet_vehicles: 'Frota e veículos',
    renewable_energy: 'Solar e renováveis',
    agri_rural: 'Agro e zonas rurais',
    food_cold_chain: 'Alimentos e frio',
    logistics_warehouse: 'Logística e armazém',
    public_urban: 'Urbano e serviços públicos',
    industrial_oem: 'Indústria e OEM',
    specialty_other: 'Outras especialidades',
  },
  'en-US': {
    all: 'All areas',
    electrical_energy: 'Electrical & power',
    hvac_mechanical: 'HVAC & mechanical',
    plumbing_fluids: 'Plumbing & fluids',
    civil_finishes: 'Civil & finishes',
    fire_safety: 'Fire & emergency',
    worksite_safety: 'Field safety / PPE',
    it_networks: 'IT, networks & telecom',
    cleaning_facilities: 'Cleaning & facilities',
    asset_identification: 'Asset identification',
    retail_hospitality: 'Retail & hospitality',
    outdoor_infra: 'Outdoor infrastructure',
    fleet_vehicles: 'Fleet & vehicles',
    renewable_energy: 'Solar & renewables',
    agri_rural: 'Agri & rural sites',
    food_cold_chain: 'Food & cold chain',
    logistics_warehouse: 'Logistics & warehouse',
    public_urban: 'Urban & public services',
    industrial_oem: 'Industry & OEM',
    specialty_other: 'Other specialties',
  },
  'es-ES': {
    all: 'Todas las áreas',
    electrical_energy: 'Eléctrica y energía',
    hvac_mechanical: 'HVAC y mecánica',
    plumbing_fluids: 'Fontanería y fluidos',
    civil_finishes: 'Obra civil y acabados',
    fire_safety: 'Incendios y emergencias',
    worksite_safety: 'Seguridad en campo / EPP',
    it_networks: 'TI, redes y telecom',
    cleaning_facilities: 'Limpieza e instalaciones',
    asset_identification: 'Identificación de activos',
    retail_hospitality: 'Retail y hostelería',
    outdoor_infra: 'Infraestructura exterior',
    fleet_vehicles: 'Flota y vehículos',
    renewable_energy: 'Solar y renovables',
    agri_rural: 'Agro y zonas rurales',
    food_cold_chain: 'Alimentos y cadena de frío',
    logistics_warehouse: 'Logística y almacén',
    public_urban: 'Urbano y servicios públicos',
    industrial_oem: 'Industria y OEM',
    specialty_other: 'Otras especialidades',
  },
};

const RUBRIC_STD = T(
  'Rubrica rating0To10 (alinhe com value):\n- 0–2: inaceitável / não conformidade evidente ou evidência irrelevante.\n- 3–4: vários problemas visíveis ou qualidade fraca.\n- 5–6: aceitável com ressalvas; melhorias necessárias.\n- 7–8: bom estado geral; falhas leves.\n- 9–10: excelente; critérios inequívocos.',
  'rating0To10 rubric (align with value):\n- 0–2: unacceptable / clear non-conformity or irrelevant evidence.\n- 3–4: several visible issues or weak quality.\n- 5–6: acceptable with visible caveats.\n- 7–8: generally good; minor issues.\n- 9–10: excellent; requirements clearly met.',
  'Rúbrica rating0To10 (alineada con value):\n- 0–2: inaceptable / incumplimiento claro o evidencia irrelevante.\n- 3–4: varios problemas visibles o calidad débil.\n- 5–6: aceptable con reservas visibles.\n- 7–8: buen estado general; fallos leves.\n- 9–10: excelente; criterios claramente cumplidos.',
);

const RUBRIC_ELEC = T(
  'Rubrica rating0To10 (alinhe com value):\n- 0–2: perigo evidente ou evidência irrelevante.\n- 3–4: risco moderado claro.\n- 5–6: aceitável com ressalvas.\n- 7–8: bom estado; falhas cosméticas.\n- 9–10: excelente; organização e integridade muito boas.',
  'rating0To10 rubric (align with value):\n- 0–2: clear hazard or irrelevant evidence.\n- 3–4: clear moderate risk.\n- 5–6: acceptable with caveats.\n- 7–8: good; cosmetic issues only.\n- 9–10: excellent; very good order and integrity.',
  'Rúbrica rating0To10:\n- 0–2: peligro evidente o evidencia irrelevante.\n- 3–4: riesgo moderado claro.\n- 5–6: aceptable con matices.\n- 7–8: buen estado; fallos cosméticos.\n- 9–10: excelente; muy buena organización.',
);

const RULES = T(
  'Regras:\n- Baseie-se apenas no visível; se o alvo não aparecer ou estiver ilegível, trate como evidência insuficiente.\n- Não infira testes, medições ou certificações não observáveis.',
  'Rules:\n- Rely only on what is visible; if the target is missing or unreadable, treat as insufficient evidence.\n- Do not infer tests, measurements, or certifications not observable.',
  'Reglas:\n- Base el análisis solo en lo visible; si el objetivo no aparece o es ilegible, trate como evidencia insuficiente.\n- No infiera pruebas, mediciones ni certificaciones no observables.',
);

const CRIT = T(
  'Critérios para value (sim/não):',
  'Criteria for value (yes/no):',
  'Criterios para value (sí/no):',
);

const RAT = T(
  'No rationale (pt-BR), em 2–4 frases curtas, diga o que viu e o que mais puxou a nota.',
  'In rationale (brief), state what you saw and the main driver of the score.',
  'En rationale (es-ES), en 2–4 frases breves, qué vio y qué movió más la nota.',
);

/**
 * @param {string} loc
 * @param {{
 *   context: Record<string,string>,
 *   task: Record<string,string>,
 *   target: Record<string,string>,
 *   yes: Record<string,string>,
 *   no: Record<string,string>,
 *   unknown: Record<string,string>,
 *   rubric?: Record<string,string>,
 * }} p
 */
function composeBody(loc, p) {
  const rub = p.rubric || RUBRIC_STD;
  return (
    `${pick(T('Contexto:', 'Context:', 'Contexto:'), loc)} ${pick(p.context, loc)}\n\n` +
    `${pick(T('Tarefa:', 'Task:', 'Tarea:'), loc)}\n${pick(p.task, loc)}\n\n` +
    `${pick(RULES, loc)}\n\n` +
    `${pick(CRIT, loc)}\n` +
    `${pick(T('- yes:', '- yes:', '- yes:'), loc)} ${pick(p.yes, loc)}\n` +
    `${pick(T('- no:', '- no:', '- no:'), loc)} ${pick(p.no, loc)}\n` +
    `${pick(T('- unknown:', '- unknown:', '- unknown:'), loc)} ${pick(p.unknown, loc)}\n\n` +
    `${pick(rub, loc)}\n\n` +
    `${pick(RAT, loc)}`
  );
}

/** @param {string} raw */
function normLocale(raw) {
  const s = String(raw || '').trim();
  if (s === 'en-US') return 'en-US';
  if (s === 'es-ES') return 'es-ES';
  return 'pt-BR';
}

/**
 * @typedef {{ id: string, areaId: string, title: ReturnType<typeof T>, parts: Parameters<typeof composeBody>[1] & { rubric?: Record<string,string> } }} VisionExRow
 */

/** @type {VisionExRow[]} */
const RAW = [
  {
    id: 'electrical_panel',
    areaId: 'electrical_energy',
    title: T(
      'Instalação elétrica / quadro ou ponto de energia',
      'Electrical install / panel or visible feed',
      'Instalación eléctrica / cuadro o punto de energía',
    ),
    parts: {
      context: T(
        'Inspeção visual de instalação elétrica / quadro ou ponto de energia (1×1 ou grelha 2×2 — um único conjunto de evidência).',
        'Visual inspection of electrical install / panel or visible feed (1×1 or 2×2 grid — single evidence set).',
        'Inspección visual de instalación eléctrica / cuadro o punto de energía (1×1 o cuadrícula 2×2 — un solo conjunto).',
      ),
      task: T(
        '1) Pelo visível, a instalação aparenta condições aceitáveis para operação segura imediata?\n2) Nota global 0–10 (rating0To10) coerente com a rubrica.',
        '1) From what is visible, does the install appear safe for immediate operation?\n2) Overall 0–10 score (rating0To10) aligned with the rubric.',
        '1) Por lo visible, ¿parece apta para operación segura inmediata?\n2) Nota global 0–10 (rating0To10) alineada con la rúbrica.',
      ),
      target: T('quadro, cabos, aterramento visíveis', 'panel, cables, visible grounding', 'cuadro, cables, puesta a tierra visible'),
      yes: T(
        'sem sinais graves de risco (fios expostos sem proteção, derretimento forte, arco-carbonização) e organização mínima.',
        'no severe visible hazards and minimally organized.',
        'sin riesgos graves visibles y organización mínima.',
      ),
      no: T(
        'problema grave inequívoco ou mínimo de segurança/organização claramente não atendido.',
        'clear severe issue or clearly unsafe/disorganized.',
        'problema grave claro o claramente inseguro/desordenado.',
      ),
      unknown: T(
        'imagem não permite ver o necessário ou forte ambiguidade (ângulo, desfoque).',
        'cannot see essentials or strong ambiguity (angle, blur).',
        'no permite ver lo esencial o fuerte ambigüedad (ángulo, desenfoque).',
      ),
      rubric: RUBRIC_ELEC,
    },
  },
  {
    id: 'hvac_outdoor',
    areaId: 'hvac_mechanical',
    title: T('Climatização — unidade externa, dreno e fixação', 'HVAC — outdoor unit, drain, mounting', 'HVAC — unidad exterior, desagüe y fijación'),
    parts: {
      context: T(
        'Equipamento de ar condicionado visível, tubos, dreno e fixação (1×1 ou 2×2).',
        'Visible AC equipment, lines, drain, and mounting (1×1 or 2×2).',
        'Equipo de aire acondicionado visible, tuberías, desagüe y fijación (1×1 o 2×2).',
      ),
      task: T(
        '1) Fixação e percurso de tubos/dreno aparentam seguros e sem vazamento evidente no equipamento?\n2) Nota 0–10.',
        '1) Do mounting and lines/drain look safe with no obvious equipment leak?\n2) Score 0–10.',
        '1) ¿Fijación y trazado parecen seguros sin fuga evidente en el equipo?\n2) Nota 0–10.',
      ),
      target: T('equipamento e trechos visíveis', 'equipment and visible runs', 'equipo y tramos visibles'),
      yes: T('fixação sólida aparente, sem vazamento evidente, dreno conectado de forma plausível.', 'solid mounting, no obvious leak, plausible drain.', 'fijación sólida, sin fuga evidente, desagüe plausible.'),
      no: T('fixação precária, vazamento evidente, tubo esmagado/rompido ou dreno ausente onde deveria aparecer.', 'poor mounting, obvious leak, crushed line or missing drain.', 'fijación deficiente, fuga evidente, tubo dañado o desagüe ausente.'),
      unknown: T('trechos críticos fora de quadro ou imagem insuficiente.', 'critical parts off-frame or insufficient image.', 'partes críticas fuera de encuadre o imagen insuficiente.'),
    },
  },
  {
    id: 'cleaning_post',
    areaId: 'cleaning_facilities',
    title: T('Limpeza pós-obra ou higienização', 'Post-job cleaning / hygiene', 'Limpieza post-obra o higiene'),
    parts: {
      context: T('Ambiente interno após limpeza (piso, rodapés, superfícies visíveis).', 'Interior after cleaning (floor, baseboards, visible surfaces).', 'Interior tras limpieza (suelo, zócalos, superficies).'),
      task: T(
        '1) Atende mínimo visual para entrega (sem lixo evidente, sem manchas grosseiras)?\n2) Nota 0–10 pela limpeza percebida.',
        '1) Meets minimal visual handover (no obvious trash or heavy stains)?\n2) Score 0–10 for perceived cleanliness.',
        '1) ¿Cumple mínimo visual de entrega (sin basura/manchas fuertes)?\n2) Nota 0–10.',
      ),
      target: T('superfícies principais da cena', 'main surfaces in frame', 'superficies principales en encuadre'),
      yes: T('sem lixo volumoso nem sujidade grossa evidente.', 'no bulky trash or heavy soiling.', 'sin basura voluminosa ni suciedad fuerte.'),
      no: T('lixo acumulado, manchas graves ou sujidade extensa visível.', 'accumulated trash, heavy stains, or broad soiling.', 'basura acumulada, manchas graves o suciedad extensa.'),
      unknown: T('ângulo ou luz impedem julgar.', 'angle/light prevent judgment.', 'ángulo/luz impiden valorar.'),
    },
  },
  {
    id: 'epi_field',
    areaId: 'worksite_safety',
    title: T('EPI mínimo em campo', 'Minimum PPE on site', 'EPP mínimo en campo'),
    parts: {
      context: T('Técnico ou equipe em obra/telhado/fachada.', 'Technician or crew on job site/roof/facade.', 'Técnico o equipo en obra/tejado/fachada.'),
      task: T(
        '1) Capacete na cabeça e calçado fechado adequado ao contexto visível?\n2) Nota 0–10.',
        '1) Helmet on head and closed footwear appropriate to visible context?\n2) Score 0–10.',
        '1) ¿Casco en cabeza y calzado cerrado adecuado al contexto?\n2) Nota 0–10.',
      ),
      target: T('pessoas em foco e EPI visível', 'people in focus and visible PPE', 'personas a foco y EPP visible'),
      yes: T('capacete aparente e calçado fechado visível.', 'helmet apparent and closed shoes visible.', 'casco aparente y calzado cerrado visible.'),
      no: T('capacete ausente/incorreto ou calçado claramente inadequado.', 'missing/wrong helmet or clearly inadequate footwear.', 'casco ausente/incorrecto o calzado claramente inadecuado.'),
      unknown: T('corte, distância ou desfoque impedem confirmar.', 'crop, distance, or blur prevents confirmation.', 'recorte, distancia o desenfoque impiden confirmar.'),
    },
  },
  {
    id: 'asset_label',
    areaId: 'asset_identification',
    title: T('Etiqueta / serial / patrimônio legível', 'Readable label / serial / asset tag', 'Etiqueta / serie / patrimonio legible'),
    parts: {
      context: T('Placa, etiqueta de fábrica ou patrimônio em equipamento.', 'Nameplate, factory label, or asset tag on equipment.', 'Placa, etiqueta de fábrica o patrimonio en equipo.'),
      task: T(
        '1) Identificador principal legível para registro?\n2) Nota 0–10 pela legibilidade.',
        '1) Main identifier readable for logging?\n2) Score 0–10 for readability.',
        '1) ¿Identificador principal legible para registro?\n2) Nota 0–10.',
      ),
      target: T('área da etiqueta com texto/números', 'label area with text/numbers', 'zona de etiqueta con texto/números'),
      yes: T('caracteres principais legíveis sem adivinhação.', 'main characters readable without guessing.', 'caracteres principales legibles sin adivinar.'),
      no: T('ilegível, ausente ou obliterada.', 'illegible, missing, or obliterated.', 'ilegible, ausente u obliterada.'),
      unknown: T('reflexo, ângulo ou foco impedem leitura segura.', 'glare/angle/focus prevents safe read.', 'reflejo/ángulo/enfoque impiden lectura segura.'),
    },
  },
  {
    id: 'rack_cables',
    areaId: 'it_networks',
    title: T('Rack / telecom — cabos e identificação', 'Rack / telecom — cables & ID', 'Rack / telecom — cables e identificación'),
    parts: {
      context: T('Armário de rede, rack ou concentração de cabos.', 'Network cabinet, rack, or cable concentration.', 'Armario de red, rack o concentración de cables.'),
      task: T(
        '1) Organização e identificação (etiquetas/amarrações) aparentam padrão aceitável?\n2) Nota 0–10.',
        '1) Organization and labeling look acceptable for ops?\n2) Score 0–10.',
        '1) ¿Organización y rotulación aceptables para operación?\n2) Nota 0–10.',
      ),
      target: T('bundle, patch panel ou organizador visível', 'bundle, patch panel, or organizer visible', 'bundle, panel de parcheo u organizador visible'),
      yes: T('razoavelmente organizado; sinais de identificação/amarração.', 'reasonably organized; ties/labels visible.', 'razonablemente organizado; bridas/etiquetas visibles.'),
      no: T('caos severo, ventilação obstruída ou risco visual de esmagamento/puxo.', 'severe clutter, blocked airflow, or obvious crush/pull risk.', 'caos severo, flujo bloqueado o riesgo de aplastamiento.'),
      unknown: T('porta fechada ou área crítica fora da foto.', 'door closed or critical area off-frame.', 'puerta cerrada o zona crítica fuera de foto.'),
    },
  },
  {
    id: 'fire_extinguisher',
    areaId: 'fire_safety',
    title: T('Extintor e sinalização de emergência', 'Extinguisher & emergency signage', 'Extintor y señalización de emergencia'),
    parts: {
      context: T('Corredor ou área comum com extintor/sinalização esperados.', 'Corridor/common area expecting extinguisher/signage.', 'Pasillo o zona común con extintor/señalización esperados.'),
      task: T(
        '1) Extintor visível e acessível; sinalização perceptível?\n2) Nota 0–10 (selo não legível = não julgar validade).',
        '1) Visible accessible extinguisher; noticeable signage?\n2) Score 0–10 (unreadable seal → do not judge validity).',
        '1) ¿Extintor visible/accesible; señalización perceptible?\n2) Nota 0–10.',
      ),
      target: T('extintor e pictogramas na cena', 'extinguisher and pictograms in scene', 'extintor y pictogramas en escena'),
      yes: T('extintor visível sem obstrução óbvia; sinalização reconhecível.', 'visible extinguisher without obvious block; recognizable signs.', 'extintor visible sin bloqueo obvio; señal reconocible.'),
      no: T('ausente, gravemente obstruído ou sinalização claramente ausente.', 'missing, heavily blocked, or signage clearly absent.', 'ausente, muy obstruido o señal claramente ausente.'),
      unknown: T('campo de visão não cobre a zona ou reflexos.', 'field of view misses zone or glare.', 'encuadre no cubre zona o reflejos.'),
    },
  },
  {
    id: 'wall_patology',
    areaId: 'civil_finishes',
    title: T('Patologias em parede / teto', 'Wall/ceiling pathology', 'Patologías en muro / techo'),
    parts: {
      context: T('Superfície inspecionada por umidade, bolhas, mofo.', 'Surface inspected for damp, bubbles, mold.', 'Superficie inspeccionada por humedad, burbujas, moho.'),
      task: T(
        '1) Sinais inequívocos de patologia extensa?\n2) Nota 0–10 (10 = sem patologia relevante visível).',
        '1) Clear signs of extensive pathology?\n2) Score 0–10 (10 = no relevant pathology visible).',
        '1) ¿Signos claros de patología extensa?\n2) Nota 0–10 (10 = sin patología relevante).',
      ),
      target: T('superfície na foto', 'surface in photo', 'superficie en foto'),
      yes: T('sem manchas extensas, bolhas ou mofo evidente.', 'no broad stains, bubbles, or obvious mold.', 'sin manchas extensas, burbujas ni moho evidente.'),
      no: T('manchas extensas, bolhas, descascamento ou mofo evidente.', 'broad stains, bubbles, peeling, or obvious mold.', 'manchas extensas, burbujas, desconchado o moho evidente.'),
      unknown: T('superfície parcial ou luz insuficiente.', 'partial surface or poor light.', 'superficie parcial o luz insuficiente.'),
    },
  },
  {
    id: 'plumbing_leak',
    areaId: 'plumbing_fluids',
    title: T('Hidráulica — vazamento ou corrosão', 'Plumbing — leak or corrosion', 'Fontanería — fuga o corrosión'),
    parts: {
      context: T('Conexões, sifão, registro ou caixa visível.', 'Connections, trap, valve, or visible box.', 'Conexiones, sifón, llave o caja visible.'),
      task: T(
        '1) Indícios de vazamento ativo ou corrosão severa?\n2) Nota 0–10 (10 = íntegro/seco no visível).',
        '1) Signs of active leak or severe corrosion?\n2) Score 0–10 (10 = dry/sound as visible).',
        '1) ¿Indicios de fuga activa o corrosión severa?\n2) Nota 0–10.',
      ),
      target: T('conexões e entorno', 'connections and surroundings', 'conexiones y alrededores'),
      yes: T('sem poça fresca, sem gotejamento visível, sem corrosão severa óbvia.', 'no fresh puddle/drip, no obvious severe corrosion.', 'sin charco fresco, sin goteo, sin corrosión severa obvia.'),
      no: T('poça/gotejamento evidente ou corrosão severa.', 'obvious puddle/drip or severe corrosion.', 'charco/goteo evidente o corrosión severa.'),
      unknown: T('trecho crítico não visível.', 'critical stretch not visible.', 'tramo crítico no visible.'),
    },
  },
  {
    id: 'elevator_landing',
    areaId: 'public_urban',
    title: T('Elevador — soleira e vão', 'Elevator — sill & opening', 'Ascensor — umbral y hueco'),
    parts: {
      context: T('Porta de pavimento ou vão do elevador visível.', 'Landing door or hoistway opening visible.', 'Puerta de rellano o hueco visible.'),
      task: T(
        '1) Sem obstrução perigosa imediata; acabamento aceitável ao olho?\n2) Nota 0–10 (mecanismos internos não visíveis = não julgar).',
        '1) No dangerous obstruction; acceptable finish as seen?\n2) Score 0–10 (do not judge hidden mechanics).',
        '1) Sin obstrucción peligrosa; acabado aceptable a la vista?\n2) Nota 0–10.',
      ),
      target: T('soleira, vão e imediações', 'sill, opening, immediate area', 'umbral, hueco e inmediaciones'),
      yes: T('vão livre de obstáculos óbvios; soleira aparentemente íntegra.', 'opening free of obvious debris; sill looks intact.', 'hueco libre de obstáculos; umbral aparentemente íntegro.'),
      no: T('obstrução clara ou dano estrutural evidente em soleira/batente.', 'clear obstruction or obvious structural damage.', 'obstrucción clara o daño estructural evidente.'),
      unknown: T('porta fechada ou reflexo impede ver o vão.', 'closed door or glare hides opening.', 'puerta cerrada o reflejo impide ver el hueco.'),
    },
  },
  {
    id: 'storefront',
    areaId: 'retail_hospitality',
    title: T('Fachada comercial — vitrine e letreiro', 'Storefront — glazing & sign', 'Fachada comercial — escaparate y rótulo'),
    parts: {
      context: T('Loja ou ponto comercial (vitrine, letreiro, iluminação).', 'Shop front (glazing, sign, lighting).', 'Fachada comercial (escaparate, rótulo, iluminación).'),
      task: T(
        '1) Aparência comercial aceitável (sem vidro quebrado evidente, sem letreiro caído)?\n2) Nota 0–10.',
        '1) Acceptable commercial look (no obvious broken glass, no fallen sign)?\n2) Score 0–10.',
        '1) ¿Aspecto comercial aceptable (sin vidrio roto, sin rótulo caído)?\n2) Nota 0–10.',
      ),
      target: T('vitrine e elementos de fachada', 'glazing and facade elements', 'escaparate y elementos de fachada'),
      yes: T('sem vidro quebrado evidente nem dano grave óbvio em letreiro.', 'no obvious broken glass or severe sign damage.', 'sin vidrio roto evidente ni daño grave en rótulo.'),
      no: T('vidro quebrado, letreiro desprendido ou dano grave.', 'broken glass, detached sign, or severe damage.', 'vidrio roto, rótulo desprendido o daño grave.'),
      unknown: T('fachada parcial ou distância excessiva.', 'partial facade or too far.', 'fachada parcial o distancia excesiva.'),
    },
  },
  {
    id: 'tower_access',
    areaId: 'outdoor_infra',
    title: T('Site outdoor — vegetação e acesso', 'Outdoor site — vegetation & access', 'Sitio exterior — vegetación y acceso'),
    parts: {
      context: T('Base de torre, container técnico ou site telecom.', 'Tower base, tech container, or telecom site.', 'Base de torre, contenedor técnico o sitio telecom.'),
      task: T(
        '1) Acesso desimpedido para manutenção; vegetação não invade equipamento crítico visível?\n2) Nota 0–10.',
        '1) Access looks passable for maintenance; vegetation not engulfing visible critical gear?\n2) Score 0–10.',
        '1) ¿Acceso transitable; vegetación no invade equipo crítico visible?\n2) Nota 0–10.',
      ),
      target: T('caminho e equipamento/base visíveis', 'path and equipment/base visible', 'camino y equipo/base visibles'),
      yes: T('caminho utilizável; vegetação não cobre equipamento.', 'usable path; vegetation not covering gear.', 'camino usable; vegetación no cubre equipo.'),
      no: T('acesso bloqueado por vegetação densa/entulho ou invasão sobre equipamento.', 'blocked path/debris or vegetation on equipment.', 'acceso bloqueado o vegetación sobre equipo.'),
      unknown: T('acesso ou equipamento fora de quadro.', 'path or gear off-frame.', 'acceso o equipo fuera de encuadre.'),
    },
  },
  {
    id: 'van_cargo',
    areaId: 'fleet_vehicles',
    title: T('Baú / van — compartimento de carga', 'Van/box truck — cargo area', 'Furgón / caja — compartimento de carga'),
    parts: {
      context: T('Interior de compartimento de carga após serviço.', 'Inside cargo compartment after service.', 'Interior del compartimento tras el servicio.'),
      task: T(
        '1) Organização mínima segura (carga contida, sem soltos perigosos óbvios) e sem avaria grave visível?\n2) Nota 0–10.',
        '1) Minimal safe stowage (contained load, no obvious loose hazards) and no severe visible damage?\n2) Score 0–10.',
        '1) ¿Estiba mínima segura sin sueltos peligrosos y sin daño grave visible?\n2) Nota 0–10.',
      ),
      target: T('interior e portas visíveis', 'interior and visible doors', 'interior y puertas visibles'),
      yes: T('carga aparentemente contida; sem avaria estrutural grave interna.', 'load looks contained; no severe internal damage.', 'carga contenida; sin daño estructural grave interno.'),
      no: T('carga solta perigosa, avaria grave ou infiltração extrema evidente.', 'dangerous loose load, severe damage, or extreme leaks.', 'carga suelta peligrosa, daño grave o filtraciones extremas.'),
      unknown: T('porta fechada ou escuro demais.', 'door closed or too dark.', 'puerta cerrada u oscuridad excesiva.'),
    },
  },
  {
    id: 'solar_array_debris',
    areaId: 'renewable_energy',
    title: T('Painéis solares — sujidade e sombreamento aparente', 'PV array — soiling & obvious shading', 'Placas FV — suciedad y sombra evidente'),
    parts: {
      context: T('Módulos FV visíveis em telhado ou estrutura (1×1 ou 2×2).', 'Visible PV modules on roof/structure.', 'Módulos FV visibles en cubierta/estructura.'),
      task: T(
        '1) Há sombreamento forte óbvio ou acumulação grave de detritos sobre módulos?\n2) Nota 0–10 (10 = aparentemente limpo e sem sombra crítica no quadro).',
        '1) Obvious heavy shading or severe debris on modules?\n2) Score 0–10 (10 = looks clean, no critical shading in frame).',
        '1) ¿Sombra fuerte evidente o acumulación grave de residuos sobre módulos?\n2) Nota 0–10.',
      ),
      target: T('superfície dos módulos visíveis', 'visible module surfaces', 'superficies de módulos visibles'),
      yes: T('sem detritos volumosos nem sombra crítica evidente sobre a maior parte dos módulos visíveis.', 'no bulky debris or critical shading on most visible modules.', 'sin residuos voluminosos ni sombra crítica en la mayoría de módulos.'),
      no: T('detritos extensos, sombra de obstáculo grande ou cobertura clara que prejudica a área.', 'extensive debris, large obstacle shade, or obvious coverage hurting area.', 'residuos extensos, sombra de obstáculo grande o cobertura evidente.'),
      unknown: T('ângulo não mostra a área dos módulos ou reflexo excessivo.', 'angle misses modules or heavy glare.', 'ángulo no muestra módulos o reflejo excesivo.'),
    },
  },
  {
    id: 'pool_water_clarity',
    areaId: 'cleaning_facilities',
    title: T('Piscina — limpeza superficial da água (visual)', 'Pool — surface water cleanliness (visual)', 'Piscina — limpieza superficial del agua (visual)'),
    parts: {
      context: T('Água da piscina e borda visíveis em foto diurna.', 'Pool water and coping visible in daylight shot.', 'Agua y coronación visibles de día.'),
      task: T(
        '1) A água aparenta turvação excessiva ou espuma anormal extensa na superfície?\n2) Nota 0–10 (10 = visualmente clara no que a foto permite).',
        '1) Does water look excessively turbid or show broad abnormal surface foam?\n2) Score 0–10 (10 = visually clear within photo limits).',
        '1) ¿Agua excesivamente turbia o espuma anormal extensa?\n2) Nota 0–10.',
      ),
      target: T('superfície da água e borda na foto', 'water surface and coping in frame', 'superficie del agua y coronación'),
      yes: T('sem turvação extrema evidente nem espuma anormal ampla.', 'no extreme turbidity or broad abnormal foam.', 'sin turbidez extrema ni espuma anormal amplia.'),
      no: T('água muito turva, espuma anormal extensa ou contaminantes flutuantes volumosos visíveis.', 'very turbid water, broad foam, or obvious floating bulk contaminants.', 'agua muy turbia, espuma anormal o flotantes voluminosos.'),
      unknown: T('reflexo, noite ou ângulo não permitem julgar a água.', 'glare, night shot, or angle prevents judging water.', 'reflejo, noche o ángulo impiden valorar el agua.'),
    },
  },
  {
    id: 'generator_set_visual',
    areaId: 'electrical_energy',
    title: T('Grupo gerador — vazamentos e organização visual', 'Genset — leaks & visual housekeeping', 'Grupo electrógeno — fugas y orden visual'),
    parts: {
      context: T('Conjunto gerador visível (bandejas, mangueiras, carenagem).', 'Visible genset (trays, hoses, enclosure).', 'Grupo electrógeno visible (bandejas, manguitos, carenado).'),
      task: T(
        '1) Há vazamento/trisco óleo ou combustível evidente e a área aparenta minimamente organizada?\n2) Nota 0–10.',
        '1) Obvious oil/fuel staining/leaks and minimally tidy area?\n2) Score 0–10.',
        '1) ¿Manchas/fugas evidentes de aceite/combustible y zona mínimamente ordenada?\n2) Nota 0–10.',
      ),
      target: T('base do equipamento e conexões visíveis', 'equipment base and visible connections', 'base del equipo y conexiones visibles'),
      yes: T('sem poça fresca evidente de óleo/combustível; sem entulho crítico sobre o conjunto.', 'no obvious fresh oil/fuel puddle; no critical clutter on set.', 'sin charco fresco evidente; sin escombros críticos sobre el grupo.'),
      no: T('vazamento evidente, manchas extensas frescas ou desordem perigosa visível.', 'obvious leak, extensive fresh stains, or visibly unsafe mess.', 'fuga evidente, manchas frescas extensas o desorden inseguro.'),
      unknown: T('carenagens fechadas ocultam a base ou foto insuficiente.', 'enclosures hide base or insufficient photo.', 'carenados ocultan la base o foto insuficiente.'),
    },
  },
  {
    id: 'medical_device_sticker',
    areaId: 'industrial_oem',
    title: T('Equipamento médico — etiqueta de calibração/manutenção', 'Medical device — calibration/service sticker', 'Equipo médico — etiqueta de calibración/mantenimiento'),
    parts: {
      context: T('Equipamento clínico com área de etiquetas/registros visível.', 'Clinical equipment with label area visible.', 'Equipo clínico con zona de etiquetas visible.'),
      task: T(
        '1) Etiqueta de identificação/calibração aparenta presente e legível o suficiente para registro?\n2) Nota 0–10.',
        '1) ID/calibration sticker appears present and readable enough to log?\n2) Score 0–10.',
        '1) ¿Etiqueta de identificación/calibración presente y bastante legible?\n2) Nota 0–10.',
      ),
      target: T('painel de etiquetas ou placa do equipamento', 'equipment label panel or plate', 'panel de etiquetas o placa del equipo'),
      yes: T('etiqueta(s) reconhecível(is) com texto/datas parcialmente legíveis.', 'recognizable sticker(s) with partially readable text/dates.', 'etiqueta(s) reconocible(s) con texto/fechas parcialmente legibles.'),
      no: T('etiquetas ausentes, ilegíveis ou equipamento claramente sem identificação visível.', 'missing/illegible labels or clearly unidentified gear.', 'etiquetas ausentes/ilegibles o equipo sin identificación visible.'),
      unknown: T('reflexo ou ângulo impedem leitura.', 'glare/angle blocks reading.', 'reflejo/ángulo impiden leer.'),
    },
  },
  {
    id: 'refrigerated_case_ice',
    areaId: 'food_cold_chain',
    title: T('Ilha ou vitrine refrigerada — gelo/geada excessiva', 'Open refrigerated case — excessive frost/ice', 'Isla o vitrina refrigerada — escarcha/hielo excesivo'),
    parts: {
      context: T('Equipamento de exposição refrigerada em operação visível.', 'Running refrigerated display case.', 'Vitrina refrigerada en servicio visible.'),
      task: T(
        '1) Há acúmulo visual excessivo de gelo/geada que sugira desregulação ou má operação?\n2) Nota 0–10 (10 = geada leve/normal para o tipo de equipamento).',
        '1) Excessive visible frost/ice suggesting poor operation?\n2) Score 0–10 (10 = light/normal frost for type).',
        '1) ¿Acumulación excesiva de hielo/escarcha que sugiera mal funcionamiento?\n2) Nota 0–10.',
      ),
      target: T('evaporador visível ou paredes internas da vitrine', 'visible evaporator or inner case walls', 'evaporador visible o paredes internas'),
      yes: T('geada dentro do esperado visual; sem bloqueio grosso de passagens de ar por gelo.', 'frost within visually normal; no heavy airway ice block.', 'escarcha dentro de lo visualmente normal; sin bloqueo fuerte.'),
      no: T('bloqueio grosso por gelo, geada extrema generalizada ou obstrução clara de circulação.', 'heavy ice blockage or widespread extreme frost.', 'bloqueo por hielo, escarcha extrema u obstrucción clara.'),
      unknown: T('portas fechadas ou condensação/reflexo impedem ver o interior.', 'closed doors or condensation/glare hides interior.', 'puertas cerradas o condensación impide ver interior.'),
    },
  },
  {
    id: 'gas_station_spill',
    areaId: 'public_urban',
    title: T('Posto — área do bico sem vazamento/manchas frescas evidentes', 'Fuel island — nozzle area without fresh spill', 'Estación — zona de surtidor sin derrame fresco evidente'),
    parts: {
      context: T('Área de abastecimento visível (bicos, bandeja, piso).', 'Visible dispenser area (nozzles, sump, floor).', 'Zona de surtidor visible (pistolas, sumidero, suelo).'),
      task: T(
        '1) Há manchas frescas extensas de combustível ou vazamento ativo visível?\n2) Nota 0–10 (10 = visualmente limpo/seco).',
        '1) Broad fresh fuel stains or active visible leak?\n2) Score 0–10 (10 = visually clean/dry).',
        '1) ¿Manchas frescas extensas de combustible o fuga activa visible?\n2) Nota 0–10.',
      ),
      target: T('bandeja e piso ao redor do posto', 'sump and floor around island', 'sumidero y suelo alrededor del surtidor'),
      yes: T('sem poça fresca extensa nem brilho oleoso anormal evidente na área.', 'no broad fresh puddle or obvious abnormal oily sheen.', 'sin charco fresco extenso ni brillo oleoso anormal.'),
      no: T('poça/brilho oleoso extenso fresco ou gotejamento visível.', 'extensive fresh oily sheen/puddle or visible dripping.', 'charco/brillo oleoso extenso o goteo visible.'),
      unknown: T('ângulo não cobre a bandeja ou chuva forte mascara o piso.', 'angle misses sump or heavy rain masks floor.', 'ángulo no cubre sumidero o lluvia enmascara suelo.'),
    },
  },
  {
    id: 'warehouse_rack',
    areaId: 'logistics_warehouse',
    title: T('Porta-paletes — deformação ou dano aparente', 'Pallet racking — visible deformation/damage', 'Estanterías — deformación o daño aparente'),
    parts: {
      context: T('Corredor de armazém com estrutura de rack visível.', 'Warehouse aisle with visible racking.', 'Pasillo de almacén con estantería visible.'),
      task: T(
        '1) Há deformação severa, trincas evidentes ou colisão recente clara na estrutura visível?\n2) Nota 0–10 (10 = aparentemente íntegro).',
        '1) Severe bend, obvious cracks, or clear recent impact on visible structure?\n2) Score 0–10 (10 = looks sound).',
        '1) ¿Deformación severa, grietas evidentes o impacto reciente claro?\n2) Nota 0–10.',
      ),
      target: T('montantes, travessas e base visíveis', 'uprights, beams, and bases visible', 'montantes, largueros y bases visibles'),
      yes: T('alinhamento aparente normal; sem deformação severa óbvia.', 'normal alignment; no obvious severe deformation.', 'alineación aparentemente normal; sin deformación severa obvia.'),
      no: T('deformação severa, trinca longa evidente ou impacto com amassado estrutural claro.', 'severe deformation, obvious long crack, or clear structural denting.', 'deformación severa, grieta larga o abolladura estructural clara.'),
      unknown: T('carga obstrui a estrutura ou zoom insuficiente.', 'stock hides structure or insufficient zoom.', 'carga oculta estructura o zoom insuficiente.'),
    },
  },
  {
    id: 'atm_surround',
    areaId: 'public_urban',
    title: T('ATM — entorno limpo e sem vandalismo evidente', 'ATM — clean surround, no obvious vandalism', 'Cajero — entorno limpio sin vandalismo evidente'),
    parts: {
      context: T('Zona do caixa automático (parede, piso, moldura).', 'ATM surround (wall, floor, bezel).', 'Zona del cajero (pared, suelo, marco).'),
      task: T(
        '1) Há pichação, quebra de vidro ou sujidade extrema que prejudique uso ou imagem?\n2) Nota 0–10.',
        '1) Graffiti, broken glass, or extreme filth affecting use/image?\n2) Score 0–10.',
        '1) ¿Grafiti, cristal roto o suciedad extrema que afecte uso/imagen?\n2) Nota 0–10.',
      ),
      target: T('entorno imediato do ATM na foto', 'immediate ATM surround in photo', 'entorno inmediato del cajero en foto'),
      yes: T('sem vandalismo evidente nem sujidade extrema.', 'no obvious vandalism or extreme filth.', 'sin vandalismo evidente ni suciedad extrema.'),
      no: T('vandalismo evidente, vidro quebrado ou sujidade extrema generalizada.', 'obvious vandalism, broken glass, or extreme widespread filth.', 'vandalismo evidente, cristal roto o suciedad extrema.'),
      unknown: T('ATM parcialmente fora de quadro ou noite sem iluminação.', 'partial ATM or poorly lit night shot.', 'cajero parcial o noche sin iluminación.'),
    },
  },
  {
    id: 'smart_meter_seal',
    areaId: 'asset_identification',
    title: T('Medidor inteligente — lacre e leitura aparente', 'Smart meter — seal & apparent reading', 'Contador inteligente — precinto y lectura aparente'),
    parts: {
      context: T('Medidor de energia visível em parede ou poste.', 'Visible electricity meter on wall/pole.', 'Contador visible en pared/poste.'),
      task: T(
        '1) Lacre/aparafusamento aparenta íntegro e há display ou dígitos parcialmente legíveis?\n2) Nota 0–10.',
        '1) Seal/screw cover looks intact and display/digits partially readable?\n2) Score 0–10.',
        '1) ¿Precinto/tapa tornillos íntegro y dígitos/display parcialmente legibles?\n2) Nota 0–10.',
      ),
      target: T('visor, lacres e bornes visíveis', 'glass, seals, and visible terminals', 'visor, precintos y bornes visibles'),
      yes: T('lacre aparentemente íntegro; dígitos ou indicadores parcialmente legíveis.', 'seal looks intact; digits/indicators partially readable.', 'precinto íntegro; dígitos/indicadores parcialmente legibles.'),
      no: T('lacre violado evidente, carcaça aberta ou visor ilegível/destruído.', 'obvious broken seal, open case, or destroyed/illegible display.', 'precinto roto evidente, carcasa abierta o visor ilegible/destruido.'),
      unknown: T('reflexo forte ou distância impedem leitura.', 'strong glare or distance blocks read.', 'reflejo fuerte o distancia impiden leer.'),
    },
  },
  {
    id: 'ev_charger_cable',
    areaId: 'electrical_energy',
    title: T('Carregador EV — cabo guardado e conector íntegro', 'EV charger — cable stowed & plug intact', 'Punto de recarga — cable guardado y conector íntegro'),
    parts: {
      context: T('Estação de recarga visível (cabo, holster, conector).', 'Visible EVSE (cable, holster, plug).', 'Estación de recarga visible (cable, soporte, conector).'),
      task: T(
        '1) Cabo aparenta guardado corretamente (sem arrasto no chão) e conector sem dano grave visível?\n2) Nota 0–10.',
        '1) Cable appears properly stowed (not dragged on floor) and plug without severe visible damage?\n2) Score 0–10.',
        '1) ¿Cable guardado correctamente (sin arrastre) y conector sin daño grave?\n2) Nota 0–10.',
      ),
      target: T('cabo, suporte e conector visíveis', 'cable, holster, and plug visible', 'cable, soporte y conector visibles'),
      yes: T('cabo no suporte ou enrolado de forma segura; conector aparentemente íntegro.', 'cable on holster or safely coiled; plug looks intact.', 'cable en soporte o enrollado de forma segura; conector íntegro.'),
      no: T('cabo no chão sujeito a esmagamento, conector quebrado ou capa rompida evidente.', 'cable on floor at crush risk, broken plug, or obvious housing damage.', 'cable en suelo en riesgo, conector roto o carcasa dañada.'),
      unknown: T('parte do equipamento fora de quadro.', 'part of EVSE off-frame.', 'parte del equipo fuera de encuadre.'),
    },
  },
  {
    id: 'billboard_structure',
    areaId: 'specialty_other',
    title: T('Outdoor / lona — fixação e rasgos aparentes', 'Billboard / banner — mounting & tears', 'Valla / lona — fijación y roturas aparentes'),
    parts: {
      context: T('Face publicitária ou lona tensionada visível.', 'Visible billboard face or tensioned banner.', 'Cara publicitaria o lona tensada visible.'),
      task: T(
        '1) Há rasgo extenso, lona solta perigosamente ou fixação claramente comprometida?\n2) Nota 0–10.',
        '1) Large tear, dangerously loose fabric, or clearly compromised mounting?\n2) Score 0–10.',
        '1) ¿Rotura extensa, lona suelta peligrosa o fijación claramente comprometida?\n2) Nota 0–10.',
      ),
      target: T('lona, estrutura e fixações visíveis', 'vinyl/structure and visible fasteners', 'lona, estructura y fijaciones visibles'),
      yes: T('sem rasgos extensos nem soltura perigosa evidente; fixação aparentemente regular.', 'no large tears or obvious dangerous slack; mounting looks regular.', 'sin roturas extensas ni holgura peligrosa; fijación aparentemente regular.'),
      no: T('rasgo extenso, lona solta ao vento ou fixação com deformação severa.', 'large tear, flapping loose sheet, or severely deformed mounts.', 'rotura extensa, lona suelta o fijación severamente deformada.'),
      unknown: T('distância excessiva ou parte crítica fora de quadro.', 'too far or critical part off-frame.', 'demasiada distancia o parte crítica fuera de encuadre.'),
    },
  },
  {
    id: 'roof_tiles',
    areaId: 'civil_finishes',
    title: T('Cobertura — telhas ou calhas visivelmente danificadas', 'Roofing — visibly damaged tiles/gutters', 'Cubierta — tejas/canaletas visiblemente dañadas'),
    parts: {
      context: T('Trecho de telhado visível a partir do solo ou drone baixo.', 'Roof section visible from ground/low drone.', 'Tramo de cubierta visible desde suelo/drone bajo.'),
      task: T(
        '1) Há telhas deslocadas/quebradas em número relevante ou calha desprendida claramente visível?\n2) Nota 0–10.',
        '1) Meaningful displaced/broken tiles or clearly detached gutter visible?\n2) Score 0–10.',
        '1) ¿Tejas desplazadas/rotas relevantes o canalón claramente desprendido?\n2) Nota 0–10.',
      ),
      target: T('planos de cobertura e calhas na imagem', 'roof planes and gutters in image', 'planos de cubierta y canalones en imagen'),
      yes: T('sem deslocamentos/quebras evidentes em escala relevante no trecho visível.', 'no obvious relevant-scale breaks/slips in visible span.', 'sin roturas/desplazamientos evidentes a escala relevante.'),
      no: T('múltiplas telhas quebradas/deslocadas ou calha pendente/rompida visível.', 'multiple broken/slipped tiles or hanging/broken gutter.', 'varias tejas rotas/desplazadas o canalón colgante/roto.'),
      unknown: T('zoom insuficiente ou ângulo não mostra a linha de cumeeira.', 'insufficient zoom or angle misses ridge line.', 'zoom insuficiente o ángulo no muestra cumbrera.'),
    },
  },
  {
    id: 'window_seal',
    areaId: 'civil_finishes',
    title: T('Esquadria / vidro — vedante e trincas aparentes', 'Window/wall — sealant & visible cracks', 'Carpintería / vidrio — sellado y grietas aparentes'),
    parts: {
      context: T('Fachada com esquadrias e vedações visíveis.', 'Facade with visible frames and sealant beads.', 'Fachada con carpinterías y sellados visibles.'),
      task: T(
        '1) Há trincas longas no revestimento junto à esquadria ou vedante ausente/deteriorado de forma grave?\n2) Nota 0–10.',
        '1) Long cracks near frame or severely missing/damaged sealant?\n2) Score 0–10.',
        '1) ¿Grietas largas junto a carpintería o sellado gravemente ausente/deteriorado?\n2) Nota 0–10.',
      ),
      target: T('junta esquadria-revestimento e vidros visíveis', 'frame-to-cladding joint and visible glazing', 'junta carpintería-revestimiento y acristalamiento'),
      yes: T('sem trincas longas evidentes; vedante aparentemente contínuo onde visível.', 'no obvious long cracks; sealant looks continuous where seen.', 'sin grietas largas evidentes; sellado aparentemente continuo.'),
      no: T('trincas longas evidentes ou vedante rompido/faltando em extensão relevante.', 'obvious long cracks or sealant missing/broken over significant length.', 'grietas largas o sellado roto/ausente en tramo relevante.'),
      unknown: T('reflexo do vidro mascara juntas ou distância excessiva.', 'glass reflection hides joints or too far.', 'reflejo del vidrio oculta juntas o distancia excesiva.'),
    },
  },
  {
    id: 'machine_guard',
    areaId: 'industrial_oem',
    title: T('Máquina industrial — proteção acoplada', 'Industrial machine — guard in place', 'Máquina industrial — protección acoplada'),
    parts: {
      context: T('Zona de acionamento de máquina com grades ou tampas de segurança.', 'Machine drive zone with guards/covers.', 'Zona de accionamiento con rejas o tapas de seguridad.'),
      task: T(
        '1) Proteções aparentam acopladas (sem abertura perigosa evidente) para o trecho visível?\n2) Nota 0–10.',
        '1) Guards appear engaged (no obvious dangerous openings) for visible section?\n2) Score 0–10.',
        '1) ¿Protecciones acopladas (sin abertura peligrosa evidente) en el tramo visible?\n2) Nota 0–10.',
      ),
      target: T('grades, intertravamentos e aberturas visíveis', 'grids, interlocks, visible openings', 'rejas, enclavamientos y aberturas visibles'),
      yes: T('proteções aparentemente fechadas/acopladas; sem abertura grande óbvia.', 'guards look closed/interlocked; no large obvious gap.', 'protecciones aparentemente cerradas; sin gran abertura obvia.'),
      no: T('proteção ausente, claramente aberta ou interlock vencido visível.', 'missing guard, clearly open, or obvious defeated interlock.', 'protección ausente, abierta claramente o enclavamiento vencido.'),
      unknown: T('trecho crítico oculto pelo ângulo ou pela própria máquina.', 'critical area hidden by angle/machine.', 'zona crítica oculta por ángulo/máquina.'),
    },
  },
  {
    id: 'dock_bumper',
    areaId: 'logistics_warehouse',
    title: T('Doca — proteção de impacto e nivelamento visual', 'Loading dock — bumpers & leveler (visual)', 'Muelle — parachoques y nivelador (visual)'),
    parts: {
      context: T('Interior/exterior de doca com proteções e nivelador visíveis.', 'Dock interior/exterior with bumpers/leveler visible.', 'Interior/exterior de muelle con parachoques/nivelador visibles.'),
      task: T(
        '1) Pára-choques aparentam presentes e sem destruição total; rampa/nivelador sem anomalia visual extrema?\n2) Nota 0–10.',
        '1) Bumpers appear present, not totally destroyed; leveler/ramp without extreme visual anomaly?\n2) Score 0–10.',
        '1) ¿Parachoques presentes y no totalmente destruidos; rampa sin anomalía extrema?\n2) Nota 0–10.',
      ),
      target: T('linha de batente e nivelador na cena', 'bumpers and leveler in scene', 'parachoques y nivelador en escena'),
      yes: T('pára-choques reconhecíveis; sem destruição total nem deslocamento extremo visível.', 'recognizable bumpers; no total destruction or extreme displacement.', 'parachoques reconocibles; sin destrucción total ni desplazamiento extremo.'),
      no: T('ausência quase total de proteção, peça pendurada perigosamente ou destruição severa.', 'near-total missing protection, dangerously hanging part, or severe destruction.', 'casi sin protección, pieza colgando peligrosamente o destrucción severa.'),
      unknown: T('doca parcialmente fora de quadro ou escuro.', 'partial dock or too dark.', 'muelle parcial u oscuridad.'),
    },
  },
  {
    id: 'gate_intercom',
    areaId: 'it_networks',
    title: T('Portaria — interfone/câmera e cabeamento aparente', 'Gatehouse — intercom/camera & visible cabling', 'Portería — portero automático/cámara y cableado'),
    parts: {
      context: T('Posto de portaria ou portão com equipamentos de acesso.', 'Guard post or gate with access devices.', 'Puesto de portería o puerta con equipos de acceso.'),
      task: T(
        '1) Equipamentos aparentam fixados e sem cabeamento solto perigoso óbvio na área visível?\n2) Nota 0–10.',
        '1) Devices look mounted without obvious loose hazardous cabling in view?\n2) Score 0–10.',
        '1) ¿Equipos fijados sin cableado suelto peligroso obvio?\n2) Nota 0–10.',
      ),
      target: T('interfone, câmera e eletrocalhas visíveis', 'intercom, camera, visible conduits', 'portero, cámara y canaletas visibles'),
      yes: T('fixação aparente regular; sem fios soltos em trânsito de pessoas.', 'reasonable mounting; no loose wires in people paths.', 'fijación razonable; sin cables sueltos en paso de personas.'),
      no: T('equipamento pendurado, cabos soltos acessíveis ou caixas abertas com partes energizadas expostas.', 'hanging gear, accessible loose leads, or open boxes with exposed live parts.', 'equipo colgando, cables sueltos accesibles o cajas abiertas con partes vivas.'),
      unknown: T('equipamentos fora de quadro ou noite sem luz.', 'devices off-frame or dark night shot.', 'equipos fuera de encuadre o noche oscura.'),
    },
  },
  {
    id: 'playground_equipment',
    areaId: 'specialty_other',
    title: T('Playground — ferrugem extrema ou peças soltas', 'Playground — extreme rust or loose parts', 'Parque infantil — óxido extremo o piezas sueltas'),
    parts: {
      context: T('Equipamento recreativo fixo visível (balanço, escorregador).', 'Visible fixed play equipment (swing, slide).', 'Equipo de juego fijo visible (columpio, tobogán).'),
      task: T(
        '1) Há ferrugem extrema generalizada, trincas longas em estrutura ou peças soltas perigosas visíveis?\n2) Nota 0–10.',
        '1) Widespread extreme rust, long structural cracks, or visible loose dangerous parts?\n2) Score 0–10.',
        '1) ¿Óxido extremo generalizado, grietas largas o piezas sueltas peligrosas?\n2) Nota 0–10.',
      ),
      target: T('estrutura metálica e fixações visíveis', 'metal structure and fasteners visible', 'estructura metálica y fijaciones visibles'),
      yes: T('sem ferrugem extrema generalizada nem peças soltas óbvias.', 'no widespread extreme rust or obvious loose parts.', 'sin óxido extremo generalizado ni piezas sueltas obvias.'),
      no: T('ferrugem extrema, trincas longas ou parafusos/componentes soltos claramente visíveis.', 'extreme rust, long cracks, or clearly loose bolts/components.', 'óxido extremo, grietas largas o tornillos/piezas sueltas claras.'),
      unknown: T('equipamento parcial ou distância excessiva.', 'partial equipment or too far.', 'equipo parcial o distancia excesiva.'),
    },
  },
  {
    id: 'irrigation_head',
    areaId: 'agri_rural',
    title: T('Irrigação — aspersor e vazamento aparente no poço', 'Irrigation — sprinkler & wet spot', 'Riego — aspersor y charco aparente'),
    parts: {
      context: T('Linha de irrigação em campo ou jardim visível.', 'Irrigation line in field/garden visible.', 'Línea de riego en campo/jardín visible.'),
      task: T(
        '1) Há poça fresca extensa em torno do aspersor ou peça claramente partida visível?\n2) Nota 0–10 (10 = aparentemente íntegro/seco).',
        '1) Large fresh wet spot around head or clearly broken part visible?\n2) Score 0–10 (10 = looks sound/dry).',
        '1) ¿Charco fresco extenso alrededor del aspersor o pieza claramente rota?\n2) Nota 0–10.',
      ),
      target: T('aspersor e solo ao redor', 'sprinkler and surrounding soil', 'aspersor y suelo alrededor'),
      yes: T('solo normalmente húmido leve sem poça fresca extensa; aspersor aparentemente íntegro.', 'lightly damp soil only, no big fresh puddle; head looks intact.', 'humedad leve sin charco fresco extenso; aspersor aparentemente íntegro.'),
      no: T('poça fresca extensa, gotejamento contínuo visível ou corpo partido.', 'large fresh puddle, visible continuous drip, or broken body.', 'charco fresco extenso, goteo continuo o cuerpo roto.'),
      unknown: T('aspersor tapado por vegetação densa.', 'head hidden by dense growth.', 'aspersor oculto por vegetación densa.'),
    },
  },
  {
    id: 'apiary_hives',
    areaId: 'agri_rural',
    title: T('Apiário — colmeias alinhadas e sem tombamento', 'Apiary — hive alignment & tipping', 'Colmenar — alineación y vuelco de colmenas'),
    parts: {
      context: T('Área de colmeias visíveis em apiário.', 'Visible beehives in apiary setting.', 'Colmenas visibles en colmenar.'),
      task: T(
        '1) Alguma colmeia aparenta tombada gravemente ou desorganização extrema que sugira abandono recente?\n2) Nota 0–10.',
        '1) Any hive clearly tipped over or extreme disorder suggesting recent neglect?\n2) Score 0–10.',
        '1) ¿Alguna colmena claramente volcada o desorden extremo reciente?\n2) Nota 0–10.',
      ),
      target: T('colmeias e bases na foto', 'hives and stands in photo', 'colmenas y soportes en foto'),
      yes: T('colmeias em pé, alinhamento razoável; sem tombamento evidente.', 'hives upright, reasonable layout; no obvious tip-over.', 'colmenas en pie, disposición razonable; sin vuelco evidente.'),
      no: T('colmeia tombada, estrutura colapsada ou dispersão anormal extensa de componentes.', 'tipped hive, collapsed stand, or abnormal wide scatter of parts.', 'colmena volcada, soporte colapsado o dispersión anormal de piezas.'),
      unknown: T('campo parcial ou distância excessiva.', 'partial field of view or too far.', 'encuadre parcial o distancia excesiva.'),
    },
  },
  {
    id: 'wind_turbine_base',
    areaId: 'renewable_energy',
    title: T('Eólica — acesso à base e portões', 'Wind turbine — base access & gates', 'Eólica — acceso a base y portones'),
    parts: {
      context: T('Base de aerogerador com portão/cerca visível.', 'Turbine base with gate/fence visible.', 'Base de aerogenerador con valla/puerta visible.'),
      task: T(
        '1) Portão aparenta fechado/trancado e acesso sem obstrução extrema até a base visível?\n2) Nota 0–10.',
        '1) Gate appears closed/locked and path to base not extremely blocked?\n2) Score 0–10.',
        '1) ¿Portón aparentemente cerrado y acceso a la base no extremadamente bloqueado?\n2) Nota 0–10.',
      ),
      target: T('portão, cerca e caminho à base', 'gate, fence, path to base', 'portón, valla y camino a la base'),
      yes: T('portão fechado aparente; caminho utilizável sem bloqueio extremo.', 'gate looks closed; passable path without extreme block.', 'portón cerrado aparente; camino transitable sin bloqueo extremo.'),
      no: T('portão aberto indevidamente, cerca rompida ou obstrução extrema ao acesso.', 'improperly open gate, broken fence, or extreme access blockage.', 'portón abierto indebidamente, valla rota o bloqueo extremo.'),
      unknown: T('base parcialmente fora de quadro.', 'base partially off-frame.', 'base parcialmente fuera de encuadre.'),
    },
  },
  {
    id: 'grease_trap_cover',
    areaId: 'plumbing_fluids',
    title: T('Caixa de gordura — tampa e vazamento ao redor', 'Grease trap — lid & surrounding leak', 'Trampa de grasas — tapa y fuga alrededor'),
    parts: {
      context: T('Tampa de caixa de retenção de gordura em piso de cozinha industrial.', 'Grease interceptor lid in commercial kitchen floor.', 'Tapa de trampa de grasas en suelo de cocina industrial.'),
      task: T(
        '1) Tampa aparenta encaixada e sem vazamento de óleo/gordura evidente ao redor?\n2) Nota 0–10.',
        '1) Lid appears seated with no obvious oil/grease leak around?\n2) Score 0–10.',
        '1) ¿Tapa asentada sin fuga evidente de aceite/grasa alrededor?\n2) Nota 0–10.',
      ),
      target: T('tampa e junta ao piso', 'lid and floor joint', 'tapa y junta al suelo'),
      yes: T('tampa nivelada aparentemente; sem brilho oleoso extenso ao redor.', 'lid looks flush; no broad oily sheen around.', 'tapa al ras; sin brillo oleoso extenso alrededor.'),
      no: T('tampa deslocada, fluido acumulado evidente ou odor visual (manchas) muito extensas.', 'displaced lid, obvious fluid pooling, or very broad stain pattern.', 'tapa desplazada, acumulación de fluido o manchas muy extensas.'),
      unknown: T('área coberta por equipamentos ou sombra forte.', 'area covered by equipment or heavy shadow.', 'zona cubierta por equipos o sombra fuerte.'),
    },
  },
  {
    id: 'kitchen_hood_drip',
    areaId: 'food_cold_chain',
    title: T('Coifa industrial — gotejamento ou acúmulo de gordura visível', 'Commercial hood — drips or heavy grease buildup', 'Campana industrial — goteo o acumulación de grasa'),
    parts: {
      context: T('Coifa e filtro visíveis em cozinha profissional.', 'Visible hood and filters in professional kitchen.', 'Campana y filtros visibles en cocina profesional.'),
      task: T(
        '1) Há gotejamento ativo visível ou acúmulo grosso de gordura em filtros/bordas?\n2) Nota 0–10.',
        '1) Active visible drips or heavy grease buildup on filters/edges?\n2) Score 0–10.',
        '1) ¿Goteo activo visible o acumulación fuerte de grasa en filtros/bordes?\n2) Nota 0–10.',
      ),
      target: T('filtros, bordas e canal de gordura visível', 'filters, edges, visible grease channel', 'filtros, bordes y canal de grasa visible'),
      yes: T('gordura leve sem gotejamento ativo nem massa pendente evidente.', 'light film, no active drips or obvious hanging mass.', 'película leve sin goteo activo ni masa colgante evidente.'),
      no: T('gotejamento ativo ou massa/cascata de gordura evidente.', 'active drip or obvious grease cascade/mass.', 'goteo activo o cascada/masa de grasa evidente.'),
      unknown: T('parte inferior da coifa fora de quadro.', 'hood underside off-frame.', 'parte inferior de campana fuera de encuadre.'),
    },
  },
  {
    id: 'data_hall_floor',
    areaId: 'it_networks',
    title: T('Sala técnica — piso elevado e manchas de fluido', 'Tech room — raised floor & fluid stains', 'Sala técnica — suelo elevado y manchas de fluido'),
    parts: {
      context: T('Corredor de sala com piso elevado e placas visíveis.', 'Room aisle with visible raised-floor tiles.', 'Pasillo con suelo técnico y losetas visibles.'),
      task: T(
        '1) Há manchas frescas extensas de fluido ou telhas levantadas/danificadas em número relevante?\n2) Nota 0–10.',
        '1) Broad fresh fluid stains or many lifted/damaged tiles?\n2) Score 0–10.',
        '1) ¿Manchas frescas extensas de fluido o muchas losetas levantadas/dañadas?\n2) Nota 0–10.',
      ),
      target: T('losetas e juntas na cena', 'tiles and joints in scene', 'losetas y juntas en escena'),
      yes: T('sem manchas frescas extensas nem telhas levantadas evidentes em escala relevante.', 'no broad fresh stains or relevant lifted tiles.', 'sin manchas frescas extensas ni losetas levantadas relevantes.'),
      no: T('manchas frescas extensas ou várias telhas quebradas/levantadas.', 'broad fresh stains or multiple broken/lifted tiles.', 'manchas frescas extensas o varias losetas rotas/levantadas.'),
      unknown: T('passagem estreita ou reflexo do piso impede ver juntas.', 'tight aisle or floor glare hides joints.', 'pasillo estrecho o reflejo oculta juntas.'),
    },
  },
  {
    id: 'barrier_arm',
    areaId: 'public_urban',
    title: T('Cancela automática — braço e fotocélulas aparentes', 'Barrier gate — boom & apparent sensors', 'Barrera automática — brazo y sensores aparentes'),
    parts: {
      context: T('Cancela de estacionamento ou acesso com braço visível.', 'Parking/access barrier with visible boom.', 'Barrera de parking/acceso con brazo visible.'),
      task: T(
        '1) Braço aparenta íntegro (sem dobra anormal) e fotocélulas/estrutura sem destruição evidente?\n2) Nota 0–10.',
        '1) Boom looks straight (no abnormal bend) and sensor posts without obvious destruction?\n2) Score 0–10.',
        '1) ¿Brazo íntegro (sin flexión anormal) y postes sin destrucción evidente?\n2) Nota 0–10.',
      ),
      target: T('braço, motor e postes visíveis', 'boom, drive, visible posts', 'brazo, motor y postes visibles'),
      yes: T('braço alinhado; estrutura aparentemente íntegra.', 'straight boom; structure looks intact.', 'brazo alineado; estructura aparentemente íntegra.'),
      no: T('braço torto/partido, motor com carcaça aberta ou destruição evidente.', 'bent/broken boom, open drive housing, or obvious destruction.', 'brazo doblado/roto, motor abierto o destrucción evidente.'),
      unknown: T('braço parcialmente fora de quadro.', 'boom partially off-frame.', 'brazo parcialmente fuera de encuadre.'),
    },
  },
  {
    id: 'streetlight_pole',
    areaId: 'public_urban',
    title: T('Iluminação pública — inclinação ou braço solto', 'Street lighting — tilt or loose bracket', 'Alumbrado público — inclinación o brazo suelto'),
    parts: {
      context: T('Poste/luminária visível em via ou estacionamento.', 'Visible pole/luminaire on road or lot.', 'Poste/luminaria visible en vía o parking.'),
      task: T(
        '1) Há inclinação extrema do poste ou braço/luminária claramente solto pendurando?\n2) Nota 0–10.',
        '1) Extreme pole tilt or clearly loose dangling arm/fixture?\n2) Score 0–10.',
        '1) ¿Inclinación extrema del poste o brazo/luminaria claramente suelto colgando?\n2) Nota 0–10.',
      ),
      target: T('poste, braço e luminária na foto', 'pole, arm, and luminaire in photo', 'poste, brazo y luminaria en foto'),
      yes: T('alinhamento aparente normal; sem pendura perigosa evidente.', 'normal apparent plumb; no obvious dangerous hang.', 'alineación aparentemente normal; sin colgado peligroso obvio.'),
      no: T('inclinação extrema ou peça pendurando com risco de queda visível.', 'extreme lean or part hanging with obvious fall risk.', 'inclinación extrema o pieza colgando con riesgo de caída obvio.'),
      unknown: T('base do poste fora de quadro; não dá para julgar prumo.', 'pole base off-frame; cannot judge plumb.', 'base del poste fuera de encuadre; no se valora plomo.'),
    },
  },
  {
    id: 'fiber_splice',
    areaId: 'it_networks',
    title: T('Caixa de emenda óptica — fechamento e organização interna', 'Fiber splice closure — seal & internal neatness', 'Caja de empalme de fibra — cierre y orden interno'),
    parts: {
      context: T('Caixa de emenda aberta ou semiaberta para inspeção visual.', 'Splice closure open or ajar for visual check.', 'Caja de empalme abierta o entreabierta para inspección.'),
      task: T(
        '1) Interior aparenta minimamente organizado e sem violação óbvia de vedação (lacre/anel) se visível?\n2) Nota 0–10.',
        '1) Interior looks minimally neat and no obvious seal/grommet violation if visible?\n2) Score 0–10.',
        '1) ¿Interior mínimamente ordenado y sin violación obvia del sellado si es visible?\n2) Nota 0–10.',
      ),
      target: T('bandejas, espiral de fibra e fechos visíveis', 'trays, fiber coil, visible latches', 'bandejas, espiral de fibra y cierres visibles'),
      yes: T('emendas e slack organizados sem “novelo” extremo visível; fechos aparentemente ok.', 'splices/slack organized without extreme bird’s nest; latches look OK.', 'empalmes/holgura organizados sin nido extremo; cierres aparentemente OK.'),
      no: T('novelo extremo de fibras, quebra de lâmina evidente ou caixa com vedação claramente rompida.', 'extreme tangle, obvious cracked tray, or clearly broken seal.', 'nido extremo, bandeja rota evidente o sello claramente roto.'),
      unknown: T('tampa impede ver interior ou foto desfocada.', 'lid blocks interior or blurry photo.', 'tapa impide ver interior o foto borrosa.'),
    },
  },
  {
    id: 'pest_bait_station',
    areaId: 'specialty_other',
    title: T('Controle de pragas — isca armadilha fixada e identificada', 'Pest control — bait station mounted & ID’d', 'Control de plagas — estación de cebo fijada e identificada'),
    parts: {
      context: T('Estação de isca ou armadilha em perímetro interno/externo.', 'Bait station/trap on interior/exterior perimeter.', 'Estación de cebo o trampa en perímetro.'),
      task: T(
        '1) Estação aparenta fixada (não solta) e com identificação mínima visível (rótulo/código)?\n2) Nota 0–10.',
        '1) Station appears secured (not loose) with minimal visible ID label/code?\n2) Score 0–10.',
        '1) ¿Estación fijada (no suelta) con identificación mínima visible?\n2) Nota 0–10.',
      ),
      target: T('corpo da estação e fixações na foto', 'station body and mounts in photo', 'cuerpo de estación y fijaciones en foto'),
      yes: T('fixação aparente; rótulo ou marca reconhecível.', 'apparent secure mount; recognizable label/mark.', 'fijación aparente; etiqueta o marca reconocible.'),
      no: T('estação solta/caída ou completamente sem identificação visível.', 'loose/fallen station or completely unlabeled.', 'estación suelta/caída o sin identificación visible.'),
      unknown: T('objeto parcialmente oculto por mobília ou vegetação.', 'object partly hidden by furniture/plants.', 'objeto parcialmente oculto por mobiliario/vegetación.'),
    },
  },
  {
    id: 'dairy_parlor',
    areaId: 'agri_rural',
    title: T('Ordenha — canal de retorno e respingos visíveis', 'Milking parlor — return channel & splash hygiene', 'Sala de ordeño — canal de retorno y salpicaduras'),
    parts: {
      context: T('Linha de ordenha visível (cubículos, canal).', 'Visible milking line (stalls, channel).', 'Línea de ordeño visible (cubículos, canal).'),
      task: T(
        '1) Há acúmulo extremo de resíduos orgânicos no canal ou salpicos anormais generalizados visíveis?\n2) Nota 0–10 (10 = visualmente controlado no trecho).',
        '1) Extreme organic buildup in channel or widespread abnormal splatter visible?\n2) Score 0–10 (10 = visually controlled span).',
        '1) ¿Acumulación extrema en canal o salpicadura anormal generalizada?\n2) Nota 0–10.',
      ),
      target: T('canal e piso ao redor dos cubículos', 'channel and stall floor', 'canal y suelo de cubículos'),
      yes: T('resíduos dentro do esperado operacional; sem acúmulo extremo generalizado.', 'residue within normal ops look; no extreme widespread buildup.', 'residuos dentro de lo operacional normal; sin acumulación extrema.'),
      no: T('acúmulo extremo, entupimento visual ou salpicos anormais muito extensos.', 'extreme buildup, visually clogged channel, or very broad abnormal splatter.', 'acumulación extrema, canal visualmente obstruido o salpicadura anormal amplia.'),
      unknown: T('trecho crítico do canal fora de quadro.', 'critical channel span off-frame.', 'tramo crítico del canal fuera de encuadre.'),
    },
  },
  {
    id: 'hotel_minibar',
    areaId: 'retail_hospitality',
    title: T('Hotel — minibar / cofre com vedação aparente', 'Hotel — minibar/safe seal (visual)', 'Hotel — minibar/caja fuerte con sellado aparente'),
    parts: {
      context: T('Interior de quarto: minibar ou cofre aberto para conferência.', 'Room interior: minibar or safe open for check.', 'Interior de habitación: minibar o caja fuerte abierta para revisión.'),
      task: T(
        '1) Portas/gaxetas aparentam encaixadas sem dano grave visível e itens padrão presentes onde aplicável?\n2) Nota 0–10.',
        '1) Doors/gaskets look seated without severe visible damage and standard items present where applicable?\n2) Score 0–10.',
        '1) ¿Puertas/juntas asentadas sin daño grave y artículos estándar presentes donde aplique?\n2) Nota 0–10.',
      ),
      target: T('gavetas, prateleiras e fechos visíveis', 'shelves, drawers, visible latches', 'estantes, cajones y cierres visibles'),
      yes: T('vedação aparente ok; sem trinca grande em vidro interno nem fecho destruído.', 'seals look OK; no big glass crack or destroyed latch.', 'sellado aparentemente OK; sin grieta grande ni cierre destruido.'),
      no: T('fechadura violada evidente, vidro interno quebrado ou compartimento claramente danificado.', 'obvious forced damage, broken inner glass, or clearly damaged compartment.', 'violencia evidente, cristal interior roto o compartimento claramente dañado.'),
      unknown: T('unidade fechada ou escuro demais.', 'unit closed or too dark.', 'unidad cerrada u oscuridad excesiva.'),
    },
  },
  {
    id: 'temp_fence',
    areaId: 'worksite_safety',
    title: T('Obra — tapume / tela provisória contínua', 'Construction — temp fence/mesh continuity', 'Obra — malla/cierre provisional continuo'),
    parts: {
      context: T('Perímetro provisório de obra visível.', 'Visible temporary construction perimeter.', 'Perímetro provisional de obra visible.'),
      task: T(
        '1) Há brechas grandes na tela/tapume que permitam acesso infantil óbvio ou queda em escavação visível?\n2) Nota 0–10.',
        '1) Large gaps in mesh/fence allowing obvious child access or visible pit fall-in?\n2) Score 0–10.',
        '1) ¿Grandes brechas en malla/cierre que permitan acceso infantil obvio o caída a excavación?\n2) Nota 0–10.',
      ),
      target: T('linha do tapume e portões visíveis', 'fence line and gates visible', 'línea de cierre y portones visibles'),
      yes: T('continuidade aparente sem brechas grandes óbvias ao longo do trecho visível.', 'apparent continuity without large obvious gaps in visible span.', 'continuidad aparente sin grandes brechas obvias en el tramo visible.'),
      no: T('brecha grande, tapume caído ou acesso direto a escavação sem proteção.', 'large gap, fallen panel, or direct pit access without protection.', 'gran brecha, panel caído o acceso directo a excavación sin protección.'),
      unknown: T('trecho do perímetro fora de quadro.', 'perimeter span off-frame.', 'tramo del perímetro fuera de encuadre.'),
    },
  },
];

export function getVisionAiExampleCatalog(userLocale) {
  const loc = normLocale(userLocale);
  const areaLabel = (id) => pick(VISION_AI_EXAMPLE_AREA_LABELS[loc] || VISION_AI_EXAMPLE_AREA_LABELS['en-US'], id);
  return {
    locale: loc,
    areaOrder: VISION_AI_EXAMPLE_AREA_ORDER,
    areaLabel,
    items: RAW.map((row) => ({
      id: row.id,
      areaId: row.areaId,
      title: pick(row.title, loc),
      body: composeBody(loc, row.parts),
    })),
  };
}
