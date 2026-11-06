import React from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';

import { getProductBeltProcesses } from '../lib/beltBatchLogic';

export default function BeltBatchHeader({ doc, values, onAdvanceProcess, onOpenCalculator }) {
  const totalProcesses = Number(values?.total_processes || doc?.total_processes || 4);
  const applicableProcesses = getProductBeltProcesses(totalProcesses);

  // Map current_process string or index to active step
  const currentProcessStr = values?.current_process || doc?.current_process || 'Stage 1: Roll Creation';
  let activeStep = 0;
  if (currentProcessStr.includes('Stage 2') || currentProcessStr.includes('Process 2') || currentProcessStr.includes('Sizing')) {
    activeStep = 1;
  } else if (currentProcessStr.includes('Stage 3') || currentProcessStr.includes('Process 3') || currentProcessStr.includes('Finishing')) {
    activeStep = 2;
  } else if (currentProcessStr.includes('Stage 4') || currentProcessStr.includes('Process 4') || currentProcessStr.includes('Charges')) {
    activeStep = 3;
  } else if (currentProcessStr.includes('Completed') || doc?.status === 'Completed') {
    activeStep = applicableProcesses.length;
  }

  const qty = Number(values?.planned_quantity || values?.quantity || doc?.planned_quantity || 0);
  const isCompleted = doc?.status === 'Completed' || activeStep >= applicableProcesses.length;

  return (
    <Stack spacing={2} sx={{ mb: 1 }}>
      {/* 1. Process Progress Stepper */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: '#fafafa',
          borderRadius: '10px',
          borderColor: '#e2e8f0',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LayersOutlinedIcon sx={{ color: '#0369a1', fontSize: 22 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Belt Manufacturing Workflow ({totalProcesses} Processes)
            </Typography>
            <Chip
              size="small"
              label={`${totalProcesses}-Stage Flow`}
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {doc?.status && (
              <Chip
                size="small"
                label={doc.status}
                color={doc.status === 'Completed' ? 'success' : doc.status === 'In Process' ? 'info' : 'default'}
              />
            )}
          </Box>
        </Stack>

        <Stepper activeStep={activeStep} alternativeLabel sx={{ py: 1 }}>
          {applicableProcesses.map((proc, index) => {
            const isFinished = index < activeStep || isCompleted;
            const isCurrent = index === activeStep && !isCompleted;
            return (
              <Step key={proc.key} completed={isFinished}>
                <StepLabel
                  StepIconProps={{
                    sx: {
                      '&.Mui-active': { color: '#0284c7' },
                      '&.Mui-completed': { color: '#16a34a' },
                    },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? '#0369a1' : isFinished ? '#15803d' : 'text.secondary',
                    }}
                  >
                    {proc.shortLabel}
                  </Typography>
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>
      </Paper>


    </Stack>
  );
}

