import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('Customization seed is editable, private, repeatable and preserves inventory',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
 create table categories(id uuid primary key default gen_random_uuid(),slug text unique);create table products(id uuid primary key default gen_random_uuid(),slug text unique,stock int);create table product_variants(id uuid primary key default gen_random_uuid(),stock int);
 insert into categories(slug)values('handlebar'),('crankset');insert into products(slug,stock)values('farsports-f1x-integrated-handlebar',3);insert into product_variants(stock)values(3);`);
 const migration=readFileSync('supabase/migrations/0019_editable_customization_data.sql','utf8');await db.exec(migration);
 let fields=(await db.query("select customization_axes from categories where slug='handlebar'")).rows[0].customization_axes;assert.ok(fields.some(a=>a.label==='Stem Length'));
 const data=(await db.query('select reference from product_option_references')).rows[0].reference;assert.equal(data.combinations.length,32);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from product_option_references'),/permission denied/);await db.exec('reset role');}
 await db.exec("set role service_role;update product_option_references set reference=jsonb_set(reference,'{sourceTitle}','\"Edited in admin\"');reset role;");
 await db.exec("update categories set customization_axes='[]' where slug='handlebar';");await db.exec(migration);
 assert.equal((await db.query('select reference from product_option_references')).rows[0].reference.sourceTitle,'Edited in admin');
 assert.deepEqual((await db.query("select customization_axes from categories where slug='handlebar'")).rows[0].customization_axes,[]);
 assert.equal((await db.query('select stock from products')).rows[0].stock,3);assert.equal((await db.query('select stock from product_variants')).rows[0].stock,3);
 }finally{await db.close();}
});
