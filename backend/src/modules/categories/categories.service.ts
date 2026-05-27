import { Injectable } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";

@Injectable()
export class CategoriesService {
  private readonly col = "categories";

  constructor(private readonly firebase: FirebaseService) {}

  async findAll() {
    const snap = await this.firebase.db.collection(this.col).get();
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return this.defaultCategories();
  }

  private defaultCategories() {
    return [
      { id: "1", name: "Africaine", icon: "🍲" },
      { id: "2", name: "Rapide", icon: "🍔" },
      { id: "3", name: "Poulet", icon: "🍗" },
      { id: "4", name: "Pizza", icon: "🍕" },
      { id: "5", name: "Boissons", icon: "🥤" },
      { id: "6", name: "Desserts", icon: "🍰" },
      { id: "7", name: "Végétarien", icon: "🥗" },
    ];
  }
}
