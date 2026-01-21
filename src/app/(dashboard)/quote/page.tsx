'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface QuoteItem {
  id: number;
  productName: string;
  spec: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export default function QuotePage() {
  const [recipient, setRecipient] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [reference, setReference] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([
    { id: 1, productName: '', spec: '', unit: 'mm', quantity: 0, unitPrice: 0 },
  ]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const quoteRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  // 항목 추가
  const addItem = () => {
    setItems([
      ...items,
      { id: items.length + 1, productName: '', spec: '', unit: 'mm', quantity: 0, unitPrice: 0 },
    ]);
  };

  // 항목 삭제
  const removeItem = (id: number) => {
    if (items.length === 1) return;
    setItems(items.filter((item) => item.id !== id));
  };

  // 항목 수정
  const updateItem = (id: number, field: keyof QuoteItem, value: string | number) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  // 금액 계산
  const calculateAmount = (item: QuoteItem) => {
    return Math.floor(item.quantity * item.unitPrice);
  };

  // 공급가액 합계
  const supplyTotal = items.reduce((sum, item) => sum + calculateAmount(item), 0);

  // 부가세
  const vat = Math.floor(supplyTotal * 0.1);

  // 합계금액
  const totalAmount = supplyTotal + vat;

  // 금액을 한글로 변환
  const numberToKorean = (num: number): string => {
    if (num === 0) return '영';
    const units = ['', '만', '억', '조'];
    const smallUnits = ['', '십', '백', '천'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    let result = '';
    let unitIndex = 0;

    while (num > 0) {
      const chunk = num % 10000;
      if (chunk > 0) {
        let chunkStr = '';
        let tempChunk = chunk;
        let smallUnitIndex = 0;

        while (tempChunk > 0) {
          const digit = tempChunk % 10;
          if (digit > 0) {
            chunkStr = digits[digit] + smallUnits[smallUnitIndex] + chunkStr;
          }
          tempChunk = Math.floor(tempChunk / 10);
          smallUnitIndex++;
        }
        result = chunkStr + units[unitIndex] + result;
      }
      num = Math.floor(num / 10000);
      unitIndex++;
    }

    return result;
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  // PDF 생성
  const generatePDF = async (): Promise<string> => {
    if (!quoteRef.current) throw new Error('견적서 요소를 찾을 수 없습니다.');

    // 숨김 요소들 임시로 숨기기
    const hiddenElements = quoteRef.current.querySelectorAll('.print\\:hidden, .no-print');
    hiddenElements.forEach(el => (el as HTMLElement).style.display = 'none');

    // 모든 요소의 색상을 표준 RGB로 변환 (html2canvas lab 색상 버그 우회)
    const allElements = quoteRef.current.querySelectorAll('*');
    const originalStyles: { el: HTMLElement; color: string; bg: string; borderColor: string }[] = [];

    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const computed = window.getComputedStyle(htmlEl);

      // 원본 스타일 저장
      originalStyles.push({
        el: htmlEl,
        color: htmlEl.style.color,
        bg: htmlEl.style.backgroundColor,
        borderColor: htmlEl.style.borderColor,
      });

      // computed 색상을 인라인 스타일로 적용 (브라우저가 RGB로 변환해줌)
      if (computed.color) {
        htmlEl.style.color = computed.color;
      }
      if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        htmlEl.style.backgroundColor = computed.backgroundColor;
      }
      if (computed.borderColor) {
        htmlEl.style.borderColor = computed.borderColor;
      }
    });

    const canvas = await html2canvas(quoteRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // 원본 스타일 복원
    originalStyles.forEach(({ el, color, bg, borderColor }) => {
      el.style.color = color;
      el.style.backgroundColor = bg;
      el.style.borderColor = borderColor;
    });

    // 숨김 요소 복원
    hiddenElements.forEach(el => (el as HTMLElement).style.display = '');

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
    const imgX = (pdfWidth - imgWidth * ratio) / 2;
    const imgY = 10;

    pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);

    // Base64로 반환
    return pdf.output('datauristring').split(',')[1];
  };

  // 이메일 발송
  const handleSendEmail = async () => {
    if (!recipientEmail) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }

    setSending(true);
    try {
      const quoteNumber = `Q${Date.now()}`;

      // PDF 생성
      const pdfBase64 = await generatePDF();

      const response = await fetch('/api/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          clientName: recipient,
          items: items.map((item) => ({
            description: `${item.productName} (${item.spec})`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: calculateAmount(item),
          })),
          totalAmount,
          quoteNumber,
          pdfBase64,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert('견적서가 PDF로 이메일 발송되었습니다.');
        setEmailDialogOpen(false);
      } else {
        alert(`발송 실패: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('이메일 발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 버튼 영역 - 인쇄시 숨김 */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">견적서 작성</h1>
          <p className="text-gray-500">견적서를 작성하고 인쇄하거나 이메일로 발송합니다</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            인쇄
          </Button>
          <Button onClick={() => setEmailDialogOpen(true)}>
            이메일 발송
          </Button>
        </div>
      </div>

      {/* 견적서 본문 */}
      <Card className="max-w-4xl mx-auto print:shadow-none print:border-2 print:border-black">
        <CardContent className="p-8" ref={quoteRef}>
          {/* 헤더 */}
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm text-gray-600">DATE</div>
            <h1 className="text-3xl font-bold tracking-widest">견 적 서</h1>
            <div></div>
          </div>
          <div className="text-sm mb-6">{formattedDate}</div>

          {/* 수신/공급자 정보 */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            {/* 왼쪽: 수신 정보 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium w-16">수신</span>
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="flex-1 print:border-0 print:border-b print:border-black print:rounded-none"
                  placeholder="거래처명"
                />
                <span className="text-sm">귀하</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium w-16">참조</span>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="flex-1 print:border-0 print:border-b print:border-black print:rounded-none"
                  placeholder="참조"
                />
              </div>
              <div className="flex items-center gap-2 print:hidden no-print">
                <span className="text-sm font-medium w-16">이메일</span>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="flex-1"
                  placeholder="example@email.com"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium w-16">유효기간</span>
                <span className="text-sm">작성일로부터 2달간</span>
              </div>
              <div className="text-sm mt-4">아래와 같이 견적합니다.</div>
            </div>

            {/* 오른쪽: 공급자 정보 */}
            <div className="border border-gray-400 p-4">
              <div className="text-center font-bold mb-3 tracking-widest">공 급 자</div>
              <div className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                <span className="font-medium">상호</span>
                <span>제이 디자인</span>
                <span className="font-medium">등록번호</span>
                <div className="flex justify-between">
                  <span>353-52-00669</span>
                  <div className="flex gap-2">
                    <span className="font-medium">성명</span>
                    <span>이 종 헌</span>
                    <span>(인)</span>
                  </div>
                </div>
                <span className="font-medium">주소</span>
                <span>인천시 부평구 장제로 145 701호</span>
                <span className="font-medium">TEL</span>
                <span>032-508-6954</span>
              </div>
            </div>
          </div>

          {/* 합계금액 */}
          <div className="border-2 border-gray-800 p-3 mb-4 flex items-center">
            <span className="font-bold mr-2">합계금액</span>
            <span className="text-sm">(세액포함)</span>
            <span className="mx-4">일금</span>
            <span className="flex-1 text-center font-bold text-lg">
              {numberToKorean(totalAmount)}
            </span>
            <span className="mx-2">원정</span>
            <span className="font-bold">₩{totalAmount.toLocaleString()}</span>
          </div>

          {/* 견적 항목 테이블 */}
          <table className="w-full border-collapse border border-gray-400 text-sm mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-2 w-32">품명</th>
                <th className="border border-gray-400 p-2 w-40">규격/사양</th>
                <th className="border border-gray-400 p-2 w-16">단위</th>
                <th className="border border-gray-400 p-2 w-16">수량</th>
                <th className="border border-gray-400 p-2 w-24">단가</th>
                <th className="border border-gray-400 p-2 w-28">공급가액</th>
                <th className="border border-gray-400 p-2 w-24">세액</th>
                <th className="border border-gray-400 p-2 w-10 print:hidden no-print"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-gray-400 p-1">
                    <Input
                      value={item.productName}
                      onChange={(e) => updateItem(item.id, 'productName', e.target.value)}
                      className="border-0 h-8 text-center print:bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-400 p-1">
                    <Input
                      value={item.spec}
                      onChange={(e) => updateItem(item.id, 'spec', e.target.value)}
                      className="border-0 h-8 text-center print:bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-400 p-1">
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                      className="border-0 h-8 text-center print:bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-400 p-1">
                    <Input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                      className="border-0 h-8 text-center print:bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-400 p-1">
                    <Input
                      type="number"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                      className="border-0 h-8 text-right print:bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-400 p-2 text-right">
                    {calculateAmount(item).toLocaleString()}
                  </td>
                  <td className="border border-gray-400 p-2 text-right">
                    {Math.floor(calculateAmount(item) * 0.1).toLocaleString()}
                  </td>
                  <td className="border border-gray-400 p-1 print:hidden no-print">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      className="h-6 w-6 p-0 text-red-500"
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 항목 추가 버튼 */}
          <div className="mb-4 print:hidden no-print">
            <Button variant="outline" size="sm" onClick={addItem}>
              + 항목 추가
            </Button>
          </div>

          {/* 합계 영역 */}
          <div className="flex justify-between">
            {/* 계좌정보 */}
            <div className="text-sm space-y-1">
              <div className="font-medium">- 계좌정보</div>
              <div>국민은행 : 이종헌(제이디자인)</div>
              <div>910601-01-492454</div>
            </div>

            {/* 금액 합계 */}
            <div className="border border-gray-400 text-sm">
              <div className="flex border-b border-gray-400">
                <div className="w-28 p-2 bg-gray-100 border-r border-gray-400">공급가액</div>
                <div className="w-32 p-2 text-right">{supplyTotal.toLocaleString()}</div>
              </div>
              <div className="flex border-b border-gray-400">
                <div className="w-28 p-2 bg-gray-100 border-r border-gray-400">부가세액 10%</div>
                <div className="w-32 p-2 text-right">{vat.toLocaleString()}</div>
              </div>
              <div className="flex">
                <div className="w-28 p-2 bg-gray-100 border-r border-gray-400 font-bold">합계금액</div>
                <div className="w-32 p-2 text-right font-bold">{totalAmount.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* 비고 */}
          <div className="mt-6 text-sm space-y-1">
            <div className="font-medium">- 비고</div>
            <div>1. 결제방법 : 계좌이체</div>
          </div>

          {/* 감사 인사 */}
          <div className="mt-8 text-center text-sm">
            감사합니다.
          </div>
        </CardContent>
      </Card>

      {/* 이메일 발송 확인 다이얼로그 */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>견적서 이메일 발송</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
              <div><span className="font-medium">수신:</span> {recipient || '(미입력)'}</div>
              <div><span className="font-medium">이메일:</span> {recipientEmail || '(미입력)'}</div>
              <div><span className="font-medium">합계금액:</span> {totalAmount.toLocaleString()}원</div>
              <div className="text-blue-600">* 견적서가 PDF 파일로 첨부됩니다.</div>
            </div>
            {!recipientEmail && (
              <div>
                <label className="text-sm font-medium">이메일 주소를 입력하세요</label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="mt-1"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSendEmail} disabled={sending || !recipientEmail}>
                {sending ? 'PDF 생성 및 발송 중...' : '발송'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 인쇄용 스타일 */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden, .no-print {
            display: none !important;
          }
          #quote-content, #quote-content * {
            visibility: visible;
          }
          #quote-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
