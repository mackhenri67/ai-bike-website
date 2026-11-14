-- Item-level three-day returns. Apply after 0023_customer_build_reviews.sql.
-- Existing completed orders keep NULL completed_at: enter their VERIFIED actual
-- completion date separately rather than inventing a new delivery date.
begin;
alter table public.orders add column if not exists completed_at timestamptz;
create or replace function public.lnr_capture_order_completion()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if new.status='completed' then new.completed_at:=coalesce(new.completed_at,clock_timestamp());end if;
 elsif old.completed_at is not null then new.completed_at:=old.completed_at;
 elsif new.status='completed' and old.status is distinct from 'completed' then new.completed_at:=clock_timestamp();
 end if;
 return new;
end;$$;
drop trigger if exists lnr_capture_order_completion on public.orders;
create trigger lnr_capture_order_completion before insert or update on public.orders
 for each row execute function public.lnr_capture_order_completion();

create table if not exists public.return_requests(
 id uuid primary key,order_id uuid not null references public.orders(id),
 order_item_id uuid not null references public.order_items(id),customer_id uuid not null references public.customers(id),
 reason text not null check(char_length(btrim(reason)) between 10 and 2000),
 status text not null default 'pending' check(status in('pending','approved','rejected','return_selected','received','refunded')),
 return_method text check(return_method in('rider_pickup','store_dropoff')),pickup_details text,
 review_note text,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,refund_reference text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(return_method is distinct from 'rider_pickup' or char_length(btrim(coalesce(pickup_details,''))) between 10 and 1000)
);
create unique index if not exists lnr_one_active_return_per_item on public.return_requests(order_item_id)where status<>'rejected';
create index if not exists lnr_returns_customer on public.return_requests(customer_id,created_at desc);
create index if not exists lnr_returns_status on public.return_requests(status,created_at desc);
create table if not exists public.return_evidence(
 id uuid primary key,customer_id uuid not null references public.customers(id),
 order_item_id uuid not null references public.order_items(id),request_id uuid references public.return_requests(id),
 object_path text not null unique,file_name text not null check(char_length(file_name) between 1 and 120),
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')),
 byte_size integer not null check(byte_size between 1 and 20971520),created_at timestamptz not null default clock_timestamp(),
 check(mime_type like 'video/%' or byte_size<=5242880)
);
create index if not exists lnr_return_evidence_request on public.return_evidence(request_id);
create index if not exists lnr_return_upload_rate on public.return_evidence(customer_id,created_at);
create table if not exists public.return_request_events(
 id bigint generated always as identity primary key,request_id uuid not null references public.return_requests(id),
 actor_id uuid not null references auth.users(id),actor_role text not null check(actor_role in('customer','admin')),
 status text not null,note text,created_at timestamptz not null default clock_timestamp()
);
alter table public.return_requests enable row level security;
alter table public.return_evidence enable row level security;
alter table public.return_request_events enable row level security;
revoke all on public.return_requests,public.return_evidence,public.return_request_events from public,anon,authenticated;
grant all on public.return_requests,public.return_evidence,public.return_request_events to service_role;
grant usage,select on sequence public.return_request_events_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('return-evidence','return-evidence',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
 on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists lnr_return_evidence_private on storage.objects;
create policy lnr_return_evidence_private on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'return-evidence')with check(bucket_id<>'return-evidence');

create or replace function public.lnr_return_customer(p_user uuid)
returns uuid language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;
begin
 if p_user is null or public.lnr_is_admin(p_user) then raise exception 'An active customer account is required.';end if;
 select id into cid from public.customers where auth_user_id=p_user and status='active';
 if cid is null then raise exception 'An active customer account is required.';end if;
 return cid;
end;$$;
create or replace function public.lnr_return_item_context(p_user uuid,p_item uuid)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;o public.orders%rowtype;i public.order_items%rowtype;eligible boolean;
begin
 cid:=public.lnr_return_customer(p_user);
 select * into i from public.order_items where id=p_item;
 select * into o from public.orders where id=i.order_id and customer_id=cid;
 if o.id is null then raise exception 'Order item not available.';end if;
 eligible:=o.status='completed' and o.completed_at is not null and now()>=o.completed_at and now()<o.completed_at+interval '3 days';
 return jsonb_build_object('eligible',coalesce(eligible,false),'completed_at',o.completed_at,'deadline',o.completed_at+interval '3 days',
 'order_status',o.status,'product_name',i.product_name,'quantity',i.quantity,'item_value',i.line_total,
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'mime_type',e.mime_type,'file_name',e.file_name,'byte_size',e.byte_size))from public.return_evidence e where e.request_id=r.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'note',h.note,'created_at',h.created_at,'actor_role',h.actor_role)order by h.id)from public.return_request_events h where h.request_id=r.id),'[]'::jsonb)
 )order by r.created_at desc)from public.return_requests r where r.order_item_id=i.id and r.customer_id=cid),'[]'::jsonb));
end;$$;
create or replace function public.lnr_prepare_return_upload(p_user uuid,p_item uuid,p_asset uuid,p_name text,p_mime text,p_size integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;ctx jsonb;e public.return_evidence%rowtype;ext text;
begin
 cid:=public.lnr_return_customer(p_user);perform pg_advisory_xact_lock(hashtextextended(cid::text,24));
 ctx:=public.lnr_return_item_context(p_user,p_item);
 if not (ctx->>'eligible')::boolean then raise exception 'Return requests must be submitted within three days of delivery.';end if;
 if p_asset is null or p_size is null or p_size<1 or p_size>20971520 or p_mime is null or
 p_mime not in('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')or
 (p_mime like 'image/%'and p_size>5242880)then raise exception 'Use a photo up to 5 MB or a video up to 20 MB.';end if;
 select * into e from public.return_evidence where id=p_asset;
 if found then
  if e.customer_id<>cid or e.order_item_id<>p_item or e.request_id is not null or e.mime_type<>p_mime or e.byte_size<>p_size then raise exception 'Evidence reference is not available.';end if;
  return jsonb_build_object('id',e.id,'path',e.object_path);
 end if;
 if(select count(*)from public.return_evidence where customer_id=cid and created_at>clock_timestamp()-interval '10 minutes')>=20 then raise exception 'Too many uploads. Please try again in a few minutes.';end if;
 ext:=case p_mime when'image/jpeg'then'jpg'when'image/png'then'png'when'image/webp'then'webp'when'video/webm'then'webm'when'video/quicktime'then'mov'else'mp4'end;
 insert into public.return_evidence(id,customer_id,order_item_id,object_path,file_name,mime_type,byte_size)
 values(p_asset,cid,p_item,p_user::text||'/'||p_asset::text||'.'||ext,left(coalesce(nullif(btrim(p_name),''),'Evidence'),120),p_mime,p_size)returning * into e;
 return jsonb_build_object('id',e.id,'path',e.object_path);
end;$$;
create or replace function public.lnr_submit_return(p_user uuid,p_item uuid,p_id uuid,p_reason text,p_assets uuid[])
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;o public.orders%rowtype;i public.order_items%rowtype;r public.return_requests%rowtype;asset uuid;e public.return_evidence%rowtype;
begin
 cid:=public.lnr_return_customer(p_user);
 select * into i from public.order_items where id=p_item for update;
 select * into o from public.orders where id=i.order_id and customer_id=cid for update;
 if o.id is null then raise exception 'Order item not available.';end if;
 select * into r from public.return_requests where id=p_id;
 if found then
  if r.customer_id<>cid or r.order_item_id<>p_item then raise exception 'Request reference is not available.';end if;
  return to_jsonb(r);
 end if;
 if o.status<>'completed' or o.completed_at is null or clock_timestamp()<o.completed_at or clock_timestamp()>=o.completed_at+interval '3 days' then raise exception 'Return requests must be submitted within three days of delivery.';end if;
 if p_id is null or p_reason is null or char_length(btrim(p_reason))not between 10 and 2000 then raise exception 'Explain the reason using 10 to 2000 characters.';end if;
 if exists(select 1 from public.return_requests where order_item_id=i.id and status<>'rejected')then raise exception 'This item already has a return/refund request.';end if;
 if coalesce(array_length(p_assets,1),0)not between 1 and 3 or(select count(distinct x)from unnest(p_assets)x)<>array_length(p_assets,1)then raise exception 'Attach one to three photos or videos.';end if;
 foreach asset in array p_assets loop
  select * into e from public.return_evidence where id=asset for update;
  if e.id is null or e.customer_id<>cid or e.order_item_id<>i.id or e.request_id is not null then raise exception 'One of the evidence files is not available.';end if;
  if not exists(select 1 from storage.objects s where s.bucket_id='return-evidence'and s.name=e.object_path and(s.metadata->>'size')::bigint=e.byte_size and s.metadata->>'mimetype'=e.mime_type)then raise exception 'An evidence upload is incomplete. Please retry the upload.';end if;
 end loop;
 insert into public.return_requests(id,order_id,order_item_id,customer_id,reason)values(p_id,o.id,i.id,cid,btrim(p_reason))returning * into r;
 update public.return_evidence set request_id=r.id where id=any(p_assets);
 insert into public.return_request_events(request_id,actor_id,actor_role,status,note)values(r.id,p_user,'customer','pending','Request submitted for admin review.');
 return to_jsonb(r);
end;$$;
create or replace function public.lnr_review_return(p_user uuid,p_request uuid,p_status text,p_note text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare r public.return_requests%rowtype;note text:=nullif(btrim(p_note),'');
begin
 if p_user is null or not public.lnr_is_admin(p_user)then raise exception 'Administrator access required.';end if;
 select * into r from public.return_requests where id=p_request for update;
 if r.id is null then raise exception 'Return request not found.';end if;
 if p_status is null or not((r.status='pending'and p_status in('approved','rejected'))or(r.status='return_selected'and p_status='received')or(r.status='received'and p_status='refunded'))then raise exception 'This return status cannot be changed that way.';end if;
 if coalesce(char_length(note),0)>2000 then raise exception 'Notes must not exceed 2000 characters.';end if;
 if p_status in('rejected','refunded')and coalesce(char_length(note),0)<10 then raise exception 'Enter a rejection reason or actual refund reference (at least 10 characters).';end if;
 update public.return_requests set status=p_status,updated_at=clock_timestamp(),
 reviewed_by=case when p_status in('approved','rejected')then p_user else reviewed_by end,
 reviewed_at=case when p_status in('approved','rejected')then clock_timestamp()else reviewed_at end,
 review_note=case when p_status in('approved','rejected')then note else review_note end,
 refund_reference=case when p_status='refunded'then note else refund_reference end where id=r.id returning * into r;
 insert into public.return_request_events(request_id,actor_id,actor_role,status,note)values(r.id,p_user,'admin',p_status,note);
 return to_jsonb(r);
end;$$;
create or replace function public.lnr_select_return_method(p_user uuid,p_request uuid,p_method text,p_details text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;r public.return_requests%rowtype;
begin
 cid:=public.lnr_return_customer(p_user);
 select * into r from public.return_requests where id=p_request and customer_id=cid for update;
 if r.id is null then raise exception 'Return request not found.';end if;
 if r.status not in('approved','return_selected')then raise exception 'Wait for approval before choosing a return method.';end if;
 if p_method is null or p_method not in('rider_pickup','store_dropoff')then raise exception 'Choose rider pickup or store drop-off.';end if;
 if p_method='rider_pickup'and coalesce(char_length(btrim(p_details)),0)not between 10 and 1000 then raise exception 'Provide the pickup address and contact number (10 to 1000 characters).';end if;
 update public.return_requests set status='return_selected',return_method=p_method,pickup_details=case when p_method='rider_pickup'then btrim(p_details)else null end,updated_at=clock_timestamp()where id=r.id returning * into r;
 insert into public.return_request_events(request_id,actor_id,actor_role,status,note)values(r.id,p_user,'customer','return_selected',case p_method when'rider_pickup'then'Rider pickup requested. Shop coordination required.'else'Store drop-off selected.'end);
 return to_jsonb(r);
end;$$;
create or replace function public.lnr_set_return_completion(p_user uuid,p_order uuid,p_when timestamptz)
returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;
begin
 if p_user is null or not public.lnr_is_admin(p_user)then raise exception 'Administrator access required.';end if;
 select * into o from public.orders where id=p_order for update;
 if o.id is null or o.status<>'completed' then raise exception 'Select a completed order.';end if;
 if o.completed_at is not null then raise exception 'This order already has a recorded delivery date.';end if;
 if p_when is null or p_when<o.created_at or p_when>clock_timestamp()then raise exception 'Enter the verified delivery time between the order date and now.';end if;
 update public.orders set completed_at=p_when where id=o.id;
end;$$;
revoke all on function public.lnr_set_return_completion(uuid,uuid,timestamptz)from public,anon,authenticated;
grant execute on function public.lnr_set_return_completion(uuid,uuid,timestamptz)to service_role;
revoke all on function public.lnr_return_customer(uuid),public.lnr_return_item_context(uuid,uuid),public.lnr_prepare_return_upload(uuid,uuid,uuid,text,text,integer),public.lnr_submit_return(uuid,uuid,uuid,text,uuid[]),public.lnr_review_return(uuid,uuid,text,text),public.lnr_select_return_method(uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.lnr_return_customer(uuid),public.lnr_return_item_context(uuid,uuid),public.lnr_prepare_return_upload(uuid,uuid,uuid,text,text,integer),public.lnr_submit_return(uuid,uuid,uuid,text,uuid[]),public.lnr_review_return(uuid,uuid,text,text),public.lnr_select_return_method(uuid,uuid,text,text)to service_role;
commit;
