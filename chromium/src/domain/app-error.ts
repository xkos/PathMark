export const APP_ERROR_CODES = [
  "siteNameRequired",
  "duplicateEndpointWithinSite",
  "endpointOwnedBySite",
  "collectionNameRequired",
  "collectionSelfParent",
  "collectionParentMissing",
  "collectionIntoDescendant",
  "collectionDepthExceeded",
  "collectionSiblingDuplicate",
  "collectionCycle",
  "collectionMissing",
  "collectionTargetMissing",
  "endpointInvalidUrl",
  "endpointHasUnsupportedParts",
  "currentPageInvalidUrl",
  "httpOnly",
  "ambiguousEndpoint",
  "remapItemsMissing",
  "remapConflict",
  "savedItemMissing",
  "itemTitleRequired",
  "selectedItemsMissing",
  "importValidationFailed",
  "bookmarkImportValidationFailed",
  "bookmarkAccessUnsupported",
  "bookmarkApiUnavailable",
  "bookmarkHttpOnly",
  "urlInvalid",
  "bookmarkHtmlNoLinks",
  "bookmarkHtmlNoHttpLinks",
  "bookmarkNoLinks",
  "bookmarkNoHttpLinks",
  "bookmarkFolderRequired",
  "collectionPathTooDeep",
  "collectionPathEmptySegment",
  "bookmarkSiteNameRequired",
  "bookmarkSiteMissing",
  "bookmarkSiteEndpointMismatch",
  "bookmarkDuplicatesMerged",
  "bookmarkExistingSkipped",
  "invalidJson",
  "importRootObject",
  "unsupportedFileFormat",
  "unsupportedFormatVersion",
  "appMetadataRequired",
  "validationObject",
  "validationArray",
  "validationUuid",
  "validationUuidOrNull",
  "validationRequired",
  "validationNonNegativeInteger",
  "validationString",
  "validationHttpUrl",
  "validationHttpUrlOrNull",
  "validationBoolean",
  "validationUniqueStrings",
  "validationInvalid",
  "validationIsoDate",
  "validationMissingFields",
  "resourceKeySiteMismatch",
  "readDatesRequired",
  "unreadReadAtNull",
  "queryPolicyInvalid",
  "duplicateSiblingCollection",
  "duplicateId",
  "duplicateEndpoint",
  "createdAfterUpdated",
  "missingReference",
  "duplicateCanonicalKey",
  "duplicateTags",
  "firstReadAfterRead",
  "canonicalKeyMismatch",
  "collectionCycleNamed",
  "collectionTooDeepNamed",
  "mergeMissingReference",
  "collectionImportConflict",
  "siteImportConflictSameEndpoints",
  "siteImportConflictDuplicateEndpoint",
  "itemImportConflict",
  "migrationConflict",
  "siteMissing",
  "unassignConflict",
  "targetSiteMissing",
  "originalUrlNoEndpoint",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
export type AppErrorValues = Record<string, string | number>;

const codeSet = new Set<string>(APP_ERROR_CODES);
const tokenPattern = /\[\[pathmark-error:([A-Za-z]+):([^\]]*)\]\]/g;

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly values: AppErrorValues = {},
  ) {
    super(encodeAppError(code, values));
    this.name = new.target.name;
  }
}

export function appErrorMessage(code: AppErrorCode, values: AppErrorValues = {}): string {
  return new AppError(code, values).message;
}

export function localizeAppErrorTokens(
  message: string,
  render: (code: AppErrorCode, values: AppErrorValues) => string,
): string {
  return message.replace(tokenPattern, (token, rawCode: string, rawValues: string) => {
    if (!codeSet.has(rawCode)) return token;
    try {
      const parsed = JSON.parse(decodeURIComponent(rawValues)) as unknown;
      const values = isErrorValues(parsed) ? parsed : {};
      return render(rawCode as AppErrorCode, values);
    } catch {
      return token;
    }
  });
}

function encodeAppError(code: AppErrorCode, values: AppErrorValues): string {
  return `[[pathmark-error:${code}:${encodeURIComponent(JSON.stringify(values))}]]`;
}

function isErrorValues(value: unknown): value is AppErrorValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string" || typeof entry === "number");
}
