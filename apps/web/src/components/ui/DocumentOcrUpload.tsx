import { useState } from 'react';
import { AlertCircle, FileText, X } from 'lucide-react';

type Props = {
  onUpload: (files: File[]) => Promise<void>;
  maxFiles: number;
  maxSizeBytes?: number;
  acceptedFormats: string;
  accept?: string;
  submitLabel?: (count: number) => string;
};

export function DocumentOcrUpload({
  onUpload,
  maxFiles,
  maxSizeBytes,
  acceptedFormats,
  accept = 'application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif',
  submitLabel = () => 'Lancer l’analyse OCR',
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const select = (next: File[]) => {
    const selected = next.slice(0, maxFiles);
    const oversized = selected.find((file) => maxSizeBytes && file.size > maxSizeBytes);
    if (oversized) {
      setFiles([]);
      setError(`${oversized.name} dépasse la limite de ${formatBytes(maxSizeBytes!)}.`);
      return;
    }
    setError(next.length > maxFiles ? `${maxFiles} fichiers maximum.` : undefined);
    setFiles(selected);
  };

  const submit = async () => {
    if (!files.length) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onUpload(files);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le document n’a pas pu être analysé.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stocks-ocr-import">
      {error && <div className="alert-modern error"><AlertCircle size={16} /> {error}</div>}
      <label
        className="stocks-ocr-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          select(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        <FileText size={32} />
        <span>Déposer vos documents ici ou cliquer pour parcourir</span>
        <small>{acceptedFormats} · {maxFiles} fichiers maximum</small>
        <input
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          onChange={(event) => select(Array.from(event.target.files ?? []))}
        />
      </label>
      {files.length > 0 && (
        <div className="stocks-ocr-selection">
          <strong>Fichiers prêts pour l’analyse ({files.length})</strong>
          <div className="stocks-ocr-file-list">
            {files.map((file, index) => (
              <div key={`${file.name}-${file.size}-${index}`} className="stocks-ocr-file-row">
                <FileText size={18} />
                <div className="stocks-ocr-file-row-details">
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)} · {fileTypeLabel(file)}</small>
                </div>
                <button
                  type="button"
                  className="stocks-ocr-file-remove"
                  aria-label={`Retirer ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, item) => item !== index))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="modal-footer stocks-ocr-upload-footer">
        <button className="btn btn-primary" disabled={!files.length || submitting} onClick={() => void submit()}>
          {submitting ? 'Analyse en cours…' : submitLabel(files.length)}
        </button>
      </div>
    </div>
  );
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 octet';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileTypeLabel(file: File) {
  return file.type === 'application/pdf'
    ? 'PDF'
    : file.type.split('/')[1]?.toUpperCase() || 'Document';
}
