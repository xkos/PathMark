import type { UrlIdentity } from "../domain/identity";
import { t } from "../i18n";

interface PageIdentityCardProps {
  identity: UrlIdentity;
}

export function PageIdentityCard({ identity }: PageIdentityCardProps) {
  return (
    <section className="identity-card" aria-labelledby="identity-title">
      <h2 className="identity-card__title" id="identity-title">
        {t("identityInfo")}
      </h2>
      <dl className="identity-card__grid">
        <dt>{t("site")}</dt>
        <dd>{identity.siteName ?? t("unassigned")}</dd>
        <dt>{t("endpoint")}</dt>
        <dd>{identity.endpointPrefix ?? t("notMatched")}</dd>
        <dt>{t("resourceKey")}</dt>
        <dd>{identity.resourceKey ?? t("fullUrlIdentity")}</dd>
        <dt>{t("matchMethod")}</dt>
        <dd>{identity.kind === "site" ? t("siteResourceMatch") : t("normalizedUrlMatch")}</dd>
      </dl>
    </section>
  );
}
