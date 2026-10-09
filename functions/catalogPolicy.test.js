const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalogItem } = require('./catalogPolicy');
const dish = { name:'Rice', category:'Lunch', price:100, isVeg:true, available:true, allergens:['Milk'], admin:true };
test('catalog writes contain only allowed fields and valid variant prices',()=>{const item=catalogItem({...dish,variants:[{id:'large',label:'Large',price:150,available:true}]},'restaurant');assert.equal(item.admin,undefined);assert.equal(item.variants[0].price,150);assert.throws(()=>catalogItem({...dish,price:1.001},'restaurant'));assert.throws(()=>catalogItem({...dish,image:'javascript:alert(1)'},'restaurant'));assert.throws(()=>catalogItem({...dish,variants:[{id:'../bad',label:'Bad',price:1,available:true}]},'restaurant'));});
test('grocery stock and required units are validated',()=>{assert.equal(catalogItem({name:'Milk',category:'Dairy',price:50,stock:10,unit:'500 ml'},'grocery').stock,10);assert.throws(()=>catalogItem({name:'Milk',category:'Dairy',price:50,stock:-1,unit:'500 ml'},'grocery'));});
