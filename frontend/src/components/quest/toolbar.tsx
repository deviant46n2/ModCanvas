;

interface ToolbarSectionProps {
  autoGenerate: () => void;
  exportFtbQuests: () => void;
  createQuestAtCursor: (type?: string) => void;
  saveGraph: () => void;
  loadAnalysis: () => void;
  browseModsDir: () => void;
  modsDir: string;
  textureCount: number;
  openBookSettings: () => void;
  onOpenGroups: () => void;
}

export function ToolbarSection({
  autoGenerate, exportFtbQuests, createQuestAtCursor, saveGraph,
  loadAnalysis, browseModsDir, modsDir, textureCount,
  openBookSettings, onOpenGroups,
}: ToolbarSectionProps) {
  return (
    <div className="quest-editor-toolbar">
      <div className="toolbar-section">
        <h3>Quest Designer</h3>
      </div>
      <div className="toolbar-actions">
        <button className="btn-success" onClick={autoGenerate}>Load from Pack</button>
        <button className="btn-success" onClick={exportFtbQuests}>Export as FTB Quests</button>
        <button className="btn-primary" onClick={() => createQuestAtCursor('quest')}>+ Add Quest</button>
        <button className="btn-secondary" onClick={saveGraph}>Save</button>
        <button className="btn-secondary" onClick={loadAnalysis}>Analyze</button>
        <button className="btn-secondary" onClick={browseModsDir}>Mods Dir</button>
        {modsDir && <span className="toolbar-info" title={modsDir}>{textureCount} icons</span>}
        <button className="btn-secondary" onClick={onOpenGroups}>Groups</button>
        <button className="btn-secondary" onClick={openBookSettings}>Book Settings</button>
      </div>
    </div>
  );
}
