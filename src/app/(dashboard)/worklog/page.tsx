'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { WorkLog } from '@/types';

const STORAGE_KEY = 'jdesign-worklog';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export default function WorkLogPage() {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState({ clientName: '', task: '', assignee: '' });
  const [editRow, setEditRow] = useState({ clientName: '', task: '', assignee: '' });
  const newClientRef = useRef<HTMLInputElement>(null);

  // localStorage에서 데이터 로드
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const logs: WorkLog[] = JSON.parse(saved);
      const now = new Date();
      const filtered = logs.filter((log) => {
        if (log.status === 'completed' && log.completedAt) {
          const completedDate = new Date(log.completedAt);
          const diffDays = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays < 7;
        }
        return true;
      });
      setWorkLogs(filtered);
      if (filtered.length !== logs.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    }
  }, []);

  const saveToStorage = (logs: WorkLog[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    setWorkLogs(logs);
  };

  // 새 항목 추가
  const handleAddNew = () => {
    if (!newRow.clientName.trim() || !newRow.task.trim() || !newRow.assignee.trim()) return;

    const newLog: WorkLog = {
      id: generateId(),
      ...newRow,
      status: 'pending',
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    saveToStorage([newLog, ...workLogs]);
    setNewRow({ clientName: '', task: '', assignee: '' });
    newClientRef.current?.focus();
  };

  // 엔터키로 추가
  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNew();
    }
  };

  // 수정 시작
  const startEdit = (log: WorkLog) => {
    setEditingId(log.id);
    setEditRow({ clientName: log.clientName, task: log.task, assignee: log.assignee });
  };

  // 수정 저장
  const saveEdit = (id: string) => {
    if (!editRow.clientName.trim() || !editRow.task.trim() || !editRow.assignee.trim()) return;

    const updated = workLogs.map((log) =>
      log.id === id ? { ...log, ...editRow } : log
    );
    saveToStorage(updated);
    setEditingId(null);
  };

  // 수정 취소
  const cancelEdit = () => {
    setEditingId(null);
  };

  // 엔터키로 수정 저장, ESC로 취소
  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(id);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleComplete = (id: string) => {
    const updated = workLogs.map((log) =>
      log.id === id
        ? { ...log, status: 'completed' as const, completedAt: new Date().toISOString() }
        : log
    );
    saveToStorage(updated);
  };

  const handleDelete = (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const updated = workLogs.filter((log) => log.id !== id);
    saveToStorage(updated);
  };

  const pendingLogs = workLogs.filter((log) => log.status === 'pending');
  const completedLogs = workLogs.filter((log) => log.status === 'completed');

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getDaysUntilDelete = (completedAt: string) => {
    const completed = new Date(completedAt);
    const now = new Date();
    const diffDays = 7 - Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">작업 일지</h1>
        <p className="text-gray-500">할 일을 관리합니다</p>
      </div>

      {/* 진행중 작업 */}
      <Card>
        <CardHeader>
          <CardTitle>진행중 ({pendingLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600 w-1/4">거래처</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 w-2/5">할 일</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 w-1/6">담당자</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 w-1/5">관리</th>
                </tr>
              </thead>
              <tbody>
                {/* 새 항목 입력 행 */}
                <tr className="border-b bg-blue-50">
                  <td className="py-2 px-4">
                    <Input
                      ref={newClientRef}
                      value={newRow.clientName}
                      onChange={(e) => setNewRow({ ...newRow, clientName: e.target.value })}
                      onKeyDown={handleNewKeyDown}
                      placeholder="거래처"
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <Input
                      value={newRow.task}
                      onChange={(e) => setNewRow({ ...newRow, task: e.target.value })}
                      onKeyDown={handleNewKeyDown}
                      placeholder="할 일"
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <Input
                      value={newRow.assignee}
                      onChange={(e) => setNewRow({ ...newRow, assignee: e.target.value })}
                      onKeyDown={handleNewKeyDown}
                      placeholder="담당자"
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Button size="sm" onClick={handleAddNew}>
                      추가
                    </Button>
                  </td>
                </tr>

                {/* 기존 항목들 */}
                {pendingLogs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    {editingId === log.id ? (
                      <>
                        <td className="py-2 px-4">
                          <Input
                            value={editRow.clientName}
                            onChange={(e) => setEditRow({ ...editRow, clientName: e.target.value })}
                            onKeyDown={(e) => handleEditKeyDown(e, log.id)}
                            className="h-9"
                            autoFocus
                          />
                        </td>
                        <td className="py-2 px-4">
                          <Input
                            value={editRow.task}
                            onChange={(e) => setEditRow({ ...editRow, task: e.target.value })}
                            onKeyDown={(e) => handleEditKeyDown(e, log.id)}
                            className="h-9"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <Input
                            value={editRow.assignee}
                            onChange={(e) => setEditRow({ ...editRow, assignee: e.target.value })}
                            onKeyDown={(e) => handleEditKeyDown(e, log.id)}
                            className="h-9"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => saveEdit(log.id)}>
                              저장
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              취소
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 font-medium">{log.clientName}</td>
                        <td className="py-3 px-4">{log.task}</td>
                        <td className="py-3 px-4">{log.assignee}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEdit(log)}
                            >
                              수정
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleComplete(log.id)}
                            >
                              완료
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(log.id)}
                            >
                              삭제
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {pendingLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-500">
                      진행중인 작업이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 완료된 작업 */}
      {completedLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-500">완료됨 ({completedLogs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-400">거래처</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-400">할 일</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-400">담당자</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-400">완료일</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-400">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {completedLogs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-gray-50 text-gray-400">
                      <td className="py-3 px-4 line-through">{log.clientName}</td>
                      <td className="py-3 px-4 line-through">{log.task}</td>
                      <td className="py-3 px-4 line-through">{log.assignee}</td>
                      <td className="py-3 px-4">
                        {log.completedAt && (
                          <span className="text-sm">
                            {formatDate(log.completedAt)}
                            <span className="ml-2 text-xs text-orange-500">
                              ({getDaysUntilDelete(log.completedAt)}일 후 삭제)
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(log.id)}
                        >
                          삭제
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
