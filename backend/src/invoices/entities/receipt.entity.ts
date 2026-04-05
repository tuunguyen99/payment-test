import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentEntity } from './payment.entity';

export interface ReceiptItem {
  invoiceId: string;
  amount: number;
}

@Entity('receipt', { schema: 'public' })
@Index(['remainingBalance'])
export class ReceiptEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @ManyToOne(() => PaymentEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentId' })
  @ApiProperty({ type: () => PaymentEntity })
  payment: PaymentEntity;

  @Column({ type: 'varchar', length: 64, nullable: false, unique: true })
  @ApiProperty()
  receiptNumber: string;

  @Column({ type: 'date', nullable: false })
  @ApiProperty()
  receiptDate: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  totalPaid: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  remainingBalance: number;

  @Column({ type: 'jsonb', nullable: true })
  @ApiProperty()
  items: ReceiptItem[];
}
