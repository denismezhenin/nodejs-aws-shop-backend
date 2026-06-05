import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderEntity } from '../entities/order.entity';
import { OrderStatus } from '../type';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
  ) {}

  getAll(): Promise<OrderEntity[]> {
    return this.orders.find();
  }

  async findById(orderId: string): Promise<OrderEntity> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    
    return order;
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderEntity> {
    const order = await this.findById(orderId);
    order.status = status;
    return this.orders.save(order);
  }
}
