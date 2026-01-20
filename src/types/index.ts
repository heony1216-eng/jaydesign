// 거래처
export interface Client {
  id: string;
  name: string;
  parent_id: string | null; // 상위 거래처 ID (그룹화용)
  manager_name: string | null;
  contact: string | null;
  address: string | null;
  memo: string | null;
  created_at: string;
  // 하위 거래처 목록 (조회 시 사용)
  children?: Client[];
}

export interface ClientInsert {
  name: string;
  parent_id?: string | null;
  manager_name?: string | null;
  contact?: string | null;
  address?: string | null;
  memo?: string | null;
}

export interface ClientUpdate {
  name?: string;
  parent_id?: string | null;
  manager_name?: string | null;
  contact?: string | null;
  address?: string | null;
  memo?: string | null;
}

// 거래내역 상태
// quote: 견적문의, design: 시안, production: 제작, completed: 완료 (입금일 입력시 자동), card: 완료(카드)
export type TransactionStatus = 'quote' | 'design' | 'production' | 'completed' | 'card';

// 거래내역
export interface Transaction {
  id: string;
  client_id: string | null;
  manager_name: string | null; // 거래별 담당자
  amount: number;
  base_amount: number | null; // 기본금액 (부가세 제외)
  cost: number | null; // 매출원가 (부가세 포함)
  description: string | null;
  item_name: string | null;
  item_size: string | null;
  item_quantity: number | null; // 수량
  post_processing: string | null;
  order_date: string | null;
  status: TransactionStatus;
  paid_at: string | null;
  quote_sent_at: string | null;
  tax_invoice_sent_at: string | null;
  matched_bank_record_id: string | null;
  created_at: string;
  // Join된 거래처 정보
  clients?: Client | null;
}

export interface TransactionInsert {
  client_id?: string | null;
  manager_name?: string | null;
  amount: number;
  base_amount?: number | null;
  cost?: number | null;
  description?: string | null;
  item_name?: string | null;
  item_size?: string | null;
  item_quantity?: number | null;
  post_processing?: string | null;
  order_date?: string | null;
  quote_sent_at?: string | null;
  tax_invoice_sent_at?: string | null;
  status?: TransactionStatus;
}

export interface TransactionUpdate {
  client_id?: string | null;
  manager_name?: string | null;
  amount?: number;
  base_amount?: number | null;
  cost?: number | null;
  description?: string | null;
  item_name?: string | null;
  item_size?: string | null;
  item_quantity?: number | null;
  post_processing?: string | null;
  order_date?: string | null;
  quote_sent_at?: string | null;
  tax_invoice_sent_at?: string | null;
  status?: TransactionStatus;
  paid_at?: string | null;
  matched_bank_record_id?: string | null;
}

// 통장 내역
export interface BankRecord {
  id: string;
  transaction_date: string;
  description: string | null;
  depositor: string | null;
  amount: number;
  balance: number | null;
  is_matched: boolean;
  uploaded_at: string;
}

export interface BankRecordInsert {
  transaction_date: string;
  description?: string | null;
  depositor?: string | null;
  amount: number;
  balance?: number | null;
  is_matched?: boolean;
}

// 대시보드 요약
export interface DashboardSummary {
  total: number;
  quote: number;
  design: number;
  production: number;
  completed: number;
  overdue: number;
  totalAmount: number;
  quoteAmount: number;
  designAmount: number;
  productionAmount: number;
  completedAmount: number;
  overdueAmount: number;
}

// 매칭 결과 (단일 거래)
export interface MatchResult {
  transaction: Transaction;
  bankRecord: BankRecord;
  matchType: 'exact' | 'partial';
}

// 합산 매칭 결과 (여러 거래가 하나의 입금에 매칭)
export interface GroupMatchResult {
  transactions: Transaction[];
  bankRecord: BankRecord;
  clientName: string;
  totalAmount: number;
}

// 엑셀 파싱 결과
export interface ParsedBankRecord {
  transaction_date: string;
  description: string;
  depositor: string;
  amount: number;
  balance: number | null;
}
