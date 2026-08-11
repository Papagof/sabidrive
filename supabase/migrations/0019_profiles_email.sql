-- Denormalized copy of auth.users.email onto profiles, so the client can
-- display/search it (admin Staff page, dropdowns) without needing access to
-- the auth schema, which PostgREST doesn't expose.
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, school_id, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'parent'),
    nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid,
    new.raw_user_meta_data ->> 'phone',
    new.email
  );
  return new;
end;
$$;
