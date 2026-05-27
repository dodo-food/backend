export type OrderStatus =
  | "En attente"
  | "En préparation"
  | "En livraison"
  | "Livré"
  | "Annulé";

export type DeliveryStatus =
  | "assigned"
  | "accepted"
  | "heading_to_vendor"
  | "at_vendor"
  | "heading_to_client"
  | "delivered"
  | "refused";

export type KycStatus = "not_started" | "pending" | "approved" | "rejected";

export type PaymentMethod = "cash" | "orange_money" | "moov_money" | "card";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type NotifType =
  | "order_placed"
  | "order_accepted"
  | "preparing"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "driver_assigned"
  | "promo"
  | "system";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}
