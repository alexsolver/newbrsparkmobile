/**
 * Catálogo trilíngue (pt-BR / en-US / es-ES) de modelos de prompt para
 * «Visão de IA — detecção» (Moondream VQA ou proxy YOLO).
 * Cada item compõe um prompt completo no mesmo molde do campo «Visão IA — análise»
 * e de `fb_prop_vision_default_detection_prompt`: contexto, tarefa, critério (q1), rodapé.
 */
'use strict';

import { VISION_AI_EXAMPLE_AREA_LABELS, VISION_AI_EXAMPLE_AREA_ORDER } from './visionAiAnalysisPromptExamplesData.js';

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

/** @param {string} raw */
function normLocale(raw) {
  const s = String(raw || '').trim();
  if (s === 'en-US') return 'en-US';
  if (s === 'es-ES') return 'es-ES';
  return 'pt-BR';
}

const LABEL_TASK = T('Tarefa:', 'Task:', 'Tarea:');
const LABEL_CRIT = T(
  'Critério (identificador q1):',
  'Criterion (id q1):',
  'Criterio (identificador q1):',
);

const BLOCK_CTX = T(
  'Contexto: inspeção visual de uma etapa executada em campo (foto ou vídeo único; em vídeo o backend usa um frame como imagem).',
  'Context: visual inspection of a field-service step (single photo or video; for video the backend uses one frame as the image).',
  'Contexto: inspección visual de una etapa ejecutada en campo (foto o vídeo único; en vídeo el backend usa un fotograma como imagen).',
);

const BLOCK_TASK = T(
  '1) Com base apenas no visível, o critério abaixo deve ser avaliado de forma binária para este ponto da OS.\n' +
    '2) O texto em «Critério (q1)» define o que verificar (presença, ausência, estado, EPI, ordem, etc.).',
  '1) Based only on what is visible, the criterion below must be evaluated in a binary way for this work-order step.\n' +
    '2) The text under «Criterion (q1)» defines what to check (presence, absence, state, PPE, housekeeping, etc.).',
  '1) Con base solo en lo visible, el criterio siguiente debe evaluarse de forma binaria para este punto de la OS.\n' +
    '2) El texto en «Criterio (q1)» define qué verificar (presencia, ausencia, estado, EPI, orden, etc.).',
);

const BLOCK_FOOTER = T(
  'Resposta esperada no app: o servidor normaliza para yes, no ou unknown em answers[0].value, com confiança e racional (integração «Visão IA - Moondream» ou proxy «Visão IA - YOLO», conforme o tenant).',
  'Expected app result: the server normalizes to yes, no, or unknown in answers[0].value, with confidence and rationale (Vision AI - Moondream integration or Vision AI - YOLO proxy, depending on the tenant).',
  'Respuesta esperada en la app: el servidor normaliza a yes, no o unknown en answers[0].value, con confianza y racional (integración «Visión IA - Moondream» o proxy «Visión IA - YOLO», según el tenant).',
);

/**
 * Monta o texto completo do campo (igual ao modelo padrão do builder + critério específico).
 * @param {string} loc
 * @param {string} criterionText — só o parágrafo do critério (pergunta sim/não)
 */
function composeDetectionPrompt(loc, criterionText) {
  const c = String(criterionText || '').trim();
  return (
    `${pick(BLOCK_CTX, loc)}\n\n` +
    `${pick(LABEL_TASK, loc)}\n` +
    `${pick(BLOCK_TASK, loc)}\n\n` +
    `${pick(LABEL_CRIT, loc)}\n` +
    c +
    '\n\n' +
    `${pick(BLOCK_FOOTER, loc)}`
  );
}

/**
 * @typedef {{
 *   id: string,
 *   areaId: string,
 *   title: ReturnType<typeof T>,
 *   criterion: ReturnType<typeof T>,
 * }} VisionDetectionExampleRow
 */

/** @type {VisionDetectionExampleRow[]} */
const RAW = [
  {
    id: 'cell_phone_presence_count',
    areaId: 'asset_identification',
    title: T(
      'Celular / smartphone na foto',
      'Cell phone / smartphone in the photo',
      'Celular / smartphone en la foto',
    ),
    criterion: T(
      'Há pelo menos um celular ou smartphone físico e claramente identificável na imagem? Ignore aparelhos mostrados apenas em telas, cartazes, caixas, capas vazias, reflexos e objetos ambíguos.',
      'Is there at least one physical cell phone or smartphone that is clearly identifiable in the image? Ignore devices shown only on screens, posters, boxes, empty cases, reflections, and ambiguous objects.',
      '¿Hay al menos un celular o smartphone físico claramente identificable en la imagen? Ignore aparatos solo en pantallas, carteles, cajas, fundas vacías, reflejos y objetos ambiguos.',
    ),
  },
  {
    id: 'person_presence_count',
    areaId: 'worksite_safety',
    title: T('Pessoa na cena', 'Person in scene', 'Persona en escena'),
    criterion: T(
      'Há pelo menos uma pessoa real (não manequim, não figura em anúncio) visível na imagem? Ignore pessoas mostradas apenas em telas, pôsteres, adesivos e reflexos.',
      'Is there at least one real person (not a mannequin, not a figure in an ad) visible in the image? Ignore people shown only on screens, posters, stickers, and reflections.',
      '¿Hay al menos una persona real (no maniquí, no figura de anuncio) visible en la imagen? Ignore personas solo en pantallas, carteles, pegatinas y reflejos.',
    ),
  },
  {
    id: 'helmet_vest_ppe',
    areaId: 'worksite_safety',
    title: T('EPI básico (capacete e colete)', 'Basic PPE (helmet and vest)', 'EPP básico (casco y chaleco)'),
    criterion: T(
      'Todas as pessoas claramente visíveis na imagem usam capacete de segurança e colete refletivo adequados ao trabalho? Responda não se alguma pessoa visível estiver sem um dos dois.',
      'Do all clearly visible people in the image wear a safety helmet and a reflective vest appropriate for the job? Answer no if any visible person is missing either item.',
      '¿Todas las personas claramente visibles llevan casco de seguridad y chaleco reflectante adecuados? Responda no si falta alguno a alguna persona visible.',
    ),
  },
  {
    id: 'extinguisher_and_signage',
    areaId: 'fire_safety',
    title: T('Extintor acessível', 'Accessible extinguisher', 'Extintor accesible'),
    criterion: T(
      'Há pelo menos um extintor de incêndio claramente visível e aparentemente acessível na área da foto? Não exija texto legível na placa; foque na presença física do extintor.',
      'Is there at least one clearly visible and apparently accessible fire extinguisher in the photographed area? Do not require readable signage; focus on the physical presence of the extinguisher.',
      '¿Hay al menos un extintor claramente visible y aparentemente accesible en la zona fotografiada? No exija texto legible en la señal; centrese en la presencia física del extintor.',
    ),
  },
  {
    id: 'bottles_and_cups',
    areaId: 'cleaning_facilities',
    title: T('Garrafa ou copo no local', 'Bottle or cup on site', 'Botella o vaso en el lugar'),
    criterion: T(
      'Há garrafa, copo ou vaso físico sobre mesa, balcão ou chão na área da foto? Ignore estampas, imagens em telas e reflexos que não sejam objetos reais.',
      'Is there a physical bottle, cup, or glass on a table, counter, or floor in the photographed area? Ignore prints, images on screens, and reflections that are not real objects.',
      '¿Hay botella, vaso o copa física sobre mesa, mostrador o suelo en la zona fotografiada? Ignore estampados, imágenes en pantallas y reflejos que no sean objetos reales.',
    ),
  },
  {
    id: 'objects_on_floor',
    areaId: 'cleaning_facilities',
    title: T('Ordem — objeto solto no chão', 'Housekeeping — loose object on floor', 'Orden — objeto suelto en el suelo'),
    criterion: T(
      'Há objeto solto no piso (mochila, ferramenta, garrafa, copo, cabo ou similar) que indique desordem ou risco de tropeço na área visível? Ignore sombras e marcas de piso sem objeto físico.',
      'Is there a loose object on the floor (backpack, tool, bottle, cup, cable, or similar) suggesting disorder or trip risk in the visible area? Ignore shadows and floor marks without a physical object.',
      '¿Hay objeto suelto en el suelo (mochila, herramienta, botella, vaso, cable o similar) que indique desorden o riesgo de tropiezo? Ignore sombras y marcas sin objeto físico.',
    ),
  },
  {
    id: 'laptop_and_monitor',
    areaId: 'it_networks',
    title: T('Equipamento de TI visível', 'IT equipment visible', 'Equipo TI visible'),
    criterion: T(
      'Há notebook ou laptop físico visível na imagem? Ignore apenas tablet sem teclado físico acoplado e imagens de laptop em telas ou anúncios.',
      'Is there a physical notebook or laptop visible in the image? Ignore tablets without an attached physical keyboard and laptop images on screens or ads.',
      '¿Hay portátil o laptop físico visible en la imagen? Ignore tabletas sin teclado físico acoplado e imágenes de portátil en pantallas o anuncios.',
    ),
  },
  {
    id: 'cones_and_barriers',
    areaId: 'public_urban',
    title: T('Sinalização temporária', 'Temporary traffic control', 'Señalización temporal'),
    criterion: T(
      'Há cone, fita, cavalete ou barreira de isolamento visível delimitando área de trabalho ou circulação na foto? Base a resposta apenas no que for claramente visível.',
      'Is there a cone, tape, stand, or barrier visible delimiting a work or traffic area in the photo? Base the answer only on what is clearly visible.',
      '¿Hay cono, cinta, caballete o barrera visible delimitando zona de trabajo o circulación? Base la respuesta solo en lo claramente visible.',
    ),
  },
  {
    id: 'vehicle_presence_count',
    areaId: 'fleet_vehicles',
    title: T('Veículo na cena', 'Vehicle in scene', 'Vehículo en escena'),
    criterion: T(
      'Há pelo menos um veículo motorizado (carro, van, caminhão, ônibus ou moto) claramente visível na imagem? Ignore miniaturas, brinquedos, cartazes e reflexos que não sejam veículos reais.',
      'Is there at least one motorized vehicle (car, van, truck, bus, or motorcycle) clearly visible in the image? Ignore miniatures, toys, posters, and reflections that are not real vehicles.',
      '¿Hay al menos un vehículo motorizado (coche, furgoneta, camión, autobús o moto) claramente visible? Ignore miniaturas, juguetes, carteles y reflejos que no sean vehículos reales.',
    ),
  },
  {
    id: 'pallet_presence_count',
    areaId: 'logistics_warehouse',
    title: T('Pallet no armazém', 'Pallet in warehouse', 'Palet en almacén'),
    criterion: T(
      'Há pelo menos um pallet de carga claramente identificável na imagem? Ignore desenhos em caixas e sombras ambíguas.',
      'Is there at least one clearly identifiable shipping pallet in the image? Ignore drawings on boxes and ambiguous shadows.',
      '¿Hay al menos un palet de carga claramente identificable en la imagen? Ignore dibujos en cajas y sombras ambiguas.',
    ),
  },
  {
    id: 'chairs_and_tables',
    areaId: 'retail_hospitality',
    title: T('Mobiliário (mesa e cadeira)', 'Furniture (table and chair)', 'Mobiliario (mesa y silla)'),
    criterion: T(
      'Há pelo menos uma mesa e uma cadeira físicas visíveis na área da foto? Responda não se faltar um dos dois tipos de mobiliário de forma clara.',
      'Is there at least one table and one chair physically visible in the photographed area? Answer no if either type of furniture is clearly missing.',
      '¿Hay al menos una mesa y una silla físicas visibles en la zona fotografiada? Responda no si falta claramente uno de los dos.',
    ),
  },
  {
    id: 'bags_presence_count',
    areaId: 'specialty_other',
    title: T('Mochila, bolsa ou mala', 'Backpack, bag, or suitcase', 'Mochila, bolso o maleta'),
    criterion: T(
      'Há mochila, bolsa de mão ou mala de viagem física visível na imagem? Ignore desenhos em paredes, anúncios e reflexos que não correspondam a objeto real.',
      'Is there a physical backpack, handbag, or suitcase visible in the image? Ignore wall drawings, ads, and reflections that are not a real object.',
      '¿Hay mochila, bolso o maleta física visible en la imagen? Ignore dibujos en paredes, anuncios y reflejos que no sean objeto real.',
    ),
  },
];

export function getVisionDetectionExampleCatalog(userLocale) {
  const loc = normLocale(userLocale);
  const usedAreaIds = Array.from(new Set(RAW.map((row) => row.areaId)));
  return {
    locale: loc,
    areaOrder: VISION_AI_EXAMPLE_AREA_ORDER.filter((id) => usedAreaIds.includes(id)),
    areaLabel: (id) => pick(VISION_AI_EXAMPLE_AREA_LABELS[loc] || VISION_AI_EXAMPLE_AREA_LABELS['en-US'], id),
    items: RAW.map((row) => ({
      id: row.id,
      areaId: row.areaId,
      title: pick(row.title, loc),
      body: composeDetectionPrompt(loc, pick(row.criterion, loc)),
    })),
  };
}
