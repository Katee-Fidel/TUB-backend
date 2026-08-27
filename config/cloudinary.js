const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// multer-storage-cloudinary streams the uploaded file straight to Cloudinary —
// we never write it to disk on the Render instance, which matters since
// Render's filesystem is ephemeral anyway.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "event-platform/event-banners",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 630, crop: "limit" }],
  },
});

const uploadBanner = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap
});

const postStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "tub/posts",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1600, height: 1600, crop: "limit" }],
  },
});

const uploadPost = multer({ storage: postStorage, limits: { fileSize: 8 * 1024 * 1024 } });

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "tub/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
  },
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 3 * 1024 * 1024 } });

module.exports = { cloudinary, uploadBanner, uploadPost, uploadAvatar };
