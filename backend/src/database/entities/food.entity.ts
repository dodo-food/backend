import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("foods")
export class Food {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  restaurantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: "int" })
  price: number;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  category: string;

  @Column({ default: true })
  isAvailable: boolean;

  @Column({ default: false })
  isPopular: boolean;

  @Column({ type: "float", default: 0 })
  rating: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
