'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Client, ClientInsert } from '@/types';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientInsert>({
    name: '',
    parent_id: null,
    manager_name: '',
    contact: '',
    address: '',
    memo: '',
  });
  const supabase = createClient();

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true });
    setClients(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // 상위 거래처 목록 (parent_id가 null인 것들)
  const parentClients = useMemo(() => {
    return clients.filter(c => c.parent_id === null);
  }, [clients]);

  // 트리 구조로 변환
  const clientTree = useMemo(() => {
    const tree: Client[] = [];
    const parentMap = new Map<string, Client[]>();

    // 하위 거래처들을 parent_id로 그룹화
    clients.forEach(client => {
      if (client.parent_id) {
        const children = parentMap.get(client.parent_id) || [];
        children.push(client);
        parentMap.set(client.parent_id, children);
      }
    });

    // 상위 거래처에 하위 거래처 연결
    parentClients.forEach(parent => {
      tree.push({
        ...parent,
        children: parentMap.get(parent.id) || []
      });
    });

    return tree;
  }, [clients, parentClients]);

  const resetForm = () => {
    setFormData({ name: '', parent_id: null, manager_name: '', contact: '', address: '', memo: '' });
    setEditingClient(null);
  };

  const handleOpenDialog = (client?: Client, parentId?: string) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        parent_id: client.parent_id || null,
        manager_name: client.manager_name || '',
        contact: client.contact || '',
        address: client.address || '',
        memo: client.memo || '',
      });
    } else {
      resetForm();
      if (parentId) {
        setFormData(prev => ({ ...prev, parent_id: parentId }));
      }
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dataToSubmit = {
      ...formData,
      parent_id: formData.parent_id || null,
    };

    if (editingClient) {
      await supabase
        .from('clients')
        .update(dataToSubmit)
        .eq('id', editingClient.id);
    } else {
      await supabase.from('clients').insert(dataToSubmit);
    }

    setIsDialogOpen(false);
    resetForm();
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    // 하위 거래처가 있는지 확인
    const hasChildren = clients.some(c => c.parent_id === id);
    if (hasChildren) {
      alert('하위 거래처가 있어 삭제할 수 없습니다. 먼저 하위 거래처를 삭제해주세요.');
      return;
    }
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await supabase.from('clients').delete().eq('id', id);
    fetchClients();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">거래처 관리</h1>
          <p className="text-gray-500">거래처 정보를 관리합니다</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>거래처 등록</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingClient ? '거래처 수정' : '거래처 등록'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="parent_id">상위 거래처</Label>
                <Select
                  value={formData.parent_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, parent_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="상위 거래처 선택 (없으면 최상위)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음 (최상위 거래처)</SelectItem>
                    {parentClients
                      .filter(c => c.id !== editingClient?.id) // 자기 자신은 제외
                      .map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">거래처명 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager_name">담당자 이름</Label>
                <Input
                  id="manager_name"
                  value={formData.manager_name || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, manager_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">연락처</Label>
                <Input
                  id="contact"
                  value={formData.contact || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, contact: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  value={formData.address || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">메모</Label>
                <Input
                  id="memo"
                  value={formData.memo || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, memo: e.target.value })
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
                  {editingClient ? '수정' : '등록'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>거래처 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-gray-500">로딩 중...</p>
          ) : clientTree.length === 0 ? (
            <p className="text-center py-8 text-gray-500">
              등록된 거래처가 없습니다
            </p>
          ) : (
            <div className="space-y-4">
              {clientTree.map((parent) => (
                <div key={parent.id} className="border rounded-lg overflow-hidden">
                  {/* 상위 거래처 헤더 */}
                  <div className="bg-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-lg">{parent.name}</span>
                      {parent.manager_name && (
                        <span className="text-gray-600">담당: {parent.manager_name}</span>
                      )}
                      {parent.contact && (
                        <span className="text-gray-500 text-sm">{parent.contact}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(undefined, parent.id)}
                      >
                        하위 추가
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(parent)}
                      >
                        수정
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(parent.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>

                  {/* 하위 거래처 목록 */}
                  {parent.children && parent.children.length > 0 && (
                    <div className="divide-y">
                      {parent.children.map((child) => (
                        <div key={child.id} className="p-4 pl-8 flex items-center justify-between bg-white hover:bg-gray-50">
                          <div className="grid grid-cols-4 gap-8 flex-1">
                            <div>
                              <span className="text-gray-400 text-sm">담당자</span>
                              <p className="font-medium">{child.manager_name || child.name}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 text-sm">연락처</span>
                              <p>{child.contact || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 text-sm">주소</span>
                              <p>{child.address || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 text-sm">메모</span>
                              <p>{child.memo || '-'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(child)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(child.id)}
                            >
                              삭제
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 하위 거래처가 없는 경우 */}
                  {(!parent.children || parent.children.length === 0) && (
                    <div className="p-4 pl-8 text-gray-400 text-sm">
                      하위 거래처 없음
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
