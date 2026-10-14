import React, { useState, useMemo, type FormEvent } from 'react';
import { 
  Plus, Search, Edit2, Check, X, AlertCircle, Utensils, ShoppingBag, 
  Package, ChevronRight, ToggleLeft, ToggleRight, Sparkles, Image as ImageIcon
} from 'lucide-react';
import type { MenuItem, GroceryProduct } from '../types';
import { saveCatalogItem, updateMerchantCatalog } from '../data/firestoreHelper';
import ProductExpiryField from './ProductExpiryField';

interface MerchantCatalogEditorProps {
  id: string;
  type: 'restaurant' | 'grocery';
  items: (MenuItem | GroceryProduct)[];
}

export default function MerchantCatalogEditor({ id, type, items }: MerchantCatalogEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'sold_out'>('all');
  
  // Modal / Editor State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [itemId, setItemId] = useState('');
  const [expectedStock, setExpectedStock] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [variants, setVariants] = useState<NonNullable<MenuItem['variants']>>([]);
  const [busy, setBusy] = useState(false);
  const [quickTogglingId, setQuickTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Extract unique categories from items
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.category && it.category.trim()) {
        set.add(it.category.trim());
      }
    });
    return ['All', ...Array.from(set)];
  }, [items]);

  // Common category suggestions for new items
  const commonCategories = type === 'restaurant'
    ? ['Main Course', 'Starters', 'Biryani', 'Snacks', 'Beverages', 'Desserts', 'Breads', 'Breakfast']
    : ['Dairy & Eggs', 'Fresh Produce', 'Snacks & Munchies', 'Beverages', 'Instant Food', 'Bakery', 'Staples & Grains', 'Personal Care'];

  // Filtered items based on search and filters
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      // Category filter
      if (selectedCategory !== 'All' && it.category !== selectedCategory) {
        return false;
      }
      // Stock filter
      if (stockFilter === 'in_stock') {
        if (type === 'restaurant' && (it as MenuItem).available === false) return false;
        if (type === 'grocery' && (it as GroceryProduct).stock <= 0) return false;
      } else if (stockFilter === 'sold_out') {
        if (type === 'restaurant' && (it as MenuItem).available !== false) return false;
        if (type === 'grocery' && (it as GroceryProduct).stock > 0) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = it.name?.toLowerCase().includes(query);
        const matchesCategory = it.category?.toLowerCase().includes(query);
        const matchesBrand = (it as GroceryProduct).brand?.toLowerCase().includes(query);
        const matchesDesc = it.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesCategory && !matchesBrand && !matchesDesc) return false;
      }
      return true;
    });
  }, [items, selectedCategory, stockFilter, searchQuery, type]);

  // Open modal for editing existing item
  const openEditModal = (item: MenuItem | GroceryProduct) => {
    setMessage(null);
    setIsNewItem(false);
    setItemId(item.id);
    setExpectedStock('stock' in item ? (item as GroceryProduct).stock : null);
    setDraft({
      name: item.name || '',
      category: item.category || '',
      price: String(item.price || ''),
      description: item.description || '',
      image: item.image || '',
      allergens: item.allergens?.join(', ') || '',
      ingredients: item.ingredients || '',
      available: (item as MenuItem).available !== false,
      isVeg: (item as MenuItem).isVeg === true,
      servingSize: (item as MenuItem).servingSize || '',
      stock: 'stock' in item ? (item as GroceryProduct).stock : 10,
      unit: 'unit' in item ? (item as GroceryProduct).unit : '1 item',
      brand: 'brand' in item ? (item as GroceryProduct).brand || '' : '',
      storageInstructions: 'storageInstructions' in item ? (item as GroceryProduct).storageInstructions || '' : '',
      countryOfOrigin: 'countryOfOrigin' in item ? (item as GroceryProduct).countryOfOrigin || 'India' : 'India',
      expiresAt: 'expiresAt' in item ? (item as GroceryProduct).expiresAt || null : null
    });
    setVariants('variants' in item && Array.isArray((item as MenuItem).variants) ? (item as MenuItem).variants || [] : []);
    setIsModalOpen(true);
  };

  // Open modal for creating a new item
  const openCreateModal = () => {
    setMessage(null);
    setIsNewItem(true);
    setItemId(crypto.randomUUID());
    setExpectedStock(null);
    setDraft({
      name: '',
      category: selectedCategory !== 'All' ? selectedCategory : (type === 'restaurant' ? 'Main Course' : 'Snacks & Munchies'),
      price: '',
      description: '',
      image: '',
      allergens: '',
      ingredients: '',
      available: true,
      isVeg: type === 'restaurant' ? true : false,
      servingSize: '',
      stock: 50,
      unit: '1 item',
      brand: '',
      storageInstructions: '',
      countryOfOrigin: 'India',
      expiresAt: null
    });
    setVariants([]);
    setIsModalOpen(true);
  };

  // Quick toggle availability for restaurant item
  const handleQuickToggleAvailability = async (item: MenuItem) => {
    if (quickTogglingId) return;
    setQuickTogglingId(item.id);
    try {
      await updateMerchantCatalog(id, 'restaurant', item.id, {
        available: item.available === false
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not toggle item availability');
    } finally {
      setQuickTogglingId(null);
    }
  };

  // Quick toggle stock for grocery item
  const handleQuickAdjustStock = async (product: GroceryProduct, delta: number) => {
    if (quickTogglingId) return;
    const newStock = Math.max(0, product.stock + delta);
    setQuickTogglingId(product.id);
    try {
      await updateMerchantCatalog(id, 'grocery', product.id, {
        stock: newStock,
        expectedStock: product.stock
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update stock count');
    } finally {
      setQuickTogglingId(null);
    }
  };

  // Save item form submission
  const handleSaveItem = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setMessage(null);

    const priceNum = parseFloat(draft.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setMessage({ text: 'Please enter a valid positive price.', type: 'error' });
      return;
    }

    if (draft.image && draft.image.trim()) {
      try {
        const parsed = new URL(draft.image.trim());
        if (parsed.protocol !== 'https:') {
          setMessage({ text: 'Image URL must start with https://', type: 'error' });
          return;
        }
      } catch {
        setMessage({ text: 'Please enter a valid https:// image URL or leave it blank.', type: 'error' });
        return;
      }
    }

    setBusy(true);
    try {
      const payload: Record<string, any> = {
        name: draft.name.trim(),
        category: draft.category.trim(),
        price: Math.round(priceNum * 100) / 100,
        description: draft.description ? draft.description.trim() : '',
        ingredients: draft.ingredients ? draft.ingredients.trim() : '',
        allergens: draft.allergens
          ? String(draft.allergens)
              .split(',')
              .map(v => v.trim())
              .filter(Boolean)
          : [],
        image: draft.image ? draft.image.trim() : ''
      };

      if (type === 'restaurant') {
        payload.available = Boolean(draft.available);
        payload.isVeg = Boolean(draft.isVeg);
        payload.servingSize = draft.servingSize ? draft.servingSize.trim() : '';
        if (variants && variants.length > 0) {
          payload.variants = variants.map(v => ({
            id: v.id,
            label: v.label.trim(),
            price: Math.round(Number(v.price) * 100) / 100,
            available: v.available !== false
          }));
        }
      } else {
        const stockNum = parseInt(draft.stock, 10);
        if (isNaN(stockNum) || stockNum < 0) {
          setMessage({ text: 'Please enter a valid stock count.', type: 'error' });
          setBusy(false);
          return;
        }
        payload.stock = stockNum;
        payload.unit = draft.unit ? draft.unit.trim() : '1 unit';
        payload.brand = draft.brand ? draft.brand.trim() : '';
        payload.storageInstructions = draft.storageInstructions ? draft.storageInstructions.trim() : '';
        payload.countryOfOrigin = draft.countryOfOrigin ? draft.countryOfOrigin.trim() : 'India';
        payload.expiresAt = draft.expiresAt || null;
        if (expectedStock !== null) {
          payload.expectedStock = expectedStock;
        }
      }

      await saveCatalogItem(id, type, itemId, payload);
      setMessage({ text: `${type === 'restaurant' ? 'Dish' : 'Product'} saved successfully!`, type: 'success' });
      setTimeout(() => {
        setIsModalOpen(false);
      }, 700);
    } catch (err) {
      setMessage({ 
        text: err instanceof Error ? err.message : 'Failed to save catalog item.', 
        type: 'error' 
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action bar: Search & Add Button */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${items.length} ${type === 'restaurant' ? 'dishes' : 'products'}...`}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stock Filter pills */}
          <div className="flex bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-[11px]">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${stockFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            <button
              onClick={() => setStockFilter('in_stock')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${stockFilter === 'in_stock' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              In Stock
            </button>
            <button
              onClick={() => setStockFilter('sold_out')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${stockFilter === 'sold_out' ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Out
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-lg shadow-blue-600/20 transition-all shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add {type === 'restaurant' ? 'Dish' : 'Product'}</span>
          </button>
        </div>
      </div>

      {/* Categories horizontal scroll pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Catalog Items List */}
      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-800 p-6">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-300">No items match your filter</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {searchQuery ? `Try clearing "${searchQuery}" or changing categories.` : 'Start adding dishes or products to your published store catalog.'}
            </p>
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Your First {type === 'restaurant' ? 'Dish' : 'Product'}
            </button>
          </div>
        ) : (
          filteredItems.map(item => {
            const isRestaurant = type === 'restaurant';
            const menuItem = item as MenuItem;
            const groceryItem = item as GroceryProduct;
            const isInStock = isRestaurant ? menuItem.available !== false : groceryItem.stock > 0;

            return (
              <div 
                key={item.id}
                className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-slate-600 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
              >
                {/* Left: Thumbnail image & Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-12 h-12 rounded-lg bg-slate-900 border border-slate-700/70 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }} 
                      />
                    ) : (
                      isRestaurant ? <Utensils className="w-5 h-5 text-slate-500" /> : <ShoppingBag className="w-5 h-5 text-slate-500" />
                    )}
                    {/* Veg / Non-Veg badge overlay */}
                    {isRestaurant && (
                      <div className="absolute top-0.5 left-0.5 bg-slate-900/90 rounded p-0.5 shadow">
                        <div className={`w-2.5 h-2.5 border rounded-sm flex items-center justify-center ${menuItem.isVeg ? 'border-emerald-500' : 'border-rose-500'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${menuItem.isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                      {isRestaurant && menuItem.variants && menuItem.variants.length > 0 && (
                        <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                          {menuItem.variants.length} options
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span className="text-blue-400 font-semibold">{item.category}</span>
                      {!isRestaurant && groceryItem.unit && (
                        <>
                          <span>•</span>
                          <span>{groceryItem.unit}</span>
                        </>
                      )}
                      {!isRestaurant && groceryItem.brand && (
                        <>
                          <span>•</span>
                          <span className="text-slate-300 font-medium">{groceryItem.brand}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-black text-emerald-400">₹{item.price}</span>
                      <span className="text-[10px] text-slate-500">•</span>
                      <span className={`text-[10px] font-bold ${isInStock ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isRestaurant 
                          ? (isInStock ? 'In Stock' : 'Sold Out') 
                          : `${groceryItem.stock} in stock`
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Quick actions & Edit Button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isRestaurant ? (
                    <button
                      disabled={quickTogglingId === item.id}
                      onClick={() => handleQuickToggleAvailability(menuItem)}
                      title={isInStock ? 'Click to mark Sold Out' : 'Click to mark In Stock'}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                        isInStock 
                          ? 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {quickTogglingId === item.id ? 'Updating...' : (isInStock ? 'IN STOCK' : 'SOLD OUT')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                      <button
                        disabled={quickTogglingId === item.id || groceryItem.stock <= 0}
                        onClick={() => handleQuickAdjustStock(groceryItem, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-white px-1 font-mono min-w-[20px] text-center">
                        {groceryItem.stock}
                      </span>
                      <button
                        disabled={quickTogglingId === item.id}
                        onClick={() => handleQuickAdjustStock(groceryItem, +5)}
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-300 hover:bg-slate-800"
                        title="Add 5 units"
                      >
                        +
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => openEditModal(item)}
                    className="p-1.5 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit item details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit / Add Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg">
                  {type === 'restaurant' ? <Utensils className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isNewItem ? `Add New ${type === 'restaurant' ? 'Dish' : 'Product'}` : `Edit ${type === 'restaurant' ? 'Dish' : 'Product'}`}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {type === 'restaurant' ? 'Dishes appear immediately on customer food menus' : 'Products update grocery inventory and search listings'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Feedback messages */}
              {message && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  message.type === 'success' 
                    ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200' 
                    : 'bg-rose-950/80 border border-rose-800 text-rose-200'
                }`}>
                  {message.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Basic Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {type === 'restaurant' ? 'Dish Name *' : 'Product Name *'}
                  </label>
                  <input
                    required
                    maxLength={120}
                    value={draft.name || ''}
                    onChange={e => setDraft(v => ({ ...v, name: e.target.value }))}
                    placeholder={type === 'restaurant' ? 'e.g. Butter Chicken Curry' : 'e.g. Farm Fresh Whole Milk'}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Category *
                    </label>
                    <input
                      required
                      maxLength={80}
                      value={draft.category || ''}
                      onChange={e => setDraft(v => ({ ...v, category: e.target.value }))}
                      placeholder="e.g. Main Course"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Price in ₹ *
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="100000"
                      value={draft.price || ''}
                      onChange={e => setDraft(v => ({ ...v, price: e.target.value }))}
                      placeholder="250.00"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Quick category chips */}
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-slate-500 self-center mr-1">Quick:</span>
                  {commonCategories.slice(0, 5).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDraft(v => ({ ...v, category: cat }))}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors ${
                        draft.category === cat 
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Image URL with live preview */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Image URL (HTTPS address)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      maxLength={2048}
                      value={draft.image || ''}
                      onChange={e => setDraft(v => ({ ...v, image: e.target.value }))}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    {draft.image && (
                      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                        <img 
                          src={draft.image} 
                          alt="preview" 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={draft.description || ''}
                    onChange={e => setDraft(v => ({ ...v, description: e.target.value }))}
                    placeholder="Brief description of flavours, preparation style, or ingredients..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* Restaurant Specific Section */}
              {type === 'restaurant' ? (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                    Restaurant Dietary & Options
                  </h4>

                  <div className="grid grid-cols-2 gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.isVeg === true}
                        onChange={e => setDraft(v => ({ ...v, isVeg: e.target.checked }))}
                        className="rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-0"
                      />
                      <span className="text-xs font-bold text-slate-200">Pure Veg</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.available !== false}
                        onChange={e => setDraft(v => ({ ...v, available: e.target.checked }))}
                        className="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-0"
                      />
                      <span className="text-xs font-bold text-slate-200">Available Now</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Serving Size
                    </label>
                    <input
                      maxLength={100}
                      value={draft.servingSize || ''}
                      onChange={e => setDraft(v => ({ ...v, servingSize: e.target.value }))}
                      placeholder="e.g. Serves 1-2, 350 grams"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Variants / Portion Sizes */}
                  <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-300">Sizes & Variants ({variants.length})</span>
                      <button
                        type="button"
                        disabled={variants.length >= 20}
                        onClick={() => setVariants(rows => [
                          ...rows, 
                          { id: crypto.randomUUID().slice(0, 8), label: '', price: parseFloat(draft.price) || 100, available: true }
                        ])}
                        className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Size Option
                      </button>
                    </div>

                    {variants.map((variant, index) => (
                      <div key={variant.id} className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <input
                          required
                          maxLength={80}
                          value={variant.label}
                          onChange={e => setVariants(rows => rows.map((r, i) => i === index ? { ...r, label: e.target.value } : r))}
                          placeholder="e.g. Half / Full / Large"
                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500"
                        />
                        <div className="flex items-center gap-1 w-24">
                          <span className="text-xs text-slate-400 font-bold">₹</span>
                          <input
                            required
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={variant.price || ''}
                            onChange={e => setVariants(rows => rows.map((r, i) => i === index ? { ...r, price: Number(e.target.value) } : r))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setVariants(rows => rows.filter((_, i) => i !== index))}
                          className="text-rose-400 hover:text-rose-300 p-1"
                          title="Remove option"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Grocery Specific Section */
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                    Grocery Inventory & Pack Details
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Stock Count (Units) *
                      </label>
                      <input
                        required
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={draft.stock}
                        onChange={e => setDraft(v => ({ ...v, stock: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Pack Size / Unit *
                      </label>
                      <input
                        required
                        maxLength={80}
                        value={draft.unit || ''}
                        onChange={e => setDraft(v => ({ ...v, unit: e.target.value }))}
                        placeholder="e.g. 500 ml, 1 kg"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Brand
                      </label>
                      <input
                        maxLength={100}
                        value={draft.brand || ''}
                        onChange={e => setDraft(v => ({ ...v, brand: e.target.value }))}
                        placeholder="e.g. Amul, Aashirvaad"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Country of Origin
                      </label>
                      <input
                        maxLength={100}
                        value={draft.countryOfOrigin || ''}
                        onChange={e => setDraft(v => ({ ...v, countryOfOrigin: e.target.value }))}
                        placeholder="India"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Storage Instructions
                    </label>
                    <input
                      maxLength={1000}
                      value={draft.storageInstructions || ''}
                      onChange={e => setDraft(v => ({ ...v, storageInstructions: e.target.value }))}
                      placeholder="e.g. Store in a cool dry place away from sunlight"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <ProductExpiryField 
                    value={draft.expiresAt} 
                    onChange={expiresAt => setDraft(v => ({ ...v, expiresAt }))} 
                  />
                </div>
              )}

              {/* Common Ingredients & Allergens */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Ingredients (Optional)
                  </label>
                  <input
                    maxLength={2000}
                    value={draft.ingredients || ''}
                    onChange={e => setDraft(v => ({ ...v, ingredients: e.target.value }))}
                    placeholder="e.g. Wheat flour, water, vegetable oil, salt"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Allergens (Comma-separated)
                  </label>
                  <input
                    maxLength={1000}
                    value={draft.allergens || ''}
                    onChange={e => setDraft(v => ({ ...v, allergens: e.target.value }))}
                    placeholder="e.g. Dairy, Peanuts, Gluten"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {busy ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{isNewItem ? 'Publish Item' : 'Save Changes'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
