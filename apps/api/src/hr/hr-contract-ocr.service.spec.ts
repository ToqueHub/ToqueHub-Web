import { BadRequestException } from '@nestjs/common';
import { HrContractOcrService } from './hr-contract-ocr.service';

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    documentType: 'CONTRACT',
    firstName: 'Aino',
    lastName: 'Korhonen',
    email: null,
    phone: '+358 40 123 4567',
    address: 'Katu 1',
    postalCode: '00100',
    city: 'Helsinki',
    country: 'Finlande',
    birthDate: null,
    personalIdentityNumber: '080800A592P',
    primaryLanguage: null,
    secondaryLanguage: null,
    hireDate: '2026-04-04',
    employeeNumber: null,
    contractType: 'CDD',
    contractEndDate: '2026-08-31',
    trialEndDate: '2026-05-04',
    weeklyHours: 37.5,
    hourlyRate: 12.51,
    currency: 'EUR',
    rateEffectiveDate: null,
    departmentName: 'Salle',
    positionName: 'Employé de café',
    siteName: 'Kuusamo',
    additionalTerms: 'Motif du CDD : travail saisonnier.',
    professionalSummary: null,
    trainingNames: [],
    confidence: 0.87,
    uncertainFields: ['email'],
    warnings: [],
    ...overrides,
  };
}

function service(overrides: { markdown?: string; extracted?: Record<string, unknown> } = {}) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ regulatoryCountryCode: 'FI', hrCountryCode: 'FI' }) },
    hrDepartment: { findMany: jest.fn().mockResolvedValue([{ id: 'dept-1', name: 'Salle' }]) },
    hrPosition: { findMany: jest.fn().mockResolvedValue([{ id: 'position-1', name: 'Employé de café', departmentId: 'dept-1' }]) },
    site: { findMany: jest.fn().mockResolvedValue([{ id: 'site-1', name: 'Kuusamo' }]) },
  };
  const mistral = {
    ocrMarkdown: jest.fn().mockResolvedValue({ markdown: overrides.markdown ?? '# TYÖSOPIMUS', pageCount: 1, durationMs: 125 }),
    chatJson: jest.fn().mockResolvedValue(overrides.extracted ?? extraction()),
  };
  return { instance: new HrContractOcrService(prisma as any, mistral as any), prisma, mistral };
}

const jpeg = {
  originalname: 'työsopimus.jpeg',
  mimetype: 'image/jpeg',
  size: 5,
  buffer: Buffer.from('image'),
};

describe('HrContractOcrService', () => {
  it('prefills only supported HR fields and matches existing references', async () => {
    const { instance, mistral } = service();

    const result = await instance.analyze('org-1', jpeg);

    expect(mistral.ocrMarkdown).toHaveBeenCalledWith('org-1', expect.objectContaining({ mimeType: 'image/jpeg', withAnnotation: true }));
    expect(result.draft).toMatchObject({
      firstName: 'Aino',
      lastName: 'Korhonen',
      personalIdentityNumber: '080800A592P',
      hireDate: '2026-04-04',
      departmentId: 'dept-1',
      positionId: 'position-1',
      siteId: 'site-1',
      contractType: 'CDD',
      contractWeeklyMinutes: 2250,
      hourlyRate: 12.51,
      rateEffectiveDate: '2026-04-04',
    });
    expect(result.uncertainFields).toEqual(['email']);
    expect(result.source.pageCount).toBe(1);
  });

  it('leaves unknown references unmapped and warns the reviewer', async () => {
    const { instance } = service({ extracted: extraction({ departmentName: 'Inconnu', positionName: 'Mystère', siteName: 'Ailleurs' }) });

    const result = await instance.analyze('org-1', jpeg);

    expect(result.draft.departmentId).toBeUndefined();
    expect(result.draft.positionId).toBeUndefined();
    expect(result.draft.siteId).toBeUndefined();
    expect(result.warnings).toHaveLength(3);
  });

  it('rejects unsupported files before calling OCR', async () => {
    const { instance, mistral } = service();

    await expect(instance.analyze('org-1', { ...jpeg, originalname: 'contrat.txt', mimetype: 'text/plain' })).rejects.toThrow(BadRequestException);
    expect(mistral.ocrMarkdown).not.toHaveBeenCalled();
  });

  it('refuses an OCR result without exploitable text', async () => {
    const { instance, mistral } = service({ markdown: '   ' });

    await expect(instance.analyze('org-1', jpeg)).rejects.toThrow('texte exploitable');
    expect(mistral.chatJson).not.toHaveBeenCalled();
  });

  it('removes every contractual field returned from a CV', async () => {
    const { instance } = service({
      markdown: '# CV\nTYÖKOKEMUS 04/2025 -',
      extracted: extraction({
        documentType: 'CONTRACT',
        firstName: 'Minttu',
        lastName: 'Salonen',
        email: 'minttu@example.test',
        hireDate: '2025-04-01',
        personalIdentityNumber: '010101-123A',
        contractType: 'CDI',
        weeklyHours: 37.5,
        hourlyRate: 20,
        departmentName: 'Salle',
        positionName: 'Employé de café',
        siteName: 'Kuusamo',
        professionalSummary: 'Expérience en restauration et management.',
        trainingNames: ['Hygieniapassi'],
      }),
    });

    const result = await instance.analyze('org-1', { ...jpeg, originalname: 'CV_Minttu_Salonen2026.pdf', mimetype: 'application/pdf' });

    expect(result.hasContractSource).toBe(false);
    expect(result.draft).toMatchObject({
      firstName: 'Minttu',
      lastName: 'Salonen',
      email: 'minttu@example.test',
      trainingNames: ['Hygieniapassi'],
    });
    expect(result.draft).not.toHaveProperty('hireDate');
    expect(result.draft).not.toHaveProperty('personalIdentityNumber');
    expect(result.draft).not.toHaveProperty('contractType');
    expect(result.draft).not.toHaveProperty('contractWeeklyMinutes');
    expect(result.draft).not.toHaveProperty('hourlyRate');
    expect(result.draft).not.toHaveProperty('departmentId');
    expect(result.documents[0]).toMatchObject({ documentType: 'CV', category: 'ADMINISTRATIVE' });
  });

  it('combines a CV with a contract while reserving contract data to the contract', async () => {
    const { instance, mistral } = service();
    mistral.ocrMarkdown
      .mockResolvedValueOnce({ markdown: '# CV\nWORK EXPERIENCE', pageCount: 2, durationMs: 80 })
      .mockResolvedValueOnce({ markdown: '# TYÖSOPIMUS', pageCount: 1, durationMs: 90 });
    mistral.chatJson
      .mockResolvedValueOnce(extraction({
        documentType: 'CV',
        firstName: 'Aino',
        lastName: 'Korhonen',
        email: 'aino@example.test',
        hireDate: '2020-01-01',
        personalIdentityNumber: 'WRONG-FROM-CV',
        trainingNames: ['Hygieniapassi'],
        professionalSummary: 'Expérience en café.',
      }))
      .mockResolvedValueOnce(extraction({ email: null, personalIdentityNumber: '080800A592P' }));

    const result = await instance.analyze('org-1', [
      { ...jpeg, originalname: 'CV_Aino.pdf', mimetype: 'application/pdf' },
      { ...jpeg, originalname: 'työsopimus.pdf', mimetype: 'application/pdf' },
    ]);

    expect(result.hasContractSource).toBe(true);
    expect(result.draft).toMatchObject({
      email: 'aino@example.test',
      hireDate: '2026-04-04',
      personalIdentityNumber: '080800A592P',
      trainingNames: ['Hygieniapassi'],
      contractType: 'CDD',
    });
    expect(result.documents.map((document: any) => document.documentType)).toEqual(['CV', 'CONTRACT']);
  });
});
