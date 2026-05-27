import { Injectable, NotFoundException } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { CreateFoodDto } from "./dto/create-food.dto";
import { UpdateFoodDto } from "./dto/update-food.dto";

@Injectable()
export class FoodsService {
  private readonly col = "foods";

  constructor(private readonly firebase: FirebaseService) {}

  async findAll(restaurantId?: string) {
    let query: FirebaseFirestore.Query = this.firebase.db.collection(this.col);
    if (restaurantId) {
      query = query.where("restaurantId", "==", restaurantId);
    }
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async findOne(id: string) {
    const doc = await this.firebase.db.collection(this.col).doc(id).get();
    if (!doc.exists) throw new NotFoundException(`Plat ${id} introuvable`);
    return { id: doc.id, ...doc.data() };
  }

  async create(dto: CreateFoodDto) {
    const ref = await this.firebase.db.collection(this.col).add({
      ...dto,
      isAvailable: dto.isAvailable ?? true,
      createdAt: new Date().toISOString(),
    });
    return { id: ref.id, ...dto };
  }

  async update(id: string, dto: UpdateFoodDto) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Plat ${id} introuvable`);
    await ref.update({ ...dto, updatedAt: new Date().toISOString() });
    return { id, ...doc.data(), ...dto };
  }

  async remove(id: string) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Plat ${id} introuvable`);
    await ref.delete();
    return { success: true, id };
  }

  async toggleAvailability(id: string) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Plat ${id} introuvable`);
    const current = (doc.data() as any).isAvailable ?? true;
    await ref.update({ isAvailable: !current, updatedAt: new Date().toISOString() });
    return { id, isAvailable: !current };
  }
}
