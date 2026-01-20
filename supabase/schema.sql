-- 제이디자인 입금 - Supabase 스키마
-- Supabase 대시보드의 SQL Editor에서 실행하세요

-- 1. 거래처 테이블
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  contact text,
  memo text,
  created_at timestamp with time zone default now()
);

-- 2. 거래내역 테이블
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete set null,
  amount integer not null,
  description text,
  expected_date date,
  status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
  paid_at timestamp with time zone,
  matched_bank_record_id uuid,
  created_at timestamp with time zone default now()
);

-- 3. 통장 내역 테이블
create table if not exists bank_records (
  id uuid default gen_random_uuid() primary key,
  transaction_date date not null,
  description text,
  depositor text,
  amount integer not null,
  balance integer,
  is_matched boolean default false,
  uploaded_at timestamp with time zone default now()
);

-- 외래키 추가 (bank_records 생성 후)
alter table transactions
  add constraint fk_matched_bank_record
  foreign key (matched_bank_record_id)
  references bank_records(id) on delete set null;

-- 인덱스 생성
create index if not exists idx_transactions_status on transactions(status);
create index if not exists idx_transactions_client_id on transactions(client_id);
create index if not exists idx_bank_records_is_matched on bank_records(is_matched);
create index if not exists idx_bank_records_date_amount on bank_records(transaction_date, amount);

-- RLS (Row Level Security) 활성화
alter table clients enable row level security;
alter table transactions enable row level security;
alter table bank_records enable row level security;

-- RLS 정책: 인증된 사용자만 접근 가능
create policy "Allow authenticated users to read clients"
  on clients for select
  to authenticated
  using (true);

create policy "Allow authenticated users to insert clients"
  on clients for insert
  to authenticated
  with check (true);

create policy "Allow authenticated users to update clients"
  on clients for update
  to authenticated
  using (true);

create policy "Allow authenticated users to delete clients"
  on clients for delete
  to authenticated
  using (true);

create policy "Allow authenticated users to read transactions"
  on transactions for select
  to authenticated
  using (true);

create policy "Allow authenticated users to insert transactions"
  on transactions for insert
  to authenticated
  with check (true);

create policy "Allow authenticated users to update transactions"
  on transactions for update
  to authenticated
  using (true);

create policy "Allow authenticated users to delete transactions"
  on transactions for delete
  to authenticated
  using (true);

create policy "Allow authenticated users to read bank_records"
  on bank_records for select
  to authenticated
  using (true);

create policy "Allow authenticated users to insert bank_records"
  on bank_records for insert
  to authenticated
  with check (true);

create policy "Allow authenticated users to update bank_records"
  on bank_records for update
  to authenticated
  using (true);

create policy "Allow authenticated users to delete bank_records"
  on bank_records for delete
  to authenticated
  using (true);
