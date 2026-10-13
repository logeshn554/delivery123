import { Clock, Heart, Minus, Plus, Star, Utensils } from 'lucide-react';
import type { MenuItem, Restaurant } from '../types';
import { CatalogImage } from '../design-system/CatalogImage';
import { CatalogState } from '../design-system/CatalogState';

export default function RestaurantMenu({ restaurant, items, categories, category, onCategory, loading, error, onRetry, onClear, onAbout, favoriteIds, onFavorite, onDetails, quantities, selectedVariants, onVariant, onAdd, onRemove }: {
  restaurant: Restaurant; items: MenuItem[]; categories: string[]; category: string; onCategory: (category: string) => void;
  loading: boolean; error: string; onRetry: () => void; onClear: () => void; onAbout: () => void;
  favoriteIds: string[]; onFavorite: (id: string) => void; onDetails: (id: string) => void;
  quantities: (id: string, variantId?: string) => number; selectedVariants: Record<string,string>;
  onVariant: (id: string, variant: string) => void; onAdd: (item: MenuItem, variant?: {id:string;label:string}) => void; onRemove: (item: MenuItem, variantId?: string) => void;
}) {
  return <section className="stitch-menu">
    <div className="stitch-restaurant-hero"><CatalogImage src={restaurant.image} alt="" className="stitch-restaurant-cover" fallback={<Utensils size={64}/>} /><button type="button" aria-label={`${favoriteIds.includes(`restaurant:${restaurant.id}`) ? 'Unsave' : 'Save'} ${restaurant.name}`} aria-pressed={favoriteIds.includes(`restaurant:${restaurant.id}`)} onClick={()=>onFavorite(`restaurant:${restaurant.id}`)}><Heart size={20} fill={favoriteIds.includes(`restaurant:${restaurant.id}`)?'currentColor':'none'}/></button></div>
    <div className="stitch-restaurant-summary"><h2>{restaurant.name}</h2><p>{restaurant.cuisine}</p><div>{restaurant.rating > 0 && <span className="stitch-rating"><Star size={14} fill="currentColor"/>{restaurant.rating}</span>}{restaurant.deliveryTime && <span><Clock size={15}/>{restaurant.deliveryTime}</span>}</div>{restaurant.acceptingOrders === false && <p className="stitch-closed" role="status">Not accepting orders right now</p>}</div>
    <div className="stitch-menu-tabs"><span aria-current="page">Menu</span><button type="button" onClick={onAbout}>Restaurant info</button></div>
    <div className="stitch-menu-layout"><nav className="stitch-menu-rail" aria-label="Menu categories">{categories.map(name=><button type="button" key={name} aria-pressed={category===name} onClick={()=>onCategory(name)}>{name}</button>)}</nav>
    <div className="stitch-menu-items">
      {error ? <CatalogState kind="error" title="Menu could not load" description={error} action={<button onClick={onRetry}>Try again</button>}/> : loading ? <CatalogState kind="loading" title="Loading menu" description="Checking current dishes and availability."/> : !items.length ? <CatalogState kind="no-results" title="No dishes to show" description="Try another category or clear your filters. Only published available dishes are shown." action={<button onClick={onClear}>Clear filters</button>}/> : items.map(item=>{
        const variants=item.variants?.filter(variant=>variant.available!==false)||[];
        const variant=variants.find(value=>value.id===selectedVariants[item.id])||variants[0];
        const quantity=quantities(item.id,variant?.id);
        const blocked=restaurant.acceptingOrders===false || Boolean(item.variants?.length && !variant);
        const saved=favoriteIds.includes(`dish:${item.id}`);
        return <article className="stitch-dish" key={item.id}>
          <div className="stitch-dish-copy"><span className={`stitch-diet ${item.isVeg?'vegetarian':'nonvegetarian'}`} aria-label={item.isVeg?'Vegetarian':'Non-vegetarian'}><i/></span><button type="button" className="stitch-dish-title" onClick={()=>onDetails(item.id)}>{item.name}</button><strong>₹{variant?.price ?? item.price}</strong>{item.description && <p>{item.description}</p>}{variants.length>0 && <label>Choose option<select aria-label={`${item.name} option`} value={variant?.id||''} onChange={event=>onVariant(item.id,event.target.value)}>{variants.map(option=><option value={option.id} key={option.id}>{option.label} · ₹{option.price}</option>)}</select></label>}</div>
          <div className="stitch-dish-end"><button type="button" className="stitch-dish-image" aria-label={`Details for ${item.name}`} onClick={()=>onDetails(item.id)}><CatalogImage src={item.image} alt="" className="stitch-dish-image-inner" fallback={<Utensils size={24}/>}/></button>{quantity===0 ? <button type="button" className="stitch-add" disabled={blocked} onClick={()=>onAdd(item,variant?{id:variant.id,label:variant.label}:undefined)}><Plus size={14}/>Add</button> : <div className="stitch-stepper"><button type="button" aria-label={`Remove one ${item.name}`} onClick={()=>onRemove(item,variant?.id)}><Minus size={14}/></button><output aria-label={`Quantity of ${item.name}`}>{quantity}</output><button type="button" aria-label={`Add one ${item.name}`} disabled={blocked} onClick={()=>onAdd(item,variant?{id:variant.id,label:variant.label}:undefined)}><Plus size={14}/></button></div>}<button type="button" className="stitch-dish-save" aria-label={`${saved?'Unsave':'Save'} ${item.name}`} aria-pressed={saved} onClick={()=>onFavorite(`dish:${item.id}`)}><Heart size={15} fill={saved?'currentColor':'none'}/></button></div>
        </article>;
      })}
    </div></div>
  </section>;
}
