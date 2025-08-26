// Cloudflare R2 Client Configuration
const { S3Client } = require('@aws-sdk/client-s3');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// R2 Configuration
const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || 'vibecircles-media',
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  publicUrl: process.env.R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL,
  region: 'auto' // Cloudflare R2 uses 'auto' region
};

// Validate configuration
if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
  console.warn('Missing Cloudflare R2 environment variables - some features may not work');
}

// Create S3-compatible client for R2
const r2Client = new S3Client({
  region: r2Config.region,
  endpoint: r2Config.endpoint,
  credentials: {
    accessKeyId: r2Config.accessKeyId,
    secretAccessKey: r2Config.secretAccessKey,
  },
  forcePathStyle: false, // R2 uses virtual-hosted-style URLs
});

// R2 Service Class
class R2Service {
  constructor() {
    this.client = r2Client;
    this.bucket = r2Config.bucket;
    this.publicUrl = r2Config.publicUrl;
  }

  // Upload file to R2
  async uploadFile(key, fileBuffer, contentType, metadata = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: metadata,
        CacheControl: 'public, max-age=31536000', // 1 year cache
      });

      const result = await this.client.send(command);
      
      return {
        success: true,
        key: key,
        url: this.getPublicUrl(key),
        etag: result.ETag,
        metadata: result.Metadata
      };
    } catch (error) {
      console.error('R2 upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // Get file from R2
  async getFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.client.send(command);
      
      return {
        success: true,
        body: result.Body,
        contentType: result.ContentType,
        metadata: result.Metadata,
        lastModified: result.LastModified,
        contentLength: result.ContentLength
      };
    } catch (error) {
      console.error('R2 get file error:', error);
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  // Delete file from R2
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      
      return {
        success: true,
        key: key
      };
    } catch (error) {
      console.error('R2 delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  // Check if file exists
  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  // Generate signed URL for upload
  async generateUploadUrl(key, contentType, expiresIn = 3600) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(this.client, command, { expiresIn });
      
      return {
        success: true,
        uploadUrl: signedUrl,
        key: key,
        expiresIn: expiresIn
      };
    } catch (error) {
      console.error('R2 signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  // Generate signed URL for download
  async generateDownloadUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.client, command, { expiresIn });
      
      return {
        success: true,
        downloadUrl: signedUrl,
        key: key,
        expiresIn: expiresIn
      };
    } catch (error) {
      console.error('R2 signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  // Get public URL for file
  getPublicUrl(key) {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.${r2Config.accountId}.r2.cloudflarestorage.com/${key}`;
  }

  // Generate unique file key
  generateKey(type, userId, filename, timestamp = Date.now()) {
    const extension = filename.split('.').pop();
    const uniqueId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    
    switch (type) {
      case 'avatar':
        return `avatars/user-${userId}/${uniqueId}.${extension}`;
      case 'post':
        return `posts/post-${userId}/${uniqueId}.${extension}`;
      case 'album':
        return `albums/album-${userId}/${uniqueId}.${extension}`;
      case 'video':
        return `videos/post-${userId}/${uniqueId}.${extension}`;
      case 'processed':
        return `processed/user-${userId}/${uniqueId}.${extension}`;
      case 'temp':
        return `temp/uploads/${uniqueId}.${extension}`;
      default:
        return `uploads/${type}/${uniqueId}.${extension}`;
    }
  }

  // Generate thumbnail key
  generateThumbnailKey(originalKey, size = 'thumbnail') {
    const parts = originalKey.split('.');
    const extension = parts.pop();
    const basePath = parts.join('.');
    return `${basePath}-${size}.${extension}`;
  }

  // Batch upload files
  async uploadFiles(files) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.uploadFile(file.key, file.buffer, file.contentType, file.metadata);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          key: file.key,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Batch delete files
  async deleteFiles(keys) {
    const results = [];
    
    for (const key of keys) {
      try {
        const result = await this.deleteFile(key);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          key: key,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Get file metadata
  async getFileMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.client.send(command);
      
      return {
        success: true,
        key: key,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata,
        etag: result.ETag
      };
    } catch (error) {
      console.error('R2 metadata error:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  // Copy file within R2
  async copyFile(sourceKey, destinationKey) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: `${this.bucket}/${sourceKey}`,
      });

      const result = await this.client.send(command);
      
      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        etag: result.ETag
      };
    } catch (error) {
      console.error('R2 copy error:', error);
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }
}

// Create singleton instance
const r2Service = new R2Service();

module.exports = {
  r2Service,
  r2Client,
  r2Config
};
