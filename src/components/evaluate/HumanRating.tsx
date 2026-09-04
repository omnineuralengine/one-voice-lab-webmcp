"use client";

import type { HumanRating } from "@/lib/evaluation/schema";

import { RATING_DIMENSIONS } from "@/components/evaluate/types";

export function HumanRatingEditor({
  label,
  rating,
  disabled,
  onChange,
}: {
  label: string;
  rating: HumanRating;
  disabled: boolean;
  onChange: (rating: HumanRating) => void;
}) {
  return (
    <fieldset className="evaluate-ratings" disabled={disabled}>
      <legend>Human-rated evidence for {label}</legend>
      {RATING_DIMENSIONS.map((dimension) => (
        <div className="evaluate-rating-row" key={dimension.id}>
          <span>{dimension.label}</span>
          <div aria-label={`${dimension.label} rating`} role="group">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                aria-label={`${value} out of 5`}
                aria-pressed={rating[dimension.id] === value}
                key={value}
                onClick={() => onChange({ ...rating, [dimension.id]: value })}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="evaluate-preference">
        <input
          checked={rating.overallPreference}
          onChange={(event) => onChange({ ...rating, overallPreference: event.target.checked })}
          type="checkbox"
        />
        <span>My overall preference</span>
      </label>
    </fieldset>
  );
}
