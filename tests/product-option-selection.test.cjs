const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function moduleFrom(file, dependencies={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id)=>dependencies[id],Map,Set,JSON,Object});return exports;
}
const options=moduleFrom('lib/product-options.ts');
const builder=moduleFrom('lib/builder-options.ts',{'@/lib/product-options':options});
const variants=[
 {id:'gs',options:{Color:'Green',Size:'Small'},price:100,stock:2,available:true},
 {id:'gm',options:{Color:'Green',Size:'Medium'},price:110,stock:3,available:true},
 {id:'bl',options:{Color:'Black',Size:'Large'},price:120,stock:4,available:true},
 {id:'bx',options:{Color:'Black',Size:'XS'},price:130,stock:5,available:true},
 {id:'sold',options:{Color:'Green',Size:'Large'},price:100,stock:0,available:true},
 {id:'hidden',options:{Color:'Green',Size:'XS'},price:100,stock:7,available:false},
];
test('Builder resolves exact combinations and rejects Green/Large and Green/XS',()=>{
 const product={variants};assert.equal(builder.builderVariant(product,{Size:'Small',Color:'Green'}).id,'gs');assert.equal(builder.builderVariant(product,{Color:'Black',Size:'XS'}).stock,5);assert.equal(builder.builderVariant(product,{Size:'Large',Color:'Green'}),undefined);assert.equal(builder.builderVariant(product,{Size:'XS',Color:'Green'}),undefined);
});
test('Axes come from product fields, not fixed Size/Color or step defaults',()=>{
 const result=builder.builderAxes({axes:[{label:'Wrong',options:['wrong']}]},{variants:[{options:{Travel:'120mm',Diameter:'31.8mm'},stock:3,available:true}]});assert.equal(result.map(x=>x.label).join(','),'Travel,Diameter');
});
test('Canonical combination keys ignore object ordering; labels include all choices',()=>{
 assert.equal(options.optionKey({Travel:'120mm',Diameter:'31.8mm'}),options.optionKey({Diameter:'31.8mm',Travel:'120mm'}));assert.match(options.optionLabel({Travel:'120mm'}),/Travel: 120mm/);
});
test('Legacy size/color rows remain selectable after migration',()=>{
 assert.equal(builder.builderVariant({variants:[{id:'old',size:'S',color:'Black',stock:2,available:true}]},{Size:'S',Color:'Black'}).id,'old');
});


test('Starting price sums the cheapest in-stock product in every builder category', () => {
 const steps = [
  { products: [{ price: 900, stock: 2 }, { price: 700, stock: 1 }, { price: 300, stock: 0 }] },
  { products: [{ price: 1500, stock: 3 }, { price: 1200, stock: 0 }] },
  { products: [{ price: 400, stock: 5 }] },
 ];
 assert.equal(builder.builderStartingPrice(steps), 2300);
});

test('Starting price recalculates when catalogue products are added or removed', () => {
 const firstCategory = [{ price: 900, stock: 2 }, { price: 700, stock: 1 }];
 const secondCategory = [{ price: 1500, stock: 3 }];
 const steps = [{ products: firstCategory }, { products: secondCategory }];

 assert.equal(builder.builderStartingPrice(steps), 2200);
 firstCategory.push({ price: 600, stock: 1 });
 assert.equal(builder.builderStartingPrice(steps), 2100);
 firstCategory.splice(firstCategory.findIndex((product) => product.price === 600), 1);
 assert.equal(builder.builderStartingPrice(steps), 2200);
});

test('Starting price is unavailable when a required category has no in-stock products', () => {
 assert.equal(builder.builderStartingPrice([{ products: [{ price: 500, stock: 0 }] }]), null);
 assert.equal(builder.builderStartingPrice([{ products: [{ price: 500, stock: 1 }] }, { products: [] }]), null);
 assert.equal(builder.builderStartingPrice([]), null);
});
