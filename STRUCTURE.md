# Repository Structure Overview

## Complete Directory Tree

```
euproximax-backend/
│
├── 📁 auth/                          # Authentication & Authorization Layer
│   └── jwt-auth.js                   # JWT authentication with encryption
│
├── 📁 bin/                           # Executable Scripts
│   └── init.js                       # Database initialization script
│
├── 📁 config/                        # Configuration Files
│   ├── db.js                        # MongoDB connection setup
│   └── jwt.config.js                # JWT configuration & secrets
│
├── 📁 controllers/                   # Business Logic Layer (MVC Controllers)
│   └── user.controller.js           # User operations controller
│
├── 📁 middleware/                    # Express Middleware
│   ├── acl.js                       # Access Control List middleware
│   ├── auth.js                      # JWT authentication middleware
│   ├── errorHandler.js              # Global error handler
│   └── validate.js                  # Input validation middleware
│
├── 📁 models/                        # Database Models (Mongoose Schemas)
│   └── User.js                      # User model & schema
│
├── 📁 routes/                        # API Route Definitions
│   ├── index.js                     # Main routes configuration
│   ├── auth.js                      # Authentication routes
│   └── user.js                      # User routes
│
├── 📁 utils/                         # Utility Functions & Helpers
│   ├── generateToken.js             # JWT token generator wrapper
│   └── logger.js                    # Winston logger configuration
│
├── 📁 logs/                          # Application Logs (auto-generated)
│   ├── combined.log                 # All application logs
│   ├── error.log                    # Error logs only
│   ├── exceptions.log               # Uncaught exceptions
│   └── rejections.log               # Unhandled promise rejections
│
├── 📄 .env                           # Environment variables (gitignored)
├── 📄 .env.example                   # Environment variables template
├── 📄 .gitignore                     # Git ignore rules
├── 📄 package.json                   # Dependencies & scripts
├── 📄 package-lock.json              # Dependency lock file
├── 📄 README.md                      # Main project documentation
├── 📄 PROJECT_STRUCTURE.md           # Detailed structure documentation
├── 📄 STRUCTURE.md                   # This file - visual structure
├── 📄 MONGODB_SETUP.md               # MongoDB setup guide
└── 📄 server.js                      # Application entry point
```

## Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    server.js                             │
│  • Express app initialization                            │
│  • Middleware setup (Helmet, CORS, Body Parser)         │
│  • Database connection                                  │
│  • Route mounting                                        │
│  • Error handling                                        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              routes/index.js                             │
│  • JWT middleware filter                                 │
│  • Public/Protected route separation                     │
│  • Route mounting                                        │
└────────────────────┬──────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│  routes/auth.js  │   │  routes/user.js   │
│  • /register     │   │  • /me            │
│  • /login        │   │                   │
└────────┬─────────┘   └────────┬─────────┘
         │                       │
         │                       │ (Protected)
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│      middleware/validate.js             │
│      • Input validation                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   controllers/user.controller.js        │
│   • register()                          │
│   • login()                             │
│   • getMe()                             │
└─────────────────┬───────────────────────┘
                  │
         ┌─────────┴─────────┐
         │                   │
         ▼                   ▼
┌─────────────────┐  ┌──────────────────┐
│  models/User.js │  │ utils/generateToken│
│  • Schema       │  │ • JWT generation  │
│  • Methods      │  │                   │
└─────────────────┘  └──────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         MongoDB Database                │
└─────────────────────────────────────────┘
```

## Authentication Flow

```
┌──────────────┐
│   Register   │
│   / Login    │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ user.controller.js    │
│ • Validate input      │
│ • Create/Find user   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ utils/generateToken  │
│ • Create JwtAuth     │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ auth/jwt-auth.js     │
│ • Encrypt payload    │
│ • Sign JWT           │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Return Token       │
│   to Client          │
└──────────────────────┘

┌──────────────┐
│ Protected    │
│ Request      │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ middleware/auth.js   │
│ • Extract token      │
│ • Passport verify    │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ auth/jwt-auth.js     │
│ • Decrypt payload    │
│ • Find user in DB    │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Set req.user         │
│ Continue to route    │
└──────────────────────┘
```

## File Responsibilities

### Core Application
- **server.js**: Application bootstrap, middleware setup, server startup

### Authentication
- **auth/jwt-auth.js**: JWT encryption/decryption, token generation/verification
- **middleware/auth.js**: JWT middleware for route protection
- **utils/generateToken.js**: Token generation wrapper

### Business Logic
- **controllers/user.controller.js**: User operations (register, login, getMe)

### Data Layer
- **models/User.js**: User schema, validation, password hashing
- **config/db.js**: MongoDB connection management

### Routing
- **routes/index.js**: Main route configuration, middleware application
- **routes/auth.js**: Authentication endpoints
- **routes/user.js**: User endpoints

### Middleware
- **middleware/errorHandler.js**: Global error handling
- **middleware/validate.js**: Input validation
- **middleware/acl.js**: Access control (permissions)

### Configuration
- **config/jwt.config.js**: JWT secrets and settings

### Utilities
- **utils/logger.js**: Winston logging configuration

### Scripts
- **bin/init.js**: Database initialization (test user creation)

## Import Dependencies

```
server.js
  ├── utils/logger
  ├── config/db
  ├── middleware/errorHandler
  └── routes/index
      ├── routes/auth
      │   ├── controllers/user.controller
      │   └── middleware/validate
      └── routes/user
          └── controllers/user.controller

middleware/auth.js
  ├── auth/jwt-auth
  └── config/jwt.config

controllers/user.controller.js
  ├── models/User
  ├── utils/generateToken
  └── middleware/errorHandler

utils/generateToken.js
  ├── auth/jwt-auth
  └── config/jwt.config

auth/jwt-auth.js
  ├── models/User
  └── utils/logger
```

## Naming Conventions

- **Files**: `kebab-case.js` or `camelCase.js` (controllers use `.controller.js`)
- **Directories**: `lowercase` (no dashes)
- **Classes**: `PascalCase` (e.g., `JwtAuth`, `AppError`)
- **Functions**: `camelCase` (e.g., `generateToken`, `connectDB`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `IV_LENGTH`)

## Best Practices Applied

✅ **Separation of Concerns**: Clear separation between routes, controllers, models  
✅ **Single Responsibility**: Each file has one clear purpose  
✅ **DRY Principle**: Reusable middleware and utilities  
✅ **Error Handling**: Centralized error handling  
✅ **Security**: Encrypted JWT payloads, password hashing  
✅ **Validation**: Input validation at route level  
✅ **Logging**: Comprehensive logging throughout  
✅ **Configuration**: Environment-based configuration  
✅ **Documentation**: Clear code comments and documentation

