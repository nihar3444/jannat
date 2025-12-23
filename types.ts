
export type Operation = '+' | '-' | '×' | '÷' | '%' | null;

export interface HistoryItem {
  expression: string;
  result: string;
  timestamp: number;
}

export enum ButtonType {
  NUMBER = 'number',
  OPERATOR = 'operator',
  ACTION = 'action',
  EQUALS = 'equals'
}
