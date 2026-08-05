import {
  normalizeInventoryFamilyName,
  normalizeInventoryName,
  parseInventoryWorkbook,
} from './stocks-inventory-spreadsheet';

const workbook = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="SUMMARY"><Table>
    <Row><Cell><Data ss:Type="String">YHTEENSÄ</Data></Cell><Cell><Data ss:Type="Number">40</Data></Cell></Row>
  </Table></Worksheet>
  <Worksheet ss:Name="FOOD"><Table>
    <Row><Cell><Data ss:Type="String">INVENTAARIO</Data></Cell></Row>
    <Row>
      <Cell><Data ss:Type="String">TUOTE</Data></Cell>
      <Cell><Data ss:Type="String">MÄÄRÄ</Data></Cell>
      <Cell><Data ss:Type="String">KOKO</Data></Cell>
      <Cell><Data ss:Type="String">YKS.HINTA(ALV 0%)</Data></Cell>
      <Cell><Data ss:Type="String">HINTA(ALV 0%)YHT.</Data></Cell>
      <Cell><Data ss:Type="String">TOIMITTAJA</Data></Cell>
    </Row>
    <Row><Cell><Data ss:Type="String">Kahvi</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">Café test</Data></Cell><Cell><Data ss:Type="Number">1.5</Data></Cell><Cell><Data ss:Type="String">kg</Data></Cell><Cell><Data ss:Type="Number">10</Data></Cell><Cell><Data ss:Type="Number">15</Data></Cell><Cell><Data ss:Type="String">Supplier Oy</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">Sucre</Data></Cell><Cell><Data ss:Type="Number">0</Data></Cell><Cell><Data ss:Type="String">kg</Data></Cell><Cell><Data ss:Type="Number">3</Data></Cell><Cell><Data ss:Type="Number">0</Data></Cell></Row>
    <Row><Cell ss:Index="3"><Data ss:Type="String">kpl</Data></Cell><Cell><Data ss:Type="Number">4</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">Erreur total</Data></Cell><Cell><Data ss:Type="Number">2</Data></Cell><Cell><Data ss:Type="String">kpl</Data></Cell><Cell><Data ss:Type="Number">5</Data></Cell><Cell><Data ss:Type="Number">2</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">YHTEENSÄ</Data></Cell><Cell><Data ss:Type="Number">3.5</Data></Cell></Row>
  </Table></Worksheet>
</Workbook>`;

describe('parseInventoryWorkbook', () => {
  it('lit les feuilles SpreadsheetML, les quantités nulles/décimales et ignore les sous-totaux', async () => {
    const result = await parseInventoryWorkbook('inventaire.xml', Buffer.from(workbook));

    expect(result.sourceKind).toBe('spreadsheetml');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      sourceName: 'Café test',
      countedQuantity: 1.5,
      unitLabel: 'kg',
      categoryName: 'Kahvi',
      supplierName: 'Supplier Oy',
    });
    expect(result.rows[1]).toMatchObject({ sourceName: 'Sucre', countedQuantity: 0 });
    expect(result.summary).toMatchObject({
      productRows: 3,
      zeroQuantityRows: 1,
      fractionalQuantityRows: 1,
      workbookSummaryValueExVat: 40,
    });
  });

  it('signale les lignes sans nom, les incohérences de calcul et le total général', async () => {
    const result = await parseInventoryWorkbook('inventaire.xml', Buffer.from(workbook));

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['MISSING_NAME', 'TOTAL_MISMATCH', 'SUMMARY_MISMATCH']),
    );
  });

  it('conserve le conditionnement pour une correspondance exacte sans perdre la famille produit', () => {
    expect(normalizeInventoryName('Café maison 1 kg')).not.toBe(
      normalizeInventoryName('Café maison 200 g'),
    );
    expect(normalizeInventoryFamilyName('Café maison 1 kg')).toBe(
      normalizeInventoryFamilyName('Café maison 200 g'),
    );
  });
});
