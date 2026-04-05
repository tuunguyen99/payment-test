import { Module } from '@nestjs/common';
import { InvoiceService } from '@src/invoices/invoice.service';
import { InvoiceController } from '@src/invoices/invoice.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '@src/invoices/entities/invoice.entity';
import { InvoiceItemEntity } from '@src/invoices/entities/invoice-item.entity';
import { PaymentEntity } from '@src/invoices/entities/payment.entity';
import { ReceiptEntity } from '@src/invoices/entities/receipt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, InvoiceItemEntity, PaymentEntity, ReceiptEntity])],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
