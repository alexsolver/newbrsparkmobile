'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Fotos demo de perfil (randomuser.me — gratuito e sem auth)
const malePhotos = Array.from({length: 50}, (_, i) => `https://randomuser.me/api/portraits/men/${i + 1}.jpg`);
const femalePhotos = Array.from({length: 50}, (_, i) => `https://randomuser.me/api/portraits/women/${i + 1}.jpg`);
const allPhotos = [...malePhotos, ...femalePhotos];

const cities = [
  'São Paulo', 'São Paulo', 'São Paulo', 'Campinas', 'Guarulhos',
  'Santo André', 'São Bernardo do Campo', 'Osasco', 'Ribeirão Preto',
  'Sorocaba', 'Santos', 'Mogi das Cruzes', 'Bauru', 'Jundiaí', 'Piracicaba'
];

const categories = [
  'Elétrica', 'Elétrica', 'Elétrica', 'Elétrica', 'Elétrica',
  'Hidráulica', 'Hidráulica', 'Hidráulica', 'Hidráulica', 'Hidráulica',
  'Limpeza', 'Limpeza', 'Limpeza', 'Limpeza', 'Limpeza',
  'Reformas', 'Reformas', 'Reformas', 'Reformas', 'Reformas',
  'Jardinagem', 'Jardinagem', 'Jardinagem', 'Jardinagem', 'Jardinagem',
  'Segurança', 'Segurança', 'Segurança',
  'Climatização', 'Climatização', 'Climatização',
  'Tecnologia', 'Tecnologia', 'Tecnologia',
  'Dedetização', 'Dedetização',
  'Mudança', 'Mudança', 'Mudança',
  'Gás', 'Gás',
  'Pintura', 'Pintura', 'Pintura',
];

const tagsByCategory = {
  'Elétrica':     [['Instalação','Quadro','SPDA'],['Tomadas','Iluminação','Rápido'],['Industrial','Residencial','Urgência'],['Gerador','Painel','Certificado'],['24h','Emergência','Confiável']],
  'Hidráulica':   [['Vazamento','Registro','Urgência'],['Fossa','Desentupimento','Bomba'],['Caixa d\'Água','Encanamento','Rápido'],['Aquecimento','Chuveiro','Infiltração'],['Esgoto','Residencial','Vistoria']],
  'Limpeza':      [['Residencial','Periódica','Confiável'],['Pós Obra','Profissional','Rápido'],['Condomínio','Predial','Empresa'],['Hospitalar','Especializada','Certificada'],['Fim de Obra','Vidros','Fachada']],
  'Reformas':     [['Alvenaria','Acabamento','Pontual'],['Banheiro','Cozinha','Design'],['Pintura','Textura','Remodelação'],['Gesseiro','Forro de Gesso','Acabamento'],['Azulejo','Porcelanato','Assentamento']],
  'Jardinagem':   [['Poda','Paisagismo','Manutenção'],['Grama','Adubação','Irrigação'],['Jardim','Horta','Orgânico'],['Árvores','Poda','Certificado'],['Vasos','Decoração','Projeto']],
  'Segurança':    [['Câmeras','CFTV','24h'],['Alarme','Monitoramento','Residencial'],['Portão','Cerca Elétrica','Instalação']],
  'Climatização': [['Ar Condicionado','Instalação','Manutenção'],['Split','Inverter','Limpeza'],['Central','Comercial','Certificado']],
  'Tecnologia':   [['Redes','Wi-Fi','Cabeamento'],['Computadores','Formatação','Suporte'],['CFTV','Servidor','Backup']],
  'Dedetização':  [['Cupim','Baratas','Ratos'],['Formigas','Mosquitos','Certificado']],
  'Mudança':      [['Residencial','Caminhão','Embalagem'],['Comercial','Piano','Desmontagem'],['Guarda Móveis','Seguro','Rápido']],
  'Gás':          [['Instalação','Vazamento','Regulagem'],['Botijão','Encanamento','Urgência']],
  'Pintura':      [['Interna','Externa','Textura'],['Epóxi','Piso','Especializado'],['Fachada','Predial','CertificadoMaestria']],
};

const keywordsByCategory = {
  'Elétrica':     'eletrica instalacao quadro tomada luz iluminacao spda gerador urgencia emergencia',
  'Hidráulica':   'hidraulica encanamento cano vazamento desentupimento fossa bomba agua aquecedor',
  'Limpeza':      'limpeza faxina residencial comercial predial condominio pos obra vidros fachada',
  'Reformas':     'reforma alvenaria construcao acabamento banheiro cozinha azulejo porcelanato gesseiro',
  'Jardinagem':   'jardinagem poda paisagismo jardim grama adubacao irrigacao arvore horta organico',
  'Segurança':    'seguranca cameras alarme monitoramento cftv cerca eletrica portao residencial',
  'Climatização': 'ar condicionado split inverter climatizacao limpeza instalacao manutencao central',
  'Tecnologia':   'tecnologia rede wifi cabeamento computador notebook formatacao servidor cftv backup',
  'Dedetização':  'dedetizacao cupim rato barata formiga mosquito certificado controle pragas',
  'Mudança':      'mudanca transporte caminhao embalar desmontar guarda moveis comercial residencial',
  'Gás':          'gas gasoducto instalacao vazamento botijao encanamento regulagem urgencia',
  'Pintura':      'pintura tinta parede textura interna externa fachada predial epóxi piso',
};

const names = [
  'Eletro Rápido SP', 'Hidro Fix Encanamentos', 'Spick & Span Limpeza', 'ReformaMax SP', 'Verde Jardins',
  'SecureHome SP', 'ClimaTech SP', 'TechSupport Brasil', 'Dedetizadora Alpha SP', 'Mudança Fácil SP',
  'Gastech Instalações', 'Pintor Pro SP', 'Elétrica 24h Santos', 'AquaPro Hidráulica', 'CleanSpace SP',
  'MultiServ Elétrica', 'HidroMestre', 'LimpaMax', 'ConstruFácil', 'JardimVerde',
  'GuardaSeuLar', 'FrioCerto', 'NetFix TI', 'PragaZero', 'CarregaFácil',
  'Eletro Norte SP', 'CanoMestre', 'BrilhoTotal', 'AlvenariaMax', 'EcoJardim',
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randFloat(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(1)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function phone() {
  const ddd = rand(['11','11','11','11','19','15','13','11']);
  const n = `9${randInt(1000,9999)}-${randInt(1000,9999)}`;
  return `(${ddd}) ${n}`;
}

async function main() {
  console.log('🌱 Criando 100 prestadores de serviço com dados demo...\n');

  // Remove os 15 que já existem para recriar todos corretamente
  await p.serviceProvider.deleteMany({});
  console.log('🗑️  Prestadores anteriores removidos');

  const providers = [];
  for (let i = 0; i < 30; i++) {
    const catIdx = i % categories.length;
    const cat = categories[catIdx];
    const tagOptions = tagsByCategory[cat];
    const tags = rand(tagOptions);
    const name = names[i] || `Prestador Demo ${i + 1}`;
    const rating = randFloat(3.8, 5.0);
    const reviews = randInt(5, 320);
    const photo = allPhotos[i % allPhotos.length];

    providers.push({
      name,
      category: cat,
      rating,
      reviews,
      photo,
      tags: JSON.stringify(tags),
      keywords: keywordsByCategory[cat],
      phone: phone(),
      city: rand(cities),
      state: 'SP',
      verified: Math.random() > 0.3, // 70% verificados
      isActive: true,
    });
  }

  let created = 0;
  for (const prov of providers) {
    await p.serviceProvider.create({ data: prov });
    created++;
  }

  const total = await p.serviceProvider.count();
  console.log(`\n✅ ${total} empresas prestadoras criadas com sucesso!`);
  console.log('   Fotos: randomuser.me (fotos realistas de perfil)');
  console.log('   Categorias: 12 categorias cobertas');
  console.log('   Cidades: 15 cidades brasileiras');
  console.log('\n🎉 Concluído! Feche e abra o app para ver os prestadores.');
  process.exit(0);
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
