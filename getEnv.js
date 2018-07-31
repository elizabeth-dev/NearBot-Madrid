require('dotenv').config()
module.exports.getEnvVars = () => ({
    TELEGRAM_TOKEN_dev: process.env.TELEGRAM_TOKEN_dev,
    MAPS_TOKEN_dev: process.env.MAPS_TOKEN_dev
})