import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceEntity } from './invoice.entity';

@Entity('invoice_item', { schema: 'public' })
export class InvoiceItemEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'text', nullable: false })
  @ApiProperty()
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  @ApiProperty()
  quantity: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  unitPrice: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  lineTotal: number;

  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0 })
  @ApiProperty()
  taxRate: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  taxAmount: number;

  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoiceId' })
  invoice: InvoiceEntity;
}
