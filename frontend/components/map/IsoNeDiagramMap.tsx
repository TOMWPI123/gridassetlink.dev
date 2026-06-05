"use client";

import { ExternalLink, FileText, Info } from "lucide-react";
import type { MapAnnotation } from "@/lib/types/assets";

type IsoNeDiagramMapProps = {
  annotations: MapAnnotation[];
  onSelectAnnotation: (annotation: MapAnnotation) => void;
};

const publicIsoNeUrl = "https://www.iso-ne.com/about/key-stats/maps-and-diagrams";

export function IsoNeDiagramMap({ annotations, onSelectAnnotation }: IsoNeDiagramMapProps) {
  return (
    <section className="iso-diagram-panel" aria-label="ISO-NE planning diagram mode">
      <div className="iso-diagram-header">
        <div>
          <strong>ISO-NE Planning Diagram Mode</strong>
          <span>Static public reference with percentage-based annotations only.</span>
        </div>
        <a className="telecom-map-button" href={publicIsoNeUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Public source</a>
      </div>
      <div className="iso-diagram-canvas">
        <svg viewBox="0 0 1000 620" className="iso-diagram-svg" role="img" aria-label="Static ISO-NE-style public planning diagram reference">
          <defs>
            <linearGradient id="isoDiagramGradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#0f2428" />
              <stop offset="100%" stopColor="#121820" />
            </linearGradient>
          </defs>
          <rect width="1000" height="620" fill="url(#isoDiagramGradient)" />
          <path className="iso-diagram-region" d="M178 122 L428 98 L596 148 L734 104 L878 170 L824 308 L884 430 L716 494 L560 452 L396 522 L226 438 L114 300 Z" />
          <path className="iso-diagram-line kv345" d="M168 352 C302 270 458 236 622 180 S782 180 878 244" />
          <path className="iso-diagram-line kv230" d="M234 432 C344 338 476 318 604 384 S766 436 862 358" />
          <path className="iso-diagram-line kv115" d="M170 236 C300 206 416 264 512 332 S680 384 802 308" />
          <path className="iso-diagram-line proposed" d="M210 458 C326 470 470 438 590 492" />
          {["ME", "NH", "VT", "MA", "RI", "CT"].map((state, index) => (
            <text className="iso-diagram-state" x={180 + index * 132} y={156 + (index % 3) * 106} key={state}>{state}</text>
          ))}
          {annotations.map((annotation) => (
            <g
              className={`iso-annotation ${annotation.status}`}
              transform={`translate(${annotation.xPercent * 10} ${annotation.yPercent * 6.2})`}
              role="button"
              tabIndex={0}
              key={annotation.id}
              onClick={() => onSelectAnnotation(annotation)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectAnnotation(annotation);
                }
              }}
            >
              <circle r="13" />
              <text x="18" y="4">{annotation.label}</text>
            </g>
          ))}
          <text className="iso-diagram-note" x="32" y="584">Public reference diagram mode: xPercent/yPercent annotations only. Street-level lat/lon coordinates are intentionally not used here.</text>
        </svg>
      </div>
      <div className="iso-diagram-disclaimer">
        <Info size={15} />
        <span>This panel is for public regional planning context. It must not be used to infer private telecom routes, protection paths, fiber strands, or CEII-restricted details.</span>
      </div>
      <div className="iso-diagram-annotation-list">
        <div className="street-panel-title"><FileText size={16} />Diagram annotations</div>
        {annotations.map((annotation) => (
          <button type="button" key={annotation.id} onClick={() => onSelectAnnotation(annotation)}>
            <strong>{annotation.label}</strong>
            <span>{annotation.entityType} / {annotation.status} / {annotation.xPercent}% {annotation.yPercent}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}
