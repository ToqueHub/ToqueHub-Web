import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { AlertCircle, ArrowLeft, BriefcaseBusiness, CalendarDays, CheckCircle2, FileText, GraduationCap, History, NotebookText, Search, ShieldCheck, Sparkles, UploadCloud, UserRound, UsersRound, X, ChevronDown, Mail, Phone, MapPin, Globe, Languages, Hash } from 'lucide-react';
import type { CoreUser, HrCollaborator, HrCollaboratorPayload, HrContractAnalysis, HrDepartment, HrDocument, HrHistoryEntry, HrPosition, RegulatoryCountryCode, Site } from '../../../types';
import { HR_CATALOG } from '../../../hr-catalog';

type TabId = 'profile' | 'professional' | 'contracts' | 'documents' | 'trainings' | 'organization' | 'history';
type RequiredFieldId = 'firstName' | 'lastName' | 'departmentId' | 'positionId';
type RequiredFieldErrors = Partial<Record<RequiredFieldId, string>>;
export type PendingHrDocumentUpload = { file: File; category: string; notes?: string; expiresAt?: string };

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Profil' },
  { id: 'professional', label: 'Professionnel' },
  { id: 'contracts', label: 'Contrat & salaire' },
  { id: 'documents', label: 'Documents' },
  { id: 'trainings', label: 'Formations' },
  { id: 'organization', label: 'Organisation' },
  { id: 'history', label: 'Historique' },
];

const statusOptions = [
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DEPARTED', label: 'Départ' },
];
const OCR_DOCUMENT_NOTE_PREFIX = 'Document analysé par OCR';
const OCR_DOCUMENT_NOTES = {
  CONTRACT: `${OCR_DOCUMENT_NOTE_PREFIX} — contrat à vérifier.`,
  CV: `${OCR_DOCUMENT_NOTE_PREFIX} — CV à vérifier.`,
  OTHER: `${OCR_DOCUMENT_NOTE_PREFIX} — type à vérifier.`,
};

function collaboratorSecondarySiteIds(collaborator?: HrCollaborator) {
  if (collaborator?.secondarySiteIds?.length) return collaborator.secondarySiteIds;
  return (collaborator?.secondarySites ?? []).map((item) => 'siteId' in item ? item.siteId : item.id).filter(Boolean);
}

function secondarySiteNames(collaborator?: HrCollaborator) {
  return (collaborator?.secondarySites ?? [])
    .map((item) => 'siteId' in item ? item.site?.name : item.name)
    .filter(Boolean) as string[];
}

function collaboratorSecondaryPositionIds(collaborator?: HrCollaborator) {
  if (collaborator?.secondaryPositionIds?.length) return validUuidList(collaborator.secondaryPositionIds);
  return validUuidList((collaborator?.secondaryPositions ?? []).map((item) => {
    const relation = item as HrPosition & { positionId?: string | null; position?: HrPosition | null };
    return relation.positionId ?? relation.position?.id ?? relation.id;
  }));
}

function validUuidList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => isUuid(value)))];
}

function isUuid(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function FormField({
  label,
  icon,
  className = '',
  error,
  isSelect = false,
  children
}: {
  label: string;
  icon?: React.ReactNode;
  className?: string;
  error?: string;
  isSelect?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`hr-field-container ${className} ${error ? 'has-error' : ''}`}>
      <label className="hr-field-label">{label}</label>
      <div className={`hr-field-wrapper ${icon ? 'has-icon' : ''} ${isSelect ? 'is-select' : ''}`}>
        {icon && <span className="hr-field-icon">{icon}</span>}
        {children}
        {isSelect && <span className="hr-select-chevron"><ChevronDown size={16} /></span>}
      </div>
      {error && <span className="hr-field-error-text">{error}</span>}
    </div>
  );
}

export function CollaboratorModal({ collaborator, collaborators, departments, positions, users, sites, regulatoryCountryCode, onClose, onSubmit, onAnalyzeContract, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: { collaborator?: HrCollaborator; collaborators: HrCollaborator[]; departments: HrDepartment[]; positions: HrPosition[]; users: CoreUser[]; sites: Site[]; regulatoryCountryCode?: RegulatoryCountryCode | null; onClose: () => void; onSubmit: (payload: HrCollaboratorPayload, documents: PendingHrDocumentUpload[]) => Promise<void>; onAnalyzeContract: (files: File[]) => Promise<HrContractAnalysis>; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  const [creationStage, setCreationStage] = useState<'choice' | 'ocr' | 'form'>(collaborator ? 'form' : 'choice');
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [submitting, setSubmitting] = useState(false);
  const [positionResetMessage, setPositionResetMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<TabId, string>>>({});
  const [requiredErrors, setRequiredErrors] = useState<RequiredFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [pendingDocuments, setPendingDocuments] = useState<PendingHrDocumentUpload[]>([]);
  const [contractAnalysis, setContractAnalysis] = useState<HrContractAnalysis | null>(null);
  const [contractAttachmentNotice, setContractAttachmentNotice] = useState('');
  const [selectedTrainings, setSelectedTrainings] = useState<string[]>(collaborator?.trainingNames ?? []);
  const [customTraining, setCustomTraining] = useState('');
  const [form, setForm] = useState<HrCollaboratorPayload>({
    photoUrl: collaborator?.photoUrl ?? collaborator?.photoDataUrl ?? '',
    firstName: collaborator?.firstName ?? '',
    lastName: collaborator?.lastName ?? '',
    email: collaborator?.email ?? '',
    phone: collaborator?.phone ?? '',
    address: collaborator?.address ?? '',
    postalCode: collaborator?.postalCode ?? '',
    city: collaborator?.city ?? '',
    country: collaborator?.country ?? '',
    primaryLanguage: collaborator?.primaryLanguage ?? '',
    secondaryLanguage: collaborator?.secondaryLanguage ?? '',
    emergencyContact: collaborator?.emergencyContact ?? '',
    birthDate: toInputDate(collaborator?.birthDate),
    personalIdentityNumber: collaborator?.personalIdentityNumber ?? '',
    hireDate: toInputDate(collaborator?.hireDate) || new Date().toISOString().slice(0, 10),
    departmentId: collaborator?.departmentId ?? collaborator?.department?.id ?? '',
    positionId: collaborator?.positionId ?? collaborator?.position?.id ?? '',
    secondaryPositionIds: collaboratorSecondaryPositionIds(collaborator),
    siteId: collaborator?.mainSiteId ?? collaborator?.siteId ?? collaborator?.mainSite?.id ?? collaborator?.site?.id ?? '',
    secondarySiteIds: collaboratorSecondarySiteIds(collaborator),
    employeeNumber: collaborator?.employeeNumber ?? '',
    notes: cleanLegacyHrNotes(collaborator?.notes),
    status: collaborator?.status === 'LEFT' ? 'DEPARTED' : collaborator?.status ?? 'ACTIVE',
    userId: collaborator?.userId ?? collaborator?.user?.id ?? '',
    managerId: collaborator?.managerId ?? collaborator?.manager?.id ?? '',
    contractType: collaborator?.activeContract?.contractType ?? collaborator?.contractType ?? '',
    contractEndDate: toInputDate(collaborator?.activeContract?.endDate) || toInputDate(collaborator?.contractEndDate),
    trialEndDate: toInputDate(collaborator?.activeContract?.trialEndDate) || toInputDate(collaborator?.trialEndDate),
    contractWeeklyMinutes: collaborator?.activeContract?.weeklyHours ?? collaborator?.contractWeeklyMinutes ?? null,
    hourlyRate: collaborator?.currentCompensation?.hourlyRate ?? collaborator?.hourlyRate ?? null,
    currency: collaborator?.currentCompensation?.currency ?? collaborator?.currency ?? 'EUR',
    rateEffectiveDate: toInputDate(collaborator?.currentCompensation?.effectiveFrom) || toInputDate(collaborator?.rateEffectiveDate),
    nextReviewDate: toInputDate(collaborator?.nextSalaryReview?.dueDate) || toInputDate(collaborator?.nextReviewDate),
    reviewFrequency: collaborator?.nextSalaryReview?.frequencyMonths === 1 ? 'MONTHLY' : collaborator?.nextSalaryReview?.frequencyMonths === 3 ? 'QUARTERLY' : collaborator?.nextSalaryReview?.frequencyMonths === 12 ? 'YEARLY' : collaborator?.reviewFrequency ?? '',
  });

  const activeDepartments = departments.filter((department) => !isArchived(department));
  const activePositions = positions.filter((position) => !isArchived(position));
  const selectedDepartment = activeDepartments.find((department) => department.id === form.departmentId);
  const primaryPositions = useMemo(() => activePositions.filter((position) => positionBelongsToDepartment(position, selectedDepartment)), [activePositions, selectedDepartment]);
  const availableManagers = collaborators.filter((item) => item.id !== collaborator?.id && !isArchived(item));
  const availableUsers = users.filter((user) => user.status !== 'DISABLED' || user.id === form.userId);
  const set = <K extends keyof HrCollaboratorPayload>(key: K, value: HrCollaboratorPayload[K]) => {
    setDirty(true);
    if (isRequiredField(key) && String(value ?? '').trim()) {
      setRequiredErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!form.departmentId || !form.positionId) return;
    if (primaryPositions.some((position) => position.id === form.positionId)) return;
    setForm((prev) => ({ ...prev, positionId: '', secondaryPositionIds: (prev.secondaryPositionIds ?? []).filter((id) => id !== prev.positionId) }));
    setDirty(true);
    setPositionResetMessage("Le poste principal a été vidé car il n'appartient pas au nouveau service.");
  }, [form.departmentId, form.positionId, primaryPositions]);

  function applyContractAnalysis(result: HrContractAnalysis, files: File[]) {
    setForm((current) => {
      const merged = { ...current, ...result.draft };
      return {
        ...merged,
        firstName: merged.firstName ?? '',
        lastName: merged.lastName ?? '',
        hireDate: result.hasContractSource ? merged.hireDate || '' : '',
        departmentId: merged.departmentId ?? '',
        positionId: merged.positionId ?? '',
        personalIdentityNumber: result.hasContractSource ? merged.personalIdentityNumber ?? '' : '',
        contractType: result.hasContractSource ? merged.contractType ?? '' : '',
        contractEndDate: result.hasContractSource ? merged.contractEndDate ?? '' : '',
        trialEndDate: result.hasContractSource ? merged.trialEndDate ?? '' : '',
        contractWeeklyMinutes: result.hasContractSource ? merged.contractWeeklyMinutes ?? null : null,
        hourlyRate: result.hasContractSource ? merged.hourlyRate ?? null : null,
        rateEffectiveDate: result.hasContractSource ? merged.rateEffectiveDate ?? '' : '',
      };
    });
    setSelectedTrainings(result.draft.trainingNames ?? []);
    const pdfDocuments = files.flatMap((file, index) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const source = result.documents[index];
      if (!isPdf || !source) return [];
      return [{
        file,
        category: source.category,
        notes: OCR_DOCUMENT_NOTES[source.documentType],
      }];
    });
    setPendingDocuments((documents) => [
      ...pdfDocuments,
      ...documents.filter((document) => !document.notes?.startsWith(OCR_DOCUMENT_NOTE_PREFIX)),
    ]);
    const imageCount = files.length - pdfDocuments.length;
    setContractAttachmentNotice([
      pdfDocuments.length ? `${pdfDocuments.length} PDF seront joints au dossier après l’enregistrement.` : '',
      imageCount ? `${imageCount} image${imageCount > 1 ? 's ont' : ' a'} servi à l’analyse sans être archivée${imageCount > 1 ? 's' : ''}.` : '',
    ].filter(Boolean).join(' '));
    setContractAnalysis(result);
    setDirty(true);
    setActiveTab('profile');
    setCreationStage('form');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextRequiredErrors = validateRequiredFields(form);
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setRequiredErrors(nextRequiredErrors);
    if (Object.keys(nextErrors).length) {
      setActiveTab(Object.keys(nextErrors)[0] as TabId);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit(cleanPayload({ ...form, trainingNames: selectedTrainings }), pendingDocuments);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Impossible d'enregistrer le collaborateur.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabIcons: Record<TabId, React.ReactNode> = {
    profile: <UserRound size={16} />,
    professional: <BriefcaseBusiness size={16} />,
    contracts: <ShieldCheck size={16} />,
    documents: <FileText size={16} />,
    trainings: <GraduationCap size={16} />,
    organization: <UsersRound size={16} />,
    history: <History size={16} />,
  };

  if (!collaborator && creationStage !== 'form') {
    return (
      <div className="modal-overlay">
        <div className="modal-card hr-modal hr-collaborator-modal hr-collaborator-entry-modal" role="dialog" aria-modal="true" aria-labelledby="hr-collaborator-entry-title">
          <div className="modal-header hr-modal-sticky">
            <div>
              <h2 id="hr-collaborator-entry-title">Ajouter un collaborateur</h2>
              <p>{creationStage === 'choice' ? 'Choisissez comment préparer la fiche. Vous pourrez tout relire avant de l’enregistrer.' : 'Importez un CV, un contrat ou les deux pour compléter un même brouillon.'}</p>
            </div>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
          </div>
          <div className="hr-collaborator-entry-body">
            {creationStage === 'choice' ? (
              <CreationSourceChooser
                onManual={() => setCreationStage('form')}
                onOcr={() => setCreationStage('ocr')}
              />
            ) : (
              <ContractOcrStep
                onBack={() => setCreationStage(contractAnalysis ? 'form' : 'choice')}
                onAnalyze={onAnalyzeContract}
                onAnalyzed={applyContractAnalysis}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <form className="modal-card hr-modal hr-collaborator-modal" onSubmit={submit} noValidate>
        <div className="modal-header hr-modal-sticky">
          <div>
            <h2>{collaborator ? 'Modifier le collaborateur' : 'Nouveau collaborateur'}</h2>
            <p className="muted">Minimum : prénom, nom, date d'embauche, établissement si nécessaire, service et poste.</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="hr-collaborator-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              {tabIcons[tab.id]}
              <span>{tab.label}</span>
              {errors[tab.id] ? <span className="hr-tab-error" /> : null}
            </button>
          ))}
        </div>
        {contractAnalysis ? (
          <div className="hr-ocr-review-banner" role="status">
            <CheckCircle2 size={20} />
            <div>
              <strong>{contractAnalysis.fieldCount} information{contractAnalysis.fieldCount > 1 ? 's' : ''} préremplie{contractAnalysis.fieldCount > 1 ? 's' : ''}</strong>
              <span>{contractAnalysis.documents.length} document{contractAnalysis.documents.length > 1 ? 's' : ''} analysé{contractAnalysis.documents.length > 1 ? 's' : ''} : {contractAnalysis.documents.map((document) => document.documentType === 'CONTRACT' ? 'contrat' : document.documentType === 'CV' ? 'CV' : 'autre').join(' + ')}. Relisez chaque onglet avant l’enregistrement.</span>
              {contractAttachmentNotice ? <small>{contractAttachmentNotice}</small> : null}
              {contractAnalysis.uncertainFields.length || contractAnalysis.warnings.length ? (
                <small className="hr-ocr-review-warning">
                  {[...contractAnalysis.uncertainFields.map((field) => `Champ incertain : ${field}`), ...contractAnalysis.warnings].slice(0, 3).join(' · ')}
                </small>
              ) : null}
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setCreationStage('ocr')}>Modifier les documents</button>
          </div>
        ) : null}
        <div className="hr-collaborator-body">
          {activeTab === 'profile' ? <ProfileTab form={form} set={set} requiredErrors={requiredErrors} regulatoryCountryCode={regulatoryCountryCode} /> : null}
          {activeTab === 'professional' ? <ProfessionalTab form={form} set={set} requiredErrors={requiredErrors} departments={activeDepartments} positions={primaryPositions} allPositions={activePositions} selectedDepartment={selectedDepartment} sites={sites} managers={availableManagers} users={availableUsers} positionResetMessage={positionResetMessage} clearPositionResetMessage={() => setPositionResetMessage('')} /> : null}
          {activeTab === 'contracts' ? <ContractsTab form={form} set={set} collaborator={collaborator} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} /> : null}
          {activeTab === 'documents' ? <DocumentsTab collaborator={collaborator} pendingDocuments={pendingDocuments} onDocumentsChange={(documents) => { setPendingDocuments(documents); setDirty(true); }} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} /> : null}
          {activeTab === 'trainings' ? <TrainingsTab regulatoryCountryCode={regulatoryCountryCode} selectedTrainings={selectedTrainings} onSelectedTrainings={(trainings) => { setSelectedTrainings(trainings); setDirty(true); }} customTraining={customTraining} onCustomTraining={setCustomTraining} /> : null}
          {activeTab === 'organization' ? <OrganizationTab collaborator={collaborator} /> : null}
          {activeTab === 'history' ? <HistoryTab history={collaborator?.history ?? []} /> : null}
        </div>
        <div className="modal-actions hr-modal-footer">
          <span className={submitError ? 'hr-inline-error' : 'muted'}>{submitError || (dirty ? 'Modifications non enregistrées' : 'Aucune modification')}</span>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function CreationSourceChooser({ onManual, onOcr }: { onManual: () => void; onOcr: () => void }) {
  return (
    <section className="hr-collaborator-source-step">
      <div className="hr-collaborator-entry-intro">
        <span className="welcome-tag"><Sparkles size={14} /> Fiche collaborateur</span>
        <h3>Comment souhaitez-vous commencer ?</h3>
        <p>Dans les deux cas, vous continuerez dans le même formulaire et garderez la main sur toutes les informations.</p>
      </div>
      <div className="onboarding-options-grid hr-collaborator-source-options">
        <button type="button" className="onboarding-option-card emerald" onClick={onManual}>
          <div className="onboarding-option-icon"><UserRound size={21} /></div>
          <div className="onboarding-option-content">
            <span className="onboarding-option-title">Saisie manuelle</span>
            <span className="onboarding-option-desc">Ouvrir la fiche actuelle et renseigner le profil, le poste, le contrat et les documents.</span>
          </div>
        </button>
        <button type="button" className="onboarding-option-card blue" onClick={onOcr}>
          <div className="onboarding-option-icon"><FileText size={21} /></div>
          <div className="onboarding-option-content">
            <span className="onboarding-option-title">Analyser des documents avec l’OCR</span>
            <span className="onboarding-option-desc">Combiner un CV et un contrat, puis préremplir et vérifier la fiche.</span>
          </div>
        </button>
      </div>
      <div className="hr-collaborator-entry-safety">
        <ShieldCheck size={17} />
        <span>L’analyse prépare uniquement un brouillon. Aucun collaborateur, contrat ou document n’est enregistré avant votre validation.</span>
      </div>
    </section>
  );
}

function ContractOcrStep({ onBack, onAnalyze, onAnalyzed }: { onBack: () => void; onAnalyze: (files: File[]) => Promise<HrContractAnalysis>; onAnalyzed: (result: HrContractAnalysis, files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  function selectFiles(nextFiles?: FileList | File[]) {
    const selected = Array.from(nextFiles ?? []);
    if (!selected.length) return;
    if (files.length + selected.length > 6) {
      setError('Vous pouvez analyser jusqu’à 6 documents à la fois.');
      return;
    }
    for (const next of selected) {
      const extension = next.name.toLowerCase().split('.').pop() ?? '';
      const acceptedExtension = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'avif'].includes(extension);
      const acceptedMime = next.type === 'application/pdf' || next.type.startsWith('image/');
      if (!acceptedExtension && !acceptedMime) {
        setError(`Format non pris en charge pour « ${next.name} ».`);
        return;
      }
      if (next.size > 10 * 1024 * 1024) {
        setError(`« ${next.name} » dépasse 10 Mo.`);
        return;
      }
    }
    setFiles((current) => {
      const keys = new Set(current.map(fileKey));
      return [...current, ...selected.filter((file) => !keys.has(fileKey(file)))];
    });
    setError('');
  }

  async function analyze() {
    if (!files.length || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      const result = await onAnalyze(files);
      onAnalyzed(result, files);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Impossible d’analyser ces documents.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="hr-contract-ocr-step">
      <div className="hr-collaborator-entry-intro compact">
        <span className="welcome-tag"><FileText size={14} /> Import sécurisé</span>
        <h3>Constituez le dossier à analyser</h3>
        <p>Ajoutez un CV, un contrat ou les deux. Le CV complète le profil et le parcours; seul le contrat peut remplir les informations contractuelles.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.avif"
        hidden
        onChange={(event) => { selectFiles(event.target.files ?? undefined); event.currentTarget.value = ''; }}
      />
      <button
        type="button"
        className={`hr-contract-dropzone ${dragActive ? 'drag-active' : ''} ${files.length ? 'has-file' : ''}`}
        disabled={analyzing}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFiles(event.dataTransfer.files); }}
      >
        <span className="hr-contract-dropzone-icon">{files.length ? <CheckCircle2 size={28} /> : <UploadCloud size={28} />}</span>
        {files.length ? (
          <span className="hr-contract-selected-file">
            <strong>{files.length} document{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}</strong>
            <small>Cliquez pour ajouter un CV ou un contrat complémentaire</small>
          </span>
        ) : (
          <span>
            <strong>Déposer un CV et/ou un contrat</strong>
            <small>Jusqu’à 6 PDF ou images · 10 Mo maximum par fichier</small>
          </span>
        )}
      </button>
      {files.length ? <div className="hr-ocr-selected-documents">{files.map((file) => (
        <div key={fileKey(file)}>
          <FileText size={16} />
          <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
          <button type="button" className="icon-btn danger" disabled={analyzing} onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))} aria-label={`Retirer ${file.name}`}><X size={14} /></button>
        </div>
      ))}</div> : null}
      {error ? <div className="alert-modern error hr-contract-ocr-error"><AlertCircle size={17} /> {error}</div> : null}
      <div className="hr-contract-ocr-privacy">
        <ShieldCheck size={16} />
        <span>Les dates d’anciens emplois d’un CV ne deviennent jamais des dates de contrat. L’identifiant personnel n’est repris que depuis un contrat explicite.</span>
      </div>
      <div className="hr-contract-import-actions">
        <button type="button" className="btn btn-secondary" disabled={analyzing} onClick={onBack}><ArrowLeft size={16} /> Retour</button>
        <button type="button" className="btn btn-primary" disabled={!files.length || analyzing} onClick={() => void analyze()}>
          <Sparkles size={16} /> {analyzing ? 'Analyse OCR en cours…' : `Analyser ${files.length > 1 ? 'les documents' : 'le document'}`}
        </button>
      </div>
    </section>
  );
}

function ProfileTab({ form, set, requiredErrors, regulatoryCountryCode }: TabProps & { requiredErrors: RequiredFieldErrors; regulatoryCountryCode?: RegulatoryCountryCode | null }) {
  const identityLabel = regulatoryCountryCode === 'FI' ? 'Henkilötunnus' : regulatoryCountryCode === 'FR' ? 'Numéro de sécurité sociale' : 'Identifiant personnel';
  return <TabPanel icon={<UserRound size={18} />} title="Profil">
    <div className="hr-form-grid">
      <FormField label="URL de la photo" icon={<UserRound size={16} />} className="span-2">
        <input placeholder="https://example.com/photo.jpg" value={form.photoUrl ?? ''} onChange={(e) => set('photoUrl', e.target.value)} />
      </FormField>
      <FormField label="Prénom *" icon={<UserRound size={16} />} error={requiredErrors.firstName}>
        <input className={requiredErrors.firstName ? 'hr-field-missing' : undefined} placeholder="Jean" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required aria-invalid={Boolean(requiredErrors.firstName)} />
      </FormField>
      <FormField label="Nom *" icon={<UserRound size={16} />} error={requiredErrors.lastName}>
        <input className={requiredErrors.lastName ? 'hr-field-missing' : undefined} placeholder="Dupont" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required aria-invalid={Boolean(requiredErrors.lastName)} />
      </FormField>
      <FormField label="Email" icon={<Mail size={16} />}>
        <input type="email" placeholder="jean.dupont@toquehub.fr" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
      </FormField>
      <FormField label="Téléphone" icon={<Phone size={16} />}>
        <input placeholder="+33 6 12 34 56 78" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
      </FormField>
      <FormField label="Adresse" icon={<MapPin size={16} />} className="span-2">
        <input placeholder="12 rue de la Paix" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
      </FormField>
      <FormField label="Code postal" icon={<MapPin size={16} />}>
        <input placeholder="75002" value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
      </FormField>
      <FormField label="Ville" icon={<MapPin size={16} />}>
        <input placeholder="Paris" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
      </FormField>
      <FormField label="Pays" icon={<Globe size={16} />}>
        <input placeholder="France" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
      </FormField>
      <FormField label="Date de naissance" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} />
      </FormField>
      <FormField label={identityLabel} icon={<ShieldCheck size={16} />}>
        <input autoComplete="off" spellCheck={false} placeholder={regulatoryCountryCode === 'FI' ? 'JJMMAA-XXXX' : 'Numéro du salarié'} value={form.personalIdentityNumber ?? ''} onChange={(e) => set('personalIdentityNumber', e.target.value)} />
      </FormField>
      <FormField label="Langue principale" icon={<Languages size={16} />}>
        <input placeholder="Français" value={form.primaryLanguage ?? ''} onChange={(e) => set('primaryLanguage', e.target.value)} />
      </FormField>
      <FormField label="Langue secondaire" icon={<Languages size={16} />}>
        <input placeholder="Anglais" value={form.secondaryLanguage ?? ''} onChange={(e) => set('secondaryLanguage', e.target.value)} />
      </FormField>
      <FormField label="Contact d'urgence" icon={<Phone size={16} />} className="span-2">
        <input placeholder="Nom, relation et téléphone" value={form.emergencyContact ?? ''} onChange={(e) => set('emergencyContact', e.target.value)} />
      </FormField>
    </div>
  </TabPanel>;
}

function ProfessionalTab({ form, set, requiredErrors, departments, positions, allPositions, selectedDepartment, sites, managers, users, positionResetMessage, clearPositionResetMessage }: TabProps & { requiredErrors: RequiredFieldErrors; departments: HrDepartment[]; positions: HrPosition[]; allPositions: HrPosition[]; selectedDepartment?: HrDepartment; sites: Site[]; managers: HrCollaborator[]; users: CoreUser[]; positionResetMessage: string; clearPositionResetMessage: () => void }) {
  return <TabPanel icon={<BriefcaseBusiness size={18} />} title="Professionnel">
    <div className="hr-form-grid">
      <FormField label="Date d'embauche *" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
      </FormField>
      <FormField label="Établissement principal" icon={<UsersRound size={16} />} isSelect={true}>
        <select value={form.siteId ?? ''} onChange={(e) => { set('siteId', e.target.value); set('secondarySiteIds', (form.secondarySiteIds ?? []).filter((id) => id !== e.target.value)); }} disabled={!sites.length}>
          <option value="">{sites.length ? '-' : 'Aucun établissement configuré'}</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
      </FormField>
      <SecondarySiteSelector sites={sites} selectedIds={form.secondarySiteIds ?? []} mainSiteId={form.siteId} onChange={(ids) => set('secondarySiteIds', ids)} />
      <FormField label="Service principal *" icon={<UsersRound size={16} />} error={requiredErrors.departmentId} isSelect={true}>
        <select className={requiredErrors.departmentId ? 'hr-field-missing' : undefined} value={form.departmentId} onChange={(e) => { set('departmentId', e.target.value); clearPositionResetMessage(); }} required aria-invalid={Boolean(requiredErrors.departmentId)}>
          <option value="">-</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </FormField>
      <FormField label="Poste principal *" icon={<BriefcaseBusiness size={16} />} error={requiredErrors.positionId} isSelect={true}>
        <select className={requiredErrors.positionId ? 'hr-field-missing' : undefined} value={form.positionId} onChange={(e) => set('positionId', e.target.value)} required disabled={!form.departmentId} aria-invalid={Boolean(requiredErrors.positionId)}>
          <option value="">{form.departmentId ? 'Choisir un poste' : "Choisir d'abord un service"}</option>
          {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </select>
      </FormField>
      {positionResetMessage ? <div className="hr-inline-warning span-2"><AlertCircle size={14} /> {positionResetMessage}</div> : null}
      <FormField label="Responsable direct" icon={<UserRound size={16} />} isSelect={true}>
        <select value={form.managerId ?? ''} onChange={(e) => set('managerId', e.target.value)}>
          <option value="">-</option>
          {managers.map((manager) => <option key={manager.id} value={manager.id}>{fullName(manager)}</option>)}
        </select>
      </FormField>
      <FormField label="Numéro de matricule" icon={<Hash size={16} />}>
        <input placeholder="Ex: EMP-1002" value={form.employeeNumber ?? ''} onChange={(e) => set('employeeNumber', e.target.value)} />
      </FormField>
      <SecondaryPositionSelector positions={allPositions} selectedIds={form.secondaryPositionIds ?? []} mainPositionId={form.positionId} selectedDepartment={selectedDepartment} onChange={(ids) => set('secondaryPositionIds', ids)} />
      <FormField label="Statut du collaborateur" icon={<BriefcaseBusiness size={16} />} isSelect={true}>
        <select value={form.status} onChange={(e) => set('status', e.target.value)}>
          {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </FormField>
      <FormField label="Notes professionnelles" className="span-2">
        <textarea placeholder="Ajouter des notes professionnelles..." value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </FormField>
      <FormField label="Compte ToqueHub associé" icon={<UserRound size={16} />} className="span-2" isSelect={true}>
        <select value={form.userId ?? ''} onChange={(e) => set('userId', e.target.value)}>
          <option value="">Aucun compte associé</option>
          {users.map((user) => <option key={user.id} value={user.id}>{displayUser(user)}</option>)}
        </select>
      </FormField>
    </div>
  </TabPanel>;
}

function ContractsTab({ form, set, collaborator, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: TabProps & { collaborator?: HrCollaborator; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  const [weeklyHoursInput, setWeeklyHoursInput] = useState(() => hoursInputValue(form.contractWeeklyMinutes ?? collaborator?.activeContract?.weeklyHours ?? null));
  const weekly = form.contractWeeklyMinutes ?? collaborator?.activeContract?.weeklyHours ?? null;
  const rate = form.hourlyRate ?? collaborator?.currentCompensation?.hourlyRate ?? null;
  const weeklyHours = weekly != null ? weekly / 60 : null;
  const weeklyGross = rate != null && weeklyHours != null ? rate * weeklyHours : null;
  function updateWeeklyHours(value: string) {
    if (!/^\d*([,.]\d{0,2})?$/.test(value)) return;
    setWeeklyHoursInput(value);
    const hours = parseHoursInput(value);
    set('contractWeeklyMinutes', hours != null ? Math.round(hours * 60) : null);
  }
  return <TabPanel icon={<ShieldCheck size={18} />} title="Contrats & rémunération">
    <div className="hr-form-grid">
      <FormField label="Type de contrat" icon={<ShieldCheck size={16} />} isSelect={true}>
        <select value={form.contractType ?? ''} onChange={(e) => set('contractType', e.target.value)}>
          <option value="">-</option>
          <option value="CDI">CDI</option>
          <option value="CDD">CDD</option>
          <option value="INTERIM">Intérim</option>
          <option value="APPRENTICESHIP">Apprentissage</option>
          <option value="INTERNSHIP">Stage</option>
          <option value="OTHER">Autre</option>
        </select>
      </FormField>
      <FormField label="Date de fin" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.contractEndDate ?? ''} onChange={(e) => set('contractEndDate', e.target.value)} />
      </FormField>
      <FormField label="Fin de période d'essai" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.trialEndDate ?? ''} onChange={(e) => set('trialEndDate', e.target.value)} />
      </FormField>
      <FormField label="Durée hebdo contractuelle (h)" icon={<Hash size={16} />}>
        <input type="text" inputMode="decimal" value={weeklyHoursInput} onChange={(e) => updateWeeklyHours(e.target.value)} onBlur={() => setWeeklyHoursInput((value) => hoursInputValue(parseHoursInput(value) != null ? Math.round(parseHoursInput(value)! * 60) : null))} placeholder="Ex: 35" />
      </FormField>
      <FormField label="Taux horaire" icon={<Hash size={16} />}>
        <input type="number" min={0} step={0.01} value={form.hourlyRate ?? ''} onChange={(e) => set('hourlyRate', e.target.value ? parseFloat(e.target.value) : null)} />
      </FormField>
      <FormField label="Devise" icon={<Globe size={16} />} isSelect={true}>
        <select value={form.currency ?? 'EUR'} onChange={(e) => set('currency', e.target.value)}>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="CHF">CHF</option>
        </select>
      </FormField>
      <FormField label="Date d'effet" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.rateEffectiveDate ?? ''} onChange={(e) => set('rateEffectiveDate', e.target.value)} />
      </FormField>
      <FormField label="Prochaine revalorisation" icon={<CalendarDays size={16} />}>
        <input type="date" value={form.nextReviewDate ?? ''} onChange={(e) => set('nextReviewDate', e.target.value)} />
      </FormField>
      <FormField label="Fréquence de revalorisation" icon={<CalendarDays size={16} />} isSelect={true}>
        <select value={form.reviewFrequency ?? ''} onChange={(e) => set('reviewFrequency', e.target.value)}>
          <option value="">-</option>
          <option value="MONTHLY">Mensuelle</option>
          <option value="QUARTERLY">Trimestrielle</option>
          <option value="YEARLY">Annuelle</option>
          <option value="CUSTOM">Personnalisée</option>
        </select>
      </FormField>
    </div>
    {weeklyGross != null ? <div className="hr-salary-preview"><strong>Estimation brute salarié</strong><span>Salaire hebdomadaire brut : <strong>{weeklyGross.toFixed(2)} {form.currency}</strong></span><span>Salaire mensuel brut estimé : <strong>{((weeklyGross * 52) / 12).toFixed(2)} {form.currency}</strong></span><span>Salaire annuel brut estimé : <strong>{(weeklyGross * 52).toFixed(2)} {form.currency}</strong></span><small>Estimation basée uniquement sur la durée hebdomadaire contractuelle et le taux horaire. Hors congés payés, primes, majorations, absences et charges patronales.</small><small>Coût employeur estimé : non disponible pour l'instant.</small></div> : null}
    <ContractHistory collaborator={collaborator} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} />
    <DataTable title="Historique salarial" rows={(collaborator?.compensations ?? []).map((item) => [`${Number(item.hourlyRate).toFixed(2)} ${item.currency}`, formatDate(item.effectiveFrom), formatDate(item.effectiveTo), item.reason ?? '-'])} empty="Aucune rémunération dédiée enregistrée." />
    <DataTable title="Revalorisations" rows={(collaborator?.salaryReviews ?? []).map((review) => [formatDate(review.dueDate), review.status, review.proposedHourlyRate ? `${review.proposedHourlyRate}` : '-', review.notes ?? '-'])} empty="Aucune revalorisation planifiée." />
  </TabPanel>;
}

function DocumentsTab({ collaborator, pendingDocuments, onDocumentsChange, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: { collaborator?: HrCollaborator; pendingDocuments: PendingHrDocumentUpload[]; onDocumentsChange: (documents: PendingHrDocumentUpload[]) => void; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  const updateDocument = (index: number, patch: Partial<PendingHrDocumentUpload>) => onDocumentsChange(pendingDocuments.map((document, i) => i === index ? { ...document, ...patch } : document));
  const appendDocuments = (files: FileList | null) => {
    const nextDocuments = Array.from(files ?? []).map((file) => ({ file, category: 'OTHER' }));
    if (nextDocuments.length) onDocumentsChange([...pendingDocuments, ...nextDocuments]);
  };
  return <TabPanel icon={<FileText size={18} />} title="Documents">
    <DocumentRegistry collaborator={collaborator} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} />
    <div className="hr-upload-box">
      <label className="btn btn-secondary">
        Joindre des PDF
        <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { appendDocuments(event.target.files); event.currentTarget.value = ''; }} />
      </label>
      <span className="muted">Les fichiers choisis seront enregistrés et rattachés à leur catégorie.</span>
    </div>
    {pendingDocuments.length ? <div className="hr-pending-documents">{pendingDocuments.map((doc, index) => (
      <div key={`${doc.file.name}-${index}`} className="hr-pending-document">
        <div><strong>{doc.file.name}</strong><span>{formatBytes(doc.file.size)}</span></div>
        <div className="hr-field-wrapper is-select">
          <select value={doc.category} onChange={(event) => updateDocument(index, { category: event.target.value })}>
            <option value="CONTRACT">Contrat</option>
            <option value="AMENDMENT">Avenant</option>
            <option value="CERTIFICATION">Formation / certification</option>
            <option value="DIPLOMA">Diplôme</option>
            <option value="IDENTITY">Identité</option>
            <option value="ADMINISTRATIVE">CV / administratif</option>
            <option value="OTHER">Autre</option>
          </select>
          <span className="hr-select-chevron"><ChevronDown size={16} /></span>
        </div>
        <div className="hr-field-wrapper">
          <input placeholder="Note optionnelle" value={doc.notes ?? ''} onChange={(event) => updateDocument(index, { notes: event.target.value })} />
        </div>
        <button type="button" className="icon-btn danger" onClick={() => onDocumentsChange(pendingDocuments.filter((_, i) => i !== index))}><X size={14} /></button>
      </div>
    ))}</div> : null}
  </TabPanel>;
}

function DocumentRegistry({ collaborator, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: { collaborator?: HrCollaborator; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  const documents = collaborator?.documents ?? [];
  if (!collaborator || !documents.length) return <DataTable title="Documents RH" rows={[]} empty="Aucun document enregistré dans HrDocument." />;
  return <div className="hr-contract-history"><strong>Documents RH</strong>{documents.map((document) => <div key={document.id} className="hr-contract-history-row"><div><span>{document.originalName}</span><small>{hrDocumentCategoryLabel(document.category)} · {formatBytes(document.sizeBytes)} · {document.expiresAt ? formatDate(document.expiresAt) : 'Sans échéance'}</small></div><DocumentActions employeeId={collaborator.id} document={document} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} /></div>)}</div>;
}

function ContractHistory({ collaborator, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: { collaborator?: HrCollaborator; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  const contractDocuments = (collaborator?.documents ?? []).filter((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT');
  const latestDocumentId = contractDocuments[0]?.id;
  const technicalContracts = collaborator?.contracts ?? [];
  if (!technicalContracts.length && !contractDocuments.length) return <DataTable title="Historique des contrats" rows={[]} empty="Aucun contrat dédié enregistré." />;
  return <div className="hr-contract-history"><strong>Historique des contrats</strong>{technicalContracts.map((contract) => <div key={contract.id} className="hr-contract-history-row"><div><span>{contract.contractType}</span><small>Effet : {formatDate(contract.startDate)} · Fin : {formatDate(contract.endDate)} · {contract.status}</small></div><em>Aucun fichier lié</em></div>)}{contractDocuments.map((document) => <div key={document.id} className="hr-contract-history-row"><div><span>{document.category === 'AMENDMENT' ? 'Avenant' : 'Contrat PDF'}</span><small>Effet : {formatDate(document.createdAt)} · Fin : {formatDate(document.expiresAt)} · {document.id === latestDocumentId ? 'Actif' : 'Ancien'} · {document.originalName}</small></div><DocumentActions employeeId={collaborator!.id} document={document} onViewDocument={onViewDocument} onDownloadDocument={onDownloadDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} /></div>)}</div>;
}

function DocumentActions({ employeeId, document, onViewDocument, onDownloadDocument, onReplaceDocument, onDeleteDocument }: { employeeId: string; document: HrDocument; onViewDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onDownloadDocument?: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument?: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument?: (employeeId: string, documentId: string) => Promise<void> }) {
  return <div className="row-actions hr-document-actions">
    {onViewDocument ? <button type="button" className="btn btn-secondary" onClick={() => onViewDocument(employeeId, document)}>Voir</button> : null}
    {onDownloadDocument ? <button type="button" className="btn btn-secondary" onClick={() => onDownloadDocument(employeeId, document)}>Télécharger</button> : null}
    {onReplaceDocument ? <label className="btn btn-secondary">Remplacer<input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReplaceDocument(employeeId, document.id, file); event.currentTarget.value = ''; }} /></label> : null}
    {onDeleteDocument ? <button type="button" className="icon-btn danger" onClick={() => onDeleteDocument(employeeId, document.id)}><X size={14} /></button> : null}
  </div>;
}

const frenchSuggestedTrainings = ['HACCP', 'Sécurité incendie', 'Gestes et postures', 'Accueil client', 'Hygiène alimentaire'];
const finnishSuggestedTrainings = [
  'Hygieniapassi',
  'Anniskelupassi',
  'Paloturvallisuuskoulutus',
];

function TrainingsTab({ regulatoryCountryCode, selectedTrainings, onSelectedTrainings, customTraining, onCustomTraining }: { regulatoryCountryCode?: RegulatoryCountryCode | null; selectedTrainings: string[]; onSelectedTrainings: (trainings: string[]) => void; customTraining: string; onCustomTraining: (value: string) => void }) {
  const suggestedTrainings = regulatoryCountryCode === 'FI' ? finnishSuggestedTrainings : frenchSuggestedTrainings;
  const toggle = (training: string) => onSelectedTrainings(selectedTrainings.includes(training) ? selectedTrainings.filter((item) => item !== training) : [...selectedTrainings, training]);
  const addCustom = () => {
    const name = customTraining.trim();
    if (!name || selectedTrainings.some((item) => normalizeLabel(item) === normalizeLabel(name))) return;
    onSelectedTrainings([...selectedTrainings, name]);
    onCustomTraining('');
  };
  return <TabPanel icon={<GraduationCap size={18} />} title="Formations">
    {regulatoryCountryCode === 'FI' ? <p className="muted">Passeports et formation proposés selon la réglementation finlandaise.</p> : null}
    <div className="hr-checkbox-group compact">
      {suggestedTrainings.map((training) => <label key={training} className="hr-checkbox-label"><input type="checkbox" checked={selectedTrainings.includes(training)} onChange={() => toggle(training)} />{training}</label>)}
    </div>
    <div className="hr-position-custom" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <div className="hr-field-wrapper" style={{ flex: 1 }}>
        <input placeholder="Ajouter une formation personnalisée..." value={customTraining} onChange={(event) => onCustomTraining(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} />
      </div>
      <button type="button" className="btn btn-secondary" onClick={addCustom}>Ajouter</button>
    </div>
    {selectedTrainings.length ? <div className="hr-position-tags">{selectedTrainings.map((training) => <span key={training} className="badge badge-reception">{training}<button type="button" className="icon-btn" onClick={() => toggle(training)}><X size={12} /></button></span>)}</div> : <p className="muted">Aucune formation sélectionnée.</p>}
  </TabPanel>;
}

function OrganizationTab({ collaborator }: { collaborator?: HrCollaborator }) {
  const contractMinutes = collaborator?.activeContract?.weeklyHours ?? collaborator?.contractWeeklyMinutes ?? null;
  return <TabPanel icon={<UsersRound size={18} />} title="Organisation de travail">
    <div className="hr-summary-list">
      <InfoRow label="Service principal" value={collaborator?.department?.name} />
      <InfoRow label="Poste principal" value={collaborator?.position?.name} />
      <InfoRow label="Postes secondaires" value={collaborator?.secondaryPositions?.map((p) => p.name).join(', ')} />
      <InfoRow label="Durée hebdo contractuelle" value={contractMinutes != null ? formatMinutes(contractMinutes) : undefined} />
      <InfoRow label="Établissement" value={collaborator?.mainSite?.name ?? collaborator?.site?.name} />
      <InfoRow label="Établissements secondaires" value={secondarySiteNames(collaborator).join(', ')} />
      <InfoRow label="Responsable direct" value={collaborator?.manager ? fullName(collaborator.manager) : undefined} />
    </div>
  </TabPanel>;
}

function HistoryTab({ history }: { history: HrHistoryEntry[] }) {
  return <TabPanel icon={<History size={18} />} title="Historique">
    {history.length === 0 ? <p className="muted">L'historique RH apparaîtra ici.</p> : <div className="hr-history">{history.map((entry) => <div key={entry.id ?? `${entry.createdAt}-${entry.type}`}><strong>{entry.label ?? entry.type}</strong><span>{entry.description}</span><small>{formatDate(entry.createdAt)}</small></div>)}</div>}
  </TabPanel>;
}

function SecondarySiteSelector({ sites, selectedIds, mainSiteId, onChange }: { sites: Site[]; selectedIds: string[]; mainSiteId?: string | null; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const normalizedSearch = normalizeLabel(search);
  const selected = sites.filter((site) => selectedIds.includes(site.id));
  const available = sites
    .filter((site) => site.id !== mainSiteId && !isArchived(site))
    .filter((site) => !normalizedSearch || normalizeLabel(site.name).includes(normalizedSearch))
    .sort((a, b) => a.name.localeCompare(b.name));
  useEffect(() => { function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } if (open) { document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick); } }, [open]);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...new Set([...selectedIds, id])]);
  return <div className="hr-secondary-selector span-2" ref={ref}>
    <label>Établissements secondaires</label>
    <button type="button" className="hr-secondary-trigger" onClick={() => setOpen((value) => !value)}>
      {selected.length ? <div className="hr-secondary-badges">{selected.map((site) => <span key={site.id} className="badge">{site.name}<span onClick={(e) => { e.stopPropagation(); toggle(site.id); }}><X size={10} /></span></span>)}</div> : <span className="muted">+ Ajouter un établissement secondaire</span>}
    </button>
    {open ? (
      <div className="hr-secondary-popover">
        <div className="hr-secondary-search">
          <div className="hr-field-wrapper has-icon" style={{ flex: 1 }}>
            <span className="hr-field-icon"><Search size={14} /></span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un établissement..." autoFocus />
          </div>
        </div>
        <div className="hr-secondary-list">
          {available.map((site) => (
            <label key={site.id} className="hr-secondary-item">
              <input type="checkbox" checked={selectedIds.includes(site.id)} onChange={() => toggle(site.id)} />
              {site.name}
            </label>
          ))}
          {!available.length ? <p className="muted" style={{ margin: '0.5rem' }}>Aucun autre établissement disponible.</p> : null}
        </div>
      </div>
    ) : null}
  </div>;
}

function SecondaryPositionSelector({ positions, selectedIds, mainPositionId, selectedDepartment, onChange }: { positions: HrPosition[]; selectedIds: string[]; mainPositionId?: string | null; selectedDepartment?: HrDepartment; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const normalizedSearch = normalizeLabel(search);
  const selected = positions.filter((position) => selectedIds.includes(position.id));
  const available = positions
    .filter((position) => position.id !== mainPositionId && !isArchived(position))
    .filter((position) => !normalizedSearch || normalizeLabel(position.name).includes(normalizedSearch))
    .sort((a, b) => Number(positionBelongsToDepartment(b, selectedDepartment)) - Number(positionBelongsToDepartment(a, selectedDepartment)) || a.name.localeCompare(b.name));
  useEffect(() => { function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } if (open) { document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick); } }, [open]);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...new Set([...selectedIds, id])]);
  return <div className="hr-secondary-selector span-2" ref={ref}>
    <label>Postes secondaires</label>
    <button type="button" className="hr-secondary-trigger" onClick={() => setOpen((value) => !value)}>
      {selected.length ? <div className="hr-secondary-badges">{selected.map((position) => <span key={position.id} className="badge">{position.name}<span onClick={(e) => { e.stopPropagation(); toggle(position.id); }}><X size={10} /></span></span>)}</div> : <span className="muted">+ Ajouter un poste secondaire</span>}
    </button>
    {open ? (
      <div className="hr-secondary-popover">
        <div className="hr-secondary-search">
          <div className="hr-field-wrapper has-icon" style={{ flex: 1 }}>
            <span className="hr-field-icon"><Search size={14} /></span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un poste..." autoFocus />
          </div>
        </div>
        <div className="hr-secondary-list">
          {available.map((position) => (
            <label key={position.id} className="hr-secondary-item">
              <input type="checkbox" checked={selectedIds.includes(position.id)} onChange={() => toggle(position.id)} />
              {position.name}
              {positionBelongsToDepartment(position, selectedDepartment) ? <small>Service principal</small> : null}
            </label>
          ))}
        </div>
      </div>
    ) : null}
  </div>;
}

type TabProps = { form: HrCollaboratorPayload; set: <K extends keyof HrCollaboratorPayload>(key: K, value: HrCollaboratorPayload[K]) => void };

function TabPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <section className="hr-tab-panel"><h3>{icon}{title}</h3>{children}</section>; }
function DataTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) { return <div className="hr-data-table"><strong>{title}</strong>{rows.length ? <table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table> : <p className="muted">{empty}</p>}</div>; }
function InfoRow({ label, value }: { label: string; value?: string | null }) { return <div><span>{label}</span><strong>{value || '-'}</strong></div>; }
function RequiredFieldError({ message, children }: { message?: string; children: React.ReactNode }) {
  return <div className="hr-field-error-shell">{children}{message ? <small className="hr-field-error-message">{message}</small> : null}</div>;
}

function validateRequiredFields(form: HrCollaboratorPayload) {
  const errors: RequiredFieldErrors = {};
  if (!form.firstName.trim()) errors.firstName = 'Prénom obligatoire';
  if (!form.lastName.trim()) errors.lastName = 'Nom obligatoire';
  if (!form.departmentId) errors.departmentId = 'Service principal obligatoire';
  if (!form.positionId) errors.positionId = 'Poste principal obligatoire';
  return errors;
}

function validate(form: HrCollaboratorPayload) { const errors: Partial<Record<TabId, string>> = {}; if (!form.firstName.trim() || !form.lastName.trim()) errors.profile = 'Prénom et nom obligatoires'; if (!form.hireDate || !form.departmentId || !form.positionId) errors.professional = 'Champs professionnels obligatoires'; return errors; }
function isRequiredField(key: keyof HrCollaboratorPayload): key is RequiredFieldId { return key === 'firstName' || key === 'lastName' || key === 'departmentId' || key === 'positionId'; }
function cleanPayload(form: HrCollaboratorPayload): HrCollaboratorPayload {
  return {
    ...form,
    email: form.email || undefined,
    phone: form.phone || undefined,
    address: form.address || undefined,
    postalCode: form.postalCode || undefined,
    city: form.city || undefined,
    country: form.country || undefined,
    primaryLanguage: form.primaryLanguage || undefined,
    secondaryLanguage: form.secondaryLanguage || undefined,
    emergencyContact: form.emergencyContact || undefined,
    birthDate: form.birthDate || undefined,
    personalIdentityNumber: form.personalIdentityNumber || undefined,
    siteId: form.siteId || undefined,
    employeeNumber: form.employeeNumber || undefined,
    notes: form.notes || undefined,
    userId: form.userId || undefined,
    managerId: form.managerId || undefined,
    secondaryPositionIds: validUuidList(form.secondaryPositionIds ?? []).length ? validUuidList(form.secondaryPositionIds ?? []) : undefined,
    secondarySiteIds: form.secondarySiteIds?.length ? form.secondarySiteIds : undefined,
    contractType: form.contractType || undefined,
    contractEndDate: form.contractEndDate || undefined,
    trialEndDate: form.trialEndDate || undefined,
    contractWeeklyMinutes: form.contractWeeklyMinutes ?? undefined,
    hourlyRate: form.hourlyRate ?? undefined,
    currency: form.currency || undefined,
    rateEffectiveDate: form.rateEffectiveDate || undefined,
    nextReviewDate: form.nextReviewDate || undefined,
    reviewFrequency: form.reviewFrequency || undefined,
    trainingNames: form.trainingNames,
  };
}
function positionBelongsToDepartment(position: HrPosition, department?: HrDepartment) { if (!department) return false; if (position.departmentId) return position.departmentId === department.id; const catalog = HR_CATALOG.find((item) => normalizeLabel(item.name) === normalizeLabel(department.name)); return Boolean(catalog?.positions.some((name) => normalizeLabel(name) === normalizeLabel(position.name))); }
function displayUser(user: Pick<CoreUser, 'firstName' | 'lastName' | 'email'>) { return `${`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email} - ${user.email}`; }
function fullName(item: { firstName?: string | null; lastName?: string | null }) { return `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'Collaborateur'; }
function isArchived(item: { isArchived?: boolean; archivedAt?: string | null }) { return Boolean(item.isArchived || item.archivedAt); }
function normalizeLabel(value?: string | null) { return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function cleanLegacyHrNotes(value?: string | null) { return value && /Documents PDF à joindre|Documents PDF a joindre|Formations:/i.test(value) ? '' : value ?? ''; }
function toInputDate(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(value)) : '-'; }
function formatMinutes(value?: number | null) { if (value == null) return '-'; const hours = Math.floor(value / 60); const minutes = Math.round(value % 60); return `${hours}h${minutes.toString().padStart(2, '0')}`; }
function hoursInputValue(minutes?: number | null) {
  if (minutes == null) return '';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(hours).replace('.', ',');
}
function parseHoursInput(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const hours = Number(normalized);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}
function formatBytes(value?: number | null) { if (!value) return '-'; if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`; return `${(value / 1024 / 1024).toFixed(1)} Mo`; }
function fileKey(file: File) { return `${file.name}:${file.size}:${file.lastModified}`; }
function hrDocumentCategoryLabel(value?: string | null) {
  const labels: Record<string, string> = { CONTRACT: 'Contrat', AMENDMENT: 'Avenant', CERTIFICATION: 'Formation / certification', DIPLOMA: 'Diplôme', IDENTITY: 'Identité', ADMINISTRATIVE: 'CV / administratif', OTHER: 'Autre' };
  return labels[value ?? 'OTHER'] ?? value ?? 'Autre';
}
