# YurCore Supabase RLS Policy Guide

YurCore uses PostgreSQL Row-Level Security (RLS) to enforce data access isolation directly at the database engine level. This guide documents the recommended SQL scripts to implement these policies.

---

## 1. Profiles Table Policies

The `profiles` or `users` table holds user account mapping.

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own account profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Allow users to update their own account profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles" ON users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );
```

---

## 2. Health Records Table Policies

Medical records contain sensitive health history data and must be restricted to the owner patient and the assigned practitioner.

```sql
-- Enable RLS
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

-- Allow patients to read their own health records
CREATE POLICY "Patients can view own records" ON health_records
  FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
  );

-- Allow doctors to read health records of patients they have appointments with
CREATE POLICY "Assigned doctors can view patient records" ON health_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.patient_id = health_records.patient_id
        AND appointments.practitioner_id = auth.uid()
    )
  );
```

---

## 3. Prescriptions Table Policies

```sql
-- Enable RLS
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Allow patients to read their own prescriptions
CREATE POLICY "Patients can view own prescriptions" ON prescriptions
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

-- Allow doctors to insert prescriptions
CREATE POLICY "Doctors can create prescriptions" ON prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'doctor'
    )
  );
```

---

## 4. Audit Logs Table Policies

Audit logs are insert-only and read-restricted to administrators.

```sql
-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Prevent all users from modifying logs
CREATE POLICY "Audit logs are read-only" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Allow system processes (via admin client) to write logs
-- (Supabase service-role automatically bypasses RLS rules, no select/write policies needed for guest/patients)
```
