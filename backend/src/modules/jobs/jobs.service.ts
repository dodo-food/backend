import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QUEUE_ORDER_PREPARATION, QUEUE_NOTIFICATIONS } from "./jobs.constants";

// ─── Types des jobs ───────────────────────────────────────────────────────────

export interface PrepareOrderJobData {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantLat?: number;
  restaurantLng?: number;
  userId: string;
  grandTotal: number;
  deliveryFee: number;
  paymentMethod: string;
  ref: string;
}

export interface OrderTimeoutJobData {
  orderId: string;
  ref: string;
}

export interface AssignDriverJobData {
  orderId: string;
  restaurantId: string;
  restaurantLat: number;
  restaurantLng: number;
}

export interface DeliveryCompletedJobData {
  orderId: string;
  userId: string;
  driverId: string;
  vendorId: string;
  grandTotal: number;
  deliveryFee: number;
}

export interface SendNotificationJobData {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, string>;
  fcmToken?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUE_ORDER_PREPARATION) private readonly orderQueue: Queue,
    @InjectQueue(QUEUE_NOTIFICATIONS)    private readonly notifQueue: Queue,
  ) {}

  /**
   * Déclenche le pipeline de préparation d'une commande.
   * Appelé juste après POST /orders.
   */
  async dispatchOrderPipeline(data: PrepareOrderJobData) {
    // 1. Job immédiat — validation et notification vendeur
    await this.orderQueue.add("prepare-order", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    // 2. Job différé — timeout si le vendeur n'accepte pas dans 10 minutes
    await this.orderQueue.add(
      "order-timeout",
      { orderId: data.orderId, ref: data.ref } satisfies OrderTimeoutJobData,
      { delay: 10 * 60 * 1000, attempts: 1 },
    );

    this.logger.log(`Pipeline lancé pour commande ${data.ref} (${data.orderId})`);
  }

  /**
   * Déclenche l'attribution d'un livreur (après acceptation par le vendeur).
   */
  async dispatchAssignDriver(data: AssignDriverJobData) {
    await this.orderQueue.add("assign-driver", data, {
      attempts: 3,
      backoff: { type: "fixed", delay: 3000 },
    });
    this.logger.log(`Attribution livreur planifiée pour commande ${data.orderId}`);
  }

  /**
   * Déclenche le traitement post-livraison (répartition financière, prompt avis).
   */
  async dispatchDeliveryCompleted(data: DeliveryCompletedJobData) {
    await this.orderQueue.add("delivery-completed", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
    this.logger.log(`Post-livraison planifié pour commande ${data.orderId}`);
  }

  /**
   * Envoie une notification push/in-app de façon asynchrone.
   */
  async dispatchNotification(data: SendNotificationJobData) {
    await this.notifQueue.add("send-notification", data, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  /**
   * Annule le job timeout d'une commande (quand le vendeur accepte).
   */
  async cancelOrderTimeout(orderId: string) {
    const jobs = await this.orderQueue.getJobs(["delayed"]);
    for (const job of jobs) {
      if (job.name === "order-timeout" && job.data?.orderId === orderId) {
        await job.remove();
        this.logger.log(`Timeout annulé pour commande ${orderId}`);
        break;
      }
    }
  }

  /**
   * Retourne l'état des queues (monitoring).
   */
  async getQueuesStatus() {
    const [
      orderWaiting, orderActive, orderFailed, orderDelayed,
      notifWaiting, notifActive, notifFailed,
    ] = await Promise.all([
      this.orderQueue.getWaitingCount(),
      this.orderQueue.getActiveCount(),
      this.orderQueue.getFailedCount(),
      this.orderQueue.getDelayedCount(),
      this.notifQueue.getWaitingCount(),
      this.notifQueue.getActiveCount(),
      this.notifQueue.getFailedCount(),
    ]);

    return {
      queues: {
        "order.preparation": {
          waiting: orderWaiting,
          active: orderActive,
          failed: orderFailed,
          delayed: orderDelayed,
        },
        "order.notifications": {
          waiting: notifWaiting,
          active: notifActive,
          failed: notifFailed,
        },
      },
      redis: process.env.REDIS_URL ? "configured" : "in-memory-fallback",
    };
  }
}
