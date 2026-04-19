/**
 * Gera src/asset/assetIconLibrary.ts a partir dos ícones outline do Ionicons (Expo).
 * Rode: node scripts/generate-asset-icon-library.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ionPath = path.join(
  root,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'
);

const glyphs = JSON.parse(fs.readFileSync(ionPath, 'utf8'));
const allOutline = Object.keys(glyphs)
  .filter((n) => n.endsWith('-outline'))
  .sort();

/** Palavras comuns no id do ícone → rótulo curto em pt-BR */
const PT = {
  accessibility: 'Acessibilidade',
  airplane: 'Avião',
  alarm: 'Alarme',
  analytics: 'Análises',
  aperture: 'Abertura',
  apps: 'Apps',
  archive: 'Arquivo',
  arrow: 'Seta',
  at: 'Arroba',
  attach: 'Anexo',
  bag: 'Bolsa',
  balloon: 'Balão',
  ban: 'Bloquear',
  bandage: 'Bandagem',
  bar: 'Bar',
  barbell: 'Halter',
  barcode: 'Código barras',
  baseball: 'Beisebol',
  basket: 'Cesta',
  basketball: 'Basquete',
  battery: 'Bateria',
  beaker: 'Béquer',
  bed: 'Cama',
  beer: 'Cerveja',
  bicycle: 'Bicicleta',
  bluetooth: 'Bluetooth',
  boat: 'Barco',
  body: 'Corpo',
  bonfire: 'Fogueira',
  book: 'Livro',
  bookmark: 'Marcador',
  bowling: 'Boliche',
  briefcase: 'Maleta',
  brush: 'Pincel',
  bug: 'Bug',
  build: 'Construir',
  bulb: 'Lâmpada',
  bus: 'Ônibus',
  business: 'Negócios',
  cafe: 'Café',
  calculator: 'Calculadora',
  calendar: 'Calendário',
  call: 'Chamada',
  camera: 'Câmera',
  car: 'Carro',
  card: 'Cartão',
  caret: 'Seta',
  cart: 'Carrinho',
  cash: 'Dinheiro',
  cellular: 'Celular',
  chatbox: 'Chat',
  chatbubble: 'Mensagem',
  checkbox: 'Checkbox',
  checkmark: 'Confirmação',
  chevron: 'Chevron',
  clipboard: 'Área transf.',
  close: 'Fechar',
  cloud: 'Nuvem',
  cloudy: 'Nublado',
  code: 'Código',
  cog: 'Engrenagem',
  color: 'Cor',
  compass: 'Bússola',
  construct: 'Construção',
  contract: 'Contrato',
  contrast: 'Contraste',
  copy: 'Copiar',
  create: 'Criar',
  crop: 'Recortar',
  cube: 'Cubo',
  cut: 'Cortar',
  desktop: 'Desktop',
  diamond: 'Diamante',
  dice: 'Dado',
  disc: 'Disco',
  document: 'Documento',
  documents: 'Documentos',
  download: 'Download',
  duplicate: 'Duplicar',
  ear: 'Ouvido',
  earth: 'Terra',
  easel: 'Cavalete',
  egg: 'Ovo',
  ellipse: 'Elipse',
  ellipsis: 'Reticências',
  enter: 'Entrar',
  exit: 'Sair',
  expand: 'Expandir',
  extension: 'Extensão',
  eye: 'Olho',
  eyedrop: 'Conta-gotas',
  fast: 'Comida rápida',
  female: 'Feminino',
  file: 'Arquivo',
  film: 'Filme',
  filter: 'Filtro',
  finger: 'Digital',
  fish: 'Peixe',
  fitness: 'Fitness',
  flag: 'Bandeira',
  flame: 'Chama',
  flash: 'Flash',
  flashlight: 'Lanterna',
  flask: 'Frasco',
  flower: 'Flor',
  folder: 'Pasta',
  football: 'Futebol amer.',
  footsteps: 'Passos',
  funnel: 'Funil',
  game: 'Jogo',
  gift: 'Presente',
  git: 'Git',
  glasses: 'Óculos',
  globe: 'Globo',
  golf: 'Golfe',
  grid: 'Grade',
  hammer: 'Martelo',
  hand: 'Mão',
  happy: 'Feliz',
  hardware: 'Hardware',
  chip: 'Chip',
  headset: 'Headset',
  heart: 'Coração',
  help: 'Ajuda',
  home: 'Casa',
  hourglass: 'Ampulheta',
  ice: 'Sorvete',
  id: 'ID',
  image: 'Imagem',
  images: 'Imagens',
  information: 'Info',
  invert: 'Inverter',
  journal: 'Diário',
  key: 'Chave',
  keypad: 'Teclado',
  language: 'Idioma',
  laptop: 'Notebook',
  layers: 'Camadas',
  leaf: 'Folha',
  library: 'Biblioteca',
  link: 'Link',
  list: 'Lista',
  locate: 'Localizar',
  location: 'Local',
  lock: 'Cadeado',
  log: 'Log',
  mail: 'E-mail',
  male: 'Masculino',
  man: 'Homem',
  map: 'Mapa',
  medal: 'Medalha',
  medkit: 'Saúde',
  megaphone: 'Megafone',
  menu: 'Menu',
  mic: 'Microfone',
  moon: 'Lua',
  move: 'Mover',
  musical: 'Música',
  navigate: 'Navegar',
  newspaper: 'Jornal',
  notifications: 'Notificação',
  nuclear: 'Nuclear',
  nutrition: 'Nutrição',
  open: 'Abrir',
  options: 'Opções',
  paper: 'Papel',
  partly: 'Parcial',
  pause: 'Pausa',
  paw: 'Pata',
  pencil: 'Lápis',
  people: 'Pessoas',
  person: 'Pessoa',
  phone: 'Telefone',
  portrait: 'Retrato',
  landscape: 'Paisagem',
  charging: 'Carregando',
  pie: 'Pizza gráf.',
  pin: 'Alfinete',
  pint: 'Caneca',
  pizza: 'Pizza',
  planet: 'Planeta',
  play: 'Play',
  podium: 'Pódio',
  power: 'Energia',
  pricetag: 'Etiqueta',
  print: 'Impressão',
  prism: 'Prisma',
  pulse: 'Pulso',
  push: 'Push',
  qr: 'QR',
  radio: 'Rádio',
  rainy: 'Chuva',
  reader: 'Leitor',
  receipt: 'Recibo',
  recording: 'Gravação',
  refresh: 'Atualizar',
  remove: 'Remover',
  reorder: 'Reordenar',
  repeat: 'Repetir',
  resize: 'Redimensionar',
  restaurant: 'Restaurante',
  ribbon: 'Fita',
  rocket: 'Foguete',
  rose: 'Rosa',
  sad: 'Triste',
  save: 'Salvar',
  scale: 'Balança',
  scan: 'Escanear',
  school: 'Escola',
  search: 'Buscar',
  send: 'Enviar',
  server: 'Servidor',
  settings: 'Ajustes',
  shapes: 'Formas',
  share: 'Compartilhar',
  shield: 'Escudo',
  shirt: 'Camisa',
  shuffle: 'Embaralhar',
  skull: 'Caveira',
  snow: 'Neve',
  sparkles: 'Brilhos',
  speedometer: 'Velocímetro',
  square: 'Quadrado',
  star: 'Estrela',
  stats: 'Estatísticas',
  stopwatch: 'Cronômetro',
  storefront: 'Loja',
  subway: 'Metrô',
  sunny: 'Sol',
  swap: 'Trocar',
  sync: 'Sincronizar',
  tablet: 'Tablet',
  telescope: 'Telescópio',
  tennis: 'Tênis',
  terminal: 'Terminal',
  text: 'Texto',
  thermometer: 'Termômetro',
  thumbs: 'Polegar',
  ticket: 'Ingresso',
  time: 'Tempo',
  timer: 'Timer',
  today: 'Hoje',
  toggle: 'Alternar',
  trail: 'Trilha',
  train: 'Trem',
  transgender: 'Transgênero',
  trash: 'Lixeira',
  trending: 'Tendência',
  triangle: 'Triângulo',
  trophy: 'Troféu',
  tv: 'TV',
  umbrella: 'Guarda-chuva',
  unlink: 'Desvincular',
  videocam: 'Vídeo',
  volume: 'Volume',
  walk: 'Caminhar',
  wallet: 'Carteira',
  warning: 'Alerta',
  watch: 'Relógio',
  water: 'Água',
  wifi: 'Wi‑Fi',
  wine: 'Vinho',
  woman: 'Mulher',
};

function labelForIconId(id) {
  const base = id.replace(/-outline$/, '');
  const parts = base.split('-');
  const mapped = parts.map((p) => PT[p] || capitalize(p));
  const dedup = mapped.filter((x, i) => i === 0 || x !== mapped[i - 1]);
  let out = dedup.join(' · ');
  if (out.length > 34) out = out.slice(0, 32) + '…';
  return out;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Ordem preferida (mais usados em ativos) — deve existir no JSON */
const priority = [
  'home-outline',
  'business-outline',
  'storefront-outline',
  'bed-outline',
  'car-outline',
  'boat-outline',
  'airplane-outline',
  'bicycle-outline',
  'bus-outline',
  'train-outline',
  'wallet-outline',
  'hardware-chip-outline',
  'server-outline',
  'desktop-outline',
  'laptop-outline',
  'phone-portrait-outline',
  'tablet-portrait-outline',
  'camera-outline',
  'videocam-outline',
  'construct-outline',
  'hammer-outline',
  'leaf-outline',
  'water-outline',
  'flame-outline',
  'flash-outline',
  'battery-charging-outline',
  'medkit-outline',
  'fitness-outline',
  'school-outline',
  'library-outline',
  'restaurant-outline',
  'cafe-outline',
  'wine-outline',
  'pizza-outline',
  'musical-notes-outline',
  'color-palette-outline',
  'image-outline',
  'diamond-outline',
  'shield-outline',
  'key-outline',
  'lock-closed-outline',
  'globe-outline',
  'navigate-outline',
  'map-outline',
  'location-outline',
  'trail-sign-outline',
  'cube-outline',
  'layers-outline',
  'git-network-outline',
  'briefcase-outline',
  'barbell-outline',
  'football-outline',
  'basketball-outline',
  'golf-outline',
  'tennis-outline',
  'snow-outline',
  'rainy-outline',
  'partly-sunny-outline',
  'cloud-outline',
  'thunderstorm-outline',
];

const seen = new Set();
const ordered = [];

for (const id of priority) {
  if (glyphs[id] !== undefined) {
    ordered.push(id);
    seen.add(id);
  }
}
for (const id of allOutline) {
  if (!seen.has(id)) {
    ordered.push(id);
    seen.add(id);
  }
}

const entries = ordered.map((icon) => ({
  icon,
  label: labelForIconId(icon),
}));

const header = `/**
 * Biblioteca de ícones para ativos (Ionicons outline).
 * Gerado por scripts/generate-asset-icon-library.mjs — não edite à mão em massa.
 */
export type AssetIconEntry = { icon: string; label: string };

export const ASSET_ICON_LIBRARY: AssetIconEntry[] = [
`;

const lines = entries.map(
  (e) => `  { icon: ${JSON.stringify(e.icon)}, label: ${JSON.stringify(e.label)} },`
);

const footer = `
];

/** Total de ícones disponíveis */
export const ASSET_ICON_LIBRARY_COUNT = ASSET_ICON_LIBRARY.length;
`;

const outPath = path.join(root, 'src/asset/assetIconLibrary.ts');
fs.writeFileSync(outPath, header + lines.join('\n') + footer, 'utf8');
console.log('Wrote', outPath, 'entries:', entries.length);
