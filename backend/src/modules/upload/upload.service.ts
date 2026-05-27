import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

export interface UploadResult {
  url: string;
  thumbnailUrl?: string;
  /** Image 400×400 — usage cartes mobiles */
  mediumUrl?: string;
  publicId: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
}

const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "gif"];
const DOC_FORMATS   = ["pdf", "jpg", "jpeg", "png", "webp"];
const MAX_IMAGE_B64_SIZE = 14 * 1024 * 1024; // ~10 Mo image (base64 +33%)
const MAX_DOC_B64_SIZE   = 28 * 1024 * 1024; // ~20 Mo document

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  readonly configured: boolean;

  constructor() {
    const name = process.env.CLOUDINARY_CLOUD_NAME;
    const key  = process.env.CLOUDINARY_API_KEY;
    const sec  = process.env.CLOUDINARY_API_SECRET;

    if (name && key && sec) {
      cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec });
      this.configured = true;
      this.logger.log("Cloudinary configuré ✅");
    } else {
      this.configured = false;
      this.logger.warn(
        "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET absents. " +
        "Ajoutez ces variables dans les variables d'environnement Railway pour activer l'upload.",
      );
    }
  }

  private ensureConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        "Cloudinary non configuré. Ajoutez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans les variables d'environnement Railway.",
      );
    }
  }

  /** Extrait le format depuis le mimeType ou le nom de fichier */
  private resolveFormat(mimeType: string, originalName?: string): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg":  "jpg",
      "image/png":  "png",
      "image/webp": "webp",
      "image/gif":  "gif",
      "application/pdf": "pdf",
    };
    if (map[mimeType]) return map[mimeType];
    if (originalName) return originalName.split(".").pop()?.toLowerCase() ?? "";
    return "";
  }

  /**
   * Upload image (plats, restaurants, profils, bannières).
   * Redimensionnement à 800px large + miniature 200×200.
   *
   * @param data  Données base64 pures (sans préfixe data:...) OU data URI complète
   * @param mimeType  ex. "image/jpeg"
   * @param folder  "restaurants" | "foods" | "profiles" | "banners"
   */
  async uploadImage(
    data: string,
    mimeType: string,
    folder: "restaurants" | "foods" | "profiles" | "banners",
    originalName?: string,
  ): Promise<UploadResult> {
    this.ensureConfigured();

    if (data.length > MAX_IMAGE_B64_SIZE) {
      throw new BadRequestException("Fichier trop volumineux (max 10 Mo)");
    }

    const fmt = this.resolveFormat(mimeType, originalName);
    if (!IMAGE_FORMATS.includes(fmt)) {
      throw new BadRequestException(
        `Format image non supporté. Formats acceptés : ${IMAGE_FORMATS.join(", ")}`,
      );
    }

    // Normalise en data URI si nécessaire
    const dataUri = data.startsWith("data:")
      ? data
      : `data:${mimeType};base64,${data}`;

    // Qualité adaptée selon le type de contenu :
    //   - foods/restaurants : auto:good (visuels produit, qualité importante)
    //   - profiles/banners  : auto:eco  (usage secondaire, bande passante réduite)
    const deliveryQuality = (folder === "foods" || folder === "restaurants")
      ? "auto:good"
      : "auto:eco";

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `foodbf/${folder}`,
      resource_type: "image",
      // f_auto → Cloudinary sélectionne AVIF ou WebP selon le client (CDN)
      // Pas de format fixe ici pour maximiser la compatibilité delivery
      transformation: [{ width: 800, quality: deliveryQuality, crop: "limit" }],
      eager: [
        // Miniature 200×200 — listes compactes, thumbnails
        { width: 200, height: 200, crop: "fill", quality: "auto:eco",  format: "webp" },
        // Medium 400×400 — cartes restaurants, plats en vue détail
        { width: 400, height: 400, crop: "fill", quality: "auto:good", format: "webp" },
      ],
      eager_async: false,
    });

    this.logger.log(`Image uploadée → foodbf/${folder}/${result.public_id}`);

    const eager = (result.eager as any[]) ?? [];

    return {
      url:          result.secure_url,
      thumbnailUrl: eager[0]?.secure_url,
      mediumUrl:    eager[1]?.secure_url,
      publicId:     result.public_id,
      format:       result.format,
      bytes:        result.bytes,
      width:        result.width,
      height:       result.height,
    };
  }

  /**
   * Upload document KYC (pièce d'identité, permis, photos livreur/vendeur).
   * PDF ou image — pas de redimensionnement forcé.
   *
   * @param data  Données base64 (pures ou data URI)
   * @param mimeType  ex. "application/pdf" ou "image/jpeg"
   * @param folder  "kyc_drivers" | "kyc_vendors"
   */
  async uploadDocument(
    data: string,
    mimeType: string,
    folder: "kyc_drivers" | "kyc_vendors",
    originalName?: string,
  ): Promise<UploadResult> {
    this.ensureConfigured();

    if (data.length > MAX_DOC_B64_SIZE) {
      throw new BadRequestException("Fichier trop volumineux (max 20 Mo)");
    }

    const fmt = this.resolveFormat(mimeType, originalName);
    if (!DOC_FORMATS.includes(fmt)) {
      throw new BadRequestException(
        `Format non supporté. Formats acceptés : ${DOC_FORMATS.join(", ")}`,
      );
    }

    const dataUri = data.startsWith("data:")
      ? data
      : `data:${mimeType};base64,${data}`;

    const isImage = ["jpg", "jpeg", "png", "webp"].includes(fmt);

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `foodbf/${folder}`,
      resource_type: "auto",
      ...(isImage
        ? { transformation: [{ quality: "auto:good", width: 1600, crop: "limit" }] }
        : {}),
    });

    this.logger.log(`Document uploadé → foodbf/${folder}/${result.public_id}`);

    return {
      url:      result.secure_url,
      publicId: result.public_id,
      format:   result.format,
      bytes:    result.bytes,
      width:    result.width,
      height:   result.height,
    };
  }

  async deleteFile(publicId: string): Promise<void> {
    this.ensureConfigured();
    await cloudinary.uploader.destroy(publicId);
    this.logger.log(`Fichier supprimé → ${publicId}`);
  }
}
