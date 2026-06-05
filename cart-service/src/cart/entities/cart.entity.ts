import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CartItem } from './cart-item.entity';

export type CartStatus = 'OPEN' | 'ORDERED';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'created_at', type: 'date' })
  createdAt!: string;

  @Column({ name: 'updated_at', type: 'date' })
  updatedAt!: string;

  @Column({
    type: 'enum',
    enum: ['OPEN', 'ORDERED'],
    enumName: 'cart_status',
    default: 'OPEN',
  })
  status!: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart, {
    cascade: true,
    eager: true,
  })
  items!: CartItem[];
}
