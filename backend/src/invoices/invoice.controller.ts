import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
  } from '@nestjs/common';
  import { ApiResponse, ApiTags } from '@nestjs/swagger';
  
  @Controller('api/invoices')
  @ApiTags('invoices')
  export class InvoiceController {
  }
  