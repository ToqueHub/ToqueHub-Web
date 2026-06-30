import { StocksOcrService } from './stocks-ocr.service';

type ExpectedItem = {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  code?: string;
  freight?: boolean;
};

function mockPrisma(): any {
  return {
    supplier: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'supplier-tingstad', name: 'AB Tingstad papper' },
        { id: 'supplier-kespro', name: 'Kespro' },
        { id: 'supplier-passionfroid', name: 'PassionFroid' },
      ]),
    },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    unit: { findMany: jest.fn().mockResolvedValue([]) },
    organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: null }) },
  };
}

function mockMarginsService(): any {
  return { analyzeReceptionForAlertsTx: jest.fn().mockResolvedValue(undefined) };
}

async function extract(text: string) {
  const service = new StocksOcrService(mockPrisma(), mockMarginsService());
  jest.spyOn(service as any, 'analyzeOcrWithMistralAi').mockImplementation((_organizationId, _markdown, _rawJson, fallback) => {
    return Promise.resolve((service as any).aiFallback(fallback, 'Analyse IA désactivée en test.'));
  });
  return (service as any).extractBusinessData('org-1', text, null);
}

function tingstadFixture(input: {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  orderNumber: string;
  rows: string[];
  net: string;
  vat: string;
  rounding: string;
  grand: string;
}) {
  return `
Laskun kopio   Anna tämä
laskutusnumero
Lasku päiväys  maksun yhteydessä
${input.invoiceDate}      Lasku
${input.invoiceNumber}

Viitteemme    Myyjä          Meidän tilausnumero Tilaajan nimi Tilausnumero
tingstad.se   Caroline Tjeder ${input.orderNumber}     Moona Mankinen

Toimitusasiakas      Asiakasnumero       Yrityksen nimi:
THE FRENCH CAFÉ OY   318379              The French Café Oy
THE FRENCH CAFÉ
KITKANTIE 2
93600 KUUSAMO
FI33325434

Toimitusehdot                  Toimitustapa
FF 500 EUR (ej ff 25 EUR)      Finland

Maksutapa                      Eräpäivä
Lasku                          ${input.dueDate}

Viivästyskorko 12,00%

Määrä
Nimike   Nimi                    YksYksikkö á hinta                Yhteensä
${input.rows.join('\n')}
Pakkaukset ovat tuottajavastuun SFS 1994:1235 alla.

Yhteensä netto Repa-maksu ALV 0 [% av] ${input.net.replace(',00', '')} = 0 ALV yhteensä Pyöristys Loppusumma
sisältyy
${input.grand}
hintaan
${input.net}                                              ${input.vat}   ${input.rounding}
0,00
IBAN: SE58 8000 0810 5991 4581 6121
AB Tingstad papper Puh. Asiakaspalvelu: Verkkosivut: ALV Pankkiyhteys Ruotsiin: Bankgiro
+358 942 722 850 www.tingstad.com SE556117119901 BIC: SWEDSESS 441-2979
BOX 13013
402 51 GÖTEBORG
`;
}

function kesproFixture(input: {
  orderNumber: string;
  orderDate: string;
  deliveryDate: string;
  productCount: number;
  rows: string[];
  withoutTax: string;
  vat: string;
  total: string;
}) {
  return `
${input.orderNumber} - Tilauksen tiedot - Tilaushistoria 29/06/2026 18:42

Order information
Order date: ${input.orderDate}
Selected delivery date ${input.deliveryDate}

Delivery information
Order number      ${input.orderNumber}          Delivery address  Kitkantie 2 , 93600 Kuusamo
Company           The French Café, The French Café Oy Order type / delivery Standard order
Customer number   1853681           Email
Orderer           kahvila@the-french-cafe.com Your reference

${input.productCount}
products
Delivery date ${input.deliveryDate.replace(/^[A-Za-z]+\s+/, '')}

Quantity / ME
Product              Unit price / ME                               Total price
units
${input.rows.join('\n')}

Tax breakdown
Tax base          VAT %             Price excluding tax Price including tax
Descriptions for product labelling
Without tax           ${input.withoutTax} €
Total VAT              ${input.vat} €
Total                 ${input.total} €
https://www.kespro.fi/en/jakelutie80/omatili/tilaushistoria/${input.orderNumber}
`;
}

const tingstadCases: Array<{
  file: string;
  text: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  orderNumber: string;
  grandTotal: number;
  items: ExpectedItem[];
}> = [
  {
    file: 'Lasku.pdf',
    invoiceNumber: '63022004',
    invoiceDate: '2026-05-23',
    dueDate: '2026-06-22',
    orderNumber: '12205992',
    grandTotal: 249.02,
    text: tingstadFixture({
      invoiceNumber: '63022004',
      invoiceDate: '23.5.2026',
      dueDate: '22.6.2026',
      orderNumber: '12205992',
      net: '249,02',
      vat: '0,00',
      rounding: '0,00',
      grand: '249,02',
      rows: [
        '318145   PVC-kelmua Wrapmaster 45cm x 300m 1,00ltk 36,00             36,00',
        '         yrityskäyttöön 3/ltk',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         GB                                                           3,438',
        '250250100 Kakkulaatikko ikkunalla, valkoinen 2,00ltk 64,26           128,52',
        '         25x25x10 cm 100/ltk',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         IN                                                           11,22',
        '320320120 Kakkulaatikko ikkunalla valkoinen 1,00ltk 59,50            59,50',
        '         32x32x12 cm 75/ltk',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         IN                                                          13,815',
        '5555     RAHTI 1/kpl              1,00kpl  25,00                     25,00',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         SE                                                             0',
      ],
    }),
    items: [
      { code: '318145', name: 'PVC-kelmua Wrapmaster 45cm x 300m', quantity: 1, unit: 'ltk', unitPrice: 36, total: 36 },
      { code: '250250100', name: 'Kakkulaatikko ikkunalla, valkoinen', quantity: 2, unit: 'ltk', unitPrice: 64.26, total: 128.52 },
      { code: '320320120', name: 'Kakkulaatikko ikkunalla valkoinen', quantity: 1, unit: 'ltk', unitPrice: 59.5, total: 59.5 },
      { code: '5555', name: 'RAHTI 1/kpl', quantity: 1, unit: 'kpl', unitPrice: 25, total: 25, freight: true },
    ],
  },
  {
    file: 'Lasku-2.pdf',
    invoiceNumber: '62892197',
    invoiceDate: '2026-03-28',
    dueDate: '2026-04-27',
    orderNumber: '12144017',
    grandTotal: 170,
    text: tingstadFixture({
      invoiceNumber: '62892197',
      invoiceDate: '28.3.2026',
      dueDate: '27.4.2026',
      orderNumber: '12144017',
      net: '170,00',
      vat: '0,00',
      rounding: '0,00',
      grand: '170,00',
      rows: [
        '1053070  KAKKUALUSTA KULTA 80MM KORVA 10,00ltk 17,00                 170,00',
        '         250/ltk',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         SE                                                           1,04',
        '5555     RAHTI 1/kpl              1,00kpl  25,00                      0,00',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         SE                                                             0',
      ],
    }),
    items: [
      { code: '1053070', name: 'KAKKUALUSTA KULTA 80MM KORVA', quantity: 10, unit: 'ltk', unitPrice: 17, total: 170 },
      { code: '5555', name: 'RAHTI 1/kpl', quantity: 1, unit: 'kpl', unitPrice: 25, total: 0, freight: true },
    ],
  },
  {
    file: 'Lasku-3.pdf',
    invoiceNumber: '62271547',
    invoiceDate: '2025-06-10',
    dueDate: '2025-07-10',
    orderNumber: '11774915',
    grandTotal: 368,
    text: tingstadFixture({
      invoiceNumber: '62271547',
      invoiceDate: '10.6.2025',
      dueDate: '10.7.2025',
      orderNumber: '11774915',
      net: '368,00',
      vat: '0,00',
      rounding: '0,00',
      grand: '368,00',
      rows: [
        '1053070  KAKKUALUSTA KULTA 80MM KORVA 10,00ltk 17,00                 170,00',
        '         250/ltk',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         SE                                                           1,04',
        '39556    KAKKUALUSTA 106X56MM 250/ltk 10,00ltk 19,80                 198,00',
        '         Alkuperämaa [Statnr]                                      Nettopaino',
        '         SE                                                           1,15',
      ],
    }),
    items: [
      { code: '1053070', name: 'KAKKUALUSTA KULTA 80MM KORVA', quantity: 10, unit: 'ltk', unitPrice: 17, total: 170 },
      { code: '39556', name: 'KAKKUALUSTA 106X56MM 250/ltk', quantity: 10, unit: 'ltk', unitPrice: 19.8, total: 198 },
    ],
  },
];

const kesproCases: Array<{
  file: string;
  text: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string;
  total: number;
  items: ExpectedItem[];
}> = [
  {
    file: 'teste 1.pdf',
    orderNumber: '23529809',
    orderDate: '2026-06-26',
    deliveryDate: '2026-07-01',
    total: 638.6,
    text: kesproFixture({
      orderNumber: '23529809',
      orderDate: 'Friday 26.06.2026',
      deliveryDate: 'Wednesday 01.07.2026',
      productCount: 15,
      withoutTax: '545,96',
      vat: '92,64',
      total: '638,60',
      rows: [
        'Fruits & vegetables',
        'Tomato Kespro 5-6kg 1cl import  1      Replaced quantity',
        'Tomaatti NL/BE 1lk 8,33 € / LTK 1    Confirmed quantity / ME      8,33 €',
        'VAT 0 %           units                        VAT 0 %',
        '1 LTK (6 KG)',
        'Cleaning & tissue paper',
        'Katrin hand towel C-fold 2-ply 100 sheets 18,92 € / LTK 2 Confirmed quantity / ME 37,84 €',
        '2 LTK (32 PAK)',
        'Menu nitrile glove black M 100pcs 5,18 € / PKT 2 Confirmed quantity / ME 10,36 €',
        '2 PKT',
        'Kiilto MD Green 10l machine dishwashing 60,76 € / KPL 1 Confirmed quantity / ME 60,76 €',
        'detergent            VAT 0 %           units                        VAT 0 %',
        '1 KPL',
        'Dairy products & eggs',
        'Cessibon blend of cream 250g natural 14,18 € / LTK 2 Confirmed quantity / ME 28,36 €',
        '2 LTK (24 TLK)',
        'Oddlygood Barista oat drink 1l gluten-free UHT 17,18 € / LTK 1 Confirmed quantity / ME 17,18 €',
        '1 LTK (10 TLK)',
        'Pirkka lactose-free milkdrink 1l 3% 24,83 € / LTK 4 Confirmed quantity / ME 99,31 €',
        '4 LTK (80 TLK)',
        'Frozen food',
        'Menu finnish strawberry 2,5kg frozen 59,82 € / LTK 1 Confirmed quantity / ME 59,82 €',
        '1 LTK (2 PSS)',
        'Drinks',
        'Mehukatti Trip Raspberry drink 2 dl 9,30 € / LTK 1 Confirmed quantity / ME 9,30 €',
        '1 LTK (24 TLK)',
        'Mehukatti Trip Pear drink 2dl 9,30 € / LTK 1 Confirmed quantity / ME 9,30 €',
        '1 LTK (24 TLK)',
        'Dry foods & canned food',
        'Ramlösa Kvarn Tipo 00 2kg Wheatflour 17,61 € / PAK 1 Confirmed quantity / ME 17,61 €',
        '1 PAK (6 PSS)',
        'Urbani Tartufi Salsa tartufata tryffeli paste 500g 17,85 € / PRK 3 Confirmed quantity / ME 53,55 €',
        '3 PRK',
        'Kertakäyttöastiat & kattaus',
        'Fredman piping bag blue 270x530mm 72pcs 24,43 € / LTK 2 Confirmed quantity / ME 48,85 €',
        '2 LTK',
        'Bread & pastry',
        'SBS Levain leipä viipaloitu 1250g frozen 38,78 € / LTK 2 Confirmed quantity / ME 77,56 €',
        '2 LTK (8 KPL)',
        'Seasoning & baking',
        'Santa Maria poppy seed blue 550g 7,83 € / TLK 1 Confirmed quantity / ME 7,83 €',
        '1 TLK',
      ],
    }),
    items: [
      { name: 'Tomaatti NL/BE 1lk', quantity: 1, unit: 'LTK', unitPrice: 8.33, total: 8.33 },
      { name: 'Katrin hand towel C-fold 2-ply 100 sheets', quantity: 2, unit: 'LTK', unitPrice: 18.92, total: 37.84 },
      { name: 'Menu nitrile glove black M 100pcs', quantity: 2, unit: 'PKT', unitPrice: 5.18, total: 10.36 },
      { name: 'Kiilto MD Green 10l machine dishwashing detergent', quantity: 1, unit: 'KPL', unitPrice: 60.76, total: 60.76 },
      { name: 'Cessibon blend of cream 250g natural', quantity: 2, unit: 'LTK', unitPrice: 14.18, total: 28.36 },
      { name: 'Oddlygood Barista oat drink 1l gluten-free UHT', quantity: 1, unit: 'LTK', unitPrice: 17.18, total: 17.18 },
      { name: 'Pirkka lactose-free milkdrink 1l 3%', quantity: 4, unit: 'LTK', unitPrice: 24.83, total: 99.31 },
      { name: 'Menu finnish strawberry 2,5kg frozen', quantity: 1, unit: 'LTK', unitPrice: 59.82, total: 59.82 },
      { name: 'Mehukatti Trip Raspberry drink 2 dl', quantity: 1, unit: 'LTK', unitPrice: 9.3, total: 9.3 },
      { name: 'Mehukatti Trip Pear drink 2dl', quantity: 1, unit: 'LTK', unitPrice: 9.3, total: 9.3 },
      { name: 'Ramlösa Kvarn Tipo 00 2kg Wheatflour', quantity: 1, unit: 'PAK', unitPrice: 17.61, total: 17.61 },
      { name: 'Urbani Tartufi Salsa tartufata tryffeli paste 500g', quantity: 3, unit: 'PRK', unitPrice: 17.85, total: 53.55 },
      { name: 'Fredman piping bag blue 270x530mm 72pcs', quantity: 2, unit: 'LTK', unitPrice: 24.43, total: 48.85 },
      { name: 'SBS Levain leipä viipaloitu 1250g frozen', quantity: 2, unit: 'LTK', unitPrice: 38.78, total: 77.56 },
      { name: 'Santa Maria poppy seed blue 550g', quantity: 1, unit: 'TLK', unitPrice: 7.83, total: 7.83 },
    ],
  },
  {
    file: 'teste 2.pdf',
    orderNumber: '23510274',
    orderDate: '2026-06-23',
    deliveryDate: '2026-06-24',
    total: 321.74,
    text: kesproFixture({
      orderNumber: '23510274',
      orderDate: 'Tuesday 23.06.2026',
      deliveryDate: 'Wednesday 24.06.2026',
      productCount: 8,
      withoutTax: '283,47',
      vat: '38,27',
      total: '321,74',
      rows: [
        'Dairy products & eggs',
        'Munax Proedd barn liquid egg yolk 1000g 53,91 € / LTK 1 Confirmed quantity / ME 53,91 €',
        '1 LTK (6 TLK)',
        'Munax Proegg barn liquid egg white 1000g 26,51 € / LTK 1 Confirmed quantity / ME 26,51 €',
        '1 LTK (6 TLK)',
        'Munax Proegg Barn liquid whole egg 1000g 28,79 € / LTK 1 Confirmed quantity / ME 28,79 €',
        '1 LTK (6 TLK)',
        '74,89 € / LTK 1   Confirmed quantity / ME      74,89 €',
        'Arla butter 500g lactosefree less salt',
        'VAT 0 %           units                        VAT 0 %',
        '1 LTK (20 PKT)',
        'Frozen food',
        'Menu finnish strawberry 2,5kg frozen 59,82 € / LTK 1 Confirmed quantity / ME 59,82 €',
        '1 LTK (2 PSS)',
        'Fruits & vegetables',
        'Menu strawberry 400g ES/NL/BE/MA 5,67 € / RS 2 Confirmed quantity / ME 11,35 €',
        '2 RS',
        'Drinks',
        'Juhla Mocca coffee 500g filter ground 8,81 € / PKT 2 Confirmed quantity / ME 17,61 €',
        '2 PKT',
        'Meat, fresh, frozen and plant-based proteins',
        'Karelia overripe fat-free ham slice 1kg 10,59 € / RS 1 Confirmed quantity / ME 10,59 €',
        '1 RS',
      ],
    }),
    items: [
      { name: 'Munax Proedd barn liquid egg yolk 1000g', quantity: 1, unit: 'LTK', unitPrice: 53.91, total: 53.91 },
      { name: 'Munax Proegg barn liquid egg white 1000g', quantity: 1, unit: 'LTK', unitPrice: 26.51, total: 26.51 },
      { name: 'Munax Proegg Barn liquid whole egg 1000g', quantity: 1, unit: 'LTK', unitPrice: 28.79, total: 28.79 },
      { name: 'Arla butter 500g lactosefree less salt', quantity: 1, unit: 'LTK', unitPrice: 74.89, total: 74.89 },
      { name: 'Menu finnish strawberry 2,5kg frozen', quantity: 1, unit: 'LTK', unitPrice: 59.82, total: 59.82 },
      { name: 'Menu strawberry 400g ES/NL/BE/MA', quantity: 2, unit: 'RS', unitPrice: 5.67, total: 11.35 },
      { name: 'Juhla Mocca coffee 500g filter ground', quantity: 2, unit: 'PKT', unitPrice: 8.81, total: 17.61 },
      { name: 'Karelia overripe fat-free ham slice 1kg', quantity: 1, unit: 'RS', unitPrice: 10.59, total: 10.59 },
    ],
  },
  {
    file: 'teste 3.pdf',
    orderNumber: '23503044',
    orderDate: '2026-06-22',
    deliveryDate: '2026-06-24',
    total: 675.76,
    text: kesproFixture({
      orderNumber: '23503044',
      orderDate: 'Monday 22.06.2026',
      deliveryDate: 'Wednesday 24.06.2026',
      productCount: 21,
      withoutTax: '587,78',
      vat: '87,98',
      total: '675,76',
      rows: [
        'Seasoning & baking',
        'Sosa liquid glucose 7kg 44,82 € / KPL 1 Confirmed quantity / ME 44,82 €',
        'Sosa vegan gelatin mousse 500g 34,32 € / PRK 1 Confirmed quantity / ME 34,32 €',
        'Maille Dijon wholegrain mustard 1kg 6,45 € / KPL 1 Confirmed quantity / ME 6,45 €',
        'Dairy products & eggs',
        'Pirkka lactose-free milkdrink 1l 3% 22,84 € / LTK 3 Confirmed quantity / ME 68,52 €',
        'Cessibon blend of cream 250g natural 14,19 € / LTK 1 Confirmed quantity / ME 14,19 €',
        'Menu lactose free whipping cream 38 % 1l UHT 46,11 € / LTK 2 Confirmed quantity / ME 92,22 €',
        'Castelli mascarpone 250g lactose free 18,61 € / PAK 1 Confirmed quantity / ME 18,61 €',
        'Fazer Aito Plant-based Whipping gluten-free 21,54 € / LTK 1 Confirmed quantity / ME 21,54 €',
        'whippable vegetable fat product 1l VAT 0 % units VAT 0 %',
        'Philadelphia Original cream cheese 1,5kg 48,28 € / LTK 1 Confirmed quantity / ME 48,28 €',
        'Lactose Free         VAT 0 %           units                        VAT 0 %',
        'Bread & pastry',
        'SBS Levain leipä viipaloitu 1250g frozen 38,78 € / LTK 2 Confirmed quantity / ME 77,56 €',
        'Tuotenimeä ei saatavilla 20,96 € / LTK 1 Confirmed quantity / ME 20,96 €',
        'Fruits & vegetables',
        'Mimis Geranium flower 15kpl Suomi 3,63 € / RS 1 Confirmed quantity / ME 3,63 €',
        'Mimis marigold 7 pcs 3,63 € / RS 1   Confirmed quantity / ME      3,63 €',
        'Menu raspberry 225g NL/BE/PT/ES 6,14 € / RS 2 Confirmed quantity / ME 12,28 €',
        'Menu basil 100g Finland 1cl 3,17 € / PSS 2 Confirmed quantity / ME 6,34 €',
        'Moroccan Mint 100g ES/DE/FR/KE 1cl 2,23 € / PSS 2 Confirmed quantity / ME 4,45 €',
        'Lime 1kg 48-54mm BR/MX 1lk 2,95 € / PSS 2 Confirmed quantity / ME 5,89 €',
        'Mimis Special mix 70g Finland 2,81 € / RS 2 Confirmed quantity / ME 5,61 €',
        'Cleaning & tissue paper',
        'Menu nitrile glove black M 100pcs 4,94 € / PKT 2 Confirmed quantity / ME 9,88 €',
        'Frozen food',
        'Findus raspberry purée 2kg frozen 26,59 € / LTK 1 Confirmed quantity / ME 26,59 €',
        'Kertakäyttöastiat & kattaus',
        'Ecotime pulp plate 40pc/23cm 62,01 € / LTK 1 Confirmed quantity / ME 62,01 €',
      ],
    }),
    items: [
      { name: 'Sosa liquid glucose 7kg', quantity: 1, unit: 'KPL', unitPrice: 44.82, total: 44.82 },
      { name: 'Sosa vegan gelatin mousse 500g', quantity: 1, unit: 'PRK', unitPrice: 34.32, total: 34.32 },
      { name: 'Maille Dijon wholegrain mustard 1kg', quantity: 1, unit: 'KPL', unitPrice: 6.45, total: 6.45 },
      { name: 'Pirkka lactose-free milkdrink 1l 3%', quantity: 3, unit: 'LTK', unitPrice: 22.84, total: 68.52 },
      { name: 'Cessibon blend of cream 250g natural', quantity: 1, unit: 'LTK', unitPrice: 14.19, total: 14.19 },
      { name: 'Menu lactose free whipping cream 38 % 1l UHT', quantity: 2, unit: 'LTK', unitPrice: 46.11, total: 92.22 },
      { name: 'Castelli mascarpone 250g lactose free', quantity: 1, unit: 'PAK', unitPrice: 18.61, total: 18.61 },
      { name: 'Fazer Aito Plant-based Whipping gluten-free whippable vegetable fat product 1l', quantity: 1, unit: 'LTK', unitPrice: 21.54, total: 21.54 },
      { name: 'Philadelphia Original cream cheese 1,5kg Lactose Free', quantity: 1, unit: 'LTK', unitPrice: 48.28, total: 48.28 },
      { name: 'SBS Levain leipä viipaloitu 1250g frozen', quantity: 2, unit: 'LTK', unitPrice: 38.78, total: 77.56 },
      { name: 'Tuotenimeä ei saatavilla', quantity: 1, unit: 'LTK', unitPrice: 20.96, total: 20.96 },
      { name: 'Mimis Geranium flower 15kpl Suomi', quantity: 1, unit: 'RS', unitPrice: 3.63, total: 3.63 },
      { name: 'Mimis marigold 7 pcs', quantity: 1, unit: 'RS', unitPrice: 3.63, total: 3.63 },
      { name: 'Menu raspberry 225g NL/BE/PT/ES', quantity: 2, unit: 'RS', unitPrice: 6.14, total: 12.28 },
      { name: 'Menu basil 100g Finland 1cl', quantity: 2, unit: 'PSS', unitPrice: 3.17, total: 6.34 },
      { name: 'Moroccan Mint 100g ES/DE/FR/KE 1cl', quantity: 2, unit: 'PSS', unitPrice: 2.23, total: 4.45 },
      { name: 'Lime 1kg 48-54mm BR/MX 1lk', quantity: 2, unit: 'PSS', unitPrice: 2.95, total: 5.89 },
      { name: 'Mimis Special mix 70g Finland', quantity: 2, unit: 'RS', unitPrice: 2.81, total: 5.61 },
      { name: 'Menu nitrile glove black M 100pcs', quantity: 2, unit: 'PKT', unitPrice: 4.94, total: 9.88 },
      { name: 'Findus raspberry purée 2kg frozen', quantity: 1, unit: 'LTK', unitPrice: 26.59, total: 26.59 },
      { name: 'Ecotime pulp plate 40pc/23cm', quantity: 1, unit: 'LTK', unitPrice: 62.01, total: 62.01 },
    ],
  },
  {
    file: 'teste 4.pdf',
    orderNumber: '23477094',
    orderDate: '2026-06-15',
    deliveryDate: '2026-06-17',
    total: 762.24,
    text: kesproFixture({
      orderNumber: '23477094',
      orderDate: 'Monday 15.06.2026',
      deliveryDate: 'Wednesday 17.06.2026',
      productCount: 20,
      withoutTax: '659,76',
      vat: '102,48',
      total: '762,24',
      rows: [
        'Dairy products & eggs',
        'Oddlygood Barista oat drink 1l gluten-free UHT 17,18 € / LTK 1 Confirmed quantity / ME 17,18 €',
        'Menu lactose free butter 500g less salt 61,67 € / LTK 1 Confirmed quantity / ME 61,67 €',
        'Menu lactose free whipping cream 38 % 1l UHT 46,11 € / LTK 1 Confirmed quantity / ME 46,11 €',
        'Cessibon blend of cream 250g natural 14,18 € / LTK 2 Confirmed quantity / ME 28,36 €',
        'Menu lactosefree milkdrink 3% 1l ESL 8,14 € / LTK 8 Confirmed quantity / ME 65,13 €',
        'President Brie cheese 1kg 20,62 € / LTK 1 Confirmed quantity / ME 20,62 €',
        'Cleaning & tissue paper',
        'Menu nitrile glove black XL 100pcs 4,94 € / PKT 1 Confirmed quantity / ME 4,94 €',
        'Lambi Toilet paper 32rl white 13,63 € / PAK 1 Confirmed quantity / ME 13,63 €',
        'Menu nitrile glove black M 100pcs 4,94 € / PKT 2 Confirmed quantity / ME 9,88 €',
        'Kertakäyttöastiat & kattaus',
        'Menu wood fibre spoon reusable 168mm 70pcs 5,83 € / PKT 2 Confirmed quantity / ME 11,67 €',
        'Menu wood fibre knive reusable 167mm 80pcs 5,26 € / PKT 2 Confirmed quantity / ME 10,52 €',
        'Pirkka napkin 24cm 50pcs black 16,66 € / LTK 3 Confirmed quantity / ME 49,99 €',
        'Menu wood fibre fork reusable 167mm 80pcs 5,59 € / PKT 2 Confirmed quantity / ME 11,19 €',
        'Drinks',
        'Van Houten cocoa powder 250g 71,49 € / LTK 1 Confirmed quantity / ME 71,49 €',
        'Juhla Mocca coffee 500g filter ground 8,81 € / PKT 2 Confirmed quantity / ME 17,61 €',
        'Menu apple juice 1l 21,99 € / LTK 1  Confirmed quantity / ME      21,99 €',
        'Fruits & vegetables',
        'Menu blueberry 300g ES/NL/ZW/MA 6,14 € / RS 1 Confirmed quantity / ME 6,14 €',
        'Sweets & snacks',
        'Brunberg Dark chocolate lactose free 150g 85,23 € / LTK 1 Confirmed quantity / ME 85,23 €',
        'Brunberg 150g Lactose free milk chocolate 85,23 € / LTK 1 Confirmed quantity / ME 85,23 €',
        'Meat, fresh, frozen and plant-based proteins',
        'Karelia overripe fat-free ham slice 1kg 10,59 € / RS 2 Confirmed quantity / ME 21,18 €',
      ],
    }),
    items: [
      { name: 'Oddlygood Barista oat drink 1l gluten-free UHT', quantity: 1, unit: 'LTK', unitPrice: 17.18, total: 17.18 },
      { name: 'Menu lactose free butter 500g less salt', quantity: 1, unit: 'LTK', unitPrice: 61.67, total: 61.67 },
      { name: 'Menu lactose free whipping cream 38 % 1l UHT', quantity: 1, unit: 'LTK', unitPrice: 46.11, total: 46.11 },
      { name: 'Cessibon blend of cream 250g natural', quantity: 2, unit: 'LTK', unitPrice: 14.18, total: 28.36 },
      { name: 'Menu lactosefree milkdrink 3% 1l ESL', quantity: 8, unit: 'LTK', unitPrice: 8.14, total: 65.13 },
      { name: 'President Brie cheese 1kg', quantity: 1, unit: 'LTK', unitPrice: 20.62, total: 20.62 },
      { name: 'Menu nitrile glove black XL 100pcs', quantity: 1, unit: 'PKT', unitPrice: 4.94, total: 4.94 },
      { name: 'Lambi Toilet paper 32rl white', quantity: 1, unit: 'PAK', unitPrice: 13.63, total: 13.63 },
      { name: 'Menu nitrile glove black M 100pcs', quantity: 2, unit: 'PKT', unitPrice: 4.94, total: 9.88 },
      { name: 'Menu wood fibre spoon reusable 168mm 70pcs', quantity: 2, unit: 'PKT', unitPrice: 5.83, total: 11.67 },
      { name: 'Menu wood fibre knive reusable 167mm 80pcs', quantity: 2, unit: 'PKT', unitPrice: 5.26, total: 10.52 },
      { name: 'Pirkka napkin 24cm 50pcs black', quantity: 3, unit: 'LTK', unitPrice: 16.66, total: 49.99 },
      { name: 'Menu wood fibre fork reusable 167mm 80pcs', quantity: 2, unit: 'PKT', unitPrice: 5.59, total: 11.19 },
      { name: 'Van Houten cocoa powder 250g', quantity: 1, unit: 'LTK', unitPrice: 71.49, total: 71.49 },
      { name: 'Juhla Mocca coffee 500g filter ground', quantity: 2, unit: 'PKT', unitPrice: 8.81, total: 17.61 },
      { name: 'Menu apple juice 1l', quantity: 1, unit: 'LTK', unitPrice: 21.99, total: 21.99 },
      { name: 'Menu blueberry 300g ES/NL/ZW/MA', quantity: 1, unit: 'RS', unitPrice: 6.14, total: 6.14 },
      { name: 'Brunberg Dark chocolate lactose free 150g', quantity: 1, unit: 'LTK', unitPrice: 85.23, total: 85.23 },
      { name: 'Brunberg 150g Lactose free milk chocolate', quantity: 1, unit: 'LTK', unitPrice: 85.23, total: 85.23 },
      { name: 'Karelia overripe fat-free ham slice 1kg', quantity: 2, unit: 'RS', unitPrice: 10.59, total: 21.18 },
    ],
  },
  {
    file: 'teste 5.pdf',
    orderNumber: '23371013',
    orderDate: '2026-05-28',
    deliveryDate: '2026-06-03',
    total: 397.94,
    text: kesproFixture({
      orderNumber: '23371013',
      orderDate: 'Thursday 28.05.2026',
      deliveryDate: 'Wednesday 03.06.2026',
      productCount: 12,
      withoutTax: '347,26',
      vat: '50,68',
      total: '397,94',
      rows: [
        'Bread & pastry',
        'MF La Rose Noire large paper thin flower tart 59,50 € / RS 1 Confirmed quantity / ME 59,50 €',
        'shell vegan 36x11g frozen VAT 0 % units VAT 0 %',
        'Seasoning & baking',
        'Vertmont Organic Maple Syrup 187ml / 250g 18,04 € / LTK 1 Confirmed quantity / ME 18,04 €',
        'Pirkka rapeseed oil 900ml 25,79 € / LTK 1 Confirmed quantity / ME 25,79 €',
        'Pirkka liquid honey 350g 22,25 € / LTK 1 Confirmed quantity / ME  22,25 €',
        'Pirkka olive oil 1l 65,68 € / LTK 1  Confirmed quantity / ME      65,68 €',
        'Dairy products & eggs',
        'Pirkka lactose-free milkdrink 1l 3% 22,84 € / LTK 2 Confirmed quantity / ME 45,68 €',
        'Menu lactose free whipping cream 38 % 1l UHT 46,11 € / LTK 1 Confirmed quantity / ME 46,11 €',
        'Filos 150g feta lactose free 18,01 € / LTK 1 Confirmed quantity / ME 18,01 €',
        'Fruits & vegetables',
        'Valmix Zucchini bits 1kg 7,25 € / PSS 1 Confirmed quantity / ME    7,25 €',
        'Mimis marigold 7 pcs 3,63 € / RS 1   Confirmed quantity / ME      3,63 €',
        'Mimis Geranium flower 15kpl Suomi 3,63 € / RS 1 Confirmed quantity / ME 3,63 €',
        'Cleaning & tissue paper',
        'Pirkka trash bag black 150l 10pcs 31,69 € / LTK 1 Confirmed quantity / ME 31,69 €',
      ],
    }),
    items: [
      { name: 'MF La Rose Noire large paper thin flower tart shell vegan 36x11g frozen', quantity: 1, unit: 'RS', unitPrice: 59.5, total: 59.5 },
      { name: 'Vertmont Organic Maple Syrup 187ml / 250g', quantity: 1, unit: 'LTK', unitPrice: 18.04, total: 18.04 },
      { name: 'Pirkka rapeseed oil 900ml', quantity: 1, unit: 'LTK', unitPrice: 25.79, total: 25.79 },
      { name: 'Pirkka liquid honey 350g', quantity: 1, unit: 'LTK', unitPrice: 22.25, total: 22.25 },
      { name: 'Pirkka olive oil 1l', quantity: 1, unit: 'LTK', unitPrice: 65.68, total: 65.68 },
      { name: 'Pirkka lactose-free milkdrink 1l 3%', quantity: 2, unit: 'LTK', unitPrice: 22.84, total: 45.68 },
      { name: 'Menu lactose free whipping cream 38 % 1l UHT', quantity: 1, unit: 'LTK', unitPrice: 46.11, total: 46.11 },
      { name: 'Filos 150g feta lactose free', quantity: 1, unit: 'LTK', unitPrice: 18.01, total: 18.01 },
      { name: 'Valmix Zucchini bits 1kg', quantity: 1, unit: 'PSS', unitPrice: 7.25, total: 7.25 },
      { name: 'Mimis marigold 7 pcs', quantity: 1, unit: 'RS', unitPrice: 3.63, total: 3.63 },
      { name: 'Mimis Geranium flower 15kpl Suomi', quantity: 1, unit: 'RS', unitPrice: 3.63, total: 3.63 },
      { name: 'Pirkka trash bag black 150l 10pcs', quantity: 1, unit: 'LTK', unitPrice: 31.69, total: 31.69 },
    ],
  },
];

function expectItems(actualLines: any[], expectedItems: ExpectedItem[]) {
  expect(actualLines).toHaveLength(expectedItems.length);
  expectedItems.forEach((expected, index) => {
    const actual = actualLines[index];
    expect(actual.label).toBe(expected.name);
    expect(actual.quantity).toBeCloseTo(expected.quantity, 3);
    expect(actual.unit).toBe(expected.unit);
    expect(actual.unitPrice).toBeCloseTo(expected.unitPrice, 3);
    expect(actual.total).toBeCloseTo(expected.total, 3);
    if (expected.code) expect(actual.reference).toBe(expected.code);
    if (expected.freight) {
      expect(actual.isFreight).toBe(true);
      expect(actual.isStockItem).toBe(false);
      expect(actual.ignored).toBe(true);
      expect(actual.lineStatus).toBe('non_product_line');
    }
  });
}

describe('StocksOcrService Finnish supplier extraction', () => {
  it.each(tingstadCases)('extracts Tingstad invoice %s without losing product lines', async (testCase) => {
    const extraction = await extract(testCase.text);

    expect(extraction.documentType).toBe('invoice');
    expect(extraction.supplier.name).toBe('AB Tingstad papper');
    expect(extraction.supplierName).toBe('AB Tingstad papper');
    expect(extraction.document.invoiceNumber).toBe(testCase.invoiceNumber);
    expect(extraction.document.documentDate).toBe(testCase.invoiceDate);
    expect(extraction.invoice.dueDate).toBe(testCase.dueDate);
    expect(extraction.document.purchaseOrderNumber).toBe(testCase.orderNumber);
    expect(extraction.customer.customerNumber).toBe('318379');
    expect(extraction.customer.deliveryAddress).toContain('KITKANTIE 2');
    expect(extraction.totals.totalIncludingTax).toBeCloseTo(testCase.grandTotal, 2);
    expectItems(extraction.lines, testCase.items);
  });

  it.each(kesproCases)('classifies Kespro order history %s as non-invoice and extracts confirmed quantities', async (testCase) => {
    const extraction = await extract(testCase.text);

    expect(extraction.documentType).toBe('order_confirmation');
    expect(extraction.documentType).not.toBe('invoice');
    expect(extraction.supplier.name).toBe('Kespro');
    expect(extraction.document.purchaseOrderNumber).toBe(testCase.orderNumber);
    expect(extraction.order.orderDate).toBe(testCase.orderDate);
    expect(extraction.order.selectedDeliveryDate).toBe(testCase.deliveryDate);
    expect(extraction.totals.totalIncludingTax).toBeCloseTo(testCase.total, 2);
    expectItems(extraction.lines, testCase.items);
  });

  it('handles Kespro exported PDF glyphs without losing categories or product names', async () => {
    const extraction = await extract(kesproFixture({
      orderNumber: '23529809',
      orderDate: 'Friday 26.06.2026',
      deliveryDate: 'Wednesday 01.07.2026',
      productCount: 1,
      withoutTax: '8,33',
      vat: '0,00',
      total: '8,33',
      rows: [
        ' Fruits & vegetables',
        'Tomaatti NL/BE 1lk  8,33 € / LTK 1 Confirmed quantity / ME 8,33 €',
        'VAT 0 % units VAT 0 %',
        '1 LTK (6 KG)',
      ],
    }));

    expect(extraction.lines).toHaveLength(1);
    expect(extraction.lines[0].label).toBe('Tomaatti NL/BE 1lk');
    expect(extraction.lines[0].categoryName).toBe('Fruits & vegetables');
    expect(extraction.lines[0].unit).toBe('LTK');
    expect(extraction.lines[0].total).toBeCloseTo(8.33, 2);
  });

  it('recognizes Kespro and product packaging even when the URL/header is missing', async () => {
    const extraction = await extract(`
Order information
Order date: Tuesday 23.06.2026
Selected delivery date Wednesday 24.06.2026
Delivery information
Order number 23510274 Delivery address Kitkantie 2 , 93600 Kuusamo
Company The French Café, The French Café Oy Order type / delivery Standard order
Customer number 1853681 Email
Orderer kahvila@the-french-cafe.com Your reference

Quantity / ME
Product Unit price / ME Total price
units
Dairy products & eggs
Arla butter 500g lactosefree less salt 74,89 € / LTK 1 Confirmed quantity / ME 74,89 €
VAT 0 % units VAT 0 %
1 LTK (20 PKT)
Cessibon blend of cream 250g natural 14,18 € / LTK 2 Confirmed quantity / ME 28,36 €
VAT 0 % units VAT 0 %
2 LTK (24 TLK)
Without tax 103,25 €
Total VAT 0,00 €
Total 103,25 €
`);

    expect(extraction.documentType).toBe('order_confirmation');
    expect(extraction.supplier.name).toBe('Kespro');
    expect(extraction.supplierName).toBe('Kespro');
    expect(extraction.lines).toHaveLength(2);
    expect(extraction.lines[0].packageDescription).toContain('500 g par unité');
    expect(extraction.lines[0].packageDescription).toContain('1 LTK (20 PKT)');
    expect(extraction.lines[1].packageDescription).toContain('250 g par unité');
    expect(extraction.lines[1].packageDescription).toContain('2 LTK (24 TLK)');
  });

  it('extracts the Kespro order number from the English order header', () => {
    const service = new StocksOcrService(mockPrisma(), mockMarginsService());
    expect((service as any).extractPurchaseOrderNumber('Order number 23371013 Delivery address Kitkantie 2')).toBe('23371013');
    expect((service as any).extractPurchaseOrderNumber('23371013 - Tilauksen tiedot - Tilaushistoria')).toBe('23371013');
  });

  it('uses Mistral OCR document annotation before the chat fallback', async () => {
    const service = new StocksOcrService(mockPrisma(), mockMarginsService());
    const chatFallback = jest.spyOn(service as any, 'analyzeOcrWithMistralAi').mockRejectedValue(new Error('chat fallback should not run'));
    const extraction = await (service as any).extractBusinessData('org-1', 'Facture fournisseur\nTotal TTC: 12,00', {
      document_annotation: JSON.stringify({
        documentType: 'invoice',
        documentConfidence: 0.91,
        warnings: [],
        suggestedActions: ['Vérifier les produits avant réception.'],
        supplier: { name: 'Fournisseur Test', supplierId: null, confidence: 0.88 },
        document: {
          invoiceNumber: 'FAC-123',
          deliveryNoteNumber: null,
          purchaseOrderNumber: null,
          documentDate: '2026-06-30',
          deliveryDate: null,
        },
        totals: { totalExcludingTax: 10, totalTax: 2, totalIncludingTax: 12 },
        totalsCheck: { computedTotal: 10, documentTotal: 12, delta: 0, status: 'ok' },
        lines: [
          {
            label: 'Farine T45',
            reference: 'FAR45',
            supplierProductCode: 'FAR45',
            nameOriginal: 'Farine T45',
            descriptionOriginal: null,
            quantity: 2,
            unit: 'kg',
            unitPrice: 5,
            total: 10,
            vatRate: 20,
            lotNumber: null,
            bestBeforeDate: null,
            originCountry: null,
            statisticalCode: null,
            netWeight: null,
            isFreight: false,
            isStockItem: true,
            packageDescription: null,
            ignored: false,
            productId: null,
            unitId: null,
            categoryId: null,
            categoryName: 'Épicerie',
            lineStatus: 'missing_product',
            confidence: 0.91,
            warnings: [],
            sourceText: 'Farine T45 2 kg 5,00 10,00',
          },
        ],
      }),
    });

    expect(chatFallback).not.toHaveBeenCalled();
    expect(extraction.supplierName).toBe('Fournisseur Test');
    expect(extraction.document.invoiceNumber).toBe('FAC-123');
    expect(extraction.aiAnalysis.provider).toBe('mistral-ocr');
    expect(extraction.aiAnalysis.model).toBe('mistral-ocr-latest');
    expect(extraction.lines).toHaveLength(1);
    expect(extraction.lines[0].label).toBe('Farine T45');
  });

  it('keeps the existing French invoice extraction path available', async () => {
    const extraction = await extract(`
Facture numéro FAC-2026-001
Date facture: 01/06/2026
Fournisseur: PassionFroid
Produit Quantité Prix Total
Crème fraîche 2 kg 4,50 9,00
Total HT: 9,00
TVA: 0,90
Total TTC: 9,90
`);

    expect(extraction.documentType).toBe('invoice');
    expect(extraction.supplierName).toBe('PassionFroid');
    expect(extraction.document.invoiceNumber).toBe('FAC-2026-001');
    expect(extraction.totals.totalIncludingTax).toBeCloseTo(9.9, 2);
    expect(extraction.lines.length).toBeGreaterThanOrEqual(1);
  });
});
