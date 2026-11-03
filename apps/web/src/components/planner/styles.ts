/** Styles of the planner page, injected with a <style> tag. */
export const PLANNER_CSS = `
        .planner-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 24px;
          align-items: start;
        }
        .planner-sidebar {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding-right: 4px;
          padding-bottom: 24px;
          font-size: 13px;
        }
        .planner-panel {
          background: white;
          border: 1px solid var(--ink-200);
          border-radius: 12px;
          overflow: hidden;
        }
        .planner-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--ink-200);
        }
        .planner-panel-head.collapsed-head {
          border-bottom: 0;
        }
        .planner-panel-head-l {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--ink-500);
        }
        .planner-panel-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-800);
        }
        .planner-panel-body {
          padding: 18px 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .planner-panel-link {
          font-size: 12px;
          font-weight: 500;
          color: var(--horizon-700);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: 0;
          padding: 0;
        }
        .planner-input {
          height: 40px;
          width: 100%;
          padding: 0 12px 0 36px;
          background: var(--paper-50);
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          font-family: var(--f-sans);
          font-size: 13px;
          color: var(--ink-950);
          transition: all .15s;
        }
        .planner-input.no-ico { padding-left: 12px; }
        .planner-input::placeholder { color: var(--ink-500); }
        .planner-input:focus {
          outline: none;
          border-color: var(--horizon-700);
          background: white;
          box-shadow: 0 0 0 3px var(--horizon-100);
        }
        .planner-input-wrap { position: relative; }
        .planner-input-wrap .ico-abs {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%); color: var(--ink-500);
          pointer-events: none;
        }
        .planner-input-clear {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          width: 22px; height: 22px; border-radius: 50%;
          display: grid; place-items: center;
          background: var(--ink-200); color: var(--ink-700);
          cursor: pointer; border: 0;
        }
        .planner-dep-selected {
          padding: 12px 14px;
          background: var(--horizon-100);
          border: 1px solid var(--horizon-600);
          border-radius: 8px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .planner-dep-name {
          display: flex; align-items: center; gap: 8px;
        }
        .planner-dep-name strong {
          font-size: 13px; color: var(--horizon-900); font-weight: 600;
        }
        .planner-dep-meta {
          font-size: 11px; color: var(--horizon-800); opacity: 0.85;
          font-family: var(--f-mono);
        }
        .planner-badge-oaci {
          font-family: var(--f-mono);
          font-weight: 500;
          background: white;
          color: var(--ink-950);
          border: 1px solid var(--ink-300);
          letter-spacing: 0.08em;
          height: 20px; font-size: 10px;
          display: inline-flex; align-items: center;
          padding: 0 7px; border-radius: 4px;
        }
        .planner-ac-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          background: var(--paper-50);
          cursor: pointer;
          transition: all .15s;
        }
        .planner-ac-item:hover { border-color: var(--ink-400); }
        .planner-ac-item.active {
          background: var(--horizon-100);
          border-color: var(--horizon-600);
        }
        .planner-ac-badge {
          width: 30px; height: 30px; border-radius: 6px;
          background: white; border: 1px solid var(--ink-200);
          display: grid; place-items: center;
          color: var(--ink-700); flex-shrink: 0;
        }
        .planner-ac-item.active .planner-ac-badge {
          border-color: var(--horizon-600); color: var(--horizon-700);
        }
        .planner-ac-name {
          font-size: 13px; font-weight: 600; color: var(--ink-950);
          display: flex; align-items: center; gap: 6px;
        }
        .planner-ac-specs {
          font-size: 11px; color: var(--ink-500);
          font-family: var(--f-mono); margin-top: 2px;
        }
        .planner-ac-del {
          width: 28px; height: 28px; border-radius: 6px;
          background: transparent; border: 0; cursor: pointer;
          color: var(--ink-400); display: grid; place-items: center;
          flex-shrink: 0;
        }
        .planner-ac-del:hover { color: oklch(0.45 0.15 25); background: var(--paper-100); }
        .planner-seg {
          display: flex;
          background: var(--paper-100);
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          padding: 3px; gap: 3px;
        }
        .planner-seg button {
          flex: 1; height: 30px;
          background: transparent; border: 0; border-radius: 6px;
          font-size: 12px; font-weight: 500; color: var(--ink-700);
          cursor: pointer; transition: all .15s; font-family: inherit;
        }
        .planner-seg button:hover { color: var(--ink-950); }
        .planner-seg button.active {
          background: white; color: var(--ink-950);
          box-shadow: 0 1px 2px rgba(20,30,50,.06), 0 1px 1px rgba(20,30,50,.04);
        }
        .planner-seg.small button { height: 26px; font-size: 11px; }
        .planner-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .planner-field-label {
          font-size: 11px; color: var(--ink-500); margin-bottom: 4px; font-weight: 500;
        }
        .planner-field-suffix { position: relative; }
        .planner-field-suffix .suffix {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          font-size: 11px; color: var(--ink-500); font-family: var(--f-mono);
          pointer-events: none;
        }
        .planner-field-suffix .planner-input { padding-right: 36px; font-family: var(--f-mono); }
        .planner-check {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: var(--ink-800); cursor: pointer; padding: 4px 0;
        }
        .planner-check input { display: none; }
        .planner-check-box {
          width: 16px; height: 16px; border-radius: 4px;
          border: 1.5px solid var(--ink-300);
          display: grid; place-items: center;
          background: white; flex-shrink: 0;
          transition: all .15s;
        }
        .planner-check input:checked + .planner-check-box {
          background: var(--horizon-700); border-color: var(--horizon-700);
        }
        .planner-check input:checked + .planner-check-box::after {
          content: "";
          width: 8px; height: 5px;
          border-left: 2px solid white; border-bottom: 2px solid white;
          transform: rotate(-45deg) translate(1px, -1px);
        }
        .planner-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 10px;
          font-size: 12px; font-weight: 500;
          border: 1px solid var(--ink-300); border-radius: 999px;
          color: var(--ink-700); background: white;
          cursor: pointer; transition: all .15s;
          font-family: inherit;
        }
        .planner-pill:hover { border-color: var(--ink-400); }
        .planner-pill.active {
          background: var(--horizon-100);
          border-color: var(--horizon-600);
          color: var(--horizon-900);
        }
        .planner-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
        .planner-eyebrow {
          font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: var(--ink-500);
        }
        .planner-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          height: 44px; padding: 0 18px; width: 100%;
          border-radius: 8px; font-family: var(--f-sans); font-size: 14px; font-weight: 500;
          cursor: pointer; border: 0;
          background: var(--horizon-700); color: white;
          transition: background .15s;
        }
        .planner-btn-primary:hover { background: var(--horizon-900); }
        .planner-btn-primary:disabled {
          opacity: 0.5; cursor: not-allowed;
        }
        .planner-btn-secondary {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px; font-family: var(--f-sans); font-size: 12px; font-weight: 500;
          cursor: pointer;
          background: white; color: var(--ink-950);
          border: 1px solid var(--ink-300);
          transition: all .15s;
        }
        .planner-btn-secondary:hover {
          background: var(--paper-100); border-color: var(--ink-400);
        }
        .planner-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px; font-family: var(--f-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; background: transparent; color: var(--ink-700); border: 0;
          transition: all .15s;
        }
        .planner-btn-ghost:hover { background: var(--paper-100); color: var(--ink-950); }
        .planner-suggestions {
          position: absolute; z-index: 20; width: 100%; margin-top: 4px;
          background: white; border: 1px solid var(--ink-200);
          border-radius: 8px; overflow: hidden;
          box-shadow: 0 12px 32px -12px rgba(20,30,50,.18);
        }
        .planner-suggestion-item {
          width: 100%; text-align: left; padding: 10px 14px;
          background: none; border: 0; cursor: pointer;
          border-bottom: 1px solid var(--ink-100);
          font-family: inherit;
        }
        .planner-suggestion-item:last-child { border-bottom: 0; }
        .planner-suggestion-item:hover { background: var(--paper-50); }
        .planner-surface-btn {
          font-size: 11px; border-radius: 4px;
          padding: 4px 8px; border: 1px solid var(--ink-300);
          background: white; color: var(--ink-700);
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .planner-surface-btn.active {
          background: var(--horizon-700); color: white; border-color: var(--horizon-700);
        }
        .planner-home-shortcut {
          width: 100%; text-align: left; font-size: 12px; font-weight: 500;
          border: 1px dashed var(--horizon-600); border-radius: 6px;
          padding: 8px 12px; color: var(--horizon-700);
          background: transparent; cursor: pointer; font-family: inherit;
          transition: background .15s;
        }
        .planner-home-shortcut:hover { background: var(--horizon-50); }

        /* Results */
        .planner-results-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .planner-results-count { font-size: 13px; color: var(--ink-700); }
        .planner-results-count strong { color: var(--ink-950); font-weight: 600; }
        .planner-results-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .planner-warning {
          padding: 10px 14px;
          background: oklch(0.95 0.05 80);
          border: 1px solid oklch(0.85 0.08 80);
          border-radius: 8px;
          font-size: 12px; color: oklch(0.45 0.10 80);
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 16px;
        }
        .planner-error {
          padding: 12px 16px;
          background: oklch(0.96 0.04 25);
          border: 1px solid oklch(0.87 0.08 25);
          border-radius: 8px;
          font-size: 13px; color: oklch(0.45 0.15 25);
          margin-bottom: 16px;
        }
        .planner-empty {
          background: white; border: 1px solid var(--ink-200);
          border-radius: 12px; padding: 64px 32px; text-align: center;
        }
        .planner-region {
          background: white; border: 1px solid var(--ink-200);
          border-radius: 12px; overflow: hidden; margin-bottom: 14px;
        }
        .planner-region-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          background: var(--paper-50); border-bottom: 1px solid var(--ink-200);
          cursor: pointer;
          font-family: var(--f-mono); font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-800);
        }
        .planner-region.collapsed .planner-region-head { border-bottom: 0; }
        .planner-region-count {
          display: inline-grid; place-items: center;
          min-width: 22px; height: 20px; padding: 0 6px;
          background: white; border: 1px solid var(--ink-300);
          border-radius: 999px; font-size: 11px; font-weight: 600;
          color: var(--ink-700); font-family: var(--f-sans); letter-spacing: 0;
        }
        .planner-region-chevron { color: var(--ink-500); transition: transform .2s; }
        .planner-region.collapsed .planner-region-chevron { transform: rotate(-90deg); }
        .result-row {
          display: grid; grid-template-columns: 36px 1fr auto;
          gap: 14px; padding: 16px 20px; align-items: center;
          border-bottom: 1px solid var(--ink-100);
          cursor: pointer; transition: background .15s;
          text-decoration: none;
        }
        .result-row:last-child { border-bottom: 0; }
        .result-row:hover { background: var(--paper-50); }
        .result-ico {
          width: 36px; height: 36px; border-radius: 6px;
          background: var(--paper-100); border: 1px solid var(--ink-200);
          display: grid; place-items: center; color: var(--ink-700);
        }
        .result-ico.ulm { background: var(--terrain-100); border-color: oklch(0.80 0.06 130); color: var(--terrain-800); }
        .result-ico.hydro { background: oklch(0.94 0.05 220); border-color: oklch(0.82 0.06 220); color: oklch(0.45 0.12 220); }
        .result-main { min-width: 0; }
        .result-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
        .result-name { font-size: 14px; font-weight: 600; color: var(--ink-950); letter-spacing: 0.01em; }
        .result-city { font-size: 13px; color: var(--ink-500); }
        .result-line { display: flex; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--ink-500); gap: 0; }
        .result-line span { display: inline-flex; align-items: center; gap: 4px; }
        .result-line .mono { color: var(--ink-700); font-size: 12px; font-family: var(--f-mono); }
        .result-line .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-300); margin: 0 10px; }
        .result-amen { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .amen {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; color: var(--ink-700);
          padding: 3px 8px 3px 7px; border: 1px solid var(--ink-200);
          border-radius: 999px; background: var(--paper-50);
        }
        .amen svg { width: 11px; height: 11px; stroke-width: 1.8; flex-shrink: 0; }
        .amen.fuel { color: var(--horizon-900); background: var(--horizon-100); border-color: oklch(0.85 0.04 250); }
        .result-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
        .result-price { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .result-price-val {
          font-family: var(--f-serif); font-weight: 500;
          font-size: 20px; line-height: 1; color: var(--ink-950); letter-spacing: -0.01em;
        }
        .result-price-val .unit { font-family: var(--f-sans); font-size: 12px; color: var(--ink-500); font-weight: 500; margin-left: 2px; }
        .result-price-sub { font-size: 11px; color: var(--ink-500); font-family: var(--f-mono); }
        .result-right > svg { color: var(--ink-400); }
        .result-row:hover .result-right > svg { color: var(--horizon-700); }
        .badge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
        .badge-oaci { font-family: var(--f-mono); font-weight: 500; background: var(--paper-100); color: var(--ink-950); border: 1px solid var(--ink-300); letter-spacing: 0.08em; height: 20px; font-size: 10px; }
        .badge-vfr { background: var(--vfr-100); color: var(--vfr-700); }
        .badge-warn { background: oklch(0.95 0.06 75); color: oklch(0.45 0.12 60); }
        .badge-night { background: oklch(0.93 0.04 270); color: oklch(0.38 0.12 270); }
        .badge-vfr::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--vfr-500); }

        /* Mobile FAB + drawer */
        .planner-fab {
          display: none; position: fixed; right: 16px; bottom: 20px; z-index: 200;
          height: 48px; padding: 0 20px; border-radius: 999px;
          background: var(--ink-950); color: white; border: 0;
          box-shadow: 0 4px 24px rgba(20,30,50,.35);
          font-size: 14px; font-weight: 600;
          align-items: center; gap: 8px; cursor: pointer; font-family: inherit;
        }
        .planner-scrim {
          position: fixed; inset: 0;
          background: rgba(20,30,50,.5); z-index: 100;
        }
        .planner-sidebar-mobile-head {
          display: none; align-items: center; justify-content: space-between;
          padding-bottom: 14px; margin-bottom: 4px;
          border-bottom: 1px solid var(--ink-200);
        }
        .planner-saved-panel {
          background: white; border: 1px solid var(--ink-200); border-radius: 12px;
          padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
        }
        .planner-saved-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--ink-800);
        }
        .planner-saved-select {
          height: 38px; width: 100%;
          background: var(--paper-50); border: 1px solid var(--ink-200);
          border-radius: 8px; font-family: var(--f-sans); font-size: 13px;
          color: var(--ink-950); padding: 0 12px;
        }

        /* Create profile form */
        .planner-form { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--ink-200); border-radius: 10px; background: var(--paper-50); }

        /* View toggle — large touch targets */
        .planner-view-toggle {
          display: flex; gap: 8px; margin-left: 6px;
        }
        .planner-view-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 36px; padding: 0 14px; min-width: 72px;
          border-radius: 8px; font-family: var(--f-sans); font-size: 13px; font-weight: 500;
          cursor: pointer; border: 1px solid var(--ink-300);
          background: white; color: var(--ink-700);
          transition: all .15s;
        }
        .planner-view-btn.active { background: var(--ink-950); color: white; border-color: var(--ink-950); }
        .planner-view-btn:not(.active):hover { background: var(--paper-100); }

        @media (max-width: 1200px) {
          .planner-layout { grid-template-columns: 290px 1fr; gap: 20px; }
        }
        @media (max-width: 960px) {
          .planner-page-wrap { padding: 20px 16px 32px !important; }
          .planner-page-title { font-size: 24px !important; }
          .planner-page-sub { margin-left: 0 !important; font-size: 13px !important; }
          .planner-page-title-ico { width: 32px !important; height: 32px !important; }
          .planner-layout { grid-template-columns: 1fr; gap: 16px; }
          /* Sidebar rendered inline on mobile/tablet — no overlay, no FAB */
          .planner-sidebar {
            display: flex !important;
            flex-direction: column;
            gap: 12px;
            width: 100%;
            box-sizing: border-box;
          }
          .planner-scrim { display: none !important; }
          .planner-fab { display: none !important; }
          .planner-sidebar-mobile-head { display: none !important; }
          .planner-sidebar .planner-input,
          .planner-sidebar .planner-saved-select,
          .planner-sidebar select { background: white; }
          .result-row { grid-template-columns: 32px 1fr auto; padding: 12px 14px; }
          .planner-results-head { flex-direction: column; align-items: flex-start; gap: 10px; }
          .planner-results-tools { width: 100%; }
        }
        @media (max-width: 640px) {
          .planner-page-wrap { padding: 16px 12px 24px !important; }
          .planner-page-title { font-size: 22px !important; gap: 10px !important; }
          .planner-page-sub { display: none !important; }
          .result-row { grid-template-columns: 1fr; gap: 6px; padding: 12px; }
          .result-ico { display: none; }
          .result-chevron { display: none; }
          .result-right { width: 100%; justify-content: flex-start; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--ink-200); }
          .result-price-val { font-size: 16px; }
          .planner-region-head { padding: 10px 12px; }
          .planner-results-tools { gap: 6px; flex-wrap: wrap; }
          .planner-view-btn { height: 40px; min-width: 80px; font-size: 14px; }
        }
`;
