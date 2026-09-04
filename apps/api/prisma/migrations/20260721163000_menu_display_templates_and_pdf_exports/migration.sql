CREATE TABLE "menu_display_templates" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdById" UUID,
  "name" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "pageCount" INTEGER,
  "ocrText" TEXT,
  "layout" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_display_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "menu_display_templates_organizationId_idx" ON "menu_display_templates"("organizationId");
CREATE INDEX "menu_display_templates_isArchived_idx" ON "menu_display_templates"("isArchived");
CREATE INDEX "menu_display_templates_isDefault_idx" ON "menu_display_templates"("isDefault");

ALTER TABLE "menu_display_templates"
  ADD CONSTRAINT "menu_display_templates_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_exports" ADD COLUMN "templateId" UUID;
CREATE INDEX "menu_exports_templateId_idx" ON "menu_exports"("templateId");
ALTER TABLE "menu_exports"
  ADD CONSTRAINT "menu_exports_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "menu_display_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
