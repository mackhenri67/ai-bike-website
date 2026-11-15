import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const unit={exports:{}};
const source=ts.transpileModule(readFileSync(new URL('../lib/account-orders.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInThisContext('(function(exports){'+source+'})')(unit.exports);
const {filterAccountOrders}=unit.exports;
const orders=[
 {id:'a',order_number:'ORD-100',status:'pending',order_items:[{product_name:'Everyday Helmet'}]},
 {id:'b',order_number:'ORD-101',status:'shipping',order_items:[{product_name:'Wheelset'}]},
 {id:'c',order_number:'ORD-102',status:'completed',order_items:[{product_name:'Frameset'}]},
 {id:'d',order_number:'ORD-103',status:'completed',order_items:[{product_name:'Handlebar'}]},
 {id:'e',order_number:'ORD-104',status:'cancelled',order_items:[]},
];
test('Filters processing, shipping, delivered and cancelled independently',()=>{
 for(const [filter,ids] of [['pending',['a']],['shipping',['b']],['completed',['c','d']],['cancelled',['e']],['all',['a','b','c','d','e']]])assert.deepEqual(filterAccountOrders(orders,filter,[]).map(o=>o.id),ids);
});
test('Returns includes actual requests, rather than every delivered order',()=>{
 assert.deepEqual(filterAccountOrders(orders,'returns',['d','unknown']).map(o=>o.id),['d']);
 assert.equal(filterAccountOrders(orders,'returns',[]).length,0);
});
test('Search works with category filters, case differences and missing order items',()=>{
 assert.deepEqual(filterAccountOrders(orders,'all',[],'  HELMET  ').map(o=>o.id),['a']);
 assert.deepEqual(filterAccountOrders(orders,'completed',[],'ord-103').map(o=>o.id),['d']);
 assert.equal(filterAccountOrders(orders,'shipping',[],'helmet').length,0);
 assert.equal(filterAccountOrders([{...orders[0],order_items:undefined}],'all',[],'nothing').length,0);
});
