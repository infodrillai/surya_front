import { alpha, createTheme } from '@mui/material/styles';

// Shared presentation tokens for the manufacturing workspace.
export const palette = { ink: '#14243a', inkSoft: '#203652', teal: '#1769aa', paper: '#f3f6fa', line: '#dce3ec' };

export const theme = createTheme({
  palette: {
    primary: { main: palette.teal, light: '#e7f1fb', dark: '#124f82' },
    secondary: { main: '#b45309' },
    success: { main: '#16734a' },
    warning: { main: '#a34b0a' },
    error: { main: '#b42336' },
    info: { main: '#1769aa' },
    background: { default: palette.paper, paper: '#ffffff' },
    text: { primary: '#1c2938', secondary: '#637184' },
    divider: palette.line,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", "Helvetica Neue", Roboto, system-ui, sans-serif',
    h5: { fontWeight: 700, letterSpacing: '-0.025em' },
    h6: { fontWeight: 650, letterSpacing: '-0.015em' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, minHeight: 36, paddingInline: 14 } },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
        }),
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { border: `1px solid ${palette.line}`, boxShadow: '0 2px 10px rgba(22, 40, 64, 0.045)' } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#fff',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#aab8ca' },
        },
        notchedOutline: { borderColor: palette.line },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginInline: 0, marginTop: 5 } } },
    MuiFormLabel: { styleOverrides: { asterisk: ({ theme }) => ({ color: theme.palette.error.main }) } },
    MuiTableContainer: {
      styleOverrides: {
        root: { maxWidth: '100%', minWidth: 0, scrollbarWidth: 'thin', scrollbarColor: '#aab8ca transparent' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#e8edf3' },
        alignRight: { fontVariantNumeric: 'tabular-nums' },
        sizeSmall: { paddingBlock: 8 },
        head: { fontWeight: 650, color: '#43536a', background: '#f1f4f8', whiteSpace: 'nowrap' },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&:last-child td': { borderBottom: 0 } } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiTablePagination: {
      styleOverrides: {
        root: { borderTop: `1px solid ${palette.line}` },
        toolbar: ({ theme }) => ({
          gap: 4,
          [theme.breakpoints.down('sm')]: {
            flexWrap: 'wrap', justifyContent: 'flex-end', paddingInline: 8,
            '& .MuiTablePagination-spacer': { display: 'none' },
            '& .MuiTablePagination-actions': { marginLeft: 0 },
            '& .MuiTablePagination-select': { marginRight: 4 },
          },
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          border: `1px solid ${palette.line}`,
          boxShadow: '0 18px 55px rgba(22, 40, 64, 0.18)',
          [theme.breakpoints.down('sm')]: {
            '&:not(.MuiDialog-paperFullScreen)': {
              margin: 8, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)',
            },
          },
        }),
        paperFullScreen: { border: 0 },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, overflowWrap: 'anywhere' } } },
    MuiDialogActions: {
      styleOverrides: {
        root: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16 },
        spacing: { '& > :not(style) ~ :not(style)': { marginLeft: 0 } },
      },
    },
    MuiTab: { styleOverrides: { root: { fontWeight: 650 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    MuiChip: {
      styleOverrides: {
        root: ({ theme, ownerState }) => {
          const color = theme.palette[ownerState.color];
          return {
            borderRadius: 7,
            fontWeight: 650,
            ...(ownerState.variant === 'filled' && color?.dark && {
              color: color.dark,
              backgroundColor: alpha(color.main, 0.11),
            }),
          };
        },
      },
    },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: palette.ink, fontSize: '0.75rem', padding: '6px 9px' } } },
    MuiAlert: { styleOverrides: { root: { alignItems: 'flex-start' }, message: { overflowWrap: 'anywhere' } } },
    MuiCssBaseline: { styleOverrides: { '#root': { minHeight: '100vh' } } },
  },
});
