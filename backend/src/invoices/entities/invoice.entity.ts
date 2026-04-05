import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { InvoiceItemEntity } from './invoice-item.entity';

@Entity('invoice', { schema: 'public' })
export class InvoiceEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', nullable: false, unique: true })
  @ApiProperty()
  invoiceNumber: string;

  @Column({ type: 'date', nullable: false })
  @ApiProperty()
  invoiceDate: Date;

  @OneToMany(() => InvoiceItemEntity, (item) => item.invoice, {
    cascade: true,
  })
  @ApiProperty({ type: () => [InvoiceItemEntity] })
  items: InvoiceItemEntity[];

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  totalAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  totalTax: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  @ApiProperty()
  outstandingAmount: number;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    nullable: false,
    default: InvoiceStatus.DRAFT,
  })
  @ApiProperty({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
