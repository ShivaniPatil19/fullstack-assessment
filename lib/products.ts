import productsData from '@/sample-products.json';

export interface Product {
  stacklineSku: string;
  featureBullets: string[];
  imageUrls: string[];
  subCategoryId: number;
  title: string;
  categoryName: string;
  retailerSku: string;
  categoryId: number;
  subCategoryName: string;
}

export interface ProductFilters {
  category?: string;
  subCategory?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ProductService {
  private products: Product[];

  constructor() {
    this.products = productsData as Product[];
  }

  private applyFilters(filters?: Omit<ProductFilters, 'limit' | 'offset'>): Product[] {
    let result: Product[] = this.products;

    if (filters?.category) {
      const cat = filters.category.toLowerCase();
      result = result.filter((p) => p.categoryName.toLowerCase() === cat);
    }

    if (filters?.subCategory) {
      const sub = filters.subCategory.toLowerCase();
      result = result.filter((p) => p.subCategoryName.toLowerCase() === sub);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.subCategoryName.toLowerCase().includes(q)
      );
    }

    return result;
  }

  getAll(filters?: ProductFilters): Product[] {
    const filtered = this.applyFilters(filters);
    const offset = filters?.offset || 0;
    const limit = filters?.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  getById(sku: string): Product | undefined {
    return this.products.find((p) => p.stacklineSku === sku);
  }

  getCategories(): string[] {
    const categories = new Set(this.products.map((p) => p.categoryName));
    return Array.from(categories).sort();
  }

  getSubCategories(category?: string): string[] {
    let filtered = this.products;

    if (category) {
      filtered = filtered.filter(
        (p) => p.categoryName.toLowerCase() === category.toLowerCase()
      );
    }

    const subCategories = new Set(filtered.map((p) => p.subCategoryName));
    return Array.from(subCategories).sort();
  }

  getTotalCount(filters?: Omit<ProductFilters, 'limit' | 'offset'>): number {
    return this.applyFilters(filters).length;
  }
}

export const productService = new ProductService();
