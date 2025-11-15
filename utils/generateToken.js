const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt.config');

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      email: user.email,
      name: user.name
    },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
};

module.exports = generateToken;

