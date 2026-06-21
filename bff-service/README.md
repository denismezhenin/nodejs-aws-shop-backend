# BFF Service (Task 10)

A Backend For Frontend that listens for all requests and redirects them to the
appropriate downstream service based on a `.env` URL map. Built with the plain
Node.js `http` module + global `fetch` — **no Express / NestJS** (Task 10 −50
penalty for Express).

## How it works

```
{bff-url}/{service}/{rest...}?query   ->   {env[service]}/{rest...}?query
```

- `{service}` — the first path segment, used as the **env key** (e.g. `product`, `cart`).
- The BFF forwards the HTTP **method**, **headers** (including `Authorization`)
  and **body** to `{env[service]}/{rest...}`, then returns the recipient's
  **status code and body verbatim**.
- If no URL is configured for `{service}` → **502 `Cannot process request`**.
- `getProductsList` (`GET /product/products`) is cached for **2 minutes** (see below).

### URL mapping examples

| Call to BFF                                   | Forwarded to                                  |
| --------------------------------------------- | --------------------------------------------- |
| `GET  /product/products`                      | `{product}/products`                          |
| `GET  /product/products/{id}`                 | `{product}/products/{id}`                     |
| `POST /product/products`                      | `{product}/products`                          |
| `GET  /cart/profile/cart`                     | `{cart}/profile/cart`                         |
| `GET  /orders/...` (no `orders` env key)      | **502 `Cannot process request`**              |

> The `product` env value includes the API Gateway stage (`/dev`) and the `cart`
> env value includes the `/api` prefix, so callers only add the resource path.

## Run locally

```bash
cd bff-service
cp .env.example .env        # fill in product= and cart= URLs
npm install
npm run build && npm start  # listens on http://localhost:8080
# or, no build, watch mode:
npm run dev
```

### Verify with curl

```bash
# product list via BFF
curl -i http://localhost:8080/product/products

# single product via BFF
curl -i http://localhost:8080/product/products/<id>

# create product via BFF (body + content-type forwarded)
curl -i -X POST http://localhost:8080/product/products \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","price":10,"count":1,"description":"x"}'

# cart via BFF (Authorization forwarded)
curl -i http://localhost:8080/cart/profile/cart \
  -H "Authorization: Basic $(printf 'denismezhenin:TEST_PASSWORD' | base64)"

# unknown service -> 502 "Cannot process request"
curl -i http://localhost:8080/orders/anything

# recipient error passed through verbatim (same status + body)
curl -i http://localhost:8080/product/products/does-not-exist
```

### Cache behaviour (optional +20)

`GET /product/products` is cached for 2 minutes (look for the `X-BFF-Cache`
response header: `MISS` then `HIT`). Only the product **list** GET is cached —
never single-product lookups, cart, or any mutating method.

```bash
curl -s http://localhost:8080/product/products | jq 'length'   # N   (X-BFF-Cache: MISS)
curl -s -X POST http://localhost:8080/product/products -H 'Content-Type: application/json' -d '{...}'
curl -s http://localhost:8080/product/products | jq 'length'   # N   (X-BFF-Cache: HIT, < 2 min)
sleep 125
curl -s http://localhost:8080/product/products | jq 'length'   # N+1 (cache expired, refetched)
```

## Environment

| Var       | Meaning                                                            |
| --------- | ----------------------------------------------------------------- |
| `PORT`    | Listen port. EB injects this in prod; defaults to `8080` locally. |
| `product` | Product Service base URL (API Gateway, incl. `/dev` stage).        |
| `cart`    | Cart Service base URL (Elastic Beanstalk, incl. `/api` prefix).    |

`.env` is git/eb-ignored and never shipped. In production the URLs are set as EB
environment properties via `eb setenv` (see below).

## Deploy to Elastic Beanstalk (Docker, single instance)

Run from **inside** `bff-service/` so EB creates a per-directory config for this
app (does not touch the cart-service EB app at the repo root). Requires the EB
CLI (`pip install awsebcli`).

```bash
cd bff-service

eb init denismezhenin-bff-api --platform docker --region eu-central-1

eb create denismezhenin-bff-api-dev \
  --single \
  --cname denismezhenin-bff-api-dev

eb setenv \
  product=https://gyl4e2imdk.execute-api.eu-central-1.amazonaws.com/dev \
  cart=http://denismezhenin-cart-api-prod.eu-central-1.elasticbeanstalk.com/api

eb deploy   # redeploy after changes
eb status   # shows the public CNAME + health
```

Deployed URL: `http://denismezhenin-bff-api-dev.eu-central-1.elasticbeanstalk.com`
