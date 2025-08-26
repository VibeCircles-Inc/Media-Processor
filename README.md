# Media Processor Service

🚀 **Image and Video Processing Microservice for VibeCircles**

A high-performance media processing service that handles image optimization, video transcoding, and thumbnail generation with Cloudflare R2 storage integration.

## ✨ Features

- 🖼️ **Image Processing** with Sharp.js (resize, compress, format conversion)
- 🎥 **Video Processing** with FFmpeg (transcode, compress, generate thumbnails)
- 📦 **Batch Processing** for multiple files
- ☁️ **Cloudflare R2 Integration** for cloud storage
- 🔐 **JWT Authentication** for secure access
- ⚡ **High Performance** with memory-based processing
- 🛡️ **Security** with Helmet, CORS, and rate limiting
- 📊 **Multiple Output Sizes** (thumbnail, medium, large)

## 🏗️ Architecture

```
Media Processor Service
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── README.md             # This file
└── temp/                 # Temporary files (auto-created)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- FFmpeg installed on the system
- Cloudflare R2 account
- Supabase account

### Installation

```bash
# Navigate to media-processor directory
cd media-processor

# Install dependencies
npm install

# Copy environment template
cp ../env.example .env

# Configure environment variables
# (see Environment Variables section below)

# Start development server
npm run dev
```

### FFmpeg Installation

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Windows
Download from [FFmpeg official website](https://ffmpeg.org/download.html)

## ⚙️ Environment Variables

Create a `.env` file in the media-processor directory:

```env
# Server Configuration
PORT=3002
NODE_ENV=production

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_key

# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
R2_PUBLIC_URL=https://your-bucket.your-subdomain.r2.cloudflarestorage.com
```

## 📡 API Endpoints

### Authentication
All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Process Single Image
```http
POST /process-image
Content-Type: multipart/form-data

Form Data:
- image: [file] (required)
- quality: [number] (optional, default: 85)
- format: [string] (optional, default: jpeg)
- resize: [json] (optional, e.g., {"width": 800, "height": 600})
```

**Response:**
```json
{
  "success": true,
  "message": "Image processed successfully",
  "data": {
    "original": {
      "url": "https://...",
      "key": "processed/user-id/original_filename.jpg"
    },
    "thumbnail": {
      "url": "https://...",
      "key": "processed/user-id/thumbnail_filename.jpg"
    },
    "medium": {
      "url": "https://...",
      "key": "processed/user-id/medium_filename.jpg"
    },
    "large": {
      "url": "https://...",
      "key": "processed/user-id/large_filename.jpg"
    }
  }
}
```

### Process Single Video
```http
POST /process-video
Content-Type: multipart/form-data

Form Data:
- video: [file] (required)
- quality: [string] (optional, default: medium) - low/medium/high
- format: [string] (optional, default: mp4)
- generateThumbnail: [boolean] (optional, default: true)
```

**Response:**
```json
{
  "success": true,
  "message": "Video processed successfully",
  "data": {
    "video": {
      "url": "https://...",
      "key": "processed/user-id/processed_video.mp4"
    },
    "thumbnail": {
      "url": "https://...",
      "key": "processed/user-id/thumbnail_video.jpg"
    },
    "metadata": {
      "duration": 120.5,
      "format": "mp4",
      "quality": "medium"
    }
  }
}
```

### Batch Process Multiple Files
```http
POST /batch-process
Content-Type: multipart/form-data

Form Data:
- files: [files] (required, max 10 files)
```

**Response:**
```json
{
  "success": true,
  "message": "Batch processing completed",
  "data": {
    "total": 5,
    "successful": 4,
    "failed": 1,
    "results": [
      {
        "originalName": "image1.jpg",
        "type": "image",
        "success": true,
        "data": { /* processed image data */ }
      },
      {
        "originalName": "video1.mp4",
        "type": "video",
        "success": true,
        "data": { /* processed video data */ }
      }
    ]
  }
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "media-processor",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🗄️ Supported File Types

### Images
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

### Videos
- MP4 (.mp4)
- WebM (.webm)
- OGG (.ogg)
- AVI (.avi)
- MOV (.mov)

## 🚀 Deployment

### Railway Deployment (Recommended)

This service is configured for Railway deployment:

1. **Connect to Railway**
   ```bash
   railway login
   railway link
   ```

2. **Set Environment Variables**
   ```bash
   railway variables set SUPABASE_URL=your_supabase_url
   railway variables set SUPABASE_ANON_KEY=your_supabase_anon_key
   railway variables set R2_ACCOUNT_ID=your_r2_account_id
   railway variables set R2_ACCESS_KEY_ID=your_r2_access_key_id
   railway variables set R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
   railway variables set R2_BUCKET_NAME=your_r2_bucket_name
   railway variables set R2_PUBLIC_URL=your_r2_public_url
   railway variables set JWT_SECRET=your_jwt_secret
   # ... set all other variables
   ```

3. **Deploy**
   ```bash
   railway up
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create temp directory
RUN mkdir -p temp

# Expose port
EXPOSE 3002

# Start the application
CMD ["npm", "start"]
```

### Manual Deployment

```bash
# Install dependencies
npm ci --only=production

# Start production server
npm start
```

## 🧪 Testing

### Manual Testing

```bash
# Test image processing
curl -X POST http://localhost:3002/process-image \
  -H "Authorization: Bearer your-jwt-token" \
  -F "image=@test-image.jpg" \
  -F "quality=85"

# Test video processing
curl -X POST http://localhost:3002/process-video \
  -H "Authorization: Bearer your-jwt-token" \
  -F "video=@test-video.mp4" \
  -F "quality=medium"

# Test health check
curl http://localhost:3002/health
```

### File Size Limits

- **Single File**: 100MB
- **Batch Upload**: 10 files maximum
- **Total Batch Size**: 500MB

## 🔧 Development

### Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests (to be implemented)
```

### Code Structure

- `server.js` - Main Express server with all processing endpoints
- `package.json` - Dependencies and scripts
- `temp/` - Temporary files directory (auto-created)

## 🛠️ Troubleshooting

### Common Issues

1. **FFmpeg Not Found**
   - Ensure FFmpeg is installed and in PATH
   - For Railway: FFmpeg is pre-installed in the container

2. **Memory Issues**
   - Large files may cause memory problems
   - Consider streaming for very large files
   - Monitor memory usage in production

3. **R2 Upload Failures**
   - Verify R2 credentials
   - Check bucket permissions
   - Ensure bucket exists

4. **Sharp/FFmpeg Errors**
   - Check file format support
   - Verify file integrity
   - Monitor error logs

### Logs

```bash
# View Railway logs
railway logs

# View local logs
npm run dev
```

## 📊 Performance

### Optimization Tips

1. **Image Processing**
   - Use appropriate quality settings
   - Consider WebP format for better compression
   - Implement progressive JPEG for large images

2. **Video Processing**
   - Choose appropriate quality presets
   - Use hardware acceleration when available
   - Consider parallel processing for batch operations

3. **Storage**
   - Use CDN for faster delivery
   - Implement cache headers
   - Consider image lazy loading

## 🔒 Security

- **JWT Authentication** for all endpoints
- **Rate Limiting** to prevent abuse
- **CORS Protection** with allowed origins
- **Helmet.js** for security headers
- **File Type Validation** before processing
- **HTTPS Only** in production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Documentation**: [VibeCircles Docs](https://docs.vibecircles.com)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discord**: [VibeCircles Community](https://discord.gg/vibecircles)

---

**Built with ❤️ by the VibeCircles Team**
