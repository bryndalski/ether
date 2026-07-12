import { useState } from "react";
import type { JwtCandidate } from "../../lib/jwt";
import { JwtSourcePicker } from "./JwtSourcePicker";
import { JwtClaimsView } from "./JwtClaimsView";

interface JwtPanelProps {
  candidates: JwtCandidate[];
}

/** The `JWT` dock tab — picks among detected tokens and renders the claims. */
export function JwtPanel({ candidates }: JwtPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (candidates.length === 0) return null;
  const index = Math.min(selectedIndex, candidates.length - 1);
  const candidate = candidates[index];

  return (
    <div className="dv-panel">
      <JwtSourcePicker
        candidates={candidates}
        selectedIndex={index}
        onSelect={setSelectedIndex}
      />
      <JwtClaimsView token={candidate.token} />
    </div>
  );
}
