import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { FirebaseService } from "../../firebase/firebase.service";
import { InitiatePaymentDto, MOBILE_MONEY_OPERATORS } from "./dto/initiate-payment.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { YengaPayWebhookDto } from "./dto/yengapay-webhook.dto";

// ─── Types internes ───────────────────────────────────────────────────────────

export type PaymentMethod =
  | "orange_money"
  | "moov_money"
  | "sank_money"
  | "telecel_money"
  | "coris_money"
  | "paypal";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "cancelled";

interface YengaPayResponse {
  transactionId: string;
  status: string;
  message?: string;
  reference?: string;
}

interface YengaRefundResponse {
  refundId: string;
  status: string;
  amount: number;
  message?: string;
}

// ─── Constantes métier ────────────────────────────────────────────────────────

const REFUNDABLE_STATUSES: PaymentStatus[] = ["paid"];
const MAX_REFUND_DELAY_HOURS = 72;

// Statuts YengaPay webhook → statut interne
const WEBHOOK_SUCCESS_STATUSES = new Set(["DONE", "SUCCESS"]);
const WEBHOOK_FAILED_STATUSES  = new Set(["FAILED", "CANCELLED"]);

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class YengaPayService {
  private readonly logger = new Logger(YengaPayService.name);

  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly merchantId: string | null;
  private readonly webhookSecret: string | null;

  private readonly colOrders     = "orders";
  private readonly colPayments   = "yengapay_transactions";
  private readonly colRefunds    = "yengapay_refunds";
  private readonly colFinancials = "order_financials";

  private readonly PLATFORM_FEE_RATE = 0.15;
  private readonly DRIVER_FEE_RATE   = 0.70;
  private readonly VENDOR_FEE_RATE   = 0.15;

  constructor(private readonly firebase: FirebaseService) {
    this.baseUrl    = process.env.EXPO_PUBLIC_YENGAPAY_BASE_URL ?? "https://api.yengapay.com/v1";
    this.apiKey     = process.env.EXPO_PUBLIC_YENGAPAY_API_KEY ?? null;
    this.merchantId = process.env.EXPO_PUBLIC_YENGAPAY_MERCHANT_ID ?? null;
    this.webhookSecret = process.env.YENGAPAY_WEBHOOK_SECRET ?? null;

    if (!this.apiKey) {
      this.logger.warn("EXPO_PUBLIC_YENGAPAY_API_KEY absent — mode simulation activé");
    } else {
      this.logger.log("YengaPay configuré : " + this.baseUrl);
    }
    if (!this.webhookSecret) {
      this.logger.warn(
        "YENGAPAY_WEBHOOK_SECRET absent — vérification de signature désactivée (déconseillé en production)"
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  // ─── Initier un paiement ───────────────────────────────────────────────────

  async initiatePayment(dto: InitiatePaymentDto, userId: string) {
    const order = await this.fetchAndValidateOrder(dto.orderId, userId);

    if (order.payment_status === "paid") {
      throw new BadRequestException("Cette commande est déjà payée");
    }
    if (order.payment_status === "cancelled") {
      throw new BadRequestException("Impossible de payer une commande annulée");
    }

    // Mobile Money : numéro de téléphone obligatoire
    if (MOBILE_MONEY_OPERATORS.includes(dto.method as any)) {
      if (!dto.phone) {
        throw new BadRequestException(
          "Le numéro de téléphone est obligatoire pour un paiement Mobile Money"
        );
      }
      this.validateBurkinabePhone(dto.phone);
    }

    if (!this.isConfigured) {
      return this.simulatePayment(dto, order);
    }

    return this.callYengaPayInitiate(dto, order, userId);
  }

  // ─── Vérifier le statut d'un paiement ────────────────────────────────────

  async getPaymentStatus(orderId: string, userId: string) {
    const order = await this.fetchAndValidateOrder(orderId, userId);

    let yengaTransaction: any = null;

    if (order.yenga_transaction_id && this.isConfigured) {
      try {
        yengaTransaction = await this.callYengaPayStatusCheck(order.yenga_transaction_id);
        if (yengaTransaction?.status === "success" && order.payment_status !== "paid") {
          await this.markOrderPaid(orderId, order.yenga_transaction_id, order.payment_method, order);
        }
      } catch (err: any) {
        this.logger.warn(`Impossible de vérifier le statut YengaPay : ${err.message}`);
      }
    }

    return {
      orderId,
      paymentStatus:      order.payment_status ?? "pending",
      paymentMethod:      order.payment_method ?? null,
      yengaTransactionId: order.yenga_transaction_id ?? null,
      paidAt:             order.paid_at ?? null,
      refundedAt:         order.refunded_at ?? null,
      yengaStatus:        yengaTransaction?.status ?? null,
    };
  }

  // ─── Webhook YengaPay ─────────────────────────────────────────────────────
  //
  // YengaPay envoie POST /api/v1/payments/webhook/yengapay après chaque
  // changement de statut de paiement (DONE, FAILED, REFUNDED…).
  //
  // Logique :
  //   1. Vérification de signature HMAC-SHA256 si YENGAPAY_WEBHOOK_SECRET configuré
  //   2. Récupération de la commande par `reference` (= order.ref)
  //   3. Mise à jour du statut dans Firestore
  //   4. Notification Firebase in-app pour le client

  async handleWebhook(dto: YengaPayWebhookDto, rawSignature?: string): Promise<void> {
    // 1. Vérification de signature
    if (this.webhookSecret) {
      if (!rawSignature) {
        this.logger.warn(`[webhook] Signature absente pour ref=${dto.reference}`);
        throw new BadRequestException("Signature manquante");
      }
      const expected = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(dto.reference + dto.payment_status + (dto.amount ?? ""))
        .digest("hex");

      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(rawSignature))) {
        this.logger.warn(`[webhook] Signature invalide pour ref=${dto.reference}`);
        throw new BadRequestException("Signature invalide");
      }
    }

    // 2. Trouver la commande par référence
    const ordersSnap = await this.firebase.db
      .collection(this.colOrders)
      .where("ref", "==", dto.reference)
      .limit(1)
      .get();

    if (ordersSnap.empty) {
      this.logger.warn(`[webhook] Commande introuvable pour ref=${dto.reference}`);
      return; // Pas une erreur — peut être un test YengaPay
    }

    const orderDoc = ordersSnap.docs[0];
    const orderId  = orderDoc.id;
    const order    = orderDoc.data() as any;

    this.logger.log(
      `[webhook] ref=${dto.reference} — statut YengaPay: ${dto.payment_status} — commande: ${orderId}`
    );

    // 3. Idempotence — ignorer si déjà traité
    if (order.payment_status === "paid" && WEBHOOK_SUCCESS_STATUSES.has(dto.payment_status)) {
      this.logger.log(`[webhook] Commande ${orderId} déjà marquée payée — ignoré`);
      return;
    }

    // 4. Traitement selon statut
    if (WEBHOOK_SUCCESS_STATUSES.has(dto.payment_status)) {
      await this.markOrderPaid(
        orderId,
        dto.transaction_id ?? order.yenga_transaction_id ?? "webhook_tx",
        dto.operator ?? order.payment_method,
        order,
      );

      await this.notifyClient(order.user_id, {
        type: "payment_confirmed",
        title: "Paiement confirmé ✅",
        body:  `Votre commande ${dto.reference} est en cours de préparation.`,
        orderId,
        ref: dto.reference,
      });

      this.logger.log(`[webhook] Paiement confirmé pour commande ${orderId}`);
      return;
    }

    if (WEBHOOK_FAILED_STATUSES.has(dto.payment_status)) {
      await this.firebase.db.collection(this.colOrders).doc(orderId).update({
        payment_status:    "failed",
        payment_failed_at: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      });

      await this.notifyClient(order.user_id, {
        type: "payment_failed",
        title: "Paiement échoué",
        body:  `Le paiement de la commande ${dto.reference} a échoué. Réessayez ou changez de méthode.`,
        orderId,
        ref: dto.reference,
      });

      this.logger.warn(`[webhook] Paiement échoué pour commande ${orderId}`);
      return;
    }

    if (dto.payment_status === "REFUNDED") {
      await this.firebase.db.collection(this.colOrders).doc(orderId).update({
        payment_status: "refunded",
        refunded_at:    new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      });

      await this.notifyClient(order.user_id, {
        type: "payment_refunded",
        title: "Remboursement effectué",
        body:  `Votre remboursement pour la commande ${dto.reference} a été traité.`,
        orderId,
        ref: dto.reference,
      });

      this.logger.log(`[webhook] Remboursement confirmé pour commande ${orderId}`);
      return;
    }

    // Statut PENDING ou inconnu — enregistrement brut sans mise à jour critique
    this.logger.log(`[webhook] Statut intermédiaire ${dto.payment_status} pour commande ${orderId}`);
    await this.firebase.db.collection(this.colPayments).add({
      order_id:       orderId,
      reference:      dto.reference,
      payment_status: dto.payment_status,
      transaction_id: dto.transaction_id ?? null,
      operator:       dto.operator ?? null,
      amount:         dto.amount ?? null,
      source:         "webhook",
      created_at:     new Date().toISOString(),
    });
  }

  // ─── Rembourser un paiement ───────────────────────────────────────────────

  async refundPayment(dto: RefundPaymentDto, userId: string) {
    const order = await this.fetchAndValidateOrder(dto.orderId, userId);

    if (!REFUNDABLE_STATUSES.includes(order.payment_status as PaymentStatus)) {
      throw new UnprocessableEntityException(
        `Seules les commandes payées peuvent être remboursées. Statut actuel : "${order.payment_status}"`
      );
    }

    if (!order.yenga_transaction_id) {
      throw new UnprocessableEntityException(
        "Aucune transaction YengaPay associée à cette commande"
      );
    }

    if (order.paid_at) {
      const hoursSincePaid = (Date.now() - new Date(order.paid_at).getTime()) / 3_600_000;
      if (hoursSincePaid > MAX_REFUND_DELAY_HOURS) {
        throw new UnprocessableEntityException(
          `Fenêtre de remboursement dépassée (maximum ${MAX_REFUND_DELAY_HOURS}h après le paiement)`
        );
      }
    }

    const grandTotal: number = order.grand_total ?? 0;
    const refundAmount = dto.amount ?? grandTotal;

    if (refundAmount > grandTotal) {
      throw new BadRequestException(
        `Montant du remboursement (${refundAmount} FCFA) > total commande (${grandTotal} FCFA)`
      );
    }

    const alreadyRefunded: number = order.total_refunded ?? 0;
    const remainingRefundable = grandTotal - alreadyRefunded;

    if (refundAmount > remainingRefundable) {
      throw new BadRequestException(
        `Montant remboursable restant : ${remainingRefundable} FCFA (déjà remboursé : ${alreadyRefunded} FCFA)`
      );
    }

    if (!this.isConfigured) {
      return this.simulateRefund(dto, order, refundAmount, grandTotal);
    }

    return this.callYengaPayRefund(dto, order, refundAmount, grandTotal, userId);
  }

  // ─── Historique des transactions d'une commande ──────────────────────────

  async getTransactionHistory(orderId: string, userId: string) {
    const order = await this.fetchAndValidateOrder(orderId, userId);

    const [txSnap, refundSnap] = await Promise.all([
      this.firebase.db
        .collection(this.colPayments)
        .where("order_id", "==", orderId)
        .orderBy("created_at", "desc")
        .get(),
      this.firebase.db
        .collection(this.colRefunds)
        .where("order_id", "==", orderId)
        .orderBy("created_at", "desc")
        .get(),
    ]);

    return {
      orderId,
      paymentStatus:  order.payment_status ?? "pending",
      paymentMethod:  order.payment_method ?? null,
      grandTotal:     order.grand_total ?? 0,
      totalRefunded:  order.total_refunded ?? 0,
      transactions:   txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      refunds:        refundSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  }

  // ─── Appels HTTP YengaPay ─────────────────────────────────────────────────

  private async callYengaPayInitiate(
    dto: InitiatePaymentDto,
    order: any,
    userId: string,
  ) {
    try {
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${this.apiKey}`,
          ...(this.merchantId ? { "X-Merchant-ID": this.merchantId } : {}),
        },
        body: JSON.stringify({
          amount:       dto.amount,
          currency:     "XOF",
          phone:        dto.phone,
          method:       dto.method,
          reference:    order.ref ?? dto.orderId,
          description:  `Commande Dodo ${order.ref ?? dto.orderId}`,
          callback_url: `${process.env.BACKEND_PUBLIC_URL ?? ""}/api/v1/payments/webhook/yengapay`,
          metadata:     { orderId: dto.orderId, userId },
        }),
      });

      const data = (await res.json()) as YengaPayResponse;
      if (!res.ok) throw new BadRequestException(data?.message ?? "Erreur YengaPay");

      // AUDIT v10 Fix (PY-C1) : le paiement Mobile Money est ASYNCHRONE.
      // L'ancienne version appelait markOrderPaid() dès la réponse HTTP de YengaPay,
      // avant que le client ne valide sur son téléphone. Cela créait de fausses
      // confirmations de paiement et des risques de double traitement avec le webhook.
      // Fix : markOrderPaid uniquement si l'API répond avec un statut de succès immédiat
      // (ex. paiement carte synchrone). Pour tous les autres statuts (pending, initiated,
      // processing…) → on enregistre "processing" et on attend la confirmation webhook
      // (DONE/SUCCESS) qui appellera markOrderPaid via handleWebhook().
      const IMMEDIATE_SUCCESS = new Set(["success", "DONE", "SUCCESS", "completed", "COMPLETED"]);
      if (IMMEDIATE_SUCCESS.has(data.status)) {
        await this.markOrderPaid(dto.orderId, data.transactionId, dto.method, order);
      } else {
        await this.firebase.db.collection(this.colOrders).doc(dto.orderId).update({
          payment_status:       "processing",
          yenga_transaction_id: data.transactionId,
          payment_method:       dto.method,
          updated_at:           new Date().toISOString(),
        });
      }
      await this.firebase.db.collection(this.colPayments).add({
        order_id:             dto.orderId,
        user_id:              userId,
        yenga_transaction_id: data.transactionId,
        amount:    dto.amount,
        currency:  "XOF",
        method:    dto.method,
        status:    data.status,
        reference: order.ref ?? dto.orderId,
        source:    "api",
        created_at: new Date().toISOString(),
      });

      this.logger.log(`Paiement YengaPay initié : ${data.transactionId} — commande ${dto.orderId}`);

      return {
        success: true,
        transactionId: data.transactionId,
        method:   dto.method,
        amount:   dto.amount,
        currency: "XOF",
        status:   data.status,
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error("Erreur YengaPay initiatePayment:", err.message);
      throw new BadRequestException(err.message ?? "Échec du paiement");
    }
  }

  private async callYengaPayStatusCheck(transactionId: string): Promise<YengaPayResponse> {
    const res = await fetch(`${this.baseUrl}/payments/${transactionId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`YengaPay status check HTTP ${res.status}`);
    return res.json() as Promise<YengaPayResponse>;
  }

  private async callYengaPayRefund(
    dto: RefundPaymentDto,
    order: any,
    refundAmount: number,
    grandTotal: number,
    userId: string,
  ) {
    try {
      const res = await fetch(
        `${this.baseUrl}/payments/${order.yenga_transaction_id}/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            amount:    refundAmount,
            reason:    dto.reason ?? "requested_by_customer",
            reference: `refund_${dto.orderId}_${Date.now()}`,
          }),
        },
      );

      const data = (await res.json()) as YengaRefundResponse;
      if (!res.ok) throw new BadRequestException(data?.message ?? "Erreur remboursement YengaPay");

      return this.persistRefund({
        orderId: dto.orderId, userId,
        yengaRefundId: data.refundId,
        yengaTransactionId: order.yenga_transaction_id,
        refundAmount, grandTotal, reason: dto.reason, order,
      });
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error("Erreur YengaPay refund:", err.message);
      throw new BadRequestException(err.message ?? "Échec du remboursement");
    }
  }

  // ─── Mode simulation (sans clé API) ──────────────────────────────────────

  private async simulatePayment(dto: InitiatePaymentDto, order: any) {
    this.logger.warn("YengaPay non configuré — paiement simulé");
    const simulatedId = `sim_tx_${Date.now()}`;

    await this.markOrderPaid(dto.orderId, simulatedId, dto.method, order);
    await this.firebase.db.collection(this.colPayments).add({
      order_id:             dto.orderId,
      yenga_transaction_id: simulatedId,
      amount: dto.amount, currency: "XOF",
      method: dto.method, status: "simulated", simulated: true,
      created_at: new Date().toISOString(),
    });

    return {
      success: true, simulated: true,
      transactionId: simulatedId,
      method: dto.method, amount: dto.amount, currency: "XOF",
      message: "Paiement simulé (EXPO_PUBLIC_YENGAPAY_API_KEY non configuré)",
    };
  }

  private async simulateRefund(
    dto: RefundPaymentDto,
    order: any,
    refundAmount: number,
    grandTotal: number,
  ) {
    this.logger.warn("YengaPay non configuré — remboursement simulé");
    return this.persistRefund({
      orderId: dto.orderId, userId: order.user_id,
      yengaRefundId: `sim_re_${Date.now()}`,
      yengaTransactionId: order.yenga_transaction_id ?? "sim",
      refundAmount, grandTotal, reason: dto.reason, order, simulated: true,
    });
  }

  // ─── Persistance Firestore ────────────────────────────────────────────────

  private async markOrderPaid(
    orderId: string,
    transactionId: string,
    method: string,
    order: any,
  ) {
    await this.firebase.db.collection(this.colOrders).doc(orderId).update({
      payment_status:       "paid",
      payment_method:       method,
      yenga_transaction_id: transactionId,
      paid_at:              new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    });
    await this.recordFinancials(orderId, order.grand_total ?? 0, order.delivery_fee ?? 1000);
  }

  private async persistRefund(params: {
    orderId: string;
    userId: string;
    yengaRefundId: string;
    yengaTransactionId: string;
    refundAmount: number;
    grandTotal: number;
    reason?: string;
    order: any;
    simulated?: boolean;
  }) {
    const {
      orderId, userId, yengaRefundId, yengaTransactionId,
      refundAmount, grandTotal, reason, order, simulated = false,
    } = params;

    const is_partial = refundAmount < grandTotal;
    const alreadyRefunded: number = order.total_refunded ?? 0;
    const newTotalRefunded = alreadyRefunded + refundAmount;
    const newStatus: PaymentStatus = newTotalRefunded >= grandTotal ? "refunded" : "partially_refunded";

    await this.firebase.db.collection(this.colOrders).doc(orderId).update({
      payment_status:  newStatus,
      total_refunded:  newTotalRefunded,
      last_refund_id:  yengaRefundId,
      refunded_at:     new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    });

    await this.firebase.db.collection(this.colRefunds).add({
      order_id:             orderId,
      user_id:              userId,
      yenga_refund_id:      yengaRefundId,
      yenga_transaction_id: yengaTransactionId,
      amount: refundAmount, currency: "XOF",
      reason: reason ?? "requested_by_customer",
      is_partial, simulated, status: "succeeded",
      created_at: new Date().toISOString(),
    });

    this.logger.log(`Remboursement enregistré : ${yengaRefundId} — ${refundAmount} FCFA pour commande ${orderId}`);

    return {
      success: true, refundId: yengaRefundId, amount: refundAmount,
      currency: "XOF", isPartial: is_partial, newPaymentStatus: newStatus,
      totalRefunded: newTotalRefunded,
      ...(simulated ? { simulated: true, message: "Remboursement simulé" } : {}),
    };
  }

  private async recordFinancials(orderId: string, grandTotal: number, deliveryFee: number) {
    const subtotal = grandTotal - deliveryFee;
    await this.firebase.db.collection(this.colFinancials).add({
      order_id:       orderId,
      grand_total:    grandTotal,
      delivery_fee:   deliveryFee,
      subtotal,
      platform_share: Math.round(subtotal * this.PLATFORM_FEE_RATE),
      vendor_share:   Math.round(subtotal * this.VENDOR_FEE_RATE + subtotal * (1 - this.PLATFORM_FEE_RATE - this.DRIVER_FEE_RATE - this.VENDOR_FEE_RATE)),
      driver_share:   Math.round(deliveryFee * this.DRIVER_FEE_RATE),
      source: "yengapay", created_at: new Date().toISOString(),
    });
  }

  // ─── Notification Firebase in-app ─────────────────────────────────────────

  private async notifyClient(userId: string, payload: {
    type: string; title: string; body: string; orderId: string; ref: string;
  }) {
    if (!userId) return;
    try {
      await this.firebase.db.collection("notifications").add({
        user_id: userId,
        ...payload,
        data:       { orderId: payload.orderId, ref: payload.ref },
        is_read:    false,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      this.logger.warn(`Notification non envoyée (${userId}) : ${err.message}`);
    }
  }

  // ─── Helpers de validation ────────────────────────────────────────────────

  private async fetchAndValidateOrder(orderId: string, userId: string) {
    const doc = await this.firebase.db.collection(this.colOrders).doc(orderId).get();
    if (!doc.exists) throw new NotFoundException(`Commande ${orderId} introuvable`);
    const order = doc.data() as any;
    if (order.user_id !== userId) throw new BadRequestException("Accès non autorisé à cette commande");
    return order;
  }

  private validateBurkinabePhone(phone: string) {
    const pattern = /^\+226[0-9]{8}$/;
    if (!pattern.test(phone)) {
      throw new BadRequestException("Numéro invalide — format attendu : +226XXXXXXXX");
    }
  }
}
