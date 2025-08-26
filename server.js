// Media Processor Service - Video and Image Processing
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { r2Service } = require('../r2-client');
const { db } = require('../supabase-client');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50 // limit each IP to 50 requests per windowMs
});
app.use(limiter);

app.use(express.json());

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 5
  }
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Image processing endpoints
app.post('/process-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { userId } = req.user;
    const { quality = 85, format = 'jpeg', resize } = req.body;

    // Process image
    const processedImages = await processImage(req.file.buffer, {
      quality: parseInt(quality),
      format: format,
      resize: resize ? JSON.parse(resize) : null
    });

    // Upload to R2
    const uploadResults = [];
    const timestamp = Date.now();
    const originalName = req.file.originalname;

    for (const [size, imageBuffer] of Object.entries(processedImages)) {
      const key = r2Service.generateKey('processed', userId, `${size}_${originalName}`, timestamp);
      
      const result = await r2Service.uploadFile(key, imageBuffer, `image/${format}`, {
        userId: userId.toString(),
        type: 'processed_image',
        size: size,
        originalName: originalName,
        processedAt: new Date().toISOString()
      });

      uploadResults.push({
        size: size,
        ...result
      });
    }

    res.json({
      success: true,
      message: 'Image processed successfully',
      data: {
        original: uploadResults.find(r => r.size === 'original'),
        thumbnail: uploadResults.find(r => r.size === 'thumbnail'),
        medium: uploadResults.find(r => r.size === 'medium'),
        large: uploadResults.find(r => r.size === 'large')
      }
    });

  } catch (error) {
    console.error('Image processing error:', error);
    res.status(500).json({
      error: 'Failed to process image',
      message: error.message
    });
  }
});

// Video processing endpoints
app.post('/process-video', authenticateToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { userId } = req.user;
    const { quality = 'medium', format = 'mp4', generateThumbnail = true } = req.body;

    // Create temporary file for FFmpeg
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const inputPath = path.join(tempDir, `input_${Date.now()}.${path.extname(req.file.originalname)}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.${format}`);
    const thumbnailPath = path.join(tempDir, `thumbnail_${Date.now()}.jpg`);

    // Write input file
    await fs.writeFile(inputPath, req.file.buffer);

    // Process video
    const processedVideo = await processVideo(inputPath, outputPath, {
      quality: quality,
      format: format,
      generateThumbnail: generateThumbnail,
      thumbnailPath: thumbnailPath
    });

    // Upload to R2
    const timestamp = Date.now();
    const originalName = req.file.originalname;

    // Upload processed video
    const videoKey = r2Service.generateKey('processed', userId, `processed_${originalName}`, timestamp);
    const videoBuffer = await fs.readFile(outputPath);
    const videoResult = await r2Service.uploadFile(videoKey, videoBuffer, `video/${format}`, {
      userId: userId.toString(),
      type: 'processed_video',
      originalName: originalName,
      duration: processedVideo.duration,
      processedAt: new Date().toISOString()
    });

    // Upload thumbnail if generated
    let thumbnailResult = null;
    if (processedVideo.thumbnail && generateThumbnail) {
      const thumbnailKey = r2Service.generateKey('processed', userId, `thumbnail_${originalName}`, timestamp);
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      thumbnailResult = await r2Service.uploadFile(thumbnailKey, thumbnailBuffer, 'image/jpeg', {
        userId: userId.toString(),
        type: 'video_thumbnail',
        originalName: originalName,
        processedAt: new Date().toISOString()
      });
    }

    // Clean up temporary files
    await cleanupTempFiles([inputPath, outputPath, thumbnailPath]);

    res.json({
      success: true,
      message: 'Video processed successfully',
      data: {
        video: videoResult,
        thumbnail: thumbnailResult,
        metadata: {
          duration: processedVideo.duration,
          format: format,
          quality: quality
        }
      }
    });

  } catch (error) {
    console.error('Video processing error:', error);
    res.status(500).json({
      error: 'Failed to process video',
      message: error.message
    });
  }
});

// Batch processing endpoint
app.post('/batch-process', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { userId } = req.user;
    const results = [];

    for (const file of req.files) {
      try {
        if (isImage(file.mimetype)) {
          const result = await processImageFile(file, userId);
          results.push({
            originalName: file.originalname,
            type: 'image',
            success: true,
            data: result
          });
        } else if (isVideo(file.mimetype)) {
          const result = await processVideoFile(file, userId);
          results.push({
            originalName: file.originalname,
            type: 'video',
            success: true,
            data: result
          });
        } else {
          results.push({
            originalName: file.originalname,
            success: false,
            error: 'Unsupported file type'
          });
        }
      } catch (error) {
        results.push({
          originalName: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Batch processing completed',
      data: {
        total: req.files.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      }
    });

  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({
      error: 'Failed to process files',
      message: error.message
    });
  }
});

// Processing functions
async function processImage(buffer, options = {}) {
  const { quality = 85, format = 'jpeg', resize } = options;
  
  let sharpInstance = sharp(buffer);
  
  // Apply resize if specified
  if (resize) {
    sharpInstance = sharpInstance.resize(resize.width, resize.height, {
      fit: resize.fit || 'inside',
      withoutEnlargement: true
    });
  }

  const results = {
    original: buffer
  };

  // Generate thumbnail
  const thumbnailBuffer = await sharp(buffer)
    .resize(300, 300, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: quality })
    .toBuffer();
  
  results.thumbnail = thumbnailBuffer;

  // Generate medium size
  const mediumBuffer = await sharp(buffer)
    .resize(800, null, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: quality })
    .toBuffer();
  
  results.medium = mediumBuffer;

  // Generate large size
  const largeBuffer = await sharp(buffer)
    .resize(1200, null, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: quality })
    .toBuffer();
  
  results.large = largeBuffer;

  return results;
}

async function processVideo(inputPath, outputPath, options = {}) {
  const { quality = 'medium', format = 'mp4', generateThumbnail = true, thumbnailPath } = options;

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);

    // Set video quality based on preset
    switch (quality) {
      case 'low':
        command.videoCodec('libx264').videoBitrate('500k');
        break;
      case 'medium':
        command.videoCodec('libx264').videoBitrate('1000k');
        break;
      case 'high':
        command.videoCodec('libx264').videoBitrate('2000k');
        break;
      default:
        command.videoCodec('libx264').videoBitrate('1000k');
    }

    // Set audio codec
    command.audioCodec('aac').audioBitrate('128k');

    // Generate thumbnail if requested
    if (generateThumbnail && thumbnailPath) {
      command.screenshots({
        timestamps: ['50%'],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: '320x240'
      });
    }

    // Get video duration
    let duration = null;
    command.on('codecData', (data) => {
      duration = parseFloat(data.duration);
    });

    // Process video
    command
      .output(outputPath)
      .on('end', () => {
        resolve({
          duration: duration,
          thumbnail: generateThumbnail ? thumbnailPath : null
        });
      })
      .on('error', (error) => {
        reject(error);
      })
      .run();
  });
}

async function processImageFile(file, userId) {
  const processedImages = await processImage(file.buffer);
  
  const uploadResults = [];
  const timestamp = Date.now();

  for (const [size, imageBuffer] of Object.entries(processedImages)) {
    const key = r2Service.generateKey('processed', userId, `${size}_${file.originalname}`, timestamp);
    
    const result = await r2Service.uploadFile(key, imageBuffer, 'image/jpeg', {
      userId: userId.toString(),
      type: 'processed_image',
      size: size,
      originalName: file.originalname,
      processedAt: new Date().toISOString()
    });

    uploadResults.push({
      size: size,
      ...result
    });
  }

  return {
    original: uploadResults.find(r => r.size === 'original'),
    thumbnail: uploadResults.find(r => r.size === 'thumbnail'),
    medium: uploadResults.find(r => r.size === 'medium'),
    large: uploadResults.find(r => r.size === 'large')
  };
}

async function processVideoFile(file, userId) {
  const tempDir = path.join(__dirname, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const inputPath = path.join(tempDir, `input_${Date.now()}.${path.extname(file.originalname)}`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);
  const thumbnailPath = path.join(tempDir, `thumbnail_${Date.now()}.jpg`);

  await fs.writeFile(inputPath, file.buffer);

  const processedVideo = await processVideo(inputPath, outputPath, {
    generateThumbnail: true,
    thumbnailPath: thumbnailPath
  });

  const timestamp = Date.now();

  // Upload processed video
  const videoKey = r2Service.generateKey('processed', userId, `processed_${file.originalname}`, timestamp);
  const videoBuffer = await fs.readFile(outputPath);
  const videoResult = await r2Service.uploadFile(videoKey, videoBuffer, 'video/mp4', {
    userId: userId.toString(),
    type: 'processed_video',
    originalName: file.originalname,
    duration: processedVideo.duration,
    processedAt: new Date().toISOString()
  });

  // Upload thumbnail
  const thumbnailKey = r2Service.generateKey('processed', userId, `thumbnail_${file.originalname}`, timestamp);
  const thumbnailBuffer = await fs.readFile(thumbnailPath);
  const thumbnailResult = await r2Service.uploadFile(thumbnailKey, thumbnailBuffer, 'image/jpeg', {
    userId: userId.toString(),
    type: 'video_thumbnail',
    originalName: file.originalname,
    processedAt: new Date().toISOString()
  });

  await cleanupTempFiles([inputPath, outputPath, thumbnailPath]);

  return {
    video: videoResult,
    thumbnail: thumbnailResult,
    metadata: {
      duration: processedVideo.duration
    }
  };
}

// Utility functions
function isImage(mimetype) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimetype);
}

function isVideo(mimetype) {
  return ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'].includes(mimetype);
}

async function cleanupTempFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Failed to delete temp file ${filePath}:`, error);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'media-processor',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Media processor error:', error);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Media processor service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = { app };
