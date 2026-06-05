"use client";

import { MapPlus } from "lucide-react";
import type { TransmissionMap } from "@/lib/types/assets";

type TransmissionMapSelectorProps = {
  maps: TransmissionMap[];
  activeMapId: string;
  onChange: (mapId: string) => void;
  onCreateNew: () => void;
};

export function TransmissionMapSelector({ maps, activeMapId, onChange, onCreateNew }: TransmissionMapSelectorProps) {
  return (
    <section className="transmission-map-selector" aria-label="Active transmission map selector">
      <label>
        <span>Active Transmission Map</span>
        <select value={activeMapId} onChange={(event) => event.target.value === "__new" ? onCreateNew() : onChange(event.target.value)}>
          {maps.map((map) => <option value={map.id} key={map.id}>{map.name}</option>)}
          <option value="__new">New Custom Map</option>
        </select>
      </label>
      <button className="telecom-map-button" type="button" onClick={onCreateNew}><MapPlus size={15} />Create Transmission Map</button>
    </section>
  );
}
