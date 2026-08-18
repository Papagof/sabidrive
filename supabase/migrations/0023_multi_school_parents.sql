-- Lets a parent whose children attend different schools use one account for
-- both, instead of a separate login per school. Supabase Auth requires
-- email to be globally unique, so the fix isn't "allow duplicate
-- registration" -- it's letting a second school's admin attach an existing
-- account as a guardian of one of *their* students (apps/admin's new
-- find-guardian-by-email route + the existing linkGuardianToStudent, which
-- already passes gsl_admin_crud since that policy only checks the
-- student's school, not the guardian's).
--
-- The parent-facing read path (trips/buses/routes/stops/students) was
-- already scoped via guardian_student_links -> students.school_id, not
-- profiles.school_id, so it needed no changes. Two things did assume one
-- school per parent:

-- 1) Announcement fan-out selected recipients by profiles.school_id, so a
-- parent's fixed "home" school_id would never receive a second school's
-- announcements. Route through actual guardianship instead.
create or replace function public.create_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_announcement_id uuid;
begin
  if public.current_role() <> 'admin' then
    raise exception 'only an admin can create announcements';
  end if;
  v_school_id := public.current_school_id();

  insert into public.announcements (school_id, title, body, created_by)
  values (v_school_id, p_title, p_body, auth.uid())
  returning id into v_announcement_id;

  insert into public.notifications (recipient_id, type, title, body)
  select distinct p.id, 'announcement', p_title, p_body
  from public.profiles p
  join public.guardian_student_links gsl on gsl.guardian_id = p.id
  join public.students s on s.id = gsl.student_id
  where s.school_id = v_school_id and p.role = 'parent';

  return v_announcement_id;
end;
$$;

-- 2) No policy let a parent read a schools row outside their own
-- profiles.school_id, so even though they could already read a second
-- school's students/buses/routes, they couldn't look up its name to label
-- it in the UI.
create policy "schools_select_parent_of_child" on public.schools
  for select using (
    exists (
      select 1 from public.students s
      join public.guardian_student_links gsl on gsl.student_id = s.id
      where s.school_id = schools.id and gsl.guardian_id = auth.uid()
    )
  );
