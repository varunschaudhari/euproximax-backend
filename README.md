# Euproximax Backend API

A complete Node.js Express server with JWT authentication, MongoDB integration, and comprehensive error handling.

## Features

- ✅ User registration and authentication
- ✅ JWT token generation with encrypted payloads
- ✅ Password hashing using bcrypt
- ✅ MongoDB database integration with Mongoose
- ✅ Passport.js JWT authentication middleware
- ✅ Input validation using express-validator
- ✅ Comprehensive error handling
- ✅ Request logging with Winston
- ✅ Security middleware (Helmet, CORS)
- ✅ ACL (Access Control List) middleware support
- ✅ API versioning (v1)

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT with Passport.js
- **Security**: Helmet, CORS, bcrypt
- **Logging**: Winston
- **Validation**: express-validator

## Project Structure

```
euproximax-backend/
├── auth/                          # Authentication utilities
│   └── jwt-auth.js               # JWT authentication with encryption
├── bin/                           # Executable scripts
│   └── init.js                   # Database initialization script
├── config/                        # Configuration files
│   ├── db.js                     # MongoDB connection
│   └── jwt.config.js             # JWT configuration
├── controllers/                   # Route controllers
│   └── user.controller.js        # User operations (register, login, getMe)
├── middleware/                    # Express middleware
│   ├── acl.js                    # Access Control List middleware
│   ├── auth.js                   # JWT authentication middleware
│   ├── errorHandler.js           # Global error handler
│   └── validate.js               # Input validation middleware
├── models/                        # Mongoose models
│   └── User.js                    # User schema and model
├── routes/                        # API routes
│   ├── index.js                  # Routes configuration
│   ├── auth.js                   # Authentication routes
│   └── user.js                   # User routes
├── utils/                         # Utility functions
│   ├── generateToken.js           # JWT token generator
│   └── logger.js                 # Winston logger configuration
├── logs/                          # Application logs (auto-generated)
│   ├── combined.log
│   ├── error.log
│   ├── exceptions.log
│   └── rejections.log
├── .env                           # Environment variables (not in git)
├── .env.example                   # Environment variables template
├── .gitignore
├── package.json
├── README.md
├── MONGODB_SETUP.md              # MongoDB setup guide
└── server.js                     # Main server file
```

## Installation

1. **Clone the repository** (if applicable):
```bash
git clone <repository-url>
cd euproximax-backend
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp .env.example .env
```

4. **Update `.env` file** with your configuration:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_PL_SECRET=your-payload-secret-key-change-this-in-production
JWT_SALT=your-salt-key-change-this-in-production
JWT_EXPIRE=7d

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/euproximax
# For MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/dbname

# Logging Configuration
LOG_LEVEL=info
```

5. **Set up MongoDB**:
   - Install MongoDB locally, or
   - Use MongoDB Atlas (cloud)
   - See `MONGODB_SETUP.md` for detailed instructions

6. **Start MongoDB** (if using local MongoDB):
   
   **Option A - Using Helper Script (Recommended):**
   ```powershell
   # PowerShell (Run as Administrator)
   .\bin\start-mongodb.ps1
   
   # Or Batch file (Run as Administrator)
   .\bin\start-mongodb.bat
   ```
   
   **Option B - Windows Service:**
   ```powershell
   # Run PowerShell as Administrator
   net start MongoDB
   ```
   
   **Option C - Manual Start:**
   ```powershell
   # Run in a separate terminal
   mongod --dbpath "C:\data\db"
   ```
   
   **Option D - Use MongoDB Atlas (Cloud):**
   - Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a cluster and get connection string
   - Update `MONGODB_URI` in `.env` file

7. **Initialize database** (optional - creates test user):
```bash
npm run init
```

## Running the Server

### Development Mode
```bash
npm run dev
```
Runs with nodemon for automatic restarts.

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Endpoints

### Base URL
All API endpoints are prefixed with `/api/v1`

### Public Routes (No Authentication Required)

#### Register User
- **POST** `/api/v1/auth/register`
- **Body:**
  ```json
  {
    "name": "John Doe",
    "mobile": "+1234567890",
    "email": "john@example.com",
    "password": "Password123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "...",
        "name": "John Doe",
        "mobile": "+1234567890",
        "email": "john@example.com",
        "createdAt": "2025-11-15T...",
        "updatedAt": "2025-11-15T..."
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### Login
- **POST** `/api/v1/auth/login`
- **Body:**
  ```json
  {
    "email": "john@example.com",
    "password": "Password123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "...",
        "name": "John Doe",
        "mobile": "+1234567890",
        "email": "john@example.com",
        "lastLogin": "2025-11-15T...",
        "createdAt": "2025-11-15T...",
        "updatedAt": "2025-11-15T..."
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### Protected Routes (Require JWT Token)

#### Get User Profile
- **GET** `/api/v1/user/me`
- **Headers:**
  ```
  Authorization: Bearer <your-jwt-token>
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "...",
        "name": "John Doe",
        "mobile": "+1234567890",
        "email": "john@example.com",
        "lastLogin": "2025-11-15T...",
        "createdAt": "2025-11-15T...",
        "updatedAt": "2025-11-15T..."
      }
    }
  }
  ```

### Health Check
- **GET** `/api/health` or `/api/v1/health`
- **Response:**
  ```json
  {
    "status": "OK",
    "message": "Server is running",
    "version": "v1",
    "timestamp": "2025-11-15T..."
  }
  ```

## Authentication

### JWT Token Structure
- Tokens use encrypted payloads for enhanced security
- Token expiration: 8 hours (configurable)
- Payload encryption: AES-256-CBC

### Using JWT Tokens
Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Validation Rules

### Registration
- **Name**: 2-50 characters, letters and spaces only
- **Mobile**: Valid phone number format
- **Email**: Valid email address
- **Password**: 
  - Minimum 6 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### Login
- **Email**: Valid email address
- **Password**: Required

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message here",
  "code": 1000  // Optional error code
}
```

### Common Error Codes
- `1000`: UNAUTHORIZED
- `1004`: USER_NOT_FOUND

## Security Features

1. **Password Security**
   - Bcrypt hashing with 10 salt rounds
   - Passwords never returned in API responses

2. **JWT Security**
   - Encrypted payloads
   - Token expiration
   - Secure key derivation (PBKDF2)

3. **Request Security**
   - Helmet.js for security headers
   - CORS protection
   - Input validation and sanitization
   - Request size limits (20MB)

4. **Error Handling**
   - No sensitive information leaked in production
   - Comprehensive error logging

## Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

Log levels can be configured via `LOG_LEVEL` in `.env`:
- `error`, `warn`, `info`, `debug`

## Database Models

### User Model
- `_id`: MongoDB ObjectId (auto-generated)
- `name`: String (required, 2-50 chars)
- `mobile`: String (required, unique, validated)
- `email`: String (required, unique, validated)
- `password`: String (required, hashed, not returned)
- `lastLogin`: Date (updated on login)
- `logoutNum`: Number (default: 0)
- `createdAt`: Date (auto-generated)
- `updatedAt`: Date (auto-updated)

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run init` - Initialize database with test user

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_PL_SECRET` | JWT payload encryption secret | Required |
| `JWT_SALT` | JWT key derivation salt | Required |
| `JWT_EXPIRE` | Token expiration | `7d` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `LOG_LEVEL` | Logging level | `info` |

## Development

### Project Structure Guidelines

- **Controllers**: Handle business logic and request/response
- **Models**: Define database schemas and methods
- **Routes**: Define API endpoints and validation
- **Middleware**: Reusable request processing functions
- **Utils**: Shared utility functions
- **Config**: Configuration and environment setup
- **Auth**: Authentication-related utilities

### Adding New Features

1. Create model in `models/`
2. Create controller in `controllers/`
3. Define routes in `routes/`
4. Add validation in route files
5. Update `routes/index.js` to include new routes

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use strong, random values for all JWT secrets
3. Configure MongoDB Atlas or production database
4. Set up proper CORS origins
5. Configure log rotation
6. Use process manager (PM2, etc.)
7. Set up monitoring and alerts

## License

ISC

## Support

For MongoDB setup help, see `MONGODB_SETUP.md`
