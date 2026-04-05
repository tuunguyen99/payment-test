import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor() {}

  async run() {
    return 'Hello, world!';
  }
}
