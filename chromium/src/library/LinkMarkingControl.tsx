import { useEffect, useRef, useState } from "react";
import { disableLinkMarking, enableLinkMarking, isLinkMarkingEnabled } from "../browser/link-marking";
import { t } from "../i18n";
export function LinkMarkingControl() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const changing = useRef(false);
  const available = typeof chrome !== "undefined" && Boolean(chrome.scripting && chrome.permissions);
  useEffect(() => {
    if (!available) { setBusy(false); return; }
    let active = true;
    const refresh = () => {
      if (changing.current) return;
      const current = ++revision.current;
      const valid = () => active && current === revision.current && !changing.current;
      void isLinkMarkingEnabled()
        .then((value) => { if (valid()) setEnabled(value); })
        .catch(() => { if (valid()) setError(t("linkMarkingFailed")); })
        .finally(() => { if (valid()) setBusy(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); chrome.permissions.onRemoved.removeListener(refresh); };
  }, [available]);
  async function toggle() {
    if (changing.current) return;
    changing.current = true;
    revision.current++;
    setBusy(true); setError("");
    try {
      if (enabled) { await disableLinkMarking(); setEnabled(false); }
      else {
        const granted = await enableLinkMarking();
        setEnabled(granted);
        if (!granted) setError(t("linkMarkingPermission"));
      }
    } catch { setError(t("linkMarkingFailed")); }
    finally { changing.current = false; setBusy(false); }
  }
  return <section className="transfer-card settings-card settings-link-marking">
    <label className="check-field"><input type="checkbox" checked={enabled} disabled={busy || !available} onChange={() => void toggle()} />{t("markSavedLinks")}</label>
    <p className="muted">{t("linkMarkingPermission")}</p>
    {error ? <small role="alert">{error}</small> : null}
  </section>;
}
