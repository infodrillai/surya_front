export const STAGE_DISPLAY = {
  Raw: 'Raw Material',
  'Stage 1': 'Stage 1 (Insert / Roll Creation)',
  'Stage 2': 'Stage 2 (PU Casting / Roll Sizing)',
  'Stage 3': 'Stage 3 (CNC / Roll Finished)',
  'Stage 4': 'Stage 4 (Charges)',
  Finished: 'Finished Goods',
};

export const DISPLAY_TO_INTERNAL = {
  'Raw Material': 'Raw',
  Raw: 'Raw',
  // PU batch labels
  'Stage 1 (Insert Making)': 'Stage 1',
  'Insert Making': 'Stage 1',
  Insert: 'Stage 1',
  'Stage 1': 'Stage 1',
  'Stage 2 (PU & Casting)': 'Stage 2',
  'Stage 2 (PU Casting / Roll Sizing)': 'Stage 2',
  'PU & Casting': 'Stage 2',
  Casting: 'Stage 2',
  'Stage 2': 'Stage 2',
  'Stage 3 (CNC)': 'Stage 3',
  'Stage 3 (CNC / Roll Finished)': 'Stage 3',
  'CNC / Charge': 'Stage 3',
  CNC: 'Stage 3',
  'Stage 3': 'Stage 3',
  // Belt batch labels
  'Stage 1 (Insert / Roll Creation)': 'Stage 1',
  'Stage 1 (Roll Creation)': 'Stage 1',
  'Roll Creation': 'Stage 1',
  'Stage 2 (Roll Sizing)': 'Stage 2',
  'Roll Sizing': 'Stage 2',
  'Stage 3 (Roll Finished)': 'Stage 3',
  'Roll Finished': 'Stage 3',
  'Stage 4 (Charges)': 'Stage 4',
  'Stage 4': 'Stage 4',
  Charges: 'Stage 4',
  // Finished
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
