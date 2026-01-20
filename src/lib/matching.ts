import type { Transaction, BankRecord, MatchResult, GroupMatchResult } from '@/types';

// 문자열 정규화 (공백, 특수문자 제거)
function normalizeString(str: string): string {
  return str
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase();
}

// 거래처명이 입금자명에 포함되는지 확인
function isNameMatch(clientName: string, depositor: string): boolean {
  if (!clientName || !depositor) return false;

  const normalizedClient = normalizeString(clientName);
  const normalizedDepositor = normalizeString(depositor);

  // 부분 일치 확인
  return (
    normalizedDepositor.includes(normalizedClient) ||
    normalizedClient.includes(normalizedDepositor)
  );
}

// 자동 매칭 수행
export function performMatching(
  transactions: Transaction[],
  bankRecords: BankRecord[]
): MatchResult[] {
  const results: MatchResult[] = [];

  // 이미 매칭된 레코드 제외
  const unmatchedRecords = bankRecords.filter((r) => !r.is_matched);

  // 입금 완료되지 않은 거래만 대상 (completed, card 제외)
  const pendingTransactions = transactions.filter(
    (t) => t.status !== 'completed' && t.status !== 'card' && !t.paid_at
  );

  for (const transaction of pendingTransactions) {
    const clientName = transaction.clients?.name || '';

    // 금액 일치 + 거래처명 포함 매칭 (정확 매칭만)
    for (const record of unmatchedRecords) {
      // 이미 이번 매칭에서 사용된 레코드 제외
      if (results.some((r) => r.bankRecord.id === record.id)) continue;

      // 금액 일치 확인
      if (transaction.amount !== record.amount) continue;

      // 같은 연도인지 확인 (주문일과 입금일)
      const depositYear = record.transaction_date.substring(0, 4);
      const orderYear = transaction.order_date?.substring(0, 4);
      if (orderYear && orderYear !== depositYear) continue;

      // 주문일이 입금일 이전인지 확인
      if (transaction.order_date && transaction.order_date > record.transaction_date) continue;

      // 거래처명 매칭 확인 (정확 매칭만 처리)
      if (clientName && isNameMatch(clientName, record.depositor || '')) {
        results.push({
          transaction,
          bankRecord: record,
          matchType: 'exact',
        });
        break;
      }
    }
  }

  return results;
}

// 매칭 적용 (DB 업데이트용 데이터 생성)
export function prepareMatchUpdates(matches: MatchResult[]) {
  return matches.map((match) => ({
    transactionId: match.transaction.id,
    bankRecordId: match.bankRecord.id,
    paidAt: match.bankRecord.transaction_date,
  }));
}

// 거래처의 상위 거래처 ID 가져오기 (같은 그룹으로 묶기 위해)
function getParentClientId(transaction: Transaction): string | null {
  const client = transaction.clients;
  if (!client) return null;
  return client.parent_id || client.id;
}

// 합산 매칭 수행 (같은 거래처의 여러 거래가 하나의 입금에 매칭)
export function performGroupMatching(
  transactions: Transaction[],
  bankRecords: BankRecord[],
  usedRecordIds: Set<string>,
  usedTransactionIds: Set<string>
): GroupMatchResult[] {
  const results: GroupMatchResult[] = [];

  // 이미 매칭된 레코드 제외
  const unmatchedRecords = bankRecords.filter((r) => !r.is_matched && !usedRecordIds.has(r.id));

  // 입금 완료되지 않은 거래만 대상 (이미 단일 매칭된 것 제외)
  const pendingTransactions = transactions.filter(
    (t) => t.status !== 'completed' && t.status !== 'card' && !t.paid_at && !usedTransactionIds.has(t.id)
  );

  // 거래처별로 그룹화 (상위 거래처 기준)
  const transactionsByClient = new Map<string, Transaction[]>();

  for (const t of pendingTransactions) {
    const parentId = getParentClientId(t);
    if (!parentId) continue;

    const existing = transactionsByClient.get(parentId) || [];
    existing.push(t);
    transactionsByClient.set(parentId, existing);
  }

  // 각 통장 입금에 대해 합산 매칭 시도
  for (const record of unmatchedRecords) {
    // 이미 이번 매칭에서 사용된 레코드 제외
    if (results.some((r) => r.bankRecord.id === record.id)) continue;

    const depositor = record.depositor || '';

    // 각 거래처 그룹에 대해
    for (const [parentId, clientTransactions] of transactionsByClient) {
      // 이미 이번 매칭에서 사용된 거래 제외
      const availableTransactions = clientTransactions.filter(
        (t) => !results.some((r) => r.transactions.some((rt) => rt.id === t.id))
      );

      if (availableTransactions.length < 2) continue; // 합산은 2건 이상일 때만

      // 거래처명 확인 (첫 번째 거래의 거래처명으로)
      const clientName = availableTransactions[0].clients?.name || '';
      const parentClient = availableTransactions[0].clients?.parent_id
        ? transactions.find(t => t.clients?.id === availableTransactions[0].clients?.parent_id)?.clients
        : null;
      const displayName = parentClient?.name || clientName;

      if (!isNameMatch(displayName, depositor)) continue;

      // 가능한 모든 조합 찾기 (금액 합이 일치하는)
      const matchingCombination = findMatchingCombination(availableTransactions, record.amount);

      if (matchingCombination && matchingCombination.length >= 2) {
        results.push({
          transactions: matchingCombination,
          bankRecord: record,
          clientName: displayName,
          totalAmount: record.amount,
        });
        break; // 이 입금에 대한 매칭 완료
      }
    }
  }

  return results;
}

// 금액 합이 target과 일치하는 거래 조합 찾기
function findMatchingCombination(
  transactions: Transaction[],
  targetAmount: number
): Transaction[] | null {
  // 금액 기준 내림차순 정렬 (큰 금액부터 시도)
  const sorted = [...transactions].sort((a, b) => b.amount - a.amount);

  // 백트래킹으로 조합 찾기 (최대 10건까지만)
  const maxItems = Math.min(sorted.length, 10);

  function backtrack(index: number, currentSum: number, selected: Transaction[]): Transaction[] | null {
    if (currentSum === targetAmount && selected.length >= 2) {
      return selected;
    }
    if (currentSum > targetAmount || index >= maxItems) {
      return null;
    }

    // 현재 거래 포함
    const withCurrent = backtrack(
      index + 1,
      currentSum + sorted[index].amount,
      [...selected, sorted[index]]
    );
    if (withCurrent) return withCurrent;

    // 현재 거래 미포함
    return backtrack(index + 1, currentSum, selected);
  }

  return backtrack(0, 0, []);
}
