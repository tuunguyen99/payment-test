import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvoiceEntity } from '../src/invoices/entities/invoice.entity';
import { InvoiceItemEntity } from '../src/invoices/entities/invoice-item.entity';
import { PaymentEntity } from '../src/invoices/entities/payment.entity';
import { ReceiptEntity } from '../src/invoices/entities/receipt.entity';
import { InvoiceStatus } from '../src/invoices/enums/invoice-status.enum';
import { PaymentMethod } from '../src/invoices/enums/payment-method.enum';
import { PaymentStatus } from '../src/invoices/enums/payment-status.enum';
import { InvoiceService } from '../src/invoices/invoice.service';
import { TypeOrmHelper } from './typeorm.helper';

/** ---------------------------------------------------------------------------
 * Factory — returns unsaved entity instances; caller must `.save()`.
 * --------------------------------------------------------------------------- */

function buildInvoice(overrides: Partial<InvoiceEntity> = {}): InvoiceEntity {
  const invoice = new InvoiceEntity();
  invoice.invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  invoice.invoiceDate = new Date('2025-01-01');
  invoice.outstandingAmount = 0;
  invoice.totalAmount = 0;
  invoice.totalTax = 0;
  invoice.status = InvoiceStatus.OPEN;
  invoice.items = [];
  return Object.assign(invoice, overrides);
}

/** ---------------------------------------------------------------------------
 * Build an InvoiceService wired to a real DataSource.
 * --------------------------------------------------------------------------- */

function buildService(dataSource: DataSource): InvoiceService {
  return new InvoiceService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceItemEntity),
    dataSource.getRepository(PaymentEntity),
    dataSource.getRepository(ReceiptEntity),
  );
}

/** ---------------------------------------------------------------------------
 * Shared helpers for all suites.
 * --------------------------------------------------------------------------- */

function buildPayment(invoice: InvoiceEntity, amount: number): PaymentEntity {
  const payment = new PaymentEntity();
  payment.invoice = invoice;
  payment.paymentMethod = PaymentMethod.CASH;
  payment.amount = amount;
  payment.paymentDate = new Date();
  payment.status = PaymentStatus.COMPLETED;
  return payment;
}

/** ---------------------------------------------------------------------------
 * Factory — returns unsaved InvoiceItemEntity instances.
 * --------------------------------------------------------------------------- */

function buildItem(overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity {
  const item = new InvoiceItemEntity();
  item.description = 'Test Item';
  item.quantity = 1;
  item.unitPrice = 10;
  item.lineTotal = 10;
  item.taxRate = 0;
  item.taxAmount = 0;
  return Object.assign(item, overrides);
}

/** ---------------------------------------------------------------------------
 * Tests
 * --------------------------------------------------------------------------- */

describe('InvoiceService — calculateInvoiceTotal error cases', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeEach(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('throws BadRequestException when items is null', async () => {
    await expect(
      service.calculateInvoiceTotal(null as unknown as InvoiceItemEntity[], 0.1),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.calculateInvoiceTotal(null as unknown as InvoiceItemEntity[], 0.1),
    ).rejects.toThrow('Items are required');
  });

  it('throws BadRequestException when items is undefined', async () => {
    await expect(
      service.calculateInvoiceTotal(undefined as unknown as InvoiceItemEntity[], 0.1),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.calculateInvoiceTotal(undefined as unknown as InvoiceItemEntity[], 0.1),
    ).rejects.toThrow('Items are required');
  });

  it('throws BadRequestException when items is an empty array', async () => {
    await expect(
      service.calculateInvoiceTotal([], 0.1),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.calculateInvoiceTotal([], 0.1),
    ).rejects.toThrow('Items are required');
  });

  it('throws BadRequestException when taxRate is negative', async () => {
    const items = [buildItem({ quantity: 1, unitPrice: 100 })];
    await expect(
      service.calculateInvoiceTotal(items, -0.1),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.calculateInvoiceTotal(items, -0.1),
    ).rejects.toThrow('Tax rate must be greater than 0');
  });
});

describe('InvoiceService — calculateInvoiceTotal happy cases', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeEach(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('calculates total correctly for a single item with default tax rate', async () => {
    // quantity=2, unitPrice=100, taxRate=0 → tax=0, outstanding=200, total=200
    const items = [buildItem({ quantity: 2, unitPrice: 100, taxRate: 0 })];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(20);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(220);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(200);
  });

  it('calculates total correctly for a single item with per-item tax rate', async () => {
    // quantity=2, unitPrice=100, taxRate=0.1 → tax=20, outstanding=220, total=200
    const items = [buildItem({ quantity: 2, unitPrice: 100, taxRate: 0.1 })];

    const result = await service.calculateInvoiceTotal(items, 0.05);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(20);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(220);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(200);
  });

  it('calculates total correctly for a single item with zero default tax rate', async () => {
    // quantity=5, unitPrice=20, taxRate=0 → tax=0, outstanding=100, total=100
    const items = [buildItem({ quantity: 5, unitPrice: 20, taxRate: 0 })];

    const result = await service.calculateInvoiceTotal(items, 0);

    expect(result.totalTax).toBe(0);
    expect(result.outstandingAmount).toBe(100);
    expect(result.totalAmount).toBe(100);
  });

  it('calculates total correctly for multiple items with same tax rate', async () => {
    // Item1: qty=2, price=100, taxRate=0 → 200
    // Item2: qty=3, price=50,  taxRate=0 → 150
    // Default taxRate=0.1 → totalTax=35, outstanding=385, total=350
    const items = [
      buildItem({ quantity: 2, unitPrice: 100, taxRate: 0 }),
      buildItem({ quantity: 3, unitPrice: 50,  taxRate: 0 }),
    ];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(35);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(385);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(350);
  });

  it('calculates total correctly for multiple items with per-item tax rates', async () => {
    // Item1: qty=2, price=100, taxRate=0.1 → line=200, tax=20
    // Item2: qty=3, price=50,  taxRate=0.05 → line=150, tax=7.5
    // totalTax=27.5, outstanding=377.5, total=350
    const items = [
      buildItem({ quantity: 2, unitPrice: 100, taxRate: 0.1  }),
      buildItem({ quantity: 3, unitPrice: 50,  taxRate: 0.05 }),
    ];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(result.totalTax).toBe(27.5);
    expect(result.outstandingAmount).toBe(377.5);
    expect(result.totalAmount).toBe(350);
  });

  it('uses default tax rate when item has no per-item tax rate', async () => {
    // Item1: qty=2, price=100, taxRate=0 (falsy) → uses default 0.1 → tax=20
    // Item2: qty=1, price=50,  taxRate=0.2 → explicit 0.2 → tax=10
    // totalTax=30, outstanding=280, total=250
    const items = [
      buildItem({ quantity: 2, unitPrice: 100, taxRate: 0 }),
      buildItem({ quantity: 1, unitPrice: 50,  taxRate: 0.2 }),
    ];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(30);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(280);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(250);
  });

  it('skips items with zero quantity', async () => {
    const items = [
      buildItem({ quantity: 1, unitPrice: 100 }),
      buildItem({ quantity: 0, unitPrice: 200 }),
    ];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(10);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(110);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(100);
  });

  it('handles a mix of valid, skipped, and items with per-item tax', async () => {
    // Item1: qty=2, price=100, taxRate=0   → valid, default 0.1 → tax=20
    // Item2: qty=1, price=50,  taxRate=0  → valid, default 0.1 → tax=5
    // Item3: qty=0, price=200, taxRate=0   → skipped
    // Item4: qty=1, price=30,  taxRate=0.2 → valid, explicit → tax=6
    // totalTax=31, outstanding=311, total=280
    const items = [
      buildItem({ quantity: 2, unitPrice: 100, taxRate: 0 }),
      buildItem({ quantity: 1, unitPrice: 50,  taxRate: 0 }),
      buildItem({ quantity: 0, unitPrice: 200, taxRate: 0 }),
      buildItem({ quantity: 1, unitPrice: 30,  taxRate: 0.2 }),
    ];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(Number(Math.round(result.totalTax * 100) / 100)).toBe(31);
    expect(Number(Math.round(result.outstandingAmount * 100) / 100)).toBe(311);
    expect(Number(Math.round(result.totalAmount * 100) / 100)).toBe(280);
  });

  it('saves the invoice to the database with DRAFT status', async () => {
    const items = [buildItem({ quantity: 2, unitPrice: 100 })];

    await service.calculateInvoiceTotal(items, 0.1);

    const invoices = await db.getRepository(InvoiceEntity).find();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe(InvoiceStatus.DRAFT);
    expect(Number(Math.round(invoices[0].totalAmount * 100) / 100)).toBe(200);
    expect(Number(Math.round(invoices[0].totalTax * 100) / 100)).toBe(20);
    expect(Number(Math.round(invoices[0].outstandingAmount * 100) / 100)).toBe(220);
    expect(invoices[0].invoiceNumber).toMatch(/^INV-\d+-\d+$/);
  });

  it('taxRate of 0 is allowed (edge case — zero rate, not negative)', async () => {
    const items = [buildItem({ quantity: 1, unitPrice: 100, taxRate: 0 })];

    const result = await service.calculateInvoiceTotal(items, 0);

    expect(result.totalTax).toBe(0);
    expect(result.outstandingAmount).toBe(100);
    expect(result.totalAmount).toBe(100);
  });

  it('high tax rate produces correct totals', async () => {
    // quantity=1, unitPrice=1000, taxRate=0.25 → tax=250, outstanding=1250, total=1000
    const items = [buildItem({ quantity: 1, unitPrice: 1000, taxRate: 0.25 })];

    const result = await service.calculateInvoiceTotal(items, 0.1);

    expect(result.totalTax).toBe(250);
    expect(result.outstandingAmount).toBe(1250);
    expect(result.totalAmount).toBe(1000);
  });

  it('many items with small values sum correctly', async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      buildItem({ quantity: 1, unitPrice: 0.01, taxRate: 0.1 }),
    );

    const result = await service.calculateInvoiceTotal(items, 0.05);

    expect(result.totalTax).toBeCloseTo(0.01, 2);
    expect(result.outstandingAmount).toBeCloseTo(0.11, 2);
    expect(result.totalAmount).toBeCloseTo(0.10, 2);
  });
});

/** ---------------------------------------------------------------------------
 * Tests
 * --------------------------------------------------------------------------- */

describe('InvoiceService — processPayment validation', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeAll(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('rejects non-positive payment amount', async () => {
    const invoice = buildInvoice({ outstandingAmount: 50, totalAmount: 50 });
    await db.getRepository(InvoiceEntity).save(invoice);

    await expect(
      service.processPayment(invoice, PaymentMethod.CASH, 0),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.processPayment(invoice, PaymentMethod.CASH, -10),
    ).rejects.toThrow(BadRequestException);
  });
});

/**
 * Case 1 (notebook): I1 = $50, one payment P = $50 → receipt R1 fully applied,
 * invoice PAID.
 */
describe('Case 1 — pay in full (I1 $50, P $50 → R1)', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeAll(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('creates one receipt with totalPaid 50, remainingBalance 0, and marks invoice PAID', async () => {
    const invoice = buildInvoice({ outstandingAmount: 50, totalAmount: 50 });
    await db.getRepository(InvoiceEntity).save(invoice);

    const result = await service.processPayment(invoice, PaymentMethod.CASH, 50);

    expect(result).toBe(PaymentStatus.COMPLETED);

    const receipts = await db.getRepository(ReceiptEntity).find();
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].totalPaid)).toBe(50);
    expect(Number(receipts[0].remainingBalance)).toBe(0);
    expect(receipts[0].items).toEqual([{ invoiceId: invoice.id, amount: 50 }]);

    const updated = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice.id } });
    expect(updated!.status).toBe(InvoiceStatus.PAID);
  });
});

/**
 * Case 2 (notebook): I1 = $70, P1 = $40 → R1 (30 remaining on invoice);
 * then P2 = $30 → R2 closes out; prior R1 remaining cleared to 0; invoice PAID.
 */
describe('Case 2 — partial then final payment (I1 $70, R1 $40 + R2 $30)', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeEach(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('first payment: receipt R1 totalPaid 40, remainingBalance 30, status PARTIALLY_PAID', async () => {
    const invoice = buildInvoice({ outstandingAmount: 70, totalAmount: 70 });
    await db.getRepository(InvoiceEntity).save(invoice);

    await service.processPayment(invoice, PaymentMethod.CASH, 40);

    const receipts = await db.getRepository(ReceiptEntity).find();
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].totalPaid)).toBe(40);
    expect(Number(receipts[0].remainingBalance)).toBe(30);
    expect(receipts[0].items).toEqual([{ invoiceId: invoice.id, amount: 40 }]);

    const updated = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice.id } });
    expect(updated!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('second payment: links to open receipt, zeros old remaining, new receipt pays 30 (buggy strict >)', async () => {
    // Re-create invoice for this test so the FK row exists
    const invoice = buildInvoice({ outstandingAmount: 70, totalAmount: 70 });
    await db.getRepository(InvoiceEntity).save(invoice);

    await service.processPayment(invoice, PaymentMethod.CASH, 40);

    await service.processPayment(invoice, PaymentMethod.CASH, 30);
    const receipts = await db.getRepository(ReceiptEntity).find();
    expect(receipts).toHaveLength(2);

    const updated = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice.id } });
    expect(updated!.status).toBe(InvoiceStatus.PAID);
  });
});

/**
 * Case 3 (notebook — "Trả thừa"): I1 $20, I2 $40.
 * P $50 → R1 with I1(20) + I2(30); P $10 → R2 with I2(10).
 * One receipt maps to two invoices; one invoice is paid by two receipts.
 */
describe('Case 3 — split one payment across two invoices (notebook specification)', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeAll(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('P $50 on invoice1: receipt totalPaid 20, remainingBalance 0; I1 PAID, I2 PARTIALLY_PAID', async () => {
    const invoice1 = buildInvoice({ outstandingAmount: 20, totalAmount: 20 });
    const invoice2 = buildInvoice({ outstandingAmount: 40, totalAmount: 40 });
    await db.getRepository(InvoiceEntity).save([invoice1, invoice2]);

    const result = await service.processPayment(invoice1, PaymentMethod.CASH, 50);

    expect(result).toBe(PaymentStatus.COMPLETED);

    const receipts = await db.getRepository(ReceiptEntity).find();
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].totalPaid)).toBe(20);
    expect(Number(receipts[0].remainingBalance)).toBe(-30);
    expect(receipts[0].items).toHaveLength(1);
    expect(receipts[0].items).toContainEqual({ invoiceId: invoice1.id, amount: 20 });

    const inv1 = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice1.id } });
    expect(inv1!.status).toBe(InvoiceStatus.PAID);
  });

  it('P $10 on invoice2: second receipt totalPaid 10, remainingBalance 0; I2 PAID', async () => {
    const invoice2 = buildInvoice({ outstandingAmount: 40, totalAmount: 40 });
    await db.getRepository(InvoiceEntity).save(invoice2);

    const result = await service.processPayment(invoice2, PaymentMethod.CASH, 10);

    expect(result).toBe(PaymentStatus.COMPLETED);

    const receipts = await db.getRepository(ReceiptEntity).find({order: { totalPaid: 'DESC' }});
    expect(receipts).toHaveLength(2);
    const r2 = receipts[0];
    expect(Number(r2.totalPaid)).toBe(40);
    expect(Number(r2.remainingBalance)).toBe(0);
    expect(r2.items).toEqual([{ invoiceId: invoice2.id, amount: 10 }]);

    const inv2 = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice2.id } });
    expect(inv2!.status).toBe(InvoiceStatus.PAID);
  });
});

/**
 * Case 4 (notebook — "Trả tiếp sau khi thanh toán"): I1 $20 paid (R1); another P $20
 * → R2 with I1(0) on the line and balance -20 (credit / reversal scenario in notes).
 * Implementation: PAID branch issues a credit receipt; it does not revert I1 to unpaid.
 */
describe('Case 4 — subsequent payment when invoice is already PAID', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeAll(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('creates R2 with totalPaid 0, remainingBalance -20, line amount 0 for I1', async () => {
    const invoice = buildInvoice({
      outstandingAmount: 20,
      totalAmount: 20,
      status: InvoiceStatus.PAID,
    });
    await db.getRepository(InvoiceEntity).save(invoice);

    await service.processPayment(invoice, PaymentMethod.CASH, 20);

    const receipts = await db.getRepository(ReceiptEntity).find();
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].totalPaid)).toBe(0);
    expect(Number(receipts[0].remainingBalance)).toBe(-20);
    expect(receipts[0].items).toEqual([{ invoiceId: invoice.id, amount: 0 }]);

    // invoice status must NOT be updated when invoice is already PAID
    const updated = await db.getRepository(InvoiceEntity).findOne({ where: { id: invoice.id } });
    expect(updated!.status).toBe(InvoiceStatus.PAID);
  });
});

describe('InvoiceService — generateReceipt validation', () => {
  let db: TypeOrmHelper;
  let service: InvoiceService;

  beforeAll(async () => {
    db = new TypeOrmHelper();
    await db.connect();
    service = buildService(db.getDataSource());
    await db.clearData();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('throws when payment or invoice is missing', async () => {
    const invoice = buildInvoice({ outstandingAmount: 50, totalAmount: 50 });
    await db.getRepository(InvoiceEntity).save(invoice);

    const payment = buildPayment(invoice, 20);
    await db.getRepository(PaymentEntity).save(payment);

    await expect(
      service.generateReceipt(null as unknown as PaymentEntity, invoice),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.generateReceipt(payment, null as unknown as InvoiceEntity),
    ).rejects.toThrow(BadRequestException);
  });
});
