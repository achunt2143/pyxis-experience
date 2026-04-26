import React from 'react';
import { Box } from '@mui/material';

interface GlassProps {
  children?: React.ReactNode;
  sx?: any;
  [key: string]: any;
}

export const Glass: React.FC<GlassProps> = ({ children, sx, ...props }) => {
  return (
    <Box
      sx={{
        background: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(15px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.1)',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};