import ImageKit from 'imagekit';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
export const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Configure multer for PDF uploads
export const uploadPDF = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Upload image to ImageKit
export const uploadToImageKit = async (file, folder = 'blogs') => {
  try {
    const result = await imagekit.upload({
      file: file.buffer,
      fileName: `${Date.now()}-${file.originalname}`,
      folder: folder,
      useUniqueFileName: true,
      tags: ['blog', 'upload']
    });

    return {
      success: true,
      url: result.url,
      fileId: result.fileId,
      name: result.name,
      size: result.size
    };
  } catch (error) {
    console.error('ImageKit Upload Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Upload PDF to ImageKit
export const uploadPDFToImageKit = async (file, folder = 'brochures') => {
  try {
    const result = await imagekit.upload({
      file: file.buffer,
      fileName: `${Date.now()}-${file.originalname}`,
      folder: folder,
      useUniqueFileName: true,
      tags: ['brochure', 'pdf']
    });

    return {
      success: true,
      url: result.url,
      fileId: result.fileId,
      name: result.name,
      size: result.size
    };
  } catch (error) {
    console.error('ImageKit PDF Upload Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete image from ImageKit
export const deleteFromImageKit = async (fileId) => {
  try {
    await imagekit.deleteFile(fileId);
    return { success: true };
  } catch (error) {
    console.error('ImageKit Delete Error:', error);
    return { success: false, error: error.message };
  }
};

// Get ImageKit authentication parameters for frontend
export const getImageKitAuth = () => {
  const token = imagekit.getAuthenticationParameters();
  return {
    signature: token.signature,
    expire: token.expire,
    token: token.token,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  };
};