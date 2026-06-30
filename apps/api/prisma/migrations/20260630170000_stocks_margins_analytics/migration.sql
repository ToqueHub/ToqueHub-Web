CREATE TYPE "MarginAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "MarginAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "MarginAlertType" AS ENUM ('PRICE_INCREASE', 'PRICE_ANOMALY', 'QUANTITY_ANOMALY', 'VAT_ANOMALY', 'UNIT_CHANGE', 'MISSING_LOT', 'UNKNOWN_PRODUCT', 'UNUSUAL_SUPPLIER', 'RNM_GAP', 'TECHNICAL_SHEET_IMPACT');
CREATE TYPE "MarginReportType" AS ENUM ('AUTOMATIC_SUMMARY', 'AI_MANAGEMENT');

CREATE TABLE "margin_settings" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "priceIncreaseThresholdPct" DECIMAL(6,2) NOT NULL DEFAULT 10,
  "anomalyThresholdPct" DECIMAL(6,2) NOT NULL DEFAULT 35,
  "quantityAnomalyThresholdPct" DECIMAL(6,2) NOT NULL DEFAULT 60,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "margin_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "margin_alerts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "MarginAlertType" NOT NULL,
  "severity" "MarginAlertSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "MarginAlertStatus" NOT NULL DEFAULT 'OPEN',
  "priority" INTEGER NOT NULL DEFAULT 2,
  "title" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "productId" UUID,
  "supplierId" UUID,
  "stockReceptionLineId" UUID,
  "currentValue" DECIMAL(12,4),
  "referenceValue" DECIMAL(12,4),
  "variationPct" DECIMAL(8,2),
  "metadata" JSONB,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "margin_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "margin_reports" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "MarginReportType" NOT NULL DEFAULT 'AUTOMATIC_SUMMARY',
  "title" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "summary" TEXT NOT NULL,
  "insights" JSONB NOT NULL,
  "metrics" JSONB,
  "exportedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "margin_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "margin_settings_organizationId_key" ON "margin_settings"("organizationId");
CREATE INDEX "margin_settings_organizationId_idx" ON "margin_settings"("organizationId");
CREATE INDEX "margin_alerts_organizationId_idx" ON "margin_alerts"("organizationId");
CREATE INDEX "margin_alerts_type_idx" ON "margin_alerts"("type");
CREATE INDEX "margin_alerts_status_idx" ON "margin_alerts"("status");
CREATE INDEX "margin_alerts_severity_idx" ON "margin_alerts"("severity");
CREATE INDEX "margin_alerts_productId_idx" ON "margin_alerts"("productId");
CREATE INDEX "margin_alerts_supplierId_idx" ON "margin_alerts"("supplierId");
CREATE INDEX "margin_alerts_stockReceptionLineId_idx" ON "margin_alerts"("stockReceptionLineId");
CREATE INDEX "margin_alerts_detectedAt_idx" ON "margin_alerts"("detectedAt");
CREATE INDEX "margin_reports_organizationId_idx" ON "margin_reports"("organizationId");
CREATE INDEX "margin_reports_type_idx" ON "margin_reports"("type");
CREATE INDEX "margin_reports_createdAt_idx" ON "margin_reports"("createdAt");

ALTER TABLE "margin_settings" ADD CONSTRAINT "margin_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_stockReceptionLineId_fkey" FOREIGN KEY ("stockReceptionLineId") REFERENCES "stock_reception_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_reports" ADD CONSTRAINT "margin_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "margin_reports" ADD CONSTRAINT "margin_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
