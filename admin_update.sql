
-- Add is_admin column to profiles
alter table profiles add column is_admin boolean default false;

-- Policy for Admins to view all profiles
create policy "Admins can view all profiles." on profiles for select using (
  exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  )
);

-- Policy for Admins to delete any product
create policy "Admins can delete any product." on products for delete using (
  exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  )
);

-- Policy for Admins to delete any chat
create policy "Admins can delete any chat." on chats for delete using (
  exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  )
);

-- Function to make a specific user admin (Helper for you to run manually)
-- Usage: select make_admin('user_uuid_here');
create or replace function make_admin(user_id uuid)
returns void as $$
begin
  update profiles set is_admin = true where id = user_id;
end;
$$ language plpgsql security definer;
