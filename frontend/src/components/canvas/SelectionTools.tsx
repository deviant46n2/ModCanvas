import React from 'react';

export interface SelectionToolsProps {
  selectedNodes: Node[];
  onAlignLeft: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignBottom: () => void;
  onAlignCenterH: () => void;
  onAlignCenterV: () => void;
  onEqualSpacingH: () => void;
  onEqualSpacingV: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  visible: boolean;
}

export function SelectionTools({
  selectedNodes,
  onAlignLeft,
  onAlignRight,
  onAlignTop,
  onAlignBottom,
  onAlignCenterH,
  onAlignCenterV,
  onEqualSpacingH,
  onEqualSpacingV,
  onDistributeH,
  onDistributeV,
  visible,
}: SelectionToolsProps) {
  if (!visible || selectedNodes.length < 2) return null;

  return (
    <div className="selection-tools">
      <Tooltip label="Align Left">
        <button className="tool-btn" onClick={onAlignLeft} title="Align Left">
          <AlignIcon dir="left" />
        </button>
      </Tooltip>
      <Tooltip label="Align Right">
        <button className="tool-btn" onClick={onAlignRight} title="Align Right">
          <AlignIcon dir="right" />
        </button>
      </Tooltip>
      <Tooltip label="Align Top">
        <button className="tool-btn" onClick={onAlignTop} title="Align Top">
          <AlignIcon dir="top" />
        </button>
      </Tooltip>
      <Tooltip label="Align Bottom">
        <button className="tool-btn" onClick={onAlignBottom} title="Align Bottom">
          <AlignIcon dir="bottom" />
        </button>
      </Tooltip>
      <div className="tool-separator" />
      <Tooltip label="Center Horizontally">
        <button className="tool-btn" onClick={onAlignCenterH} title="Center Horizontally">
          <AlignIcon dir="center-h" />
        </button>
      </Tooltip>
      <Tooltip label="Center Vertically">
        <button className="tool-btn" onClick={onAlignCenterV} title="Center Vertically">
          <AlignIcon dir="center-v" />
        </button>
      </Tooltip>
      <div className="tool-separator" />
      <Tooltip label="Equal Horizontal Spacing">
        <button className="tool-btn" onClick={onEqualSpacingH} title="Equal Horizontal Spacing">
          <EqSpacingIcon dir="horizontal" />
        </button>
      </Tooltip>
      <Tooltip label="Equal Vertical Spacing">
        <button className="tool-btn" onClick={onEqualSpacingV} title="Equal Vertical Spacing">
          <EqSpacingIcon dir="vertical" />
        </button>
      </Tooltip>
      <Tooltip label="Distribute Horizontally">
        <button className="tool-btn" onClick={onDistributeH} title="Distribute Horizontally">
          <DistributeIcon dir="horizontal" />
        </button>
      </Tooltip>
      <Tooltip label="Distribute Vertically">
        <button className="tool-btn" onClick={onDistributeV} title="Distribute Vertically">
          <DistributeIcon dir="vertical" />
        </button>
      </Tooltip>
    </div>
  );
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <span className="tooltip-text">{label}</span>
    </div>
  );
}

function AlignIcon({ dir }: { dir: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' }) {
  const paths: Record<string, string> = {
    left: 'M4 4h2v16H4zm6 4h2v8h-2zm6-2h2v12h-2z',
    right: 'M18 4h2v16h-2zm-6 4h2v8h-2zm-6-2h2v12H6z',
    top: 'M4 4h16v2H4zm4 6h8v2H8zm-2 6h12v2H6z',
    bottom: 'M4 18h16v2H4zm4-6h8v2H8zm-2-6h12v2H6z',
    'center-h': 'M4 11h16v2H4zm6-4h2v10h-2z',
    'center-v': 'M11 4h2v16h-2zM7 8h10v2H7zm0 6h10v2H7z',
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[dir]} />
    </svg>
  );
}

function EqSpacingIcon({ dir }: { dir: 'horizontal' | 'vertical' }) {
  if (dir === 'horizontal') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="6" width="2" height="12" />
        <rect x="11" y="6" width="2" height="12" />
        <rect x="18" y="6" width="2" height="12" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="12" height="2" />
      <rect x="6" y="11" width="12" height="2" />
      <rect x="6" y="18" width="12" height="2" />
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

function DistributeIcon({ dir }: { dir: 'horizontal' | 'vertical' }) {
  if (dir === 'horizontal') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="6" width="2" height="12" />
        <rect x="11" y="6" width="2" height="12" />
        <rect x="20" y="6" width="2" height="12" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="2" width="12" height="2" />
      <rect x="6" y="11" width="12" height="2" />
      <rect x="6" y="20" width="12" height="2" />
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}


