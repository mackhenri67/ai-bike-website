-- Replace ONLY the email value on this line with your existing administrator email.
do $$ declare admin_email text := 'mackhenriregalado@gmail.com';target_id uuid;
begin
 if position('@' in admin_email)<2 then raise exception 'Enter your administrator email first.';end if;
 select id into strict target_id from auth.users where lower(email)=lower(trim(admin_email));
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"role":"admin"}'::jsonb where id=target_id;
 raise notice 'Admin role granted to %. Sign out and sign in again.',admin_email;
exception when no_data_found then raise exception 'No Auth account found for %.',admin_email;
when too_many_rows then raise exception 'Multiple users match %. Select the correct user by UUID.',admin_email;
end;$$;
