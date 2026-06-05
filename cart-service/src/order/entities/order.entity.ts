import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cart } from '../../cart/entities/cart.entity';
import { OrderStatus } from '../type';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payment!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  delivery!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  comments?: string;

  @Column({ type: 'varchar', length: 32, default: OrderStatus.Open })
  status!: OrderStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total!: string;

  @ManyToOne(() => Cart)
  @JoinColumn({ name: 'cart_id' })
  cart!: Cart;
}
