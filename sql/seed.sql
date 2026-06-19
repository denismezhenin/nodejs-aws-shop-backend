-- Task 8 cart-api schema + sample data.
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE cart_status AS ENUM ('OPEN', 'ORDERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      varchar(255) NOT NULL UNIQUE,
  email     varchar(255) UNIQUE,
  password  varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL,
  created_at  date NOT NULL DEFAULT CURRENT_DATE,
  updated_at  date NOT NULL DEFAULT CURRENT_DATE,
  status      cart_status NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id     uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL,
  count       integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   uuid NOT NULL,
  cart_id   uuid NOT NULL REFERENCES carts(id),
  payment   jsonb NOT NULL DEFAULT '{}',
  delivery  jsonb NOT NULL DEFAULT '{}',
  comments  text,
  status    varchar(32) NOT NULL DEFAULT 'OPEN',
  total     numeric(12,2) NOT NULL
);

INSERT INTO users (id, name, password) VALUES
  ('22222222-2222-2222-2222-222222222222', 'alice', 'pw-alice'),
  ('44444444-4444-4444-4444-444444444444', 'bob',   'pw-bob')
ON CONFLICT DO NOTHING;

INSERT INTO carts (id, user_id) VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

INSERT INTO cart_items (cart_id, product_id, count) VALUES
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 2),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 1),
  ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 5)
ON CONFLICT DO NOTHING;
