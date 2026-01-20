import * as XLSX from 'xlsx';
import type { ParsedBankRecord } from '@/types';

// 날짜 형식 정규화 (YYYY-MM-DD)
function normalizeDate(dateValue: string | number | Date): string {
  if (!dateValue) return '';

  // 엑셀 날짜 숫자 형식인 경우
  if (typeof dateValue === 'number') {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  // 문자열인 경우
  const str = String(dateValue).trim();

  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // YYYY.MM.DD HH:MM:SS 형식 (KB은행 새 형식)
  if (/^\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(str)) {
    const datePart = str.split(' ')[0];
    return datePart.replace(/\./g, '-');
  }

  // YYYY.MM.DD 형식
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) {
    return str.replace(/\./g, '-');
  }

  // YYYY/MM/DD 형식
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) {
    return str.replace(/\//g, '-');
  }

  // YYYYMMDD 형식
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }

  return str;
}

// 금액 파싱 (콤마 제거)
function parseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  // 콤마 제거 후 숫자로 변환
  const cleanValue = String(value).replace(/,/g, '').trim();
  const num = parseInt(cleanValue, 10);
  return isNaN(num) ? 0 : num;
}

// 입금자명 추출 (적요에서)
function extractDepositor(description: string): string {
  if (!description) return '';

  // 일반적인 패턴: "입금 홍길동" 또는 "타행이체 홍길동"
  const patterns = [
    /입금\s*(.+)/,
    /타행이체\s*(.+)/,
    /이체\s*(.+)/,
    /무통장입금\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // 패턴 매칭 안되면 전체 적요 반환
  return description.trim();
}

// 국민은행 기업통장 엑셀 파싱
export function parseKBExcel(file: ArrayBuffer): ParsedBankRecord[] {
  const workbook = XLSX.read(file, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // 시트를 JSON으로 변환 (헤더 없이 raw data로)
  const rawData: (string | number)[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  // 헤더 행 찾기 (거래일자, 거래일시 등의 키워드로)
  let headerRowIndex = -1;
  const headerKeywords = ['거래일자', '거래일시', '거래일', '일자', '날짜'];

  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i];
    if (row.some((cell) => headerKeywords.some((kw) => String(cell).includes(kw)))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('헤더를 찾을 수 없습니다. 국민은행 기업통장 엑셀 파일인지 확인해주세요.');
  }

  const headers = rawData[headerRowIndex].map((h) => String(h).trim());

  // 컬럼 인덱스 찾기
  const findColumnIndex = (keywords: string[]): number => {
    return headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  };

  // KB은행 새 형식: 거래일시, 보낸분/받는분, 입금액(원), 잔액(원)
  const dateIndex = findColumnIndex(['거래일시', '거래일자', '거래일', '일자', '날짜']);
  const depositorIndex = findColumnIndex(['보낸분', '받는분', '보낸분/받는분']);
  const descriptionIndex = findColumnIndex(['적요', '내용', '거래내용', '내 통장 표시']);
  const depositIndex = findColumnIndex(['입금액(원)', '입금액', '입금', '받은금액']);
  const withdrawIndex = findColumnIndex(['출금액(원)', '출금액', '출금', '보낸금액']);
  const balanceIndex = findColumnIndex(['잔액(원)', '잔액', '거래후잔액']);

  const records: ParsedBankRecord[] = [];

  // 데이터 행 처리 (헤더 다음 행부터)
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];

    // 빈 행 스킵
    if (!row || row.every((cell) => !cell)) continue;

    const dateValue = row[dateIndex];
    const depositorValue = depositorIndex >= 0 ? String(row[depositorIndex] || '').trim() : '';
    const description = descriptionIndex >= 0 ? String(row[descriptionIndex] || '').trim() : '';
    const depositAmount = depositIndex >= 0 ? parseAmount(row[depositIndex]) : 0;
    const withdrawAmount = withdrawIndex >= 0 ? parseAmount(row[withdrawIndex]) : 0;
    const balance = balanceIndex >= 0 ? parseAmount(row[balanceIndex]) : null;

    // 입금 내역만 처리 (입금액 > 0)
    if (depositAmount <= 0) continue;

    const transactionDate = normalizeDate(dateValue);

    // 유효한 날짜가 아니면 스킵
    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) continue;

    // 입금자명: 보낸분/받는분 컬럼 우선, 없으면 적요에서 추출
    const depositor = depositorValue || extractDepositor(description);

    records.push({
      transaction_date: transactionDate,
      description: description || depositorValue, // 적요가 없으면 입금자명을 적요로
      depositor,
      amount: depositAmount,
      balance,
    });
  }

  return records;
}

// CSV 파싱 (선택사항)
export function parseCSV(content: string): ParsedBankRecord[] {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  // 첫 번째 행을 헤더로
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

  const findColumnIndex = (keywords: string[]): number => {
    return headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  };

  const dateIndex = findColumnIndex(['거래일자', '거래일', '일자']);
  const descriptionIndex = findColumnIndex(['적요', '내용']);
  const depositIndex = findColumnIndex(['입금액', '입금']);
  const balanceIndex = findColumnIndex(['잔액']);

  const records: ParsedBankRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));

    const depositAmount = depositIndex >= 0 ? parseAmount(values[depositIndex]) : 0;
    if (depositAmount <= 0) continue;

    const description = values[descriptionIndex] || '';

    records.push({
      transaction_date: normalizeDate(values[dateIndex]),
      description,
      depositor: extractDepositor(description),
      amount: depositAmount,
      balance: balanceIndex >= 0 ? parseAmount(values[balanceIndex]) : null,
    });
  }

  return records;
}
