-- CreateIndex
CREATE INDEX "haccp_temp_org_deleted_date_idx" ON "haccp_temperature_readings"("organizationId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "haccp_reception_org_deleted_date_idx" ON "haccp_receptions"("organizationId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "haccp_trace_org_deleted_date_idx" ON "haccp_traceability"("organizationId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "haccp_process_org_deleted_type_date_idx" ON "haccp_process_sessions"("organizationId", "deletedAt", "type", "sessionDate");

-- CreateIndex
CREATE INDEX "haccp_oil_org_deleted_date_idx" ON "haccp_oil_sessions"("organizationId", "deletedAt", "sessionDate");

-- CreateIndex
CREATE INDEX "haccp_clean_surface_org_deleted_active_idx" ON "haccp_cleaning_surfaces"("organizationId", "deletedAt", "isActive");

-- CreateIndex
CREATE INDEX "haccp_clean_session_org_deleted_date_idx" ON "haccp_cleaning_sessions"("organizationId", "deletedAt", "sessionDate");

-- CreateIndex
CREATE INDEX "haccp_clean_session_org_deleted_status_idx" ON "haccp_cleaning_sessions"("organizationId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "haccp_prod_org_deleted_date_idx" ON "haccp_production_sessions"("organizationId", "deletedAt", "productionDate");

-- CreateIndex
CREATE INDEX "haccp_report_org_deleted_date_idx" ON "haccp_daily_reports"("organizationId", "deletedAt", "reportDate");
