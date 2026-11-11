-- Private image attachments. Requires 0017; existing chats are retained.
begin;
create table if not exists public.chat_attachments(
 id uuid primary key,conversation_id uuid not null references public.chat_conversations(id)on delete cascade,
 owner_user_id uuid not null references auth.users(id),object_path text not null unique,
 mime_type text not null check(mime_type in('image/png','image/jpeg','image/webp')),
 byte_size integer not null check(byte_size between 1 and 3145728),
 file_name text not null check(length(file_name)between 1 and 120),ready boolean not null default false,
 discarded boolean not null default false,created_at timestamptz not null default now()
);
alter table public.chat_attachments enable row level security;
revoke all on public.chat_attachments from public,anon,authenticated;
grant all on public.chat_attachments to service_role;
create index if not exists chat_attachments_owner_time_idx on public.chat_attachments(owner_user_id,created_at);
alter table public.chat_messages add column if not exists attachment_id uuid unique references public.chat_attachments(id);
-- Replace the text-only check with a text-or-image check. No rows are removed.
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_text_or_image_check;
alter table public.chat_messages add constraint chat_messages_text_or_image_check check(char_length(btrim(body))<=2000 and(char_length(btrim(body))>0 or attachment_id is not null));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('chat-images','chat-images',false,3145728,array['image/png','image/jpeg','image/webp'])
 on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists lnr_chat_images_private_guard on storage.objects;
create policy lnr_chat_images_private_guard on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'chat-images')with check(bucket_id<>'chat-images');

create or replace function public.lnr_chat_prepare_image(p_user uuid,p_admin boolean,p_conversation uuid,p_image uuid,p_mime text,p_size integer,p_name text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;c public.chat_conversations%rowtype;a public.chat_attachments%rowtype;ext text;
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);
 if p_image is null or p_mime is null or p_mime not in('image/png','image/jpeg','image/webp')or p_size is null or p_size not between 1 and 3145728 then raise exception 'Choose a PNG, JPG or WebP image up to 3MB.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,17));
 if p_admin then select * into c from public.chat_conversations where id=p_conversation for update;
 else
  if p_conversation is not null and not exists(select 1 from public.chat_conversations where id=p_conversation and customer_id=cid)then raise exception 'Conversation not available.';end if;
  insert into public.chat_conversations(customer_id)values(cid)on conflict(customer_id)do update set customer_id=excluded.customer_id returning * into c;
 end if;
 if c.id is null then raise exception 'Conversation not available.';end if;
 select * into a from public.chat_attachments where id=p_image for update;
 if found then
  if a.owner_user_id<>p_user or a.conversation_id<>c.id or a.mime_type<>p_mime or a.byte_size<>p_size or a.discarded or exists(select 1 from public.chat_messages where attachment_id=a.id)then raise exception 'Image upload not available.';end if;
 else
  if(select count(*)from public.chat_attachments where owner_user_id=p_user and created_at>now()-interval '10 minutes')>=20 then raise exception 'Too many image uploads. Please wait a few minutes and try again.';end if;
  ext:=case p_mime when 'image/png'then'png'when'image/webp'then'webp'else'jpg'end;
  insert into public.chat_attachments(id,conversation_id,owner_user_id,object_path,mime_type,byte_size,file_name)values(p_image,c.id,p_user,p_user::text||'/'||c.id::text||'/'||p_image::text||'.'||ext,p_mime,p_size,left(coalesce(nullif(trim(p_name),''),'Chat image'),120))returning * into a;
 end if;
 return jsonb_build_object('id',a.id,'conversation_id',a.conversation_id,'path',a.object_path,'ready',a.ready);
end;$$;
create or replace function public.lnr_chat_finish_image(p_user uuid,p_admin boolean,p_image uuid)returns void language plpgsql set search_path=public,pg_temp as $$
declare a public.chat_attachments%rowtype;
begin
 perform public.lnr_chat_actor(p_user,p_admin);select * into a from public.chat_attachments where id=p_image for update;
 if a.id is null or a.owner_user_id<>p_user or a.discarded then raise exception 'Image upload not available.';end if;
 if not exists(select 1 from storage.objects where bucket_id='chat-images'and name=a.object_path)then raise exception 'Image upload not found. Please try again.';end if;
 update public.chat_attachments set ready=true where id=a.id;
end;$$;
create or replace function public.lnr_chat_discard_image(p_user uuid,p_admin boolean,p_image uuid)returns text language plpgsql set search_path=public,pg_temp as $$
declare a public.chat_attachments%rowtype;
begin
 perform public.lnr_chat_actor(p_user,p_admin);select * into a from public.chat_attachments where id=p_image for update;
 if a.id is null then return null;end if;
 if a.owner_user_id<>p_user then raise exception 'Image upload not available.';end if;
 if exists(select 1 from public.chat_messages where attachment_id=a.id)then raise exception 'An image already sent cannot be removed from this upload.';end if;
 update public.chat_attachments set discarded=true,ready=false where id=a.id;return a.object_path;
end;$$;
create or replace function public.lnr_chat_image(p_user uuid,p_admin boolean,p_image uuid)returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;a public.chat_attachments%rowtype;c public.chat_conversations%rowtype;
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);select * into a from public.chat_attachments where id=p_image and ready and not discarded;
 select * into c from public.chat_conversations where id=a.conversation_id;
 if a.id is null or c.id is null or(not p_admin and c.customer_id<>cid)or(a.owner_user_id<>p_user and not exists(select 1 from public.chat_messages where attachment_id=a.id))then raise exception 'Image not available.';end if;
 return jsonb_build_object('path',a.object_path,'mime_type',a.mime_type,'file_name',a.file_name);
end;$$;
create or replace function public.lnr_chat_message_json(m public.chat_messages)returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id::text,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at,'client_id',m.client_id,'image',(select jsonb_build_object('id',a.id,'name',a.file_name,'mime_type',a.mime_type,'byte_size',a.byte_size)from public.chat_attachments a where a.id=m.attachment_id and a.ready and not a.discarded));
$$;
create or replace function public.lnr_chat_send_with_image(p_user uuid,p_admin boolean,p_conversation uuid,p_body text,p_client uuid,p_image uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;c public.chat_conversations%rowtype;m public.chat_messages%rowtype;a public.chat_attachments%rowtype;body_value text:=btrim(coalesce(p_body,''));
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);
 if p_client is null or length(body_value)>2000 or(length(body_value)=0 and p_image is null)then raise exception 'Enter a message or choose an image.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,17));
 if p_admin then select * into c from public.chat_conversations where id=p_conversation for update;
 else
  if p_conversation is not null and not exists(select 1 from public.chat_conversations where id=p_conversation and customer_id=cid)then raise exception 'Conversation not available.';end if;
  insert into public.chat_conversations(customer_id)values(cid)on conflict(customer_id)do update set customer_id=excluded.customer_id returning * into c;
 end if;
 if c.id is null then raise exception 'Conversation not available.';end if;
 select * into m from public.chat_messages where sender_user_id=p_user and client_id=p_client;
 if found then
  if m.conversation_id<>c.id or m.body<>body_value or m.attachment_id is distinct from p_image then raise exception 'Use a new reference for a different message.';end if;
 else
  if p_image is not null then
   select * into a from public.chat_attachments where id=p_image for update;
   if a.id is null or a.owner_user_id<>p_user or a.conversation_id<>c.id or not a.ready or a.discarded or exists(select 1 from public.chat_messages where attachment_id=p_image)then raise exception 'Image is not available for this conversation.';end if;
  end if;
  if(select count(*)from public.chat_messages where sender_user_id=p_user and created_at>now()-interval '1 minute')>=30 then raise exception 'Too many messages. Please wait a minute and try again.';end if;
  insert into public.chat_messages(conversation_id,sender_user_id,sender_role,body,client_id,attachment_id,created_at)values(c.id,p_user,case when p_admin then'admin'else'customer'end,body_value,p_client,p_image,clock_timestamp())returning * into m;
  update public.chat_conversations set last_message_id=m.id,last_message_at=m.created_at where id=c.id;
 end if;
 return jsonb_build_object('conversation_id',c.id,'message',public.lnr_chat_message_json(m));
end;$$;
create or replace function public.lnr_chat_send(p_user uuid,p_admin boolean,p_conversation uuid,p_body text,p_client uuid)returns jsonb language sql set search_path=public,pg_temp as $$select public.lnr_chat_send_with_image(p_user,p_admin,p_conversation,p_body,p_client,null);$$;
create or replace function public.lnr_chat_thread(
 p_user uuid,p_admin boolean,p_conversation uuid default null,p_before bigint default null
)returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;c public.chat_conversations%rowtype;messages jsonb;more boolean;unread integer;
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);
 if p_admin then select * into c from public.chat_conversations where id=p_conversation;
 else
  select * into c from public.chat_conversations where customer_id=cid;
  if p_conversation is not null and (c.id is null or c.id<>p_conversation) then raise exception 'Conversation not available.';end if;
 end if;
 if c.id is null then
  if p_admin then raise exception 'Conversation not available.';end if;
  return jsonb_build_object('conversation_id',null,'messages','[]'::jsonb,'has_more',false,'unread_count',0);
 end if;
 with page as (
  select * from public.chat_messages where conversation_id=c.id and (p_before is null or id<p_before) order by id desc limit 51
 ), visible as (select * from page order by id desc limit 50)
 select coalesce((select jsonb_agg(public.lnr_chat_message_json(visible::public.chat_messages) order by id) from visible),'[]'::jsonb),
  (select count(*)>50 from page) into messages,more;
 select count(*)::integer into unread from public.chat_messages
  where conversation_id=c.id and sender_role=case when p_admin then 'customer' else 'admin' end
  and id>case when p_admin then c.admin_last_read_id else c.customer_last_read_id end;
 return jsonb_build_object('conversation_id',c.id,'messages',messages,'has_more',more,'unread_count',unread);
end;$$;

create or replace function public.lnr_chat_inbox(
 p_user uuid,p_before_time timestamptz default null,p_before_id uuid default null,
 p_query text default '',p_summary boolean default false
) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare items jsonb;more boolean;unread integer;
begin
 perform public.lnr_chat_actor(p_user,true);
 if (p_before_time is null)<>(p_before_id is null) or length(coalesce(p_query,''))>80 then raise exception 'Invalid inbox filter.';end if;
 select count(*)::integer into unread from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id
  where m.sender_role='customer' and m.id>c.admin_last_read_id;
 if p_summary then return jsonb_build_object('unread_count',unread);end if;
 with page as (
  select c.*,u.full_name,u.email,m.body,m.sender_role from public.chat_conversations c
  join public.customers u on u.id=c.customer_id join public.chat_messages m on m.id=c.last_message_id
  where (p_before_time is null or (c.last_message_at,c.id)<(p_before_time,p_before_id))
   and (coalesce(p_query,'')='' or u.full_name ilike '%'||p_query||'%' or u.email ilike '%'||p_query||'%')
  order by c.last_message_at desc,c.id desc limit 31
 ),visible as(select * from page order by last_message_at desc,id desc limit 30)
 select coalesce((select jsonb_agg(jsonb_build_object(
  'id',v.id,'customer_name',v.full_name,'customer_email',v.email,'last_message',case when v.body=''then'Image'else left(v.body,100)end,
  'last_sender',v.sender_role,'last_message_at',v.last_message_at,
  'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=v.id and m.sender_role='customer' and m.id>v.admin_last_read_id)
 )order by v.last_message_at desc,v.id desc)from visible v),'[]'::jsonb),(select count(*)>30 from page) into items,more;
 return jsonb_build_object('conversations',items,'has_more',more,'unread_count',unread);
end;$$;


revoke all on function public.lnr_chat_prepare_image(uuid,boolean,uuid,uuid,text,integer,text),public.lnr_chat_finish_image(uuid,boolean,uuid),public.lnr_chat_discard_image(uuid,boolean,uuid),public.lnr_chat_image(uuid,boolean,uuid),public.lnr_chat_message_json(public.chat_messages),public.lnr_chat_send_with_image(uuid,boolean,uuid,text,uuid,uuid),public.lnr_chat_send(uuid,boolean,uuid,text,uuid),public.lnr_chat_thread(uuid,boolean,uuid,bigint),public.lnr_chat_inbox(uuid,timestamptz,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.lnr_chat_prepare_image(uuid,boolean,uuid,uuid,text,integer,text),public.lnr_chat_finish_image(uuid,boolean,uuid),public.lnr_chat_discard_image(uuid,boolean,uuid),public.lnr_chat_image(uuid,boolean,uuid),public.lnr_chat_message_json(public.chat_messages),public.lnr_chat_send_with_image(uuid,boolean,uuid,text,uuid,uuid),public.lnr_chat_send(uuid,boolean,uuid,text,uuid),public.lnr_chat_thread(uuid,boolean,uuid,bigint),public.lnr_chat_inbox(uuid,timestamptz,uuid,text,boolean) to service_role;
commit;
