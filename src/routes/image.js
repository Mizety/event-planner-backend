/**
 * Image Upload Router
 * Handles file uploads to Cloudinary using multer for multipart form processing
 * Features:
 * - In-memory file processing
 * - Base64 encoding
 * - Secure URL generation
 * - Error handling for failed uploads
 */

import { Router } from "express";
import { v2 as cloudinary } from "cloudinary";
import multer, { memoryStorage } from "multer";

const router = Router();

/**
 * Cloudinary Configuration
 * Initializes the Cloudinary SDK with credentials from environment variables
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME: Your Cloudinary cloud name
 * - CLOUDINARY_API_KEY: Your Cloudinary API key
 * - CLOUDINARY_API_SECRET: Your Cloudinary API secret
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Multer Configuration
 * Configures multer to store files in memory instead of disk
 * Benefits:
 * - Faster processing
 * - No temporary files on disk
 * - Suitable for serverless environments
 */
const upload = multer({ storage: memoryStorage() });

/**
 * POST /api/images/upload
 * Uploads a single image file to Cloudinary
 * @param {File} req.file - The uploaded file (from multer)
 * @returns {Object} Object containing the secure URL of the uploaded image
 * @throws {400} If no file is uploaded
 * @throws {500} If upload to Cloudinary fails
 *
 * Example usage with FormData:
 * const formData = new FormData();
 * formData.append('file', fileObject);
 * await fetch('/api/images/upload', {
 *   method: 'POST',
 *   body: formData
 * });
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Validate file presence
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Convert file buffer to base64 data URI
    // This format is required by Cloudinary's upload API
    const fileStr = req.file.buffer.toString("base64");
    const fileUri = `data:${req.file.mimetype};base64,${fileStr}`;

    // Upload to Cloudinary with configuration
    const uploadResponse = await cloudinary.uploader.upload(fileUri, {
      folder: "events",
    });

    // Return the secure URL (https) of the uploaded image
    res.json({ url: uploadResponse.secure_url });
  } catch (error) {
    // Log error for debugging but don't expose details to client
    console.error("Upload error:", error);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;
