-- Private customer/shop messaging. Apply after 0016. Existing records are retained.
begin;

create table if not exists public.chat_conversations (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null unique references public.customers(id) on delete cascade,
 customer_last_read_id bigint not null default 0,
 admin_last_read_id bigint not null default 0,
 last_message_id bigint,
 last_message_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
 sender_user_id uuid references auth.users(id) on delete set null,
 sender_role text not null check(sender_role in ('customer','admin')),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 client_id uuid not null,
 created_at timestamptz not null default now(),
 unique(sender_user_id,client_id)
);
create index if not exists chat_messages_thread_idx on public.chat_messages(conversation_id,id desc);
create index if not exists chat_messages_unread_idx on public.chat_messages(conversation_id,sender_role,id);
create index if not exists chat_messages_rate_idx on public.chat_messages(sender_user_id,created_at);
create index if not exists chat_conversations_inbox_idx on public.chat_conversations(last_message_at desc,id desc);

-- All access goes through authenticated server endpoints. No public table reads,
-- writes or browser-callable privileged RPCs; even another logged-in customer
-- cannot fetch a different customer's conversation directly from Supabase.
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations,public.chat_messages from public,anon,authenticated;
revoke all on sequence public.chat_messages_id_seq from public,anon,authenticated;
grant all on public.chat_conversations,public.chat_messages to service_role;
grant usage,select on sequence public.chat_messages_id_seq to service_role;

create or replace function public.lnr_chat_actor(p_user uuid,p_admin boolean)
returns uuid language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;
begin
 if p_user is null or p_admin is null then raise exception 'Sign in to use messages.';end if;
 if p_admin then
  if not public.lnr_is_admin(p_user) then raise exception 'Administrator access required.';end if;
  return null;
 end if;
 select id into cid from public.customers where auth_user_id=p_user and status='active';
 if cid is null or public.lnr_is_admin(p_user) then raise exception 'An active customer account is required.';end if;
 return cid;
end;$$;

create or replace function public.lnr_chat_send(
 p_user uuid,p_admin boolean,p_conversation uuid,p_body text,p_client uuid
) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;c public.chat_conversations%rowtype;m public.chat_messages%rowtype;
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);
 if p_client is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
  raise exception 'Enter a message between 1 and 2000 characters.';
 end if;
 -- Serialize sends by the same user: retries and the spam limit remain atomic.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,17));
 if p_admin then
  select * into c from public.chat_conversations where id=p_conversation for update;
 else
  if p_conversation is not null and not exists(
   select 1 from public.chat_conversations where id=p_conversation and customer_id=cid
  ) then raise exception 'Conversation not available.';end if;
  insert into public.chat_conversations(customer_id)values(cid)
   on conflict(customer_id)do update set customer_id=excluded.customer_id returning * into c;
 end if;
 if c.id is null then raise exception 'Conversation not available.';end if;
 select * into m from public.chat_messages where sender_user_id=p_user and client_id=p_client;
 if found then
  if m.conversation_id<>c.id or m.body<>btrim(p_body) then raise exception 'Use a new reference for a different message.';end if;
 else
  if (select count(*) from public.chat_messages where sender_user_id=p_user and created_at>now()-interval '1 minute')>=30 then
   raise exception 'Too many messages. Please wait a minute and try again.';
  end if;
  insert into public.chat_messages(conversation_id,sender_user_id,sender_role,body,client_id,created_at)
   values(c.id,p_user,case when p_admin then 'admin' else 'customer' end,btrim(p_body),p_client,clock_timestamp()) returning * into m;
  update public.chat_conversations set last_message_id=m.id,last_message_at=m.created_at where id=c.id;
 end if;
 return jsonb_build_object('conversation_id',c.id,'message',jsonb_build_object(
  'id',m.id::text,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at,'client_id',m.client_id));
end;$$;

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
 select coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'sender_role',sender_role,'body',body,'created_at',created_at,'client_id',client_id) order by id) from visible),'[]'::jsonb),
  (select count(*)>50 from page) into messages,more;
 select count(*)::integer into unread from public.chat_messages
  where conversation_id=c.id and sender_role=case when p_admin then 'customer' else 'admin' end
  and id>case when p_admin then c.admin_last_read_id else c.customer_last_read_id end;
 return jsonb_build_object('conversation_id',c.id,'messages',messages,'has_more',more,'unread_count',unread);
end;$$;

create or replace function public.lnr_chat_read(p_user uuid,p_admin boolean,p_conversation uuid,p_through bigint)
returns void language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;c public.chat_conversations%rowtype;seen bigint;
begin
 cid:=public.lnr_chat_actor(p_user,p_admin);
 select * into c from public.chat_conversations where id=p_conversation for update;
 if c.id is null or (not p_admin and c.customer_id<>cid) then raise exception 'Conversation not available.';end if;
 if p_through is null or p_through<0 then raise exception 'Invalid message reference.';end if;
 -- A late acknowledgement never marks messages arriving after its cursor as read.
 select coalesce(max(id),0) into seen from public.chat_messages where conversation_id=c.id and id<=p_through;
 if p_admin then update public.chat_conversations set admin_last_read_id=greatest(admin_last_read_id,seen) where id=c.id;
 else update public.chat_conversations set customer_last_read_id=greatest(customer_last_read_id,seen) where id=c.id;end if;
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
  'id',v.id,'customer_name',v.full_name,'customer_email',v.email,'last_message',left(v.body,100),
  'last_sender',v.sender_role,'last_message_at',v.last_message_at,
  'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=v.id and m.sender_role='customer' and m.id>v.admin_last_read_id)
 )order by v.last_message_at desc,v.id desc)from visible v),'[]'::jsonb),(select count(*)>30 from page) into items,more;
 return jsonb_build_object('conversations',items,'has_more',more,'unread_count',unread);
end;$$;

revoke all on function public.lnr_chat_actor(uuid,boolean),public.lnr_chat_send(uuid,boolean,uuid,text,uuid),
 public.lnr_chat_thread(uuid,boolean,uuid,bigint),public.lnr_chat_read(uuid,boolean,uuid,bigint),
 public.lnr_chat_inbox(uuid,timestamptz,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.lnr_chat_actor(uuid,boolean),public.lnr_chat_send(uuid,boolean,uuid,text,uuid),
 public.lnr_chat_thread(uuid,boolean,uuid,bigint),public.lnr_chat_read(uuid,boolean,uuid,bigint),
 public.lnr_chat_inbox(uuid,timestamptz,uuid,text,boolean) to service_role;
commit;
