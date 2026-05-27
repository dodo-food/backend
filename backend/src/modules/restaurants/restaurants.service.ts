import { Injectable, NotFoundException } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";

@Injectable()
export class RestaurantsService {
  private readonly col = "restaurants";

  constructor(private readonly firebase: FirebaseService) {}

  async findAll(category?: string) {
    let query: FirebaseFirestore.Query = this.firebase.db.collection(this.col);
    if (category) {
      query = query.where("category", "==", category);
    }
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async findOne(id: string) {
    const doc = await this.firebase.db.collection(this.col).doc(id).get();
    if (!doc.exists) throw new NotFoundException(`Restaurant ${id} introuvable`);
    return { id: doc.id, ...doc.data() };
  }

  async create(dto: CreateRestaurantDto) {
    const ref = await this.firebase.db.collection(this.col).add({
      ...dto,
      rating: dto.rating ?? 0,
      reviewCount: 0,
      isOpen: dto.isOpen ?? true,
      deliveryFee: dto.deliveryFee ?? 1000,
      deliveryTime: dto.deliveryTime ?? "30-45 min",
      createdAt: new Date().toISOString(),
    });
    return { id: ref.id, ...dto };
  }

  async update(id: string, dto: UpdateRestaurantDto) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Restaurant ${id} introuvable`);
    await ref.update({ ...dto, updatedAt: new Date().toISOString() });
    return { id, ...doc.data(), ...dto };
  }

  async remove(id: string) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Restaurant ${id} introuvable`);
    await ref.delete();
    return { success: true, id };
  }
}
