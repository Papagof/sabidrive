-- Bug fix: 0041_audit_log.sql's audit_log.school_id was created without
-- "on delete cascade" -- the only references(schools(id)) in the whole
-- schema missing it (every other table cascades or sets null). This silently
-- blocked school deletion (409) whenever any audit-logged action had
-- happened for that school, which in turn blocked the driver/admin profile
-- deletions that a successful school-cascade would otherwise have freed up.
-- Caught live while wiping the database back to empty.

alter table public.audit_log drop constraint audit_log_school_id_fkey;
alter table public.audit_log
  add constraint audit_log_school_id_fkey
  foreign key (school_id) references public.schools(id) on delete cascade;
