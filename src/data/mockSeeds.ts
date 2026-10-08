import { Restaurant, MenuItem, GroceryStore, GroceryProduct } from '../types';

export const SEED_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest_dominos',
    name: "Domino's Pizza",
    cuisine: "Pizzas, Fast Food",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
    rating: 4.5,
    deliveryTime: "30-40 min",
    pureVeg: false,
    address: "Anna Nagar, Chennai"
  },
  {
    id: 'rest_kfc',
    name: "KFC",
    cuisine: "Burgers, Fried Chicken",
    image: "https://images.unsplash.com/photo-1513639776629-7b61b0ac59b4?auto=format&fit=crop&w=600&q=80",
    rating: 4.3,
    deliveryTime: "25-35 min",
    pureVeg: false,
    address: "T. Nagar, Chennai"
  },
  {
    id: 'rest_a2b',
    name: "Adyar Ananda Bhavan (A2B)",
    cuisine: "South Indian, Sweets",
    image: "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=600&q=80",
    rating: 4.4,
    deliveryTime: "30-40 min",
    pureVeg: true,
    address: "Mylapore, Chennai"
  },
  {
    id: 'rest_saravana',
    name: "Hotel Saravana Bhavan",
    cuisine: "South Indian, Veg",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    rating: 4.2,
    deliveryTime: "30-45 min",
    pureVeg: true,
    address: "Central Chennai"
  }
];

export const SEED_MENU_ITEMS: MenuItem[] = [
  // Domino's
  {
    id: 'menu_dom_1',
    restaurantId: 'rest_dominos',
    name: "Margherita Pizza (Medium)",
    price: 249,
    isVeg: true,
    category: "Veg Pizzas",
    description: "Classic delight with 100% real mozzarella cheese",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'menu_dom_2',
    restaurantId: 'rest_dominos',
    name: "Peppy Paneer Pizza (Medium)",
    price: 399,
    isVeg: true,
    category: "Veg Pizzas",
    description: "Paneer, capsicum, red paprika, and loaded cheese",
    image: "https://images.unsplash.com/photo-1571066811602-71683a3f680d?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'menu_dom_3',
    restaurantId: 'rest_dominos',
    name: "Pepper Barbecue Chicken Pizza",
    price: 449,
    isVeg: false,
    category: "Non-Veg Pizzas",
    description: "Pepper barbecue chicken & cheese",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=200&q=80"
  },
  
  // KFC
  {
    id: 'menu_kfc_1',
    restaurantId: 'rest_kfc',
    name: "8 Pc Hot & Crispy Chicken Bucket",
    price: 699,
    isVeg: false,
    category: "Chicken Buckets",
    description: "Signature hot & crispy chicken pieces",
    image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'menu_kfc_2',
    restaurantId: 'rest_kfc',
    name: "Zinger Burger",
    price: 189,
    isVeg: false,
    category: "Burgers",
    description: "Crispy chicken fillet with lettuce and mayo",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=200&q=80"
  },
  
  // A2B
  {
    id: 'menu_a2b_1',
    restaurantId: 'rest_a2b',
    name: "Special Ghee Roast Dosa",
    price: 130,
    isVeg: true,
    category: "Breakfast",
    description: "Crispy thin golden dosa cooked with pure ghee, served with 3 chutneys & sambar",
    image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'menu_a2b_2',
    restaurantId: 'rest_a2b',
    name: "Idli (2 Pcs) & Vada (1 Pc)",
    price: 95,
    isVeg: true,
    category: "Breakfast",
    description: "Soft steamed rice cakes paired with a crispy lentil doughnut",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=200&q=80"
  },

  // Saravana Bhavan
  {
    id: 'menu_sb_1',
    restaurantId: 'rest_saravana',
    name: "Saravana Special Mini Meals",
    price: 180,
    isVeg: true,
    category: "Meals",
    description: "Mini sambar rice, curd rice, sweet, rasam rice and variety rice with papad",
    image: "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'menu_sb_2',
    restaurantId: 'rest_saravana',
    name: "Medu Vada (2 Pcs)",
    price: 70,
    isVeg: true,
    category: "Snacks",
    description: "Traditional deep-fried crispy vadas served with chutney & piping hot sambar",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=200&q=80"
  }
];

export const SEED_STORES: GroceryStore[] = [
  {
    id: 'store_central',
    name: "AllGo Instamart — Central Chennai",
    address: "Anna Nagar Ext, Chennai",
    rating: 4.7,
    deliveryTime: "15-20 min",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: 'store_south',
    name: "AllGo Instamart — Adyar Mall",
    address: "Kasturba Nagar, Adyar, Chennai",
    rating: 4.6,
    deliveryTime: "20-25 min",
    image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=600&q=80"
  }
];

export const SEED_GROCERY_PRODUCTS: GroceryProduct[] = [
  // Store Central
  {
    id: 'groc_tomato',
    storeId: 'store_central',
    name: "Fresh Hybrid Tomato",
    price: 30,
    stock: 120,
    unit: "1 kg",
    category: "Fruits & Vegetables",
    image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'groc_milk',
    storeId: 'store_central',
    name: "Amul Taaza Toned Milk",
    price: 28,
    stock: 90,
    unit: "500 ml",
    category: "Dairy & Bread",
    image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'groc_banana',
    storeId: 'store_central',
    name: "Robusta Yellow Banana",
    price: 40,
    stock: 150,
    unit: "12 Pcs",
    category: "Fruits & Vegetables",
    image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'groc_onion',
    storeId: 'store_central',
    name: "Fresh Red Onion",
    price: 25,
    stock: 200,
    unit: "1 kg",
    category: "Fruits & Vegetables",
    image: "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'groc_eggs',
    storeId: 'store_central',
    name: "Premium White Eggs",
    price: 36,
    stock: 80,
    unit: "6 Pcs",
    category: "Dairy & Bread",
    image: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: 'groc_potato',
    storeId: 'store_central',
    name: "Fresh Golden Potato",
    price: 22,
    stock: 140,
    unit: "1 kg",
    category: "Fruits & Vegetables",
    image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=200&q=80"
  }
];
