import { Apple, Carrot, Milk, Cookie, CupSoda, SprayCan, ShoppingBag, LayoutGrid } from 'lucide-react';
const visuals = [
  {matches:/fruit/i,Icon:Apple,tone:'peach'}, {matches:/vegetable|greens/i,Icon:Carrot,tone:'mint'},
  {matches:/dairy|milk/i,Icon:Milk,tone:'sky'}, {matches:/snack|bakery/i,Icon:Cookie,tone:'butter'},
  {matches:/beverage|drink/i,Icon:CupSoda,tone:'pink'}, {matches:/house|clean/i,Icon:SprayCan,tone:'lavender'},
];
export default function GroceryCategories({ categories, selected, onSelect }: {categories:string[];selected:string;onSelect:(category:string)=>void}) {
  return <nav className="stitch-grocery-categories" aria-label="Grocery categories">{categories.map(name=>{
    const visual=name==='All'?{Icon:LayoutGrid,tone:'lavender'}:visuals.find(value=>value.matches.test(name))||{Icon:ShoppingBag,tone:'mint'};
    return <button type="button" key={name} className={visual.tone} aria-pressed={selected===name} onClick={()=>onSelect(name)}><span className="service-icon"><visual.Icon size={25} strokeWidth={1.7} aria-hidden="true"/></span><strong>{name}</strong></button>;
  })}</nav>;
}
