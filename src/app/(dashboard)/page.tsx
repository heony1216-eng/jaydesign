import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Transaction, DashboardSummary } from '@/types';

export const dynamic = 'force-dynamic';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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

function getStatusBadge(status: string, orderDate: string | null, isCompleted: boolean) {
  // 완료/카드가 아니고 한달 넘으면 연체
  if (!isCompleted && isOverdue(orderDate)) {
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

export default async function DashboardPage() {
  const supabase = await createClient();

  // 2026년 거래내역만 조회
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, clients(*)')
    .gte('order_date', '2026-01-01')
    .lte('order_date', '2026-12-31')
    .order('created_at', { ascending: false });

  const allTransactions = (transactions || []) as Transaction[];

  // 요약 계산
  const summary: DashboardSummary = allTransactions.reduce(
    (acc, t) => {
      acc.total++;
      acc.totalAmount += t.amount;

      // 완료/카드가 아니고 한달 넘으면 연체로 카운트
      if (t.status !== 'completed' && t.status !== 'card' && isOverdue(t.order_date)) {
        acc.overdue++;
        acc.overdueAmount += t.amount;
      } else {
        switch (t.status) {
          case 'quote':
            acc.quote++;
            acc.quoteAmount += t.amount;
            break;
          case 'design':
            acc.design++;
            acc.designAmount += t.amount;
            break;
          case 'production':
            acc.production++;
            acc.productionAmount += t.amount;
            break;
          case 'completed':
          case 'card':
            acc.completed++;
            acc.completedAmount += t.amount;
            break;
          default:
            acc.quote++;
            acc.quoteAmount += t.amount;
        }
      }

      return acc;
    },
    {
      total: 0,
      quote: 0,
      design: 0,
      production: 0,
      completed: 0,
      overdue: 0,
      totalAmount: 0,
      quoteAmount: 0,
      designAmount: 0,
      productionAmount: 0,
      completedAmount: 0,
      overdueAmount: 0,
    }
  );

  // 연체 거래
  const overdueTransactions = allTransactions.filter(
    (t) => t.status !== 'completed' && t.status !== 'card' && isOverdue(t.order_date)
  );

  // 진행중 거래 (완료/카드 제외, 연체 제외)
  const incompleteTransactions = allTransactions.filter(
    (t) => t.status !== 'completed' && t.status !== 'card' && !isOverdue(t.order_date)
  );

  // 최근 완료 (완료 + 카드)
  const recentCompletedTransactions = allTransactions
    .filter((t) => t.status === 'completed' || t.status === 'card')
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-gray-500">2026년 거래 현황을 한눈에 확인하세요</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              전체 거래
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}건</div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.totalAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              견적문의
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.quote}건</div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.quoteAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">
              시안
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {summary.design}건
            </div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.designAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">
              제작
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {summary.production}건
            </div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.productionAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {summary.completed}건
            </div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.completedAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              연체
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary.overdue}건
            </div>
            <p className="text-sm text-gray-500">
              {formatCurrency(summary.overdueAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* 연체 거래 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">연체 거래</CardTitle>
          </CardHeader>
          <CardContent>
            {overdueTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                연체 거래가 없습니다
              </p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {overdueTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-4 bg-red-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium">
                        {t.clients?.name || '거래처 미지정'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {t.description}
                      </div>
                      {t.order_date && (
                        <div className="text-sm text-red-600">
                          주문일: {formatDate(t.order_date)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">
                        {formatCurrency(t.amount)}
                      </div>
                      <Badge variant="destructive">연체</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 진행중 거래 */}
        <Card>
          <CardHeader>
            <CardTitle>진행중 거래</CardTitle>
          </CardHeader>
          <CardContent>
            {incompleteTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                진행중인 거래가 없습니다
              </p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {incompleteTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium">
                        {t.clients?.name || '거래처 미지정'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {t.description}
                      </div>
                      {t.order_date && (
                        <div className="text-sm text-gray-400">
                          주문일: {formatDate(t.order_date)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">
                        {formatCurrency(t.amount)}
                      </div>
                      {getStatusBadge(t.status, t.order_date, t.status === 'completed')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 완료 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 완료</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCompletedTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                완료된 거래가 없습니다
              </p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {recentCompletedTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium">
                        {t.clients?.name || '거래처 미지정'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {t.description}
                      </div>
                      {t.paid_at && (
                        <div className="text-sm text-green-600">
                          입금일: {formatDate(t.paid_at)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">
                        {formatCurrency(t.amount)}
                      </div>
                      {t.status === 'card' ? (
                        <Badge className="bg-purple-500 hover:bg-purple-600">
                          완료(카드)
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500 hover:bg-green-600">
                          완료
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
