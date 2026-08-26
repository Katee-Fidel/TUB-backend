const QRCode = require('qrcode');
const { cloudinary } = require('../config/cloudinary.js');
const { Readable } = require('stream');

/**
 * Generates a QR code image and uploads it to Cloudinary.
 * @param {string} qrData - The data to encode in the QR code (e.g., ticket ID, event info)
 * @param {string} ticketId - Optional MongoDB ticket ID for naming the asset
 * @returns {Promise<string>} - Cloudinary URL of the uploaded QR code image
 */
async function generateAndUploadQRCode(qrData, ticketId = '') {
  try {
    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    // Upload to Cloudinary using upload_stream
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'tub/tickets',
          public_id: `ticket-qr-${ticketId || Date.now()}`,
          overwrite: false,
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error('Failed to upload QR code'));
          } else {
            resolve(result.secure_url);
          }
        }
      );

      // Pipe the buffer into the upload stream
      uploadStream.on('error', (error) => {
        console.error('Upload stream error:', error);
        reject(new Error('Failed to upload QR code'));
      });

      const readable = Readable.from([qrBuffer]);
      readable.pipe(uploadStream);
    });
  } catch (err) {
    console.error('QR code generation error:', err);
    throw new Error('Failed to generate QR code');
  }
}

module.exports = { generateAndUploadQRCode };
