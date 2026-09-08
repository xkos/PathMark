import { useEffect, useSyncExternalStore, type ComponentType } from "react";
import { getLocale, initializeDocument, subscribeLocale } from "../i18n";
import type { MessageKey } from "../i18n/locales/en";

export function LocalizedApp({ component: Component, title }: { component: ComponentType; title: MessageKey }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  useEffect(() => initializeDocument(title), [locale, title]);
  return <Component />;
}
