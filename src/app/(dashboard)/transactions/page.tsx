'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Transaction, TransactionInsert, Client, TransactionStatus } from '@/types';

const DELIVERY_FEE = 4000;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR');
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 순이익 계산: 기본금액(부가세제외) - 원가(부가세제외) - 내야할 부가세
// 내야할 부가세 = 받은 부가세 - 매입 부가세
// 순이익 = base_amount * 0.9 - cost * 9/11
function calculateNetProfit(baseAmount: number | null, cost: number | null): number {
  if (!baseAmount) return 0;
  const costExVat = cost ? cost * 9 / 11 : 0;
  return baseAmount * 0.9 - costExVat;
}

// 주문일로부터 한달 지났는지 확인
function isOverdue(orderDate: string | null): boolean {
  if (!orderDate) return false;
  const order = new Date(orderDate);
  const now = new Date();
  const diffTime = now.getTime() - order.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

function getStatusBadge(status: string, orderDate: string | null = null) {
  // 완료/카드가 아니고 한달 넘으면 연체
  if (status !== 'completed' && status !== 'card' && isOverdue(orderDate)) {
    return <Badge variant="destructive">연체</Badge>;
  }
  switch (status) {
    case 'quote':
      return <Badge variant="secondary">견적문의</Badge>;
    case 'design':
      return <Badge className="bg-blue-500 hover:bg-blue-600">시안</Badge>;
    case 'production':
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">제작</Badge>;
    case 'completed':
      return <Badge className="bg-green-500 hover:bg-green-600">완료</Badge>;
    case 'card':
      return <Badge className="bg-purple-500 hover:bg-purple-600">완료(카드)</Badge>;
    default:
      return <Badge variant="secondary">견적문의</Badge>;
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'quote': return '견적문의';
    case 'design': return '시안';
    case 'production': return '제작';
    case 'completed': return '완료';
    case 'card': return '완료(카드)';
    default: return '견적문의';
  }
}

interface FormState {
  client_id?: string;
  manager_name: string;
  baseAmount: number;
  cost: number;
  description: string;
  item_name: string;
  item_size: string;
  item_quantity: number;
  post_processing: string;
  order_date?: string;
  includeVat: boolean;
  includeDelivery: boolean;
  deliveryVat: boolean;
  includeQuick: boolean;
  quickFee: number;
  quickVat: boolean;
}

// 거래처 계층 구조를 위한 헬퍼 타입
interface ClientWithChildren extends Client {
  children?: Client[];
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filter, setFilter] = useState<'all' | TransactionStatus | 'overdue'>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveTargetYear, setMoveTargetYear] = useState<number>(new Date().getFullYear());
  const [moveTargetMonth, setMoveTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [formData, setFormData] = useState<FormState>({
    client_id: undefined,
    manager_name: '',
    baseAmount: 0,
    cost: 0,
    description: '',
    item_name: '',
    item_size: '',
    item_quantity: 0,
    post_processing: '',
    order_date: new Date().toISOString().split('T')[0],
    includeVat: true,
    includeDelivery: false,
    deliveryVat: true,
    includeQuick: false,
    quickFee: 0,
    quickVat: true,
  });
  const supabase = createClient();

  // 총액 계산
  const totalAmount = useMemo(() => {
    let unitPrice = formData.baseAmount;

    if (formData.includeVat) {
      unitPrice = Math.round(unitPrice * 1.1);
    }

    // 수량 적용 (수량이 0이거나 없으면 1로 계산)
    const quantity = formData.item_quantity > 0 ? formData.item_quantity : 1;
    let total = unitPrice * quantity;

    if (formData.includeDelivery) {
      let deliveryTotal = DELIVERY_FEE;
      if (formData.deliveryVat) {
        deliveryTotal = Math.round(deliveryTotal * 1.1);
      }
      total += deliveryTotal;
    }

    if (formData.includeQuick && formData.quickFee > 0) {
      let quickTotal = formData.quickFee;
      if (formData.quickVat) {
        quickTotal = Math.round(quickTotal * 1.1);
      }
      total += quickTotal;
    }

    return total;
  }, [formData]);

  const fetchData = async () => {
    const [transactionsRes, clientsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, clients(*)')
        .order('order_date', { ascending: false, nullsFirst: false }),
      supabase.from('clients').select('*').order('name'),
    ]);
    setTransactions(transactionsRes.data || []);
    setClients(clientsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 상위 거래처 목록 (parent_id가 null인 것들)
  const parentClients = useMemo(() => {
    return clients.filter(c => c.parent_id === null);
  }, [clients]);

  // 거래처 계층 구조로 변환
  const clientTree = useMemo(() => {
    const tree: ClientWithChildren[] = [];
    const parentMap = new Map<string, Client[]>();

    clients.forEach(client => {
      if (client.parent_id) {
        const children = parentMap.get(client.parent_id) || [];
        children.push(client);
        parentMap.set(client.parent_id, children);
      }
    });

    parentClients.forEach(parent => {
      tree.push({
        ...parent,
        children: parentMap.get(parent.id) || []
      });
    });

    return tree;
  }, [clients, parentClients]);

  // 선택된 거래처와 하위 거래처 ID 목록
  const selectedClientIds = useMemo(() => {
    if (selectedClientId === 'all') return null;

    const ids = new Set<string>([selectedClientId]);
    // 하위 거래처들도 포함
    clients.forEach(c => {
      if (c.parent_id === selectedClientId) {
        ids.add(c.id);
      }
    });
    return ids;
  }, [selectedClientId, clients]);

  // 거래처 이름 가져오기 (상위 거래처명만 표시)
  const getClientDisplayName = (client: Client | null | undefined) => {
    if (!client) return '-';
    const parent = clients.find(c => c.id === client.parent_id);
    if (parent) {
      return parent.name;
    }
    return client.name;
  };

  const resetForm = () => {
    setFormData({
      client_id: undefined,
      manager_name: '',
      baseAmount: 0,
      cost: 0,
      description: '',
      item_name: '',
      item_size: '',
      item_quantity: 0,
      post_processing: '',
      order_date: new Date().toISOString().split('T')[0],
      includeVat: true,
      includeDelivery: false,
      deliveryVat: true,
      includeQuick: false,
      quickFee: 0,
      quickVat: true,
    });
    setEditingTransaction(null);
  };

  const handleOpenDialog = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      // 저장된 base_amount가 있으면 그대로 사용, 없으면 역산
      const baseAmount = transaction.base_amount ?? Math.round(transaction.amount / 1.1);
      setFormData({
        client_id: transaction.client_id || undefined,
        manager_name: transaction.manager_name || '',
        baseAmount: baseAmount,
        cost: transaction.cost || 0,
        description: transaction.description || '',
        item_name: transaction.item_name || '',
        item_size: transaction.item_size || '',
        item_quantity: transaction.item_quantity || 0,
        post_processing: transaction.post_processing || '',
        order_date: transaction.order_date || undefined,
        includeVat: true,
        includeDelivery: false,
        deliveryVat: true,
        includeQuick: false,
        quickFee: 0,
        quickVat: true,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  // 거래 복사 (새 거래로 등록)
  const handleCopy = (transaction: Transaction) => {
    setEditingTransaction(null); // 수정이 아닌 새 등록
    // 저장된 base_amount가 있으면 그대로 사용, 없으면 역산
    const baseAmount = transaction.base_amount ?? Math.round(transaction.amount / 1.1);
    setFormData({
      client_id: transaction.client_id || undefined,
      manager_name: transaction.manager_name || '',
      baseAmount: baseAmount,
      cost: transaction.cost || 0,
      description: transaction.description || '',
      item_name: transaction.item_name || '',
      item_size: transaction.item_size || '',
      item_quantity: transaction.item_quantity || 0,
      post_processing: transaction.post_processing || '',
      order_date: transaction.order_date || undefined, // 원본 주문일 복사
      includeVat: true,
      includeDelivery: false,
      deliveryVat: true,
      includeQuick: false,
      quickFee: 0,
      quickVat: true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: TransactionInsert = {
      client_id: formData.client_id || null,
      manager_name: formData.manager_name || null,
      amount: totalAmount,
      base_amount: formData.baseAmount || null,
      cost: formData.cost || null,
      description: formData.description || null,
      item_name: formData.item_name || null,
      item_size: formData.item_size || null,
      item_quantity: formData.item_quantity || null,
      post_processing: formData.post_processing || null,
      order_date: formData.order_date || null,
    };

    if (editingTransaction) {
      await supabase
        .from('transactions')
        .update(data)
        .eq('id', editingTransaction.id);
    } else {
      await supabase.from('transactions').insert(data);
    }

    setIsDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleStatusChange = async (id: string, status: TransactionStatus, paidAt?: string) => {
    const updateData: { status: TransactionStatus; paid_at?: string | null } = { status };
    if (status === 'completed') {
      updateData.paid_at = paidAt || new Date().toISOString().split('T')[0];
    } else {
      updateData.paid_at = null;
    }

    await supabase.from('transactions').update(updateData).eq('id', id);
    fetchData();
  };

  // 입금일 입력시 자동으로 완료 상태로 변경
  const handlePaidAtChange = async (id: string, paidAt: string) => {
    if (paidAt) {
      await supabase.from('transactions').update({
        paid_at: paidAt,
        status: 'completed'
      }).eq('id', id);
    } else {
      await supabase.from('transactions').update({
        paid_at: null
      }).eq('id', id);
    }
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await supabase.from('transactions').delete().eq('id', id);
    fetchData();
  };

  const handleQuoteSent = async (id: string, date: string) => {
    await supabase.from('transactions').update({ quote_sent_at: date || null }).eq('id', id);
    fetchData();
  };

  const handleTaxInvoiceSent = async (id: string, date: string) => {
    await supabase.from('transactions').update({ tax_invoice_sent_at: date || null }).eq('id', id);
    fetchData();
  };

  // 필터링된 거래내역
  const filteredTransactions = transactions
    .filter((t) => {
      // 거래처 필터 (상위 거래처 선택 시 하위 거래처도 포함)
      if (selectedClientIds !== null && t.client_id && !selectedClientIds.has(t.client_id)) {
        return false;
      }
      if (selectedClientIds !== null && !t.client_id) {
        return false;
      }
      // 년/월 필터
      if (t.order_date) {
        const orderDate = new Date(t.order_date);
        if (orderDate.getFullYear() !== selectedYear || orderDate.getMonth() + 1 !== selectedMonth) {
          return false;
        }
      } else {
        // 주문일이 없는 경우 제외
        return false;
      }
      // 상태 필터
      if (filter === 'all') return true;
      // 연체 필터: 완료/카드가 아니고 30일 초과
      if (filter === 'overdue') {
        return t.status !== 'completed' && t.status !== 'card' && isOverdue(t.order_date);
      }
      // 일반 상태 필터에서는 연체가 아닌 것만
      if (t.status !== 'completed' && t.status !== 'card' && isOverdue(t.order_date)) {
        return false; // 연체 건은 연체 탭에서만 표시
      }
      return t.status === filter;
    })
    .sort((a, b) => {
      // 1. 주문일 내림차순 (최신순)
      const dateA = a.order_date || '';
      const dateB = b.order_date || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      // 2. 같은 날짜면 거래처명으로 정렬 (같은 거래처끼리 묶기)
      const nameA = a.clients?.name || '';
      const nameB = b.clients?.name || '';
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB, 'ko');
      }
      // 3. 같은 거래처면 메모로 정렬 (같은 메모끼리 묶기)
      const memoA = a.description || '';
      const memoB = b.description || '';
      return memoA.localeCompare(memoB, 'ko');
    });

  // 선택된 거래 합계
  const selectedTotal = useMemo(() => {
    return filteredTransactions
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions, selectedIds]);

  // 체크박스 토글
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  // 선택한 거래 이동 (년/월 변경)
  const handleMoveTransactions = async (targetYear: number, targetMonth: number) => {
    if (selectedIds.size === 0) {
      alert('이동할 거래를 선택해주세요.');
      return;
    }

    const confirmed = confirm(`선택한 ${selectedIds.size}건을 ${targetYear}년 ${targetMonth}월로 이동하시겠습니까?`);
    if (!confirmed) return;

    // 선택된 거래들의 주문일에서 일(day)만 유지하고 년/월 변경
    for (const id of selectedIds) {
      const transaction = transactions.find(t => t.id === id);
      if (transaction?.order_date) {
        const day = new Date(transaction.order_date).getDate();
        const newDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        await supabase.from('transactions').update({ order_date: newDate }).eq('id', id);
      }
    }

    setSelectedIds(new Set());
    fetchData();
    alert(`${selectedIds.size}건이 ${targetYear}년 ${targetMonth}월로 이동되었습니다.`);
  };

  // 엑셀 다운로드 (순이익/매출원가 제외 - 미수금 확인용)
  const handleExcelDownload = (unpaidOnly: boolean = false) => {
    // 다운로드할 데이터
    let dataToExport = selectedIds.size > 0
      ? filteredTransactions.filter(t => selectedIds.has(t.id))
      : filteredTransactions;

    // 미수금만 필터링 (입금완료 제외)
    if (unpaidOnly) {
      dataToExport = dataToExport.filter(t => t.status !== 'completed' && t.status !== 'card');
    }

    if (dataToExport.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    // CSV 헤더
    const headers = ['거래처', '담당자', '주문일', '품목', '사이즈', '수량', '후가공', '금액', '견적서일', '세금계산서일', '메모', '상태', '입금일'];

    // CSV 데이터 생성
    const rows = dataToExport.map(t => [
      t.clients?.name || '',
      t.manager_name || t.clients?.manager_name || '',
      t.order_date ? formatDate(t.order_date) : '',
      t.item_name || '',
      t.item_size || '',
      t.item_quantity?.toString() || '',
      t.post_processing || '',
      t.amount.toString(),
      t.quote_sent_at ? formatDate(t.quote_sent_at) : '',
      t.tax_invoice_sent_at ? formatDate(t.tax_invoice_sent_at) : '',
      t.description || '',
      getStatusText(t.status),
      t.paid_at ? formatDate(t.paid_at) : ''
    ]);

    // CSV 문자열 생성 (BOM 추가하여 한글 깨짐 방지)
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // 파일 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const clientName = selectedClientId !== 'all'
      ? clients.find(c => c.id === selectedClientId)?.name || ''
      : '';
    const prefix = unpaidOnly ? '미수금' : '거래내역';
    const fileName = clientName
      ? `${prefix}_${clientName}_${selectedYear}년${selectedMonth}월.csv`
      : `${prefix}_${selectedYear}년${selectedMonth}월.csv`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">거래내역</h1>
          <p className="text-gray-500">거래내역을 관리하고 입금 상태를 확인합니다</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>거래 등록</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTransaction ? '거래 수정' : '거래 등록'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client">거래처</Label>
                <Select
                  value={formData.client_id || ''}
                  onValueChange={(id) => {
                    const selectedClient = clients.find(c => c.id === id);
                    setFormData({
                      ...formData,
                      client_id: id || undefined,
                      manager_name: selectedClient?.manager_name || ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="거래처 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientTree.map((parent) => (
                      <div key={parent.id}>
                        <SelectItem value={parent.id} className="font-bold">
                          {parent.name}
                        </SelectItem>
                        {parent.children && parent.children.map((child) => (
                          <SelectItem key={child.id} value={child.id} className="pl-6">
                            └ {child.manager_name || child.name}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_date">주문일</Label>
                <Input
                  id="order_date"
                  type="date"
                  value={formData.order_date || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, order_date: e.target.value || undefined })
                  }
                />
              </div>

              {/* 품목 정보 */}
              <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                <p className="font-medium text-sm text-gray-700">품목 정보</p>
                <div className="space-y-2">
                  <Label htmlFor="item_name" className="text-sm">품목</Label>
                  <Input
                    id="item_name"
                    value={formData.item_name}
                    onChange={(e) =>
                      setFormData({ ...formData, item_name: e.target.value })
                    }
                    placeholder="예: 명함, 리플렛, 포스터"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item_size" className="text-sm">사이즈</Label>
                  <Input
                    id="item_size"
                    value={formData.item_size}
                    onChange={(e) =>
                      setFormData({ ...formData, item_size: e.target.value })
                    }
                    placeholder="예: 90x50mm, A4, B5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item_quantity" className="text-sm">수량</Label>
                  <Input
                    id="item_quantity"
                    type="number"
                    value={formData.item_quantity || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, item_quantity: parseInt(e.target.value) || 0 })
                    }
                    placeholder="예: 100, 500, 1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="post_processing" className="text-sm">후가공</Label>
                  <Input
                    id="post_processing"
                    value={formData.post_processing}
                    onChange={(e) =>
                      setFormData({ ...formData, post_processing: e.target.value })
                    }
                    placeholder="예: 코팅, 박, 엠보싱, 오시"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseAmount">기본 금액 (부가세 제외) *</Label>
                <Input
                  id="baseAmount"
                  type="number"
                  value={formData.baseAmount || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, baseAmount: parseInt(e.target.value) || 0 })
                  }
                  required
                />
              </div>

              <>
                  {/* 부가세 */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">부가세 (10%)</p>
                      <p className="text-sm text-gray-500">
                        {formData.includeVat ? formatCurrency(Math.round(formData.baseAmount * 0.1)) : '미포함'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={formData.includeVat ? 'default' : 'outline'}
                        onClick={() => setFormData({ ...formData, includeVat: true })}
                      >
                        +
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!formData.includeVat ? 'default' : 'outline'}
                        onClick={() => setFormData({ ...formData, includeVat: false })}
                      >
                        -
                      </Button>
                    </div>
                  </div>

                  {/* 택배비 */}
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">택배비</p>
                        <p className="text-sm text-gray-500">
                          {formData.includeDelivery
                            ? formatCurrency(formData.deliveryVat ? Math.round(DELIVERY_FEE * 1.1) : DELIVERY_FEE)
                            : '미포함'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={formData.includeDelivery ? 'default' : 'outline'}
                          onClick={() => setFormData({ ...formData, includeDelivery: true })}
                        >
                          +
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={!formData.includeDelivery ? 'default' : 'outline'}
                          onClick={() => setFormData({ ...formData, includeDelivery: false })}
                        >
                          -
                        </Button>
                      </div>
                    </div>
                    {formData.includeDelivery && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm">택배비 부가세</span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={formData.deliveryVat ? 'default' : 'outline'}
                            onClick={() => setFormData({ ...formData, deliveryVat: true })}
                          >
                            +
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={!formData.deliveryVat ? 'default' : 'outline'}
                            onClick={() => setFormData({ ...formData, deliveryVat: false })}
                          >
                            -
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 퀵비 */}
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">퀵비</p>
                        <p className="text-sm text-gray-500">
                          {formData.includeQuick && formData.quickFee > 0
                            ? formatCurrency(formData.quickVat ? Math.round(formData.quickFee * 1.1) : formData.quickFee)
                            : '미포함'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={formData.includeQuick ? 'default' : 'outline'}
                          onClick={() => setFormData({ ...formData, includeQuick: true })}
                        >
                          +
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={!formData.includeQuick ? 'default' : 'outline'}
                          onClick={() => setFormData({ ...formData, includeQuick: false, quickFee: 0 })}
                        >
                          -
                        </Button>
                      </div>
                    </div>
                    {formData.includeQuick && (
                      <>
                        <div className="pt-2 border-t">
                          <Label htmlFor="quickFee" className="text-sm">퀵비 금액</Label>
                          <Input
                            id="quickFee"
                            type="number"
                            value={formData.quickFee || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, quickFee: parseInt(e.target.value) || 0 })
                            }
                            placeholder="퀵비 입력"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-sm">퀵비 부가세</span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={formData.quickVat ? 'default' : 'outline'}
                              onClick={() => setFormData({ ...formData, quickVat: true })}
                            >
                              +
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={!formData.quickVat ? 'default' : 'outline'}
                              onClick={() => setFormData({ ...formData, quickVat: false })}
                            >
                              -
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 총액 */}
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg">총액</span>
                      <div className="text-right">
                        {formData.item_quantity > 1 && (
                          <p className="text-sm text-blue-500 mb-1">
                            {formatCurrency(Math.round(formData.baseAmount * (formData.includeVat ? 1.1 : 1)))} × {formData.item_quantity}개
                          </p>
                        )}
                        <span className="font-bold text-xl text-blue-600">
                          {formatCurrency(totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
              </>

              {/* 매출원가 */}
              <div className="space-y-2">
                <Label htmlFor="cost">매출원가 (부가세 포함)</Label>
                <Input
                  id="cost"
                  type="number"
                  value={formData.cost || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, cost: parseInt(e.target.value) || 0 })
                  }
                  placeholder="매출원가 입력"
                />
              </div>

              {/* 순이익 표시 */}
              {formData.baseAmount > 0 && formData.cost > 0 && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-green-700">순이익 (부가세/원가 제외)</span>
                    <div className="text-right">
                      <span className="font-bold text-green-600">
                        {formatCurrency(calculateNetProfit(formData.baseAmount, formData.cost))}
                      </span>
                      <span className="ml-2 text-sm text-green-600">
                        ({(calculateNetProfit(formData.baseAmount, formData.cost) / formData.baseAmount * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">메모</Label>
                <Input
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit">
                  {editingTransaction ? '수정' : '등록'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 거래처 선택 드롭박스 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger>
              <SelectValue placeholder="거래처 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 거래처</SelectItem>
              {clientTree.map((parent) => (
                <div key={parent.id}>
                  <SelectItem value={parent.id} className="font-bold">
                    {parent.name}
                  </SelectItem>
                  {parent.children && parent.children.map((child) => (
                    <SelectItem key={child.id} value={child.id} className="pl-6">
                      └ {child.manager_name || child.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...Array(5)].map((_, i) => {
                const year = new Date().getFullYear() - 2 + i;
                return (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...Array(12)].map((_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  {i + 1}월
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="quote">견적문의</TabsTrigger>
            <TabsTrigger value="design">시안</TabsTrigger>
            <TabsTrigger value="production">제작</TabsTrigger>
            <TabsTrigger value="completed">완료</TabsTrigger>
            <TabsTrigger value="overdue" className="text-red-600">연체</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" onClick={() => handleExcelDownload()}>
          엑셀 다운로드
        </Button>
        <Button variant="default" onClick={() => handleExcelDownload(true)}>
          미수금 다운로드
        </Button>
        {selectedIds.size > 0 && (
          <Button variant="outline" onClick={() => setIsMoveDialogOpen(true)}>
            선택 이동 ({selectedIds.size}건)
          </Button>
        )}
      </div>

      {/* 이동 다이얼로그 */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>거래 이동</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              선택한 {selectedIds.size}건을 다른 년/월로 이동합니다.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>년도</Label>
                <Select value={moveTargetYear.toString()} onValueChange={(v) => setMoveTargetYear(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}년
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>월</Label>
                <Select value={moveTargetMonth.toString()} onValueChange={(v) => setMoveTargetMonth(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(12)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {i + 1}월
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={() => {
                handleMoveTransactions(moveTargetYear, moveTargetMonth);
                setIsMoveDialogOpen(false);
              }}>
                이동
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              거래 목록
              {selectedClientId !== 'all' && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({clients.find(c => c.id === selectedClientId)?.name})
                </span>
              )}
            </CardTitle>
            <div className="text-right min-w-[120px] h-[44px] flex flex-col justify-center">
              {selectedIds.size > 0 && (
                <>
                  <span className="text-sm text-gray-500">{selectedIds.size}건 선택</span>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(selectedTotal)}</p>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-gray-500">로딩 중...</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-center py-8 text-gray-500">
              거래내역이 없습니다
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead>거래처</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>주문일</TableHead>
                    <TableHead>품목</TableHead>
                    <TableHead>사이즈</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>후가공</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">순이익</TableHead>
                    <TableHead>견적/세금</TableHead>
                    <TableHead className="min-w-[150px]">메모</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-[200px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((t) => {
                    // 배경색 우선순위: 선택 > 완료(회색) > 연체(빨강) > 견적+세금+입금(회색) > 견적+세금(연두)
                    const isAllDone = t.quote_sent_at && t.tax_invoice_sent_at && t.paid_at;
                    const isDocsDone = t.quote_sent_at && t.tax_invoice_sent_at && !t.paid_at;
                    return (
                    <TableRow key={t.id} className={`${selectedIds.has(t.id) ? 'bg-blue-50' : ''} ${(t.status === 'completed' || t.status === 'card' || isAllDone) ? 'bg-gray-100 text-gray-500' : ''} ${t.status !== 'completed' && t.status !== 'card' && !isAllDone && isOverdue(t.order_date) ? 'bg-red-50' : ''} ${isDocsDone && t.status !== 'completed' && t.status !== 'card' && !isOverdue(t.order_date) ? 'bg-green-50' : ''}`}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.clients ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-left hover:text-blue-600 hover:underline cursor-pointer">
                                {getClientDisplayName(t.clients)}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-lg">{t.clients.name}</h4>
                                {t.clients.parent_id && (
                                  <p className="text-sm text-gray-500">
                                    상위: {clients.find(c => c.id === t.clients?.parent_id)?.name}
                                  </p>
                                )}
                                <div className="space-y-2 text-sm">
                                  {t.clients.manager_name && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">담당자:</span>
                                      <span>{t.clients.manager_name}</span>
                                    </div>
                                  )}
                                  {t.clients.contact && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">연락처:</span>
                                      <a href={`tel:${t.clients.contact}`} className="text-blue-600 hover:underline">
                                        {t.clients.contact}
                                      </a>
                                    </div>
                                  )}
                                  {t.clients.address && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">주소:</span>
                                      <span>{t.clients.address}</span>
                                    </div>
                                  )}
                                  {t.clients.memo && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">메모:</span>
                                      <span className="text-gray-700">{t.clients.memo}</span>
                                    </div>
                                  )}
                                  {!t.clients.contact && !t.clients.address && !t.clients.memo && !t.clients.manager_name && (
                                    <p className="text-gray-400">등록된 정보가 없습니다.</p>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {t.clients ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-left hover:text-blue-600 hover:underline cursor-pointer">
                                {t.manager_name || t.clients.manager_name || '-'}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-lg">{t.clients.name}</h4>
                                {t.clients.parent_id && (
                                  <p className="text-sm text-gray-500">
                                    상위: {clients.find(c => c.id === t.clients?.parent_id)?.name}
                                  </p>
                                )}
                                <div className="space-y-2 text-sm">
                                  {t.clients.manager_name && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">담당자:</span>
                                      <span>{t.clients.manager_name}</span>
                                    </div>
                                  )}
                                  {t.clients.contact && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">연락처:</span>
                                      <a href={`tel:${t.clients.contact}`} className="text-blue-600 hover:underline">
                                        {t.clients.contact}
                                      </a>
                                    </div>
                                  )}
                                  {t.clients.address && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">주소:</span>
                                      <span>{t.clients.address}</span>
                                    </div>
                                  )}
                                  {t.clients.memo && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-16 shrink-0">메모:</span>
                                      <span className="text-gray-700">{t.clients.memo}</span>
                                    </div>
                                  )}
                                  {!t.clients.contact && !t.clients.address && !t.clients.memo && !t.clients.manager_name && (
                                    <p className="text-gray-400">등록된 정보가 없습니다.</p>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          t.manager_name || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {t.order_date ? formatDate(t.order_date) : '-'}
                      </TableCell>
                      <TableCell>{t.item_name || '-'}</TableCell>
                      <TableCell>{t.item_size || '-'}</TableCell>
                      <TableCell>{t.item_quantity || '-'}</TableCell>
                      <TableCell>{t.post_processing || '-'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(t.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.base_amount && t.cost ? (
                          <div>
                            <span className="font-medium text-green-600">
                              {formatCurrency(calculateNetProfit(t.base_amount, t.cost))}
                            </span>
                            <span className="text-xs text-gray-500 ml-1">
                              ({(calculateNetProfit(t.base_amount, t.cost) / t.base_amount * 100).toFixed(0)}%)
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 w-4">견</span>
                            <input
                              type="text"
                              placeholder="M/D"
                              className={`text-xs border rounded px-1 py-0.5 w-[50px] text-center ${t.quote_sent_at ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-300'}`}
                              key={`quote-${t.id}-${t.quote_sent_at}`}
                              defaultValue={t.quote_sent_at ? `${new Date(t.quote_sent_at).getMonth() + 1}/${new Date(t.quote_sent_at).getDate()}` : ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (!val) {
                                  handleQuoteSent(t.id, '');
                                  return;
                                }
                                const parts = val.split('/');
                                if (parts.length === 2) {
                                  const month = parseInt(parts[0]);
                                  const day = parseInt(parts[1]);
                                  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handleQuoteSent(t.id, dateStr);
                                  }
                                } else {
                                  const day = parseInt(val);
                                  if (day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const month = selectedMonth;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handleQuoteSent(t.id, dateStr);
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 w-4">세</span>
                            <input
                              type="text"
                              placeholder="M/D"
                              className={`text-xs border rounded px-1 py-0.5 w-[50px] text-center ${t.tax_invoice_sent_at ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300'}`}
                              key={`tax-${t.id}-${t.tax_invoice_sent_at}`}
                              defaultValue={t.tax_invoice_sent_at ? `${new Date(t.tax_invoice_sent_at).getMonth() + 1}/${new Date(t.tax_invoice_sent_at).getDate()}` : ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (!val) {
                                  handleTaxInvoiceSent(t.id, '');
                                  return;
                                }
                                const parts = val.split('/');
                                if (parts.length === 2) {
                                  const month = parseInt(parts[0]);
                                  const day = parseInt(parts[1]);
                                  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handleTaxInvoiceSent(t.id, dateStr);
                                  }
                                } else {
                                  const day = parseInt(val);
                                  if (day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const month = selectedMonth;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handleTaxInvoiceSent(t.id, dateStr);
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="whitespace-pre-wrap break-words">{t.description || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {t.status !== 'completed' && t.status !== 'card' && isOverdue(t.order_date) && (
                            <Badge variant="destructive" className="text-xs">연체</Badge>
                          )}
                          <Select
                            value={t.status}
                            onValueChange={(v) => handleStatusChange(t.id, v as TransactionStatus)}
                          >
                            <SelectTrigger className="w-[90px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quote">견적문의</SelectItem>
                              <SelectItem value="design">시안</SelectItem>
                              <SelectItem value="production">제작</SelectItem>
                              <SelectItem value="completed">완료</SelectItem>
                              <SelectItem value="card">카드</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 items-center whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">입금</span>
                            <input
                              type="text"
                              placeholder="M/D"
                              className={`text-xs border rounded px-1 py-0.5 w-[50px] text-center ${t.paid_at ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-300'}`}
                              key={`paid-${t.id}-${t.paid_at}`}
                              defaultValue={t.paid_at ? `${new Date(t.paid_at).getMonth() + 1}/${new Date(t.paid_at).getDate()}` : ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (!val) {
                                  handlePaidAtChange(t.id, '');
                                  return;
                                }
                                const parts = val.split('/');
                                if (parts.length === 2) {
                                  const month = parseInt(parts[0]);
                                  const day = parseInt(parts[1]);
                                  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handlePaidAtChange(t.id, dateStr);
                                  }
                                } else {
                                  const day = parseInt(val);
                                  if (day >= 1 && day <= 31) {
                                    const year = selectedYear;
                                    const month = selectedMonth;
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    handlePaidAtChange(t.id, dateStr);
                                  }
                                }
                              }}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCopy(t)}
                          >
                            복사
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleOpenDialog(t)}
                          >
                            수정
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDelete(t.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
