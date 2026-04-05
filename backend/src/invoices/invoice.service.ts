import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceItemEntity } from './entities/invoice-item.entity';
import { InvoiceStatus } from './enums/invoice-status.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentEntity } from './entities/payment.entity';
import { ReceiptEntity } from './entities/receipt.entity';

export type InvoiceTotal = {    
    totalAmount: number;
    totalTax: number;
    outstandingAmount: number;
}

@Injectable()
export class InvoiceService {
    constructor(
        @InjectRepository(InvoiceEntity)
        private readonly invoiceRepository: Repository<InvoiceEntity>,

        @InjectRepository(InvoiceItemEntity)
        private readonly invoiceItemRepository: Repository<InvoiceItemEntity>,

        @InjectRepository(PaymentEntity)
        private readonly paymentRepository: Repository<PaymentEntity>,

        @InjectRepository(ReceiptEntity)
        private readonly receiptRepository: Repository<ReceiptEntity>,
    ) {}

    async calculateInvoiceTotal(items: InvoiceItemEntity[], taxRate: number): Promise<InvoiceTotal> {
        if (!items || items.length === 0) {
            throw new BadRequestException('Items are required');
        }
        if (taxRate < 0) {
            throw new BadRequestException('Tax rate must be greater than 0');
        }
        const effectiveTaxRate = Number(taxRate);
        let taxAmount = 0;
        const outstandingAmount = items.reduce((total, item) => {
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.unitPrice);
            if (quantity && unitPrice) {
                const itemTaxRate = Number(item.taxRate);
                const appliedRate = itemTaxRate || effectiveTaxRate;
                taxAmount += quantity * unitPrice * appliedRate;
                return total + (quantity * unitPrice * (1 + appliedRate));
            }
            return total;
        }, 0);
        const totalTax = taxAmount;
        const totalAmount = outstandingAmount - totalTax;

        const invoice = new InvoiceEntity();
        invoice.items = items;
        invoice.totalAmount = totalAmount;
        invoice.totalTax = totalTax;
        invoice.outstandingAmount = outstandingAmount;
        invoice.status = InvoiceStatus.DRAFT;

        invoice.invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        invoice.invoiceDate = new Date();
        await this.invoiceRepository.save(invoice);

        return { totalAmount, totalTax, outstandingAmount};
    }

    async processPayment(invoice: InvoiceEntity, paymentMethod: PaymentMethod, paymentAmount: number, referenceNumber?: string): Promise<PaymentStatus> {
        if (paymentAmount <= 0) {
            throw new BadRequestException('Payment amount must be greater than 0');
        }

        if (paymentMethod !== PaymentMethod.CASH && paymentMethod !== PaymentMethod.CARD && paymentMethod !== PaymentMethod.BANK_TRANSFER && paymentMethod !== PaymentMethod.E_WALLET) {
            throw new BadRequestException('Invalid payment method');
        }

        const payment = new PaymentEntity();
        payment.invoice = invoice;
        payment.paymentMethod = paymentMethod;
        payment.amount = Number(paymentAmount);
        payment.paymentDate = new Date();
        payment.status = PaymentStatus.COMPLETED;
        payment.referenceNumber = referenceNumber;
        await this.paymentRepository.save(payment);

        await this.generateReceipt(payment, invoice);

        return PaymentStatus.COMPLETED;
    }

    async generateReceipt(payment: PaymentEntity, invoice: InvoiceEntity) : Promise<ReceiptEntity> {
        if (!payment || !invoice) {
            throw new BadRequestException('Payment and invoice are required');
        }

        const listReceipt = await this.receiptRepository.find({
            where: {
                remainingBalance: Not(0),
            },
            order: {
                receiptDate: 'DESC',
            },
        });


        const receiptWithRemainingBalance = listReceipt?.find((receipt) => Number(receipt.remainingBalance) > 0 && receipt.items.some((item) => item.invoiceId === invoice.id));
        if (receiptWithRemainingBalance) {
            const receipt = new ReceiptEntity();
            receipt.payment = payment;
            receipt.receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            receipt.receiptDate = new Date();
            const paymentAmountNum = Number(payment.amount);
            const prevRemainingNum = Number(receiptWithRemainingBalance.remainingBalance);
            receipt.totalPaid = paymentAmountNum > prevRemainingNum ? prevRemainingNum : paymentAmountNum;
            receipt.remainingBalance = prevRemainingNum - Number(receipt.totalPaid);
            receipt.items = [{
                invoiceId: invoice.id,
                amount: paymentAmountNum,
            }];
            await this.receiptRepository.update(receiptWithRemainingBalance.id, {
                remainingBalance: 0,
            });
            await this.receiptRepository.save(receipt);

            await this.invoiceRepository.update(invoice.id, {
                status: Number(receipt.remainingBalance) <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
            });
            return receipt;
        }

        if (invoice.status === InvoiceStatus.PAID) {
            const receipt = new ReceiptEntity();
            receipt.payment = payment;
            receipt.receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            receipt.receiptDate = new Date();
            receipt.totalPaid = 0;
            receipt.remainingBalance = -Number(payment.amount);
            receipt.items = [{
                invoiceId: invoice.id,
                amount: 0,
            }];
    
            await this.receiptRepository.save(receipt);
            return receipt;
        }

        // find receipt with negative remaining balance
        const receiptWithNegativeRemainingBalance = listReceipt?.find((receipt) => Number(receipt.remainingBalance) < 0);
        if (receiptWithNegativeRemainingBalance) {
            const receipt = new ReceiptEntity();
            receipt.payment = payment;
            receipt.receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            receipt.receiptDate = new Date();
            const paymentAmountNum = Number(payment.amount);
            const negRemainingNum = Number(receiptWithNegativeRemainingBalance.remainingBalance);
            const outstandingAmountNum = Number(invoice.outstandingAmount);
            let totalAmount = paymentAmountNum - negRemainingNum;
            receipt.totalPaid = totalAmount > outstandingAmountNum ? outstandingAmountNum : totalAmount;
            receipt.remainingBalance = outstandingAmountNum - Number(receipt.totalPaid);

            receipt.items = [{
                invoiceId: invoice.id,
                amount: Number(receipt.totalPaid + negRemainingNum),
            }];

            await this.receiptRepository.save(receipt);

            await this.receiptRepository.update(receiptWithNegativeRemainingBalance.id, {
                remainingBalance: 0,
                items: [...receiptWithNegativeRemainingBalance.items, {
                    invoiceId: invoice.id,
                    amount: - negRemainingNum,
                }],
            });

            await this.invoiceRepository.update(invoice.id, {
                status: outstandingAmountNum - Number(receipt.totalPaid) > 0 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.PAID,
            });
            return receipt;
        }


        // If no incomplete payment found, create a new receipt for this payment
        const receipt = new ReceiptEntity();
        receipt.payment = payment;
        receipt.receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        receipt.receiptDate = new Date();
        const paymentAmountNum = Number(payment.amount);
        const outstandingAmountNum = Number(invoice.outstandingAmount);
        receipt.totalPaid = paymentAmountNum > outstandingAmountNum ? outstandingAmountNum : paymentAmountNum;
        receipt.remainingBalance = outstandingAmountNum - paymentAmountNum;
        receipt.items = [{
            invoiceId: invoice.id,
            amount: Number(receipt.totalPaid),
        }];

        await this.receiptRepository.save(receipt);

        await this.invoiceRepository.update(invoice.id, {
            status: outstandingAmountNum - Number(receipt.totalPaid) > 0 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.PAID,
        });
        return receipt;
    }
}
