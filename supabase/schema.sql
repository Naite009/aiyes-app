-- Instructions table
CREATE TABLE instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  category TEXT,
  tags TEXT[],
  file_url TEXT,
  file_name TEXT,
  instruction_type TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Bookmarks table
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  instruction_id UUID REFERENCES instructions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, instruction_id)
);

-- RLS POLICIES

-- Enable RLS on tables
ALTER TABLE instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Allow public read access for public instructions
CREATE POLICY "Allow public read access on public instructions"
ON instructions FOR SELECT
USING (is_public = true);

-- Allow users to see their own private instructions
CREATE POLICY "Allow individual read access on own instructions"
ON instructions FOR SELECT
USING (auth.uid() = created_by);

-- Allow users to create instructions
CREATE POLICY "Allow authenticated users to create instructions"
ON instructions FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update their own instructions
CREATE POLICY "Allow users to update their own instructions"
ON instructions FOR UPDATE
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Allow users to delete their own instructions
CREATE POLICY "Allow users to delete their own instructions"
ON instructions FOR DELETE
USING (auth.uid() = created_by);

-- Policies for Bookmarks
CREATE POLICY "Allow users to manage their own bookmarks"
ON bookmarks FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
