# MongoDB Setup Guide

## Option 1: Install MongoDB Locally (Windows)

### Step 1: Download MongoDB
1. Go to https://www.mongodb.com/try/download/community
2. Download MongoDB Community Server for Windows
3. Run the installer and follow the setup wizard

### Step 2: Start MongoDB Service
After installation, MongoDB should run as a Windows service automatically.

To check if it's running:
```powershell
Get-Service -Name MongoDB
```

To start it manually:
```powershell
Start-Service MongoDB
```

Or start MongoDB manually:
```bash
mongod --dbpath "C:\data\db"
```
(You may need to create the `C:\data\db` directory first)

### Step 3: Verify Connection
Your `.env` file should have:
```
MONGODB_URI=mongodb://localhost:27017/euproximax
```

---

## Option 2: Use MongoDB Atlas (Cloud - Recommended for Development)

### Step 1: Create Free Account
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up for a free account

### Step 2: Create a Cluster
1. Click "Build a Database"
2. Choose the FREE tier (M0)
3. Select a cloud provider and region
4. Click "Create"

### Step 3: Create Database User
1. Go to "Database Access"
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Create username and password (save these!)
5. Set user privileges to "Atlas admin" or "Read and write to any database"

### Step 4: Whitelist Your IP
1. Go to "Network Access"
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (for development) or add your IP
4. Click "Confirm"

### Step 5: Get Connection String
1. Go to "Database" → "Connect"
2. Choose "Connect your application"
3. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/dbname`)
4. Replace `<password>` with your database user password
5. Replace `<dbname>` with your database name (e.g., `euproximax`)

### Step 6: Update .env File
Update your `.env` file:
```
MONGODB_URI=mongodb+srv://yourusername:yourpassword@cluster.mongodb.net/euproximax
```

---

## Option 3: Use Docker (If Docker is Installed)

### Run MongoDB in Docker:
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

Your `.env` file:
```
MONGODB_URI=mongodb://localhost:27017/euproximax
```

---

## Quick Test

After setting up MongoDB, test the connection:
```bash
npm start
```

You should see:
```
✅ MongoDB Connected: localhost (or your Atlas cluster)
Database: euproximax
🚀 Server is running on port 3000
```

