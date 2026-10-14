import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RestaurantMenu from '../src/components/RestaurantMenu.tsx';
import GroceryProductCard from '../src/design-system/GroceryProductCard.tsx';
import GroceryCategories from '../src/design-system/GroceryCategories.tsx';
import OffersScreen from '../src/components/OffersScreen.tsx';
import ProfileScreen from '../src/components/ProfileScreen.tsx';
import { customerDestination } from '../src/app/customerNavigation.ts';
const noop=()=>{};
test('customer, sign-in and partner screens share semantic surfaces and brand tokens',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const tokens=read('../src/design-system/tokens.css');
  const roles=read('../src/design-system/roles.css');
  const global=read('../src/index.css');
  assert.match(tokens,/--allgo-brand:\s*#5130ef/i);
  assert.match(tokens,/--allgo-canvas:\s*#f8f7fc/i);
  assert.match(tokens,/--allgo-surface:\s*#ffffff/i);
  assert.match(roles,/\.allgo-customer \.stitch-offer-banner[^{]*\{[^}]*var\(--allgo-primary-strong\)[^}]*var\(--allgo-brand\)/);
  assert.doesNotMatch(roles,/\.allgo-customer,\s*\.auth-shell,\s*\.stitch-address-sheet\s*\{[^}]*--allgo-brand:/);
  assert.match(global,/\.auth-shell\s*\{[^}]*background:\s*var\(--allgo-canvas\)/);
  assert.match(global,/\.auth-panel\s*\{[^}]*background:\s*var\(--allgo-surface\)/);
});
const restaurant={id:'test',name:'Test kitchen',cuisine:'Indian',image:'',rating:0,deliveryTime:'',address:'',pureVeg:true};
const item={id:'dish',restaurantId:'test',name:'Dish with options',category:'Kitchen specials',description:'',price:99,isVeg:true,image:'',variants:[{id:'small',label:'Small',price:99},{id:'large',label:'Large',price:249}]};
const props={restaurant,items:[item],categories:['All','Kitchen specials'],category:'All',onCategory:noop,loading:false,error:'',onRetry:noop,onClear:noop,onAbout:noop,favoriteIds:[],onFavorite:noop,onDetails:noop,quantities:()=>0,selectedVariants:{dish:'large'},onVariant:noop,onAdd:noop,onRemove:noop};
test('restaurant redesign renders the selected live variant price and rejects a closed-store add',()=>{
  const html=renderToStaticMarkup(createElement(RestaurantMenu,props));
  assert.match(html,/<strong>₹249<\/strong>/);
  assert.match(html,/value="large" selected=""/);
  const closed=renderToStaticMarkup(createElement(RestaurantMenu,{...props,restaurant:{...restaurant,acceptingOrders:false}}));
  assert.match(closed,/class="stitch-add" disabled=""/);
  const unavailable=renderToStaticMarkup(createElement(RestaurantMenu,{...props,items:[{...item,variants:item.variants.map(value=>({...value,available:false}))}]}));
  assert.match(unavailable,/class="stitch-add" disabled=""/);
});
test('grocery redesign keeps zero and invalid stock unavailable and caps quantities at live stock',()=>{
  const product={id:'p',storeId:'s',name:'Product',unit:'1 kg',price:30,stock:0,category:'Fresh',image:''};
  const render=(stock,quantity)=>renderToStaticMarkup(createElement(GroceryProductCard,{product:{...product,stock},quantity,closed:false,saved:false,onSave:noop,onDetails:noop,onAdd:noop,onRemove:noop}));
  for(const stock of [0,NaN,-1]) assert.match(render(stock,0),/disabled="">Unavailable/);
  assert.match(render(2,2),/aria-label="Add one Product" disabled=""/);
});
test('category and profile screens retain only supplied data rather than design-example vendors or identities',()=>{
  const categories=renderToStaticMarkup(createElement(GroceryCategories,{categories:['All','Local grains'],selected:'All',onSelect:noop}));
  assert.match(categories,/Local grains/);assert.doesNotMatch(categories,/Vegetables|BigBasket|Blinkit/);
  const profile=renderToStaticMarkup(createElement(ProfileScreen,{name:'',actions:[],onSignOut:noop}));
  assert.doesNotMatch(profile,/Logesh|96155|₹200/);
});
test('offers navigation is a real destination and empty-cart offers expose no claim of verified savings',()=>{
  assert.equal(customerDestination('offers'),'offers');
  const html=renderToStaticMarkup(createElement(OffersScreen,{hasCart:false,onApply:noop,onBrowse:noop,onBack:noop}));
  assert.match(html,/disabled="">Review in cart/);
  assert.doesNotMatch(html,/FOOD50|GROCERY30|50%|VERIFIED/);
});
