# PathMark Chrome Web Store listing

## Product details

Name:

```text
PathMark - Local Reading Library
```

Summary:

```text
A local-first reading library with reading states, collections, notes, and stable site identity.
```

Category: Productivity

Language: English

Official website:

```text
https://pathmark.elenchlab.app/en/
```

Support URL:

```text
https://github.com/xkos/PathMark/issues
```

Detailed description:

```text
PathMark helps you save web pages with the context you will need when you return: an explicit reading state, personal notes, tags, and collections.

Unlike a traditional bookmark folder, PathMark separates a stable Site from its domains and URL prefixes. A Site can contain multiple Endpoints, so when a source changes domains or moves a path, the same resource can retain its reading identity.

Key features:
• Save the current page as unread, reading, or read.
• See saved state directly in the toolbar icon.
• Add notes, tags, and nested collections.
• Group old and new domains under one Site.
• Search, filter, edit, migrate, archive, and delete saved items.
• With your permission, read this browser's bookmarks or import bookmark HTML, then map folder states and sites before writing.
• Export or import the complete library as JSON.

PathMark is local first. There is no account, cloud synchronization, advertising, analytics, or telemetry. Reading-library data remains in IndexedDB inside your browser profile and is not sent to the developer or third parties.
```

## Privacy practices

Single purpose:

```text
PathMark lets users save, recognize, and organize web reading materials locally in their browser using explicit reading states, collections, notes, and stable site endpoints.
```

`tabs` permission justification:

```text
PathMark uses the tabs permission to read a tab's URL and title when recognizing whether the current page is saved, suggesting a matching Site, prefilling the saved title, and keeping the toolbar icon synchronized with the page's unread, read, or archived state. URLs and titles are processed and stored only in the user's local IndexedDB and are not sent to the developer or third parties.
```

Optional `bookmarks` permission justification:

```text
PathMark requests the optional bookmarks permission only after the user clicks “Authorize & read.” It reads bookmark folders, titles, URLs, and saved times solely to build an editable local import preview. PathMark does not call bookmark create, update, move, or remove APIs and never changes the original bookmarks. The data is not sent to the developer or third parties. Denying this permission does not affect HTML import or other core features.
```

Data handled:

- Web browsing activity: the URL, domain, and title of a tab needed for save and recognition, plus bookmark URLs, titles, and folder structure that the user explicitly chooses to import.
- User-generated content: notes, tags, collections, reading states, Sites, and Endpoint rules entered by the user.

Certifications:

- Data is not sold or transferred to third parties.
- Data is not used for advertising, creditworthiness, or lending.
- Data is used only to provide PathMark's disclosed single purpose.
- No remote code, analytics, advertising SDK, or telemetry is included.

Privacy policy:

```text
https://pathmark.elenchlab.app/en/privacy/
```

## Test instructions

```text
No account, credentials, payment, or external service is required.

1. Open any HTTP or HTTPS page.
2. Click the PathMark toolbar icon.
3. Save the page as unread and optionally add a note or tag.
4. Confirm the toolbar icon changes to the unread color.
5. Open the library from the popup to edit the reading state, collections, notes, tags, and Site endpoints.
6. In Sites & endpoints, add another URL prefix to demonstrate stable identity across domains.
7. Under Settings & data, click “Authorize & read,” grant the optional bookmark permission, and confirm the browser bookmark tree appears in the import mapping preview. The extension does not change the original bookmarks.
8. Deny or revoke the permission and confirm HTML import and all other library features remain available.
9. All library data is stored locally in IndexedDB. Import and export are available under Settings & data.
```
