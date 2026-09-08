import { useEffect, useMemo, useState } from "react";
import type { Collection, Item, Site } from "../domain/models";
import { readingLibrary } from "../storage/library-instance";
import { Badge } from "../ui/Badge";
import { SiteManager } from "./SiteManager";
import { ItemMigrationDialog } from "./ItemMigrationDialog";
import { CollectionManager } from "./CollectionManager";
import { flattenCollections } from "../domain/collection-management";
import { DataTransferManager } from "./DataTransferManager";
import { ItemEditorDialog } from "./ItemEditorDialog";
import { resolveResourceUrl, resolveResourceUrlWithEndpoint } from "../domain/address-resolution";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { getLocale, localizeError, t } from "../i18n";

type ViewFilter = "all" | "unread" | "read" | "archived";
type LibrarySection = "items" | "sites" | "collections" | "transfer";
type SortField = "createdAt" | "updatedAt" | "lastOpenedAt" | "title";

export function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<LibrarySection>("items");
  const [sites, setSites] = useState<Site[]>([]);
  const [migrationItem, setMigrationItem] = useState<Item | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFilter, setCollectionFilter] = useState("uncategorized");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [bulkTargetCollectionId, setBulkTargetCollectionId] = useState("uncategorized");
  const [bulkError, setBulkError] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [siteFilter, setSiteFilter] = useState("unassigned");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem("pathmark.library.pageSize"));
      return PAGE_SIZES.includes(stored) ? stored : 100;
    } catch { return 100; }
  });
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDescending, setSortDescending] = useState(true);

  useEffect(() => {
    if (section !== "items") return;
    let active = true;
    setLoading(true);
    void Promise.all([readingLibrary.listItems(), readingLibrary.listSites(), readingLibrary.listCollections()])
      .then(([loadedItems, loadedSites, loadedCollections]) => {
        if (!active) return;
        setItems(loadedItems); setSites(loadedSites); setCollections(loadedCollections);
      })
      .catch((error) => { if (active) setBulkError(localizeError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [section]);

  const locale = getLocale();
  const visibleItems = useMemo(() => {
    const siteNames = new Map(sites.map((site) => [site.id, site.name]));
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && (item.isArchived || item.readingState === "read")) return false;
      if (filter === "read" && (item.isArchived || item.readingState !== "read")) return false;
      if (filter === "archived" && !item.isArchived) return false;
      if (collectionFilter === "uncategorized" && item.collectionId !== null) return false;
      if (collectionFilter !== "all" && collectionFilter !== "uncategorized" && item.collectionId !== collectionFilter) return false;
      if (siteFilter === "unassigned" && item.siteId !== null) return false;
      if (siteFilter !== "all" && siteFilter !== "unassigned" && item.siteId !== siteFilter) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.note, item.originalUrl, item.resourceKey ?? "", siteNames.get(item.siteId ?? "") ?? "", ...item.tags]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    }).sort((left, right) => {
      const leftValue = sortField === "title" ? left.title.toLocaleLowerCase() : left[sortField] ?? "";
      const rightValue = sortField === "title" ? right.title.toLocaleLowerCase() : right[sortField] ?? "";
      const order = leftValue.localeCompare(rightValue, getLocale());
      return sortDescending ? -order : order;
    });
  }, [collectionFilter, filter, items, query, siteFilter, sites, sortDescending, sortField, locale]);

  useEffect(() => { setPage(0); setSelectedItemIds(new Set()); }, [query, filter, collectionFilter, siteFilter, sortField, sortDescending, section]);
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visibleItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedVisibleCount = visibleItems.filter((item) => selectedItemIds.has(item.id)).length;
  const allResultsSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;
  const selectionTip = `${t("selectResults")} (${visibleItems.length}) · ${t("selectedCount", { count: selectedVisibleCount })}`;
  const pageNumbers = [...new Set([0, pageCount - 1, ...Array.from({ length: Math.min(5, pageCount) }, (_, offset) => Math.max(0, Math.min(currentPage - 2, pageCount - 5)) + offset)])].sort((a, b) => a - b);
  async function deleteSelectedItems() {
    if (!window.confirm(t("deleteSelectedQuestion", { count: selectedItemIds.size }))) return;
    try {
      await readingLibrary.deleteItems([...selectedItemIds]);
      setItems((current) => current.filter((item) => !selectedItemIds.has(item.id)));
      setSelectedItemIds(new Set()); requestActionIconRefresh();
    } catch (error) { setBulkError(localizeError(error)); }
  }

  async function moveSelectedItems(): Promise<void> {
    await runBulkAction(() => readingLibrary.bulkMoveItems(
      [...selectedItemIds],
      bulkTargetCollectionId === "uncategorized" ? null : bulkTargetCollectionId,
    ));
  }

  async function setSelectedArchived(isArchived: boolean): Promise<void> {
    await runBulkAction(() => readingLibrary.bulkSetArchived([...selectedItemIds], isArchived));
  }

  async function runBulkAction(action: () => Promise<Item[]>): Promise<void> {
    setBulkError("");
    try {
      const updated = await action();
      const updates = new Map(updated.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => updates.get(item.id) ?? item));
      setSelectedItemIds(new Set());
      requestActionIconRefresh();
    } catch (error) {
      setBulkError(localizeError(error));
    }
  }

  const counts = {
    all: items.length,
    unread: items.filter((item) => !item.isArchived && item.readingState !== "read").length,
    read: items.filter((item) => !item.isArchived && item.readingState === "read").length,
    archived: items.filter((item) => item.isArchived).length,
  };

  return (
    <div className="library-shell">
      <nav className="library-nav" aria-label={t("navLabel")}>
        <h1 className="library-nav__brand">{t("appName")}</h1>
        <NavItem label={t("allItems")} count={counts.all} active={section === "items" && filter === "all"} onClick={() => { setSection("items"); setFilter("all"); setSiteFilter("unassigned"); setCollectionFilter("uncategorized"); }} />
        <NavItem label={t("unread")} count={counts.unread} active={section === "items" && filter === "unread"} onClick={() => { setSection("items"); setFilter("unread"); }} />
        <NavItem label={t("read")} count={counts.read} active={section === "items" && filter === "read"} onClick={() => { setSection("items"); setFilter("read"); }} />
        <NavItem label={t("archived")} count={counts.archived} active={section === "items" && filter === "archived"} onClick={() => { setSection("items"); setFilter("archived"); }} />
        <div className="library-nav__divider" />
        <NavItem label={t("collections")} active={section === "collections"} onClick={() => setSection("collections")} />
        <NavItem label={t("sitesAndEndpoints")} active={section === "sites"} onClick={() => setSection("sites")} />
        <NavItem label={t("settingsAndData")} active={section === "transfer"} onClick={() => setSection("transfer")} />
      </nav>

      <main className="library-main">
        {section === "sites" ? <SiteManager /> : section === "collections" ? <CollectionManager /> : section === "transfer" ? <DataTransferManager /> : <>
        <header className="library-header">
          <h2 className="library-title">{t("library")}</h2>

        </header>

        <section className="library-advanced-filters" aria-label={t("filtersAndSort")}>
            <label className="field library-collection-filter">
              <span className="field__label">{t("category")}</span>
              <select className="field__input" value={collectionFilter} onChange={(event) => { setCollectionFilter(event.target.value); setSelectedItemIds(new Set()); }}>
                <option value="all">{t("allCollections")}</option>
                <option value="uncategorized">{t("uncategorized")}</option>
                {flattenCollections(collections).map(({ collection, depth }) => (
                  <option value={collection.id} key={collection.id}>{`${"　".repeat(depth)}${collection.name}`}</option>
                ))}
              </select>
            </label>
          <label className="field"><span className="field__label">{t("site")}</span><select className="field__input" aria-label={t("site")} value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}><option value="all">{t("allSites")}</option><option value="unassigned">{t("unassigned")}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label className="field library-search">
              <span className="field__label">{t("search")}</span>
              <input
                className="field__input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            </label>
          <label className="field"><span className="field__label">{t("sort")}</span><select className="field__input" value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}><option value="createdAt">{t("savedAt")}</option><option value="updatedAt">{t("updatedAt")}</option><option value="lastOpenedAt">{t("lastOpened")}</option><option value="title">{t("title")}</option></select></label>
          <label className="field"><span className="field__label">{t("direction")}</span><select className="field__input" value={sortDescending ? "desc" : "asc"} onChange={(event) => setSortDescending(event.target.value === "desc")}><option value="desc">{t("descending")}</option><option value="asc">{t("ascending")}</option></select></label>
        </section>

        <div className="library-list-toolbar">
          <label className="library-select-all">
            <input type="checkbox" disabled={loading || !visibleItems.length} checked={allResultsSelected}
              aria-label={`${t("selectResults")} (${visibleItems.length})`} aria-describedby="library-select-all-tip"
              ref={(input) => { if (input) input.indeterminate = selectedVisibleCount > 0 && !allResultsSelected; }}
              onChange={(event) => setSelectedItemIds(event.target.checked ? new Set(visibleItems.map((item) => item.id)) : new Set())} />
            <span className="library-selection-tip" id="library-select-all-tip" role="tooltip">{selectionTip}</span>
          </label>
          <div className="library-pagination-settings">
            <label className="pagination-size">{t("itemsPerPage")}
              <select className="field__input" value={pageSize} onChange={(event) => {
                const nextSize = Number(event.target.value);
                setPageSize(nextSize); setPage(0);
                try { localStorage.setItem("pathmark.library.pageSize", String(nextSize)); } catch { /* Keep the selection for this session. */ }
              }}>
                {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
              </select>
            </label>
            <span className="library-pagination-range" aria-live="polite">{t("itemRange", { start: visibleItems.length ? currentPage * pageSize + 1 : 0, end: Math.min((currentPage + 1) * pageSize, visibleItems.length), total: visibleItems.length })}</span>
          </div>
          <nav className="library-pagination">
            <button type="button" disabled={loading || currentPage === 0} aria-label={t("previousPage")} title={t("previousPage")} onClick={() => setPage(currentPage - 1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg></button>
            {pageNumbers.map((number, index) => <span className="library-pagination-slot" key={number}>
              {index > 0 && number - pageNumbers[index - 1] > 1 ? <span className="library-pagination-gap" aria-hidden="true">…</span> : null}
              <button type="button" disabled={loading} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number + 1}</button>
            </span>)}
            <button type="button" disabled={loading || currentPage + 1 >= pageCount} aria-label={t("nextPage")} title={t("nextPage")} onClick={() => setPage(currentPage + 1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></button>
          </nav>
        </div>
        {selectedItemIds.size ? (
          <section className="bulk-toolbar" aria-label={t("bulkActions")}>
            <strong>{t("selectedCount", { count: selectedItemIds.size })}</strong>
            <select className="field__input" value={bulkTargetCollectionId} onChange={(event) => setBulkTargetCollectionId(event.target.value)} aria-label={t("bulkMoveTarget")}>
              <option value="uncategorized">{t("uncategorized")}</option>
              {flattenCollections(collections).map(({ collection, depth }) => (
                <option value={collection.id} key={collection.id}>{`${"　".repeat(depth)}${collection.name}`}</option>
              ))}
            </select>
            <button type="button" onClick={() => void moveSelectedItems()}>{t("moveCollection")}</button>
            <button type="button" onClick={() => void setSelectedArchived(true)}>{t("archived")}</button>
            <button type="button" onClick={() => void setSelectedArchived(false)}>{t("unarchive")}</button>
            <button type="button" onClick={() => void deleteSelectedItems()}>{t("delete")}</button>
            <button type="button" onClick={() => setSelectedItemIds(new Set())}>{t("cancelSelection")}</button>
          </section>
        ) : null}
        {bulkError ? <div className="error-panel" role="alert">{bulkError}</div> : null}

        {loading ? (
          <div className="loading">{t("loadingLibrary")}</div>
        ) : visibleItems.length ? (
          <section className="item-list" aria-label={t("savedItems")}>
            {pageItems.map((item) => (
              <ItemRow
                item={item}
                sites={sites}
                key={item.id}
                selected={selectedItemIds.has(item.id)}
                onSelected={(selected) => setSelectedItemIds((current) => toggleSetValue(current, item.id, selected))}
                onMigrate={() => setMigrationItem(item)}
                onEdit={() => setEditingItem(item)}
                onDelete={() => void deleteItem(item)}
                onArchive={() => void runBulkAction(() => readingLibrary.bulkSetArchived([item.id], !item.isArchived))}
                onOpened={(updated) => setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))}
              />
            ))}
          </section>
        ) : (
          <section className="empty-library">
            <div>
              <h2>{items.length ? t("noMatchingItems") : t("emptyLibrary")}</h2>
              <p>{items.length ? t("adjustFilters") : t("emptyLibraryHint")}</p>
            </div>
          </section>
        )}
        </>}
      </main>
      {migrationItem ? (
        <ItemMigrationDialog
          item={migrationItem}
          sites={sites}
          onClose={() => setMigrationItem(null)}
          onMigrated={(updated) => {
            setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
            setMigrationItem(null);
            requestActionIconRefresh();
          }}
        />
      ) : null}
      {editingItem ? <ItemEditorDialog item={editingItem} collections={collections} onClose={() => setEditingItem(null)} onSaved={(updated) => { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingItem(null); requestActionIconRefresh(); }} /> : null}
    </div>
  );

  async function deleteItem(item: Item): Promise<void> {
    if (!window.confirm(t("deleteItemQuestion", { title: item.title }))) return;
    try { await readingLibrary.deleteItem(item.id); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); requestActionIconRefresh(); }
    catch (deleteError) { setBulkError(localizeError(deleteError)); }
  }
}

function NavItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`library-nav__item${active ? " library-nav__item--active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {count === undefined ? null : <span>{count}</span>}
    </button>
  );
}

function ItemRow({
  item,
  sites,
  selected,
  onSelected,
  onMigrate,
  onEdit,
  onDelete,
  onArchive,
  onOpened,
}: {
  item: Item;
  sites: Site[];
  selected: boolean;
  onSelected: (selected: boolean) => void;
  onMigrate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onOpened: (item: Item) => void;
}) {
  const itemDateFormatter = useMemo(() => new Intl.DateTimeFormat(getLocale(), { month: "2-digit", day: "2-digit" }), [getLocale()]);
  const tone = item.readingState === "read" ? "success" : item.readingState === "reading" ? "info" : "warning";
  const label = item.readingState === "read" ? t("read") : item.readingState === "reading" ? t("reading") : t("unread");
  const site = sites.find((candidate) => candidate.id === item.siteId);
  const defaultUrl = site && item.resourceKey ? resolveResourceUrl(site, item.resourceKey) ?? item.originalUrl : item.originalUrl;
  function recordOpen(url: string): void { void readingLibrary.recordItemOpened(item.id, url).then(onOpened); }
  function openAlternative(value: string): void {
    if (!value) return;
    window.open(value, "_blank", "noopener");
    recordOpen(value);
  }
  return (
    <article className="item-row">
      <input type="checkbox" checked={selected} onChange={(event) => onSelected(event.target.checked)} aria-label={t("selectItem", { title: item.title })} />
      <div>
        <a className="item-row__title" href={defaultUrl} target="_blank" rel="noreferrer" onClick={() => recordOpen(defaultUrl)}>
          {item.title}
        </a>
        <p className="item-row__note">{item.note || t("noDescription")}</p>
        <p className="item-row__url">{defaultUrl}</p>
      </div>
      <div>
        <Badge tone={tone}>{label}</Badge>
        {item.firstReadAt && item.readingState !== "read" ? <Badge tone="success">{t("readBefore")}</Badge> : null}
      </div>
      <div className="item-row__tags">
        {item.tags.length ? item.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="muted">{t("noTags")}</span>}
      </div>
      <time className="item-row__date muted" dateTime={item.createdAt}>
        {itemDateFormatter.format(new Date(item.createdAt))}
      </time>
      <div className="item-row__actions">
        <span className="muted">{site?.name ?? t("unassigned")}</span>
        {site && item.resourceKey ? <select className="item-row__endpoint" aria-label={t("chooseOpenAddress", { title: item.title })} defaultValue="" onChange={(event) => { openAlternative(event.target.value); event.target.value = ""; }}><option value="">{t("openWith")}</option>{site.endpoints.filter((endpoint) => endpoint.enabled).sort((left, right) => left.priority - right.priority).map((endpoint) => <option key={endpoint.id} value={resolveResourceUrlWithEndpoint(endpoint, item.resourceKey!)}>{new URL(endpoint.prefix).host}</option>)}</select> : null}
        <button type="button" onClick={onEdit}>{t("edit")}</button>
        <button type="button" onClick={onMigrate}>{t("migrate")}</button>
        <button type="button" onClick={onArchive}>{item.isArchived ? t("unarchive") : t("archived")}</button>
        <button type="button" className="item-row__delete" onClick={onDelete}>{t("delete")}</button>
      </div>
    </article>
  );
}

function toggleSetValue(current: Set<string>, value: string, checked: boolean): Set<string> {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}


const PAGE_SIZES = [25, 50, 100, 200];
