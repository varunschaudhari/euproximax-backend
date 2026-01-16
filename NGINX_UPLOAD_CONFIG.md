# Nginx Configuration for File Uploads

## Problem
Getting `413 Request Entity Too Large` error when uploading images/gallery images.

## Solution
Nginx needs to be configured to allow larger file uploads. The default `client_max_body_size` is 1MB, which is too small for image uploads.

## Configuration Steps

### Option 1: Edit Nginx Server Block Configuration

Edit your nginx configuration file (usually in `/etc/nginx/sites-available/your-site` or `/etc/nginx/nginx.conf`):

```nginx
server {
    listen 80;
    server_name api.euproximax.com;
    
    # Increase client body size limit for file uploads
    client_max_body_size 50M;
    
    # Optional: Increase buffer sizes for large requests
    client_body_buffer_size 128k;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### Option 2: Edit Main Nginx Configuration

If you want to set it globally, edit `/etc/nginx/nginx.conf`:

```nginx
http {
    # ... other settings ...
    
    # Set client max body size globally
    client_max_body_size 50M;
    client_body_buffer_size 128k;
    
    # ... rest of configuration ...
}
```

### After Making Changes

1. Test nginx configuration:
   ```bash
   sudo nginx -t
   ```

2. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   # OR
   sudo service nginx reload
   ```

## Current Application Limits

- **Express Body Parser**: 50MB
- **Multer (Event Images)**: 10MB per file
- **Nginx (Recommended)**: 50MB

## Notes

- The `client_max_body_size` should be larger than the largest file you expect to upload
- For multiple gallery images, ensure it's large enough for the combined size of all files
- If uploading multiple 10MB images, you may need to increase this to 50-100MB
- After updating nginx config, restart/reload nginx for changes to take effect
