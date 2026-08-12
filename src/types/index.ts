export type UserRole = 'SELLER' | 'CUSTOMER';

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}

export interface Profile {
  id: string;
  role: UserRole;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  category: string;
  price_minor: number;
  currency: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  store_name?: string | null;
  seller_name?: string | null;
}

export interface ProductWithInventory extends Product {
  quantity: number;
  available: boolean;
}

export interface Order {
  id: string;
  customer_id: string;
  status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  store_id: string;
  quantity: number;
  unit_price_minor: number;
  currency: string;
  created_at: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ProductSort =
  | 'price_asc'
  | 'price_desc'
  | 'created_at_asc'
  | 'created_at_desc'
  | 'name_asc'
  | 'name_desc';
