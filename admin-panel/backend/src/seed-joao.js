'use strict';
/**
 * seed-joao.js — 4 bens demo + estoque para o usuário João
 * Run: node src/seed-joao.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Find João
  const user = await p.user.findFirst({
    where: { email: 'joao@teste.com' },
    include: { tenant: true },
  });
  if (!user) throw new Error('Usuário joao@teste.com não encontrado.');
  const tenantId = user.tenantId;
  console.log(`✅ Tenant: ${user.tenant.name} (${tenantId})\n`);

  // ── 4 bens demo ────────────────────────────────────────────
  const assetsData = [
    {
      id: 'joao-asset-casa',
      title: 'Casa Residencial — Morumbi',
      type: 'REAL_ESTATE',
      status: 'Operacional',
      description: 'Residência principal. 3 quartos, 2 banheiros, garagem para 2 carros. 180m².',
      metadata: {
        area: '180m²',
        bedrooms: 3,
        bathrooms: 2,
        yearBuilt: 2005,
        marketValue: 950000,
        iptu: 'SP-2024-00123456',
        address: 'Rua das Palmeiras, 142 — Morumbi, São Paulo/SP',
      },
      stock: [
        { sku: 'LIMPEZA-001', name: 'Detergente Líquido 500ml',  unit: 'un', currentStock: 8,  minStock: 3, unitPrice: 4.50 },
        { sku: 'LIMPEZA-002', name: 'Água Sanitária 1L',          unit: 'un', currentStock: 4,  minStock: 2, unitPrice: 6.90 },
        { sku: 'LIMPEZA-003', name: 'Sabão em Pó 1kg',            unit: 'kg', currentStock: 2,  minStock: 1, unitPrice: 12.80 },
        { sku: 'MANUT-001',   name: 'Lâmpada LED 9W Fria',        unit: 'un', currentStock: 12, minStock: 4, unitPrice: 18.00 },
        { sku: 'MANUT-002',   name: 'Pilha AA (pack 4)',           unit: 'pk', currentStock: 6,  minStock: 2, unitPrice: 14.90 },
        { sku: 'MANUT-003',   name: 'Tomada 2P+T Universal',      unit: 'un', currentStock: 3,  minStock: 2, unitPrice: 22.00 },
        { sku: 'JARDIN-001',  name: 'Adubo NPK 1kg',              unit: 'kg', currentStock: 3,  minStock: 1, unitPrice: 19.90 },
        { sku: 'JARDIN-002',  name: 'Inseticida Spray 300ml',     unit: 'un', currentStock: 2,  minStock: 1, unitPrice: 28.50 },
      ],
    },
    {
      id: 'joao-asset-carro',
      title: 'Honda CR-V 2022 — Prata',
      type: 'TERRESTRIAL',
      status: 'Operacional',
      description: 'SUV. Motor 1.5 Turbo. 45.200km rodados. Revisão em dia.',
      metadata: {
        placa: 'BRA2E24',
        renavam: '01234567890',
        chassis: '9BHBH55P0DC123456',
        anoFabricacao: 2022,
        cor: 'Prata',
        combustivel: 'Gasolina/Álcool',
        km: 45200,
        seguroVencimento: '2025-06-15',
      },
      stock: [
        { sku: 'VEI-001', name: 'Óleo Motor 5W30 (1L)',           unit: 'L',  currentStock: 5,  minStock: 2, unitPrice: 38.90 },
        { sku: 'VEI-002', name: 'Fluido de Freio DOT4',           unit: 'un', currentStock: 2,  minStock: 1, unitPrice: 25.00 },
        { sku: 'VEI-003', name: 'Palheta Dianteira (par)',        unit: 'pr', currentStock: 1,  minStock: 1, unitPrice: 67.00 },
        { sku: 'VEI-004', name: 'Filtro de Ar',                   unit: 'un', currentStock: 1,  minStock: 1, unitPrice: 45.00 },
        { sku: 'VEI-005', name: 'Pneu Rundurance 225/60R18',      unit: 'un', currentStock: 0,  minStock: 1, unitPrice: 489.00 },
        { sku: 'VEI-006', name: 'Triângulo de Sinalização',       unit: 'un', currentStock: 1,  minStock: 1, unitPrice: 55.00 },
      ],
    },
    {
      id: 'joao-asset-escritorio',
      title: 'Studio/Home Office — Pinheiros',
      type: 'REAL_ESTATE',
      status: 'Operacional',
      description: 'Studio de 42m² utilizado como escritório. Aluguel gerenciado.',
      metadata: {
        area: '42m²',
        andar: 5,
        vaga: 1,
        condominio: 'Edifício Business Center',
        aluguel: 3200,
        iptu: 'SP-2024-00654321',
        address: 'Alameda dos Arapanés, 58 — Pinheiros, São Paulo/SP',
      },
      stock: [
        { sku: 'ESC-001', name: 'Papel A4 (resma 500fls)',        unit: 'rs', currentStock: 4,  minStock: 2, unitPrice: 28.00 },
        { sku: 'ESC-002', name: 'Caneta Esferográfica (cx12)',    unit: 'cx', currentStock: 2,  minStock: 1, unitPrice: 22.00 },
        { sku: 'ESC-003', name: 'Cartucho Impressora HP 664',     unit: 'un', currentStock: 1,  minStock: 2, unitPrice: 89.90 },
        { sku: 'ESC-004', name: 'Álcool Isopropílico 70% 1L',     unit: 'L',  currentStock: 2,  minStock: 1, unitPrice: 18.50 },
        { sku: 'ESC-005', name: 'Cabo USB-C 1m',                  unit: 'un', currentStock: 3,  minStock: 1, unitPrice: 35.00 },
        { sku: 'MANUT-004',name: 'Lâmpada LED 12W Branca',        unit: 'un', currentStock: 5,  minStock: 2, unitPrice: 22.00 },
      ],
    },
    {
      id: 'joao-asset-barco',
      title: 'Lancha Focker 215 Open — 2019',
      type: 'AQUATIC',
      status: 'Em Manutenção',
      description: 'Lancha com motor Mercury 115HP. Atracada na Marina de Guarujá. Revisão anual em andamento.',
      metadata: {
        modelo: 'Focker 215 Open',
        motor: 'Mercury 115HP 4T',
        anoFabricacao: 2019,
        comprimento: '6.40m',
        capacidade: '8 pessoas',
        inscricaoNaval: 'SP-001234/2019',
        marina: 'Marina Guarujá — Box 42',
        seguroVencimento: '2025-09-30',
      },
      stock: [
        { sku: 'NAU-001', name: 'Óleo Motor Náutico 10W40 (1L)', unit: 'L',  currentStock: 6,  minStock: 3, unitPrice: 65.00 },
        { sku: 'NAU-002', name: 'Combustível Gasolina (L)',       unit: 'L',  currentStock: 120, minStock: 50, unitPrice: 5.89 },
        { sku: 'NAU-003', name: 'Colete Salva-Vidas Adulto',     unit: 'un', currentStock: 8,  minStock: 8, unitPrice: 180.00 },
        { sku: 'NAU-004', name: 'Sinalizador Pirotécnico',        unit: 'un', currentStock: 3,  minStock: 3, unitPrice: 45.00 },
        { sku: 'NAU-005', name: 'Graxa de Proteção Marítima',    unit: 'un', currentStock: 2,  minStock: 1, unitPrice: 42.00 },
        { sku: 'NAU-006', name: 'Âncora de Mão 4kg',             unit: 'un', currentStock: 1,  minStock: 1, unitPrice: 290.00 },
        { sku: 'NAU-007', name: 'Extintor ABC 1kg',              unit: 'un', currentStock: 2,  minStock: 2, unitPrice: 95.00 },
      ],
    },
  ];

  let totalAssets = 0, totalStock = 0;

  for (const assetDef of assetsData) {
    const { stock, ...assetFields } = assetDef;

    // Upsert asset
    const asset = await p.asset.upsert({
      where: { id: assetDef.id },
      update: { title: assetFields.title, description: assetFields.description, status: assetFields.status, metadata: assetFields.metadata },
      create: { ...assetFields, tenantId },
    });
    console.log(`  ✅ Bem: ${asset.title}`);
    totalAssets++;

    // Upsert stock items
    for (const item of stock) {
      await p.stockItem.upsert({
        where: { assetId_sku: { assetId: asset.id, sku: item.sku } },
        update: { currentStock: item.currentStock, unitPrice: item.unitPrice },
        create: { ...item, assetId: asset.id },
      });
      totalStock++;
    }
    console.log(`     └─ ${stock.length} itens de estoque`);
  }

  console.log(`\n🎉 Done! ${totalAssets} bens e ${totalStock} itens de estoque criados para ${user.name}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); }).finally(() => p.$disconnect());
