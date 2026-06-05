import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { BasicAuthGuard } from '../auth/guards/bacis-auth.guard';
import { AppRequest, getUserIdFromRequest } from '../shared';
import { OrderService } from '../order/services/order.service';
import { OrderEntity } from '../order/entities/order.entity';
import { CreateOrderDto, PutCartPayload } from '../order/type';

import { CartService } from './services/cart.service';
import { CartItem } from './entities/cart-item.entity';

@Controller('api/profile/cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
  ) {}

  @UseGuards(BasicAuthGuard)
  @Get()
  async findUserCart(@Req() req: AppRequest): Promise<CartItem[]> {
    const cart = await this.cartService.findOrCreateByUserId(
      getUserIdFromRequest(req),
    );
    return cart.items;
  }

  @UseGuards(BasicAuthGuard)
  @Put()
  async updateUserCart(
    @Req() req: AppRequest,
    @Body() body: PutCartPayload,
  ): Promise<CartItem[]> {
    if (!body?.product?.id || typeof body.count !== 'number') {
      throw new BadRequestException('Invalid cart payload');
    }
    const cart = await this.cartService.updateByUserId(
      getUserIdFromRequest(req),
      body,
    );
    return cart.items;
  }

  @UseGuards(BasicAuthGuard)
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clearUserCart(@Req() req: AppRequest): Promise<void> {
    await this.cartService.removeByUserId(getUserIdFromRequest(req));
  }

  @UseGuards(BasicAuthGuard)
  @Put('order')
  async checkout(
    @Req() req: AppRequest,
    @Body() body: CreateOrderDto,
  ): Promise<{ order: OrderEntity }> {
    const userId = getUserIdFromRequest(req);
    const order = await this.cartService.checkout(userId, body ?? {});
    return { order };
  }

  @UseGuards(BasicAuthGuard)
  @Get('order')
  async getOrders(): Promise<OrderEntity[]> {
    return this.orderService.getAll();
  }
}
