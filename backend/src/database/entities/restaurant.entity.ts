import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from "typeorm";

@Entity("restaurants")
export class Restaurant {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  bannerUrl: string;

  @Column()
  address: string;

  @Column({ type: "float", default: 0 })
  lat: number;

  @Column({ type: "float", default: 0 })
  lng: number;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: "float", default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: true })
  isOpen: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  ownerUserId: string;

  @Column({ nullable: true })
  openingTime: string;

  @Column({ nullable: true })
  closingTime: string;

  @Column({ type: "int", default: 1000 })
  deliveryFee: number;

  @Column({ type: "int", default: 30 })
  estimatedDeliveryMinutes: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
