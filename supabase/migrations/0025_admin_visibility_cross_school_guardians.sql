-- Bug found via live use: linking a cross-school guardian
-- (0024_cross_role_guardians.sql) works -- the guardian_student_links row
-- is created and the parent correctly sees the child -- but the ADMIN who
-- linked them couldn't see the guardian's *name* on the Students page.
-- profiles_select_admin_school (0003_rls_policies.sql) only lets an admin
-- read profiles belonging to their own school, and a cross-school
-- guardian's profiles.school_id still points to whichever school they
-- were originally invited from, not the school that just linked them. The
-- embedded profiles:guardian_id(full_name) select in getSchoolStudents
-- silently returns null for a row RLS blocks (no error), so the guardian
-- just disappeared from the "Guardians:" list instead of showing.
create policy "profiles_select_admin_of_linked_student" on public.profiles
  for select using (
    public.current_role() = 'admin'
    and id in (
      select gsl.guardian_id from public.guardian_student_links gsl
      join public.students s on s.id = gsl.student_id
      where s.school_id = public.current_school_id()
    )
  );
