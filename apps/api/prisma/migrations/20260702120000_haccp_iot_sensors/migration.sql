ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_DISCOVERED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_RENAMED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_UNASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_PAIRING_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'HACCP_SENSOR_PAIRING_STOPPED';

CREATE TYPE "IotSensorProvider" AS ENUM ('ZIGBEE2MQTT');
CREATE TYPE "IotSensorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');
CREATE TYPE "IotSensorType" AS ENUM ('TEMPERATURE', 'TEMPERATURE_HUMIDITY', 'HUMIDITY', 'GENERIC');
CREATE TYPE "IotSensorEventType" AS ENUM ('DISCOVERED', 'PAIRED', 'RENAMED', 'ASSIGNED', 'UNASSIGNED', 'REMOVED', 'OFFLINE', 'PROVIDER_ERROR', 'READING_UPDATED');
CREATE TYPE "IotPairingStatus" AS ENUM ('ACTIVE', 'STOPPED', 'EXPIRED');

CREATE TABLE "iot_sensors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "provider" "IotSensorProvider" NOT NULL,
  "externalId" TEXT NOT NULL,
  "ieeeAddress" TEXT,
  "manufacturer" TEXT,
  "model" TEXT,
  "friendlyName" TEXT,
  "userName" TEXT,
  "type" "IotSensorType" NOT NULL DEFAULT 'TEMPERATURE',
  "status" "IotSensorStatus" NOT NULL DEFAULT 'UNKNOWN',
  "battery" DECIMAL(5,2),
  "linkQuality" INTEGER,
  "lastSeenAt" TIMESTAMP(3),
  "currentTemperature" DECIMAL(7,2),
  "currentHumidity" DECIMAL(7,2),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "isRemoved" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "iot_sensors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iot_sensor_readings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "sensorId" UUID NOT NULL,
  "temperature" DECIMAL(7,2),
  "humidity" DECIMAL(7,2),
  "battery" DECIMAL(5,2),
  "linkQuality" INTEGER,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iot_sensor_readings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iot_sensor_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "sensorId" UUID NOT NULL,
  "haccpTemperatureEquipmentId" UUID NOT NULL,
  "assignedById" UUID,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassignedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "iot_sensor_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iot_sensor_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "sensorId" UUID,
  "actorUserId" UUID,
  "type" "IotSensorEventType" NOT NULL,
  "message" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iot_sensor_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iot_pairing_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "provider" "IotSensorProvider" NOT NULL,
  "status" "IotPairingStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stoppedAt" TIMESTAMP(3),
  "discoveredIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "iot_pairing_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iot_alert_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "sensorId" UUID,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "iot_alert_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iot_sensors_organizationId_provider_externalId_key" ON "iot_sensors"("organizationId", "provider", "externalId");
CREATE UNIQUE INDEX "iot_sensors_organizationId_provider_ieeeAddress_key" ON "iot_sensors"("organizationId", "provider", "ieeeAddress");
CREATE INDEX "iot_sensors_organizationId_idx" ON "iot_sensors"("organizationId");
CREATE INDEX "iot_sensors_provider_idx" ON "iot_sensors"("provider");
CREATE INDEX "iot_sensors_status_idx" ON "iot_sensors"("status");
CREATE INDEX "iot_sensors_type_idx" ON "iot_sensors"("type");
CREATE INDEX "iot_sensors_lastSeenAt_idx" ON "iot_sensors"("lastSeenAt");
CREATE INDEX "iot_sensors_isRemoved_idx" ON "iot_sensors"("isRemoved");

CREATE INDEX "iot_sensor_readings_organizationId_idx" ON "iot_sensor_readings"("organizationId");
CREATE INDEX "iot_sensor_readings_sensorId_idx" ON "iot_sensor_readings"("sensorId");
CREATE INDEX "iot_sensor_readings_measuredAt_idx" ON "iot_sensor_readings"("measuredAt");

CREATE INDEX "iot_sensor_assignments_organizationId_idx" ON "iot_sensor_assignments"("organizationId");
CREATE INDEX "iot_sensor_assignments_sensorId_idx" ON "iot_sensor_assignments"("sensorId");
CREATE INDEX "iot_sensor_assignments_haccpTemperatureEquipmentId_idx" ON "iot_sensor_assignments"("haccpTemperatureEquipmentId");
CREATE INDEX "iot_sensor_assignments_assignedAt_idx" ON "iot_sensor_assignments"("assignedAt");
CREATE INDEX "iot_sensor_assignments_unassignedAt_idx" ON "iot_sensor_assignments"("unassignedAt");
CREATE UNIQUE INDEX "iot_sensor_assignments_active_sensor_key" ON "iot_sensor_assignments"("sensorId") WHERE "unassignedAt" IS NULL;

CREATE INDEX "iot_sensor_events_organizationId_idx" ON "iot_sensor_events"("organizationId");
CREATE INDEX "iot_sensor_events_sensorId_idx" ON "iot_sensor_events"("sensorId");
CREATE INDEX "iot_sensor_events_actorUserId_idx" ON "iot_sensor_events"("actorUserId");
CREATE INDEX "iot_sensor_events_type_idx" ON "iot_sensor_events"("type");
CREATE INDEX "iot_sensor_events_createdAt_idx" ON "iot_sensor_events"("createdAt");

CREATE INDEX "iot_pairing_sessions_organizationId_idx" ON "iot_pairing_sessions"("organizationId");
CREATE INDEX "iot_pairing_sessions_provider_idx" ON "iot_pairing_sessions"("provider");
CREATE INDEX "iot_pairing_sessions_status_idx" ON "iot_pairing_sessions"("status");
CREATE INDEX "iot_pairing_sessions_expiresAt_idx" ON "iot_pairing_sessions"("expiresAt");

CREATE INDEX "iot_alert_events_organizationId_idx" ON "iot_alert_events"("organizationId");
CREATE INDEX "iot_alert_events_sensorId_idx" ON "iot_alert_events"("sensorId");
CREATE INDEX "iot_alert_events_type_idx" ON "iot_alert_events"("type");
CREATE INDEX "iot_alert_events_severity_idx" ON "iot_alert_events"("severity");
CREATE INDEX "iot_alert_events_status_idx" ON "iot_alert_events"("status");
CREATE INDEX "iot_alert_events_detectedAt_idx" ON "iot_alert_events"("detectedAt");

ALTER TABLE "iot_sensors" ADD CONSTRAINT "iot_sensors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_readings" ADD CONSTRAINT "iot_sensor_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_readings" ADD CONSTRAINT "iot_sensor_readings_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "iot_sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_assignments" ADD CONSTRAINT "iot_sensor_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_assignments" ADD CONSTRAINT "iot_sensor_assignments_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "iot_sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_assignments" ADD CONSTRAINT "iot_sensor_assignments_haccpTemperatureEquipmentId_fkey" FOREIGN KEY ("haccpTemperatureEquipmentId") REFERENCES "haccp_temperature_equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_assignments" ADD CONSTRAINT "iot_sensor_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_events" ADD CONSTRAINT "iot_sensor_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_events" ADD CONSTRAINT "iot_sensor_events_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "iot_sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_sensor_events" ADD CONSTRAINT "iot_sensor_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "iot_pairing_sessions" ADD CONSTRAINT "iot_pairing_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_alert_events" ADD CONSTRAINT "iot_alert_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_alert_events" ADD CONSTRAINT "iot_alert_events_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "iot_sensors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
