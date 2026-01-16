
-- Create profiles table
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  username text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create products table
create table products (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  price numeric not null,
  category text not null,
  images text[] default '{}',
  seller_id uuid references profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create chats table
create table chats (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references products(id) not null,
  buyer_id uuid references profiles(id) not null,
  seller_id uuid references profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(product_id, buyer_id, seller_id)
);

-- Create messages table
create table messages (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references chats(id) not null,
  sender_id uuid references profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table products enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;

-- Policies
-- Profiles: Public read, self update
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- Products: Public read, authenticated insert/update (own)
create policy "Products are viewable by everyone." on products for select using (true);
create policy "Users can insert their own products." on products for insert with check (auth.uid() = seller_id);
create policy "Users can update own products." on products for update using (auth.uid() = seller_id);
create policy "Users can delete own products." on products for delete using (auth.uid() = seller_id);

-- Chats: Participants can view
create policy "Users can view their own chats." on chats for select using (auth.uid() = buyer_id or auth.uid() = seller_id);
create policy "Users can create chats." on chats for insert with check (auth.uid() = buyer_id);

-- Messages: Participants can view, Sender can insert
create policy "Users can view messages in their chats." on messages for select using (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id
    and (chats.buyer_id = auth.uid() or chats.seller_id = auth.uid())
  )
);
create policy "Users can insert messages." on messages for insert with check (auth.uid() = sender_id);

-- Storage (Buckets)
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

create policy "Product images are publicly accessible." on storage.objects for select using ( bucket_id = 'product-images' );
create policy "Anyone can upload product images." on storage.objects for insert with check ( bucket_id = 'product-images' and auth.role() = 'authenticated' );
