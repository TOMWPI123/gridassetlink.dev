"use client";

import { AlertTriangle, ExternalLink, ShieldAlert, TableProperties, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { dataSourceRecords, dataSourceSafetyNotes } from "@/data/dataSources";

const ACKNOWLEDGED_KEY = "gridassetlink_demo_disclaimer_acknowledged";
const ACKNOWLEDGED_AT_KEY = "gridassetlink_demo_disclaimer_acknowledged_at";

type DemoDisclaimerGateProps = {
  children: React.ReactNode;
};

export function DemoDisclaimerGate({ children }: DemoDisclaimerGateProps) {
  const [loaded, setLoaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(ACKNOWLEDGED_KEY);
    const hasAcknowledged = storedValue === "true";
    setAcknowledged(hasAcknowledged);
    setShowDisclaimer(!hasAcknowledged);
    setLoaded(true);

    function handleOpenDisclaimer() {
      setShowDisclaimer(true);
    }

    function handleOpenSources() {
      setShowSources(true);
    }

    window.addEventListener("gridassetlink:open-demo-disclaimer", handleOpenDisclaimer);
    window.addEventListener("gridassetlink:open-data-sources", handleOpenSources);
    return () => {
      window.removeEventListener("gridassetlink:open-demo-disclaimer", handleOpenDisclaimer);
      window.removeEventListener("gridassetlink:open-data-sources", handleOpenSources);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !showDisclaimer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loaded, showDisclaimer]);

  function acknowledge() {
    window.localStorage.setItem(ACKNOWLEDGED_KEY, "true");
    window.localStorage.setItem(ACKNOWLEDGED_AT_KEY, new Date().toISOString());
    setAcknowledged(true);
    setShowDisclaimer(false);
  }

  const gateActive = loaded && showDisclaimer;

  return (
    <>
      <div aria-hidden={gateActive ? "true" : undefined} className={gateActive ? "demo-disclaimer-page-blocked" : undefined}>
        {children}
        <DemoDisclaimerFooter />
      </div>
      {loaded && showDisclaimer ? (
        <DemoDisclaimerModal
          acknowledged={acknowledged}
          onAcknowledge={acknowledge}
          onOpenSources={() => setShowSources(true)}
          onCloseAcknowledged={() => setShowDisclaimer(false)}
        />
      ) : null}
      {loaded && showSources ? <OpenSourceSourcesModal onClose={() => setShowSources(false)} /> : null}
    </>
  );
}

export function DemoDisclaimerFooter() {
  return (
    <footer className="demo-disclaimer-footer" aria-label="GridAssetLink demo safety links">
      <span>Demo planning data only. Public reference layers and synthetic records are not authoritative and must not be used for real utility, telecom, SCADA, relay, protection, outage, or engineering decisions.</span>
      <button type="button" onClick={() => openDemoDisclaimer("disclaimer")}>Demo Disclaimer</button>
      <button type="button" onClick={() => openDemoDisclaimer("sources")}>Open-Source Data Sources</button>
    </footer>
  );
}

function DemoDisclaimerModal({
  acknowledged,
  onAcknowledge,
  onOpenSources,
  onCloseAcknowledged,
}: {
  acknowledged: boolean;
  onAcknowledge: () => void;
  onOpenSources: () => void;
  onCloseAcknowledged: () => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const acknowledgeButtonRef = useRef<HTMLButtonElement | null>(null);

  useModalFocusTrap(modalRef, !acknowledged, acknowledgeButtonRef);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (acknowledged) onCloseAcknowledged();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [acknowledged, onCloseAcknowledged]);

  return (
    <div className="demo-disclaimer-overlay" role="presentation">
      <section
        aria-describedby="demo-disclaimer-body"
        aria-labelledby="demo-disclaimer-title"
        aria-modal="true"
        className="demo-disclaimer-modal"
        ref={modalRef}
        role="dialog"
      >
        <div className="demo-disclaimer-header">
          <span className="demo-disclaimer-icon" aria-hidden="true"><ShieldAlert size={22} /></span>
          <div>
            <div className="demo-disclaimer-kicker"><AlertTriangle size={14} /> Required acknowledgement</div>
            <h1 id="demo-disclaimer-title">GridAssetLink Demo Disclaimer</h1>
          </div>
        </div>
        <div className="demo-disclaimer-body" id="demo-disclaimer-body">
          <p>GridAssetLink / TelecomNE is a synthetic demonstration and planning concept tool. This website is not an official utility system, engineering database, telecom inventory, protection system record, SCADA system, fiber management system, outage management system, or operational planning tool.</p>
          <p>All information shown in this website is for demonstration purposes only. Public reference information may be derived from open-source public datasets, and additional substations, transmission structures, OPGW routes, splice closures, fiber assignments, telecom circuits, work orders, outage impacts, and planning records may be synthetic demo data generated for visualization and software-development purposes.</p>
          <p>This website should not be used for real-world engineering, construction, switching, protection, telecom, SCADA, relay, outage, asset-management, or utility-planning decisions.</p>
          <p>Do not enter CEII, confidential utility information, real SCADA data, relay/protection settings, private fiber-route information, telecom circuit data, customer information, passwords, credentials, or any sensitive operational data.</p>
          <p>By continuing, you acknowledge that this website is a demo tool and that all displayed information should be treated as non-authoritative demonstration data.</p>
        </div>
        <div className="demo-disclaimer-actions">
          <button className="button demo-secondary" type="button" onClick={onOpenSources}>
            <TableProperties size={16} />
            View Open-Source Data Sources
          </button>
          <button className="button primary demo-primary" type="button" ref={acknowledgeButtonRef} onClick={onAcknowledge}>
            I Understand - Enter Demo
          </button>
        </div>
      </section>
    </div>
  );
}

function OpenSourceSourcesModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const categories = useMemo(() => {
    const uniqueCategories = new Set(dataSourceRecords.map((source) => source.category));
    return Array.from(uniqueCategories);
  }, []);

  useModalFocusTrap(modalRef, true, closeButtonRef);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="demo-disclaimer-overlay sources-overlay" role="presentation">
      <section
        aria-describedby="open-source-sources-body"
        aria-labelledby="open-source-sources-title"
        aria-modal="true"
        className="demo-disclaimer-modal sources-modal"
        ref={modalRef}
        role="dialog"
      >
        <div className="sources-modal-header">
          <div>
            <div className="demo-disclaimer-kicker"><TableProperties size={14} /> Public reference inventory</div>
            <h2 id="open-source-sources-title">Open-Source Data Sources</h2>
          </div>
          <button aria-label="Close open-source data sources" className="icon-button sources-close-button" type="button" ref={closeButtonRef} onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="sources-modal-body" id="open-source-sources-body">
          <p className="sources-intro">The GridAssetLink demo may use public/open-source reference datasets for map visualization and synthetic planning demonstrations. These sources are used only as public references. Public transmission lines, substations, towers, microwave paths, or other map layers do not prove the existence of real private utility telecom assets, OPGW, SCADA paths, relay circuits, protection channels, or operational fiber routes.</p>
          <div className="sources-category-list" aria-label="Source categories">
            {categories.map((category) => <span key={category}>{category}</span>)}
          </div>
          <div className="sources-safety-notes">
            {dataSourceSafetyNotes.map((note) => <p key={note}>{note}</p>)}
          </div>
          <div className="source-card-grid">
            {dataSourceRecords.map((source) => (
              <article className="source-card" key={source.id}>
                <div className="source-card-title">
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.type}</span>
                  </div>
                  {source.url ? (
                    <a aria-label={`Open ${source.name}`} href={source.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
                <p>{source.role}</p>
                <dl>
                  <div><dt>Dataset type</dt><dd>{source.category}</dd></div>
                  <div><dt>Source URL</dt><dd>{source.url || "Synthetic/internal demo generator"}</dd></div>
                  <div><dt>Last reviewed</dt><dd>{source.lastReviewed}</dd></div>
                  <div><dt>Notes</dt><dd>{source.notes}</dd></div>
                </dl>
                <small>{source.handling}</small>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function openDemoDisclaimer(view: "disclaimer" | "sources") {
  window.dispatchEvent(new Event(view === "sources" ? "gridassetlink:open-data-sources" : "gridassetlink:open-demo-disclaimer"));
}

function useModalFocusTrap(
  modalRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  initialFocusRef?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const focusable = getFocusableElements(modal);
    const initialFocus = initialFocusRef?.current || focusable[0] || modal;
    initialFocus?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const elements = getFocusableElements(modalRef.current);
      if (!elements.length) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active, initialFocusRef, modalRef]);
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}
