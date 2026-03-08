# Stackline Full Stack Assignment

## Overview

This is a sample eCommerce website with three pages:
- **Product List Page** — Browse, search, and filter products
- **Search Results Page** — Filtered product grid
- **Product Detail Page** — Full product view with image gallery and feature bullets

## Getting Started

```bash
yarn install
yarn dev
```

---

## Bugs Identified & Fixed

### 1. Critical Security — Product Data Exposed in URL

**File:** `app/page.tsx`, `app/product/page.tsx`

**Issue:**
Product data was serialized as JSON and passed through URL query parameters (`?product={...}`). This exposed the entire product object (including all fields) in the browser URL bar, browser history, server logs, and any analytics tools. It also creates an XSS risk since arbitrary JSON could be injected via the URL and parsed with `JSON.parse()`. Additionally, large product objects can exceed URL length limits in some browsers.

**Fix:**
Changed the Link href to pass only the product SKU: `href={/product?sku=${product.stacklineSku}}`. The detail page now reads the `sku` param and fetches the full product from the existing `/api/products/[sku]` API route.

**Why this approach:**
The SKU-based approach uses the existing API, keeps URLs clean and shareable, eliminates the JSON injection surface, and naturally gives the detail page access to all product fields (including `featureBullets` and `retailerSku`) without any extra work.

---

### 2. High — Subcategories Not Filtered by Selected Category

**File:** `app/page.tsx`

**Issue:**
When a category was selected, the subcategories fetch was calling `/api/subcategories` without a `?category=` query parameter. The subcategories API supports filtering by category but was never receiving it, so the dropdown always showed subcategories from all categories making the subcategory filter meaningless.

**Fix:**
```ts
fetch(`/api/subcategories?category=${encodeURIComponent(selectedCategory)}`)
```

**Why this approach:**
The API already supported the `category` parameter it was simply never being passed. Used `encodeURIComponent` to safely handle category names that may contain special characters.

---

### 3. High — Stale Subcategory Filter on Category Change

**File:** `app/page.tsx`

**Issue:**
When the user switched from Category A (with SubCat X selected) to Category B, `selectedSubCategory` remained set to SubCat X. The product fetch would then filter by Category B AND SubCat X, producing wrong or empty results since SubCat X doesn't exist under Category B.

**Fix:**
Added `setSelectedSubCategory(undefined)` at the top of the `selectedCategory` useEffect so the subcategory is always cleared whenever the category changes.

**Why this approach:**
The subcategory selection is only meaningful within the context of the current category. Resetting it on category change is the correct UX it's the same pattern used by most e-commerce filter systems.

---

### 4. High — No Error Handling on Any Fetch Calls

**File:** `app/page.tsx`, `app/product/page.tsx`

**Issue:**
All three fetch calls (categories, subcategories, products) had no `.catch()` handlers and did not check `res.ok` before calling `.json()`. Network failures, 404s, and 500 errors were silently swallowed. The products fetch also never reset `loading` on failure, leaving the page stuck on "Loading products..." indefinitely.

**Fix:**
- Added `res.ok` checks before `.json()` non-2xx responses now throw an error
- Added `.catch()` handlers on all fetches
- Added an `error` state that displays a user-facing error message
- The `loading` state is now always reset to `false` in both success and error paths

**Why this approach:**
Fail-visible is always better than fail-silent. Users need to know when something went wrong so they can retry. The `res.ok` check is standard practice since `fetch` only rejects on network failure, not on HTTP error status codes.

---

### 5. High — Race Condition on Rapid Filter Changes

**File:** `app/page.tsx`

**Issue:**
The products fetch had no `AbortController`. When a user typed quickly or changed filters rapidly, multiple requests were in-flight simultaneously. A slower earlier request could resolve after a faster later one, overwriting the correct results with stale data.

**Fix:**
Added an `AbortController` to the products fetch useEffect. The controller's signal is passed to `fetch`, and the cleanup function calls `controller.abort()` to cancel any in-flight request when the effect re-runs.

**Why this approach:**
`AbortController` is the standard browser API for this pattern and integrates natively with `fetch`. Ignored `AbortError` in the catch handler since request cancellation is intentional and shouldn't trigger an error state.

---

### 6. High — No Search Debounce

**File:** `app/page.tsx`

**Issue:**
The search input's `onChange` directly updated the state variable that triggered the products fetch `useEffect`. Every single keystroke fired a new API call, even mid-word. Combined with the AbortController cancelling each one, this created unnecessary server load and flickering.

**Fix:**
Introduced a separate `debouncedSearch` state. A `useEffect` watches the raw `search` input and sets `debouncedSearch` after a 300ms delay. The products fetch depends on `debouncedSearch` instead of `search`, so API calls only fire after the user pauses typing.

**Why this approach:**
300ms is the standard debounce window for search inputs it feels instant to the user but eliminates most of the redundant requests. Keeping `search` and `debouncedSearch` as separate states means the input field updates immediately (no perceived lag) while the fetch waits.

---

### 7. Medium — No Way to Individually Deselect Category or Subcategory

**File:** `app/page.tsx`

**Issue:**
Once a category was selected, the only way to go back to "All Categories" was to click "Clear Filters", which also wiped the search query. There was no "All Categories" option in the dropdown itself. Radix UI's Select component does not allow deselecting the current value by clicking it again.

**Fix:**
Added an "All Categories" item as the first option in the category select and "All Subcategories" as the first option in the subcategory select. Both use a `"__all__"` sentinel value since Radix Select doesn't support empty string values. The `onValueChange` handler maps `"__all__"` back to `undefined`.

**Why this approach:**
Inline reset options are standard UX for filter dropdowns users expect to be able to undo a filter within the same control. The sentinel value pattern is the idiomatic workaround for Radix Select's empty-value limitation.

---

### 8. Medium — `parseInt` Returns `NaN` for Invalid API Parameters

**File:** `app/api/products/route.ts`

**Issue:**
The `limit` and `offset` query parameters were parsed with `parseInt()` without any validation. Passing `limit=abc` returns `NaN`, and `Array.slice(0, NaN)` returns an empty array so an invalid or malicious parameter would silently return zero products.

**Fix:**
Replaced `parseInt` with `Number()` combined with `Number.isNaN()` guards and fallback to safe defaults. Also capped `limit` at a maximum of 100 to prevent abuse.

```ts
const parsedLimit = Number(searchParams.get('limit'));
limit: Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 20 : Math.min(parsedLimit, 100),
```

**Why this approach:**
`Number()` is stricter than `parseInt` it returns `NaN` for any non-numeric string rather than partially parsing. The cap at 100 prevents clients from requesting unbounded result sets, which matters for performance on the large product dataset.

---

### 9. Medium — Product Detail Page Had No Loading or Error State

**File:** `app/product/page.tsx`

**Issue:**
The original detail page parsed product data synchronously from the URL. After switching to the API fetch approach, the page had no loading state users would see "Product not found" for the brief moment while the fetch was in-flight, and actual API errors were not distinguished from missing products.

**Fix:**
Added `loading` and `error` states to the product detail page. The page shows a "Loading product..." message while the fetch is pending, and a specific error message (e.g., "Product not found") when the fetch fails.

**Why this approach:**
Explicit loading and error states are essential for any async data fetch they prevent confusing flash-of-wrong-content and give users actionable feedback.

---

### 10. Low — Generic `create-next-app` Metadata

**File:** `app/layout.tsx`

**Issue:**
The page title and meta description were still the `create-next-app` template defaults: `"Create Next App"` and `"Generated by create next app"`. This harms SEO and shows poorly in browser tabs and bookmarks.

**Fix:**
Updated to `title: "StackShop"` and `description: "Browse and search products on StackShop"`.

---

### 11. Low — Missing Image Hostname in `next.config.ts`

**File:** `next.config.ts`

**Issue:**
The `next/image` component requires all external image hostnames to be explicitly allowlisted in `next.config.ts`. Only `m.media-amazon.com` was configured, but the product dataset also contains images hosted on `images-na.ssl-images-amazon.com`. This caused a runtime crash whenever a product image from that domain was rendered reproduced consistently when searching for terms like "gift" that return products using the missing hostname.

**Fix:**
Added the missing hostname to `remotePatterns`:
```ts
{
  protocol: 'https',
  hostname: 'images-na.ssl-images-amazon.com',
},
```

**Why this approach:**
Next.js's image allowlist is a security feature to prevent the image optimization endpoint from being used as an open proxy. The correct fix is to explicitly add each trusted hostname rather than disabling the check. Scanned all image URLs in `sample-products.json` to confirm these are the only two hostnames in use.

---

## Improvements & Enhancements

### Performance — Eliminated Double Array Copy and Double Filtering

**Files:** `lib/products.ts`, `app/api/categories/route.ts`, `app/api/subcategories/route.ts`, `app/api/products/route.ts`

**Issue:**
Every products API request was slow due to two compounding problems:

1. `getAll()` started with `let filtered = [...this.products]` an unconditional spread of the entire 13,977-product array into a new copy before any filtering began, even if no filters were applied.
2. The API route called both `productService.getAll(filters)` and `productService.getTotalCount(...)` separately. `getTotalCount` internally called `getAll`, so the full dataset was filtered **twice** per request.
3. Categories and subcategories are static data but had no HTTP caching every page load recomputed them from scratch.

**Fix:**
- Extracted a private `applyFilters()` method in `ProductService` that works with a direct reference to `this.products`. `Array.filter()` only creates a new array when it actually needs to filter, avoiding the upfront copy entirely.
- `getTotalCount` now calls `applyFilters()` directly instead of `getAll()`, eliminating the second filter pass.
- Added `Cache-Control` headers to all three API routes:
  - Categories and subcategories: `max-age=86400` (24h) truly static data
  - Products: `max-age=30, stale-while-revalidate=120` dynamic but short-lived cache

**Why this approach:**
The array spread was the single biggest hidden cost 13,977 objects copied on every request for no reason. Separating the filter logic into a shared private method keeps both `getAll` and `getTotalCount` consistent without duplicating code. HTTP caching at the response level is the most impactful layer for repeat requests since it avoids hitting the server entirely.

---

### Show Total Result Count
The API already returned a `total` field alongside `products`, but the UI was ignoring it and always showing "Showing 20 products". Updated the display to "Showing 20 of 847 products" so users know how many total results exist for their current filters.

### `.gitignore` Hardening
Added entries for common files that should never be committed:
- `*.key`, `*.p12`, `*.pfx` — private key and certificate files
- `.idea/`, `.vscode/` — IDE config directories
- `*.swp`, `*.swo` — Vim swap files
- `Thumbs.db`, `desktop.ini` — Windows OS artifacts
