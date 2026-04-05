import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { InvoiceEntity } from '../src/invoices/entities/invoice.entity';
import { InvoiceItemEntity } from '../src/invoices/entities/invoice-item.entity';
import { PaymentEntity } from '../src/invoices/entities/payment.entity';
import { ReceiptEntity } from '../src/invoices/entities/receipt.entity';

// Load .env.test so process.env has the right Postgres connection values
config({ path: require('path').resolve(__dirname, '../.env.test') });

/**
 * Test helper that owns a real PostgreSQL DataSource.
 *
 * Each `describe` block that needs the DB should instantiate one of these:
 *
 *   let db: TypeOrmHelper;
 *
 *   beforeAll(async () => {
 *     db = new TypeOrmHelper();
 *     await db.connect();        // creates schema (synchronize: true)
 *   });
 *
 *   afterEach(async () => {
 *     await db.clearData();      // DELETE FROM all tables
 *   });
 *
 *   afterAll(async () => {
 *     await db.disconnect();     // close pool
 *   });
 *
 * The underlying DataSource is configured with `dropSchema: true`, so the
 * schema is always fresh when connect() is called.
 */
export class TypeOrmHelper {
  private dataSource: DataSource;

  constructor() {
    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5433),
      username: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD ?? 'secret',
      database: process.env.POSTGRES_DB ?? 'projectz_test',
      entities: [InvoiceEntity, InvoiceItemEntity, PaymentEntity, ReceiptEntity],
      synchronize: true,        // auto-creates schema (dev/test only)
      dropSchema: true,          // fresh DB per suite — no fixture bleed
      logging: false,
    });
  }

  async connect(): Promise<DataSource> {
    await this.dataSource.initialize();
    return this.dataSource;
  }

  async disconnect(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  /**
   * Truncates all tables using DELETE (safe — no schema changes).
   * Call after each test to reset state without rebuilding the schema.
   */
  async clearData(): Promise<void> {
    if (!this.dataSource?.isInitialized) return;
    await this.dataSource.transaction(async (manager) => {
      // Delete in reverse dependency order to avoid FK violations
      const tables = ['receipt', 'payment', 'invoice_item', 'invoice'];
      for (const table of tables) {
        await manager.query(`DELETE FROM "${table}"`);
      }
    });
  }

  getRepository<T>(entity: new () => T) {
    return this.dataSource.getRepository(entity);
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }
}
