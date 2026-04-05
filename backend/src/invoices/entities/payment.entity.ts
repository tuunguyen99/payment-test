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
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity('payment', { schema: 'public' })
export class PaymentEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @ManyToOne(() => InvoiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  @ApiProperty({ type: () => InvoiceEntity })
  invoice: InvoiceEntity;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    nullable: false,
  })
  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  amount: number;

  @Column({ type: 'timestamp with time zone', nullable: false })
  @ApiProperty()
  paymentDate: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty()
  referenceNumber: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    nullable: false,
    default: PaymentStatus.PENDING,
  })
  @ApiProperty({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;
}
