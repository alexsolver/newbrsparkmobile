import type { IndustryContext, AssetKindDef, RootAssetType, ModuleVisibility } from './types';

const allRoots: RootAssetType[] = ['REAL_ESTATE', 'MOBILITY', 'MACHINERY', 'AQUATIC', 'IT', 'COLLECTIONS', 'SPECIAL', 'OTHER'];
/** Equipamento instalado (infra, cozinha industrial, TI em rack, etc.) */
const install: RootAssetType[] = ['REAL_ESTATE', 'IT', 'MACHINERY', 'SPECIAL'];
/** Frota rodoviária e logística */
const mobilityRoad: RootAssetType[] = ['MOBILITY', 'SPECIAL'];
/** Tratores, empilhadeiras, colheitadeiras */
const landMachinery: RootAssetType[] = ['MACHINERY', 'MOBILITY', 'SPECIAL'];
const fleet: RootAssetType[] = ['MOBILITY', 'AQUATIC'];
const collectionsInstall: RootAssetType[] = ['REAL_ESTATE', 'COLLECTIONS', 'SPECIAL'];

export const INDUSTRY_CONTEXTS: IndustryContext[] = [
  { id: 'residential',    labelKey: 'assetJourney.context.residential',    descKey: 'assetJourney.contextDesc.residential',    icon: 'home-outline',           color: '#EA580C' },
  { id: 'personal_mobility', labelKey: 'assetJourney.context.personal_mobility', descKey: 'assetJourney.contextDesc.personal_mobility', icon: 'car-outline', color: '#904D00' },
  { id: 'infra_built',    labelKey: 'assetJourney.context.infra_built',    descKey: 'assetJourney.contextDesc.infra_built',    icon: 'business-outline',    color: '#FF8C00' },
  { id: 'food_horeca',  labelKey: 'assetJourney.context.food_horeca',  descKey: 'assetJourney.contextDesc.food_horeca',  icon: 'restaurant-outline',   color: '#DC2626' },
  { id: 'health',         labelKey: 'assetJourney.context.health',         descKey: 'assetJourney.contextDesc.health',         icon: 'medical-outline',       color: '#059669' },
  { id: 'it_telecom',     labelKey: 'assetJourney.context.it_telecom',     descKey: 'assetJourney.contextDesc.it_telecom',     icon: 'server-outline',        color: '#4F46E5' },
  { id: 'agro',           labelKey: 'assetJourney.context.agro',           descKey: 'assetJourney.contextDesc.agro',           icon: 'leaf-outline',          color: '#16A34A' },
  { id: 'fleet',          labelKey: 'assetJourney.context.fleet',          descKey: 'assetJourney.contextDesc.fleet',          icon: 'bus-outline',           color: '#92400E' },
  { id: 'industry',       labelKey: 'assetJourney.context.industry',       descKey: 'assetJourney.contextDesc.industry',       icon: 'construct-outline',     color: '#64748B' },
  { id: 'hospitality',   labelKey: 'assetJourney.context.hospitality',   descKey: 'assetJourney.contextDesc.hospitality',   icon: 'bed-outline',            color: '#0D9488' },
  { id: 'creative',       labelKey: 'assetJourney.context.creative',       descKey: 'assetJourney.contextDesc.creative',       icon: 'color-palette-outline', color: '#A855F7' },
  { id: 'specialty',     labelKey: 'assetJourney.context.specialty',     descKey: 'assetJourney.contextDesc.specialty',     icon: 'compass-outline',        color: '#0EA5E9' },
];

const mod = (m: ModuleVisibility) => m;

export const ASSET_KINDS: AssetKindDef[] = [
  { id: 'RESIDENTIAL_PROPERTY', labelKey: 'assetKinds.residentialProperty', shortDescKey: 'assetKinds.residentialPropertyShort', contextIds: ['residential'], compatibleRootTypes: ['REAL_ESTATE'], icon: 'home-outline', color: '#EA580C', searchTokens: 'casa apartamento residencial sobrado kitnet imóvel habitação condomínio', fieldSchema: [], defaultModules: mod({}), marketplaceTag: 'real_estate' },
  { id: 'PRIVATE_VEHICLE', labelKey: 'assetKinds.privateVehicle', shortDescKey: 'assetKinds.privateVehicleShort', contextIds: ['personal_mobility'], compatibleRootTypes: ['MOBILITY'], icon: 'car-outline', color: '#904D00', searchTokens: 'carro automóvel particular passeio família suv hatch sedã moto uso pessoal b2c', fieldSchema: [], defaultModules: mod({ insurance: true, media: true }), marketplaceTag: 'vehicle' },
  { id: 'ELEVATOR', labelKey: 'assetKinds.elevator', shortDescKey: 'assetKinds.elevatorShort', contextIds: ['infra_built'], compatibleRootTypes: install, icon: 'chevron-up-outline', color: '#0F766E', searchTokens: 'elevador cabine nbr 15158', fieldSchema: [
    { id: 'patrimonyTag', labelKey: 'assetField.patrimonyTag', type: 'text' },
    { id: 'capacityKg', labelKey: 'assetField.capacityKg', type: 'number', placeholderKey: 'assetField.phKg' },
    { id: 'manufacturer', labelKey: 'assetField.manufacturer', type: 'text' },
    { id: 'nextInspection', labelKey: 'assetField.nextInspection', type: 'date', required: true },
  ], defaultModules: mod({ stock: false }), maintenanceHintKey: 'assetJourney.maint.elevator', maintenanceIntervalMonths: 6, marketplaceTag: 'elevator' },
  { id: 'FIRE_FIGHTING', labelKey: 'assetKinds.fireFighting', shortDescKey: 'assetKinds.fireFightingShort', contextIds: ['infra_built'], compatibleRootTypes: install, icon: 'flame-outline', color: '#B91C1C', searchTokens: 'incêndio extintor sprinter hidrante', fieldSchema: [
    { id: 'systemType', labelKey: 'assetField.fireSystemType', type: 'text' },
    { id: 'lastHydro', labelKey: 'assetField.lastHydro', type: 'date' },
    { id: 'cylinderDue', labelKey: 'assetField.cylinderDue', type: 'date' },
  ], defaultModules: mod({ stock: false, vault: false }), maintenanceHintKey: 'assetJourney.maint.fire', maintenanceIntervalMonths: 12, marketplaceTag: 'fire' },
  { id: 'PUMP', labelKey: 'assetKinds.pump', shortDescKey: 'assetKinds.pumpShort', contextIds: ['infra_built', 'hospitality'], compatibleRootTypes: install, icon: 'water-outline', color: '#0369A1', searchTokens: 'bomba recalque pressurização hudson', fieldSchema: [
    { id: 'flowHead', labelKey: 'assetField.flowHead', type: 'text' },
    { id: 'hp', labelKey: 'assetField.motorHp', type: 'number' },
  ], defaultModules: mod({ stock: false }), maintenanceIntervalMonths: 6, marketplaceTag: 'pump' },
  { id: 'CHILLER', labelKey: 'assetKinds.chiller', shortDescKey: 'assetKinds.chillerShort', contextIds: ['infra_built', 'food_horeca'], compatibleRootTypes: install, icon: 'snow-outline', color: '#0E7490', searchTokens: 'chiller ar central fancoil rtac', fieldSchema: [
    { id: 'tons', labelKey: 'assetField.coolingTons', type: 'number' },
    { id: 'refrigerant', labelKey: 'assetField.refrigerant', type: 'text' },
  ], defaultModules: mod({ stock: false }), maintenanceIntervalMonths: 3, marketplaceTag: 'hvac' },
  { id: 'SERVER', labelKey: 'assetKinds.server', shortDescKey: 'assetKinds.serverShort', contextIds: ['it_telecom'], compatibleRootTypes: install, icon: 'hardware-chip-outline', color: '#4338CA', searchTokens: 'servidor rack blade vmware', fieldSchema: [
    { id: 'hostname', labelKey: 'assetField.hostname', type: 'text', required: true },
    { id: 'ipLan', labelKey: 'assetField.ipLan', type: 'text' },
    { id: 'warrantyTo', labelKey: 'assetField.warrantyTo', type: 'date' },
  ], defaultModules: mod({ stock: true, media: true }), maintenanceHintKey: 'assetJourney.maint.server', maintenanceIntervalMonths: 12, marketplaceTag: 'it' },
  { id: 'PDU', labelKey: 'assetKinds.pdu', shortDescKey: 'assetKinds.pduShort', contextIds: ['it_telecom'], compatibleRootTypes: install, icon: 'flash-outline', color: '#CA8A04', searchTokens: 'pdu energia kva whips', fieldSchema: [
    { id: 'outletCount', labelKey: 'assetField.outletCount', type: 'number' },
    { id: 'kva', labelKey: 'assetField.pduKva', type: 'text' },
  ], defaultModules: mod({ insurance: false }), maintenanceIntervalMonths: 24, marketplaceTag: 'electrical' },
  { id: 'SWITCH', labelKey: 'assetKinds.switch', shortDescKey: 'assetKinds.switchShort', contextIds: ['it_telecom'], compatibleRootTypes: install, icon: 'git-network-outline', color: '#6366F1', searchTokens: 'switch poe cisco 48 portas', fieldSchema: [
    { id: 'mgmtIp', labelKey: 'assetField.mgmtIp', type: 'text' },
    { id: 'firmware', labelKey: 'assetField.firmware', type: 'text' },
  ], defaultModules: mod({ stock: false }), marketplaceTag: 'it' },
  { id: 'HOME_APPLIANCE', labelKey: 'assetKinds.homeAppliance', shortDescKey: 'assetKinds.homeApplianceShort', contextIds: ['hospitality'], compatibleRootTypes: ['REAL_ESTATE', 'MOBILITY', 'MACHINERY', 'COLLECTIONS', 'SPECIAL'], icon: 'cafe-outline', color: '#EA580C', searchTokens: 'eletrodoméstico geladeira', fieldSchema: [
    { id: 'serial', labelKey: 'assetField.serial', type: 'text', required: true },
  ], defaultModules: mod({ vault: false, stock: true }), maintenanceIntervalMonths: 12, marketplaceTag: 'appliance' },
  { id: 'DENTAL_CHAIR', labelKey: 'assetKinds.dentalChair', shortDescKey: 'assetKinds.dentalChairShort', contextIds: ['health'], compatibleRootTypes: install, icon: 'body-outline', color: '#0D9488', searchTokens: 'cadeira odontologia consultório', fieldSchema: [
    { id: 'nextCal', labelKey: 'assetField.nextCal', type: 'date', required: true },
  ], defaultModules: mod({ stock: false }), maintenanceIntervalMonths: 6, marketplaceTag: 'dental' },
  { id: 'AUTOCLAVE', labelKey: 'assetKinds.autoclave', shortDescKey: 'assetKinds.autoclaveShort', contextIds: ['health'], compatibleRootTypes: install, icon: 'nuclear-outline', color: '#475569', searchTokens: 'esterilização cisa autoclave', fieldSchema: [
    { id: 'cavityLiters', labelKey: 'assetField.cavityL', type: 'number' },
  ], defaultModules: mod({ stock: false }), maintenanceIntervalMonths: 3, marketplaceTag: 'dental' },
  { id: 'TREADMILL', labelKey: 'assetKinds.treadmill', shortDescKey: 'assetKinds.treadmillShort', contextIds: ['hospitality'], compatibleRootTypes: install, icon: 'walk-outline', color: '#DB2777', searchTokens: 'esteira elíptica cardio', fieldSchema: [
    { id: 'decoNumber', labelKey: 'assetField.anoDeco', type: 'text' },
  ], defaultModules: mod({ insurance: true, stock: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'gym' },
  { id: 'COMBI_OVEN', labelKey: 'assetKinds.combiOven', shortDescKey: 'assetKinds.combiOvenShort', contextIds: ['food_horeca'], compatibleRootTypes: install, icon: 'pizza-outline', color: '#B45309', searchTokens: 'forno combinado gastronomia', fieldSchema: [
    { id: 'burner', labelKey: 'assetField.gasLpg', type: 'boolean' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 2, marketplaceTag: 'cooking' },
  { id: 'ICE_MACHINE', labelKey: 'assetKinds.iceMachine', shortDescKey: 'assetKinds.iceMachineShort', contextIds: ['food_horeca'], compatibleRootTypes: install, icon: 'ice-cream-outline', color: '#7C3AED', searchTokens: 'máquina gelo escama bar', fieldSchema: [
    { id: 'prodKgDia', labelKey: 'assetField.iceProd', type: 'text' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'ice' },
  { id: 'COLD_ROOM', labelKey: 'assetKinds.coldRoom', shortDescKey: 'assetKinds.coldRoomShort', contextIds: ['food_horeca'], compatibleRootTypes: install, icon: 'snow-outline', color: '#1D4ED8', searchTokens: 'câmara fria refrigeração resfriamento', fieldSchema: [
    { id: 'cubicM3', labelKey: 'assetField.cubicM3', type: 'number' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'refrigeration' },
  { id: 'TRACTOR', labelKey: 'assetKinds.tractor', shortDescKey: 'assetKinds.tractorShort', contextIds: ['agro'], compatibleRootTypes: landMachinery, icon: 'trail-sign-outline', color: '#3F6212', searchTokens: 'trator agrale john deere', fieldSchema: [
    { id: 'chassis', labelKey: 'assetField.chassis', type: 'text' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'agro' },
  { id: 'HARVESTER', labelKey: 'assetKinds.harvester', shortDescKey: 'assetKinds.harvesterShort', contextIds: ['agro'], compatibleRootTypes: landMachinery, icon: 'leaf-outline', color: '#3F6212', searchTokens: 'colheitadeira grão', fieldSchema: [
    { id: 'crop', labelKey: 'assetField.crop', type: 'text' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'agro' },
  { id: 'FORKLIFT', labelKey: 'assetKinds.forklift', shortDescKey: 'assetKinds.forkliftShort', contextIds: ['fleet', 'industry', 'agro'], compatibleRootTypes: landMachinery, icon: 'cube-outline', color: '#EA580C', searchTokens: 'empilhadeira still toyota nichiyu', fieldSchema: [
    { id: 'mast', labelKey: 'assetField.mastM', type: 'number' },
  ], defaultModules: mod({ insurance: true, stock: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'forklift' },
  { id: 'REEFER_TRAILER', labelKey: 'assetKinds.reefer', shortDescKey: 'assetKinds.reeferShort', contextIds: ['fleet', 'food_horeca'], compatibleRootTypes: fleet, icon: 'thermometer-outline', color: '#0EA5E9', searchTokens: 'câmara carreta baú congelado gancheira', fieldSchema: [
    { id: 'setpointC', labelKey: 'assetField.setpointC', type: 'number' },
  ], defaultModules: mod({ stock: true, insurance: true }), maintenanceIntervalMonths: 1, marketplaceTag: 'refrigeration' },
  { id: 'TRUCK', labelKey: 'assetKinds.truck', shortDescKey: 'assetKinds.truckShort', contextIds: ['fleet', 'agro', 'industry'], compatibleRootTypes: mobilityRoad, icon: 'car-sport-outline', color: '#92400E', searchTokens: 'caminhão carga cegonha frotas', fieldSchema: [
    { id: 'plate', labelKey: 'assetField.plate', type: 'text' },
  ], defaultModules: mod({ insurance: true, media: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'vehicle' },
  { id: 'DYNO', labelKey: 'assetKinds.dyno', shortDescKey: 'assetKinds.dynoShort', contextIds: ['industry'], compatibleRootTypes: install, icon: 'speedometer-outline', color: '#0F172A', searchTokens: 'scanner diagnóstico bancada dinamômetro', fieldSchema: [
    { id: 'protocols', labelKey: 'assetField.protocols', type: 'text' },
  ], defaultModules: mod({ insurance: false }), maintenanceIntervalMonths: 12, marketplaceTag: 'automotive' },
  { id: 'BREW_TANK', labelKey: 'assetKinds.brewTank', shortDescKey: 'assetKinds.brewTankShort', contextIds: ['food_horeca'], compatibleRootTypes: install, icon: 'beer-outline', color: '#B45309', searchTokens: 'cervc tanque fermentador chope', fieldSchema: [
    { id: 'liters', labelKey: 'assetField.tankL', type: 'number' },
  ], defaultModules: mod({ stock: true, insurance: true }), maintenanceIntervalMonths: 1, marketplaceTag: 'brew' },
  { id: 'LED_WALL', labelKey: 'assetKinds.ledWall', shortDescKey: 'assetKinds.ledWallShort', contextIds: ['creative', 'hospitality'], compatibleRootTypes: install, icon: 'tv-outline', color: '#E11D48', searchTokens: 'led painel p3 p4 video wall', fieldSchema: [
    { id: 'pixelPitch', labelKey: 'assetField.pixel', type: 'text' },
  ], defaultModules: mod({ insurance: true, stock: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'events' },
  { id: 'POOL_SYSTEM', labelKey: 'assetKinds.poolSystem', shortDescKey: 'assetKinds.poolSystemShort', contextIds: ['hospitality', 'specialty'], compatibleRootTypes: install, icon: 'water-outline', color: '#0284C7', searchTokens: 'piscina filtro cloro gordura borda infinita', fieldSchema: [
    { id: 'volumeL', labelKey: 'assetField.poolVol', type: 'number' },
  ], defaultModules: mod({ stock: true, vault: false }), maintenanceIntervalMonths: 2, marketplaceTag: 'pool' },
  { id: 'AIRCRAFT', labelKey: 'assetKinds.aircraft', shortDescKey: 'assetKinds.aircraftShort', contextIds: ['specialty'], compatibleRootTypes: allRoots.filter((x) => x !== 'REAL_ESTATE') as RootAssetType[], icon: 'airplane-outline', color: '#0F172A', searchTokens: 'aeronave c152 cessna pipers', fieldSchema: [
    { id: 'reg', labelKey: 'assetField.aircraftReg', type: 'text' },
  ], defaultModules: mod({ insurance: true, stock: false, reports: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'aviation' },
  { id: 'OUTBOARD', labelKey: 'assetKinds.outboard', shortDescKey: 'assetKinds.outboardShort', contextIds: ['specialty'], compatibleRootTypes: ['AQUATIC', 'MOBILITY', 'MACHINERY', 'SPECIAL'], icon: 'navigate-outline', color: '#0369A1', searchTokens: 'popa yamaha mercury marinha', fieldSchema: [
    { id: 'hp', labelKey: 'assetField.motorHp', type: 'number' },
  ], defaultModules: mod({ stock: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'marine' },
  { id: 'ART_PIECE', labelKey: 'assetKinds.artPiece', shortDescKey: 'assetKinds.artPieceShort', contextIds: ['creative', 'specialty'], compatibleRootTypes: collectionsInstall, icon: 'image-outline', color: '#A16207', searchTokens: 'arte quadro acervo patrimônio', fieldSchema: [
    { id: 'provenance', labelKey: 'assetField.provenance', type: 'text' },
  ], defaultModules: mod({ insurance: true, stock: true, costs: true, media: true }), maintenanceIntervalMonths: 24, marketplaceTag: 'art' },
  { id: 'WINE_CELLAR', labelKey: 'assetKinds.wineCellar', shortDescKey: 'assetKinds.wineCellarShort', contextIds: ['hospitality', 'specialty'], compatibleRootTypes: collectionsInstall, icon: 'wine-outline', color: '#881337', searchTokens: 'adega climatizado urmidade cava', fieldSchema: [
    { id: 'rh', labelKey: 'assetField.rhTarget', type: 'text' },
  ], defaultModules: mod({ media: true, insurance: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'wine' },
  { id: 'XRAY', labelKey: 'assetKinds.xray', shortDescKey: 'assetKinds.xrayShort', contextIds: ['health'], compatibleRootTypes: install, icon: 'scan-circle-outline', color: '#0F172A', searchTokens: 'raio-x adex odonto pan', fieldSchema: [
    { id: 'dose', labelKey: 'assetField.nextCal', type: 'date' },
  ], defaultModules: mod({ stock: false, vault: true, reports: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'dental' },
  { id: 'UPS_BANK', labelKey: 'assetKinds.ups', shortDescKey: 'assetKinds.upsShort', contextIds: ['it_telecom', 'infra_built'], compatibleRootTypes: install, icon: 'battery-charging-outline', color: '#CA8A04', searchTokens: 'nobreak bateria central telefonia', fieldSchema: [
    { id: 'kva', labelKey: 'assetField.upsKva', type: 'text' },
  ], defaultModules: mod({ insurance: true }), maintenanceIntervalMonths: 6, marketplaceTag: 'electrical' },
  { id: 'BROADCAST_CONSOLE', labelKey: 'assetKinds.mixingConsole', shortDescKey: 'assetKinds.mixingConsoleShort', contextIds: ['creative'], compatibleRootTypes: install, icon: 'radio-outline', color: '#6D28D9', searchTokens: 'consoles mesa dante presonus m32', fieldSchema: [
    { id: 'channels', labelKey: 'assetField.mixerCh', type: 'number' },
  ], defaultModules: mod({ stock: true, media: true }), maintenanceIntervalMonths: 12, marketplaceTag: 'audio' },
  { id: 'CANOPY_DOCK', labelKey: 'assetKinds.dock', shortDescKey: 'assetKinds.dockShort', contextIds: ['industry', 'hospitality'], compatibleRootTypes: install, icon: 'resize-outline', color: '#4B5563', searchTokens: 'nivel doca carga lona', fieldSchema: [
    { id: 'brand', labelKey: 'assetField.dockBrand', type: 'text' },
  ], defaultModules: mod({ stock: true, insurance: false }), maintenanceIntervalMonths: 12, marketplaceTag: 'industrial' },
  { id: 'SCANNER', labelKey: 'assetKinds.scanner', shortDescKey: 'assetKinds.scannerShort', contextIds: ['industry', 'hospitality', 'creative'], compatibleRootTypes: install, icon: 'print-outline', color: '#0F172A', searchTokens: 'scanner fujitsu kodak pppm', fieldSchema: [
    { id: 'ppm', labelKey: 'assetField.scanPpm', type: 'text' },
  ], defaultModules: mod({ media: true, insurance: true }), maintenanceIntervalMonths: 12, marketplaceTag: 'office' },
  { id: 'PAD_PROOFER', labelKey: 'assetKinds.ovenBakery', shortDescKey: 'assetKinds.ovenBakeryShort', contextIds: ['food_horeca', 'hospitality'], compatibleRootTypes: install, icon: 'nutrition-outline', color: '#B45309', searchTokens: 'rota panificador forno padaria', fieldSchema: [
    { id: 'basket', labelKey: 'assetField.ovenBaskets', type: 'text' },
  ], defaultModules: mod({ media: true, insurance: true }), maintenanceIntervalMonths: 2, marketplaceTag: 'bakery' },
  { id: 'CNC_SEW', labelKey: 'assetKinds.sewCnc', shortDescKey: 'assetKinds.sewCncShort', contextIds: ['industry', 'hospitality'], compatibleRootTypes: install, icon: 'cut-outline', color: '#BE185D', searchTokens: 'corte costura industrial broder', fieldSchema: [
    { id: 'heads', labelKey: 'assetField.sewHeads', type: 'number' },
  ], defaultModules: mod({ stock: true, insurance: true, costs: true }), maintenanceIntervalMonths: 3, marketplaceTag: 'textile' },
  { id: 'CIRCULAR_SAW', labelKey: 'assetKinds.woodSaw', shortDescKey: 'assetKinds.woodSawShort', contextIds: ['industry', 'hospitality'], compatibleRootTypes: install, icon: 'stats-chart-outline', color: '#92400E', searchTokens: 'serra circular madeira serralheria', fieldSchema: [
    { id: 'bladeDmm', labelKey: 'assetField.sawDmm', type: 'text' },
  ], defaultModules: mod({ media: true, insurance: true }), maintenanceIntervalMonths: 2, marketplaceTag: 'carpentry' },
  { id: 'CCTV', labelKey: 'assetKinds.cctv', shortDescKey: 'assetKinds.cctvShort', contextIds: ['infra_built', 'hospitality', 'food_horeca'], compatibleRootTypes: install, icon: 'videocam-outline', color: '#374151', searchTokens: 'cftv câmera nvr hik dvr', fieldSchema: [
    { id: 'channelsNvr', labelKey: 'assetField.cctvNvr', type: 'text' },
  ], defaultModules: mod({ media: true, insurance: true }), maintenanceIntervalMonths: 12, marketplaceTag: 'security' },
  { id: 'DELIVERY_MOTO', labelKey: 'assetKinds.deliveryMoto', shortDescKey: 'assetKinds.deliveryMotoShort', contextIds: ['fleet', 'hospitality'], compatibleRootTypes: mobilityRoad, icon: 'bicycle-outline', color: '#DC2626', searchTokens: 'moto bauifood entrega logística ifood', fieldSchema: [
    { id: 'plate', labelKey: 'assetField.plate', type: 'text' },
  ], defaultModules: mod({ insurance: true, media: true, stock: true }) },
];