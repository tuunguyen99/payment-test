# Backend — Invoice tests

Integration tests for `InvoiceService` live in `test/invoice.service.spec.ts`. They use a real PostgreSQL database via `TypeOrmHelper` and `.env.test`.

## Prerequisites

- PostgreSQL reachable with credentials from `backend/.env.test` (see variables such as `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).
- Optional: start a dedicated test database:

```bash
docker compose -f docker-compose.test.yml up -d
```

Adjust `.env.test` if you use the compose file (e.g. port `5433` mapped to `5432` in the container).

## Run tests

From the `backend` directory:

| Command | Purpose |
|--------|---------|
| `npm test` | Run all Jest tests (`src/**` and `test/**`, `*.spec.ts`) |
| `npm test -- test/invoice.service.spec.ts` | Run only invoice service specs |
| `npm run test:watch` | Watch mode |
| `npm run test:cov` | Coverage report |

Example (single file):

```bash
cd backend && npm test -- test/invoice.service.spec.ts
```

## Payment scenarios covered by tests

These map to the notebook cases (Vietnamese labels in parentheses) and are asserted in `test/invoice.service.spec.ts` against `InvoiceService.processPayment` / `generateReceipt`.

| Case | Label (VN) | Behaviour covered |
|------|------------|-------------------|
| **Case 1** | Trả đủ | Single invoice; payment equals outstanding amount → one receipt, balance cleared, invoice `PAID`. |
| **Case 2** | Trả thiếu | Partial payment then a second payment that settles the same invoice → two receipts, final state `PAID`. |
| **Case 3** | Trả thừa | Overpayment on one invoice (credit / negative `remainingBalance` on the receipt) and a follow-up payment that consumes prior credit toward another invoice (split flow in the spec). |
| **Case 4** | Trả tiếp sau khi thanh toán | Invoice already `PAID`; another payment → credit-style receipt (`totalPaid` 0, negative balance on receipt line), invoice stays `PAID`. |

Additional coverage: `processPayment` rejects non-positive amounts; `generateReceipt` throws when `payment` or `invoice` is missing.

## Not handled yet (time constraints)

**Consecutive overpayment across two invoices** — e.g. a user overpaying **two invoices in a row** in a way that requires chaining two separate overpayment credits (beyond the current Case 3 flow) — is **not implemented or tested** yet due to limited time. Extend `InvoiceService` / tests when that product rule is defined.

## Service ↔ spec mapping

| Area in `InvoiceService` | Spec suite |
|--------------------------|------------|
| `processPayment` validation | `InvoiceService — processPayment validation` |
| Cases 1–4 (flows above) | `Case 1` … `Case 4` describes |
| `generateReceipt` null args | `InvoiceService — generateReceipt validation` |
**Not covered by this spec file:** `calculateInvoiceTotal`; invalid `PaymentMethod`; exhaustive isolated tests for every `generateReceipt` branch.

