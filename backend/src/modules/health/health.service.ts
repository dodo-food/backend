import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { CacheService } from "../../cache/cache.service";
import { FirebaseService } from "../../firebase/firebase.service";
import { QUEUE_ORDER_PREPARATION, QUEUE_NOTIFICATIONS } from "../jobs/jobs.module";

export interface ServiceStatus {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  detail?: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    firebase: ServiceStatus;
    bullmq: ServiceStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_ORDER_PREPARATION) private readonly queuePrep: Queue,
    @InjectQueue(QUEUE_NOTIFICATIONS)     private readonly queueNotif: Queue,
    private readonly cache: CacheService,
    private readonly firebase: FirebaseService,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, redis, firebase, bullmq] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkFirebase(),
      this.checkBullMQ(),
    ]);

    const services = { postgres, redis, firebase, bullmq };

    const statuses = Object.values(services).map((s) => s.status);
    const globalStatus: HealthReport["status"] = statuses.includes("down")
      ? "down"
      : statuses.includes("degraded")
      ? "degraded"
      : "ok";

    return {
      status: globalStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      version: process.env.npm_package_version ?? "1.0.0",
      services,
    };
  }

  // ── PostgreSQL ───────────────────────────────────────────────────────────────

  private async checkPostgres(): Promise<ServiceStatus> {
    const t = Date.now();
    try {
      if (!this.dataSource.isInitialized) {
        return { status: "down", detail: "DataSource non initialisée" };
      }
      await this.dataSource.query("SELECT 1");
      return { status: "ok", latencyMs: Date.now() - t };
    } catch (err: any) {
      this.logger.warn(`[Health] PostgreSQL down : ${err.message}`);
      return { status: "down", latencyMs: Date.now() - t, detail: err.message };
    }
  }

  // ── Redis ────────────────────────────────────────────────────────────────────

  private async checkRedis(): Promise<ServiceStatus> {
    const t = Date.now();
    try {
      const connected = this.cache.isRedisConnected();
      if (!connected) {
        return {
          status: "degraded",
          detail: process.env.REDIS_URL
            ? "REDIS_URL défini mais connexion non établie — fallback mémoire actif"
            : "REDIS_URL absent — cache en mémoire (non persistant)",
        };
      }
      await this.cache.set("__health_ping__", 1, 5);
      return { status: "ok", latencyMs: Date.now() - t };
    } catch (err: any) {
      this.logger.warn(`[Health] Redis down : ${err.message}`);
      return { status: "degraded", latencyMs: Date.now() - t, detail: err.message };
    }
  }

  // ── Firebase Admin SDK ───────────────────────────────────────────────────────
  // Utilise une lecture Firestore (GET) — l'Admin SDK bypass les règles de sécurité.
  // Pas d'écriture pour éviter toute dépendance aux règles Firestore.

  private async checkFirebase(): Promise<ServiceStatus> {
    const t = Date.now();
    try {
      const projectId = this.firebase.app.options.projectId;
      if (!projectId) {
        return { status: "down", detail: "Firebase Admin SDK non initialisé" };
      }
      // Lecture légère d'un document inexistant — toujours réussit si Firebase est joignable
      // L'Admin SDK bypass les règles Firestore → pas de dépendance aux rules
      await this.firebase.db.collection("__health__").doc("ping").get();
      return {
        status: "ok",
        latencyMs: Date.now() - t,
        detail: `projet: ${projectId}`,
      };
    } catch (err: any) {
      this.logger.warn(`[Health] Firebase down : ${err.message}`);
      return { status: "down", latencyMs: Date.now() - t, detail: err.message };
    }
  }

  // ── BullMQ ───────────────────────────────────────────────────────────────────

  private async checkBullMQ(): Promise<ServiceStatus> {
    const t = Date.now();
    try {
      const [prepCounts, notifCounts] = await Promise.all([
        this.queuePrep.getJobCounts("waiting", "active", "failed"),
        this.queueNotif.getJobCounts("waiting", "active", "failed"),
      ]);
      return {
        status: "ok",
        latencyMs: Date.now() - t,
        detail: JSON.stringify({
          [QUEUE_ORDER_PREPARATION]: prepCounts,
          [QUEUE_NOTIFICATIONS]: notifCounts,
        }),
      };
    } catch (err: any) {
      this.logger.warn(`[Health] BullMQ down : ${err.message}`);
      return {
        status: "degraded",
        latencyMs: Date.now() - t,
        detail: `Redis absent — queues en mode dégradé : ${err.message}`,
      };
    }
  }
}
