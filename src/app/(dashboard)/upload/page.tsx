'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseKBExcel } from '@/lib/parseExcel';
import { performMatching } from '@/lib/matching';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ParsedBankRecord, Transaction, BankRecord, MatchResult, GroupMatchResult } from '@/types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
}

type UploadStep = 'upload' | 'preview' | 'matching' | 'complete';

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('upload');
  const [parsedRecords, setParsedRecords] = useState<ParsedBankRecord[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [groupMatchResults, setGroupMatchResults] = useState<GroupMatchResult[]>([]);
  // 수동 합산 매칭용 상태
  const [unmatchedRecords, setUnmatchedRecords] = useState<BankRecord[]>([]);
  const [unmatchedTransactions, setUnmatchedTransactions] = useState<Transaction[]>([]);
  const [selectedRecordForGroup, setSelectedRecordForGroup] = useState<BankRecord | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const records = parseKBExcel(arrayBuffer);

      if (records.length === 0) {
        setError('입금 내역이 없거나 파일 형식이 올바르지 않습니다.');
        setIsProcessing(false);
        return;
      }

      setParsedRecords(records);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 파싱 중 오류가 발생했습니다.');
    }

    setIsProcessing(false);
  }, []);

  const handleUpload = async () => {
    setIsProcessing(true);
    setError('');

    try {
      // 입금 완료되지 않은 거래 조회
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*, clients(*)')
        .is('paid_at', null)
        .not('status', 'in', '("completed","card")');

      // 파싱된 통장 내역을 BankRecord 형태로 변환
      const bankRecordsFromFile: BankRecord[] = parsedRecords.map((r, index) => ({
        id: `temp-${index}`,
        transaction_date: r.transaction_date,
        description: r.description,
        depositor: r.depositor,
        amount: r.amount,
        balance: r.balance,
        is_matched: false,
        uploaded_at: new Date().toISOString(),
      }));

      // 단일 매칭만 수행
      const matches = performMatching(
        (transactions || []) as Transaction[],
        bankRecordsFromFile
      );

      // 단일 매칭에서 사용된 ID 수집
      const usedRecordIds = new Set(matches.map((m) => m.bankRecord.id));
      const usedTransactionIds = new Set(matches.map((m) => m.transaction.id));

      // 매칭 안 된 입금 목록 (수동 합산 매칭용)
      const unmatched = bankRecordsFromFile.filter((r) => !usedRecordIds.has(r.id));

      // 매칭 안 된 거래 목록 (수동 합산 매칭용)
      const unmatchedTx = (transactions || []).filter(
        (t) => !usedTransactionIds.has(t.id)
      ) as Transaction[];

      setMatchResults(matches);
      setGroupMatchResults([]); // 자동 합산 매칭 제거
      setUnmatchedRecords(unmatched);
      setUnmatchedTransactions(unmatchedTx);
      setStep('matching');
    } catch (err) {
      setError(err instanceof Error ? err.message : '매칭 중 오류가 발생했습니다.');
    }

    setIsProcessing(false);
  };

  const handleApplyMatches = async () => {
    setIsProcessing(true);

    try {
      // 단일 매칭 적용
      for (const match of matchResults) {
        await supabase
          .from('transactions')
          .update({
            status: 'completed',
            paid_at: match.bankRecord.transaction_date,
          })
          .eq('id', match.transaction.id);
      }

      // 합산 매칭 적용
      for (const groupMatch of groupMatchResults) {
        for (const transaction of groupMatch.transactions) {
          await supabase
            .from('transactions')
            .update({
              status: 'completed',
              paid_at: groupMatch.bankRecord.transaction_date,
            })
            .eq('id', transaction.id);
        }
      }

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : '매칭 적용 중 오류가 발생했습니다.');
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setStep('upload');
    setParsedRecords([]);
    setMatchResults([]);
    setGroupMatchResults([]);
    setUnmatchedRecords([]);
    setUnmatchedTransactions([]);
    setSelectedRecordForGroup(null);
    setSelectedTransactionIds(new Set());
    setError('');
  };

  // 수동 합산 매칭: 입금 선택
  const handleSelectRecordForGroup = (record: BankRecord) => {
    if (selectedRecordForGroup?.id === record.id) {
      setSelectedRecordForGroup(null);
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedRecordForGroup(record);
      setSelectedTransactionIds(new Set());
    }
  };

  // 수동 합산 매칭: 거래 선택/해제
  const handleToggleTransaction = (transactionId: string) => {
    const newSet = new Set(selectedTransactionIds);
    if (newSet.has(transactionId)) {
      newSet.delete(transactionId);
    } else {
      newSet.add(transactionId);
    }
    setSelectedTransactionIds(newSet);
  };

  // 선택된 거래들의 합계
  const selectedTransactionsTotal = unmatchedTransactions
    .filter((t) => selectedTransactionIds.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  // 수동 합산 매칭 확정
  const handleConfirmGroupMatch = () => {
    if (!selectedRecordForGroup || selectedTransactionIds.size < 2) return;

    const selectedTxs = unmatchedTransactions.filter((t) =>
      selectedTransactionIds.has(t.id)
    );

    // 합계 금액 확인
    if (selectedTransactionsTotal !== selectedRecordForGroup.amount) {
      setError(
        `선택한 거래 합계(${formatCurrency(selectedTransactionsTotal)})가 입금액(${formatCurrency(selectedRecordForGroup.amount)})과 일치하지 않습니다.`
      );
      return;
    }

    const clientName = selectedTxs[0]?.clients?.name || '알 수 없음';

    // 합산 매칭 결과에 추가
    const newGroupMatch: GroupMatchResult = {
      transactions: selectedTxs,
      bankRecord: selectedRecordForGroup,
      clientName,
      totalAmount: selectedRecordForGroup.amount,
    };

    setGroupMatchResults([...groupMatchResults, newGroupMatch]);

    // 사용된 입금/거래를 미매칭 목록에서 제거
    setUnmatchedRecords(
      unmatchedRecords.filter((r) => r.id !== selectedRecordForGroup.id)
    );
    setUnmatchedTransactions(
      unmatchedTransactions.filter((t) => !selectedTransactionIds.has(t.id))
    );

    // 선택 초기화
    setSelectedRecordForGroup(null);
    setSelectedTransactionIds(new Set());
    setError('');
  };

  // 합산 매칭 취소
  const handleCancelGroupMatch = (index: number) => {
    const groupMatch = groupMatchResults[index];

    // 입금과 거래를 미매칭 목록으로 복구
    setUnmatchedRecords([...unmatchedRecords, groupMatch.bankRecord]);
    setUnmatchedTransactions([...unmatchedTransactions, ...groupMatch.transactions]);

    // 합산 매칭 목록에서 제거
    setGroupMatchResults(groupMatchResults.filter((_, i) => i !== index));
  };

  // 총 매칭 건수 계산
  const totalMatchCount = matchResults.length + groupMatchResults.reduce((acc, g) => acc + g.transactions.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">통장 내역 업로드</h1>
        <p className="text-gray-500">
          국민은행 기업통장 엑셀 파일을 업로드하여 입금 내역을 자동으로 매칭합니다
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Step 1: 파일 업로드 */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>엑셀 파일 업로드</CardTitle>
            <CardDescription>
              국민은행 기업통장에서 다운로드한 거래내역 엑셀 파일을 선택하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-blue-600 hover:text-blue-800"
              >
                {isProcessing ? (
                  '파일 처리 중...'
                ) : (
                  <>
                    <span className="text-lg font-medium">
                      클릭하여 파일 선택
                    </span>
                    <p className="text-sm text-gray-500 mt-2">
                      .xlsx, .xls, .csv 파일 지원
                    </p>
                  </>
                )}
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: 미리보기 */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>업로드 미리보기</CardTitle>
            <CardDescription>
              {parsedRecords.length}건의 입금 내역이 확인되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래일자</TableHead>
                    <TableHead>입금자</TableHead>
                    <TableHead>적요</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRecords.slice(0, 20).map((record, index) => (
                    <TableRow key={index}>
                      <TableCell>{record.transaction_date}</TableCell>
                      <TableCell>{record.depositor}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {record.description}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(record.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRecords.length > 20 && (
              <p className="text-sm text-gray-500 text-center">
                외 {parsedRecords.length - 20}건...
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReset}>
                취소
              </Button>
              <Button onClick={handleUpload} disabled={isProcessing}>
                {isProcessing ? '처리 중...' : '업로드 및 매칭'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 매칭 결과 */}
      {step === 'matching' && (
        <Card>
          <CardHeader>
            <CardTitle>매칭 결과</CardTitle>
            <CardDescription>
              단일 매칭 {matchResults.length}건, 합산 매칭 {groupMatchResults.length}건 (총 {totalMatchCount}건 거래)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {matchResults.length === 0 && groupMatchResults.length === 0 ? (
              <p className="text-center py-8 text-gray-500">
                매칭된 거래가 없습니다
              </p>
            ) : (
              <>
                {/* 단일 매칭 결과 */}
                {matchResults.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">단일 매칭 ({matchResults.length}건)</h3>
                    <div className="max-h-64 overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>거래처</TableHead>
                            <TableHead>거래 설명</TableHead>
                            <TableHead>입금자</TableHead>
                            <TableHead className="text-right">금액</TableHead>
                            <TableHead>매칭</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {matchResults.map((match, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {match.transaction.clients?.name || '-'}
                              </TableCell>
                              <TableCell>
                                {match.transaction.description || '-'}
                              </TableCell>
                              <TableCell>{match.bankRecord.depositor}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(match.transaction.amount)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="default">매칭</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* 합산 매칭 결과 (수동으로 추가된 것) */}
                {groupMatchResults.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">합산 매칭 ({groupMatchResults.length}건)</h3>
                    <div className="space-y-4">
                      {groupMatchResults.map((groupMatch, groupIndex) => (
                        <div key={groupIndex} className="border rounded-lg p-4 bg-blue-50">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <span className="font-medium text-blue-700">{groupMatch.clientName}</span>
                              <span className="text-gray-500 ml-2">({groupMatch.transactions.length}건 합산)</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-sm text-gray-500">입금: {groupMatch.bankRecord.depositor}</div>
                                <div className="font-bold text-blue-700">{formatCurrency(groupMatch.totalAmount)}</div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelGroupMatch(groupIndex)}
                              >
                                취소
                              </Button>
                            </div>
                          </div>
                          <div className="bg-white rounded border overflow-auto max-h-40">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>거래 설명</TableHead>
                                  <TableHead className="text-right">금액</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groupMatch.transactions.map((t, tIndex) => (
                                  <TableRow key={tIndex}>
                                    <TableCell>{t.description || t.item_name || '-'}</TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatCurrency(t.amount)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 수동 합산 매칭 UI */}
            {unmatchedRecords.length > 0 && unmatchedTransactions.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="font-medium text-gray-700 mb-4">수동 합산 매칭</h3>
                <p className="text-sm text-gray-500 mb-4">
                  매칭되지 않은 입금 {unmatchedRecords.length}건, 미완료 거래 {unmatchedTransactions.length}건
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* 왼쪽: 매칭 안 된 입금 목록 */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2">매칭 안 된 입금 (클릭하여 선택)</h4>
                    <div className="max-h-64 overflow-auto space-y-2">
                      {unmatchedRecords.map((record) => (
                        <div
                          key={record.id}
                          onClick={() => handleSelectRecordForGroup(record)}
                          className={`p-3 border rounded cursor-pointer transition-colors ${
                            selectedRecordForGroup?.id === record.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium">{record.depositor}</div>
                              <div className="text-xs text-gray-500">{record.transaction_date}</div>
                            </div>
                            <div className="font-bold text-blue-600">
                              {formatCurrency(record.amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 오른쪽: 거래 선택 */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2">
                      거래 선택 (2건 이상)
                      {selectedRecordForGroup && (
                        <span className="text-gray-500 ml-2">
                          목표: {formatCurrency(selectedRecordForGroup.amount)}
                        </span>
                      )}
                    </h4>
                    {selectedRecordForGroup ? (
                      <>
                        <p className="text-xs text-gray-400 mb-2">
                          입금일({selectedRecordForGroup.transaction_date}) 이전, 같은 연도 주문만 표시
                        </p>
                        <div className="max-h-48 overflow-auto space-y-1">
                          {unmatchedTransactions
                            .filter((t) => {
                              // 같은 연도인지 확인
                              const depositYear = selectedRecordForGroup.transaction_date.substring(0, 4);
                              const orderYear = t.order_date?.substring(0, 4);
                              if (orderYear && orderYear !== depositYear) return false;

                              // 주문일이 입금일 이전인 거래만 표시
                              if (!t.order_date) return true; // 주문일 없으면 표시
                              return t.order_date <= selectedRecordForGroup.transaction_date;
                            })
                            .map((t) => (
                            <div
                              key={t.id}
                              className={`p-2 border rounded flex items-center gap-2 cursor-pointer transition-colors ${
                                selectedTransactionIds.has(t.id)
                                  ? 'border-green-500 bg-green-50'
                                  : 'hover:bg-gray-50'
                              }`}
                              onClick={() => handleToggleTransaction(t.id)}
                            >
                              <Checkbox
                                checked={selectedTransactionIds.has(t.id)}
                                onCheckedChange={() => handleToggleTransaction(t.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {t.clients?.name || '알 수 없음'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {t.description || t.item_name || '-'}
                                </div>
                              </div>
                              <div className="font-medium text-sm whitespace-nowrap">
                                {formatCurrency(t.amount)}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm">선택 합계:</span>
                            <span
                              className={`font-bold ${
                                selectedTransactionsTotal === selectedRecordForGroup.amount
                                  ? 'text-green-600'
                                  : 'text-gray-600'
                              }`}
                            >
                              {formatCurrency(selectedTransactionsTotal)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-sm">차액:</span>
                            <span
                              className={`font-medium ${
                                selectedRecordForGroup.amount - selectedTransactionsTotal === 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(
                                selectedRecordForGroup.amount - selectedTransactionsTotal
                              )}
                            </span>
                          </div>
                          <Button
                            onClick={handleConfirmGroupMatch}
                            disabled={
                              selectedTransactionIds.size < 2 ||
                              selectedTransactionsTotal !== selectedRecordForGroup.amount
                            }
                            className="w-full"
                          >
                            합산 매칭 확정
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-8">
                        왼쪽에서 입금을 선택하세요
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReset}>
                취소
              </Button>
              {(matchResults.length > 0 || groupMatchResults.length > 0) && (
                <Button onClick={handleApplyMatches} disabled={isProcessing}>
                  {isProcessing ? '적용 중...' : `매칭 적용 (${totalMatchCount}건)`}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: 완료 */}
      {step === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">완료</CardTitle>
            <CardDescription>
              {totalMatchCount}건의 거래가 입금완료 처리되었습니다
              {groupMatchResults.length > 0 && ` (합산 매칭 ${groupMatchResults.length}건 포함)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleReset}>추가 업로드</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
