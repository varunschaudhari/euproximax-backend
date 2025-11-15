/**
 * JWT Middleware
 */
const passport = require('passport');
const passportJwt = require('passport-jwt');
const jwtStrategy = passportJwt.Strategy;
const extractJwt = passportJwt.ExtractJwt;
const logger = require('../utils/logger');
const JwtAuth = require('../auth/jwt-auth');
const config = require('../utils/config');

/**
 * Create JWT middleware with Passport.js
 * @param {Object} secrets - JWT configuration secrets
 * @returns {Function} Express middleware function
 */
const jwtMiddleware = (secrets) => {
  const authMgr = new JwtAuth(secrets); // Creates a JWTAuth object

  const jwtStrategyOpts = {
    jwtFromRequest: extractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: secrets.JWT_SECRET
  };

  passport.use(new jwtStrategy(jwtStrategyOpts, authMgr.verify.bind(authMgr)));

  return async (req, res, next) => {
    passport.authenticate('jwt', { session: false }, (err, user) => {
      if (err) {
        logger.error(err);
        return next(err);
      }

      if (!user) {
        const errObj = {
          message: 'UNAUTHORIZED',
          code: 1000,
          status: 401
        };
        return next(errObj);
      }

      delete user.password;
      req.user = user || {};
      logger.debug('User authenticated: %s', req.user.name || req.user.email || req.user);
      return next();
    })(req, res, next);
  };
};

// Create and export the middleware with JWT config
const authenticateToken = jwtMiddleware({
  JWT_SECRET: config.jwt.secret,
  JWT_PL_SECRET: config.jwt.plSecret,
  JWT_SALT: config.jwt.salt
});

module.exports = authenticateToken;
