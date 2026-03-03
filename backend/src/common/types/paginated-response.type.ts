export type PaginatedResponse<T, TSortBy extends string = string> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  sortBy: TSortBy | string;
  sortOrder: 'asc' | 'desc';
};
