export const STAGE_DISPLAY = {
  Raw: 'Raw Material',
  // UI-only display labels – internal IDs (Stage 1/2/3) are unchanged
  'Stage 1': 'Stage 1 (Insert Making)',
  'Stage 2': 'Stage 2 (PU & Casting)',
  'Stage 3': 'Stage 3 (CNC)',
  Finished: 'Finished Goods',
};

export const DISPLAY_TO_INTERNAL = {
  'Raw Material': 'Raw',
  Raw: 'Raw',
  // Current and historical labels kept for robust mapping
  'Stage 1 (Insert Making)': 'Stage 1',
  'Insert Making': 'Stage 1',
  Insert: 'Stage 1',
  'Stage 1': 'Stage 1',
  'Stage 2 (PU & Casting)': 'Stage 2',
  'PU & Casting': 'Stage 2',
  Casting: 'Stage 2',
  'Stage 2': 'Stage 2',
  'Stage 3 (CNC)': 'Stage 3',
  'CNC / Charge': 'Stage 3',
  CNC: 'Stage 3',
  'Stage 3': 'Stage 3',
  'Finished Goods': 'Finished',
  Finished: 'Finished',
};

export function toDisplayStage(stage) {
  if (!stage) return '';
  return STAGE_DISPLAY[stage] || stage;
}

export function toInternalStage(displayStage) {
  if (!displayStage) return '';
  return DISPLAY_TO_INTERNAL[displayStage] || displayStage;
}
