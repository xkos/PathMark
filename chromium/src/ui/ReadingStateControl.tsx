import type { ReadingState } from "../domain/models";
import { t } from "../i18n";

const OPTIONS: { value: ReadingState; label: "unread" | "reading" | "read" }[] = [
  { value: "unread", label: "unread" }, { value: "reading", label: "reading" }, { value: "read", label: "read" },
];

interface ReadingStateControlProps {
  value: ReadingState;
  onChange: (state: ReadingState) => void;
}

export function ReadingStateControl({ value, onChange }: ReadingStateControlProps) {
  return (
    <div className="segmented" role="group" aria-label={t("readingState")}>
      {OPTIONS.map((option) => (
        <button
          className="segmented__option"
          type="button"
          aria-pressed={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}
