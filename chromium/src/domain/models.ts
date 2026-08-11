export type UUID = string;
export type ISODateTime = string;

export type ReadingState = "unread" | "reading" | "read";

export type QueryPolicy =
  | {
      mode: "keep-all-except-ignored";
      ignoredParams: string[];
    }
  | {
      mode: "keep-only-identity";
      identityParams: string[];
    };

export interface Collection {
  id: UUID;
  name: string;
  parentId: UUID | null;
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Endpoint {
  id: UUID;
  prefix: string;
  priority: number;
  enabled: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Site {
  id: UUID;
  name: string;
  description: string;
  endpoints: Endpoint[];
  queryPolicy: QueryPolicy;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Item {
  id: UUID;
  title: string;
  note: string;
  tags: string[];
  collectionId: UUID | null;
  siteId: UUID | null;
  resourceKey: string | null;
  canonicalKey: string;
  originalUrl: string;
  lastResolvedUrl: string | null;
  readingState: ReadingState;
  isArchived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  firstReadAt: ISODateTime | null;
  readAt: ISODateTime | null;
  lastOpenedAt: ISODateTime | null;
  openCount: number;
}

export interface AppSettings {
  globalIgnoredQueryParams: string[];
  stripTrailingSlash: boolean;
  defaultReadingState: ReadingState;
  defaultView: "inbox" | "unread" | "all";
}

export const DEFAULT_SETTINGS: AppSettings = {
  globalIgnoredQueryParams: ["utm_*", "fbclid", "gclid", "mc_cid", "mc_eid"],
  stripTrailingSlash: true,
  defaultReadingState: "unread",
  defaultView: "unread",
};

export interface PageSnapshot {
  title: string;
  url: string;
}

export interface SavePageInput extends PageSnapshot {
  note: string;
  tags: string[];
  collectionId: UUID | null;
  readingState: ReadingState;
}
