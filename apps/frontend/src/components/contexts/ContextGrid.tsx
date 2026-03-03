import { SimpleGrid } from '@mantine/core';
import type { ReactNode } from 'react';

export interface ContextGridProps {
  children: ReactNode;
  /** Spalten (Responsive). Default: 1 / 2 / 3. */
  cols?: { base?: number; xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
}

const defaultCols = { base: 1, sm: 2, md: 3 };

export function ContextGrid({ children, cols = defaultCols }: ContextGridProps) {
  return <SimpleGrid cols={cols}>{children}</SimpleGrid>;
}
