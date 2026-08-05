import { ArrowRight, Download } from 'lucide-react';
import type { StocksOcrStatus } from '../../types';
import { DocumentOcrUpload } from './DocumentOcrUpload';

export function DocumentOcrAnalysisPanel({
  statuses,
  maxFiles,
  maxSizeBytes,
  acceptedFormats,
  accept,
  submitLabel,
  onUpload,
  onOpenExtraction,
  onDownload,
  heading = 'Suivi des analyses',
  verifyLabel = 'Vérifier',
  busy = false,
}: {
  statuses: StocksOcrStatus[];
  maxFiles: number;
  maxSizeBytes?: number;
  acceptedFormats: string;
  accept?: string;
  submitLabel?: (count: number) => string;
  onUpload: (files: File[]) => Promise<void>;
  onOpenExtraction: (extractionId: string) => Promise<void>;
  onDownload?: (documentId: string, filename: string) => Promise<void>;
  heading?: string;
  verifyLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="stocks-ocr-import">
      <DocumentOcrUpload
        maxFiles={maxFiles}
        maxSizeBytes={maxSizeBytes}
        acceptedFormats={acceptedFormats}
        accept={accept}
        submitLabel={submitLabel}
        onUpload={onUpload}
      />
      {statuses.length ? (
        <div className="ocr-analysis-results">
          <div className="ocr-analysis-heading">
            {heading} ({statuses.length})
          </div>
          <div className="ocr-statuses-list">
            {statuses.map((status) => {
              const state = status.state.toLowerCase();
              const isError = state.includes('err') || state === 'failed';
              const isSuccess = state === 'vérifier' || Boolean(status.extraction);
              const isAnalyzing = state === 'analyse' || state === 'en cours';
              const isPending = state === 'en attente' || state === 'pending';
              const fillClass = isError
                ? 'error'
                : isSuccess
                  ? 'success'
                  : isAnalyzing
                    ? 'analyzing'
                    : isPending
                      ? 'pending'
                      : 'uploading';
              const stateText = isError
                ? status.ocr?.errorMessage || 'Erreur d’analyse'
                : isSuccess
                  ? 'Prêt à vérifier'
                  : isAnalyzing
                    ? 'Extraction Mistral AI…'
                    : isPending
                      ? 'Dans la file d’attente'
                      : 'Téléchargement…';
              return (
                <div
                  key={status.document.id}
                  className="ocr-status-card"
                  style={isSuccess ? { borderLeft: '3px solid #10b981' } : undefined}
                >
                  <div className="ocr-status-card-info">
                    <span className="ocr-status-card-title">{statusTitle(status)}</span>
                    <div className="ocr-status-card-meta">
                      <span>{formatBytes(status.document.sizeBytes)}</span>
                      <span>•</span>
                      <span
                        style={{
                          color: isError
                            ? 'var(--danger)'
                            : isSuccess
                              ? 'var(--success)'
                              : 'var(--text-muted)',
                          fontWeight: isSuccess || isError ? 700 : undefined,
                        }}
                      >
                        {stateText}
                      </span>
                    </div>
                    <div className="ocr-status-progress-bar">
                      <div className={`ocr-status-progress-fill ${fillClass}`} />
                    </div>
                  </div>
                  <div className="ocr-status-card-actions">
                    {status.extraction ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => void onOpenExtraction(status.extraction!.id)}
                      >
                        {verifyLabel} <ArrowRight size={12} />
                      </button>
                    ) : null}
                    {onDownload ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          void onDownload(status.document.id, status.document.originalName)
                        }
                      >
                        <Download size={12} /> Original
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusTitle(status: StocksOcrStatus) {
  const data =
    status.extraction?.correctedJson ??
    status.extraction?.extractedJson ??
    status.ocr?.extractions?.[0]?.correctedJson ??
    status.ocr?.extractions?.[0]?.extractedJson;
  const supplierName = data?.supplierName ?? data?.supplier?.supplierName ?? data?.supplier?.name;
  return supplierName && status.extraction ? supplierName : status.document.originalName;
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}
