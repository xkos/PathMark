import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, Collection, Item, Site } from "../domain/models";

export interface SettingsRecord {
  id: "app";
  value: AppSettings;
}

export class ReadingLibraryDatabase extends Dexie {
  collections!: EntityTable<Collection, "id">;
  sites!: EntityTable<Site, "id">;
  items!: EntityTable<Item, "id">;
  settings!: EntityTable<SettingsRecord, "id">;

  constructor(name = "jingji-reading-library") {
    super(name);
    this.version(1).stores({
      collections: "&id,parentId,sortOrder,updatedAt",
      sites: "&id,name,updatedAt",
      items:
        "&id,&canonicalKey,collectionId,siteId,readingState,isArchived,createdAt,updatedAt,lastOpenedAt,*tags",
      settings: "&id",
    });
  }
}
