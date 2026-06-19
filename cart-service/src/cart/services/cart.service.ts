import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { OrderEntity } from '../../order/entities/order.entity';
import { CreateOrderDto, OrderStatus, PutCartPayload } from '../../order/type';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  findByUserId(userId: string): Promise<Cart | null> {
    return this.carts.findOne({
      where: { userId, status: 'OPEN' }
    });
  }

  async createByUserId(userId: string): Promise<Cart> {
    const stamp = today();
    
    return this.carts.save({
      userId,
      status: OrderStatus.Open,
      createdAt: stamp,
      updatedAt: stamp,
      items: [],
    });
  }

  async findOrCreateByUserId(userId: string): Promise<Cart> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    return this.createByUserId(userId);
  }

  async updateByUserId(
    userId: string,
    payload: PutCartPayload,
  ): Promise<Cart> {
    const cart = await this.findOrCreateByUserId(userId);
    const productId = payload.product.id;
    const existing = cart.items.find((it) => it.productId === productId);

    if (!existing) {
      if (payload.count > 0) {
        await this.items.save({
          cartId: cart.id,
          productId,
          count: payload.count,
        });
      }
    } else if (payload.count === 0) {
      await this.items.delete({ cartId: cart.id, productId });
    } else {
      await this.items.update(
        { cartId: cart.id, productId },
        { count: payload.count },
      );
    }

    await this.carts.update({ id: cart.id }, { updatedAt: today() });
    return this.findOrCreateByUserId(userId);
  }

  async removeByUserId(userId: string): Promise<void> {
    const cart = await this.findByUserId(userId);
    if (!cart) return;
    
    await this.carts.delete({ id: cart.id });
  }

  async checkout(userId: string, body: CreateOrderDto): Promise<OrderEntity> {
    return this.dataSource.transaction(async (tx) => {
      const cart = await tx.findOne(Cart, {
        where: { userId, status: 'OPEN' }
      });
      if (!cart?.items.length) {
        throw new BadRequestException('Cart is empty');
      }

      cart.status = 'ORDERED';
      cart.updatedAt = today();
      await tx.save(cart);

      // task schema for cart_items has no price column, so total is sum of counts
      const total = cart.items.reduce((sum, it) => sum + it.count, 0);
      const order = tx.create(OrderEntity, {
        userId,
        cartId: cart.id,
        payment: body?.payment ?? {},
        delivery: body?.delivery ?? body?.address ?? {},
        comments: body?.comments,
        status: OrderStatus.Open,
        total: total.toFixed(2),
      });

      return tx.save(order);
    });
  }
}
