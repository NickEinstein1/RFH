-- Sprint 2: FORCE ROW LEVEL SECURITY on tenant-owned tables.
-- app.tenant_id is set per request transaction; app.bypass_rls='on' for auth/cron.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Tenant',
    'User',
    'Resident',
    'FamilyResidentLink',
    'MedicationOrder',
    'MedAdministration',
    'MedAlert',
    'ProgressNote',
    'CarePlan',
    'CareTask',
    'TaskCompletion',
    'StaffCredential',
    'CredentialAlert',
    'AuditLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_tenant ON %I', t);
  END LOOP;
END $$;

-- Tenant table: match by id
CREATE POLICY tenant_isolation_tenant ON "Tenant"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "User"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "Resident"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "FamilyResidentLink"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedicationOrder"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedAdministration"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedAlert"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "ProgressNote"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CarePlan"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CareTask"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "TaskCompletion"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "StaffCredential"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CredentialAlert"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

-- RefreshToken has no tenantId; scoped via user join. Allow when bypass or owning user in tenant.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_token_access ON "RefreshToken";
CREATE POLICY refresh_token_access ON "RefreshToken"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "RefreshToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "RefreshToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  );
