import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

type CacheStore = Map<string, { value: string; expiresAt: number | null }>;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory: CacheStore = new Map();
  private memoryTtlTimer: NodeJS.Timeout | null = null;

  onModuleInit() {
    const raw = process.env.REDIS_URL ?? "";
    // Upstash CLI syntax: "redis-cli --tls -u rediss://..." → extraire juste l'URL
    const redisUrl = raw.replace(/^.*?(rediss?:\/\/)/, "$1").trim() || null;
    if (redisUrl) {
      const isTls = redisUrl.startsWith("rediss://");
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 2,
        ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
      });
      this.redis.on("connect", () => this.logger.log("Redis connecté ✅"));
      this.redis.on("error", (err) => {
        this.logger.warn(`Redis erreur : ${err.message} — fallback mémoire activé`);
        this.redis = null;
      });
      this.redis.connect().catch(() => {
        this.logger.warn("Redis introuvable — fallback mémoire activé");
        this.redis = null;
      });
    } else {
      this.logger.warn("REDIS_URL absent — cache en mémoire (non persistant)");
    }

    this.memoryTtlTimer = setInterval(() => this.evictExpired(), 30_000);
  }

  onModuleDestroy() {
    if (this.memoryTtlTimer) clearInterval(this.memoryTtlTimer);
    if (this.redis) this.redis.quit().catch(() => {});
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.redis) {
      if (ttlSeconds) {
        await this.redis.set(key, serialized, "EX", ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
      return;
    }
    this.memory.set(key, {
      value: serialized,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.redis) {
      const raw = await this.redis.get(key);
      return raw ? JSON.parse(raw) : null;
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async setDriverLocation(driverUserId: string, lat: number, lng: number): Promise<void> {
    await this.set(`loc:driver:${driverUserId}`, { lat, lng, updatedAt: Date.now() }, 120);
  }

  async getDriverLocation(driverUserId: string): Promise<{ lat: number; lng: number; updatedAt: number } | null> {
    return this.get(`loc:driver:${driverUserId}`);
  }

  async setActiveOrder(orderId: string, data: unknown): Promise<void> {
    await this.set(`order:active:${orderId}`, data, 600);
  }

  async getActiveOrder<T = unknown>(orderId: string): Promise<T | null> {
    return this.get<T>(`order:active:${orderId}`);
  }

  async invalidateActiveOrder(orderId: string): Promise<void> {
    await this.del(`order:active:${orderId}`);
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 60): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await factory();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  isRedisConnected(): boolean {
    return this.redis !== null && this.redis.status === "ready";
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.memory.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) this.memory.delete(key);
    }
  }
}
