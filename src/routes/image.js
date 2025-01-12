import { Router } from "express";
const router = Router();
import { v2 as cloudinary } from "cloudinary";
import multer, { memoryStorage } from "multer";

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const upload = multer({ storage: memoryStorage() });

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Convert buffer to base64
    const fileStr = req.file.buffer.toString("base64");
    const fileUri = `data:${req.file.mimetype};base64,${fileStr}`;

    // Upload to cloudinary
    const uploadResponse = await cloudinary.uploader.upload(fileUri, {
      folder: "events",
    });

    res.json({ url: uploadResponse.secure_url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;
