-- Read only. Resolve returned duplicate/overbooked events before the repair migration.
select event_id,customer_id,count(*) as active_registrations from public.event_registrations where status='registered' group by event_id,customer_id having count(*)>1;
select e.id,e.title,e.capacity,count(r.id) as active_registrations from public.events e left join public.event_registrations r on r.event_id=e.id and r.status='registered' group by e.id having e.capacity>0 and count(r.id)>e.capacity;
select 'order' as kind,count(*) as public_proofs from public.gcash_payments where screenshot_url like 'http%' union all select 'event',count(*) from public.event_registrations where proof_screenshot_url like 'http%';
