-- Adds an admin-only deletion operation. Existing conversations are unchanged
-- until an administrator explicitly confirms deletion in Messages.
begin;
create table if not exists public.chat_image_cleanup (
 object_path text primary key,
 conversation_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.chat_image_cleanup enable row level security;
revoke all on public.chat_image_cleanup from public, anon, authenticated;
grant all on public.chat_image_cleanup to service_role;

create or replace function public.lnr_chat_delete_conversation(p_user uuid,p_conversation uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c public.chat_conversations%rowtype;
begin
 perform public.lnr_chat_actor(p_user,true);
 select * into c from public.chat_conversations where id=p_conversation for update;
 if c.id is not null then
  insert into public.chat_image_cleanup(object_path,conversation_id)
   select object_path,conversation_id from public.chat_attachments where conversation_id=c.id
   on conflict(object_path)do nothing;
  delete from public.chat_messages where conversation_id=c.id;
  delete from public.chat_attachments where conversation_id=c.id;
  delete from public.chat_conversations where id=c.id;
 end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.lnr_chat_delete_conversation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lnr_chat_delete_conversation(uuid,uuid) to service_role;
commit;
