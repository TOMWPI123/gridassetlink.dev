export type JsonRecord = Record<string, unknown>;

export type UserSession = {
  access_token: string;
  token_type: string;
  user: { id: number; email: string; full_name: string; role: string };
};

export type EntityConfig = {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  detailBase: string;
  columns: string[];
  createFields?: string[];
  filterField?: string;
  staticFilter?: (row: JsonRecord) => boolean;
};
