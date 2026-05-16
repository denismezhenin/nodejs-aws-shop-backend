export type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  count: number;
};

export type ProductRecord = {
  id: string;
  title: string;
  description: string;
  price: number;
};

export type StockRecord = {
  product_id: string;
  count: number;
};
