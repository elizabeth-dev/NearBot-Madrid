require('dotenv').config()
module.exports.getEnvVars = () => ({
	TELEGRAM_TOKEN_dev: process.env.TELEGRAM_TOKEN_dev,
	MAPS_TOKEN_dev: process.env.MAPS_TOKEN_dev,
	TELEGRAM_TOKEN_production: process.env.TELEGRAM_TOKEN_production,
	MAPS_TOKEN_production: process.env.MAPS_TOKEN_production,
	MAPS_SIGNING_SECRET: process.env.MAPS_SIGNING_SECRET,
	EMT_ID_CLIENT: process.env.EMT_ID_CLIENT,
	EMT_PASS_KEY: process.env.EMT_PASS_KEY,
	NEARBOT_VERSION: process.env.NEARBOT_VERSION
})
