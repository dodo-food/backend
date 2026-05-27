import { Injectable, NotFoundException } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  private readonly col = "profiles";

  constructor(private readonly firebase: FirebaseService) {}

  async getProfile(uid: string) {
    const doc = await this.firebase.db.collection(this.col).doc(uid).get();
    if (!doc.exists) throw new NotFoundException("Profil introuvable");
    return { id: doc.id, ...doc.data() };
  }

  async updateProfile(uid: string, dto: UpdateUserDto) {
    const ref = this.firebase.db.collection(this.col).doc(uid);
    const payload: Record<string, any> = {};
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.phone !== undefined) payload.phone = dto.phone;
    if (dto.address !== undefined) payload.address = dto.address;
    if (dto.avatarUrl !== undefined) payload.avatar_url = dto.avatarUrl;

    if (Object.keys(payload).length === 0) {
      return this.getProfile(uid);
    }

    payload.updatedAt = new Date().toISOString();
    await ref.set(payload, { merge: true });
    const updated = await ref.get();
    return { id: uid, ...updated.data() };
  }

  async getLoyaltyPoints(uid: string) {
    const doc = await this.firebase.db.collection(this.col).doc(uid).get();
    if (!doc.exists) return { uid, loyaltyPoints: 0 };
    const data = doc.data() as any;
    return { uid, loyaltyPoints: data.loyalty_points ?? 0 };
  }

  async addLoyaltyPoints(uid: string, points: number) {
    const ref = this.firebase.db.collection(this.col).doc(uid);
    const doc = await ref.get();
    const current = doc.exists ? ((doc.data() as any).loyalty_points ?? 0) : 0;
    const newTotal = current + points;
    await ref.set({ loyalty_points: newTotal, updatedAt: new Date().toISOString() }, { merge: true });
    return { uid, loyaltyPoints: newTotal };
  }
}
