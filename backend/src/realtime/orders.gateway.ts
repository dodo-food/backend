import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { FirebaseService } from "../firebase/firebase.service";

interface AuthenticatedSocket extends Socket {
  uid?: string;
  role?: string;
}

// ─── Helper CORS WebSocket ────────────────────────────────────────────────────
//
// ⚠️  Clients mobiles React Native (iOS / Android) :
//     Les apps mobiles natives N'envoient PAS l'en-tête Origin lors des
//     connexions WebSocket. Il faut donc autoriser origin === undefined.
//
// ⚠️  Si CORS_ORIGIN n'est pas configuré sur Railway, utiliser ?? false
//     bloquait TOUTES les connexions WebSocket en production.
//     Fix : liste vide = tout autoriser (comportement cohérent avec CORS HTTP).
//
function resolveWsCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, ok?: boolean) => void,
): void {
  // Clients mobiles natifs (React Native) : pas d'Origin → toujours autoriser
  if (!origin) {
    callback(null, true);
    return;
  }
  // En développement : tout autoriser
  if (process.env.NODE_ENV !== "production") {
    callback(null, true);
    return;
  }
  // En production : vérifier la liste blanche
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : [];

  // Liste vide = tout autoriser (backend public API)
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`CORS WebSocket refusé — origine non autorisée : ${origin}`));
  }
}

@WebSocketGateway({
  namespace: "/orders",
  cors: {
    origin: resolveWsCorsOrigin,
    credentials: true,
  },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  constructor(private readonly firebase: FirebaseService) {}

  // ── Authentification à la connexion ──────────────────────────────────────
  async handleConnection(client: AuthenticatedSocket) {
    const token = (client.handshake.auth?.token as string | undefined)
      ?? (client.handshake.query?.token as string | undefined);

    if (!token) {
      this.logger.warn(`WS rejet [orders] id=${client.id} — token manquant (Origin: ${client.handshake.headers.origin ?? "mobile/aucune"})`);
      client.emit("error", { message: "Authentification requise. Fournir auth.token." });
      client.disconnect(true);
      return;
    }

    try {
      const decoded = await this.firebase.verifyIdToken(token);
      client.uid  = decoded.uid;
      client.role = (decoded["role"] as string | undefined) ?? "client";
      this.logger.log(
        `WS connecté [orders] uid=${decoded.uid} role=${client.role} id=${client.id}`,
      );
    } catch (err: any) {
      this.logger.warn(`WS rejet [orders] id=${client.id} — token invalide ou expiré : ${err?.message ?? "inconnu"}`);
      client.emit("error", { message: "Token Firebase invalide ou expiré." });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`WS déconnecté [orders] uid=${client.uid ?? "inconnu"} id=${client.id}`);
  }

  // ── Souscription commande (acheteur / livreur) ────────────────────────────
  // Sécurité : AUDIT v9 Fix (OG-C1) — vérification d'ownership via Firestore.
  @SubscribeMessage("order:subscribe")
  async handleSubscribeOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    const orderId = data?.orderId;
    if (!orderId || typeof orderId !== "string" || orderId.length > 128) {
      client.emit("error", { message: "orderId invalide." });
      return;
    }

    // Admins et drivers ont accès direct
    if (client.role === "admin" || client.role === "driver") {
      const room = `order:${orderId}`;
      client.join(room);
      this.logger.debug(`Client uid=${client.uid} role=${client.role} rejoint room ${room}`);
      client.emit("order:subscribed", { room, orderId });
      return;
    }

    // Pour clients et vendors : vérifier ownership via Firestore
    try {
      const orderDoc = await this.firebase.db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        client.emit("error", { message: "Commande introuvable." });
        return;
      }
      const order = orderDoc.data() as any;

      const isOwner =
        (client.role === "client" && order.user_id === client.uid) ||
        (client.role === "vendor" && order.vendor_user_id === client.uid);

      if (!isOwner) {
        this.logger.warn(
          `WS IDOR [orders] order:subscribe — uid=${client.uid} role=${client.role} → orderId=${orderId}`,
        );
        client.emit("error", { message: "Accès refusé : cette commande ne vous appartient pas." });
        return;
      }
    } catch (err) {
      this.logger.error(`[orders] order:subscribe ownership check failed: ${(err as Error)?.message}`);
      client.emit("error", { message: "Erreur lors de la vérification d'accès." });
      return;
    }

    const room = `order:${orderId}`;
    client.join(room);
    this.logger.debug(`Client uid=${client.uid} role=${client.role} rejoint room ${room}`);
    client.emit("order:subscribed", { room, orderId });
  }

  // ── Souscription vendeur — VENDEUR uniquement ─────────────────────────────
  @SubscribeMessage("vendor:subscribe")
  handleSubscribeVendor(
    @MessageBody() data: { restaurantId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    if (client.role !== "vendor" && client.role !== "admin") {
      this.logger.warn(
        `WS accès refusé [orders] vendor:subscribe — uid=${client.uid} role=${client.role}`,
      );
      client.emit("error", { message: "Accès refusé : rôle vendor requis." });
      return;
    }

    const restaurantId = data?.restaurantId;
    if (!restaurantId || typeof restaurantId !== "string" || restaurantId.length > 128) {
      client.emit("error", { message: "restaurantId invalide." });
      return;
    }

    const room = `vendor:${restaurantId}`;
    client.join(room);
    client.emit("vendor:subscribed", { room, restaurantId });
  }

  // ── Souscription livreur — LIVREUR uniquement ─────────────────────────────
  @SubscribeMessage("driver:subscribe")
  handleSubscribeDriver(
    @MessageBody() data: { driverUserId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    if (client.role === "driver" && client.uid !== data?.driverUserId) {
      this.logger.warn(
        `WS IDOR [orders] driver:subscribe — uid=${client.uid} a tenté de s'abonner à driverUserId=${data?.driverUserId}`,
      );
      client.emit("error", { message: "Accès refusé : vous ne pouvez écouter que votre propre room." });
      return;
    }

    if (client.role !== "driver" && client.role !== "admin") {
      client.emit("error", { message: "Accès refusé : rôle driver requis." });
      return;
    }

    const driverUserId = data?.driverUserId;
    if (!driverUserId || typeof driverUserId !== "string" || driverUserId.length > 128) {
      client.emit("error", { message: "driverUserId invalide." });
      return;
    }

    const room = `driver:${driverUserId}`;
    client.join(room);
    client.emit("driver:subscribed", { room, driverUserId });
  }

  // ── Emissions serveur → clients ───────────────────────────────────────────

  emitOrderStatusUpdate(orderId: string, payload: {
    orderId: string;
    status: string;
    updated_at: string;
    ref?: string;
    driverUserId?: string;
    estimatedMinutes?: number;
  }) {
    this.server.to(`order:${orderId}`).emit("order:status:update", payload);
  }

  emitNewOrderToVendor(restaurantId: string, order: unknown) {
    this.server.to(`vendor:${restaurantId}`).emit("order:new", order);
  }

  emitDeliveryAssigned(driverUserId: string, delivery: unknown) {
    this.server.to(`driver:${driverUserId}`).emit("delivery:assigned", delivery);
  }

  emitDeliveryStatusUpdate(orderId: string, driverUserId: string, payload: unknown) {
    this.server.to(`order:${orderId}`).emit("delivery:status:update", payload);
    this.server.to(`driver:${driverUserId}`).emit("delivery:status:update", payload);
  }
}
