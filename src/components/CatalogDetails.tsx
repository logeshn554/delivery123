import { useState } from 'react';
import { ArrowLeft, Heart, MapPin, Clock, Minus, Plus, ShoppingBag, AlertCircle, Utensils } from 'lucide-react';
import type { Restaurant, GroceryStore, MenuItem, GroceryProduct } from '../types';
import { productWithinExpiry } from '../data/productExpiry';

export type CatalogPage = { kind: 'restaurant' | 'store' | 'dish' | 'product'; id: string };
export default function CatalogDetails({ kind, partner, item, saved, onSave, onBack, onAdd, onBrowse, quantityInCart }: {
  kind: CatalogPage['kind']; partner?: Restaurant | GroceryStore; item?: MenuItem | GroceryProduct; saved: boolean;
  onSave: () => void; onBack: () => void; onAdd: (quantity: number, variant?: { id: string; label: string }) => boolean;
  onBrowse: () => void; quantityInCart: (variantId?: string) => number;
}) {
  const [quantity, setQuantity] = useState(1), [variantId, setVariantId] = useState('');
  const isFood = kind === 'dish';
  const dish = isFood ? item as MenuItem | undefined : undefined;
  const product = kind === 'product' ? item as GroceryProduct | undefined : undefined;
  const variants = dish?.variants?.filter(option => option.available !== false) || [];
  const variant = variants.find(option => option.id === variantId) || variants[0];
  const currentQuantity = quantityInCart(variant?.id);
  const cap = Math.max(0, Math.min(30, product ? product.stock : 30) - currentQuantity);
  const available = item && (dish ? dish.available !== false && (!dish.variants?.length || Boolean(variant)) : Boolean(product && product.stock > 0 && productWithinExpiry(product)));
  const data = item || partner;
  const price = variant?.price ?? item?.price ?? 0;
  return <section className="service-detail safe-area-top safe-area-bottom" role="dialog" aria-modal="true" aria-label={data?.name || 'Catalog details'}>
    <div className="service-detail-scroll"><header className="service-detail-heading"><button aria-label="Back to catalog" onClick={onBack}><ArrowLeft size={21}/></button><span>{isFood ? 'DISH DETAILS' : kind === 'product' ? 'PRODUCT DETAILS' : 'PARTNER INFORMATION'}</span><button aria-label={saved ? 'Remove favourite' : 'Save favourite'} onClick={onSave}><Heart size={20} fill={saved ? 'currentColor' : 'none'}/></button></header>
      {!data ? <div className="allgo-empty"><AlertCircle size={32}/><h2>Listing unavailable</h2><p>This listing may have changed. Return to the catalog and refresh.</p></div> : <>
        {data.image ? <img className="service-detail-image" src={data.image} alt={data.name} width={640} height={480} loading="lazy"/> : <div className="service-detail-image empty" aria-label={isFood ? `No photo available for ${data.name}` : 'No product photo available'}>{isFood ? <Utensils size={45} aria-hidden="true"/> : <ShoppingBag size={45} aria-hidden="true"/>}</div>}
        <div className="service-detail-body"><p className="service-eyebrow">{isFood ? dish?.category : product ? product.category : kind === 'restaurant' ? 'RESTAURANT DETAILS' : 'YOUR LOCAL PARTNER'}</p><h1>{data.name}</h1>{partner && 'cuisine' in partner && partner.cuisine && <p className="allgo-muted">{partner.cuisine}</p>}
          {kind === 'restaurant' && partner && 'cuisine' in partner && <div className="restaurant-detail-highlights"><span className={partner.pureVeg ? 'restaurant-detail-diet is-veg' : 'restaurant-detail-diet has-nonveg'}><i aria-hidden="true"/>{partner.pureVeg ? 'Pure vegetarian' : 'Includes non-vegetarian'}</span>{partner.rating > 0 && <span className="restaurant-detail-rating" aria-label={`Published rating ${partner.rating} out of 5`}>★ {partner.rating} <small>published rating</small></span>}</div>}
          {item && <div className="service-price">₹{price.toLocaleString('en-IN')}<span>{product?.unit || dish?.servingSize || 'Per selected item'}</span></div>}
          {data.description && <article className="allgo-card"><h2>{item ? 'About this item' : 'About the partner'}</h2><p>{data.description}</p></article>}
          {partner && <article className="allgo-card"><div className="allgo-row"><MapPin size={18}/><p>{partner.address}</p></div><div className="allgo-row"><Clock size={18}/><p>{partner.deliveryTime || 'Delivery estimate confirmed at checkout'}</p></div>{partner.openingHours && <p>Published hours: {partner.openingHours}</p>}{partner.acceptingOrders === false && <p className="allgo-feedback error">This partner is not accepting orders.</p>}{(!('cuisine' in partner)) && Number.isFinite(partner.rating) && <p>Published rating: {partner.rating}/5</p>}</article>}
          {kind === 'restaurant' && partner && 'cuisine' in partner && <article className="allgo-card restaurant-detail-note"><h2>Before you order</h2><p>Menu, hours and ratings are supplied by the restaurant. Availability and delivery estimates are checked during checkout. Ask the restaurant about ingredients or allergens if you have dietary needs.</p></article>}
          {dish && <p className="service-tag">{dish.isVeg ? 'Vegetarian' : 'Non-vegetarian'}</p>}
          {variants.length > 0 && <fieldset className="allgo-card"><legend className="sr-only">Choose an option</legend><h2>Choose your option</h2>{variants.map(option => <label className="service-option" key={option.id}><input type="radio" name="dish-variant" value={option.id} checked={variant?.id === option.id} onChange={() => { setVariantId(option.id); setQuantity(1); }}/><span>{option.label}</span><strong>₹{option.price}</strong></label>)}</fieldset>}
          {item && <article className="allgo-card"><h2>{isFood ? 'Ingredients & dietary information' : 'Product information'}</h2>{product?.brand && <p>Brand: {product.brand}</p>}{item.ingredients && <p>Ingredients: {item.ingredients}</p>}<p>{item.allergens?.length ? `Declared allergens: ${item.allergens.join(', ')}` : 'The partner has not supplied allergen information.'}</p>{product?.storageInstructions && <p>Storage: {product.storageInstructions}</p>}{product?.countryOfOrigin && <p>Origin: {product.countryOfOrigin}</p>}{product && <p>Currently listed stock: {product.stock} packs. Availability is checked again before payment.</p>}<small>Details are supplied by the partner. Check the product label or contact the partner about dietary requirements before ordering.</small></article>}
          {product?.expiresAt && <p>Partner-declared inventory deadline: {Number.isFinite(Date.parse(product.expiresAt)) ? new Date(product.expiresAt).toLocaleString() : 'Invalid deadline; ordering is unavailable'}. Check the label on the delivered product.</p>}
          {item && !available && <p role="status" className="allgo-feedback error">This item is currently unavailable.</p>}
          {!item && partner && <button className="allgo-action" onClick={onBrowse} disabled={partner.acceptingOrders === false}>Browse {kind === 'restaurant' ? 'menu' : 'products'}</button>}
        </div></>}
    </div>
    {item && <footer className="service-detail-footer"><div className="service-stepper"><button aria-label="Decrease quantity" onClick={() => setQuantity(value => Math.max(1,value-1))} disabled={quantity<=1}><Minus size={17}/></button><strong>{quantity}</strong><button aria-label="Increase quantity" onClick={() => setQuantity(value => Math.min(cap,value+1))} disabled={quantity>=cap}><Plus size={17}/></button></div><button className="allgo-action" disabled={!available || !cap || quantity>cap || partner?.acceptingOrders === false} onClick={() => { if (onAdd(quantity, variant ? { id: variant.id, label: variant.label } : undefined)) onBack(); }}>Add {quantity} · ₹{(price*quantity).toLocaleString('en-IN')}</button></footer>}
  </section>;
}
